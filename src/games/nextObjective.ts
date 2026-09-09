// ================== TRACKSIDE ARCADE — NEXT-OBJECTIVE RESOLVER ==================
// PUBLIC-v7.4B.GAME.22B — the deterministic "what should I do next" core
// for Arcade Progression II. PURE: no React, no storage, no clock (the
// caller supplies `now`, normally result.completedAt), no navigation, no
// dispatch, no authority. It READS settled truth (the AFTER snapshot the
// launching page already captures) plus explicit inputs and returns one
// objective. Nothing here grants, credits, or persists anything.
//
// ── Frozen priority order (GAME.22B §17) ────────────────────────────────
//   P0  loss                              → TRY AGAIN
//   P1  ACTIVE event, incomplete           → first uncredited event game
//   P2  any game never won                 → first unwon game
//   P3  THREE GREEN SIGNALS incomplete     → first game below Silver
//   P4  weekly dispatch incomplete         → featured game, Silver+
//       (22B receives optional dispatch state only; 22E supplies authority)
//   P5  current game's next mastery tier
//   P6  lowest other game's next mastery tier
//   P7  compatible ghost exists            → RACE YOUR BEST
//   P8  completionist fallback             → LINE COMPLETE (· NEXT DISPATCH POSTS <date>)
// Time-limited beats breadth; breadth beats depth; depth beats optional
// modes. Do not reorder casually — the GAME.22B battery pins every row and
// every collision.
//
// ── Frozen product decisions honoured here ─────────────────────────────
//   • An expired event is never recommended (status evaluated at `now`).
//   • Completionist state: the informational line is LINE COMPLETE (with
//     NEXT DISPATCH POSTS <date> when dispatch state exists); RACE YOUR
//     BEST is the standing action ONLY when a compatible ghost exists and
//     is omitted otherwise. When race is available it is the objective
//     (kind 'race-best') and the LINE COMPLETE state rides in `detail`.
//   • Sealed Tales are never bypassed: a target behind a sealed Tale keeps
//     the Arcade destination with `sealed: true` (the cabinets' existing
//     FIND THE TALE state); scan authority is untouched.

import type { GameDefinition, GameId } from './registry';
import { getAllGameDefinitions } from './registry';
import type { MasteryTier } from './mastery';
import { MASTERY_TIER_LABELS, MASTERY_TIER_RANK } from './mastery';
import type { GameEventDefinition } from './events';
import { getAllGameEvents, getGameEventStatus } from './events';
import type { QuestDefinition } from './quests';
import { countSatisfiedObjectives, getAllQuests, isObjectiveSatisfied, isQuestAvailable } from './quests';
import type { PostRunBeforeSnapshot, PostRunFacts } from './postRunFacts';

// ── Types (GAME.22B §16) ────────────────────────────────────────────────
export type NextObjectiveKind =
  | 'retry'
  | 'event-game'
  | 'first-win'
  | 'quest-signal'
  | 'weekly-dispatch'
  | 'mastery-current'
  | 'mastery-other'
  | 'race-best'
  | 'line-complete';

/** Destination surfaces are limited in 22B to the overlay's own replay,
 *  the Arcade (a named cabinet), or "return to origin". */
export type NextObjectiveSurface = 'replay' | 'arcade' | 'origin';

export type NextObjectiveReason = 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8';

export interface NextObjectiveDestination {
  readonly surface: NextObjectiveSurface;
  readonly gameId?: GameId;
  /** Arcade destinations only: the target's Tale is still sealed, so the
   *  cabinet is in its FIND THE TALE state. Never bypasses scan authority. */
  readonly sealed?: boolean;
}

export interface NextObjective {
  readonly kind: NextObjectiveKind;
  /** Player-facing headline, frozen vocabulary (see NEXT_OBJECTIVE_COPY). */
  readonly text: string;
  /** Optional player-facing supporting line. */
  readonly detail?: string;
  readonly destination: NextObjectiveDestination;
  /** The priority rung that won — for tests and for a future ledger note. */
  readonly reason: NextObjectiveReason;
  /** GAME.22D — the mastery tier the objective asks for (quest-signal
   *  reach-mastery, weekly-dispatch, mastery-current, mastery-other), so
   *  the direction layer labels its action truthfully without parsing
   *  `text`. Absent for retry / event-game / first-win / race / line-complete. */
  readonly targetTier?: MasteryObjectiveTier;
}

/** GAME.22B §21 — the FUTURE weekly-dispatch state, supplied by the caller
 *  (22E authority) and never computed, persisted, or granted here. */
export interface DispatchObjectiveState {
  readonly orderId: string;
  readonly periodId: string;
  readonly featuredGameId: GameId;
  readonly complete: boolean;
  readonly requiredTier: 'silver';
  /** ISO instant of the next period boundary (Monday 00:00 America/New_York). */
  readonly nextPeriodStart: string;
}

export interface NextObjectiveInput {
  /** The settled facts for THIS result (won/gameId are what the resolver reads). */
  readonly facts: Pick<PostRunFacts, 'result'>;
  /** The AFTER snapshot: settled truth for every game, event, quest, artifact. */
  readonly after: PostRunBeforeSnapshot;
  /** Clock authority — result.completedAt or an explicit instant. Never Date.now. */
  readonly now: string;
  /** state.unlocked — decides the `sealed` flag on Arcade destinations. */
  readonly unlockedTaleIds: ReadonlySet<string>;
  readonly dispatch: DispatchObjectiveState | null;
  /** Caller-owned ghost gating (the overlay decides compatibility). */
  readonly raceAvailable: boolean;
  /** Loss only: whether the ASSISTED RUN offer is on screen. */
  readonly assistedOffered?: boolean;
  /** Injectable definitions for deterministic tests; shipped registries default. */
  readonly registeredGames?: readonly GameDefinition[];
  readonly eventDefinitions?: readonly GameEventDefinition[];
  readonly questDefinitions?: readonly QuestDefinition[];
}

/** Frozen player-facing vocabulary (GAME.22A/22B). */
export const NEXT_OBJECTIVE_COPY = {
  retry: 'TRY AGAIN',
  assistedAvailable: 'ASSISTED RUN AVAILABLE',
  raceBest: 'RACE YOUR BEST',
  lineComplete: 'LINE COMPLETE',
  sealedHint: 'FIND THE TALE TO UNLOCK THIS CHALLENGE',
  dispatchPosts: 'NEXT DISPATCH POSTS',
  standardRun: 'STANDARD RUN',
} as const;

/** The dispatch calendar zone — frozen product decision (GAME.22B §1A). */
export const DISPATCH_DISPLAY_TIME_ZONE = 'America/New_York';

// ── Mastery objective helpers (pure reads of the shipped definitions) ──
/** The tiers that can be a NEXT objective (Bronze is completion itself). */
export type MasteryObjectiveTier = 'silver' | 'gold' | 'engineer';

/** bronze/none → silver → gold → engineer → null. */
export function getNextMasteryTier(tier: MasteryTier | null): MasteryObjectiveTier | null {
  if (tier === null || tier === 'bronze') return 'silver';
  if (tier === 'silver') return 'gold';
  if (tier === 'gold') return 'engineer';
  return null;
}

/** Deterministic en-US grouping ("9,500"), matching the Arcade cabinets. */
export function formatScoreValue(value: number): string {
  return value.toLocaleString('en-US');
}

/** The criteria line for reaching `tier` in `definition`, read from the
 *  shipped MasteryDefinition — no threshold table is duplicated here. */
export function getMasteryCriteriaLabel(
  definition: GameDefinition,
  tier: MasteryObjectiveTier,
): string {
  if (tier === 'silver') return formatScoreValue(definition.mastery.silverScore);
  if (tier === 'gold') return formatScoreValue(definition.mastery.goldScore);
  return definition.mastery.engineerCriteriaLabel;
}

/** "SILVER · 6,500" / "GOLD · 8,500" / "ENGINEER'S MARK · 9,500+ · FLAWLESS
 *  · NO HINTS" for the tier ABOVE `tier`; null once Engineer is held. */
export function getNextMasteryObjectiveLabel(
  definition: GameDefinition,
  tier: MasteryTier | null,
): string | null {
  const next = getNextMasteryTier(tier);
  if (next === null) return null;
  return `${MASTERY_TIER_LABELS[next]} · ${getMasteryCriteriaLabel(definition, next)}`;
}

// ── Dispatch date (display only; the period AUTHORITY is 22E's) ────────
const DISPATCH_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: DISPATCH_DISPLAY_TIME_ZONE,
});

/** "MON SEP 14" in the dispatch calendar zone; null for an unparseable instant. */
export function formatDispatchPostDate(isoInstant: string): string | null {
  const t = Date.parse(isoInstant);
  if (!Number.isFinite(t)) return null;
  return DISPATCH_DATE_FORMAT.format(new Date(t)).replace(',', '').toUpperCase();
}

// ── The resolver (GAME.22B §§17–23) ────────────────────────────────────
const EMPTY_BADGE_SET: ReadonlySet<string> = new Set<string>();

export function resolveNextObjective(input: NextObjectiveInput): NextObjective {
  const games = input.registeredGames ?? getAllGameDefinitions(); // canonical order
  const eventDefinitions = input.eventDefinitions ?? getAllGameEvents();
  const questDefinitions = input.questDefinitions ?? getAllQuests();
  const { after, now } = input;
  const currentGameId = input.facts.result.gameId;
  const won = input.facts.result.won;
  const badges: ReadonlySet<string> = after.gameBadges ?? EMPTY_BADGE_SET;

  const sealedFor = (definition: GameDefinition): boolean =>
    definition.taleId !== undefined && !input.unlockedTaleIds.has(definition.taleId);
  const destinationFor = (definition: GameDefinition): NextObjectiveDestination =>
    definition.gameId === currentGameId
      ? { surface: 'replay', gameId: definition.gameId }
      : { surface: 'arcade', gameId: definition.gameId, sealed: sealedFor(definition) };
  const tierOf = (gameId: GameId): MasteryTier | null => after.gameMastery[gameId]?.tier ?? null;

  // P0 — a loss has exactly one objective: the retry.
  if (!won) {
    return {
      kind: 'retry',
      text: NEXT_OBJECTIVE_COPY.retry,
      ...(input.assistedOffered === true ? { detail: NEXT_OBJECTIVE_COPY.assistedAvailable } : {}),
      destination: { surface: 'replay', gameId: currentGameId },
      reason: 'P0',
    };
  }

  // P1 — an ACTIVE, incomplete event with an uncredited target game.
  for (const eventDef of eventDefinitions) {
    if (getGameEventStatus(eventDef, now) !== 'active') continue; // expired/upcoming: never
    const progress = after.gameEvents[eventDef.eventId];
    const credited =
      progress !== undefined && progress.eventVersion === eventDef.version
        ? progress.completedGameIds
        : [];
    if (progress?.completedAt !== undefined && progress.eventVersion === eventDef.version) continue;
    const targets = games.filter((game) => eventDef.gameIds.includes(game.gameId));
    if (targets.every((game) => credited.includes(game.gameId))) continue; // complete
    const next = targets.find((game) => !credited.includes(game.gameId));
    if (next === undefined) continue;
    return {
      kind: 'event-game',
      text: `NEXT STOP: ${next.title}`,
      detail: `COUNTS TOWARD ${eventDef.name} · ${credited.length} OF ${eventDef.gameIds.length} RECORDED`,
      destination: destinationFor(next),
      reason: 'P1',
    };
  }

  // P2 — breadth first: the first game (canonical order) never won.
  const unwon = games.find((game) => game.taleId !== undefined && !badges.has(game.taleId));
  if (unwon !== undefined) {
    const destination = destinationFor(unwon);
    return {
      kind: 'first-win',
      text: `FIRST WIN: ${unwon.title}`,
      ...(destination.sealed === true ? { detail: NEXT_OBJECTIVE_COPY.sealedHint } : {}),
      destination,
      reason: 'P2',
    };
  }

  // P3 — the standing quest: first game (canonical order) with an unsatisfied objective.
  const truths = { gameBadges: badges, gameMastery: after.gameMastery };
  for (const questDef of questDefinitions) {
    if (questDef.questId in after.quests.completions) continue;
    if (!isQuestAvailable(questDef, now, eventDefinitions)) continue;
    for (const game of games) {
      const objective = questDef.objectives.find(
        (candidate) => candidate.gameId === game.gameId && !isObjectiveSatisfied(candidate, truths),
      );
      if (objective === undefined) continue;
      const satisfied = countSatisfiedObjectives(questDef, truths);
      const text =
        objective.kind === 'reach-mastery'
          ? `${MASTERY_TIER_LABELS[objective.minimumTier]} IN ${game.title}`
          : `WIN ${game.title}`;
      return {
        kind: 'quest-signal',
        text,
        detail: `${satisfied} OF ${questDef.objectives.length} ${questDef.progressNoun ?? 'COMPLETE'}`,
        destination: destinationFor(game),
        reason: 'P3',
        ...(objective.kind === 'reach-mastery' && objective.minimumTier !== 'bronze'
          ? { targetTier: objective.minimumTier }
          : {}),
      };
    }
  }

  // P4 — the weekly dispatch (state supplied by the caller; never computed here).
  if (input.dispatch !== null && !input.dispatch.complete) {
    const featured = games.find((game) => game.gameId === input.dispatch!.featuredGameId);
    if (featured !== undefined) {
      return {
        kind: 'weekly-dispatch',
        text: `THIS WEEK'S DISPATCH: ${featured.title}`,
        detail: `${MASTERY_TIER_LABELS[input.dispatch.requiredTier]} OR BETTER · ${NEXT_OBJECTIVE_COPY.standardRun}`,
        destination: destinationFor(featured),
        reason: 'P4',
        targetTier: input.dispatch.requiredTier,
      };
    }
  }

  // P5 — depth on the game just played.
  const current = games.find((game) => game.gameId === currentGameId);
  if (current !== undefined) {
    const nextTier = getNextMasteryTier(tierOf(current.gameId));
    if (nextTier !== null) {
      return {
        kind: 'mastery-current',
        text: `NEXT: ${MASTERY_TIER_LABELS[nextTier]}`,
        detail: getMasteryCriteriaLabel(current, nextTier),
        destination: { surface: 'replay', gameId: current.gameId },
        reason: 'P5',
        targetTier: nextTier,
      };
    }
  }

  // P6 — depth elsewhere: the other game with the lowest held tier (canonical tie-break).
  let lowest: { game: GameDefinition; nextTier: MasteryObjectiveTier; rank: number } | null = null;
  for (const game of games) {
    if (game.gameId === currentGameId) continue;
    const tier = tierOf(game.gameId);
    const nextTier = getNextMasteryTier(tier);
    if (nextTier === null) continue;
    const rank = tier === null ? 0 : MASTERY_TIER_RANK[tier];
    if (lowest === null || rank < lowest.rank) lowest = { game, nextTier, rank };
  }
  if (lowest !== null) {
    return {
      kind: 'mastery-other',
      text: `${MASTERY_TIER_LABELS[lowest.nextTier]} IN ${lowest.game.title}`,
      detail: getMasteryCriteriaLabel(lowest.game, lowest.nextTier),
      destination: destinationFor(lowest.game),
      reason: 'P6',
      targetTier: lowest.nextTier,
    };
  }

  // P7 / P8 — the line is complete. RACE YOUR BEST is the standing action
  // only when a compatible ghost exists; the LINE COMPLETE state is always
  // present (as `detail` under the race, or as the objective itself).
  const posts =
    input.dispatch !== null ? formatDispatchPostDate(input.dispatch.nextPeriodStart) : null;
  const postsLine = posts !== null ? `${NEXT_OBJECTIVE_COPY.dispatchPosts} ${posts}` : null;
  if (input.raceAvailable) {
    return {
      kind: 'race-best',
      text: NEXT_OBJECTIVE_COPY.raceBest,
      detail:
        postsLine !== null
          ? `${NEXT_OBJECTIVE_COPY.lineComplete} · ${postsLine}`
          : NEXT_OBJECTIVE_COPY.lineComplete,
      destination: { surface: 'replay', gameId: currentGameId },
      reason: 'P7',
    };
  }
  return {
    kind: 'line-complete',
    text: NEXT_OBJECTIVE_COPY.lineComplete,
    ...(postsLine !== null ? { detail: postsLine } : {}),
    destination: { surface: 'origin' },
    reason: 'P8',
  };
}
