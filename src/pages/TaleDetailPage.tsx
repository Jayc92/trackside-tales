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
// PUBLIC-v7.4B.P.12a — build the hero meta line from only the
// non-blank fragments so a Tale without pack style/ABV/IBU renders
// "Test Tale" instead of "Test Tale ·  · ABV  · IBU ". Curated Tales
// have every fragment populated, so their output is unchanged.
function buildHeroMeta(tale: { name: string; style: string; abv: string; ibu: string }): string {
  const fragments: string[] = [];
  if (tale.name.trim())  fragments.push(tale.name.trim());
  if (tale.style.trim()) fragments.push(tale.style.trim());
  if (tale.abv.trim())   fragments.push(`ABV ${tale.abv.trim()}`);
  if (tale.ibu.trim())   fragments.push(`IBU ${tale.ibu.trim()}`);
  return fragments.join(' · ');
}

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

// PUBLIC-v7.4B.P.15c — optional preview injection. When `previewTale`
// is provided (by TalePreviewPage, after server-authoritative token
// validation), the page renders THAT tale in its normal unlocked
// layout without touching AppContext state: no unlockTale, no badge
// award, no collected date, no localStorage write, no analytics.
// `previewMode` additionally disables the game CTA and hides the
// in-app navigation buttons (Back to Tales / VIEW PASSPORT), which
// would dead-end inside the standalone preview shell.
interface TaleDetailPageProps {
  previewTale?: import('../app/types').Tale;
  previewMode?: boolean;
}

export function TaleDetailPage({ previewTale, previewMode = false }: TaleDetailPageProps = {}) {
  // ADMIN-v6.8D — `guestId` pulled through to GameOverlay so its event
  // logger can flush against the current session id. AppContext already
  // exposes guestId; no other context shape change.
  const { state, awardGameBadge, nav, guestId } = useApp();
  const tale = previewTale ?? state.currentTale;
  const [showGame, setShowGame] = useState(false);

  if (!tale) return null;

  // Preview renders the unlocked layout without persisting anything;
  // badge/collected state reads stay live-state-based (empty for a
  // draft tale, so the page shows the pristine 0/2 presentation).
  const isUnlocked   = previewMode || state.unlocked.has(tale.id);
  const hasScanBadge = !previewMode && state.scanBadges.has(tale.id);
  const hasGameBadge = !previewMode && state.gameBadges.has(tale.id);
  const gameConfig   = getGameConfig(tale.id);
  const collected    = previewMode ? undefined : state.collectedDates[tale.id];

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
  // P.15c: the game CTA is always unavailable in preview mode — even
  // for curated tales — so a preview can never open GameOverlay or
  // award progress.
  const gameEnabled =
    !previewMode && (
      tale.id === 'wa-lager'
      || tale.id === 'packer-pils'
      || tale.id === 'wooden-match'
    );
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
            {/* PUBLIC-v7.4B.P.12a — drop the № fragment when the remote
                row has no year (avoids "TRACKSIDE № · RAILWAY ARCHIVE"). */}
            {tale.year ? `TRACKSIDE №${tale.year} · RAILWAY ARCHIVE` : 'TRACKSIDE · RAILWAY ARCHIVE'}
          </span>
        </div>

        <div className="ts-tale-hero__top">
          {/* P.15c: in-app nav is hidden in preview mode — the
              standalone preview shell has its own exit link. */}
          {!previewMode ? (
            <button className="ts-tale-hero__back" onClick={() => nav('tales')}>
              ← Back to Tales
            </button>
          ) : (
            <span />
          )}
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
              {buildHeroMeta(tale)}
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
      {/* PUBLIC-v7.4B.P.12a — the summary panel and each of its parts
          render only when they carry real content. The default pack
          ships blank person/barSummary values for non-curated Tales;
          without these guards the page showed an empty biography panel
          and empty WHO / WHY HERE / THE BEER labels. Curated Tales
          populate every field, so their rendering is unchanged. */}
      {(() => {
        const hasPersonHeading = tale.person.name.trim().length > 0;
        const hasPersonDates   = tale.person.dates.trim().length > 0;
        const hasPersonBio     = tale.personBio.trim().length > 0;
        const factRows = [
          { label: 'WHO',      value: tale.barSummary?.who ?? '' },
          { label: 'WHY HERE', value: tale.barSummary?.why ?? '' },
          { label: 'THE BEER', value: tale.barSummary?.beer ?? '' },
        ].filter((fact) => fact.value.trim().length > 0);
        const hasSummaryContent =
          hasPersonHeading || hasPersonBio || factRows.length > 0 || Boolean(tale.image);
        if (!hasSummaryContent) return null;
        return (
          <section className="ts-tale-summary" aria-label="Tale summary">
            {tale.image && (
              <div className="ts-tale-summary__art">
                <img src={tale.image} alt="" />
              </div>
            )}
            <div className="ts-tale-summary__body">
              {(hasPersonHeading || hasPersonDates) && (
                <div>
                  {hasPersonHeading && (
                    <h2 className="ts-tale-summary__name">{tale.person.name}</h2>
                  )}
                  {hasPersonDates && (
                    <div className="ts-tale-summary__dates">{tale.person.dates}</div>
                  )}
                </div>
              )}
              {hasPersonBio && (
                <p className="ts-tale-summary__bio">{tale.personBio}</p>
              )}

              {factRows.length > 0 && (
                <div className="ts-tale-summary__facts">
                  {factRows.map((fact) => (
                    <div key={fact.label} className="ts-tale-fact">
                      <span className="ts-tale-fact__lbl">{fact.label}</span>
                      <span className="ts-tale-fact__txt">{fact.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })()}

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

        {/* PUBLIC-v7.4B.P.12a — render the map only when at least one
            valid pin exists; a pin-less Tale previously showed an empty
            canvas titled "MAP". Curated Tales always carry pins. */}
        {tale.pins.length > 0 && (
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
        )}
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
            {/* P.15c: passport nav hidden in preview mode. */}
            {!previewMode && (
              <button
                type="button"
                className="ts-next-step__secondary"
                onClick={() => nav('passport')}
              >
                📖 VIEW PASSPORT
              </button>
            )}
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
