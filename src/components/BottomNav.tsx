import React from 'react';
import { useApp } from '../app/AppContext';
import { PageId } from '../app/types';
import { TsIcon } from './TsIcon';

// ================== BOTTOM NAV ==================
// 5 buttons (HOME, TALES, MENU, SCAN, PASSPORT).
//
// GRAPHICS.1B: the nav previously rendered 1.8-2.2MB glossy raster PNGs
// (assets/nav/*.png) at ~24px, styled with bevels/rim-light/metal
// texture — the largest single "AI-generated" tell the visual audit
// found, and the biggest asset weight in the app for icons nobody
// could see the detail of anyway. TsIcon's flat-vector line-art
// library already existed as the error-fallback for these images; it
// is now the PRIMARY nav icon and the raster images are no longer
// referenced from this component. The PNG files themselves are left
// in place on disk (asset cleanup is a separate, later gate).
//
// In the React app the "home" surface and the "menu/tap-list" surface share PageId 'menu'
// (URL #/beers), matching how the migration was wired. HOME and MENU therefore both
// navigate to 'menu'; HOME stays highlighted as the default landing tab.

interface NavItem {
  id: PageId;
  domId: string;
  label: string;
  /** TsIcon name — flat-vector line icon, platform-consistent, never a
      Unicode glyph or raster image. */
  icon: string;
  scan?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home',     domId: 'nav-home',     label: 'HOME',     icon: 'crossed-spikes' },
  { id: 'tales',    domId: 'nav-tales',    label: 'TALES',    icon: 'ticket-punch' },
  { id: 'menu',     domId: 'nav-beers',    label: 'MENU',     icon: 'station-lantern' },
  { id: 'scan',     domId: 'nav-scan',     label: 'SCAN',     icon: 'map-grid', scan: true },
  { id: 'passport', domId: 'nav-passport', label: 'PASSPORT', icon: 'passport-book' },
];

export function BottomNav() {
  const { state, nav } = useApp();

  // HOME and MENU are separate surfaces again (v5.0): HOME routes to the
  // restored HomePage at #/home, MENU routes to the tap-list MenuPage at
  // #/beers. Each highlights only on its own PageId.
  //
  // UI-v6.6 — Tale Detail (page === 'story') is a child of the Tales
  // collection, so the TALES nav item should remain highlighted while the
  // user is reading a Tale. Without this, no nav item lights up on
  // #/story/{id}, which made the bottom nav feel "broken" on detail pages.
  const isActive = (item: NavItem): boolean => {
    if (item.domId === 'nav-home')     return state.page === 'home';
    if (item.domId === 'nav-beers')    return state.page === 'menu';
    if (item.domId === 'nav-tales')    return state.page === 'tales' || state.page === 'story';
    if (item.domId === 'nav-scan')     return state.page === 'scan';
    if (item.domId === 'nav-passport') return state.page === 'passport';
    return false;
  };

  return (
    <div className="bottom-nav">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item);
        return (
          <button
            key={item.domId}
            id={item.domId}
            className={`nav-btn${item.scan ? ' scan' : ''}${active ? ' active' : ''}`}
            onClick={() => nav(item.id)}
            aria-current={active ? 'page' : undefined}
          >
            <span className="nav-btn-icon">
              <TsIcon icon={item.icon} className="gx1-nav-icon" />
            </span>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
