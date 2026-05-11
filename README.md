# Trackside Tales at The Wooden Match

A mobile-first guest-facing taproom app concept for Trackside Brewing Co., built for a partnership preview at **The Wooden Match** — an 1868 Central Railroad of New Jersey station building in Bethlehem, PA.

---

## Overview

Trackside Tales turns a taproom visit into something worth remembering. Guests scan QR codes on Trackside beer cans to unlock local rail and regional history stories, earn passport stamps, collect digital badges, and play short mini-games tied to each tale.

The app is built around three ideas:

- **Beer with a reason.** Every Trackside beer is tied to a real person, place, or moment from the Lehigh Valley's past.
- **History you can hold.** Guests earn a Trackside Passport — a digital record of the stories they've collected.
- **The place matters.** The Wooden Match building was part of the rail system this app is built around. The experience is designed to feel like it belongs there.

---

## Current Preview

This version is tailored specifically to The Wooden Match as a partnership preview. It includes three Trackside Tales (W.A. Lager, Packer Pilsner, The Wooden Match Amber Ale), the resident beer and non-alcoholic menu, Wooden Match food highlights, and a full demo scan flow.

---

## Best Viewed On Mobile

This app is designed like a native mobile application. Open it on a phone for the intended experience. It can be added to an iPhone or Android home screen via the browser's Share → Add to Home Screen option.

---

## Demo Flow

1. Open the app
2. Tap **SCAN** in the bottom nav
3. Choose a preview scan option (W.A. Lager, Packer Pilsner, or The Wooden Match Amber Ale)
4. Watch the passport stamp animation and unlock the Trackside Tale
5. Read the story and explore the historical map
6. Tap **PLAY MINI-GAME** to earn the second badge
7. Check **PROFILE** to see your passport and badge collection

---

## Features Included

- **Trackside Tales beer cards** with scan-to-unlock flow and story pages
- **Resident beer and non-alcoholic sections** with ABV, IBU, and style details
- **Wooden Match food highlights** (Other Side Of The Pillow, CNJ Railyard, Broad Street Bully, Burger Flight)
- **Demo scan mode** for in-person walkthroughs without a physical can
- **Passport stamp animation** with sound and haptic feedback
- **Three mini-games** — Allentown Grid, Drive the Rail Spikes, Strike the Match
- **Profile, Passport, and Rewards** with persistent local state
- **Collectibles grid** and badge collection system
- **Reset Preview button** for clean demo restarts
- **Feedback mailto link** pre-filled with structured questions
- **Mobile web app metadata** (Add to Home Screen, theme color, PWA-ready)
- **Open Graph and Twitter Card metadata** for social link previews

---

## Current Status

This is a front-end prototype running entirely in the browser using local storage. There is no backend, no server, no database, and no user accounts. All state — unlocked tales, earned badges, profile info — lives in the browser's localStorage on the device.

The app is intentionally built as a single HTML file to keep deployment simple and the demo shareable via a direct link.

---

## Future Roadmap

- **Real QR code validation** tied to physical Trackside cans
- **Guest accounts** with cross-device passport sync
- **Admin beer and story manager** for non-technical venue staff
- **Live tap list integration** (what's currently pouring)
- **Real rewards redemption** (verified at the bar, not just tracked in-app)
- **Analytics dashboard** for scan rates, story completion, mini-game engagement
- **Multi-venue support** for Trackside expansion locations

---

## Social Preview Image

Place a **1200×630 PNG** at `assets/preview.png` for social link previews (Slack, iMessage, Twitter, LinkedIn, etc.).

Suggested content:
- Dark Trackside atmosphere (coal `#0c0a07` background)
- Title: **Trackside Tales at The Wooden Match**
- Subtitle: **Beer · Rail History · Passport Stamps**
- App interface mockup or passport stamp visual
- Brass and ember accent colors (`#a07808`, `#c04e18`)
- Subtle rail texture or track detail

After placing the image, the `og:` and `twitter:` meta tags in `index.html` are already pointed at the correct URL.

---

## Repo Structure

```
trackside-tales/
├── index.html                ← the full app (single file)
├── README.md                 ← this file
└── assets/
    ├── preview.png           ← 1200×630 social preview image
    ├── apple-touch-icon.png  ← 180×180 PNG for iOS home screen (optional)
    └── favicon.svg           ← standalone SVG favicon (optional)
```

The favicon and Apple touch icon are currently embedded as inline SVG data URIs in `index.html`. External files in `assets/` can replace them at any time by updating the `<link>` tags in the `<head>`.

---

## Deploying to GitHub Pages

1. Create a GitHub repository named `trackside-tales`
2. Push `index.html`, `README.md`, and the `assets/` folder
3. Go to **Settings → Pages → Deploy from branch → main**
4. Metadata is already set — no further edits needed
5. Share the link: `https://Jayc92.github.io/trackside-tales/`

---

## Contact

**Joe Carfagno**  
Trackside Brewing Co.  
[carfagno.joey@yahoo.com](mailto:carfagno.joey@yahoo.com)  
[tracksidebrew.com](https://tracksidebrew.com)
