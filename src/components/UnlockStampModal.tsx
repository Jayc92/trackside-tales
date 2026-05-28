import React, { useEffect, useMemo } from 'react';
import { useApp } from '../app/AppContext';
import { Tale } from '../app/types';

// ================== UNLOCK STAMP MODAL (UI-v6.5) ==================
// Ceremonial parchment-certificate overlay surfaced exactly once
// per locked → unlocked transition (driven by state.lastUnlocked,
// a transient signal — never persisted, never affects badge keys
// or localStorage).
//
// Hard constraints honored:
//   • Does not change unlockTale / awardScanBadge / navToTale logic.
//   • Does not change badge keys, localStorage keys, QR validation,
//     or routing — pure visual layer.
//   • Mounts at the App root so it overlays any active page.
//   • CTAs route through existing nav helpers.
//   • Cleared via clearLastUnlocked() so re-visiting an already
//     unlocked Tale never re-triggers the modal.

// ---- Helper: format current ISO date as MMMM D, YYYY (uppercase) ---
function formatStampDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ---- Helper: derive a deterministic "serial number" for visual flair --
// Stable per tale id; never used as a badge key or persisted value.
function deriveSerial(taleId: string): string {
  let hash = 0;
  for (let i = 0; i < taleId.length; i++) {
    hash = (hash * 31 + taleId.charCodeAt(i)) >>> 0;
  }
  const num = (hash % 999) + 1; // 001..999
  return `NO. ${String(num).padStart(6, '0')}`;
}

// ---- Helper: pick a per-tale emblem glyph (decorative only) ---------
function emblemGlyphFor(taleId: string): string {
  switch (taleId) {
    case 'wa-lager':     return '⌬';
    case 'packer-pils':  return '⚒';
    case 'wooden-match': return '⌥';
    default:             return '◈';
  }
}

// ---- Helper: pick a per-tale location label ------------------------
function locationFor(tale: Tale): string {
  if (tale.id === 'wa-lager')     return 'TROUT HALL · ALLENTOWN, PA';
  if (tale.id === 'packer-pils')  return 'LEHIGH UNIVERSITY · BETHLEHEM, PA';
  if (tale.id === 'wooden-match') return 'THE WOODEN MATCH · BETHLEHEM, PA';
  return 'LEHIGH VALLEY, PA';
}

// ---- Helper: short stamp label (top arc) — falls back gracefully ---
function stampTopArc(): string {
  return '★ TRACKSIDE TALES ★';
}
function stampBottomArc(date: string): string {
  return `· ${date} ·`;
}

// ---- Stamp seal (pure presentational) ------------------------------
function StampSeal({ tale, date }: { tale: Tale; date: string }) {
  const top = stampTopArc();
  const bot = stampBottomArc(date);
  const beerLabel = (tale.abbr || tale.name).toUpperCase();
  return (
    <div className="ts-unlock-stamp" aria-hidden="true">
      <div className="ts-unlock-stamp__rays" />
      <div className="ts-unlock-stamp__glow" />
      <div className="ts-unlock-stamp__seal">
        {/* Curved top + bottom arc text via SVG */}
        <svg className="ts-unlock-stamp__arc" viewBox="0 0 168 168">
          <defs>
            <path id="ts-arc-top" d="M 18,84 A 66,66 0 0 1 150,84" />
            <path id="ts-arc-bot" d="M 22,90 A 62,62 0 0 0 146,90" />
          </defs>
          <text>
            <textPath href="#ts-arc-top" startOffset="50%" textAnchor="middle">{top}</textPath>
          </text>
          <text>
            <textPath href="#ts-arc-bot" startOffset="50%" textAnchor="middle">{bot}</textPath>
          </text>
        </svg>
        {/* Inner emblem */}
        <div className="ts-unlock-stamp__emblem">
          <span className="ts-unlock-stamp__emblem-glyph" aria-hidden="true">
            {emblemGlyphFor(tale.id)}
          </span>
          <span className="ts-unlock-stamp__emblem-tag">{beerLabel}</span>
        </div>
      </div>
    </div>
  );
}

// ---- Unlock certificate (parchment card body) ----------------------
interface UnlockCertificateProps {
  tale: Tale;
  isFirstStamp: boolean;
  hasGameBadge: boolean;
  date: string;
  serial: string;
}
function UnlockCertificate({ tale, isFirstStamp, hasGameBadge, date, serial }: UnlockCertificateProps) {
  const personName = tale.person?.name || tale.name;
  const chapter    = tale.chapter || 'TRACKSIDE TALE';
  const beerLabel  = (tale.abbr ? `${tale.abbr} · ` : '') + tale.name.toUpperCase();
  const location   = locationFor(tale);
  // Body copy shifts subtly for the very first stamp.
  const ordinal = isFirstStamp ? 'first' : 'newest';

  return (
    <div className="ts-unlock-cert" role="document">
      {/* Ticket-style notches */}
      <span className="ts-unlock-cert__notch ts-unlock-cert__notch--tl" aria-hidden="true" />
      <span className="ts-unlock-cert__notch ts-unlock-cert__notch--tr" aria-hidden="true" />
      <span className="ts-unlock-cert__notch ts-unlock-cert__notch--ml" aria-hidden="true" />
      <span className="ts-unlock-cert__notch ts-unlock-cert__notch--mr" aria-hidden="true" />
      <span className="ts-unlock-cert__notch ts-unlock-cert__notch--bl" aria-hidden="true" />
      <span className="ts-unlock-cert__notch ts-unlock-cert__notch--br" aria-hidden="true" />

      {/* Vertical side rail labels */}
      <span className="ts-unlock-cert__rail ts-unlock-cert__rail--left" aria-hidden="true">
        {location.split(' · ').slice(-1)[0]}
      </span>
      <span className="ts-unlock-cert__rail ts-unlock-cert__rail--right" aria-hidden="true">
        {beerLabel}
      </span>

      {/* Decorative serial + watermark */}
      <span className="ts-unlock-cert__serial" aria-hidden="true">{serial}</span>
      <div className="ts-unlock-cert__watermark" aria-hidden="true">
        <span>TT</span>
        TRACKSIDE
      </div>

      {/* Inner content */}
      <div className="ts-unlock-cert__inner">
        <div className="ts-unlock-cert__eyebrow">
          <span className="ts-unlock-cert__eyebrow-star" aria-hidden="true">★</span>
          PASSPORT STAMP EARNED
          <span className="ts-unlock-cert__eyebrow-star" aria-hidden="true">★</span>
        </div>

        <StampSeal tale={tale} date={date} />

        <h2 className="ts-unlock-cert__headline">TALE UNLOCKED</h2>

        <div className="ts-unlock-cert__rule" aria-hidden="true">
          <span className="ts-unlock-cert__rule-glyph">✦</span>
        </div>

        <div className="ts-unlock-cert__person">{personName}</div>
        <div className="ts-unlock-cert__chapter">{chapter}</div>

        <div className="ts-unlock-cert__metarow">
          <span>{date}</span>
          <span>{location}</span>
        </div>

        <p className="ts-unlock-cert__body">
          You've unlocked a piece of our history.
          <br />
          Your <em>{ordinal}</em> passport stamp has been added.
        </p>

        {!hasGameBadge && (
          <>
            <div className="ts-unlock-cert__divider" aria-hidden="true">
              <span>★</span>
            </div>
            <div className="ts-unlock-cert__minigame">
              <span className="ts-unlock-cert__minigame-icon" aria-hidden="true">▦</span>
              <span className="ts-unlock-cert__minigame-text">
                The mini-game is still waiting.
                <br />
                Play it now to earn your <strong>second badge.</strong>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Action stack --------------------------------------------------
interface UnlockActionsProps {
  onViewTale: () => void;
  onViewPassport: () => void;
  onKeepScanning: () => void;
}
function UnlockActions({ onViewTale, onViewPassport, onKeepScanning }: UnlockActionsProps) {
  return (
    <>
      <div className="ts-unlock-actions">
        <button
          type="button"
          className="ts-unlock-action ts-unlock-action--primary"
          onClick={onViewTale}
        >
          <span className="ts-unlock-action__icon" aria-hidden="true">⊕</span>
          <span>VIEW TALE</span>
          <span className="ts-unlock-action__caret" aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className="ts-unlock-action ts-unlock-action--secondary"
          onClick={onViewPassport}
        >
          <span className="ts-unlock-action__icon" aria-hidden="true">▦</span>
          <span>VIEW PASSPORT</span>
          <span className="ts-unlock-action__caret" aria-hidden="true">›</span>
        </button>
      </div>
      <button
        type="button"
        className="ts-unlock-quiet"
        onClick={onKeepScanning}
      >
        KEEP SCANNING
      </button>
    </>
  );
}

// ================== ROOT ==================
export function UnlockStampModal() {
  const {
    state,
    tales,
    nav,
    navToTale,
    clearLastUnlocked,
  } = useApp();

  const taleId = state.lastUnlocked;
  const tale = useMemo<Tale | null>(
    () => (taleId ? tales.find((t) => t.id === taleId) || null : null),
    [taleId, tales],
  );

  // Lock background scroll while the ceremonial moment is active.
  useEffect(() => {
    if (!tale) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [tale]);

  // ESC closes (returns user to wherever they were before the unlock).
  useEffect(() => {
    if (!tale) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearLastUnlocked();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [tale, clearLastUnlocked]);

  if (!tale || !taleId) return null;

  const date = formatStampDate(state.collectedDates[taleId]);
  const serial = deriveSerial(taleId);
  const isFirstStamp = state.unlocked.size <= 1;
  const hasGameBadge = state.gameBadges.has(taleId);

  const handleViewTale = () => {
    clearLastUnlocked();
    navToTale(tale);
  };
  const handleViewPassport = () => {
    clearLastUnlocked();
    nav('passport');
  };
  const handleKeepScanning = () => {
    clearLastUnlocked();
    // Preserve current behavior: returning to Scan is the natural "keep
    // scanning" path. If the user was already on Scan, this is a no-op
    // because nav('scan') just dispatches NAV with the same page.
    nav('scan');
  };

  return (
    <div
      className="ts-unlock-screen"
      role="dialog"
      aria-modal="true"
      aria-label="Tale unlocked"
    >
      <button
        type="button"
        className="ts-unlock-screen__close"
        onClick={clearLastUnlocked}
        aria-label="Close"
      >
        ✕
      </button>
      <div className="ts-unlock-screen__scroll">
        <UnlockCertificate
          tale={tale}
          isFirstStamp={isFirstStamp}
          hasGameBadge={hasGameBadge}
          date={date}
          serial={serial}
        />
        <UnlockActions
          onViewTale={handleViewTale}
          onViewPassport={handleViewPassport}
          onKeepScanning={handleKeepScanning}
        />
      </div>
    </div>
  );
}
