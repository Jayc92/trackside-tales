import React from 'react';
import { useApp } from '../app/AppContext';

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

        {/* Center: Logo */}
        <button
          type="button"
          className="app-bar-center"
          onClick={handleLogoClick}
          aria-label="Trackside Brewing — view Tales"
        >
          <img
            src="assets/brand/trackside-header-logo.png"
            alt="Trackside Brewing"
            className="header-logo-img"
            onError={(e) => {
              const img = e.currentTarget;
              img.style.display = 'none';
              const next = img.nextElementSibling as HTMLElement | null;
              if (next) next.style.display = 'flex';
            }}
          />
          {/* P.28e.3 — fallback follows the approved company hierarchy:
              the company wordmark, never the venue. */}
          <div className="header-logo-text" aria-hidden="true" style={{ display: 'none' }}>
            <div className="logo-main">TRACKSIDE</div>
            <div className="logo-sub"><span>BREWING</span></div>
          </div>
        </button>

        {/* Right: Profile */}
        <div className="app-bar-right">
          <button
            type="button"
            className={`profile-btn${state.user ? '' : ' guest'}`}
            id="profile-btn"
            onClick={handleProfileClick}
            aria-label="Passport"
          >
            <img
              src="assets/brand/profile-icon.png"
              alt=""
              className="profile-icon-img"
              onError={(e) => {
                const img = e.currentTarget;
                img.style.display = 'none';
                const next = img.nextElementSibling as HTMLElement | null;
                if (next) next.style.display = 'flex';
              }}
            />
            <span
              id="avatar-initial"
              style={{ display: state.user ? 'flex' : 'none' }}
            >
              {state.user?.name?.charAt(0).toUpperCase() || 'G'}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
}
