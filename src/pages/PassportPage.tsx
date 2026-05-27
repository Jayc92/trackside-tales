import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { TsIcon } from '../components/TsIcon';
import { formatDate } from '../services/badgeService';
import { LS_HOW_DISMISSED } from '../app/types';

// ================== PASSPORT / PROFILE PAGE (== golden #page-profile) ==================
// v5.3 — Reward Hub Polish
//   The Passport is now the emotional payoff center of the app. Every Tale
//   gets a two-mark plaque (Discovery Mark + Challenge Badge), a
//   "Founders Progress" meter sits between the ID card and the stamp book,
//   and a transient "newly earned" highlight pulses on the entry the
//   guest just completed. The newly-earned signal is a session-only flag
//   on app state — it lights up the entry, scrolls it into view, and
//   clears itself after a beat so the next visit reads fresh.
//
//   No badge keys, localStorage keys, scan/unlock paths, or game logic
//   were changed. The new state field (lastEarnedGame) is intentionally
//   not persisted — it only fires once, in-session, after a successful
//   game completion.

function getPassportId(joined: string | null): string {
  try {
    if (!joined) return 'TS-0007';
    const seed = (new Date(joined).getTime() % 9000) + 1000;
    return 'TS-' + String(seed).padStart(4, '0');
  } catch (_) {
    return 'TS-0001';
  }
}

// Founders Tier ladder — the totals at which each tier unlocks. Marks
// here means total marks (scan + game) across all Tales. With 3 seeded
// Tales the ladder maxes at 6 marks (3 scan + 3 game). The ladder is
// future-proofed: when more tales ship, the same tier thresholds extend.
const TIERS = [
  { tier: 0, label: 'PREVIEW',   marks: 0 },
  { tier: 1, label: 'EXPLORER',  marks: 2 },
  { tier: 2, label: 'COLLECTOR', marks: 4 },
  { tier: 3, label: 'FOUNDERS',  marks: 6 },
];

function tierFor(marks: number): { current: typeof TIERS[number]; next: typeof TIERS[number] | null } {
  let current = TIERS[0];
  for (const t of TIERS) {
    if (marks >= t.marks) current = t;
  }
  const next = TIERS.find((t) => t.marks > current.marks) || null;
  return { current, next };
}

export function PassportPage() {
  const { state, tales, setUser, resetDemo, nav, clearLastEarned } = useApp();

  const nickname = state.user?.name || 'Trackside Guest';
  const initial  = nickname.charAt(0).toUpperCase();
  const passId   = getPassportId(state.user ? state.user.name : null);

  const stories       = state.unlocked.size;
  const scanCount     = state.scanBadges.size;
  const gameCount     = state.gameBadges.size;
  const totalMarks    = scanCount + gameCount;
  const totalPossible = tales.length * 2;
  const fullyComplete = tales.filter((t) => state.scanBadges.has(t.id) && state.gameBadges.has(t.id)).length;
  const { current: currentTier, next: nextTier } = tierFor(totalMarks);
  const tierProgressPct = nextTier
    ? Math.min(100, Math.round(((totalMarks - currentTier.marks) / (nextTier.marks - currentTier.marks)) * 100))
    : 100;

  const [nicknameInput, setNicknameInput] = useState(
    nickname === 'Trackside Guest' ? '' : nickname,
  );

  // Newly-earned celebration. Capture the id once on mount (or whenever
  // it changes), then auto-clear from app state so a future visit shows
  // a calm Passport. Local mirror keeps the highlight on screen for a
  // beat after clearing the global signal.
  const [celebrateId, setCelebrateId] = useState<string | null>(state.lastEarnedGame);
  const celebrateRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (state.lastEarnedGame) {
      setCelebrateId(state.lastEarnedGame);
      // Clear the global signal immediately so other surfaces don't
      // re-celebrate. Local state keeps the visual treatment alive.
      clearLastEarned();
    }
  }, [state.lastEarnedGame, clearLastEarned]);

  // Scroll the celebrated row into view after the page paints.
  useEffect(() => {
    if (!celebrateId) return;
    const t = window.setTimeout(() => {
      celebrateRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 180);
    // Auto-fade the highlight after a few seconds so the page settles.
    const fade = window.setTimeout(() => setCelebrateId(null), 6500);
    return () => { window.clearTimeout(t); window.clearTimeout(fade); };
  }, [celebrateId]);

  const handleSaveNickname = () => {
    const value = nicknameInput.trim();
    if (!value) return;
    setUser({ name: value });
  };

  const handleReset = () => {
    if (!confirm('Reset preview progress? This clears all unlocked Tales and earned Marks.')) return;
    resetDemo();
    try { localStorage.removeItem(LS_HOW_DISMISSED); } catch (_) { /* ignore */ }
  };

  const unlockedCount = useMemo(
    () => tales.filter((t) => state.unlocked.has(t.id)).length,
    [tales, state.unlocked],
  );

  return (
    <div className="page active" id="page-profile">

      <div id="profile-content">

        <div style={{ padding: '1.25rem 1.25rem 0' }}>

          <div className="passport-id-card">
            <div className="passport-id-header">
              <div className="passport-id-eyebrow">FOUNDERS PASSPORT</div>
              <div className="passport-id-number">{passId}</div>
            </div>
            <div className="passport-id-body">
              <div className="passport-id-avatar">{initial}</div>
              <div className="passport-id-info">
                <div className="passport-id-name">{nickname}</div>
                <div className="passport-id-status">{currentTier.label} TIER · TRACKSIDE TALES</div>
                <div className="passport-id-since">Founders preview · early access</div>
              </div>
            </div>
            <div className="passport-id-stats">
              <div className="passport-id-stat">
                <div className="passport-id-stat-num">{stories}</div>
                <div className="passport-id-stat-lbl">TALES UNLOCKED</div>
              </div>
              <div className="passport-id-stat">
                <div className="passport-id-stat-num">{scanCount}</div>
                <div className="passport-id-stat-lbl">DISCOVERY MARKS</div>
              </div>
              <div className="passport-id-stat">
                <div className="passport-id-stat-num">{gameCount}</div>
                <div className="passport-id-stat-lbl">CHALLENGE BADGES</div>
              </div>
              <div className="passport-id-stat">
                <div className="passport-id-stat-num">{fullyComplete}</div>
                <div className="passport-id-stat-lbl">TALES COMPLETED</div>
              </div>
            </div>
            <div className="nickname-edit-row">
              <input
                className="nickname-input"
                id="nickname-field"
                type="text"
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                placeholder="Enter your name…"
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNickname(); }}
              />
              <button className="nickname-save-btn" onClick={handleSaveNickname}>SAVE</button>
            </div>
          </div>

          {/* v5.3: Founders Progress meter — surfaces the marks-vs-total
             totals + the next tier as a single, motivating headline. */}
          <div className="founders-progress" aria-label="Founders progress meter">
            <div className="founders-progress-row">
              <div className="founders-progress-headline">
                <span className="founders-progress-num">{totalMarks}</span>
                <span className="founders-progress-of"> of </span>
                <span className="founders-progress-total">{totalPossible}</span>
                <span className="founders-progress-unit"> Marks earned</span>
              </div>
              <div className="founders-progress-tier">
                <span className="founders-progress-tier-label">{currentTier.label}</span>
                <span className="founders-progress-tier-sep">→</span>
                <span className="founders-progress-tier-next">
                  {nextTier ? nextTier.label : 'MAX TIER'}
                </span>
              </div>
            </div>
            <div className="founders-progress-meter" role="progressbar" aria-valuenow={totalMarks} aria-valuemin={0} aria-valuemax={totalPossible}>
              <div
                className="founders-progress-fill"
                style={{ width: `${(totalMarks / Math.max(totalPossible, 1)) * 100}%` }}
              />
              {TIERS.filter((t) => t.marks > 0).map((t) => (
                <div
                  key={t.tier}
                  className={`founders-progress-tick${totalMarks >= t.marks ? ' reached' : ''}`}
                  style={{ left: `${(t.marks / Math.max(totalPossible, 1)) * 100}%` }}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="founders-progress-foot">
              {nextTier ? (
                <>
                  <span className="founders-progress-next">
                    Next tier · {nextTier.label} at {nextTier.marks} Marks
                  </span>
                  <span className="founders-progress-remain">
                    {nextTier.marks - totalMarks} more to go · meter fills {tierProgressPct}%
                  </span>
                </>
              ) : (
                <span className="founders-progress-next">
                  Founders Tier reached · all current Marks collected
                </span>
              )}
            </div>
          </div>

        </div>

        <div className="stamp-book-section">
          <div className="stamp-book-header">
            <div className="stamp-book-label">PASSPORT STAMP BOOK</div>
            <div className="stamp-book-count">{fullyComplete} of {tales.length} fully collected</div>
          </div>
          <div className="stamp-book-sub">
            Every Tale earns two Marks — one for Discovery, one for completing its Challenge.
          </div>
          <div className="stamp-book-key" aria-label="Passport mark legend">
            <span className="stamp-book-key-item">
              <span className="stamp-book-key-dot" /> Discovery Mark · scanned
            </span>
            <span className="stamp-book-key-item">
              <span className="stamp-book-key-dot full" /> Challenge Badge · completed
            </span>
          </div>
        </div>

        <div className="passport-section">
          <div className="passport-header">
            <div className="passport-label">TRACKSIDE TALES PASSPORT</div>
            <div className="passport-count">{unlockedCount} / {tales.length} COLLECTED</div>
          </div>

          <div className="passport-book">
            <div className="passport-crest">
              <div className="passport-crest-mark">◈ T.B. ◈</div>
              <div className="passport-crest-title">TRACKSIDE TALES</div>
              <div className="passport-crest-sub">LEHIGH VALLEY · PENNSYLVANIA</div>
            </div>

            {tales.map((tale) => {
              const unlocked   = state.unlocked.has(tale.id);
              const scanStamp  = state.scanBadges.has(tale.id);
              const gameStamp  = state.gameBadges.has(tale.id);
              const stampCount = (scanStamp ? 1 : 0) + (gameStamp ? 1 : 0);
              const collected  = state.collectedDates[tale.id];
              const isOnTap    = tale.tapStatus === 'on-tap';
              const isComplete = scanStamp && gameStamp;
              const isCelebrating = celebrateId === tale.id;

              const retiredFlag    = !isOnTap && unlocked ? ' retired' : '';
              const lockedFlag     = unlocked ? '' : ' locked';
              const completeFlag   = isComplete ? ' complete' : '';
              const celebrateFlag  = isCelebrating ? ' celebrating' : '';
              const navigateOnClick = unlocked ? () => nav('story') : undefined;

              return (
                <div
                  key={tale.id}
                  ref={isCelebrating ? celebrateRowRef : null}
                  className={`passport-entry${lockedFlag}${retiredFlag}${completeFlag}${celebrateFlag}`}
                  onClick={navigateOnClick}
                  role={unlocked ? 'button' : undefined}
                  aria-disabled={!unlocked}
                >
                  <div className="passport-stamp">
                    <TsIcon
                      icon={unlocked ? tale.icon : 'locked-seal'}
                      className={`ts-icon-md${unlocked ? '' : ' ts-icon-locked'}`}
                    />
                    {stampCount > 0 && (
                      <span className="passport-stamp-mark">{stampCount}</span>
                    )}
                    {isComplete && (
                      <span className="passport-stamp-complete-ring" aria-hidden="true" />
                    )}
                  </div>
                  <div className="passport-entry-info">
                    <div className="passport-entry-name">{tale.name}</div>
                    <div className="passport-entry-person">
                      {tale.person.name} · {tale.year}
                    </div>
                    {unlocked && (
                      <div className="passport-entry-meta">
                        <span>Collected {formatDate(collected)}</span>
                        {!isOnTap && tale.retiredDate && (
                          <span> · Retired {formatDate(tale.retiredDate)}</span>
                        )}
                      </div>
                    )}

                    {/* v5.3: explicit two-mark sub-rows replace the old
                       single-line helper. Always visible once the Tale
                       is unlocked so the guest can see exactly which
                       Mark they have and which they don't. */}
                    {unlocked ? (
                      <div className="passport-entry-marks" aria-label="Mark progress">
                        <div className={`passport-mark-row${scanStamp ? ' earned' : ''}`}>
                          <span className="passport-mark-dot" aria-hidden="true">
                            {scanStamp ? '✓' : '◐'}
                          </span>
                          <span className="passport-mark-label">DISCOVERY MARK</span>
                          <span className="passport-mark-name">{tale.scanBadge.title}</span>
                        </div>
                        <div className={`passport-mark-row${gameStamp ? ' earned' : ''}`}>
                          <span className="passport-mark-dot" aria-hidden="true">
                            {gameStamp ? '✓' : '◐'}
                          </span>
                          <span className="passport-mark-label">CHALLENGE BADGE</span>
                          <span className="passport-mark-name">{tale.gameBadge.title}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="passport-entry-status">
                        SCAN A CAN TO UNLOCK
                      </div>
                    )}

                    {/* Status / next-step strip */}
                    <div className="passport-entry-footline">
                      {!unlocked && (
                        <span className="passport-entry-status-pill">SEALED</span>
                      )}
                      {unlocked && !gameStamp && (
                        <span className="passport-entry-status-pill in-progress">
                          NEXT · COMPLETE THE CHALLENGE
                        </span>
                      )}
                      {isComplete && (
                        <span className="passport-entry-status-pill complete">
                          ✓ FULLY COLLECTED
                        </span>
                      )}
                      {unlocked && (
                        <span className={`passport-entry-tap${isOnTap ? '' : ' retired'}`}>
                          {isOnTap ? 'ON TAP' : 'RETIRED TALE'}
                        </span>
                      )}
                    </div>

                    {isCelebrating && (
                      <div className="passport-entry-celebrate" role="status" aria-live="polite">
                        <span className="passport-entry-celebrate-spark">✦</span>
                        New Challenge Badge — added to your Passport.
                      </div>
                    )}
                  </div>
                  {unlocked && <div className="passport-entry-arrow">→</div>}
                </div>
              );
            })}
          </div>

          {unlockedCount === 0 && (
            <div className="passport-empty-state">
              <div className="passport-empty-title">Your Passport is ready</div>
              <div className="passport-empty-body">
                Scan a Trackside can — or pick a Preview Tale on the Scan page — to earn your first Mark and start collecting stories.
              </div>
              <button className="passport-empty-cta" onClick={() => nav('scan')}>
                START A PREVIEW UNLOCK
              </button>
            </div>
          )}

          <div className="passport-note">
            Your Passport keeps every Tale you've collected — even after a beer rotates off tap.
            Once it's yours, it's yours forever. Founders Tier rewards roll out as the program goes live.
          </div>
        </div>

        <button className="reset-preview-btn" onClick={handleReset}>
          RESET PREVIEW PROGRESS
        </button>

      </div>

    </div>
  );
}
