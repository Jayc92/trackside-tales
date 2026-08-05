# Public UI & Brand Hardening (PUBLIC-v7.4B.P.28)

**Date:** 2026-08-05 · **Base:** `9878204` · **Scope:** public repo only —
no Supabase schema/SQL/RLS/Auth/Storage/QR-lifecycle change, no admin-repo
change, no production-data change.

---

## 1. Concept-image interpretation rules

Eight reference images informed this gate: five photorealistic venue/
atmosphere concepts (building exterior, brewhouse, taproom, beer garden,
live music) and three UI concepts (game shell "Lay Out Allen's Town",
W.A. Lager Tale-detail dossier, "Stories From the Track" landing).

They were treated as **art direction only**. Content that appears in them
and was NOT adopted, per the gate's do-not-copy list:

- "EST. 2017" (the approved logo asset reads EST. 2026 and is unchanged)
- "TRACKSIDE BREWING COMPANY" as HTML text (allowed only inside logo art)
- "Now pouring at Alburtis Tavern" / Alburtis venue panels / "EST. 1866"
- Invented beers (Alburtis Amber, Lock Ridge Pilsner, 610 Pale Ale, Coal
  Train Stout, Railspur IPA, CNJ Porter, Yardmaster Saison, Iron Horse
  DIPA) — production beers only
- Account/profile capabilities beyond the existing guest passport
- Reward-redemption promises

What WAS adopted: the material language (blackened iron, warm charcoal,
antique brass, parchment, rivets, tickets, stamped seals), the shell
pattern (status chip · centered lockup · profile; 5-item lit bottom nav),
the archive-ticket Tale hero, stat rails, medallion timelines, and
copper-plate CTAs. **Audit finding: the shipped app already implemented
most of this direction** (v4.5–v6.x design passes); P.28 formalized the
system and closed the gaps below.

## 2. Brand hierarchy applied

| Slot | Before | After |
|---|---|---|
| `<title>` | Trackside Tales at The Wooden Match | **Trackside Brewing** |
| `og:title` | Trackside Tales at The Wooden Match | **Trackside Brewing** |
| `og:site_name` / `author` | Trackside Brewing Co. | **Trackside Brewing** |
| `apple-mobile-web-app-title` / `application-name` | Trackside Tales | **Trackside Brewing** |
| Manifest `name` | Trackside Tales | **Trackside Brewing** |
| Tales-hub concept card | TRACKSIDE BREWING CO. | **TRACKSIDE BREWING** |
| Header logo `alt` | Trackside Brewing Co. | **Trackside Brewing** |
| Our Story stub, Wooden Match timeline entry | …Brewing Co. | **…Brewing** |

Trackside Tales remains the campaign/feature name everywhere it is one
(hub eyebrow, passport plaques, unlock certificate, menu section header).
"Co."/"Company" survives **only** inside approved logo artwork. **The
Wooden Match remains the soft-launch venue in data and copy. Alburtis was
not activated, referenced, or hard-coded anywhere.** Venue configuration
is deferred to P.29 as scoped in the admin repo's audit doc.

## 3. Design-token layer (`src/styles/tokens.css`)

Two layers:

- **Layer 1 — palette:** the v4.5.2 Warm Charcoal palette, byte-for-byte
  (all 16.9k lines of legacy CSS keep resolving identically).
- **Layer 2 — semantic roles (new):** surfaces (canvas/steel/charcoal/
  raised-iron/bronze/parchment/faded-parchment/leather/overlay), text
  roles (ivory/parchment-ink/brass/muted-bronze/signal-orange/status/
  focus-ring), border+ornament roles (brass hairline/frame, oxidized
  copper, rivet, inset, ticket edge, seal, rail-divider, engraved rule),
  typography roles (wordmark/display/archival/serif/operational/numeric/
  metadata/stamp — all faces already loaded; no new font files), a 4px
  spacing scale, and two depth levels.

Ornament hierarchy (tier 1 hero artifact → tier 4 quiet metadata) is
documented in the token file header. New styles consume role tokens.

Also global in tokens.css: a single `:focus-visible` ring for every
interactive element, and a `.sr-only` utility.

Note: only `tokens.css`, `app.css`, `polish.css`, `design-system.css`
are imported by `main.tsx`. The other 10 files in `src/styles/` are
unimported extraction leftovers — left untouched; removal is a cleanup
candidate for a later gate.

## 4. Shared primitives

- `src/components/interactive.ts` — `pressable()`: upgrades the app's
  click-only styled `<div>` cards to keyboard citizens (role=button,
  tabIndex, Enter/Space). Applied to the header status chip, the header
  logo, the home hero, home nav cards, and Tales-hub cards.
- The app's existing primitives were audited and kept: `TsIcon`,
  `UnlockStampModal` (already a correct `role="dialog"` with ESC and
  scroll-lock), `GameOverlay` (already `role="dialog"`), menu card/tab
  components (already real buttons with `role="tablist"`).
- Deliberately NOT built: the gate's full component list (RailroadPanel,
  ArchiveTicket, BrassButton, …) already exists as scoped CSS classes
  (`.ts-*` design-system v6.0 language). Re-wrapping working one-use
  markup in React components would be churn without benefit (gate §4:
  don't over-abstract).

## 5. Route-by-route matrix (audit → action)

| Route/state | Audit classification | P.28 action |
|---|---|---|
| Home | visually strong; hero text baked into raster, blank on asset failure; cards not keyboard-operable | HTML hero fallback (eyebrow/title/sub/CTA); `pressable()`; heading roles |
| Tales hub | aligned; "BREWING CO." text; div headings; card keyboard gap | brand fix; `role=heading`; `pressable()` |
| Tale detail (locked) | aligned (sealed panel + scan CTA) | none — behavior untouched |
| Tale detail (unlocked) | **already implements the archive-ticket concept** (ticket spine, dossier, timeline, badges, game CTA) | none |
| Unlock success | aligned (certificate modal, dialog semantics, ESC) | none |
| QR entry / camera-unavailable | aligned (brass viewfinder, honest state chip) | none — QR logic untouched |
| QR invalid/expired/revoked | server-authoritative states; code untouched | none (regression by zero-diff) |
| Passport | aligned (ledger card, stat rail, rewards) | none |
| Beers / Food / Tap (menu tabs) | aligned; real data (can art, ABV/IBU, ON TAP from live tap list) | none |
| Games + game shell | aligned (stat rail, hint/reset, locked clue cards, dialog role, reduced-motion guards in polish.css) | global focus ring now applies |
| Coming-soon buttons (Watch Intro / Share) | correct aria-disabled placeholders | none |
| Signed draft preview | behavior-critical; zero diffs | none |
| Secondary stubs (Story/About/…) | stub pages | brand string fix only |

## 6. PWA identity & installability

- `manifest.webmanifest`: name **Trackside Brewing**, short_name
  Trackside, description, `id`/`scope`/`start_url` under
  `/trackside-tales/`, `display: standalone`, background `#191715`,
  theme `#0c0a07` (matches `<meta name="theme-color">`).
- Icons (previously an **empty array**): `icons/icon-192.png`,
  `icons/icon-512.png`, `icons/icon-maskable-512.png` (62% safe zone),
  and a real `icons/apple-touch-icon.png` replacing the inline SVG data
  URI (iOS ignores SVG data URIs for home-screen icons). All generated
  from the approved header-logo asset on the coal background.
- Hash routing preserved; no routing changes.
- **Service worker: deferred to P.31** (as the gate allows). Reason: the
  Tap List and Tale availability are live operational data — a naive SW
  cache could serve stale ON-TAP claims, and the QR validation flow must
  never be cached. A safe, tested strategy (network-first for data,
  cache-first for static assets, versioned activation) deserves its own
  gate. No offline support is claimed.

## 7. Accessibility (WCAG 2.2 AA target — honest coverage)

Verified this gate:
- Keyboard operability for previously mouse-only shell/landing controls.
- One global, visible `:focus-visible` indicator (gold ring) confirmed
  rendering in the browser.
- Heading semantics: real `h1–h3` already on Menu/Detail/Modal; added
  `role="heading"` + `aria-level` to the styled-div titles on Home and
  Tales hub (element swap would fight extraction-era CSS).
- Dialog semantics already correct on unlock modal + game overlay.
- `prefers-reduced-motion` guards already cover page/overlay/game
  animations (verified present in app.css/polish.css/design-system.css).
- Safe-area insets already applied (`env(safe-area-inset-*)` in header
  and bottom nav); pages pad 7.5rem bottom so the nav never obscures
  content.
- Status communication is not color-alone (UNLOCKED chip carries text +
  lock glyph; ON TAP/N-A are text badges).

NOT verified (residuals): screen-reader walkthrough (VoiceOver/NVDA),
formal contrast measurement of every parchment-on-iron pairing, keyboard
operation of the in-game boards (game logic out of scope this gate). No
conformance certification is claimed.

## 8. Performance strategy

Audited: bundle 645 kB JS (pre-existing; dominated by embedded base64 can
art + html5-qrcode; already in the deferred-hardening register — bundle
splitting is its own gate). CSS 283 kB (46 kB gzip). Textures are CSS
gradients/borders — no full-screen raster backgrounds were added; P.28
added zero runtime weight beyond ~340 kB of static icons (loaded only by
the OS at install time, not at page load). Fonts were already loaded via
Google Fonts with `display=swap`.

Known image findings (deferred, documented): `home-hero-trackside-tales.png`
is 1.3 MB (paints late on slow connections — the new HTML fallback keeps
the panel meaningful), and the hub/nav PNGs total ~4 MB. WebP/AVIF
conversion + `srcset` is recommended for P.31 packaging; not done here to
avoid regenerating approved art mid-gate.

## 9. Visual verification matrix

Local dev server, Chromium. Widths: 375×812, 430×932, 768×1024, 1440×800.

| Surface | 375/390 | 430 | 768 | 1440 |
|---|---|---|---|---|
| Home (hero + cards) | ✅ | ✅ | ✅ | ✅ (centered app column, no overflow) |
| Home hero fallback (forced img error) | ✅ HTML fallback renders | ✅ | — | — |
| Tales hub | ✅ (no "CO.") | — | — | — |
| Tale detail locked (wa-lager) | ✅ | — | — | — |
| Tale detail unlocked (wa-lager, local tb_unlocked) | ✅ | — | — | — |
| Menu / Beers (Tales tab, real can art + ABV/IBU) | ✅ | — | — | — |
| Scan (camera-unavailable state) | ✅ | — | — | — |
| Passport (stamps, rewards, name save) | ✅ | — | — | — |
| Game (Allen's Town: intro, board, stat rail, clue cards) | ✅ | — | — | — |
| Horizontal overflow check | ✅ none | ✅ | ✅ | ✅ (docW 1425 ≤ vw 1440) |

Not visually exercised (code untouched, zero diffs): QR
invalid/expired/revoked (needs the production validate-qr flow — testing
would consume production QR state), game-complete, signed preview
(requires an admin-minted token). Unlock-success modal verified in a
prior session's baseline; its component has zero P.28 diffs.

## 10. Functional regression

`tsc -b && vite build` clean. Behavior-critical modules have **zero
diffs**: `qrValidation*`, `scanSlugTranslation`, `talePreview`,
`guestPersistence` (localStorage keys `tb_*` unchanged), `badgeService`,
`contentService`, `AppContext`, `App.tsx` (hash routing), all `games/*`,
`MenuPage`, `TaleDetailPage`, `PassportPage`, `ScanPage`,
`UnlockStampModal`. Diffs are confined to: metadata (index.html,
manifest), tokens/focus CSS, brand strings, keyboard/heading attributes,
and the home-hero fallback branch. Routing, unlock semantics, scoring,
and progress compatibility are intact by construction.

## 11. Deferred / residuals

1. Service worker + offline (P.31, reason in §6).
2. Image format/optimization pass (P.31).
3. Venue configuration layer (P.29) — venue strings remain approved
   current-venue copy, never Alburtis.
4. Unimported `src/styles/*.css` extraction leftovers cleanup.
5. Screen-reader walkthrough + formal contrast sweep.
6. In-game keyboard operability (needs a logic-adjacent gate).
7. Bundle splitting (pre-existing register item).
