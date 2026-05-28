# log-events (ADMIN-v6.8A)

First-party event logger for Trackside Tales. Writer counterpart to
`validate-qr` (ADMIN-v6.6). Accepts a small batch of analytics events
from the public app, verifies any attached QR receipts, appends rows
to the existing event tables, and keeps `user_badges` and
`guest_profiles` in sync as derived state.

This function is **first-party only**. It does not call any
third-party analytics SDK, does not set cookies, does not capture raw
IP, does not store `user_agent`, and does not honor client-supplied
timestamps.

---

## Required environment variables

Set these on the deployed function (Supabase Cloud → Edge Functions →
log-events → Settings):

| Name                        | Source                                     | Notes |
|-----------------------------|--------------------------------------------|-------|
| `SUPABASE_URL`              | Auto-injected by Supabase                  | Project REST URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by Supabase                  | Required to insert into RLS-locked event tables. |
| `RECEIPT_SECRET`            | **Must match validate-qr's value**          | HMAC-SHA256 verification key for `tale_unlocked` receipts. Rotating it invalidates in-flight receipts (5 min TTL) — coordinate rotations with the validate-qr deploy. |

If any required var is missing, the function returns
`500 { ok:false, reason:"misconfigured" }`. The client treats any 5xx
as "best-effort send failed; behavior unaffected."

---

## Request

```
POST /functions/v1/log-events
Content-Type: application/json
```

```jsonc
{
  "guestId": "g_ab1c2def3_xyz0",     // required; localStorage tb_guest_id
  "events": [
    {
      "type":      "tale_unlocked",  // required; one of the allowed event types
      "taleSlug":  "wa-lager",
      "source":    "scan",            // 'scan' | 'direct'
      "receipt":   "<b64.b64>"        // optional; only meaningful when source='scan'
    },
    {
      "type":     "badge_awarded",
      "taleSlug": "wa-lager",
      "badgeKey": "wa-lager",         // raw key as stored in client state
      "via":      "scan"              // 'scan' | 'game'
    },
    {
      "type":     "game_started",
      "taleSlug": "wa-lager",
      "gameType": "grid"              // 'grid' | 'spike' | 'match'
    },
    {
      "type":      "game_completed",
      "taleSlug":  "wa-lager",
      "gameType":  "grid",
      "attempts":   1,                 // optional; integer
      "durationMs": 18420              // optional; integer milliseconds
    }
  ]
}
```

Rules:

- `events` must contain **1 to 20** entries. Anything larger → `400 batch_too_large`.
- Server timestamps are authoritative. The function ignores any
  client-supplied `created_at` / `occurredAt`.
- `guestId` is the client-side `tb_guest_id` (`g_<rand>_<ts>`). It is
  **not** validated against `auth.users` — guests are first-class.
- Unknown fields in event objects are ignored.

---

## Allowed event types

| `type`           | Required fields                                    | Optional fields           | Allowed values |
|------------------|----------------------------------------------------|---------------------------|---|
| `tale_unlocked`  | `taleSlug`, `source`                               | `receipt`                 | `source ∈ {'scan','direct'}` |
| `badge_awarded`  | `taleSlug`, `badgeKey`, `via`                      | —                         | `via ∈ {'scan','game'}` |
| `game_started`   | `taleSlug`, `gameType`                             | `attempts`, `durationMs`  | `gameType ∈ {'grid','spike','match'}` |
| `game_completed` | `taleSlug`, `gameType`                             | `attempts`, `durationMs`  | `gameType ∈ {'grid','spike','match'}` |
| `game_failed`    | `taleSlug`, `gameType`                             | `attempts`, `durationMs`  | `gameType ∈ {'grid','spike','match'}` |

Sources `'admin'` and `'share'` are reserved and rejected with
`unsupported_source`. Any other `source`/`via`/`gameType` value yields
`bad_event` for that index.

---

## Table mappings

| Event type        | Append-only insert | State upsert                                                    |
|-------------------|--------------------|-----------------------------------------------------------------|
| `tale_unlocked`   | `unlock_events`    | —                                                               |
| `badge_awarded`   | `badge_events`     | `user_badges (guest_id, tale_id=taleSlug, badge_type=via)`      |
| `game_started`    | `game_events` (`phase='started'`)   | — |
| `game_completed`  | `game_events` (`phase='completed'`) | — |
| `game_failed`     | `game_events` (`phase='failed'`)    | — |

Once per request (before processing the batch):

- `guest_profiles` is upserted on `(guest_id, last_seen_at=now())` with
  `Prefer: resolution=merge-duplicates`.
- An upsert failure is logged server-side but does **not** block the
  batch — the events log is the source of truth, `guest_profiles` is a
  derived projection.

`user_badges` upsert failure mid-batch surfaces as a per-event
`badge_state_drift` rejection but does **not** roll back the
corresponding `badge_events` row. Admin-side queries can rebuild
`user_badges` from `badge_events` if needed.

---

## Receipt verification

Applies only to `tale_unlocked` events with `source='scan'` AND a
non-empty `receipt` string. All other event types ignore receipt fields.

The receipt format is exactly what `validate-qr` produces:

```
<payloadB64Url>.<signatureB64Url>
```

where `payloadB64Url = base64url(JSON.stringify({ g, t, q, s, exp }))`
and `signatureB64Url = base64url(HMAC-SHA256(RECEIPT_SECRET,
payloadB64Url))`.

The function verifies, in order:

1. **Signature** — recompute HMAC over `payloadB64Url` and compare to
   `signatureB64Url` using a constant-time comparison.
2. **Expiry** — `exp > floor(now()/1000)`.
3. **Tale match** — decoded `t` equals the event's `taleSlug`.
4. **QR existence** — decoded `q` exists in `qr_codes.id`. (Activeness
   was a `validate-qr` concern at scan time; this check is integrity
   only.)

On verification success, the inserted `unlock_events` row carries
`qr_code_id = <verified.q>`. **On any verification failure**:

- The `unlock_events` row still inserts with `qr_code_id = NULL`.
- A `rejectedReasons` entry is added describing the enrichment failure
  (`receipt_invalid`, `receipt_expired`, `receipt_tale_mismatch`,
  `receipt_qr_unknown`).
- The event is still counted as `accepted` because the audit row landed.

`tale_unlocked` events without any `receipt` field insert with
`qr_code_id = NULL` and produce no rejection. This is expected for
direct deep-link unlocks and featured-tale taps.

---

## Response

### Success

```jsonc
{
  "ok":               true,
  "accepted":         4,
  "rejected":         0,
  "rejectedReasons":  []
}
```

`accepted + rejected` does **not** always equal `events.length` — events
with verification-only failures still count as accepted (the row
inserted with `qr_code_id=NULL`). Rejections are events whose primary
table write either failed or was never attempted.

### Partial-success example

```jsonc
{
  "ok":       true,
  "accepted": 3,
  "rejected": 1,
  "rejectedReasons": [
    { "index": 1, "reason": "unknown_event_type" }
  ]
}
```

### Per-event reasons

| `reason`                | Meaning                                                                  |
|-------------------------|--------------------------------------------------------------------------|
| `unknown_event_type`    | Event `type` is missing or not in the allowed set.                       |
| `bad_event`             | Required field missing or invalid (e.g. unknown `gameType`).             |
| `unsupported_source`    | `source` is `'admin'` or `'share'` (reserved for v6.9+).                 |
| `receipt_invalid`       | Signature did not verify against `RECEIPT_SECRET`.                        |
| `receipt_expired`       | Signature valid but `exp` is in the past.                                |
| `receipt_tale_mismatch` | Decoded payload `t` did not equal the event's `taleSlug`.                |
| `receipt_qr_unknown`    | Decoded payload `q` is not present in `qr_codes`.                        |
| `badge_state_drift`     | `badge_events` insert succeeded but the `user_badges` upsert failed.     |
| `db_write_failed`       | The primary table insert failed after one retry.                          |

### Batch-level errors

| HTTP | Body                                            | Cause                                                                     |
|------|-------------------------------------------------|---------------------------------------------------------------------------|
| 400  | `{ "ok": false, "reason": "bad_request" }`      | Body not JSON, missing `guestId`, missing/empty `events`, malformed.      |
| 400  | `{ "ok": false, "reason": "batch_too_large" }`  | More than 20 events.                                                       |
| 405  | `{ "ok": false, "reason": "method_not_allowed" }` | Non-POST (other than `OPTIONS` preflight).                                |
| 500  | `{ "ok": false, "reason": "misconfigured" }`    | Required env vars missing.                                                 |
| 500  | `{ "ok": false, "reason": "db_unavailable" }`   | All events failed with `db_write_failed`. Client should retry the batch.  |
| 500  | `{ "ok": false, "reason": "server_error" }`     | Unhandled exception in the handler.                                       |

---

## Privacy posture

The function deliberately does not:

- Read `x-forwarded-for`, `cf-connecting-ip`, or any other request
  header for IP. There is no IP capture path in v6.8A.
- Store `user_agent`. The schema column exists but is not written.
- Read or echo URL search/hash parameters.
- Set any cookies.
- Call any third-party service.
- Honor client-supplied timestamps. Server `now()` is authoritative
  (via the table's `default now()`).

`guest_id` is a random `g_<rand>_<ts>` token from client localStorage —
it is not personally identifying, not tied to a real account, and is
wiped when the user clears site data.

Production rollout is gated on a privacy-policy update describing
event collection on `guest_id`. See ADMIN-v6.8 plan §6.

---

## curl smoke tests

Replace `$SUPABASE_URL` and `$ANON_KEY` with the deployed values.
The anon key is required because `/functions/v1/...` routes through
the same gateway as REST.

### 1. Single tale_unlocked with a fresh receipt → success, qr_code_id enriched

```sh
RECEIPT="$(curl -sS -X POST "$SUPABASE_URL/functions/v1/validate-qr" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{"code":"trackside://demo/wa-lager","guestId":"g_test_001","source":"scan"}' \
  | jq -r .receipt)"

curl -sS -X POST "$SUPABASE_URL/functions/v1/log-events" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d "$(jq -n --arg r "$RECEIPT" '
    { guestId: "g_test_001",
      events: [
        { type: "tale_unlocked", taleSlug: "wa-lager", source: "scan", receipt: $r }
      ]
    }')"
```

### 2. Batch of 4 (unlock + badge + game start + game complete) → all accepted

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/log-events" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{
    "guestId": "g_test_002",
    "events": [
      { "type": "tale_unlocked", "taleSlug": "wa-lager", "source": "direct" },
      { "type": "badge_awarded", "taleSlug": "wa-lager", "badgeKey": "wa-lager", "via": "scan" },
      { "type": "game_started",  "taleSlug": "wa-lager", "gameType": "grid" },
      { "type": "game_completed","taleSlug": "wa-lager", "gameType": "grid", "attempts": 2, "durationMs": 14200 }
    ]
  }'
```

### 3. Missing receipt on a scan-source unlock → accepted with qr_code_id=NULL, no rejection

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/log-events" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{
    "guestId": "g_test_003",
    "events": [
      { "type": "tale_unlocked", "taleSlug": "wa-lager", "source": "scan" }
    ]
  }'
```

### 4. Tampered receipt → accepted with rejectedReasons[].reason="receipt_invalid"

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/log-events" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{
    "guestId": "g_test_004",
    "events": [
      { "type": "tale_unlocked", "taleSlug": "wa-lager", "source": "scan",
        "receipt": "eyJnIjoiZyIsInQiOiJ3YS1sYWdlciIsInEiOiJ4IiwicyI6InNjYW4iLCJleHAiOjF9.AAAA" }
    ]
  }'
```

### 5. Unknown event type → accepted=0, rejected=1, reason="unknown_event_type"

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/log-events" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{
    "guestId": "g_test_005",
    "events": [ { "type": "passport_opened" } ]
  }'
```

### 6. Batch > 20 → 400 batch_too_large

```sh
curl -sS -X POST "$SUPABASE_URL/functions/v1/log-events" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d "$(jq -n '
    { guestId: "g_test_006",
      events: ([range(0; 21) | { type: "game_started", taleSlug: "wa-lager", gameType: "grid" }])
    }')"
```

### 7. CORS preflight → 204

```sh
curl -sS -X OPTIONS "$SUPABASE_URL/functions/v1/log-events" \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" -i
```

---

## Local edge runtime

`supabase/config.toml` keeps `[edge_runtime] enabled = false` because
corporate TLS inspection on the developer machine prevents the local
Deno runtime from fetching its dependencies. Smoke testing happens
against the deployed function on Supabase Cloud rather than the local
container. If `supabase functions serve log-events` ever does start
locally, swap `$SUPABASE_URL` for `http://127.0.0.1:54321` and use the
local anon key from `supabase status`.

---

## What this function does NOT do (by phase rule)

- **No client wiring.** ADMIN-v6.8A is server-only. `eventLogger.ts`
  arrives in v6.8B; ScanPage and GameOverlay calls arrive in v6.8C/D.
- **No raw IP / user_agent / geolocation capture.** v6.9 may revisit
  storing a daily-rotated `ip_hash`; v6.8A does not write it.
- **No new database schema.** All inserts target columns that already
  exist in `unlock_events`, `badge_events`, `game_events`,
  `user_badges`, and `guest_profiles`.
- **No RLS changes.** Service-role-only writes. Public app cannot write
  to these tables directly.
- **No event types beyond the five listed.** `passport_opened` and
  `story_opened` are deferred per ADMIN-v6.8 plan.
