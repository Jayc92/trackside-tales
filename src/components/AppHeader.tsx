import React from 'react';
import { useApp } from '../app/AppContext';

// ================== APP HEADER ==================
// Three-column layout: Now Pouring | Logo | Profile icon
// Structure preserved from v4.6.1.
//
// PUBLIC-v7.4B.P.28a:
//   * The Now Pouring chip and the logo lockup were click-only <div>s —
//     both are now keyboard-operable (role=button + tabIndex + Enter/
//     Space), picking up the global :focus-visible ring from tokens.css.
//   * alt text follows the approved brand hierarchy: the company is
//     "Trackside Brewing" (the "Co."/"Company" wording inside the logo
//     ARTWORK is the approved asset and is allowed to remain).

import { pressable } from './interactive';

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

        {/* Left: live status / menu shortcut */}
        <div className="app-bar-left">
          <div
            className={`live-indicator${hasLivePours ? '' : ' live-indicator--neutral'}`}
            {...pressable(handleNowPouringClick)}
            title={hasLivePours
              ? 'Beers are pouring now — view the live menu'
              : 'View the beer menu'}
            aria-label={hasLivePours
              ? 'Beers are pouring now — view the live menu'
              : 'View the beer menu'}
            style={{ cursor: 'pointer' }}
          >
            {hasLivePours && <span className="live-indicator-dot" />}
            <span>{hasLivePours ? 'NOW POURING' : 'BEER MENU'}</span>
          </div>
        </div>

        {/* Center: Logo */}
        <div
          className="app-bar-center"
          {...pressable(handleLogoClick)}
          aria-label="Trackside Brewing — view Tales"
          style={{ cursor: 'pointer' }}
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
        </div>

        {/* Right: Profile */}
        <div className="app-bar-right">
          <button
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
