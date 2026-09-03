import React, { useEffect, useState } from 'react';
import { useApp } from './AppContext';
import { TalePreviewPage } from '../pages/TalePreviewPage';
import { parsePreviewHash, type TalePreviewRequest } from '../services/talePreview';
import { AppHeader } from '../components/AppHeader';
import { BottomNav } from '../components/BottomNav';
import { UnlockStampModal } from '../components/UnlockStampModal';
import { HomePage } from '../pages/HomePage';
import { MenuPage } from '../pages/MenuPage';
import { TalesPage } from '../pages/TalesPage';
import { TaleDetailPage } from '../pages/TaleDetailPage';
import { ScanPage } from '../pages/ScanPage';
import { PassportPage } from '../pages/PassportPage';
import { OurStoryPage, AboutPage, WoodenMatchPage, TracksPage } from '../pages/SecondaryPages';
import { ArcadePage } from '../pages/ArcadePage';
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
  // PUBLIC-v7.4B.P.28g.14 — canonical public hashes with legacy aliases.
  // Inbound: canonical #/ourstory and #/alburtis are accepted alongside
  // the migration-era #/story (exact), #/about, and #/woodenmatch. The
  // aliases resolve to the SAME PageIds, and nav()'s hashMap then
  // replaceState-canonicalizes the visible hash — no extra history
  // entry, no second render. Tale deep links (#/story/<id>) are matched
  // above and are never captured by the exact-'story' alias.
  if (raw.startsWith('ourstory') || raw === 'story') return 'ourstory';
  if (raw.startsWith('about'))                   return 'ourstory';
  if (raw.startsWith('alburtis'))                return 'woodenmatch';
  if (raw.startsWith('woodenmatch'))             return 'woodenmatch';
  if (raw.startsWith('tracks'))                  return 'tracks';
  if (raw.startsWith('arcade'))                  return 'arcade';

  return 'home'; // safe fallback
}

function applyRoute(
  hash: string,
  nav: (p: PageId) => void,
  navToTale: (t: Tale) => void,
  tales: Tale[],
) {
  // Story deep link: #/story/wa-lager  or  #story/wa-lager
  //
  // PUBLIC-v7.4B.P.13b: the deep link NAVIGATES ONLY — it no longer
  // calls unlockTale/awardScanBadge. A shared URL is not proof of a
  // scan; before this change any guessable slug granted a permanent
  // unlock + scan badge, which made server-side QR validation moot.
  // Tales already unlocked on this device render normally; locked
  // Tales render the existing sealed page with its scan CTA.
  const storyMatch = hash.match(/^#\/?story\/([a-z0-9\-]+)/i);
  if (storyMatch) {
    const id = storyMatch[1].toLowerCase();
    const tale = tales.find((t) => t.id === id);
    if (tale) {
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
    case 'arcade':      return <ArcadePage />;
    default:            return <HomePage />;
  }
}

// ── App shell ─────────────────────────────────────────────────────────────────
export function App() {
  const { state, nav, navToTale, tales } = useApp();
  // PUBLIC-v7.4B.P.15c — admin draft preview. A story hash carrying a
  // ?preview=<token> renders the standalone TalePreviewPage INSTEAD of
  // the normal shell; server-side token validation is authoritative.
  // Navigating to any other hash clears preview mode.
  const [preview, setPreview] = useState<TalePreviewRequest | null>(null);

  useEffect(() => {
    const handle = () => {
      const previewRequest = parsePreviewHash(location.hash || '');
      if (previewRequest) {
        setPreview(previewRequest);
        return; // never applyRoute a preview hash — no nav/unlock side effects
      }
      setPreview(null);
      applyRoute(location.hash || '', nav, navToTale, tales);
    };

    handle(); // run once on mount
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run only on mount — nav/navToTale are stable refs from useCallback

  if (preview) {
    return <TalePreviewPage request={preview} />;
  }

  return (
    <div id="app-root">
      <AppHeader />
      <main id="page-container">
        <ActivePage page={state.page} />
      </main>
      <BottomNav />
      {/* UI-v6.5: ceremonial unlock modal — overlays any active page when
          a Tale transitions from locked → unlocked. Renders nothing when
          state.lastUnlocked is null. Routing/badge/QR contracts unchanged. */}
      <UnlockStampModal />
    </div>
  );
}
