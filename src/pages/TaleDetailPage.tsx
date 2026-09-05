import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { GameOverlay } from '../games/GameOverlay';
import { getGamesForTale } from '../games/registry';
import {
  GameLaunchWorldContext,
  getArcadeWorldState,
  getGameLaunchWorldContext,
  isLaunchRunRecorded,
} from '../games/worldState';
import { formatDate } from '../services/badgeService';
import { prodSlugFromAppSlug } from '../services/talePresentationPack';
import { TsIcon } from '../components/TsIcon';

// ================== TALE DETAIL — the opened archive record ==================
// PUBLIC-v7.4B.P.28g.6 — presentation/structure refinement of the Tale
// dossier as the opened-record member of the restored page family
// (Our Story = editorial, Tracks = corridor, venue = place, Tales =
// archive, Tale Detail = the record itself): record header with spine
// and ghost year, portrait folio, editorial reading column, survey-grid
// map, route-chronology timeline, and the scan → read → challenge →
// passport climax.
//
// EVERYTHING is data-driven from the Tale model — nothing is hard-coded
// to one Tale. ALL logic is preserved verbatim from the previous
// implementation: preview injection (P.15c), unlock/badge/collected
// state reads, live-tap availability precedence (P.19/P.19a), timeline
// scroll reset + edge fades (P.28e.3), GameOverlay wiring, and the
// locked-branch behavior. The dormant `stillHere` Tale data remains
// intentionally unrendered (P.28g.6 §12 — content decision pending).

// PUBLIC-v7.4B.P.12a — build the hero meta line from only the
// non-blank fragments so a Tale without pack style/ABV/IBU renders
// "Test Tale" instead of "Test Tale ·  · ABV  · IBU ".
function buildHeroMeta(tale: { name: string; style: string; abv: string; ibu: string }): string {
  const fragments: string[] = [];
  if (tale.name.trim())  fragments.push(tale.name.trim());
  if (tale.style.trim()) fragments.push(tale.style.trim());
  if (tale.abv.trim())   fragments.push(`ABV ${tale.abv.trim()}`);
  if (tale.ibu.trim())   fragments.push(`IBU ${tale.ibu.trim()}`);
  return fragments.join(' · ');
}

// CP2 correction §2 — timeline medallions use the Trackside icon
// system (platform-consistent SVG) instead of Unicode pictographs.
function timelineIcon(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('born'))         return 'station-lantern';
  if (t.includes('purchase'))     return 'survey-grid';
  if (t.includes('chief'))        return 'town-seal';
  if (t.includes('found'))        return 'map-grid';
  if (t.includes('liberty'))      return 'station-seal';
  if (t.includes('died') || t.includes('dies')) return 'crossed-spikes';
  return 'town-seal';
}

// PUBLIC-v7.4B.P.19 — Tale availability label. The LIVE tap list is the
// sole source of the operational "ON TAP" claim; tales.tap_status is
// EDITORIAL lifecycle messaging only. Precedence preserved verbatim.
function deriveTaleAvailabilityLabel(
  tale: { id: string; tapStatus: 'on-tap' | 'retired' | 'coming-soon' },
  liveTapSlugs: Set<string>,
): string | null {
  if (liveTapSlugs.has(prodSlugFromAppSlug(tale.id))) return 'ON TAP';
  if (tale.tapStatus === 'retired') return 'RETIRED TALE';
  if (tale.tapStatus === 'coming-soon') return 'COMING SOON';
  return null;
}

// PUBLIC-v7.4B.P.15c — optional preview injection (behavior unchanged).
interface TaleDetailPageProps {
  previewTale?: import('../app/types').Tale;
  previewMode?: boolean;
}

/* State chips — same visual language as the Tales hub archive. */
function RecordChip({
  tone,
  children,
}: {
  tone: 'live' | 'unlocked' | 'sealed';
  children: React.ReactNode;
}) {
  return (
    <span className={`tale-detail-chip tale-detail-chip--${tone}`}>
      {tone === 'live' && <span className="tale-detail-chip-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* Shared record header (tier-1 artifact). Used by both the sealed and
   unlocked branches so the Tale reads as the same archive document in
   both states — only the chips and lower content change. */
function RecordHeader({
  tale,
  plates,
  onBack,
  showCan,
}: {
  tale: import('../app/types').Tale;
  plates: React.ReactNode;
  onBack?: () => void;
  showCan: boolean;
}) {
  return (
    <header className="tale-detail-record" aria-label={`${tale.title.replace('\n', ' ')} — archive record`}>
      <div className="tale-detail-spine" aria-hidden="true">
        <span>
          {tale.year
            ? `TRACKSIDE RAILWAY ARCHIVE · №${tale.year}`
            : 'TRACKSIDE RAILWAY ARCHIVE'}
        </span>
      </div>
      <div className="tale-detail-record-inner">
        {tale.year && (
          <div className="tale-detail-year-ghost" aria-hidden="true">{tale.year}</div>
        )}
        <div className="tale-detail-topline">
          {onBack ? (
            <button type="button" className="tale-detail-back" onClick={onBack}>
              ← BACK TO TALES
            </button>
          ) : <span />}
          <span className="tale-detail-chips">{plates}</span>
        </div>
        <span className="tale-detail-chapter">{tale.chapter}</span>
        <div className="tale-detail-record-body">
          <div className="tale-detail-record-titleblock">
            <h1
              className="tale-detail-title"
              dangerouslySetInnerHTML={{ __html: tale.title.replace('\n', '<br>') }}
            />
            {buildHeroMeta(tale) && (
              <div className="tale-detail-meta">{buildHeroMeta(tale)}</div>
            )}
          </div>
          {showCan && tale.image && (
            <figure className="tale-detail-can" aria-hidden="false">
              <img
                src={tale.image}
                alt={tale.name}
                onError={(e) => {
                  const parent = e.currentTarget.closest('figure');
                  if (parent) (parent as HTMLElement).style.display = 'none';
                }}
              />
              <figcaption className="tale-detail-can-tag">THE CAN</figcaption>
            </figure>
          )}
        </div>
      </div>
    </header>
  );
}

export function TaleDetailPage({ previewTale, previewMode = false }: TaleDetailPageProps = {}) {
  const { state, awardGameBadge, nav, guestId, liveTapSlugs, recordGameResult } = useApp();
  const tale = previewTale ?? state.currentTale;
  const [showGame, setShowGame] = useState(false);
  // GAME.16 — the launch-frozen timetable snapshot for the CURRENT
  // overlay session, exactly the ArcadePage pattern: same pure helpers,
  // same selected-event rules, lifetime 1:1 with the overlay session
  // (set on launch, cleared on close). Transient React state only —
  // timetable acknowledgment follows the game session, not the page
  // the player launched it from.
  const [launchContext, setLaunchContext] =
    useState<GameLaunchWorldContext | null>(null);

  // P.28e.3 timeline correction — the horizontal track always opens at
  // its FIRST event: scrollLeft is reset whenever the rendered Tale
  // changes (initial render included), and never touched afterwards so
  // user interaction is respected. Edge classes drive the continuation
  // fades: no left fade while at the start (the first card is fully
  // readable), no right fade once the user reaches the end.
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const updateTimelineEdges = useCallback((track: HTMLDivElement) => {
    const atStart = track.scrollLeft <= 2;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    track.classList.toggle('tale-detail-timeline-track--more-left', !atStart);
    track.classList.toggle('tale-detail-timeline-track--more-right', !atEnd);
  }, []);
  useEffect(() => {
    const track = timelineTrackRef.current;
    if (track) {
      track.scrollLeft = 0;
      updateTimelineEdges(track);
    }
  }, [tale?.id, updateTimelineEdges]);

  if (!tale) return null;

  // Preview renders the unlocked layout without persisting anything.
  const isUnlocked   = previewMode || state.unlocked.has(tale.id);
  const hasScanBadge = !previewMode && state.scanBadges.has(tale.id);
  const hasGameBadge = !previewMode && state.gameBadges.has(tale.id);
  // PUBLIC-v7.4B.GAME.4 — the registry is the launch authority. Current
  // production model: at most one registered game per Tale; a Tale with
  // no registered game keeps the COMING SOON disabled CTA exactly as
  // before (registry presence alone never implies playability — the
  // climax is only reachable from the unlocked branch below, matching
  // definition.requires.unlockedTale).
  const gameDefinition = getGamesForTale(tale.id)[0];
  const collected    = previewMode ? undefined : state.collectedDates[tale.id];

  const handleBadgeAwarded = (_badgeKey: string) => awardGameBadge(tale.id);

  const availabilityLabel = deriveTaleAvailabilityLabel(tale, liveTapSlugs);
  const isLiveOnTap    = availabilityLabel === 'ON TAP';
  const editorialLabel = isLiveOnTap ? null : availabilityLabel;

  // ── Sealed state ───────────────────────────────────────────────────────
  if (!isUnlocked) {
    return (
      <div className="page active px-screen tale-detail-page" id="page-story">
        <RecordHeader
          tale={tale}
          onBack={() => nav('tales')}
          showCan={false}
          plates={
            <>
              {isLiveOnTap && <RecordChip tone="live">ON TAP</RecordChip>}
              <RecordChip tone="sealed">SEALED</RecordChip>
            </>
          }
        />
        <div className="tale-detail-wrap">
          <div className="tale-detail-sealed">
            <div className="tale-detail-sealed-stamp" aria-hidden="true">
              <TsIcon icon="locked-seal" />
            </div>
            <h2 className="tale-detail-sealed-title">THIS TALE IS STILL SEALED.</h2>
            <p className="tale-detail-sealed-copy">
              Scan this Trackside Tale to break the seal — the story opens,
              your Passport takes its first stamp, and the challenge waits
              at the end.
            </p>
            <button
              type="button"
              className="tale-detail-action tale-detail-action--primary"
              onClick={() => nav('scan')}
              aria-label="Start scanning"
            >
              ⌗ START SCANNING
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Unlocked state ─────────────────────────────────────────────────────
  // P.15c: the game CTA is always unavailable in preview mode.
  // GAME.4: the registry replaces the old hard-coded three-Tale-id list —
  // a game is enabled iff this Tale has a registered GameDefinition.
  const gameEnabled = !previewMode && gameDefinition !== undefined;
  const showAsEarned     = hasGameBadge;
  const showAsActive     = gameEnabled && !hasGameBadge;
  const showAsComingSoon = !gameEnabled && !hasGameBadge;
  const totalMarks       = (hasScanBadge ? 1 : 0) + (hasGameBadge ? 1 : 0);

  // Lifecycle/persistence metadata strip (editorial only — ON TAP is a
  // hero chip). Omitted entirely when empty.
  const storyMetaFragments: string[] = [];
  if (editorialLabel) storyMetaFragments.push(editorialLabel);
  if (collected) storyMetaFragments.push(`COLLECTED ${formatDate(collected).toUpperCase()}`);
  if (tale.retiredDate) storyMetaFragments.push(`RETIRED ${formatDate(tale.retiredDate).toUpperCase()}`);
  const storyMetaText = storyMetaFragments.join(' · ');

  const hasPersonHeading = tale.person.name.trim().length > 0;
  const hasPersonDates   = tale.person.dates.trim().length > 0;
  const hasPersonBio     = tale.personBio.trim().length > 0;
  const factRows = [
    { label: 'WHO',      value: tale.barSummary?.who ?? '' },
    { label: 'WHY HERE', value: tale.barSummary?.why ?? '' },
    { label: 'THE BEER', value: tale.barSummary?.beer ?? '' },
  ].filter((fact) => fact.value.trim().length > 0);
  const hasSummaryContent =
    hasPersonHeading || hasPersonBio || factRows.length > 0;

  return (
    <div className="page active px-screen tale-detail-page" id="page-story">

      <RecordHeader
        tale={tale}
        onBack={previewMode ? undefined : () => nav('tales')}
        showCan
        plates={
          <>
            {isLiveOnTap && <RecordChip tone="live">ON TAP</RecordChip>}
            <RecordChip tone={hasScanBadge ? 'unlocked' : 'sealed'}>
              {hasScanBadge ? 'UNLOCKED' : 'SEALED'}
            </RecordChip>
          </>
        }
      />

      <div className="tale-detail-wrap">

        {/* ── Dossier folio — the identity evidence ── */}
        {hasSummaryContent && (
          <section className="tale-detail-section">
            <div className="tale-detail-section-head">
              <span className="tale-detail-label">The Dossier</span>
            </div>
            <div className="tale-detail-folio">
              <div className="tale-detail-folio-head">
                {tale.image && (
                  <div className="tale-detail-portrait" aria-hidden="true">
                    <img src={tale.image} alt="" />
                  </div>
                )}
                <div className="tale-detail-folio-id">
                  {hasPersonHeading && (
                    <h2 className="tale-detail-person">{tale.person.name}</h2>
                  )}
                  {hasPersonDates && (
                    <div className="tale-detail-dates">{tale.person.dates}</div>
                  )}
                  {hasPersonBio && (
                    <p className="tale-detail-bio">{tale.personBio}</p>
                  )}
                </div>
              </div>
              {factRows.length > 0 && (
                <dl className="tale-detail-facts">
                  {factRows.map((fact) => (
                    <div key={fact.label} className="tale-detail-fact">
                      <dt className="tale-detail-fact-lbl">{fact.label}</dt>
                      <dd className="tale-detail-fact-txt">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </section>
        )}

        {/* ── Story — the editorial reading column ── */}
        <section className="tale-detail-section">
          <div className="tale-detail-section-head">
            <span className="tale-detail-label">The Story</span>
            {storyMetaText && (
              <span className="tale-detail-story-meta">{storyMetaText}</span>
            )}
          </div>
          <article className="tale-detail-story" aria-label="Tale story">
            {tale.story.map((block, i) => {
              if (block.type === 'quote') {
                return (
                  <blockquote key={i} className="tale-detail-quote">
                    <span>"{block.text}"</span>
                    {block.cite && <cite>{block.cite}</cite>}
                  </blockquote>
                );
              }
              return (
                <p key={i} dangerouslySetInnerHTML={{ __html: block.text || '' }} />
              );
            })}
          </article>
        </section>

        {/* ── Map — the place on the survey grid ── */}
        {tale.pins.length > 0 && (
          <section className="tale-detail-section">
            <div className="tale-detail-section-head">
              <span className="tale-detail-label">{tale.mapTitle}</span>
            </div>
            <div className="tale-detail-map" aria-label={tale.mapTitle}>
              <div className="tale-detail-map-canvas">
                {tale.pins.slice(0, 4).map((pin) => (
                  <div
                    key={pin.label}
                    className="tale-detail-pin"
                    style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                  >
                    <span className="tale-detail-pin-dot" aria-hidden="true" />
                    <span className="tale-detail-pin-label">{pin.label}</span>
                  </div>
                ))}
              </div>
              <div className="tale-detail-map-foot">
                {tale.year ? `${tale.year} GRID REFERENCE` : 'GRID REFERENCE'}
              </div>
            </div>
          </section>
        )}

        {/* ── Timeline — route chronology ── */}
        {tale.timeline && tale.timeline.length > 0 && (
          <section className="tale-detail-section">
            <div className="tale-detail-section-head">
              <span className="tale-detail-label">A Life in the Valley</span>
            </div>
            <div className="tale-detail-timeline">
              <div
                className="tale-detail-timeline-track"
                role="region"
                aria-label="Historical timeline — scrolls horizontally"
                tabIndex={0}
                ref={timelineTrackRef}
                onScroll={(e) => updateTimelineEdges(e.currentTarget)}
              >
                {tale.timeline.map((ev, i) => (
                  <div
                    key={i}
                    className={`tale-detail-timeline-node${ev.major ? ' tale-detail-timeline-node--major' : ''}`}
                  >
                    <div className="tale-detail-medallion" aria-hidden="true">
                      <TsIcon icon={timelineIcon(ev.event)} />
                    </div>
                    <div className="tale-detail-timeline-year">{ev.year}</div>
                    <div className="tale-detail-timeline-event">{ev.event}</div>
                    {ev.detail && <div className="tale-detail-timeline-detail">{ev.detail}</div>}
                  </div>
                ))}
              </div>
              <p className="tale-detail-timeline-hint" aria-hidden="true">
                Swipe to continue the timeline →
              </p>
            </div>
          </section>
        )}

        {/* ── Climax — scan → read → challenge → passport ── */}
        <section className="tale-detail-section">
          <div className="tale-detail-section-head">
            <span className="tale-detail-label">Interactive Challenge</span>
          </div>
          <div className="tale-detail-climax">
            {/* The collection route — every step derived from existing
                badge state; READ is simply where the reader is now. */}
            <ol className="tale-detail-route" aria-label="Collection progress">
              <li className={`tale-detail-route-stop${hasScanBadge ? ' tale-detail-route-stop--done' : ''}`}>
                SCAN
              </li>
              <li className="tale-detail-route-stop tale-detail-route-stop--here">
                READ
              </li>
              <li className={`tale-detail-route-stop${hasGameBadge ? ' tale-detail-route-stop--done' : ''}`}>
                CHALLENGE
              </li>
              <li className={`tale-detail-route-stop${totalMarks === 2 ? ' tale-detail-route-stop--done' : ''}`}>
                PASSPORT
              </li>
            </ol>
            <h3 className="tale-detail-game-title">
              {/* GAME.4 — GameDefinition.title is the authoritative
                  public game title (canonical STRIKE THE MATCH for the
                  wooden-match Tale; resolves the old page/overlay
                  mismatches). */}
              {showAsComingSoon || !gameDefinition
                ? 'CHALLENGE COMING SOON'
                : gameDefinition.title}
            </h3>
            <p className="tale-detail-game-copy">
              {showAsEarned
                ? 'Both stamps are in your Trackside Passport. This Tale is fully collected.'
                : showAsActive
                  ? 'Complete the short challenge to earn the second stamp for this Tale.'
                  : "This Tale's challenge is on the way."}
            </p>
            <div className="tale-detail-badge-plate">
              <div
                className={`tale-detail-badge-medallion${hasScanBadge ? '' : ' tale-detail-badge-medallion--locked'}`}
                aria-hidden="true"
              >
                <span className="tale-detail-badge-glyph">◈</span>
                {tale.year && <span className="tale-detail-badge-yr">{tale.year}</span>}
              </div>
              <div className="tale-detail-badge-info">
                <div className="tale-detail-badge-count">BADGE {totalMarks} OF 2</div>
                <div className="tale-detail-badge-title">{tale.scanBadge.title}</div>
              </div>
            </div>
            <div className="tale-detail-actions">
              <button
                type="button"
                className="tale-detail-action tale-detail-action--primary"
                // GAME.16 — the same click atomically freezes the
                // timetable snapshot via the SAME shared composer +
                // helper the Arcade uses (per-page render clock is fine:
                // only one route is active at a time). Tale unlock and
                // launch semantics are unchanged.
                onClick={() => {
                  if (showAsComingSoon) return;
                  setShowGame(true);
                  setLaunchContext(
                    gameDefinition
                      ? getGameLaunchWorldContext(
                          gameDefinition.gameId,
                          getArcadeWorldState({
                            now: new Date(),
                            gameEvents: state.gameEvents,
                          }),
                        )
                      : null,
                  );
                }}
                disabled={showAsComingSoon}
                aria-label={showAsEarned ? 'Replay mini-game' : 'Play mini-game'}
              >
                {showAsEarned && '↻ REPLAY MINI-GAME'}
                {showAsActive && '▶ PLAY MINI-GAME'}
                {showAsComingSoon && 'MINI-GAME COMING SOON'}
              </button>
              {!previewMode && (
                <button
                  type="button"
                  className="tale-detail-action"
                  onClick={() => nav('passport')}
                  aria-label="View passport"
                >
                  ◈ VIEW PASSPORT
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── Next — back into the archive ── */}
        {!previewMode && (
          <section className="tale-detail-section tale-detail-section--next">
            <div className="tale-detail-next">
              <button type="button" className="tale-detail-next-link" onClick={() => nav('tales')}>
                <span className="tale-detail-next-glyph" aria-hidden="true" />
                <span className="tale-detail-next-title">THE TALE ARCHIVE</span>
                <span className="tale-detail-next-desc">Every Tale collected so far.</span>
                <span className="tale-detail-next-arrow" aria-hidden="true">→</span>
              </button>
              <button type="button" className="tale-detail-next-link" onClick={() => nav('scan')}>
                <span className="tale-detail-next-glyph" aria-hidden="true" />
                <span className="tale-detail-next-title">SCAN ANOTHER CAN</span>
                <span className="tale-detail-next-desc">The next story is on the shelf.</span>
                <span className="tale-detail-next-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        )}

        <div className="tale-detail-foot-space" />
      </div>

      {showGame && gameDefinition && (
        <GameOverlay
          definition={gameDefinition}
          onClose={() => {
            setShowGame(false);
            // GAME.16 — the snapshot dies with the session; a reopen
            // takes a fresh helper evaluation (null once credited).
            setLaunchContext(null);
          }}
          onBadgeAwarded={handleBadgeAwarded}
          alreadyEarned={hasGameBadge}
          successBadgeIcon={tale.gameBadge.icon}
          successBadgeTitle={tale.gameBadge.title}
          guestId={guestId}
          // GAME.6 — personal-best persistence (AppContext-owned).
          // Entirely separate from the badge callback above.
          onResult={recordGameResult}
          // GAME.16 — identical contract to the Arcade mount: frozen
          // event identity + reducer-observed credit transition, derived
          // every render; the gameId guard protects against any stale
          // snapshot contextualizing the wrong game (this mount is
          // unkeyed).
          timetableContext={
            launchContext && launchContext.gameId === gameDefinition.gameId
              ? {
                  eventName: launchContext.eventName,
                  runRecorded: isLaunchRunRecorded(launchContext, state.gameEvents),
                }
              : null
          }
        />
      )}

    </div>
  );
}
