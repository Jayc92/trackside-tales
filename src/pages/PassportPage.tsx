import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { LS_HOW_DISMISSED, LS_PASSPORT_PAGE } from '../app/types';

// ================== PASSPORT / PROFILE PAGE (v6.1 — Structured Design Pass) ==================
// Visual rewrite to match the v6.0 reference. All app behavior is preserved:
//   • Same useApp() data sources (state.unlocked / scanBadges / gameBadges /
//     collectedDates / user / lastEarnedGame).
//   • Same handlers — setUser, resetDemo, nav, clearLastEarned.
//   • Badge keys, localStorage keys, scan/unlock paths, and routes are
//     untouched.
//   • Book pagination is purely UI (no schema change). It walks the
//     unlocked tales in order and is persisted to LS_PASSPORT_PAGE so
//     reloads return to the page the guest was viewing.

function getPassportId(joined: string | null): string {
  try {
    if (!joined) return 'TS-0007';
    const seed = (new Date(joined).getTime() % 9000) + 1000;
    return 'TS-' + String(seed).padStart(4, '0');
  } catch (_) {
    return 'TS-0001';
  }
}

const REWARDS_TARGET = 12; // taproom rewards goal — visual milestone only

export function PassportPage() {
  const { state, tales, setUser, resetDemo, nav, clearLastEarned } = useApp();

  const nickname = state.user?.name || 'Trackside Guest';
  const initial  = nickname.charAt(0).toUpperCase();
  const passId   = getPassportId(state.user ? state.user.name : null);

  const talesUnlocked = state.unlocked.size;
  const stampsEarned  = state.scanBadges.size;
  const gamesDone     = state.gameBadges.size;
  const totalStamps   = stampsEarned + gamesDone;          // taproom counter
  const rewardsProgress = Math.min(100, Math.round((totalStamps / REWARDS_TARGET) * 100));

  // ---- Identity inputs ----------------------------------------------------
  const [nicknameInput, setNicknameInput] = useState(
    nickname === 'Trackside Guest' ? '' : nickname,
  );
  // ---- Personalize panel inputs (separate from header save) ---------------
  const [signupName, setSignupName]   = useState(state.user?.name  || '');
  const [signupEmail, setSignupEmail] = useState(state.user?.email || '');

  // ---- Stamp book pagination — local UI state only ------------------------
  // The "book" walks the seeded tales array. Locked tales render a sealed
  // page so the book always feels populated. Persisted so reload returns
  // to the same spread.
  const [bookIdx, setBookIdx] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(LS_PASSPORT_PAGE);
      const n   = raw ? parseInt(raw, 10) : 0;
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.min(tales.length - 1, n));
    } catch (_) { return 0; }
  });
  useEffect(() => {
    try { localStorage.setItem(LS_PASSPORT_PAGE, String(bookIdx)); } catch (_) { /* ignore */ }
  }, [bookIdx]);

  // If the celebrated tale just got a badge, advance the book to it once.
  useEffect(() => {
    if (!state.lastEarnedGame) return;
    const idx = tales.findIndex((t) => t.id === state.lastEarnedGame);
    if (idx >= 0) setBookIdx(idx);
    clearLastEarned();
  }, [state.lastEarnedGame, tales, clearLastEarned]);

  const currentTale = tales[bookIdx] || tales[0];
  const currentUnlocked = currentTale ? state.unlocked.has(currentTale.id)    : false;
  const currentScan     = currentTale ? state.scanBadges.has(currentTale.id)  : false;
  const currentGame     = currentTale ? state.gameBadges.has(currentTale.id)  : false;

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
    setBookIdx(0);
  };
  const handlePrev = () => setBookIdx((i) => Math.max(0, i - 1));
  const handleNext = () => setBookIdx((i) => Math.min(tales.length - 1, i + 1));

  // ---- Visual book metadata ----------------------------------------------
  const bookPageNum  = bookIdx + 1;
  const bookPageDisp = `PAGE ${bookPageNum} OF ${tales.length} · TRACKSIDE TALES PASSPORT`;
  const chapterDisp  = currentTale ? `${currentTale.chapter} · ${currentTale.year}` : '';
  const titleDisp    = currentTale ? currentTale.name.toUpperCase() : '';
  const sealInitials = currentTale ? currentTale.abbr : '';

  const noteCopy = useMemo(() => {
    if (!currentUnlocked) return 'Scan a Trackside can to unlock this Tale and start its page.';
    if (currentScan && currentGame) return 'Both stamps earned. This Tale is fully collected.';
    if (currentScan && !currentGame) return 'Story stamp earned. Complete the mini-game to add the second badge.';
    return 'Unlocked. Earn the Discovery and Challenge stamps to complete the page.';
  }, [currentUnlocked, currentScan, currentGame]);

  return (
    <div className="page active ts-passport-screen" id="page-profile">

      {/* ============== 2. GUEST PASSPORT IDENTITY PLAQUE ============== */}
      <section className="ts-id-plaque" aria-label="Guest passport">
        <div className="ts-id-plaque__watermark" aria-hidden="true">
          <span className="ts-id-plaque__watermark-top">TRACKSIDE TALES</span>
          <span className="ts-id-plaque__watermark-bot">PASSPORT</span>
        </div>

        <div className="ts-id-plaque__row-top">
          <span className="ts-id-plaque__eyebrow">GUEST PASSPORT</span>
          <span className="ts-id-plaque__code">{passId}</span>
        </div>

        <div className="ts-id-plaque__body">
          <div className="ts-id-plaque__monogram" aria-hidden="true">{initial}</div>
          <div>
            <h2 className="ts-id-plaque__name">{nickname}</h2>
            <div className="ts-id-plaque__role">PREVIEW GUEST · TRACKSIDE TALES</div>
            <div className="ts-id-plaque__since">Member since preview</div>
          </div>
        </div>

        <div className="ts-id-plaque__stats">
          <div className="ts-id-stat">
            <div className="ts-id-stat__icon" aria-hidden="true">📖</div>
            <div className="ts-id-stat__num">{talesUnlocked}</div>
            <div className="ts-id-stat__lbl">TALES<br/>UNLOCKED</div>
          </div>
          <div className="ts-id-stat">
            <div className="ts-id-stat__icon" aria-hidden="true">⌑</div>
            <div className="ts-id-stat__num">{stampsEarned}</div>
            <div className="ts-id-stat__lbl">STAMPS<br/>EARNED</div>
          </div>
          <div className="ts-id-stat">
            <div className="ts-id-stat__icon" aria-hidden="true">◈</div>
            <div className="ts-id-stat__num">{gamesDone}</div>
            <div className="ts-id-stat__lbl">GAMES<br/>DONE</div>
          </div>
          <div className="ts-id-stat">
            <div className="ts-id-stat__icon" aria-hidden="true">★</div>
            <div className="ts-id-stat__num">{rewardsProgress}<span style={{ fontSize: '0.6em' }}>%</span></div>
            <div className="ts-id-stat__lbl">REWARDS<br/>PROGRESS</div>
          </div>
        </div>

        <div className="ts-id-plaque__name-row">
          <input
            className="ts-input"
            id="nickname-field"
            type="text"
            value={nicknameInput}
            onChange={(e) => setNicknameInput(e.target.value)}
            placeholder="Enter your name…"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNickname(); }}
          />
          <button className="ts-btn--save" onClick={handleSaveNickname} type="button">SAVE</button>
        </div>
      </section>

      {/* ============== 3. TAPROOM REWARDS PANEL ============== */}
      <section className="ts-rewards-panel" aria-label="Taproom rewards">
        <div className="ts-rewards-panel__watermark-l" aria-hidden="true">⌬</div>
        <div className="ts-rewards-panel__watermark-r" aria-hidden="true">
          TRACKSIDE TALES<br/>REWARDS
        </div>

        <div className="ts-rewards-panel__row-top">
          <span className="ts-rewards-panel__eyebrow">TAPROOM REWARDS</span>
          <span className="ts-rewards-panel__count">{totalStamps} / {REWARDS_TARGET} STAMPS</span>
        </div>

        <div className="ts-rewards-panel__center">
          <div className="ts-rewards-panel__headline">
            {totalStamps === 0 ? 'NO STAMPS YET' : `${totalStamps} STAMPS COLLECTED`}
          </div>
          <p className="ts-rewards-panel__copy">
            {totalStamps === 0
              ? 'Unlock a Tale to begin reward progress. Each scan and mini-game adds a stamp toward taproom rewards.'
              : 'Each scan and mini-game adds a stamp toward taproom rewards. Keep collecting to unlock the founders tier.'}
          </p>
          <button type="button" className="ts-rewards-panel__cta" onClick={() => nav('scan')}>
            SCAN A TALE
          </button>
        </div>

        <div className="ts-rewards-panel__foot">
          Collect Tale stamps to move toward taproom rewards.<br/>
          Redemption is part of the partnership preview — no live redemption yet.
        </div>
      </section>

      {/* ============== 4. PASSPORT STAMP BOOK ============== */}
      <header className="ts-stampbook-header">
        <div className="ts-stampbook-header__title">PASSPORT STAMP BOOK</div>
        <div className="ts-stampbook-header__sub">
          Every Tale you unlock marks a page in your Trackside Passport.
        </div>
      </header>

      <div className="ts-book" aria-label="Open passport book">
        <div className="ts-book__page ts-book__page--left">
          <div className="ts-book__meta">{bookPageDisp}</div>
          <div className="ts-book__chapter">{chapterDisp}</div>
          <h3 className="ts-book__title">{titleDisp}</h3>

          <div className="ts-book__seal" aria-hidden="true">
            <span className="ts-book__seal-icon">◈</span>
            <span>{sealInitials}</span>
          </div>

          <div className="ts-book__checks">
            <div className={`ts-book__check${currentScan ? ' ts-book__check--earned' : ''}`}>
              <span className="ts-book__check-dot">{currentScan ? '✓' : ''}</span>
              <span className="ts-book__check-text">
                <span className="ts-book__check-lbl">STORY</span>
                <span className="ts-book__check-state">{currentScan ? 'Complete' : 'Incomplete'}</span>
              </span>
            </div>
            <div className={`ts-book__check${currentGame ? ' ts-book__check--earned' : ''}`}>
              <span className="ts-book__check-dot">{currentGame ? '✓' : ''}</span>
              <span className="ts-book__check-text">
                <span className="ts-book__check-lbl">MINI-GAME</span>
                <span className="ts-book__check-state">{currentGame ? 'Complete' : 'Incomplete'}</span>
              </span>
            </div>
          </div>

          <div className="ts-book__note">{noteCopy}</div>
        </div>

        <div className="ts-book__binding" aria-hidden="true">
          <span className="ts-book__ring" />
          <span className="ts-book__ring" />
          <span className="ts-book__ring" />
          <span className="ts-book__ring" />
          <span className="ts-book__ring" />
        </div>

        <div className="ts-book__page ts-book__page--right">
          <div className="ts-book__compass" aria-hidden="true">
            <div className="ts-book__compass-circle">
              <span className="ts-book__compass-star">✦</span>
            </div>
          </div>
        </div>
      </div>

      {/* ============== 5. BOOK NAVIGATION ROW ============== */}
      <nav className="ts-book-nav" aria-label="Stamp book navigation">
        <button
          type="button"
          className="ts-book-nav__btn"
          onClick={handlePrev}
          disabled={bookIdx === 0}
        >
          ← PREV
        </button>
        <div className="ts-book-nav__center">
          <div className="ts-book-nav__dots" role="tablist">
            {tales.map((t, i) => (
              <span
                key={t.id}
                className={`ts-book-nav__dot${i === bookIdx ? ' ts-book-nav__dot--active' : ''}`}
                role="tab"
                aria-selected={i === bookIdx}
                aria-label={`Page ${i + 1}`}
              />
            ))}
          </div>
          <span className="ts-book-nav__hint">swipe or tap to flip</span>
        </div>
        <button
          type="button"
          className="ts-book-nav__btn"
          onClick={handleNext}
          disabled={bookIdx >= tales.length - 1}
        >
          NEXT →
        </button>
      </nav>

      {/* ============== 6. PERSONALIZE YOUR PASSPORT ============== */}
      <section className="ts-personalize" aria-label="Personalize your passport">
        <div className="ts-personalize__title">PERSONALIZE YOUR PASSPORT</div>
        <p className="ts-personalize__copy">
          Enter your name above to customize your Trackside Passport for this preview.
          Full accounts are coming with the live product.
        </p>

        <div className="ts-personalize__inputs">
          <div className="ts-input-wrap">
            <span className="ts-input-wrap__icon" aria-hidden="true">👤</span>
            <input
              className="ts-input ts-input--with-icon"
              type="text"
              value={signupName}
              onChange={(e) => setSignupName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="ts-input-wrap">
            <span className="ts-input-wrap__icon" aria-hidden="true">✉</span>
            <input
              className="ts-input ts-input--with-icon"
              type="email"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              placeholder="Email address"
            />
          </div>
        </div>

        <button type="button" className="ts-personalize__cta" onClick={handleJoin}>
          JOIN TRACKSIDE
        </button>

        <button type="button" className="ts-personalize__maybe" onClick={handleMaybeLater}>
          Maybe later — keep browsing
        </button>

        <button type="button" className="ts-personalize__reset" onClick={handleReset}>
          ↻ RESET PREVIEW
        </button>
      </section>

    </div>
  );
}
