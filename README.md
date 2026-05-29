# Trackside Tales — Vite + React + TypeScript Migration

**Source**: `index-v4_6_1-golden.html` (10,803 lines)  
**Target**: Vite 5 + React 18 + TypeScript 5  
**Status**: Phases 1–4 complete (structure, CSS, data, shell)

---

## Quick Start

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # output to dist/
```

Copy `.env.example` → `.env` and fill in Supabase credentials if using remote features.

---

## Admin / back-office

The internal Trackside Tales admin portal now lives in a separate private repo:

`Jayc92/trackside-admin`

The public app and admin app share the same Supabase project. Supabase schema migrations and public-app Edge Functions remain in this repo under:

- `supabase/migrations/`
- `supabase/functions/`

Those files are the shared backend contract between the public app and the private admin app.

The admin app is a private Next.js/Vercel application and does not deploy to GitHub Pages. The public customer app remains the only app built by this repo's GitHub Pages workflow.

---

## Migration Progress

### ✅ Phase 1 — Project Structure
All directories and config files created:
- `vite.config.ts`, `tsconfig.json`, `package.json`
- `src/app/`, `src/components/`, `src/pages/`, `src/games/`, `src/data/`, `src/services/`, `src/styles/`

### ✅ Phase 2 — CSS Extraction
All CSS moved from the `<style>` block into named files:
- `tokens.css` — CSS custom properties (Option B warm charcoal palette)
- `layout.css` — app shell, app bar, pages, bottom nav
- `global.css` — shared component styles
- `home.css`, `tales.css`, `story.css`, `menu.css`
- `scan.css`, `passport.css`, `games.css`, `overlays.css`

### ✅ Phase 3 — Static Data
All data extracted to TypeScript:
- `data/tales.ts` — 3 Tale objects (wa-lager, packer-pils, wooden-match)
- `data/menu.ts` — REGULARS, NON_ALC, FOOD
- `data/canImages.ts` — **placeholder** (see below)

### ✅ Phase 4 — Shared Shell
- `components/AppHeader.tsx` — three-column layout (Now Pouring | Logo | Profile)
- `components/BottomNav.tsx` — fixed bottom nav (Beers, Tales, Scan, Passport)
- `components/TsIcon.tsx` — full inline SVG icon library
- `app/AppContext.tsx` — React context + useReducer for all state
- `app/types.ts` — all shared TypeScript interfaces

### ✅ Phase 5 (partial) — Pages
- `pages/MenuPage.tsx` — beer tap list with Tales/Regulars/NA/Food tabs
- `pages/TalesPage.tsx` — plaque card hub
- `pages/TaleDetailPage.tsx` — full story view + ONE game CTA
- `pages/ScanPage.tsx` — camera scanner + demo dispatch board
- `pages/PassportPage.tsx` — guest profile + stamp collection
- `pages/SecondaryPages.tsx` — **stubs** for OurStory, About, WoodenMatch, Tracks

### ✅ Phase 6 — Game System
- `games/GameOverlay.tsx` — unified modal with PLAYING → QUIZ → SUCCESS/FAIL
- `games/AllenTownGame.tsx` — grid tap game (wa-lager)
- `games/PackerRailGame.tsx` — spike driving game (packer-pils)
- `games/WoodenMatchGame.tsx` — swipe-to-strike game (wooden-match)
- `games/gameConfigs.ts` — per-tale configs + quiz questions

---

## Remaining Work

### Beer Can Images (`data/canImages.ts`)
The base64 WebP images are ~2MB and were not copied here to keep the package small.

**Option A** — Extract from the original HTML and paste into `canImages.ts`:
```bash
node -e "
  const h = require('fs').readFileSync('index-v4_6_1-golden.html','utf8');
  const m = h.match(/const CAN_IMAGES = ({[\s\S]*?});/);
  process.stdout.write('export const CAN_IMAGES = ' + m[1] + ';\n');
" > src/data/canImages-generated.ts
```

**Option B** — Place `.webp` files in `public/assets/` and reference by path:
```ts
WA_LAGER: '/assets/wa-lager-can.webp',
```

### Secondary Pages (Phase 5 remainder)
`SecondaryPages.tsx` has stubs for:
- OurStory (line 6040 in original)
- About (line 6127)
- WoodenMatch & Tracks content pages

Copy HTML content from the original and convert to JSX.

### Seal Images for Unlock Stamp
In `data/canImages.ts`, paste `TS_SEAL_IMAGES` from the original JS
into the `SEAL_IMAGES` export, then import `SEAL_IMAGES` into `GameOverlay.tsx`
and pass to `SealImage` in the unlock receipt overlay.

### Unlock Receipt Overlay (`components/UnlockReceipt.tsx`)
The passport stamp animation (stamp slam-down with sound) is not yet migrated.
See original CSS at `/* ============ PASSPORT STAMP UNLOCK ============ */` 
and JS `showUnlockOverlay()` function.

### Tale Intro Overlay (`components/TaleIntroOverlay.tsx`)
The SVG intro animation per tale. See original CSS line 2411.

### Story Transition Overlay (`components/StoryTransition.tsx`)
The slide-in story transition. See original CSS line 2497.

---

## Architecture Notes

### State Management
`AppContext.tsx` uses `useReducer` — mirrors the original `state` object exactly:
- Same localStorage keys: `tb_user`, `tb_unlocked`, `tb_scan_badges`, `tb_game_badges`, `tb_collected_dates`
- Same badge key format: scan = tale ID, game = `game:<tale-id>`

### Routing
Hash-based, same as original: `#/`, `#/beers`, `#/tales`, `#/story/wa-lager`, etc.

### Game Bug Fixes (v4.6.1) — Preserved
All three game components implement the critical guards:
1. `completedRef` — set synchronously at puzzle completion before calling `onWin()`
2. `winFiredRef` — prevents duplicate win flow
3. `quizShowing` prop — blocks timers from triggering fail state
4. `gameLose` guards against `completed || quizShowing || winFired`

### CSS Active Page
The original used `.page.active` via class toggle. The Vite version uses
`data-active="true"` on each `<div className="page">`, controlled by `state.page`.

---

## File Reference

| Original JS section | Migration target |
|---|---|
| `TS_ICONS` + `renderIcon()` | `src/components/TsIcon.tsx` |
| `TS_SEAL_IMAGES` + `renderSeal()` | `src/data/canImages.ts` (SEAL_IMAGES) |
| `CAN_IMAGES` | `src/data/canImages.ts` |
| `SUPABASE_URL/KEY` | `src/services/supabaseClient.ts` |
| `_LOCAL_TALES` | `src/data/tales.ts` |
| `_LOCAL_REGULARS/NON_ALC/FOOD` | `src/data/menu.ts` |
| `getOrCreateGuestId()` + `save()` | `src/services/guestPersistence.ts` |
| `parseQRCode()` / `lookupQRCodeRemote()` | `src/services/qrValidation.ts` |
| `recordBadgeRemote()` | `src/services/badgeService.ts` |
| `state` + all `dispatch` | `src/app/AppContext.tsx` |
| `nav()` | `useApp().nav()` |
| `renderBeerList()` | `MenuPage.tsx` + `TalesPage.tsx` |
| `renderStory()` | `TaleDetailPage.tsx` |
| `showGame()` + game logic | `GameOverlay.tsx` + game components |
| `applyRoute()` | `App.tsx` `applyHashRoute()` |
