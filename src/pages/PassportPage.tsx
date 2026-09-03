import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { LS_HOW_DISMISSED, LS_PASSPORT_PAGE } from '../app/types';
import { TsIcon } from '../components/TsIcon';

// ================== PASSPORT — personal travel document ==================
// PUBLIC-v7.4B.P.28g.7 — presentation/structural refinement of the
// Passport as the payoff surface of the family (Tales = archive, Tale
// Detail = opened dossier, Passport = the guest's own document): a
// travel-document identity head, a derived collection summary, and a
// STAMP LEDGER listing every Tale with its two stamp wells.
//
// All collection logic is preserved: the same useApp() data sources
// (state.unlocked / scanBadges / gameBadges / user / lastEarnedGame)
// and the same handlers (setUser, resetDemo, nav, clearLastEarned).
// Badge keys, unlock semantics, and routes are untouched. The one
// structural change: the previous single-spread stamp BOOK pagination
// (a purely-visual UI layer) is replaced by the full ledger, so the
// LS_PASSPORT_PAGE book-page index is no longer read while browsing
// (reset still clears it). The lastEarnedGame celebration contract is
// kept — arriving with a fresh game badge highlights that Tale's
// ledger entry, then clears the flag exactly as before.

function getPassportId(joined: string | null): string {
  try {
    if (!joined) return 'TS-0007';
    const seed = (new Date(joined).getTime() % 9000) + 1000;
    // P.28g.7 — pre-existing defect fix: the seed input is a guest NAME,
    // so new Date(name) is almost always Invalid Date and the original
    // rendered "TS-0NaN". Non-finite seeds now use the function's own
    // established fallback instead of displaying NaN.
    if (!Number.isFinite(seed)) return 'TS-0001';
    return 'TS-' + String(seed).padStart(4, '0');
  } catch (_) {
    return 'TS-0001';
  }
}

const REWARDS_TARGET = 12; // taproom rewards goal — visual milestone only

/* One stamp well — earned wells carry the seal, empty wells stay open. */
function StampWell({
  label,
  earned,
  icon,
}: {
  label: string;
  earned: boolean;
  icon: string;
}) {
  return (
    <span
      className={`passport-well${earned ? ' passport-well--earned' : ''}`}
      role="img"
      aria-label={`${label} stamp — ${earned ? 'earned' : 'not yet earned'}`}
    >
      <span className="passport-well-ring" aria-hidden="true">
        {earned ? <TsIcon icon={icon} /> : null}
      </span>
      <span className="passport-well-lbl" aria-hidden="true">{label}</span>
    </span>
  );
}

export function PassportPage() {
  const { state, tales, setUser, resetDemo, nav, clearLastEarned } = useApp();

  const nickname = state.user?.name || 'Trackside Guest';
  const initial  = nickname.charAt(0).toUpperCase();
  const passId   = getPassportId(state.user ? state.user.name : null);

  const talesUnlocked = state.unlocked.size;
  const stampsEarned  = state.scanBadges.size;
  const gamesDone     = state.gameBadges.size;
  const completedTales = tales.filter(
    (t) => state.scanBadges.has(t.id) && state.gameBadges.has(t.id),
  ).length;
  const totalStamps   = stampsEarned + gamesDone;          // taproom counter
  const rewardsProgress = Math.min(100, Math.round((totalStamps / REWARDS_TARGET) * 100));

  // ---- Identity inputs ----------------------------------------------------
  const [nicknameInput, setNicknameInput] = useState(
    nickname === 'Trackside Guest' ? '' : nickname,
  );
  // ---- Personalize panel inputs (separate from header save) ---------------
  const [signupName, setSignupName]   = useState(state.user?.name  || '');
  const [signupEmail, setSignupEmail] = useState(state.user?.email || '');

  // ---- lastEarnedGame celebration (contract preserved) ---------------------
  // A fresh game badge highlights that Tale's ledger entry and scrolls it
  // into view, then the flag is cleared exactly as the book version did.
  const [celebrateId, setCelebrateId] = useState<string | null>(null);
  const ledgerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!state.lastEarnedGame) return;
    const id = state.lastEarnedGame;
    if (tales.some((t) => t.id === id)) {
      setCelebrateId(id);
      requestAnimationFrame(() => {
        ledgerRef.current
          ?.querySelector(`[data-tale-entry="${id}"]`)
          ?.scrollIntoView({ block: 'center' });
      });
    }
    clearLastEarned();
  }, [state.lastEarnedGame, tales, clearLastEarned]);

  // ---- Handlers -----------------------------------------------------------
  const handleSaveNickname = () => {
    const value = nicknameInput.trim();
    if (!value) return;
    setUser({ name: value, email: state.user?.email });
  };
  const handleJoin = () => {
    const name = signupName.trim();
    if (!name) return;
    setUser({ name, email: signupEmail.trim() || undefined });
  };
  const handleMaybeLater = () => nav('home');
  const handleReset = () => {
    if (!confirm('Reset Passport? This clears all unlocked Tales and earned Marks.')) return;
    resetDemo();
    try { localStorage.removeItem(LS_HOW_DISMISSED); } catch (_) { /* ignore */ }
    try { localStorage.removeItem(LS_PASSPORT_PAGE); } catch (_) { /* ignore */ }
    setCelebrateId(null);
  };

  return (
    <div className="page active px-screen passport-page" id="page-profile">

      {/* ── Document head — the holder's passport ── */}
      <header className="passport-head">
        <div className="passport-head-frame">
          <span className="passport-eyebrow">Trackside Tales · Travel Document</span>
          <h1 className="passport-title">TRACKSIDE<br />PASSPORT</h1>
          <hr className="passport-rule" aria-hidden="true" />
          <div className="passport-holder">
            <span className="passport-monogram" aria-hidden="true">{initial}</span>
            <span className="passport-holder-id">
              <span className="passport-holder-name">{nickname}</span>
              <span className="passport-holder-role">PREVIEW GUEST · TRACKSIDE TALES</span>
            </span>
            <span className="passport-code">{passId}</span>
          </div>
          <div className="passport-name-row">
            <input
              className="passport-input"
              id="nickname-field"
              type="text"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder="Enter your name…"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNickname(); }}
            />
            <button className="passport-save" onClick={handleSaveNickname} type="button">
              SAVE
            </button>
          </div>
        </div>
      </header>

      <div className="passport-wrap">

        {/* ── Collection summary — derived from current state only ── */}
        <div className="passport-summary" role="status">
          <span className="passport-summary-item">
            <b>{talesUnlocked}</b>/{tales.length} TALES
          </span>
          <span className="passport-summary-tick" aria-hidden="true" />
          <span className="passport-summary-item">
            <b>{stampsEarned}</b> SCAN
          </span>
          <span className="passport-summary-tick" aria-hidden="true" />
          <span className="passport-summary-item">
            <b>{gamesDone}</b> CHALLENGE
          </span>
          <span className="passport-summary-tick" aria-hidden="true" />
          <span className="passport-summary-item">
            <b>{completedTales}</b> COMPLETE
          </span>
        </div>

        {/* ── Stamp ledger — every Tale is a page of the document ── */}
        <section className="passport-block">
          <div className="passport-block-head">
            <span className="passport-heading">Stamp Ledger</span>
            <span className="passport-flow" aria-hidden="true">
              SCAN <span>→</span> CHALLENGE <span>→</span> COMPLETE
            </span>
          </div>

          {talesUnlocked === 0 && (
            <p className="passport-first">
              Your passport is waiting for its first stamp. Scan any
              Trackside Tale can to open a page.
            </p>
          )}

          <div className="passport-ledger" ref={ledgerRef}>
            {tales.map((tale) => {
              const unlocked = state.unlocked.has(tale.id);
              const scan     = state.scanBadges.has(tale.id);
              const game     = state.gameBadges.has(tale.id);
              const complete = scan && game;
              const status = !unlocked
                ? 'Sealed — scan a Trackside can to open this page.'
                : complete
                  ? 'Both stamps earned. This Tale is fully collected.'
                  : scan && !game
                    ? 'Challenge stamp remaining — play the mini-game.'
                    : 'Unlocked. Earn the Scan and Challenge stamps to complete the page.';
              return (
                <article
                  key={tale.id}
                  data-tale-entry={tale.id}
                  className={
                    'passport-record'
                    + (complete ? ' passport-record--complete' : '')
                    + (!unlocked ? ' passport-record--sealed' : '')
                    + (celebrateId === tale.id ? ' passport-record--celebrate' : '')
                  }
                >
                  <div className="passport-record-year" aria-hidden="true">
                    {tale.year || '—'}
                  </div>
                  <div className="passport-record-main">
                    <span className="passport-record-chapter">{tale.chapter}</span>
                    <h3 className="passport-record-title">{tale.name}</h3>
                    <p className="passport-record-status">{status}</p>
                  </div>
                  <div className="passport-record-wells">
                    <StampWell label="SCAN" earned={scan} icon="station-seal" />
                    <StampWell label="CHLG" earned={game} icon="town-seal" />
                  </div>
                  {complete && (
                    <span className="passport-record-collected" aria-label="Fully collected">
                      COLLECTED
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {/* ── Taproom rewards — existing preview program, unexpanded ── */}
        <section className="passport-block">
          <div className="passport-block-head">
            <span className="passport-heading">Taproom Rewards</span>
            <span className="passport-tally">{totalStamps} / {REWARDS_TARGET} STAMPS</span>
          </div>
          <div className="passport-rewards">
            <div className="passport-rewards-headline">
              {totalStamps === 0
                ? 'NO STAMPS YET'
                : `${totalStamps} ${totalStamps === 1 ? 'STAMP' : 'STAMPS'} COLLECTED`}
            </div>
            {/* rewards rail — the same derived milestone, drawn as a route */}
            <div
              className="passport-rewards-rail"
              role="img"
              aria-label={`Rewards progress: ${rewardsProgress} percent`}
            >
              <span className="passport-rewards-rail-fill" style={{ width: `${rewardsProgress}%` }} />
            </div>
            <p className="passport-rewards-copy">
              {totalStamps === 0
                ? 'Unlock a Tale to begin reward progress. Each scan and mini-game adds a stamp toward taproom rewards.'
                : 'Each scan and mini-game adds a stamp toward taproom rewards. Keep collecting to unlock the founders tier.'}
            </p>
            <p className="passport-rewards-foot">
              Collect Tale stamps to move toward taproom rewards.
              Redemption is part of the partnership preview — no live redemption yet.
            </p>
          </div>
        </section>

        {/* ── Core actions ── */}
        <section className="passport-block">
          <div className="passport-block-head">
            <span className="passport-heading">Keep Collecting</span>
          </div>
          <div className="passport-actions">
            <button
              type="button"
              className="passport-action passport-action--primary"
              onClick={() => nav('scan')}
              aria-label="Scan a can"
            >
              ⌗ SCAN A CAN
            </button>
            <button
              type="button"
              className="passport-action"
              onClick={() => nav('tales')}
              aria-label="Browse the Tale archive"
            >
              ◈ THE TALE ARCHIVE
            </button>
            {/* GAME.5 — the Arcade holds this passport's unlocked
                challenges; existing nav contract, no new state. */}
            <button
              type="button"
              className="passport-action"
              onClick={() => nav('arcade')}
              aria-label="View the Trackside Arcade"
            >
              ▶ TRACKSIDE ARCADE
            </button>
          </div>
        </section>

        {/* ── Personalize — same preview identity behavior ── */}
        <section className="passport-block">
          <div className="passport-block-head">
            <span className="passport-heading">Personalize Your Passport</span>
          </div>
          <p className="passport-personalize-copy">
            Enter your name above to customize your Trackside Passport for this preview.
            Full accounts are coming with the live product.
          </p>
          <div className="passport-personalize-inputs">
            <div className="passport-input-wrap">
              <span className="passport-input-icon" aria-hidden="true"><TsIcon icon="guest-profile" /></span>
              <input
                className="passport-input passport-input--with-icon"
                type="text"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="passport-input-wrap">
              <span className="passport-input-icon" aria-hidden="true"><TsIcon icon="post-envelope" /></span>
              <input
                className="passport-input passport-input--with-icon"
                type="email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                placeholder="Email address"
              />
            </div>
          </div>
          <button type="button" className="passport-action passport-action--primary passport-join" onClick={handleJoin}>
            JOIN TRACKSIDE
          </button>
          <button type="button" className="passport-maybe" onClick={handleMaybeLater}>
            Maybe later — keep browsing
          </button>
          <button type="button" className="passport-reset" onClick={handleReset}>
            RESET PREVIEW
          </button>
        </section>

        <div className="passport-foot-space" />
      </div>
    </div>
  );
}
