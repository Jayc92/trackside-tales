# preview-tale (ADMIN/PUBLIC-v7.4B.P.15c)

Server-authoritative resolver for admin draft-Tale previews. The admin
app mints a signed token scoped to exactly one Tale for ~10 minutes;
the public app POSTs it here and renders the returned row through its
normal Tale adapter/renderer with a visible "Draft preview" banner.

**Deployment is operator-gated.** Nothing deploys this automatically.

## Why this exists

The public app's Tale queries (and RLS) are hard-filtered to
`is_active=true AND status='published'` — an operator cannot see a
draft before publishing. This function is the ONLY pathway that can
return a non-published Tale to a browser, and it requires a token only
the authenticated (AAL2) admin server can mint.

## Token & key model

- Token: `base64url({t: taleId, s: slug, exp: unixSeconds})` + `.` +
  `base64url(HMAC-SHA256(sig))`.
- Signing key is **derived, not stored**:
  `HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY, 'trackside-tale-preview-v1')`.
  Both the admin server and this Edge runtime already hold the
  service-role key, so **no new secret or env var exists**; HMAC output
  cannot be inverted to recover the key; rotating the service-role key
  invalidates all outstanding preview tokens.
- Lifetime: 10 minutes (set at mint time; enforced here).
- Scope: one Tale id. The response never contains any other row.

## Request / responses

`POST /functions/v1/preview-tale` with `{ "token": "<opaque>" }` (anon
key headers; the token travels in the POST body, never a query string
to this function).

| Case | Status | Body |
|---|---|---|
| Valid + Tale exists (any status) | 200 | `{ valid: true, row: {…}, expiresAt }` |
| Bad signature / malformed | 200 | `{ valid: false, reason: "invalid" }` |
| Expired | 200 | `{ valid: false, reason: "expired" }` |
| Tale row deleted | 200 | `{ valid: false, reason: "tale_unavailable" }` |
| Non-POST / bad body / server error | 405 / 400 / 503 | generic invalid body |

Distinguished reasons are intentional: this is operator tooling, not
the customer unlock path, and expired-vs-invalid leaks nothing a token
holder didn't know. Draft/inactive/archived rows are all previewable —
the operator minted the token for that exact row moments earlier.

## What this does NOT change

- Normal public queries, RLS, and grants: untouched — drafts stay
  invisible to anon reads.
- validate-qr: untouched — unpublished Tales remain un-unlockable.
- No writes, no audit inserts (minting is audited admin-side as
  `tale.preview.create`), no token logging.

## CORS

Explicit allowlist (no `*`): `https://jayc92.github.io` +
localhost 5173/4173/4174. Update `ALLOWED_ORIGINS` when a custom
domain lands (same note as validate-qr).

## Deploy & smoke test (operator)

```bash
supabase functions deploy preview-tale --project-ref uuuugwfkequtgytwuuat
```

```bash
# Expect 200 {"valid":false,"reason":"invalid"} — garbage token
curl -s -X POST "https://uuuugwfkequtgytwuuat.supabase.co/functions/v1/preview-tale" \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" \
  -d '{"token":"bm90LXJlYWw.bm90LXJlYWw"}'
```

Then use the admin "Preview draft" button end-to-end. Never paste real
preview URLs into tickets/chat — they carry a (short-lived) token.
