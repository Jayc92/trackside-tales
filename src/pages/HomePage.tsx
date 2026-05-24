import React from 'react';
import { useApp } from '../app/AppContext';
import { PageId } from '../app/types';

// ================== HOME PAGE (== golden #page-menu) ==================
// Restores the original v4.6.1 Home surface: a tappable home-hero image card
// stacked above four home-menu-card navigation tiles (TALES, MENU, STORY,
// PASSPORT). The home-hidden-lists wrapper is kept for structural parity with
// the golden — it has no visual footprint but matches the v4.6.1 DOM.

interface MenuCard {
  navTo: PageId;
  badgeSrc: string;
  badgeAlt: string;
  title: string;
  sub: string;
  fallback: React.ReactNode;
}

// Fallback SVGs are taken verbatim from the golden file so the home-menu-badge
// images degrade exactly the same way when the asset is missing.
const FALLBACK_TALES = (
  <svg className="badge-fallback" viewBox="0 0 28 28" fill="none">
    <path d="M7 9h14M7 13h10M7 17h7" stroke="#C47A36" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const FALLBACK_BEERS = (
  <svg className="badge-fallback" viewBox="0 0 28 28" fill="none">
    <rect x="9" y="8" width="10" height="15" rx="1.5" stroke="#C47A36" strokeWidth="1.5" />
    <path d="M19 11q3 1.5 3 3.5t-3 3.5" stroke="#C47A36" strokeWidth="1.5" fill="none" />
  </svg>
);
const FALLBACK_STORY = (
  <svg className="badge-fallback" viewBox="0 0 28 28" fill="none">
    <line x1="8" y1="10" x2="8" y2="20" stroke="#C47A36" strokeWidth="2" strokeLinecap="round" />
    <line x1="20" y1="10" x2="20" y2="20" stroke="#C47A36" strokeWidth="2" strokeLinecap="round" />
    <line x1="8" y1="12" x2="20" y2="12" stroke="#D89A58" strokeWidth="1.2" />
    <line x1="8" y1="16" x2="20" y2="16" stroke="#D89A58" strokeWidth="1.2" />
  </svg>
);
const FALLBACK_PASSPORT = (
  <svg className="badge-fallback" viewBox="0 0 28 28" fill="none">
    <rect x="7" y="7" width="14" height="17" rx="1.5" stroke="#C47A36" strokeWidth="1.5" />
    <circle cx="11" cy="13" r="1.5" stroke="#D89A58" strokeWidth="1" />
    <circle cx="17" cy="13" r="1.5" stroke="#D89A58" strokeWidth="1" />
  </svg>
);

const MENU_CARDS: MenuCard[] = [
  {
    navTo: 'tales',
    badgeSrc: 'assets/home/home-card-tales.png',
    badgeAlt: 'Tales',
    title: 'TALES',
    sub: 'Stories from the track and beyond.',
    fallback: FALLBACK_TALES,
  },
  {
    navTo: 'menu',
    badgeSrc: 'assets/home/home-card-beers.png',
    badgeAlt: 'Beers',
    title: 'MENU',
    sub: 'Trackside pours, resident beers, N/A, and food.',
    fallback: FALLBACK_BEERS,
  },
  {
    navTo: 'ourstory',
    badgeSrc: 'assets/home/home-card-story.png',
    badgeAlt: 'Story',
    title: 'STORY',
    sub: 'Our history, our founders, our why.',
    fallback: FALLBACK_STORY,
  },
  {
    navTo: 'passport',
    badgeSrc: 'assets/home/home-card-passport.png',
    badgeAlt: 'Passport',
    title: 'PASSPORT',
    sub: 'Collect stamps. Earn rewards.',
    fallback: FALLBACK_PASSPORT,
  },
];

export function HomePage() {
  const { nav } = useApp();

  return (
    <div className="page active" id="page-menu">

      {/* Hero card — single tappable image, mirrors golden home-hero */}
      <div
        className="home-hero"
        onClick={() => nav('tales')}
        style={{ cursor: 'pointer' }}
        role="button"
        aria-label="Explore Tales"
      >
        <div className="home-hero-bolts-bottom">
          <span />
          <span />
        </div>
        <div className="home-hero-train">
          <img
            src="assets/home/home-hero-trackside-tales.png"
            alt="Trackside Tales at The Wooden Match — steam locomotive at golden hour"
            loading="eager"
            decoding="async"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
      </div>

      {/* Navigation stack */}
      <div className="home-menu-stack">
        {MENU_CARDS.map((card) => (
          <div
            key={card.title}
            className="home-menu-card"
            onClick={() => nav(card.navTo)}
            role="button"
            aria-label={card.title}
          >
            <div className="home-menu-badge">
              <img
                src={card.badgeSrc}
                alt={card.badgeAlt}
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              {card.fallback}
            </div>
            <div className="home-menu-body">
              <div className="home-menu-title">{card.title}</div>
              <div className="home-menu-sub">{card.sub}</div>
            </div>
            <div className="home-menu-arrow">›</div>
          </div>
        ))}
      </div>

      <div className="home-footer-space" />

      {/* Hidden lists preserved from golden for parity — no visual output */}
      <div className="home-hidden-lists">
        <div id="tales-list" />
        <div id="food-list-home" />
        <div id="how-it-works" />
        <div id="how-restore" />
        <div id="coming-next-body" />
        <span id="today-date" />
      </div>

    </div>
  );
}
