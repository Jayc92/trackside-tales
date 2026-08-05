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
  const { state, nav } = useApp();

  const handleLogoClick = () => nav('tales');
  const handleNowPouringClick = () => nav('menu');
  const handleProfileClick = () => nav('passport');

  return (
    <div className="app-bar">
      <div className="app-bar-inner">

        {/* Left: Now Pouring */}
        <div className="app-bar-left">
          <div
            className="live-indicator"
            {...pressable(handleNowPouringClick)}
            title="Now pouring — view the menu"
            aria-label="Now pouring — view the menu"
            style={{ cursor: 'pointer' }}
          >
            <span className="live-indicator-dot" />
            <span>NOW POURING</span>
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
          <div className="header-logo-text" aria-hidden="true" style={{ display: 'none' }}>
            <div className="logo-main">TRACKSIDE</div>
            <div className="logo-sub">at <span>THE WOODEN MATCH</span></div>
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
