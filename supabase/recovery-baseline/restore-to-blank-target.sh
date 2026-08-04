#!/usr/bin/env bash
# ============================================================================
# Trackside recovery-baseline apply helper (ADMIN/SUPABASE-v7.4B.P.24a).
#
# Applies production-public-schema-20260804.sql to a BLANK recovery target.
# Hard safety posture:
#   * refuses any target that references the production project ref
#   * refuses to run against a linked project implicitly — the target DB
#     URL must be passed explicitly
#   * requires the caller to type the confirmation phrase
#   * no credentials are embedded; the URL you pass carries them and is
#     not echoed or logged
# ============================================================================
set -euo pipefail

PROD_REF="uuuugwfkequtgytwuuat"
BASELINE="$(cd "$(dirname "$0")" && pwd)/production-public-schema-20260804.sql"

if [ "${1:-}" = "" ]; then
  echo "usage: $0 <blank-target-db-url>" >&2
  echo "  e.g. $0 postgresql://postgres:postgres@127.0.0.1:54322/postgres" >&2
  exit 2
fi
TARGET_URL="$1"

case "$TARGET_URL" in
  *"$PROD_REF"*)
    echo "REFUSED: target references the PRODUCTION project ($PROD_REF)." >&2
    echo "This baseline must never be applied to production." >&2
    exit 1
    ;;
esac

if [ ! -f "$BASELINE" ]; then
  echo "REFUSED: baseline file not found next to this script." >&2
  exit 1
fi

echo "Target host: $(printf '%s' "$TARGET_URL" | sed -E 's|.*@([^/:]+).*|\1|')"
echo "This will apply the schema-only recovery baseline to that target."
printf 'Type "blank-recovery-target" to continue: '
read -r CONFIRM
if [ "$CONFIRM" != "blank-recovery-target" ]; then
  echo "REFUSED: confirmation phrase not given." >&2
  exit 1
fi

psql "$TARGET_URL" -v ON_ERROR_STOP=1 -f "$BASELINE"
echo "Baseline applied. Now apply supabase/migrations/ files dated AFTER 2026-08-04, then restore data separately."
