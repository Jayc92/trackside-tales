import React, { useState } from 'react';
import { useApp } from '../app/AppContext';
import { TsIcon } from '../components/TsIcon';
import { formatDate } from '../services/badgeService';
import { LS_HOW_DISMISSED } from '../app/types';

// ================== PASSPORT / PROFILE PAGE (== golden #page-profile) ==================
// Mirrors the golden v4.6.1 renderProfile() output:
//   .passport-id-card  (header / body with avatar+name / stats grid / nickname edit row)
//   .stamp-book-section (label + sub)
//   .passport-section  (.passport-header → .passport-book with crest + entries + note)
//   .reset-preview-btn + .feedback-row at the bottom.
// Demo reset / setUser logic preserved untouched.

function getPassportId(joined: string | null): string {
  try {
    if (!joined) return 'TS-0007';
    const seed = (new Date(joined).getTime() % 9000) + 1000;
    return 'TS-' + String(seed).padStart(4, '0');
  } catch (_) {
    return 'TS-0001';
  }
}

export function PassportPage() {
  const { state, tales, setUser, resetDemo, nav } = useApp();

  const nickname = state.user?.name || 'Trackside Guest';
  const initial  = nickname.charAt(0).toUpperCase();
  const passId   = getPassportId(state.user ? state.user.name : null);

  const stories  = state.unlocked.size;
  const stamps   = state.scanBadges.size + state.gameBadges.size;
  const games    = state.gameBadges.size;
  const rewards  = stamps >= 12 ? 3 : stamps >= 6 ? 2 : stamps >= 3 ? 1 : 0;

  const [nicknameInput, setNicknameInput] = useState(
    nickname === 'Trackside Guest' ? '' : nickname,
  );

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

  const unlockedCount = tales.filter((t) => state.unlocked.has(t.id)).length;

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
                <div className="passport-id-status">PREVIEW GUEST · TRACKSIDE TALES</div>
                <div className="passport-id-since">Founders preview · early access</div>
              </div>
            </div>
            <div className="passport-id-stats">
              <div className="passport-id-stat">
                <div className="passport-id-stat-num">{stories}</div>
                <div className="passport-id-stat-lbl">TALES UNLOCKED</div>
              </div>
              <div className="passport-id-stat">
                <div className="passport-id-stat-num">{stamps}</div>
                <div className="passport-id-stat-lbl">MARKS EARNED</div>
              </div>
              <div className="passport-id-stat">
                <div className="passport-id-stat-num">{games}</div>
                <div className="passport-id-stat-lbl">CHALLENGES DONE</div>
              </div>
              <div className="passport-id-stat">
                <div className="passport-id-stat-num">{rewards}</div>
                <div className="passport-id-stat-lbl">FOUNDERS TIER</div>
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
        </div>

        <div className="stamp-book-section">
          <div className="stamp-book-header">
            <div className="stamp-book-label">PASSPORT STAMP BOOK</div>
          </div>
          <div className="stamp-book-sub">
            Every Tale you unlock marks a page in your Trackside Passport.
          </div>
          {/* v5.2: explicit key so a first-time guest understands what
             the two stamp marks mean before they scroll into the book. */}
          <div className="stamp-book-key" aria-label="Passport mark legend">
            <span className="stamp-book-key-item">
              <span className="stamp-book-key-dot" /> 1 mark · Tale discovered
            </span>
            <span className="stamp-book-key-item">
              <span className="stamp-book-key-dot full" /> 2 marks · Challenge completed
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

              const retiredFlag = !isOnTap && unlocked ? ' retired' : '';
              const lockedFlag  = unlocked ? '' : ' locked';

              let helper: React.ReactNode = null;
              if (!unlocked) {
                helper = (
                  <div className="passport-entry-helper">
                    Scan a Trackside Tale to earn its first Mark.
                  </div>
                );
              } else if (unlocked && !gameStamp) {
                helper = (
                  <div className="passport-entry-helper">
                    Complete the Tale’s challenge to earn the second Mark.
                  </div>
                );
              }

              return (
                <div
                  key={tale.id}
                  className={`passport-entry${lockedFlag}${retiredFlag}`}
                  onClick={unlocked ? () => nav('story') : undefined}
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
                    <div className="passport-entry-status">
                      {unlocked
                        ? (isOnTap ? 'ON TAP' : 'RETIRED TALE')
                        : 'SCAN A CAN TO UNLOCK'}
                    </div>
                    {helper}
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
