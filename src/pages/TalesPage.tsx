import React from 'react';
import { useApp } from '../app/AppContext';
import { Tale } from '../app/types';
import { prodSlugFromAppSlug } from '../services/talePresentationPack';
import { TsIcon } from '../components/TsIcon';

// ================== TALES HUB — the railway archive ==================
// PUBLIC-v7.4B.P.28g.5 — presentation polish only. The archive is the
// product heart of the app, so this page is the most product-like of
// the four restored surfaces (Our Story / Tracks / venue / Tales):
//
//   * UNLOCKED — an archive ticket: perforated year stub, title, beer,
//     tagline, two passport punch marks, READ CTA.
//   * LIVE pour — the ticket gains an ember leading rail + ON TAP chip
//     (real live tap data only, via prodSlugFromAppSlug — P.18/P.19).
//   * SEALED — a compressed registry band (lock roundel · title · meta
//     · SCAN cta) so the archive reads as collected documents plus
//     entries still sealed.
//
// navToTale / nav contracts, unlock logic, stamp math, and live-tap
// derivation are unchanged — no routing, data, or state-model changes.

function TaleArchiveTicket({
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
      className={`tales-ticket${onTap ? ' tales-ticket--live' : ''}`}
      onClick={onOpen}
      aria-label={`${tale.title.replace('\n', ' ')} — unlocked, read the tale`}
    >
      <span className="tales-ticket-stub" aria-hidden="true">
        <span className="tales-ticket-stub-tag">Archive</span>
        <span className="tales-ticket-stub-year">{tale.year || '—'}</span>
        <span className="tales-ticket-stub-node" />
      </span>
      <span className="tales-ticket-main">
        <span className="tales-ticket-chips">
          {onTap && (
            <span className="tales-chip tales-chip--live">
              <span className="tales-chip-dot" aria-hidden="true" />
              ON TAP
            </span>
          )}
          <span className="tales-chip tales-chip--unlocked">UNLOCKED</span>
        </span>
        <span className="tales-ticket-title" role="heading" aria-level={3}>
          {tale.title.replace('\n', ' ')}
        </span>
        {meta && <span className="tales-ticket-beer">{meta}</span>}
        {tale.tagline && tale.tagline.trim() && (
          <span className="tales-ticket-line">{tale.tagline}</span>
        )}
        <span className="tales-ticket-foot">
          <span
            className="tales-punches"
            aria-label={`Stamps collected: ${stamps} of 2`}
          >
            <span
              className={`tales-punch${stamps >= 1 ? ' tales-punch--earned' : ''}`}
              aria-hidden="true"
            />
            <span
              className={`tales-punch${stamps >= 2 ? ' tales-punch--earned' : ''}`}
              aria-hidden="true"
            />
            <span className="tales-punches-label">
              STAMPS <b>{stamps}</b>/2
            </span>
          </span>
          <span className="tales-ticket-cta">
            READ THE TALE <span aria-hidden="true">→</span>
          </span>
        </span>
      </span>
    </button>
  );
}

function SealedRegistryBand({
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
      className="tales-sealed"
      onClick={onOpen}
      aria-label={`${tale.title.replace('\n', ' ')} — sealed, scan to unlock`}
    >
      <span className="tales-sealed-lock" aria-hidden="true">
        <TsIcon icon="locked-seal" />
      </span>
      <span className="tales-sealed-body">
        <span className="tales-sealed-title" role="heading" aria-level={3}>
          {tale.title.replace('\n', ' ')}
        </span>
        <span className="tales-sealed-meta">
          {meta}
          {onTap && (
            <span className="tales-sealed-live">
              <span className="tales-chip-dot" aria-hidden="true" />
              ON TAP NOW
            </span>
          )}
        </span>
      </span>
      <span className="tales-sealed-cta">
        SCAN TO UNLOCK <span aria-hidden="true">→</span>
      </span>
    </button>
  );
}

export function TalesPage() {
  const { state, tales, navToTale, nav, liveTapSlugs } = useApp();

  const unlockedTales = tales.filter((t) => state.unlocked.has(t.id));
  const sealedTales   = tales.filter((t) => !state.unlocked.has(t.id));

  return (
    <div className="page active px-screen tales-page" id="page-taleshub">

      {/* ── Hero — the archive index ── */}
      <header className="tales-hero">
        <div className="tales-hero-atmo" aria-hidden="true">
          <img
            src="assets/tales/tales-trackside-brewing.png"
            alt=""
            loading="eager"
            decoding="async"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
        <div className="tales-hero-inner">
          <span className="tales-eyebrow">Trackside Tales</span>
          <h1 className="tales-hero-title">THE TALE<br />ARCHIVE</h1>
          <hr className="tales-rule" aria-hidden="true" />
          <p className="tales-hero-sub">
            Every pour has a route. Every can can unlock a story.
          </p>
          {/* Archive ledger — derived only from real current state. */}
          <div className="tales-ledger" role="status">
            <span className="tales-ledger-item">
              <b>{unlockedTales.length}</b> COLLECTED
            </span>
            <span className="tales-ledger-tick" aria-hidden="true" />
            <span className="tales-ledger-item">
              <b>{sealedTales.length}</b> SEALED
            </span>
            <span className="tales-ledger-tick" aria-hidden="true" />
            <span className="tales-ledger-item">
              <b>{tales.length}</b> ON THE LINE
            </span>
          </div>
        </div>
      </header>

      <div className="tales-wrap">

        {/* ── Collected — the premium archive objects ── */}
        {unlockedTales.length > 0 && (
          <section className="tales-section">
            <div className="tales-section-head">
              <span className="tales-label">Collected Tales</span>
              <span className="tales-count">{unlockedTales.length} IN YOUR ARCHIVE</span>
            </div>
            <div className="tales-ticket-grid">
              {unlockedTales.map((tale) => (
                <TaleArchiveTicket
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
          </section>
        )}

        {/* ── Sealed — the registry of entries still down the line ── */}
        {sealedTales.length > 0 && (
          <section className="tales-section">
            <div className="tales-section-head">
              <span className="tales-label">Still Sealed</span>
              <span className="tales-count">{sealedTales.length} DOWN THE LINE</span>
            </div>
            <div className="tales-sealed-stack">
              {sealedTales.map((tale) => (
                <SealedRegistryBand
                  key={tale.id}
                  tale={tale}
                  onTap={liveTapSlugs.has(prodSlugFromAppSlug(tale.id))}
                  onOpen={() => navToTale(tale)}
                />
              ))}
            </div>
            <p className="tales-helper">
              Scan a Tale beer to break its seal — each story earns two
              passport stamps: one for the scan, one for its challenge.
            </p>
          </section>
        )}

        {/* ── Core product actions ── */}
        <section className="tales-section">
          <div className="tales-section-head">
            <span className="tales-label">Start Collecting</span>
          </div>
          <div className="tales-actions">
            <button
              type="button"
              className="tales-action tales-action--primary"
              onClick={() => nav('scan')}
              aria-label="Scan a can"
            >
              <span className="tales-action-glyph tales-action-glyph--scan" aria-hidden="true" />
              SCAN A CAN
            </button>
            <button
              type="button"
              className="tales-action"
              onClick={() => nav('passport')}
              aria-label="View passport"
            >
              <span className="tales-action-glyph tales-action-glyph--passport" aria-hidden="true" />
              VIEW PASSPORT
            </button>
          </div>
        </section>

        {/* ── Quiet index into the narrative backbone ── */}
        <section className="tales-section tales-section--index">
          <div className="tales-section-head">
            <span className="tales-label">The Story Behind the Archive</span>
          </div>
          <div className="tales-index">
            <button type="button" className="tales-index-link" onClick={() => nav('ourstory')}>
              <span className="tales-index-glyph" aria-hidden="true" />
              <span className="tales-index-title">OUR STORY</span>
              <span className="tales-index-desc">Why the beer is the ticket.</span>
              <span className="tales-index-arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" className="tales-index-link" onClick={() => nav('tracks')}>
              <span className="tales-index-glyph" aria-hidden="true" />
              <span className="tales-index-title">THE TRACKS</span>
              <span className="tales-index-desc">The rail history behind the Tales.</span>
              <span className="tales-index-arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" className="tales-index-link" onClick={() => nav('woodenmatch')}>
              <span className="tales-index-glyph" aria-hidden="true" />
              <span className="tales-index-title">OUR HOME</span>
              <span className="tales-index-desc">Alburtis Tavern, where the stories pour.</span>
              <span className="tales-index-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        <div className="tales-foot-space" />
      </div>
    </div>
  );
}
