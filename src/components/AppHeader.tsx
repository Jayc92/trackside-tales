import React from 'react';
import { useApp } from '../app/AppContext';
import { TsIcon } from './TsIcon';

// ================== APP HEADER ==================
// Three-column layout: Now Pouring | Logo | Profile icon
// Structure preserved from v4.6.1.
//
// PUBLIC-v7.4B.P.28a:
//   * alt text follows the approved brand hierarchy: the company is
//     "Trackside Brewing" (the "Co."/"Company" wording inside the logo
//     ARTWORK is the approved asset and is allowed to remain).
//
// PUBLIC-v7.4B.P.28g.13 — shared chrome cleanup:
//   * The chip and the logo lockup are real <button>s now (they were
//     click-only <div>s with the pressable() ARIA emulation). Behavior,
//     routing, and appearance are unchanged — a zero-specificity
//     :where() reset in p28e.css neutralizes UA button chrome so the
//     class rules keep rendering pixel-identically.
//   * Visible terminology: the neutral chip reads TAP LIST (was BEER
//     MENU), matching the Menu page's THE TAP LIST identity. The live
//     NOW POURING state is unchanged.
//
// GRAPHICS.3 — header identity prototype (uncommitted): the center
// logo and right profile control no longer render the raster
// trackside-header-logo.png (2.6MB, 1536×1024, shown at ~100-124px)
// or profile-icon.png (2.0MB, 1024×1024, shown at 40×40) — both were
// the last glossy/medallion assets left after GRAPHICS.1B's nav-icon
// pass. HEADER_CONCEPT swaps between the three reviewed replacement
// marks below; it is a review toggle, not a shipped feature flag, and
// is expected to collapse to one branch (or be removed) once the
// operator picks a concept.
type HeaderConcept = 'a' | 'b' | 'c';
const HEADER_CONCEPT: HeaderConcept = 'b';

export function AppHeader() {
  const { state, nav, liveTapSlugs } = useApp();

  const handleLogoClick = () => nav('tales');
  const handleNowPouringClick = () => nav('menu');
  const handleProfileClick = () => nav('passport');

  // PUBLIC-v7.4B.P.28e.3 — the header chip claims NOW POURING only
  // while the live tap list (P.18) reports at least one live pour.
  // liveTapSlugs starts as an empty Set, so the loading posture is the
  // same neutral BEER MENU state — no false live claim ever renders.
  // No fetching happens here; this only reads the existing AppContext
  // live state.
  const hasLivePours = liveTapSlugs.size > 0;

  return (
    <div className="app-bar">
      <div className="app-bar-inner">

        {/* Left: live status / tap-list shortcut */}
        <div className="app-bar-left">
          <button
            type="button"
            className={`live-indicator${hasLivePours ? '' : ' live-indicator--neutral'}`}
            onClick={handleNowPouringClick}
            title={hasLivePours
              ? 'Beers are pouring now — view the live menu'
              : 'View the tap list'}
            aria-label={hasLivePours
              ? 'Beers are pouring now — view the live menu'
              : 'View the tap list'}
          >
            {hasLivePours && <span className="live-indicator-dot" />}
            <span>{hasLivePours ? 'NOW POURING' : 'TAP LIST'}</span>
          </button>
        </div>

        {/* Center: Logo — GRAPHICS.3 header-mark (see HEADER_CONCEPT above) */}
        <button
          type="button"
          className={`app-bar-center header-mark header-mark--${HEADER_CONCEPT}`}
          onClick={handleLogoClick}
          aria-label="Trackside Brewing — view Tales"
        >
          {HEADER_CONCEPT === 'a' && (
            <TsIcon icon="rail-track" className="header-mark-glyph" />
          )}
          {HEADER_CONCEPT === 'b' && (
            <span className="header-mark-mono" aria-hidden="true">TS</span>
          )}
          {HEADER_CONCEPT === 'c' && (
            <TsIcon icon="rail-switch" className="header-mark-glyph" />
          )}
          <span className="header-mark-word">
            <span className="header-mark-title">TRACKSIDE</span>
            <span className="header-mark-sub">BREWING CO.</span>
          </span>
        </button>

        {/* Right: Profile — GRAPHICS.3: bordered plate holding either the
            existing guest-profile line icon or the signed-in initial,
            replacing the raster profile-icon.png medallion. */}
        <div className="app-bar-right">
          <button
            type="button"
            className={`profile-btn${state.user ? '' : ' guest'}`}
            id="profile-btn"
            onClick={handleProfileClick}
            aria-label="Passport"
          >
            <span className="header-profile-mark" aria-hidden="true">
              {state.user
                ? state.user.name?.charAt(0).toUpperCase() || 'G'
                : <TsIcon icon="guest-profile" />}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
}
