import React, { useState } from 'react';
import { useApp } from '../app/AppContext';
import { TsIcon } from '../components/TsIcon';
import { GameOverlay } from '../games/GameOverlay';
import { getGameConfig } from '../games/gameConfigs';
import { formatDate } from '../services/badgeService';

// ================== TALE DETAIL PAGE (== golden #page-story) ==================
// Mirrors the golden v4.6.1 renderStory() output exactly:
//   .story-nav (back-btn + story-progress)
//   .story-hero (story-hero-bg, story-hero-top with back + badge chip,
//                story-hero-year watermark, story-hero-artifact + can,
//                story-hero-content with story-chapter + story-title + tagline)
//   .story-identity-strip
//   .story-body: portrait-card + bar-summary + story-meta + story-para/pullquote
//                + collectible-section + minigame-section
// Locked state renders the locked-only hero + story-locked-state CTA card.
// Game/scan/unlock logic is preserved untouched.

export function TaleDetailPage() {
  const { state, awardGameBadge, nav } = useApp();
  const tale = state.currentTale;
  const [showGame, setShowGame] = useState(false);

  if (!tale) return null;

  const isUnlocked   = state.unlocked.has(tale.id);
  const hasScanBadge = state.scanBadges.has(tale.id);
  const hasGameBadge = state.gameBadges.has(tale.id);
  const gameConfig   = getGameConfig(tale.id);
  const collected    = state.collectedDates[tale.id];

  const handleBadgeAwarded = (_badgeKey: string) => awardGameBadge(tale.id);

  // ── Locked state ───────────────────────────────────────────────────────────
  if (!isUnlocked) {
    return (
      <div className="page active" id="page-story">
        <div className="story-nav">
          <button className="back-btn" onClick={() => nav('tales')}>Back to Tales</button>
          <div className="story-progress">
            <span className="story-progress-dot" />
            <span>LOCKED</span>
          </div>
        </div>
        <div id="story-content">
          <div className="story-hero">
            <div className="story-hero-bg" />
            <div className="story-hero-year">{tale.year}</div>
            <div className="story-hero-content">
              <div className="story-chapter">{tale.chapter}</div>
              <h1
                className="story-title"
                dangerouslySetInnerHTML={{ __html: tale.title.replace('\n', '<br>') }}
              />
            </div>
          </div>
          <div className="story-locked-state">
            <div className="story-locked-icon">◈</div>
            <div className="story-locked-title">This Tale is still sealed.</div>
            <div className="story-locked-copy">
              Scan this Trackside Tale at The Wooden Match to unlock the story, stamp your Passport, and play the mini-game.
            </div>
            <button className="story-locked-cta" onClick={() => nav('scan')}>START SCANNING</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Unlocked state ─────────────────────────────────────────────────────────
  return (
    <div className="page active" id="page-story">

      <div className="story-nav">
        <button className="back-btn" onClick={() => nav('tales')}>Back to Tales</button>
        <div className="story-progress">
          <span className="story-progress-dot" />
          <span>UNLOCKED</span>
        </div>
      </div>

      <div id="story-content">

        <div className="story-hero">
          <div className="story-hero-bg" />
          <div className="story-hero-top">
            <button className="story-back-btn" onClick={() => nav('tales')}>← TALES</button>
            <div className={`story-hero-badge-chip ${hasScanBadge ? 'earned' : 'locked'}`}>
              {hasScanBadge ? '✓ SCANNED' : '◈ LOCKED'}
            </div>
          </div>
          <div className="story-hero-year">{tale.year}</div>
          {tale.image && (
            <div className="story-hero-artifact">
              <img
                src={tale.image}
                alt={tale.name}
                className="story-hero-can"
                onError={(e) => {
                  const parent = e.currentTarget.parentElement;
                  if (parent) parent.style.display = 'none';
                }}
              />
            </div>
          )}
          <div className="story-hero-content">
            <div className="story-chapter">{tale.chapter}</div>
            <h1
              className="story-title"
              dangerouslySetInnerHTML={{ __html: tale.title.replace('\n', '<br>') }}
            />
            <div className="story-hero-tagline">{tale.person.name} · {tale.person.dates}</div>
          </div>
        </div>

        <div className="story-identity-strip">
          <div>
            <div className="story-beer-label">{tale.style} · ABV {tale.abv} · IBU {tale.ibu}</div>
            <div className="story-beer-name">{tale.name}</div>
          </div>
          <div className="story-unlocked-badge">✓ UNLOCKED</div>
        </div>

        <div className="story-body">

          <div className="portrait-card">
            <div className={`portrait-frame${tale.image ? ' has-image' : ''}`}>
              {tale.image ? (
                <img
                  className="portrait-frame-img"
                  src={tale.image}
                  alt={`${tale.name} can`}
                  onError={(e) => {
                    const img = e.currentTarget;
                    const parent = img.parentElement;
                    img.remove();
                    if (parent) parent.classList.remove('has-image');
                  }}
                />
              ) : (
                <div className="portrait-inner">
                  <div className="portrait-initials">
                    {tale.person.initials || tale.person.name.split(' ').map((p) => p[0]).join('.')}
                  </div>
                  <div className="portrait-caption">PORTRAIT</div>
                </div>
              )}
            </div>
            <div className="portrait-bio">
              <div className="portrait-name">{tale.person.name}</div>
              <div className="portrait-dates">{tale.person.dates}</div>
              <div className="portrait-desc">{tale.personBio}</div>
            </div>
          </div>

          {tale.barSummary && (
            <div className="bar-summary">
              <div className="bar-summary-row">
                <div className="bar-summary-label">WHO</div>
                <div className="bar-summary-text">{tale.barSummary.who}</div>
              </div>
              <div className="bar-summary-row">
                <div className="bar-summary-label">WHY HERE</div>
                <div className="bar-summary-text">{tale.barSummary.why}</div>
              </div>
              <div className="bar-summary-row">
                <div className="bar-summary-label">THE BEER</div>
                <div className="bar-summary-text">{tale.barSummary.beer}</div>
              </div>
            </div>
          )}

          <div className="story-meta">
            <span>{tale.tapStatus === 'on-tap' ? 'ON TAP' : 'RETIRED TALE'}</span>
            {collected && <span>COLLECTED {formatDate(collected).toUpperCase()}</span>}
            {tale.retiredDate && <span>RETIRED {formatDate(tale.retiredDate).toUpperCase()}</span>}
          </div>

          {tale.story.map((block, i) => {
            if (block.type === 'quote') {
              return (
                <div key={i} className="story-pullquote">
                  <p>"{block.text}"</p>
                  {block.cite && <cite>{block.cite}</cite>}
                </div>
              );
            }
            return (
              <p
                key={i}
                className="story-para"
                dangerouslySetInnerHTML={{ __html: block.text || '' }}
              />
            );
          })}

          {tale.timeline && tale.timeline.length > 0 && (
            <div className="timeline-section">
              <div className="timeline-label">A LIFE IN THE VALLEY</div>
              {tale.timeline.map((event, i) => (
                <div key={i} className={`timeline-event${event.major ? ' major' : ''}`}>
                  <div className="timeline-year">{event.year}</div>
                  <div className="timeline-event-content">
                    <div className="timeline-event-title">{event.event}</div>
                    {event.detail && <div className="timeline-event-detail">{event.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="collectible-section">
            <div className="collectible-label">BADGE 1/2 · SCAN BADGE</div>
            <h3 className="collectible-title">{tale.scanBadge.title}</h3>
            <div className="collectible-icon">
              <TsIcon icon={tale.scanBadge.icon} className="ts-icon-lg" />
            </div>
            {tale.scanBadge.desc && (
              <p className="collectible-desc">{tale.scanBadge.desc}</p>
            )}
            <button className={`collectible-btn${hasScanBadge ? ' claimed' : ''}`} disabled>
              {hasScanBadge ? '✓ IN YOUR PASSPORT' : 'SCAN BADGE PENDING'}
            </button>
          </div>

          {/* ─────────────────────────────────────────────────────────────
             v5.1.2: W.A. Lager is the first playable mini-game. The CTA
             is enabled only when tale.id === 'wa-lager' AND the user
             hasn't already earned the game badge. Packer Pilsner and
             Wooden Match continue to show the polished COMING SOON
             placeholder from v5.0.1.

             Earned game badges from any prior session keep their ✓
             EARNED state — passport progress is never visually rewound.

             Award path: the game's quiz panel calls onBadgeAwarded only
             after a correct answer. badge/localStorage keys are
             unchanged.
             ───────────────────────────────────────────────────────────── */}
          {gameConfig && (() => {
            const gameEnabled = tale.id === 'wa-lager';
            const showAsEarned = hasGameBadge;
            const showAsActive = gameEnabled && !hasGameBadge;
            const showAsComingSoon = !gameEnabled && !hasGameBadge;

            return (
              <div className="minigame-section">
                <div className="minigame-label">INTERACTIVE · BADGE 2/2</div>
                <h3 className="minigame-title">
                  {showAsComingSoon ? 'Interactive Challenge' : tale.game.title}
                </h3>
                <p className="minigame-context">
                  {showAsEarned && 'Both badges are now marked in your Trackside Passport.'}
                  {showAsActive && 'Complete this short challenge to earn the second badge for this Tale.'}
                  {showAsComingSoon && 'This Tale challenge is being rebuilt for the next preview.'}
                </p>
                {(showAsActive || showAsEarned) && (
                  <p className="minigame-sub">{tale.game.instructions}</p>
                )}
                {showAsActive && (
                  <button
                    className="minigame-btn"
                    onClick={() => setShowGame(true)}
                  >
                    PLAY TO EARN
                  </button>
                )}
                {showAsEarned && (
                  <button
                    className="minigame-btn completed"
                    disabled
                    aria-disabled="true"
                  >
                    ✓ {tale.gameBadge.title.toUpperCase()} — EARNED
                  </button>
                )}
                {showAsComingSoon && (
                  <button
                    className="minigame-btn"
                    disabled
                    aria-disabled="true"
                  >
                    COMING SOON
                  </button>
                )}
              </div>
            );
          })()}

        </div>
      </div>

      {/* v5.1.2: overlay is now reachable from W.A. Lager only. For other
         tales the CTA is still disabled, so this branch never fires for
         them. onBadgeAwarded routes through AppContext.awardGameBadge,
         which uses the existing 'game:<id>' badge-key contract. */}
      {showGame && gameConfig && (
        <GameOverlay
          config={gameConfig}
          onClose={() => setShowGame(false)}
          onBadgeAwarded={handleBadgeAwarded}
          alreadyEarned={hasGameBadge}
          successBadgeIcon={tale.gameBadge.icon}
          successBadgeTitle={tale.gameBadge.title}
        />
      )}

    </div>
  );
}
