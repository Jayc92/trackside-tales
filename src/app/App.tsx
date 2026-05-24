import React, { useEffect } from 'react';
import { useApp } from './AppContext';
import { AppHeader } from '../components/AppHeader';
import { BottomNav } from '../components/BottomNav';
import { HomePage } from '../pages/HomePage';
import { MenuPage } from '../pages/MenuPage';
import { TalesPage } from '../pages/TalesPage';
import { TaleDetailPage } from '../pages/TaleDetailPage';
import { ScanPage } from '../pages/ScanPage';
import { PassportPage } from '../pages/PassportPage';
import { OurStoryPage, AboutPage, WoodenMatchPage, TracksPage } from '../pages/SecondaryPages';
import { PageId, Tale } from './types';

// ── Route parser ─────────────────────────────────────────────────────────────
// Accepts both #/scan and #scan (with or without leading slash).
// Returns null for story deep-links — those are handled separately.
function hashToPage(hash: string): PageId | 'story-deeplink' | null {
  // Normalise: strip leading #, optional leading /
  const raw = hash.replace(/^#\/?/, '').toLowerCase();

  if (!raw || raw === 'home')                    return 'home';
  if (raw === 'menu' || raw.startsWith('beers')) return 'menu';
  if (raw.startsWith('scan'))                    return 'scan';
  if (raw.startsWith('passport') || raw.startsWith('profile')) return 'passport';
  if (raw.startsWith('tales'))                   return 'tales';
  if (raw.startsWith('story/'))                  return 'story-deeplink';
  if (raw.startsWith('ourstory') || raw === 'story') return 'ourstory';
  if (raw.startsWith('about'))                   return 'about';
  if (raw.startsWith('woodenmatch'))             return 'woodenmatch';
  if (raw.startsWith('tracks'))                  return 'tracks';

  return 'home'; // safe fallback
}

function applyRoute(
  hash: string,
  nav: (p: PageId) => void,
  navToTale: (t: Tale) => void,
  tales: Tale[],
  unlockTale: (id: string) => void,
  awardScanBadge: (id: string) => void,
) {
  // Story deep link: #/story/wa-lager  or  #story/wa-lager
  const storyMatch = hash.match(/^#\/?story\/([a-z0-9\-]+)/i);
  if (storyMatch) {
    const id = storyMatch[1].toLowerCase();
    const tale = tales.find((t) => t.id === id);
    if (tale) {
      unlockTale(id);
      awardScanBadge(id);
      navToTale(tale);
      return;
    }
  }

  const page = hashToPage(hash);
  if (page && page !== 'story-deeplink') nav(page);
}

// ── Active-page renderer ──────────────────────────────────────────────────────
// Conditional rendering: only the active page mounts.
// This is the correct React pattern and avoids all CSS show/hide fragility.
function ActivePage({ page }: { page: PageId }) {
  switch (page) {
    case 'home':        return <HomePage />;
    case 'menu':        return <MenuPage />;
    case 'tales':       return <TalesPage />;
    case 'story':       return <TaleDetailPage />;
    case 'scan':        return <ScanPage />;
    case 'passport':    return <PassportPage />;
    case 'ourstory':    return <OurStoryPage />;
    case 'about':       return <AboutPage />;
    case 'woodenmatch': return <WoodenMatchPage />;
    case 'tracks':      return <TracksPage />;
    default:            return <HomePage />;
  }
}

// ── App shell ─────────────────────────────────────────────────────────────────
export function App() {
  const { state, nav, navToTale, tales, unlockTale, awardScanBadge } = useApp();

  useEffect(() => {
    const handle = () =>
      applyRoute(location.hash || '', nav, navToTale, tales, unlockTale, awardScanBadge);

    handle(); // run once on mount
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run only on mount — nav/navToTale are stable refs from useCallback

  return (
    <div id="app-root">
      <AppHeader />
      <main id="page-container">
        <ActivePage page={state.page} />
      </main>
      <BottomNav />
    </div>
  );
}
