# validate-qr (SUPABASE/PUBLIC-v7.4B.P.13b)

Server-authoritative QR validation for Trackside Tales. Resolves a
scanned opaque `code` value to the canonical slug of a published,
active Tale. Read-only: no unlock/game/badge event writes.

This revision supersedes the ADMIN-v6.6 draft, which targeted the
canonical greenfield schema and would have failed against production
(it selected `purpose`/`redirect_to`, which production does not have,
and ignored `status`/`valid_from`/`valid_until`/`max_uses`/`tale_id`).
The v6.6 HMAC receipt handshake is removed from the contract — the
log-events pipeline it fed was never deployed and remains deferred.

**Deployment is operator-gated.** This source is committed but NOT
deployed by any automation. See the rollout sequence in the repo
README ("QR validation" section).

---

## Required environment variables

Both are auto-injected by the Supabase Edge runtime — nothing to set
manually, and nothing here ever reaches the browser:

| Name                        | Notes                                                    |
|-----------------------------|----------------------------------------------------------|
| `SUPABASE_URL`              | Project REST URL.                                        |
| `SUPABASE_SERVICE_ROLE_KEY` | Required: `qr_codes` is RLS service-role-only after the P.13b lockdown migration. |

`RECEIPT_SECRET` is no longer used.

---

## Request

```
POST /functions/v1/validate-qr
Content-Type: application/json
```

```json
{ "code": "<exact scanned code value>" }
```

`code` must be a string; it is trimmed and must be 4–512 characters.
No other body fields are read. A bare Tale slug is not proof of
anything — only an exact `qr_codes.code` match can validate.

## Responses

| Case | Status | Body |
|---|---|---|
| Code valid + Tale published/active | 200 | `{ "valid": true, "taleSlug": "<canonical-slug>" }` |
| Any validation failure (unknown, inactive, revoked, expired, future-dated, `max_uses` set, bad association, Tale draft/archived/missing) | 200 | `{ "valid": false, "error": "invalid_qr" }` |
| Malformed body / out-of-bounds code | 400 | same generic body |
| Non-POST | 405 | same generic body |
| Misconfiguration / database error | 503 | same generic body |

One generic failure body by design: distinct reasons would let an
unauthenticated caller enumerate which codes exist, which are merely
inactive, and whether a Tale exists. The 200-vs-non-200 split lets the
client distinguish "decisively rejected" from "service unreachable" —
both fail closed in the app.

The response never contains the QR row id, raw code, `tale_id`,
campaign/batch keys, status detail, or database error text.

## Validation rules

A code validates only when ALL hold:

1. Exact `qr_codes.code` match.
2. `status = 'active'`.
3. `is_active IS TRUE` (NULL fails closed).
4. `valid_from IS NULL OR valid_from <= now()`.
5. `valid_until IS NULL OR valid_until >= now()`.
6. `max_uses IS NULL` — **fail-closed**: no trustworthy redemption
   ledger exists (production `unlock_events` is a read-side compat
   view; nothing records redemptions in this flow), so a numeric cap
   cannot be honestly enforced. A non-null `max_uses` therefore makes
   the code invalid until a real ledger ships. All six current
   production rows have `max_uses = NULL`.
7. Tale association resolves: `tale_slug` (modern rows) preferred,
   `tale_id` (legacy rows) fallback; if both are set they must
   identify the same Tale, else fail closed.
8. The resolved Tale has `status = 'published'` and `is_active = true`.

The returned `taleSlug` always comes from the Tale row, never from
client input or the raw QR association.

## CORS

Explicit origin allowlist (no `*`): the GitHub Pages production origin
(`https://jayc92.github.io`) plus `http://localhost:5173/4173/4174`
for Vite dev/preview. Update `ALLOWED_ORIGINS` in `index.ts` if a
custom domain is added.

## Logging

Raw QR code values are never logged and never echoed. Server logs
carry category-only messages (`missing required env`,
`qr_codes lookup failed`, `tales lookup failed`, `unhandled error`).

## Deploy & smoke test (operator, next gate)

```bash
supabase functions deploy validate-qr --project-ref uuuugwfkequtgytwuuat
```

```bash
# Expect 200 {"valid":false,"error":"invalid_qr"} — unknown code
curl -s -X POST "https://uuuugwfkequtgytwuuat.supabase.co/functions/v1/validate-qr" \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" \
  -d '{"code":"not-a-real-code-1234"}'
```

```bash
# Expect 400 with the same generic body — malformed input
curl -s -X POST "https://uuuugwfkequtgytwuuat.supabase.co/functions/v1/validate-qr" \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" \
  -d '{"code":42}'
```

Then scan (or POST) a real printed code — do NOT paste real code
values into tickets, chat, screenshots, or logs.

Local `supabase functions serve` is not part of the workflow here —
the local edge runtime is disabled in `supabase/config.toml`
(corporate TLS interception blocks Deno deps). Smoke testing happens
against the deployed function.
