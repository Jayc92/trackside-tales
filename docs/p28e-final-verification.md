# PUBLIC-v7.4B.P.28e — Final Verification Record

## 1. Date and gate
2026-08-06 · PUBLIC-v7.4B.P.28e.4 — final documentation and release
verification for the operator-approved P.28e mandatory public visual
rebuild.

## 2. Repository and branches
`Jayc92/trackside-tales`. Work branch `public-p28e-chatgpt-finalization`
(branched from `public-p28e-visual-rebuild` at `fb8784a`). `main` is the
production branch (GitHub Pages deploys only from `main`).

## 3. Starting main SHA
`b4a35b453dcf70c351ad4455536db187e5f8fdf6` (P.28d) — unchanged throughout
the gate and still what production serves.

## 4. Final branch SHA
`ea432f9960f8b9fec8ac8228a5c4e7e91d49630a` (pre-documentation); the
P.28e.4 documentation commit lands on top of it.

## 5. Commit sequence (3 ahead of main at verification time)
1. `4a7aa0e` — PUBLIC-v7.4B.P.28e.1: rebuild public shell and primary routes
2. `fb8784a` — PUBLIC-v7.4B.P.28e.2: rebuild remaining public routes and game presentation
3. `ea432f9` — PUBLIC-v7.4B.P.28e.3: finalize public shell and presentation states

`git log origin/main..HEAD` shows exactly these three; no unrelated
commits. `git diff --check origin/main...HEAD` clean.

## 6. Changed-file inventory (16 files · +3005 / −939)

| File | Category |
|---|---|
| `src/styles/p28e.css` (new, 1915 lines) | public design system |
| `src/components/public/primitives.tsx` (new) | public design system |
| `src/main.tsx` (+1 import) | public design system |
| `src/components/AppHeader.tsx` | shared shell/navigation |
| `src/components/BottomNav.tsx` | shared shell/navigation |
| `src/pages/HomePage.tsx` | Home/Tales |
| `src/pages/TalesPage.tsx` | Home/Tales |
| `src/pages/TaleDetailPage.tsx` | Tale detail |
| `src/pages/MenuPage.tsx` | Beer/Food/Tap List |
| `src/pages/PassportPage.tsx` | Passport |
| `src/pages/ScanPage.tsx` | Scan/QR presentation |
| `src/components/UnlockStampModal.tsx` | unlock certificate |
| `src/games/GameOverlay.tsx` | games (presentation shell only) |
| `src/pages/TalePreviewPage.tsx` | preview states |
| `src/components/TsIcon.tsx` | accessibility (icon system, no-emoji) |
| `src/services/talePresentationPack.ts` | accessibility (icon-identifier defaults, no-emoji) |

No file falls outside the gate's categories. PWA identity files
(manifest/icons/index.html) were completed in P.28 and carry no P.28e
diff. Documentation changes are added by the P.28e.4 commit itself.

## 7. Route-by-route result
- **Home** — "Stories From the Track" composition: atmospheric hero with
  HTML type, typographic Wooden Match plaque (no concept art presented
  as the venue), quiet concept editorial, track-line Scan→Unlock→Collect
  progress rail.
- **Tales hub** — railway archive; state drives composition (parchment
  archive tickets for unlocked, compressed sealed bands, ember rail for
  live pours).
- **Tale detail** — data-driven dossier template: perforated archive
  ticket hero, biography dossier, 60ch story band, grid map, medallion
  timeline (opens at first event, state-driven edge fades, per-Tale
  reset, keyboard scroll region), centered challenge climax.
- **Beers** — premium roster (~31% can column, strict info hierarchy,
  compact one-row CTAs); desktop featured-first composition; residents
  as a quieter inventory ledger.
- **Food** — tavern-menu board (dish rows, dotted leaders, real
  descriptions; price only from real data).
- **Tap Board** — departure board rendered exclusively from genuine live
  pours; absent otherwise (truthful default). Header chip mirrors the
  same truth (NOW POURING vs neutral BEER MENU).
- **Passport** — plaque/stat-rail/stamp-book with the SVG icon system;
  correct stamp grammar.
- **Scan/QR** — brass viewfinder with honest camera/validation states;
  invalid path verified via a safe fake input through the real code path.
- **Unlock certificate** — parchment archive-ticket family, dialog
  semantics preserved.
- **Games** — dialog owns the viewport (background scroll lock, scroll
  restore on Exit, own scroll surface), tablet composition at ≥768px,
  completion centered in a bounded stage; zero logic changes.
- **Signed preview** — loading/failure as centered operational panels
  under the DRAFT PREVIEW banner; fail-closed logic untouched.

## 8. Evidence matrix (operator-reviewed local screenshots)
Screenshots were operator-reviewed local evidence and are NOT repository
artifacts. Tested viewports: 390×844, 430×932, 768×1024, 1440×900.

- Checkpoint 1 set: Home/Tales/Tale-detail/Beers at 390, Home 768/1440,
  Beers 1440 (+ Beer-correction set at 390/430/768/1440 with a
  nav-clearance proof).
- Checkpoint 2 set (01–17): Food 390/768/1440, tap posture, Passport
  seeded/empty/768, Scan entry, unlock certificate, active game 390/768,
  game earned + literal game-complete, preview loading/failure, TapBoard
  live fixture (clearly watermarked), QR-invalid.
- Correction set (18–26): isolated game 390/768, isolated completion
  390/768, Passport no-emoji ×3, real preview loading/failure.
- Finalization set (01–16): header live-fixture/neutral/logo-fallback,
  timeline affordance + initial/mid/end + 768, Passport 1-stamp/2-stamp,
  preview loading/failure, game complete 390/768, Home 1440, Beers 1440.

## 9. Functional-regression matrix
| Invariant | Method | Result |
|---|---|---|
| Hash routing / route names | `App.tsx` zero-diff + navigation exercised in captures | pass |
| QR validation/translation/one-time behavior | `qrValidation*`, `scanSlugTranslation` zero-diff; invalid path exercised with safe fake input | pass |
| localStorage keys | `types.ts` zero-diff (`tb_*`) | pass |
| Tale unlock / Passport progression / badges | services zero-diff; demo unlock + real game playthrough awarded correctly | pass |
| Game rules/scoring/completion | game components + `gameConfigs` zero-diff; Wooden Match played to genuine completion | pass |
| Live-tap truthfulness | header/board render only from `liveTapSlugs`; loading = neutral; live state proven with labeled local fixture | pass |
| Signed-preview fail-closed | `talePreview` zero-diff; delayed local double → loading → fail-closed | pass |
| Scroll lock/restore (games) | probed at 4 widths: lock on, background unscrollable, exit restores exact position | pass |
| No horizontal overflow / nav clearance | probed at 4 widths across routes | pass |

## 10. Accessibility checks
Focus-visible ring global and verified; real buttons/tablist/dialog
semantics; game dialog owns the viewport with background scroll lock;
timeline is a keyboard-focusable scroll region (probe: focus + arrow
scrolling); reduced motion respected (incl. preview indicator);
no emoji/platform pictographs (TsIcon SVG system; full-source sweep —
remaining marks are deliberate monochrome text glyphs); status is never
color-alone; ≥44px primary touch targets. No formal WCAG certification
claimed; screen-reader walkthrough and contrast audit remain residuals.

## 11. Performance posture
Build output: CSS 322.96 kB (53.92 kB gzip), JS 646.39 kB (344.60 kB
gzip). The >500 kB chunk warning is pre-existing (embedded can art +
html5-qrcode; register item). P.28e added ~21 kB CSS and no new runtime
dependencies, textures are CSS/SVG, and no new raster assets ship.

## 12. PWA posture
Manifest branding/icons/installability from P.28 retained; no service
worker (deferred to P.31 to avoid stale Tap List/QR caching); hash
routing preserved.

## 13. Security and data-mutation confirmation
Branch-wide diff review against main confirmed **no change** to:
Supabase clients (`supabaseClient.ts`), SQL/migrations (none exist in
this repo's scope for this gate), Auth, Storage, QR validation
(`qrValidation.ts`, `qrValidationRemote.ts`), QR translation
(`scanSlugTranslation.ts`), QR token handling, localStorage keys,
route names, game answer data (`gameConfigs.ts`), scoring, badge rules,
live-tap fetching (`contentService.ts`), production configuration, or
the GitHub Pages workflow. The only `services/` diff is
`talePresentationPack.ts` swapping four emoji default strings for
semantic TsIcon identifiers; the only `games/` diff is the GameOverlay
scroll-lock/restore effect. No production request or mutation occurred
during verification; no valid QR was consumed; no real preview token
was used.

## 14. Alburtis boundary confirmation
Zero user-facing "Alburtis" text in the branch (the only source match is
a code comment stating the P.30 boundary). No venue imagery is presented
as factual venue photography.

## 15. Operator visual approvals
- Checkpoint 1: approved (after two revision rounds and the focused
  Beer-layout correction).
- Checkpoint 2: approved (after the isolation/emoji/preview-evidence
  correction rounds).
- P.28e.3 finalization: approved (after the timeline correction).

## 16. Known residuals
See the P.28e section of `public-ui-hardening.md`: screen-reader
walkthrough, contrast audit, service worker/offline (P.31), image
optimization + bundle splitting (register), P.29 venue configuration,
P.31 packaging, pre-existing npm audit findings.

## 17. Proposed merge method
Fast-forward-style merge preserving the approved commits (main has not
advanced, so `git merge --ff-only public-p28e-chatgpt-finalization`
lands `4a7aa0e → fb8784a → ea432f9` + the P.28e.4 docs commit onto main
unchanged). No squash; no tag (no existing tag policy in this repo).

## 18. Proposed production smoke test (read-only)
After Pages deploys the merged main: verify deployed title/manifest;
walk Home, Tales hub, one locked + one unlocked Tale (local demo unlock
only), timeline, Beers, Food, Tap Board posture (live or truthfully
absent), Passport empty/seeded (local state), Scan entry, invalid-QR
safe test, unlock certificate via demo mechanism, one active game +
completion, preview loading/failure via safe non-production method only;
at 390/768/1440; keyboard focus, console, overflow. **No production QR
consumption, no mutation.**

## 19. Rollback method
`git revert` of the P.28e merge/commit range on main (or reset main to
`b4a35b4` and force-push per operator preference), which redeploys the
prior build via the Pages workflow. Supabase untouched — this gate
contains no backend change, so no data/schema rollback exists or is
needed.

## 20. Final verdict
The P.28e visual rebuild is complete, operator-approved at every
checkpoint, fully committed on `public-p28e-chatgpt-finalization`, and
verified non-mutating and behavior-preserving. **Awaiting operator
merge/deploy authorization.**
