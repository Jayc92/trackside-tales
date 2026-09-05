import React, { useState } from 'react';
import { useApp } from '../app/AppContext';
import { Tale } from '../app/types';
import { GameOverlay } from '../games/GameOverlay';
import { GameDefinition, getAllGameDefinitions } from '../games/registry';
import { MASTERY_TIER_LABELS, MasteryTier } from '../games/mastery';
import {
  COLLECTIBLE_RARITY_LABELS,
  getEngineerCollectibleForGame,
  getGlobalCollectibles,
} from '../games/collectibles';
import { GameType } from '../games/gameConfigs';
import { EventBoard } from '../components/EventBoard';
import { getEventPresentationModels } from '../games/events';
import { getRankProgress, getTotalXp } from '../games/progression';
import {
  QuestObjective,
  getQuestPresentationModels,
} from '../games/quests';
import { getArcadeWorldState } from '../games/worldState';

// ================== TRACKSIDE ARCADE — the games of the archive ==================
// PUBLIC-v7.4B.GAME.5 — the first player-facing platform surface on the
// GAME.2-4 registry. REAL data only: the catalog is
// getAllGameDefinitions(), Tale association resolves through
// definition.taleId against the existing Tale data, and every visible
// state derives from the authoritative app state:
//
//   SEALED   — the associated Tale is not unlocked (the game cannot
//              launch; the card routes to the Tale's sealed page).
//   PLAYABLE — Tale unlocked, game badge not yet earned.
//   COMPLETE — existing game badge earned (state.gameBadges holds TALE
//              ids — the frozen legacy contract; never GameIds).
//
// Launching reuses the shared production GameOverlay path (GAME.4):
// definition prop, lazy runtime chunk, legacy badge funnel — badge
// award mirrors TaleDetailPage exactly (awardGameBadge(taleId)).
// GAME.6/6B wired onResult → shared PB persistence + real scores;
// GAME.7 adds the mastery stamp (bronze/silver/gold/engineer) on
// COMPLETE cards. Still no XP/ranks/leaderboards (later gates).

// Restrained public descriptors for the frozen internal GameType
// strings (never shown raw). Derived from what each game actually is.
const TYPE_LABELS: Record<GameType, string> = {
  grid:  'PLANNING CHALLENGE',
  spike: 'ROUTE CHALLENGE',
  match: 'PRESERVATION CHALLENGE',
};

type CabinetState = 'sealed' | 'playable' | 'complete';

/** GAME.6 — concise best-run duration: 12150 → "12.2s",
 *  90120 → "1:30.1". Pure; never NaN/negative output. */
function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const tenths = Math.round(ms / 100); // one decisecond precision
  const totalSeconds = tenths / 10;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const rest = totalSeconds - minutes * 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

/** GAME.6B — compact canonical-score display: 8420 → "8,420",
 *  10000 → "10,000". No decimals, no suffix. Pure; guarded like the
 *  duration formatter (hydration already bounds stored scores, so the
 *  guard is defense-in-depth only). */
function formatScore(score: number): string {
  if (!Number.isFinite(score) || score < 0) return '—';
  return Math.round(score).toLocaleString('en-US');
}

/** GAME.7 — the compact next-target line under a mastery stamp (§19).
 *  Thresholds come from the game's own MasteryDefinition — no raw
 *  threshold values live in this component. Engineer criteria use the
 *  definition's player-language label (9,500+ · FLAWLESS · NO HINTS),
 *  never implementation metric names; full completion is implicit
 *  because the game must be won. Engineer itself renders MASTERED. */
function masteryNextLine(def: GameDefinition, tier: MasteryTier): string {
  if (tier === 'bronze') return `NEXT: SILVER · ${formatScore(def.mastery.silverScore)}`;
  if (tier === 'silver') return `NEXT: GOLD · ${formatScore(def.mastery.goldScore)}`;
  if (tier === 'gold') return `NEXT: ENGINEER'S MARK · ${def.mastery.engineerCriteriaLabel}`;
  return 'MASTERED';
}

export function ArcadePage() {
  const { state, tales, nav, navToTale, awardGameBadge, guestId, recordGameResult } = useApp();
  const [activeGame, setActiveGame] = useState<GameDefinition | null>(null);

  // Catalog: registry definitions joined to their Tales. Fail closed —
  // a definition without a resolvable Tale association renders nothing
  // (no fabricated fallback content).
  const catalog = getAllGameDefinitions()
    .map((def) => {
      const tale = def.taleId ? tales.find((t) => t.id === def.taleId) : undefined;
      return tale ? { def, tale } : null;
    })
    .filter((entry): entry is { def: GameDefinition; tale: Tale } => entry !== null);

  const stateFor = (tale: Tale): CabinetState => {
    if (!state.unlocked.has(tale.id)) return 'sealed';
    if (state.gameBadges.has(tale.id)) return 'complete';
    return 'playable';
  };

  const counts = catalog.reduce(
    (acc, { tale }) => {
      acc[stateFor(tale)] += 1;
      return acc;
    },
    { sealed: 0, playable: 0, complete: 0 },
  );

  const activeTale = activeGame?.taleId
    ? tales.find((t) => t.id === activeGame.taleId)
    : undefined;

  // GAME.9B/9E — global artifact presentation (FIRST TICKET plus the
  // cross-game artifacts): ownership truth comes ONLY from
  // state.collectibles (never inferred from badges/mastery). Owned
  // globals render as rows of one strip in stable order; unowned ones
  // are quiet absences — no locked slots, no counts.
  const globalArtifacts = getGlobalCollectibles()
    .filter((def) => state.collectibles[def.collectibleId]);

  // GAME.14 — ONE render instant shared by every time-derived surface
  // on this page, so the rail and the board can never disagree across
  // a boundary microsecond.
  const renderNow = new Date();

  // GAME.10B — special-timetable notices. Models come entirely from
  // the shared events helpers (registered definitions + this profile's
  // version-current participation, status at render time). The
  // production registry is EMPTY, so this is [] and the board renders
  // NOTHING — zero event DOM in production.
  const eventModels = getEventPresentationModels(state.gameEvents, renderNow);

  // GAME.14 — the LINE STATUS world state: a pure, read-only derivation
  // (no storage, no reducer surface). headline === null ⇒ zero rail DOM.
  const worldState = getArcadeWorldState({
    now: renderNow,
    gameEvents: state.gameEvents,
  });

  // GAME.12 — the SERVICE RECORD: rank/progress DERIVED from the XP
  // ledger every render (never stored). Presentation-only — nothing on
  // this page issues XP.
  const rankProgress = getRankProgress(getTotalXp(state.progression));

  // GAME.13 — TRAIN ORDERS: posted quests. Objective progress derives
  // from durable badge/mastery truth; completion truth comes from the
  // quest ledger. Presentation-only — completion is automatic in the
  // result reducer, never here.
  const questModels = getQuestPresentationModels(
    state.quests.completions,
    { gameBadges: state.gameBadges, gameMastery: state.gameMastery },
    new Date(),
  );

  // One calm textual objective line, canonical titles only (never raw
  // GameIds; the registry is the single title authority).
  const questObjectiveLabel = (objective: QuestObjective): string => {
    const title = getAllGameDefinitions().find((d) => d.gameId === objective.gameId)?.title ?? objective.gameId;
    return objective.kind === 'reach-mastery'
      ? `${title} — ${MASTERY_TIER_LABELS[objective.minimumTier]}`
      : `${title} — WIN`;
  };

  return (
    <div className="page active px-screen arcade-page" id="page-arcade">

      {/* ── Head — the arcade marquee ── */}
      <header className="arcade-head">
        <span className="arcade-eyebrow">Trackside Brewing</span>
        <h1 className="arcade-title">TRACKSIDE<br />ARCADE</h1>
        <div className="arcade-brand">THE GAMES OF THE ARCHIVE</div>
        <hr className="arcade-rule" aria-hidden="true" />
        <p className="arcade-sub">
          Every Trackside Tale can unlock a playable challenge. Discover
          the Tale, play its game — and come back to replay it any time.
        </p>
        {/* summary — real registry + state counts only */}
        <div className="arcade-summary" role="status">
          <span className="arcade-summary-item"><b>{counts.playable}</b> PLAYABLE</span>
          <span className="arcade-summary-tick" aria-hidden="true" />
          <span className="arcade-summary-item"><b>{counts.complete}</b> COMPLETE</span>
          <span className="arcade-summary-tick" aria-hidden="true" />
          <span className="arcade-summary-item"><b>{counts.sealed}</b> SEALED</span>
        </div>
        {/* GAME.9B/9E — the GLOBAL artifacts (not game-specific, so
            they live on the marquee, never on an arbitrary card).
            Rendered only from real ownership truth
            (state.collectibles) — quiet absence when unowned, no
            locked placeholders. */}
        {globalArtifacts.length > 0 && (
          <div className="arcade-artifact-strip">
            <span className="arcade-artifact-eyebrow">
              {globalArtifacts.length > 1 ? 'Archive Artifacts' : 'Archive Artifact'}
            </span>
            {globalArtifacts.map((def) => (
              <span
                key={def.collectibleId}
                className="arcade-artifact-row"
                aria-label={`Archive artifact: ${def.name}, ${COLLECTIBLE_RARITY_LABELS[def.rarity]}`}
              >
                <span className="arcade-artifact-name">{def.name}</span>
                <span className="arcade-artifact-rarity">
                  {COLLECTIBLE_RARITY_LABELS[def.rarity]}
                </span>
                <span className="arcade-artifact-desc">{def.shortDescription}</span>
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="arcade-wrap">

        {/* GAME.14 — LINE STATUS rail: one compact textual row, present
            only while a Special Timetable is ACTIVE or UPCOMING (zero
            DOM otherwise). Read-only; section order below never moves. */}
        {worldState.headline && (
          <section className="line-status" aria-label="Line status">
            <span className="line-status-eyebrow">{worldState.headline.eyebrow}</span>
            <p className="line-status-line">
              {worldState.headline.line}
              {worldState.headline.playerNote && (
                <>
                  <span className="line-status-sep" aria-hidden="true">·</span>
                  {worldState.headline.playerNote}
                </>
              )}
            </p>
          </section>
        )}

        {/* GAME.12 — SERVICE RECORD: the player's rank plaque. Compact,
            above the timetable, cabinets stay primary. Textual rank +
            XP line carry the meaning; the thin bar is reinforcement
            (never color-only). */}
        <section className="service-record" aria-labelledby="service-record-heading">
          <div className="service-record-head">
            <span className="service-record-label" id="service-record-heading">
              Service Record
            </span>
          </div>
          <div className="service-record-plaque">
            <span className="service-record-rank">{rankProgress.rank.name}</span>
            <div
              className="service-record-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={rankProgress.percent}
              aria-label={
                rankProgress.next
                  ? `Progress to ${rankProgress.next.name}: ${rankProgress.remaining.toLocaleString('en-US')} XP remaining`
                  : 'Highest rank held'
              }
            >
              <span
                className="service-record-bar-fill"
                style={{ width: `${rankProgress.percent}%` }}
                aria-hidden="true"
              />
            </div>
            <span className="service-record-xp">
              {rankProgress.totalXp.toLocaleString('en-US')} XP
              <span className="service-record-xp-sep" aria-hidden="true">·</span>
              {rankProgress.next
                ? `${rankProgress.remaining.toLocaleString('en-US')} TO ${rankProgress.next.name}`
                : 'HIGHEST RANK HELD'}
            </span>
          </div>
        </section>

        {/* GAME.13 — TRAIN ORDERS: posted quests (renders nothing with
            zero posted quests). Text only — no acceptance, no claim. */}
        {questModels.length > 0 && (
          <section className="train-orders" aria-labelledby="train-orders-heading">
            <div className="train-orders-head">
              <span className="train-orders-label" id="train-orders-heading">
                Train Orders
              </span>
            </div>
            <ul className="train-orders-list">
              {questModels.map((model) => {
                const total = model.definition.objectives.length;
                const noun = model.definition.progressNoun ?? 'COMPLETE';
                return (
                  <li
                    key={model.definition.questId}
                    className={`quest-notice quest-notice--${model.status}`}
                  >
                    <article
                      aria-label={`${model.definition.name} — ${model.status === 'complete' ? 'complete' : model.status === 'expired' ? 'ended' : `${model.satisfiedCount} of ${total}`}`}
                    >
                      <div className="quest-notice-top">
                        <h3 className="quest-notice-name">{model.definition.name}</h3>
                        {model.status !== 'available' && (
                          <span className={`quest-notice-status quest-notice-status--${model.status}`}>
                            {model.status === 'complete' ? 'COMPLETE' : 'ENDED'}
                          </span>
                        )}
                      </div>
                      <p className="quest-notice-desc">{model.definition.description}</p>
                      <ul className="quest-notice-objectives">
                        {model.definition.objectives.map((objective, index) => (
                          <li
                            key={`${objective.kind}:${objective.gameId}`}
                            className={`quest-objective${model.objectiveSatisfied[index] ? ' quest-objective--cleared' : ''}`}
                          >
                            <span className="quest-objective-glyph" aria-hidden="true">
                              {model.objectiveSatisfied[index] ? '●' : '○'}
                            </span>
                            <span className="quest-objective-label">
                              {questObjectiveLabel(objective)}
                            </span>
                            {model.objectiveSatisfied[index] && (
                              <span className="quest-objective-state">CLEARED</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="quest-notice-progress">
                        {model.satisfiedCount} OF {total} {noun}
                      </p>
                      <p className="quest-notice-reward">
                        REWARD
                        <span className="service-record-xp-sep" aria-hidden="true">·</span>
                        {model.definition.xpReward.toLocaleString('en-US')} XP
                      </p>
                    </article>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* GAME.10B — event notices (renders nothing with zero events).
            GAME.11 — ownership truth feeds the optional textual reward
            line; the board itself still never grants anything. */}
        <EventBoard models={eventModels} ownedCollectibles={state.collectibles} />

        {/* ── The cabinets ── */}
        <section className="arcade-section" aria-label="Game catalog">
          <div className="arcade-section-head">
            <span className="arcade-label">The Cabinets</span>
          </div>
          <div className="arcade-cabinets">
            {catalog.map(({ def, tale }) => {
              const cab = stateFor(tale);
              // GAME.6B — truthful personal-best row: only a PERSISTED
              // WON result shows metrics, and hydration guarantees the
              // stored best carries the game's CURRENT scoringVersion
              // (real formula scores — the GAME.6 placeholder era was
              // invalidated wholesale). A legacy badge-holder with no
              // current-version stored result sees no PB until their
              // next replay. Shown on COMPLETE cards only.
              const best = state.gameResultsBest[def.gameId];
              const bestWon = best?.won ? best : null;
              // GAME.7 — displayed mastery tier (§15): the persisted
              // achievement, else the Bronze compatibility floor — a
              // legacy badge-holder completed the game at least once,
              // which IS Bronze (resolved at display time only; no
              // record is synthesized into storage). Shown on COMPLETE
              // cards only (§16): completion still derives solely from
              // gameBadges, so seeded mastery without the badge stays
              // PLAYABLE and renders no tier.
              const masteryTier: MasteryTier | null =
                cab === 'complete'
                  ? state.gameMastery[def.gameId]?.tier ?? 'bronze'
                  : null;
              // GAME.9B — the mapped Engineer artifact renders on its
              // own COMPLETE card only, and ONLY from real ownership
              // (state.collectibles) — a player may hold Engineer
              // MASTERY without owning the artifact yet (G9A real-
              // result acquisition), and an owned artifact stays
              // durable even if mastery data were absent. Never
              // inferred, never cross-game.
              const engineerArtifact = getEngineerCollectibleForGame(def.gameId);
              const ownedArtifact =
                cab === 'complete' &&
                engineerArtifact &&
                state.collectibles[engineerArtifact.collectibleId]
                  ? engineerArtifact
                  : null;
              return (
                <article
                  key={def.gameId}
                  className={`arcade-cab arcade-cab--${cab}`}
                  aria-label={`${def.title} — ${cab === 'sealed' ? 'sealed' : cab === 'complete' ? 'complete' : 'playable'}`}
                >
                  <div className="arcade-cab-marquee">
                    <span className="arcade-cab-type">{TYPE_LABELS[def.type]}</span>
                    <span className={`arcade-chip arcade-chip--${cab}`}>
                      {cab === 'sealed' ? 'SEALED' : cab === 'complete' ? 'COMPLETE' : 'PLAYABLE'}
                    </span>
                  </div>
                  <h3 className="arcade-cab-title">{def.title}</h3>
                  <p className="arcade-cab-tale">
                    From the Tale: <em>{tale.title.replace('\n', ' ')}</em>
                  </p>
                  {cab === 'sealed' ? (
                    <>
                      <p className="arcade-cab-note">
                        This challenge belongs to a Tale you haven't
                        discovered yet.
                      </p>
                      <button
                        type="button"
                        className="arcade-action"
                        onClick={() => navToTale(tale)}
                      >
                        FIND THE TALE <span aria-hidden="true">→</span>
                      </button>
                    </>
                  ) : (
                    <>
                      {cab === 'complete' && bestWon && (
                        <p className="arcade-cab-best">
                          BEST SCORE <b>{formatScore(bestWon.score)}</b>
                          <span className="arcade-cab-best-sep" aria-hidden="true">·</span>
                          BEST RUN <b>{formatDurationMs(bestWon.durationMs)}</b>
                        </p>
                      )}
                      {masteryTier && (
                        <div
                          className={`arcade-mastery arcade-mastery--${masteryTier}`}
                          aria-label={`Mastery: ${MASTERY_TIER_LABELS[masteryTier]}`}
                        >
                          <span className="arcade-mastery-eyebrow">Mastery</span>
                          <span className="arcade-mastery-tier">
                            {MASTERY_TIER_LABELS[masteryTier]}
                          </span>
                          <span className="arcade-mastery-next">
                            {masteryNextLine(def, masteryTier)}
                          </span>
                        </div>
                      )}
                      {ownedArtifact && (
                        <p
                          className="arcade-cab-artifact"
                          aria-label={`Archive artifact: ${ownedArtifact.name}, ${COLLECTIBLE_RARITY_LABELS[ownedArtifact.rarity]}`}
                        >
                          <span className="arcade-cab-artifact-lbl">Collectible</span>
                          <span className="arcade-cab-artifact-name">{ownedArtifact.name}</span>
                          <span className="arcade-cab-artifact-rarity">
                            {COLLECTIBLE_RARITY_LABELS[ownedArtifact.rarity]}
                          </span>
                        </p>
                      )}
                      <button
                        type="button"
                        className="arcade-action arcade-action--primary"
                        onClick={() => setActiveGame(def)}
                      >
                        {cab === 'complete' ? '↻ REPLAY' : '▶ PLAY'}
                      </button>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {/* ── Quiet index back into the system ── */}
        <section className="arcade-section">
          <div className="arcade-section-head">
            <span className="arcade-label">Keep Collecting</span>
          </div>
          <div className="arcade-next">
            <button type="button" className="arcade-next-link" onClick={() => nav('tales')}>
              <span className="arcade-next-glyph" aria-hidden="true" />
              <span className="arcade-next-title">THE TALE ARCHIVE</span>
              <span className="arcade-next-desc">Find the Tales behind the games.</span>
              <span className="arcade-next-arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" className="arcade-next-link" onClick={() => nav('passport')}>
              <span className="arcade-next-glyph" aria-hidden="true" />
              <span className="arcade-next-title">VIEW PASSPORT</span>
              <span className="arcade-next-desc">Your stamps and completed challenges.</span>
              <span className="arcade-next-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        <div className="arcade-foot-space" />
      </div>

      {/* ── Shared production game shell (GAME.4 path) ── */}
      {activeGame && activeTale && (
        <GameOverlay
          // GAME.6B — keyed by GameId: GameOverlay initializes its
          // GameSession (and attempt/result gates) per MOUNT, so a
          // definition swap without remount would seal results under
          // the previous game's identity. Unreachable by touch (the
          // modal covers the page) but reachable by keyboard focus on
          // a background PLAY button; the key forces a clean remount.
          key={activeGame.gameId}
          definition={activeGame}
          onClose={() => setActiveGame(null)}
          // Badge award mirrors TaleDetailPage exactly: ownership stays
          // the TALE id (frozen tb_game_badges contract), never GameId.
          onBadgeAwarded={() => awardGameBadge(activeTale.id)}
          alreadyEarned={state.gameBadges.has(activeTale.id)}
          successBadgeIcon={activeTale.gameBadge.icon}
          successBadgeTitle={activeTale.gameBadge.title}
          guestId={guestId}
          // GAME.6 — same shared personal-best path as Tale Detail.
          onResult={recordGameResult}
        />
      )}
    </div>
  );
}
