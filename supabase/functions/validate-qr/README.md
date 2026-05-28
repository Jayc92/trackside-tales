# validate-qr (ADMIN-v6.6)

Server-side QR validation for Trackside Tales. Resolves a scanned `code`
value to a published Tale slug and returns a short-lived HMAC-signed
receipt that downstream event-log functions (planned for ADMIN-v6.8)
will accept as proof a scan happened.

This function is **read-only**. It does not insert into `unlock_events`,
`game_events`, `badge_events`, or `user_badges`. Event logging belongs to
a separate `log-events` function in a later phase.

---

## Required environment variables

Set these on the deployed function (Supabase Cloud → Edge Functions →
validate-qr → Settings):

| Name                        | Source                                     | Notes                                                        |
|-----------------------------|--------------------------------------------|--------------------------------------------------------------|
| `SUPABASE_URL`              | Auto-injected by Supabase                  | Project REST URL.                                            |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by Supabase                  | Required to read `qr_codes` (RLS service-role only).         |
| `RECEIPT_SECRET`            | Set manually; ≥32 bytes random             | HMAC-SHA256 signing key. Rotate any time — receipts are 5m TTL so the next deploy after rotation invalidates only in-flight receipts. |

If any of these is missing, the function returns `500` with
`{ ok: false, reason: "misconfigured" }`. The public client treats any
non-`200` as "service unreachable" and falls back to local QR parsing.

---

## Request

```
POST /functions/v1/validate-qr
Content-Type: application/json
```

```jsonc
{
  "code":    "trackside://demo/wa-lager",   // required, exact code value
  "guestId": "g_ab1c2def3_xyz0",            // optional; null/anonymous allowed
  "source":  "scan"                          // optional; "scan" | "direct" | "admin" | "share"; defaults to "scan"
}
```

Notes:
- `code` is matched **exactly** against `qr_codes.code`. The function does
  not normalize URLs, strip query strings, or lowercase the value — admin
  printing must use the same string the column stores.
- `guestId` is the client-side `tb_guest_id` (`g_<rand>_<ts>`). It is
  **not** validated against `guest_profiles`; the receipt simply binds
  the eventual unlock to whichever guest_id was claimed at scan time.
- `source` defaults to `"scan"` so a missing field maps to the most
  common case (camera scan in the public app).

---

## Response

All known failure modes return **HTTP 200** with `ok: false`. Real server
errors (DB unreachable, env vars missing, signing failure) return
**HTTP 500**. The public client treats anything but `200 + ok:true` as
"degrade to local parse."

### Success

```json
{
  "ok":         true,
  "taleSlug":   "wa-lager",
  "isDemo":     true,
  "qrCodeId":   "0f6c4b58-…",
  "receipt":    "<base64url-payload>.<base64url-signature>",
  "receiptExp": 1717113600
}
```

### Failure (200)

```json
{ "ok": false, "reason": "<reason>" }
```

| `reason`             | Meaning                                                                |
|----------------------|------------------------------------------------------------------------|
| `bad_request`        | Body was not JSON, or `code` was missing/empty.                        |
| `unknown_code`       | No row in `qr_codes` matches the supplied `code`.                      |
| `inactive`           | The matching row exists but `is_active = false` (rotated/retired).     |
| `tale_unavailable`   | The resolved tale slug does not exist, is `is_active = false`, or has `status != 'published'`. |
| `method_not_allowed` | Non-POST request (other than `OPTIONS` preflight, which returns 204).  |

### Error (5xx)

| HTTP | Body                                            | Cause                                       |
|------|-------------------------------------------------|---------------------------------------------|
| 500  | `{ "ok": false, "reason": "misconfigured" }`    | One or more required env vars not set.      |
| 500  | `{ "ok": false, "reason": "lookup_failed" }`    | DB read against `qr_codes` or `tales` failed. |
| 500  | `{ "ok": false, "reason": "sign_failed" }`      | `crypto.subtle` HMAC sign threw (very unusual; usually a malformed `RECEIPT_SECRET`). |
| 500  | `{ "ok": false, "reason": "server_error" }`     | Unhandled exception in the request handler. |

---

## Receipt format

The receipt is a compact two-part token, similar to a JWS but with a
JSON payload that is intentionally short and opaque:

```
<payloadB64Url>.<signatureB64Url>
```

- `payloadB64Url` is `base64url(JSON.stringify(payload))` where the
  payload is:

  ```jsonc
  {
    "g":   "g_ab1c2def3_xyz0" | null,  // guestId at scan time
    "t":   "wa-lager",                  // taleSlug
    "q":   "0f6c4b58-…",                // qr_codes.id (uuid)
    "s":   "scan",                      // source
    "exp": 1717113600                   // unix seconds, ≈ now() + 300
  }
  ```

- `signatureB64Url` is
  `base64url(HMAC-SHA256(RECEIPT_SECRET, payloadB64Url))`.

The TTL is **5 minutes** (`receiptExp = now + 300`). The future
`log-events` function will reject receipts past `exp` and receipts whose
signature does not verify against the current `RECEIPT_SECRET`.

The public app does **not** decode the receipt — it stores it verbatim
and forwards it to `log-events` when (eventually) wiring event writes
through the Edge Functions in ADMIN-v6.8.

---

## curl smoke tests

Replace `$SUPABASE_URL` and `$ANON_KEY` with the deployed project
values. The anon key is required because the function is invoked at
`/functions/v1/...` which routes through the same gateway as REST.

```sh
# 1. Demo code → success
curl -sS -X POST "$SUPABASE_URL/functions/v1/validate-qr" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{"code":"trackside://demo/wa-lager","guestId":"g_demo_001","source":"scan"}'

# 2. Unknown code → { ok:false, reason:"unknown_code" }
curl -sS -X POST "$SUPABASE_URL/functions/v1/validate-qr" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{"code":"trackside://demo/does-not-exist"}'

# 3. Empty body → { ok:false, reason:"bad_request" }
curl -sS -X POST "$SUPABASE_URL/functions/v1/validate-qr" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{}'

# 4. Anonymous guest (guestId omitted) → success, payload "g": null
curl -sS -X POST "$SUPABASE_URL/functions/v1/validate-qr" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{"code":"trackside://demo/packer-pils"}'

# 5. CORS preflight → 204
curl -sS -X OPTIONS "$SUPABASE_URL/functions/v1/validate-qr" \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" -i
```

---

## Local edge runtime

`supabase/config.toml` keeps `[edge_runtime] enabled = false` because
corporate TLS inspection on the developer machine prevents the local
Deno runtime from fetching its dependencies over HTTPS, which blocks
`supabase start` from going healthy. Smoke testing happens against the
deployed function on Supabase Cloud rather than the local container.

If `supabase functions serve validate-qr` ever does start working
locally, the same curl examples apply — substitute
`$SUPABASE_URL` for `http://127.0.0.1:54321` and use the local anon
key from `supabase status`.

---

## What this function does NOT do (yet)

- **No event writes.** `unlock_events`, `game_events`, `badge_events`,
  and `user_badges` are not touched. A successful response is purely
  validation + a signed receipt.
- **No client wiring.** The public app's `ScanPage` and `parseQRCode`
  are unchanged in ADMIN-v6.6. The companion helper
  `src/services/qrValidationRemote.ts` is exported but not imported
  by any page or context.
- **No QR scheme change.** The same `trackside://demo/<id>` /
  `?tale=<id>` / plain-id formats parsed on-device today are what get
  forwarded as the `code` field.

These are deliberate scope cuts — see ADMIN-v6.5 (planning) and the
v6.7+ phases for when each piece flips on.
