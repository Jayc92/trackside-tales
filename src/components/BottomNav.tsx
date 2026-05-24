import React from 'react';
import { useApp } from '../app/AppContext';
import { PageId } from '../app/types';

// ================== BOTTOM NAV ==================
// Mirrors the golden v4.6.1 bottom-nav: 5 buttons (HOME, TALES, MENU, SCAN, PASSPORT).
// Each button renders nav-btn → nav-btn-icon → img.nav-icon-img + span.nav-icon-fallback.
// The PNG assets at assets/nav/*.png may or may not exist; when an image fails to load
// the fallback glyph is revealed via the same `.show` class the golden uses.
//
// In the React app the "home" surface and the "menu/tap-list" surface share PageId 'menu'
// (URL #/beers), matching how the migration was wired. HOME and MENU therefore both
// navigate to 'menu'; HOME stays highlighted as the default landing tab.

interface NavItem {
  id: PageId;
  domId: string;
  label: string;
  iconSrc: string;
  fallback: string;
  scan?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home',     domId: 'nav-home',     label: 'HOME',     iconSrc: 'assets/nav/nav-home.png',     fallback: '⊞' },
  { id: 'tales',    domId: 'nav-tales',    label: 'TALES',    iconSrc: 'assets/nav/nav-tales.png',    fallback: '⚏' },
  { id: 'menu',     domId: 'nav-beers',    label: 'MENU',     iconSrc: 'assets/nav/nav-menu.png',     fallback: '◫' },
  { id: 'scan',     domId: 'nav-scan',     label: 'SCAN',     iconSrc: 'assets/nav/nav-scan.png',     fallback: '◈', scan: true },
  { id: 'passport', domId: 'nav-passport', label: 'PASSPORT', iconSrc: 'assets/nav/nav-passport.png', fallback: '◉' },
];

export function BottomNav() {
  const { state, nav } = useApp();

  // HOME and MENU are separate surfaces again (v5.0): HOME routes to the
  // restored HomePage at #/home, MENU routes to the tap-list MenuPage at
  // #/beers. Each highlights only on its own PageId.
  const isActive = (item: NavItem): boolean => {
    if (item.domId === 'nav-home')     return state.page === 'home';
    if (item.domId === 'nav-beers')    return state.page === 'menu';
    if (item.domId === 'nav-tales')    return state.page === 'tales';
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
              <img
                src={item.iconSrc}
                alt=""
                className="nav-icon-img"
                onError={(e) => {
                  const img = e.currentTarget;
                  img.style.display = 'none';
                  const fb = img.nextElementSibling as HTMLElement | null;
                  if (fb) fb.classList.add('show');
                }}
              />
              <span className="nav-icon-fallback">{item.fallback}</span>
            </span>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
