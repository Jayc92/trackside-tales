#!/usr/bin/env bash
# ============================================================================
# Trackside recovery-baseline apply helper.
# ADMIN/SUPABASE-v7.4B.P.24a, hardened in P.24a.1.
#
# Applies production-public-schema-20260804.sql to a BLANK recovery target.
#
# Security posture (P.24a.1):
#   * The connection string is NEVER accepted as a command-line argument —
#     argv leaks through shell history, process listings, and terminal
#     recording. It is read via a hidden interactive prompt instead.
#   * The secret is handed to psql through libpq component environment
#     variables (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE), never
#     through psql's argv, and is unset before exit.
#   * Output shows only the sanitized host (parsed fail-closed) — never
#     the username, password, query string, or full URL.
#   * Refuses any target that references the production project ref
#     (uuuugwfkequtgytwuuat — this also catches production pooler
#     usernames of the form postgres.<ref>) and refuses the known
#     production pooler host outright; recover onto a NEW project using
#     its direct db.<new-ref>.supabase.co connection string instead.
#   * Requires a typed confirmation phrase after showing the host.
#   * No credentials are embedded in this file or written to disk.
# ============================================================================
set -euo pipefail

PROD_REF="uuuugwfkequtgytwuuat"
PROD_POOLER_HOST="aws-1-us-east-1.pooler.supabase.com"
BASELINE="$(cd "$(dirname "$0")" && pwd)/production-public-schema-20260804.sql"

if [ "$#" -ne 0 ]; then
  echo "REFUSED: this script takes NO arguments." >&2
  echo "Do not pass the database URL on the command line — argv leaks into" >&2
  echo "shell history and process listings. Run the script bare; it will" >&2
  echo "prompt for the URL with hidden input." >&2
  exit 2
fi

if [ ! -f "$BASELINE" ]; then
  echo "REFUSED: baseline file not found next to this script." >&2
  exit 1
fi

# Hidden prompt: the URL never enters argv, history, or the terminal echo.
printf 'Blank target database URL (input hidden): '
IFS= read -r -s TARGET_URL
printf '\n'

if [ -z "${TARGET_URL}" ]; then
  echo "REFUSED: no connection string entered." >&2
  exit 1
fi

case "$TARGET_URL" in
  *"$PROD_REF"*)
    echo "REFUSED: target references the PRODUCTION project ($PROD_REF)." >&2
    echo "This baseline must never be applied to production." >&2
    exit 1
    ;;
  *"$PROD_POOLER_HOST"*)
    echo "REFUSED: target uses the known production pooler host" >&2
    echo "($PROD_POOLER_HOST). Recover onto a NEW project via its direct" >&2
    echo "db.<new-ref>.supabase.co connection string instead." >&2
    exit 1
    ;;
esac

# Fail-closed strict parse into libpq COMPONENTS. Note: libpq does NOT
# expand a URL-shaped PGDATABASE environment variable (connection-string
# expansion applies only to a dbname passed as an argument, which would
# leak through argv), so the secret travels as PGHOST/PGPORT/PGUSER/
# PGPASSWORD/PGDATABASE component variables instead. Anything that does
# not match the strict shape below is refused without being echoed.
urldecode() {
  local s="${1//+/ }"
  printf '%b' "${s//%/\\x}"
}
if [[ "$TARGET_URL" =~ ^postgres(ql)?://([^:@/]+)(:([^@/]*))?@([A-Za-z0-9._-]+)(:([0-9]{1,5}))?/([A-Za-z0-9_-]+)(\?sslmode=([a-z-]+))?$ ]]; then
  PG_USER_V="$(urldecode "${BASH_REMATCH[2]}")"
  PG_PASS_V="$(urldecode "${BASH_REMATCH[4]:-}")"
  PG_HOST_V="${BASH_REMATCH[5]}"
  PG_PORT_V="${BASH_REMATCH[7]:-5432}"
  PG_DB_V="${BASH_REMATCH[8]}"
  PG_SSL_V="${BASH_REMATCH[10]:-}"
else
  echo "REFUSED: could not safely parse the connection string" >&2
  echo "(expected postgresql://user[:password]@host[:port]/dbname[?sslmode=...])." >&2
  echo "The value you entered is deliberately NOT echoed." >&2
  exit 1
fi
TARGET_HOST="$PG_HOST_V:$PG_PORT_V"

echo "Target host:   $TARGET_HOST"
echo "Baseline file: $(basename "$BASELINE")"
echo "This will apply the schema-only recovery baseline to that target."
printf 'Type "blank-recovery-target" to continue: '
IFS= read -r CONFIRM
if [ "$CONFIRM" != "blank-recovery-target" ]; then
  echo "REFUSED: confirmation phrase not given." >&2
  exit 1
fi

# Credentials flow to psql exclusively through the ENVIRONMENT —
# psql's argv stays clean: psql -v ON_ERROR_STOP=1 -f <baseline>
export PGHOST="$PG_HOST_V" PGPORT="$PG_PORT_V" PGUSER="$PG_USER_V" \
       PGPASSWORD="$PG_PASS_V" PGDATABASE="$PG_DB_V"
if [ -n "$PG_SSL_V" ]; then export PGSSLMODE="$PG_SSL_V"; fi
unset TARGET_URL PG_USER_V PG_PASS_V PG_HOST_V PG_PORT_V PG_DB_V PG_SSL_V
set +e
psql -v ON_ERROR_STOP=1 -f "$BASELINE"
STATUS=$?
set -e
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE 2>/dev/null || true

if [ "$STATUS" -ne 0 ]; then
  echo "Baseline apply FAILED (psql exit $STATUS). Target left as-is." >&2
  exit "$STATUS"
fi
echo "Baseline applied. Now apply supabase/migrations/ files dated AFTER 2026-08-04, then restore data separately."
