# Trackside Tales — Content Admin Guide

**Version:** 4.4  
**Audience:** Trackside operator / venue staff  
**Last updated:** v4.4

---

## 1. Purpose

Trackside Tales is a mobile web app hosted on GitHub Pages. The app shell — the code, design, and navigation — is a static file (`index.html`) that rarely needs to change.

**All content is managed through Supabase**, a hosted database dashboard. This means you can:

- Add or update beers, Tales, food items, rewards, and coming-next teasers through a simple table interface
- Manage QR codes and campaigns without touching any code
- Monitor guest activity and scan analytics
- Push changes that appear in the app immediately — no code deploys needed

The Supabase dashboard is at: **https://supabase.com/dashboard**

---

## 2. Content Tables

These tables drive what guests see in the app.

### `beers`
Every beer served at the venue — both Trackside Tales beers and regular resident taps.

| Field | Purpose |
|---|---|
| `name` | Display name (required) |
| `style` | Beer style (e.g. Lager, Pilsner, Amber Ale) |
| `abv` | Alcohol by volume as a decimal (e.g. `5.2`) |
| `ibu` | IBU number |
| `description` | Tasting notes / short description |
| `category` | `resident` for regular taps, `non_alc` for non-alcoholic options |
| `is_active` | `true` = shows in app. `false` = hidden. |
| `sort_order` | Lower number = appears first in list |
| `slug` | URL-safe identifier (e.g. `wa-lager`) — must be unique |

### `tales`
Each Trackside Tale — a beer tied to a local history story.

| Field | Purpose |
|---|---|
| `slug` | The Tale's unique ID (e.g. `wa-lager`) — must match QR mapping |
| `title` | Story title shown in app |
| `beer_id` | Foreign key linking to `beers.id` |
| `is_active` | `true` = live in the app |
| `sort_order` | Display order on Tales tab |
| `year` | Historical year (display only) |
| `chapter_label` | Era label (e.g. "Iron Horse Era") |

### `food_items`
Food highlights shown on the Beers/Food section.

| Field | Purpose |
|---|---|
| `name` | Item name (required) |
| `description` | Short description |
| `category` | Food grouping (e.g. `featured`, `small_plates`) |
| `is_active` | `true` = visible in app |
| `sort_order` | Display order |

### `reward_tiers`
The passport rewards visible on the Passport tab.

| Field | Purpose |
|---|---|
| `name` | Reward name (e.g. "Conductor's Pin") |
| `stamps_required` | Number of Tale unlocks required |
| `is_live` | `true` = redeemable now; `false` = preview only |
| `sort_order` | Display order |

### `coming_next_tales`
Teaser cards for Tales that are in development or coming soon.

| Field | Purpose |
|---|---|
| `name` | Tale name teaser |
| `teaser` | Short teaser description |
| `status` | e.g. `coming_soon`, `in_development` |
| `sort_order` | Display order |

### `qr_codes`
Maps physical QR tokens to Tales. See Section 9 for the full QR strategy.

| Field | Purpose |
|---|---|
| `code` | The random token (e.g. `ts_demo_WA_7G9KQ4M2V8X1B6R3P0D5`) |
| `tale_slug` | The Tale this code unlocks (must match `tales.slug`) |
| `is_active` | `true` = scannable. `false` = disabled. |
| `campaign_key` | Label for tracking (e.g. `launch-2025`, `demo-v4-3`) |
| `batch_key` | Optional batch/print-run label |
| `valid_from` | Optional: code not active before this date |
| `valid_until` | Optional: code expires after this date |
| `max_uses` | Optional: usage cap |

---

## 3. Interaction Tables

These tables record guest activity automatically. You do not need to edit them manually.

### `guest_profiles`
One row per browser/device. Created automatically when a guest opens the app.

### `guest_unlocks`
One row per guest per Tale unlock. Records how and when each Tale was scanned.

### `guest_badges`
One row per guest per badge earned (scan badge on first unlock, game badge on mini-game completion).

### `guest_scan_events`
Log of every QR scan attempt — resolved, failed, or unknown. Useful for analytics.

---

## 4. How to Add a New Tale

A Tale is a beer with a history story attached. Follow these steps in order.

**Step 1: Add the beer**
1. Open Supabase → Table Editor → `beers`
2. Click **Insert row**
3. Fill in: `name`, `style`, `abv`, `ibu`, `description`, `category` = `resident`, `is_active` = `true`, `sort_order` (pick a number higher than existing rows to put it at the end)
4. Copy the `id` (UUID) of the new row — you'll need it for the Tale

**Step 2: Add the Tale**
1. Open Table Editor → `tales`
2. Click **Insert row**
3. Fill in:
   - `slug`: a unique URL-safe ID (e.g. `iron-furnace-porter`) — **this must match what you'll put in the QR code**
   - `title`: Story title
   - `beer_id`: paste the UUID from the beer you just created
   - `is_active`: `true`
   - `sort_order`: pick a number

**Step 3: Add the QR code**
1. Open Table Editor → `qr_codes`
2. Click **Insert row**
3. Fill in:
   - `code`: a random token (e.g. `ts_live_RANDOM12CHARACTER`)
   - `tale_slug`: the slug you used above (e.g. `iron-furnace-porter`)
   - `is_active`: `true`
   - `campaign_key`: a label to track the print run (e.g. `launch-spring-2025`)

**Step 4: Test**
1. Open the app
2. Go to Scan tab
3. Either scan the physical QR or open the URL:
   `https://jayc92.github.io/trackside-tales/?code=YOUR_TOKEN_HERE`
4. Confirm the Tale unlocks and the Passport stamps

---

## 5. How to Add a Regular Beer (No Tale)

Regular beers appear on the Beers tab but do not have a story or QR code.

1. Open Table Editor → `beers`
2. Click **Insert row**
3. Fill in: `name`, `style`, `abv`, `ibu`, `description`
4. Set `category` = `resident` (or `non_alc` for alcohol-free options)
5. Set `is_active` = `true`
6. Set `sort_order` to control where it appears in the list
7. Open the app and check the Beers tab — the beer should appear immediately

---

## 6. How to Add Food Items

1. Open Table Editor → `food_items`
2. Click **Insert row**
3. Fill in: `name`, `description`
4. Set `category` to group similar items (e.g. `featured`, `small_plates`)
5. Set `is_active` = `true`
6. Set `sort_order`
7. Refresh the app and check the food section on the Beers tab

---

## 7. How to Manage Rewards

Rewards appear on the Passport tab and are tied to earning stamp counts.

1. Open Table Editor → `reward_tiers`
2. To add a new tier: click **Insert row**
   - `name`: reward name
   - `stamps_required`: number of Tale stamps needed to earn it
   - `is_live`: `true` = guests can redeem it now; `false` = it shows as a preview teaser
   - `sort_order`: controls display order
3. To update an existing reward: click the row and edit inline
4. Open the app and check the Passport/Rewards section to confirm it renders

---

## 8. How to Manage Coming-Next Tales

Coming-next teasers appear at the bottom of the Tales tab, hinting at future releases.

1. Open Table Editor → `coming_next_tales`
2. Click **Insert row**
3. Fill in:
   - `name`: teaser name (can be vague, e.g. "The Steel Era")
   - `teaser`: short description
   - `status`: `coming_soon` or `in_development`
   - `sort_order`: display order
4. Refresh the app to confirm the teaser card appears

---

## 9. How QR Codes Should Work

### The core rule
**The QR code printed on a can should be a random token — not a meaningful unlock command.**

❌ **Never use:** `unlock=true` or `tale=wa-lager` — these let anyone forge unlocks  
✅ **Use:** `ts_demo_WA_7G9KQ4M2V8X1B6R3P0D5` — a random token mapped server-side

### QR code formats

**Raw token (printed directly on can):**
```
ts_demo_WA_7G9KQ4M2V8X1B6R3P0D5
```

**URL format (preferred — opens app directly when scanned):**
```
https://jayc92.github.io/trackside-tales/?code=ts_demo_WA_7G9KQ4M2V8X1B6R3P0D5
```

### Demo tokens (v4.3)
| Token | Tale |
|---|---|
| `ts_demo_WA_7G9KQ4M2V8X1B6R3P0D5` | W.A. Lager |
| `ts_demo_PACKER_N4F8Z2Q9L6C1Y7A3T5K0` | Packer Pilsner |
| `ts_demo_WM_AMBER_Q8R2M5T1B6R3P0D5` | Wooden Match Amber |

### Future production tokens
For real cans, use fully random tokens that don't hint at the beer:
```
ts_live_7G9KQ4M2V8X1B6R3P0D5
```

### How validation works (priority order)
1. **Edge Function** (best) — the app calls `supabase/functions/v1/validate-qr` which validates the token server-side and returns only the Tale slug. Must be deployed separately.
2. **Direct Supabase lookup** (fallback) — if the Edge Function isn't deployed, the app queries `qr_codes` directly using the anon key.
3. **Local parsing** (last resort) — matches known slugs from app memory. Used in fully offline scenarios.

---

## 10. Pre-Launch Content Checklist

Run through this before any event, launch, or investor demo:

**Tales**
- [ ] All active Tales have `is_active = true`
- [ ] All active Tales have a matching beer in `beers` with `is_active = true`
- [ ] All active Tales have at least one active QR code in `qr_codes`
- [ ] Tale slugs match exactly between `tales.slug` and `qr_codes.tale_slug`

**Beers**
- [ ] All beers showing on tap have `is_active = true`
- [ ] All beers have `name`, `style`, and `abv` populated
- [ ] Regular resident beers are category = `resident`

**Food**
- [ ] All current menu items have `is_active = true`
- [ ] Sort order reflects desired display order

**Rewards**
- [ ] Reward tiers have `stamps_required` set correctly
- [ ] Live rewards have `is_live = true`

**QR codes**
- [ ] All active QR codes have `tale_slug` populated
- [ ] No active QR codes have `valid_until` in the past
- [ ] Demo URL test passes:
  `https://jayc92.github.io/trackside-tales/?code=ts_demo_WA_7G9KQ4M2V8X1B6R3P0D5`

**Admin checks (run in Supabase SQL Editor)**
```sql
select * from admin_content_overview;
select * from admin_missing_content_checks;
```
`admin_missing_content_checks` returning no rows means all checks passed.

---

## 11. Known Demo Limitations

These are known tradeoffs for the current demo/pilot phase. They will be addressed before full public launch.

| Limitation | Detail |
|---|---|
| **Guest IDs are browser-held** | The `trackside_guest_id` stored in localStorage is not cryptographically authenticated. A guest who clears their browser gets a new ID. |
| **Anon policies are permissive** | The current RLS policies allow any anon key holder to read and insert. This is acceptable for demo but must be tightened before launch. |
| **Edge Function must be deployed** | The secure QR validation Edge Function (`supabase/functions/validate-qr/index.ts`) must be deployed separately using the Supabase CLI before it becomes the active validator. Until then, the app falls back to direct table lookup. |
| **Service role key must stay server-side** | The `SUPABASE_SERVICE_ROLE_KEY` must never appear in `index.html` or any public file. It belongs only in the Edge Function's environment secrets. |
| **No session expiry** | Guest sessions persist indefinitely in localStorage. For a production loyalty program, implement Supabase Auth or time-limited guest sessions. |
| **Reset Preview clears local state only** | The "Reset Preview" button clears localStorage but does not delete Supabase rows. Remote progress will be re-synced on next load. |

---

*For technical questions about the app architecture, see the README and inline code comments in `index.html`.*
