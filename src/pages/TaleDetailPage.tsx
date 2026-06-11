import React, { useState } from 'react';
import { useApp } from '../app/AppContext';
import { GameOverlay } from '../games/GameOverlay';
import { getGameConfig } from '../games/gameConfigs';
import { formatDate } from '../services/badgeService';

// ================== TALE DETAIL PAGE (v6.2 — Structured Design Pass) ==================
// Visual rewrite for the unlocked branch only. The locked branch and all
// game / scan / unlock logic are preserved verbatim.
//
// Hard constraints honored:
//   • Badge keys, localStorage keys, Supabase paths, scan/unlock logic, and
//     routing all unchanged.
//   • awardGameBadge wiring through GameOverlay unchanged.
//   • currentTale comes from app state — no data-shape changes.

// Pick a milestone-level icon glyph from the timeline event title. These
// are inert visual cues only; they have no effect on logic or routing.
function timelineGlyph(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('born'))         return '☉';
  if (t.includes('purchase'))     return '✦';
  if (t.includes('chief'))        return '⚖';
  if (t.includes('found'))        return '⌂';
  if (t.includes('liberty'))      return '☼';
  if (t.includes('died') || t.includes('dies')) return '✦';
  return '◈';
}

export function TaleDetailPage() {
  // ADMIN-v6.8D — `guestId` pulled through to GameOverlay so its event
  // logger can flush against the current session id. AppContext already
  // exposes guestId; no other context shape change.
  const { state, awardGameBadge, nav, guestId } = useApp();
  const tale = state.currentTale;
  const [showGame, setShowGame] = useState(false);

  if (!tale) return null;

  const isUnlocked   = state.unlocked.has(tale.id);
  const hasScanBadge = state.scanBadges.has(tale.id);
  const hasGameBadge = state.gameBadges.has(tale.id);
  const gameConfig   = getGameConfig(tale.id);
  const collected    = state.collectedDates[tale.id];

  const handleBadgeAwarded = (_badgeKey: string) => awardGameBadge(tale.id);

  // ── Locked state (unchanged from v5.x — no structural rewrite) ─────────────
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

  // ── Unlocked state (v6.2 visual rewrite) ───────────────────────────────────
  const gameEnabled =
    tale.id === 'wa-lager'
    || tale.id === 'packer-pils'
    || tale.id === 'wooden-match';
  const showAsEarned     = hasGameBadge;
  const showAsActive     = gameEnabled && !hasGameBadge;
  const showAsComingSoon = !gameEnabled && !hasGameBadge;
  const totalMarks       = (hasScanBadge ? 1 : 0) + (hasGameBadge ? 1 : 0);

  return (
    <div className="page active ts-tale-screen" id="page-story">

      {/* ============== 2. PARCHMENT HERO ============== */}
      <section className="ts-tale-hero" aria-label={`${tale.name} hero`}>
        <div className="ts-tale-hero__sidetab" aria-hidden="true">
          <span className="ts-tale-hero__sidetab-text">
            TRACKSIDE №{tale.year} · RAILWAY ARCHIVE
          </span>
        </div>

        <div className="ts-tale-hero__top">
          <button className="ts-tale-hero__back" onClick={() => nav('tales')}>
            ← Back to Tales
          </button>
          <span className={`ts-tale-hero__pill${hasScanBadge ? '' : ' ts-tale-hero__pill--locked'}`}>
            {hasScanBadge ? '🔒 UNLOCKED' : '🔒 SEALED'}
          </span>
        </div>

        <div className="ts-tale-hero__year" aria-hidden="true">{tale.year}</div>

        <div className="ts-tale-hero__body">
          <div>
            <div className="ts-tale-hero__eyebrow">{tale.chapter}</div>
            <h1
              className="ts-tale-hero__title"
              dangerouslySetInnerHTML={{ __html: tale.title.replace('\n', '<br>') }}
            />
            <hr className="ts-tale-hero__rule" />
            <div className="ts-tale-hero__meta">
              {tale.name} · {tale.style} · ABV {tale.abv} · IBU {tale.ibu}
            </div>
          </div>
          {tale.image && (
            <div className="ts-tale-hero__can">
              <img
                src={tale.image}
                alt={tale.name}
                onError={(e) => {
                  const parent = e.currentTarget.parentElement;
                  if (parent) parent.style.display = 'none';
                }}
              />
            </div>
          )}
        </div>
      </section>

      {/* ============== 3. SUMMARY PANEL ============== */}
      <section className="ts-tale-summary" aria-label="Tale summary">
        {tale.image && (
          <div className="ts-tale-summary__art">
            <img src={tale.image} alt="" />
          </div>
        )}
        <div className="ts-tale-summary__body">
          <div>
            <h2 className="ts-tale-summary__name">{tale.person.name}</h2>
            <div className="ts-tale-summary__dates">{tale.person.dates}</div>
          </div>
          <p className="ts-tale-summary__bio">{tale.personBio}</p>

          {tale.barSummary && (
            <div className="ts-tale-summary__facts">
              <div className="ts-tale-fact">
                <span className="ts-tale-fact__lbl">WHO</span>
                <span className="ts-tale-fact__txt">{tale.barSummary.who}</span>
              </div>
              <div className="ts-tale-fact">
                <span className="ts-tale-fact__lbl">WHY HERE</span>
                <span className="ts-tale-fact__txt">{tale.barSummary.why}</span>
              </div>
              <div className="ts-tale-fact">
                <span className="ts-tale-fact__lbl">THE BEER</span>
                <span className="ts-tale-fact__txt">{tale.barSummary.beer}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ============== 4. STORY + MAP ============== */}
      <div className="ts-tale-story-row">
        <article className="ts-tale-story">
          <div className="ts-tale-story__meta">
            <span className="ts-tale-story__meta-dot" aria-hidden="true" />
            {tale.tapStatus === 'on-tap' ? 'ON TAP' : 'RETIRED TALE'}
            {collected && <span> · COLLECTED {formatDate(collected).toUpperCase()}</span>}
            {tale.retiredDate && <span> · RETIRED {formatDate(tale.retiredDate).toUpperCase()}</span>}
          </div>
          <div className="ts-tale-story__body">
            {tale.story.map((block, i) => {
              if (block.type === 'quote') {
                return (
                  <blockquote key={i} className="ts-tale-story__quote">
                    <span>"{block.text}"</span>
                    {block.cite && (
                      <cite className="ts-tale-story__quote-cite">{block.cite}</cite>
                    )}
                  </blockquote>
                );
              }
              return (
                <p
                  key={i}
                  dangerouslySetInnerHTML={{ __html: block.text || '' }}
                />
              );
            })}
          </div>
        </article>

        <section className="ts-tale-map" aria-label={tale.mapTitle}>
          <div className="ts-tale-map__top">
            <span className="ts-tale-map__title">{tale.mapTitle.toUpperCase()}</span>
            <button type="button" className="ts-tale-map__btn">● LIVE MAP</button>
          </div>
          <div className="ts-tale-map__canvas">
            {tale.pins.slice(0, 4).map((pin) => (
              <div
                key={pin.label}
                className="ts-tale-map__pin"
                style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
              >
                <span className="ts-tale-map__pin-dot" aria-hidden="true" />
                <span className="ts-tale-map__pin-label">{pin.label}</span>
              </div>
            ))}
          </div>
          <div className="ts-tale-map__foot">{tale.year} GRID REFERENCE</div>
        </section>
      </div>

      {/* ============== 5. TIMELINE ============== */}
      {tale.timeline && tale.timeline.length > 0 && (
        <section className="ts-timeline" aria-label="Historical timeline">
          <div className="ts-timeline__label">A LIFE IN THE VALLEY</div>
          <div className="ts-timeline__rail">
            {tale.timeline.map((ev, i) => (
              <div
                key={i}
                className={`ts-timeline__node${ev.major ? ' ts-timeline__node--major' : ''}`}
              >
                <div className="ts-timeline__medallion" aria-hidden="true">
                  {timelineGlyph(ev.event)}
                </div>
                <div className="ts-timeline__year">{ev.year}</div>
                <div className="ts-timeline__title">{ev.event}</div>
                {ev.detail && <div className="ts-timeline__detail">{ev.detail}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============== 6. BADGE + INTERACTIVE CHALLENGE ============== */}
      <div className="ts-tale-action-row">
        <aside className="ts-tale-badge-card" aria-label="Discovery badge">
          <div className="ts-tale-badge-card__count">BADGE {totalMarks}/2</div>
          <h3 className="ts-tale-badge-card__title">{tale.scanBadge.title}</h3>
          <div
            className={`ts-tale-badge-card__medallion${hasScanBadge ? '' : ' ts-tale-badge-card__locked'}`}
            aria-hidden="true"
          >
            <span className="ts-tale-badge-card__medallion-icon">◈</span>
            <span className="ts-tale-badge-card__medallion-year">{tale.year}</span>
          </div>
        </aside>

        <section className="ts-tale-challenge" aria-label="Interactive challenge">
          <div className="ts-tale-challenge__eyebrow">INTERACTIVE CHALLENGE</div>
          <h3 className="ts-tale-challenge__title">
            {showAsComingSoon ? 'Interactive Challenge' : tale.game.title}
          </h3>
          <p className="ts-tale-challenge__copy">
            {showAsEarned     && 'Both Marks are now in your Trackside Passport. The Tale is fully collected.'}
            {showAsActive     && 'Complete the short challenge below to earn the second badge for this Tale.'}
            {showAsComingSoon && "This Tale's challenge is on the way — coming soon."}
          </p>
          {/* v6.2.1 — Primary "PLAY TO EARN" CTA removed to dedupe with the
              lower Next Step panel's PLAY MINI-GAME button. WATCH INTRO and
              SHARE TALE remain as secondary visual actions.
              UI-v6.6 — Both are no-op placeholders today. They render in a
              softened "coming soon" treatment so they never visually compete
              with the lower copper PLAY MINI-GAME CTA, and clicks are wired
              to a safe no-op (preventing future accidental wiring). */}
          <div className="ts-tale-challenge__row">
            <button
              type="button"
              className="ts-tale-challenge__btn ts-tale-challenge__btn--placeholder"
              onClick={(e) => e.preventDefault()}
              title="Coming soon"
              aria-disabled="true"
            >
              ▶ WATCH INTRO
              <span className="ts-tale-challenge__btn-hint" aria-hidden="true">SOON</span>
            </button>
            <button
              type="button"
              className="ts-tale-challenge__btn ts-tale-challenge__btn--placeholder"
              onClick={(e) => e.preventDefault()}
              title="Coming soon"
              aria-disabled="true"
            >
              ↗ SHARE TALE
              <span className="ts-tale-challenge__btn-hint" aria-hidden="true">SOON</span>
            </button>
          </div>
        </section>
      </div>

      {/* ============== 7. NEXT STEP ============== */}
      <section className="ts-next-step" aria-label="Next step">
        <div className="ts-next-step__art" aria-hidden="true">
          <span className="ts-next-step__art-mark">◈</span>
          <span>TRACKSIDE</span>
          <span>PASSPORT</span>
        </div>
        <div className="ts-next-step__body">
          <div className="ts-next-step__eyebrow">NEXT STEP</div>
          <h3 className="ts-next-step__title">
            {showAsEarned ? 'TALE FULLY COLLECTED' : 'EARN THE SECOND BADGE'}
          </h3>
          <p className="ts-next-step__copy">
            {showAsEarned
              ? 'Both Marks are stamped in your Passport. Visit your Passport to admire the spread.'
              : 'Complete the mini-game to finish this Passport page.'}
          </p>
          <div className="ts-next-step__btns">
            {/* UI-v6.7A — earned Tales can re-open the game as a replay.
                GameOverlay shows its already-earned banner and the
                alreadyEarned gate keeps the badge from re-awarding, so
                replay is purely for fun. Coming-soon stays disabled. */}
            <button
              type="button"
              className="ts-next-step__primary"
              onClick={() => !showAsComingSoon && setShowGame(true)}
              disabled={showAsComingSoon}
              aria-disabled={showAsComingSoon}
            >
              {showAsEarned     && '↻ REPLAY MINI-GAME'}
              {showAsActive     && '🎮 PLAY MINI-GAME'}
              {showAsComingSoon && 'MINI-GAME COMING SOON'}
            </button>
            <button
              type="button"
              className="ts-next-step__secondary"
              onClick={() => nav('passport')}
            >
              📖 VIEW PASSPORT
            </button>
          </div>
        </div>
      </section>

      {showGame && gameConfig && (
        <GameOverlay
          config={gameConfig}
          onClose={() => setShowGame(false)}
          onBadgeAwarded={handleBadgeAwarded}
          alreadyEarned={hasGameBadge}
          successBadgeIcon={tale.gameBadge.icon}
          successBadgeTitle={tale.gameBadge.title}
          guestId={guestId}
        />
      )}

    </div>
  );
}
