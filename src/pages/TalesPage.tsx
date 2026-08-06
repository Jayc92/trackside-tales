import React from 'react';
import { useApp } from '../app/AppContext';
import { Tale } from '../app/types';
import { prodSlugFromAppSlug } from '../services/talePresentationPack';
import {
  IndustrialHero,
  SectionRail,
  StatusPlate,
  SecondaryAction,
} from '../components/public/primitives';

// ================== TALES HUB — the railway archive ==================
// PUBLIC-v7.4B.P.28e (checkpoint-1 revision) — state now drives the
// COMPOSITION, not just a label:
//
//   * UNLOCKED — full archive ticket: parchment stub bleeding into the
//     card, title/beer/tagline, stamp progress, READ CTA.
//   * LIVE pour — the unlocked ticket gains an ember leading rail
//     (real live tap data only, via prodSlugFromAppSlug — P.18/P.19).
//   * SEALED — a compressed single-band entry (lock roundel · title ·
//     year/beer meta · SCAN cta). Visibly a different object, so the
//     archive reads as "collected documents + entries still sealed".
//
// navToTale / nav contracts unchanged — no unlock or routing changes.

function TaleArchiveCard({
  tale,
  stamps,
  onTap,
  onOpen,
}: {
  tale: Tale;
  stamps: number;
  onTap: boolean;
  onOpen: () => void;
}) {
  const meta = [tale.name, tale.style].filter((s) => s && s.trim()).join(' · ');
  return (
    <button
      type="button"
      className={`px-tale-card px-tale-card--open${onTap ? ' px-tale-card--live' : ''}`}
      onClick={onOpen}
      aria-label={`${tale.title.replace('\n', ' ')} — unlocked, read the tale`}
    >
      <span className="px-tale-card__stub" aria-hidden="true">
        <span className="px-tale-card__stub-tag">ARCHIVE</span>
        <span className="px-tale-card__stub-year">{tale.year || '—'}</span>
        <span className="px-tale-card__stub-glyph">✦</span>
      </span>
      <span className="px-tale-card__main">
        <span className="px-tale-card__plates">
          {onTap && <StatusPlate tone="live">ON TAP</StatusPlate>}
          <StatusPlate tone="unlocked">UNLOCKED</StatusPlate>
        </span>
        <span className="px-tale-card__title" role="heading" aria-level={3}>
          {tale.title.replace('\n', ' ')}
        </span>
        {meta && <span className="px-tale-card__beer">{meta}</span>}
        {tale.tagline && tale.tagline.trim() && (
          <span className="px-tale-card__line">{tale.tagline}</span>
        )}
        <span className="px-tale-card__foot">
          <span className="px-tale-card__progress">
            STAMPS <b>{stamps}</b>/2
          </span>
          <span className="px-tale-card__cta">READ THE TALE →</span>
        </span>
      </span>
    </button>
  );
}

function SealedTaleBand({
  tale,
  onTap,
  onOpen,
}: {
  tale: Tale;
  onTap: boolean;
  onOpen: () => void;
}) {
  const meta = [tale.year, tale.name].filter((s) => s && s.trim()).join(' · ');
  return (
    <button
      type="button"
      className="px-tale-sealed"
      onClick={onOpen}
      aria-label={`${tale.title.replace('\n', ' ')} — sealed, scan to unlock`}
    >
      <span className="px-tale-sealed__lock" aria-hidden="true">🔒</span>
      <span className="px-tale-sealed__body">
        <span className="px-tale-sealed__title" role="heading" aria-level={3}>
          {tale.title.replace('\n', ' ')}
        </span>
        <span className="px-tale-sealed__meta">
          {meta}
          {onTap ? ' · ON TAP NOW' : ''}
        </span>
      </span>
      <span className="px-tale-sealed__cta">SCAN TO UNLOCK →</span>
    </button>
  );
}

export function TalesPage() {
  const { state, tales, navToTale, nav, liveTapSlugs } = useApp();

  const unlockedTales = tales.filter((t) => state.unlocked.has(t.id));
  const sealedTales   = tales.filter((t) => !state.unlocked.has(t.id));

  return (
    <div className="page active px-screen" id="page-taleshub">

      <IndustrialHero
        short
        image="assets/tales/tales-trackside-brewing.png"
        eyebrow="Trackside Tales"
        title="THE TALE ARCHIVE"
        sub="Every pour has a route. Every can can unlock a story."
      />

      <div className="px-wrap">
        {unlockedTales.length > 0 && (
          <>
            <SectionRail label="Collected Tales" />
            <div className="px-stack px-tale-grid">
              {unlockedTales.map((tale) => (
                <TaleArchiveCard
                  key={tale.id}
                  tale={tale}
                  stamps={
                    (state.scanBadges.has(tale.id) ? 1 : 0) +
                    (state.gameBadges.has(tale.id) ? 1 : 0)
                  }
                  onTap={liveTapSlugs.has(prodSlugFromAppSlug(tale.id))}
                  onOpen={() => navToTale(tale)}
                />
              ))}
            </div>
          </>
        )}

        {sealedTales.length > 0 && (
          <>
            <SectionRail label="Still Sealed" />
            <div className="px-stack">
              {sealedTales.map((tale) => (
                <SealedTaleBand
                  key={tale.id}
                  tale={tale}
                  onTap={liveTapSlugs.has(prodSlugFromAppSlug(tale.id))}
                  onOpen={() => navToTale(tale)}
                />
              ))}
            </div>
          </>
        )}

        <SectionRail label="More From Trackside" />
        <div className="px-hero__actions" style={{ marginTop: 0, flexWrap: 'wrap' }}>
          <SecondaryAction onClick={() => nav('scan')} ariaLabel="Scan a can">
            ⌗ SCAN A CAN
          </SecondaryAction>
          <SecondaryAction onClick={() => nav('passport')} ariaLabel="View passport">
            ◈ VIEW PASSPORT
          </SecondaryAction>
        </div>
        <div style={{ height: '1.5rem' }} />
      </div>
    </div>
  );
}
