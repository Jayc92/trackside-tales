// ================== TRACKSIDE ARCADE — RUN REWARD SUMMARY (v1) ==================
// PUBLIC-v7.4B.GAME.22B — the pure, versioned presentation model for the
// future result ledger (GAME.22C) and the Arcade NEXT DEPARTURE surface
// (GAME.22F). DERIVE, DON'T RE-AWARD: this module REPORTS the settled
// authority outcome carried by PostRunFacts (reference-diff observation
// of one RECORD_GAME_RESULT dispatch) plus the AFTER snapshot the
// launching page already holds. It never dispatches, never persists,
// never re-runs an evaluator, never compares PBs, and never reads a
// clock — `now` is result.completedAt or an explicit input.
//
// The summary sits BESIDE GAME.19 commentary. It does not replace, feed,
// or reorder commentary, and it renders nothing itself.

import type { GameId } from './registry';
import { GAME_REGISTRY } from './registry';
import type { MasteryTier } from './mastery';
import { MASTERY_TIER_LABELS } from './mastery';
import type { CollectibleDefinition, CollectibleId, CollectibleRarity } from './collectibles';
import { COLLECTIBLE_RARITY_LABELS, COLLECTIBLE_REGISTRY } from './collectibles';
import type { GameEventDefinition } from './events';
import { getAllGameEvents, getGameEventStatus } from './events';
import type { QuestDefinition } from './quests';
import { getAllQuests } from './quests';
import type { XpAwardId } from './progression';
import { getRankPath, getRankProgress } from './progression';
import type { PostRunBeforeSnapshot, PostRunFacts } from './postRunFacts';
import type { DispatchObjectiveState, NextObjective } from './nextObjective';
import { getNextMasteryObjectiveLabel, resolveNextObjective } from './nextObjective';
import type { GameDefinition } from './registry';

// Re-exported so presentation code has one import for mastery objective copy.
export {
  formatScoreValue,
  getMasteryCriteriaLabel,
  getNextMasteryObjectiveLabel,
  getNextMasteryTier,
} from './nextObjective';

export const RUN_REWARD_SUMMARY_VERSION = 1 as const;

export type RunOrigin = 'tale' | 'arcade';
export type PbKind = 'none' | 'first' | 'improved';

export interface RunRewardXpAward {
  readonly awardId: XpAwardId;
  /** Player-facing source label (never the raw id, never a version). */
  readonly label: string;
  readonly xp: number;
}

export interface RunRewardPb {
  readonly kind: PbKind;
  /** Present only for 'improved' (signed, exact). */
  readonly scoreDelta?: number;
  readonly durationDeltaMs?: number;
  /** Preserved GAME.18 fact: the canonical ghost child changed with this PB. */
  readonly ghostReplaced: boolean;
}

export interface RunRewardCollectible {
  readonly id: CollectibleId;
  readonly name: string;
  readonly rarity: CollectibleRarity;
  readonly rarityLabel: string;
}

export interface RunRewardTrainOrder {
  readonly questId: string;
  readonly name: string;
  readonly satisfiedBefore: number;
  readonly satisfiedAfter: number;
  readonly total: number;
  readonly completedByThisRun: boolean;
}

export interface RunRewardTimetable {
  readonly eventId: string;
  readonly name: string;
  readonly creditedBefore: number;
  readonly creditedAfter: number;
  readonly total: number;
  readonly creditedByThisRun: boolean;
  readonly completedByThisRun: boolean;
  readonly rewardGranted: boolean;
}

export interface RunRewardSummary {
  readonly summaryVersion: typeof RUN_REWARD_SUMMARY_VERSION;
  readonly outcome: 'won' | 'lost';
  readonly game: { readonly gameId: GameId; readonly title: string; readonly taleId?: string };
  readonly origin: RunOrigin;
  readonly scoring: {
    readonly score: number;
    readonly durationMs: number;
    readonly attempt: number;
    readonly assisted: boolean;
  };
  readonly mastery: {
    readonly candidateTier: MasteryTier | null;
    readonly durableBefore: MasteryTier | null;
    readonly durableAfter: MasteryTier | null;
    readonly promoted: boolean;
    /** Next tier objective from the shipped spec; null once Engineer is held. */
    readonly nextTierLabel: string | null;
  };
  readonly pb: RunRewardPb;
  readonly stamp: { readonly challengeStampEarned: boolean };
  readonly xp: {
    readonly total: number;
    readonly awards: readonly RunRewardXpAward[];
    readonly totalBefore: number;
    readonly totalAfter: number;
  };
  readonly rank: {
    readonly before: string;
    readonly after: string;
    readonly rankedUp: boolean;
    /** Ranks crossed without display — ONE ceremony names `after`. */
    readonly passed: readonly string[];
    readonly next: string | null;
    readonly remainingToNext: number;
  };
  readonly collectibles: readonly RunRewardCollectible[];
  /** Current non-repeatable quest observations (all registered quests). */
  readonly trainOrders: readonly RunRewardTrainOrder[];
  /** The event credited/completed by this run, else the ACTIVE event that
   *  targets this game (informational), else null. Expired events never
   *  appear here; their history stays in facts.eventProgress. */
  readonly timetable: RunRewardTimetable | null;
  readonly race: {
    readonly selected: boolean;
    readonly finishedDeltaMs?: number;
    readonly ahead: boolean;
    readonly behind: boolean;
    readonly even: boolean;
  };
  readonly nextObjective: NextObjective;
}

// ── XP award labelling (GAME.22B §13) ──────────────────────────────────
/** awardId → player-facing source label. Existing product vocabulary:
 *  the tier names (MASTERY_TIER_LABELS), FULL LINE for the all-games
 *  platform bonus (the same condition as the FULL LINE artifact),
 *  TIMETABLE for event participation, the quest's registry name, and the
 *  reserved WEEKLY DISPATCH family for the future 22E order award. Never
 *  the raw id, never a version. Unknown ids fail soft as AWARD. */
export function labelXpAward(
  awardId: string,
  questDefinitions: readonly QuestDefinition[] = getAllQuests(),
): string {
  const parts = awardId.split(':');
  const [family, kind, third] = parts;
  if (family === 'game' && kind === 'first-win') return 'FIRST WIN';
  if (family === 'mastery') {
    if (kind === 'silver') return MASTERY_TIER_LABELS.silver;
    if (kind === 'gold') return MASTERY_TIER_LABELS.gold;
    if (kind === 'engineer') return MASTERY_TIER_LABELS.engineer;
  }
  if (family === 'platform' && kind === 'all-games') return 'FULL LINE';
  if (family === 'event' && kind === 'participation') return 'TIMETABLE';
  if (family === 'event' && kind === 'completion') return 'TIMETABLE COMPLETE';
  if (family === 'quest' && kind === 'completion') {
    const quest = questDefinitions.find((def) => def.questId === third);
    return quest !== undefined ? quest.name : 'TRAIN ORDER';
  }
  if (family === 'order' && kind === 'completion') return 'WEEKLY DISPATCH';
  return 'AWARD';
}

// ── PB classification (GAME.22B §14) ───────────────────────────────────
/** 'first' requires the WIN and hadWinningPbBefore === false (a first
 *  LOSS legitimately seeds the slot under GAME.6 and must read 'none');
 *  'improved' requires a winning prior. Assisted results are never a
 *  canonical PB in authority, so they read 'none' by construction. */
export function classifyPb(facts: Pick<PostRunFacts, 'result' | 'pb'>): RunRewardPb {
  const { pb } = facts;
  if (!facts.result.won || !pb.becamePb) {
    return { kind: 'none', ghostReplaced: pb.ghostReplaced };
  }
  if (pb.hadWinningPbBefore) {
    return {
      kind: 'improved',
      ...(pb.scoreDelta !== undefined ? { scoreDelta: pb.scoreDelta } : {}),
      ...(pb.durationDeltaMs !== undefined ? { durationDeltaMs: pb.durationDeltaMs } : {}),
      ghostReplaced: pb.ghostReplaced,
    };
  }
  return { kind: 'first', ghostReplaced: pb.ghostReplaced };
}

// ── Collectible presentation state (GAME.22B §25) ──────────────────────
export type CollectiblePresentationState = 'owned' | 'sealed' | 'closed';

/** owned regardless of date; an event-limited artifact whose window has
 *  expired and is not owned reads 'closed' (visible, never earnable);
 *  everything else unowned reads 'sealed'. */
export function getCollectiblePresentationState(
  definition: CollectibleDefinition,
  owned: boolean,
  now: string,
  eventDefinitions: readonly GameEventDefinition[] = getAllGameEvents(),
): CollectiblePresentationState {
  if (owned) return 'owned';
  if (definition.source.kind === 'event-completion') {
    const eventId = definition.source.eventId;
    const eventDef = eventDefinitions.find((def) => def.eventId === eventId);
    if (eventDef === undefined || getGameEventStatus(eventDef, now) === 'expired') return 'closed';
  }
  return 'sealed';
}

// ── The builder (GAME.22B §12) ─────────────────────────────────────────
export interface BuildRunRewardSummaryArgs {
  readonly facts: PostRunFacts;
  readonly after: PostRunBeforeSnapshot;
  readonly origin: RunOrigin;
  /** result.completedAt (or an explicit instant) — the only clock. */
  readonly now: string;
  readonly unlockedTaleIds: ReadonlySet<string>;
  readonly dispatch: DispatchObjectiveState | null;
  readonly raceAvailable: boolean;
  readonly assistedOffered?: boolean;
  readonly registeredGames?: readonly GameDefinition[];
  readonly eventDefinitions?: readonly GameEventDefinition[];
  readonly questDefinitions?: readonly QuestDefinition[];
}

/** Build the v1 summary from settled facts. Deterministic and pure:
 *  identical inputs give deep-equal output; nothing is mutated; unknown
 *  games observe nothing (null), mirroring the reducer's own no-op. */
export function buildRunRewardSummary(args: BuildRunRewardSummaryArgs): RunRewardSummary | null {
  const { facts, after } = args;
  const gameId = facts.result.gameId;
  if (!(gameId in GAME_REGISTRY)) return null;
  const definition = GAME_REGISTRY[gameId];
  const eventDefinitions = args.eventDefinitions ?? getAllGameEvents();
  const questDefinitions = args.questDefinitions ?? getAllQuests();

  const awards: RunRewardXpAward[] = facts.xp.newAwards.map((award) => ({
    awardId: award.awardId,
    label: labelXpAward(award.awardId, questDefinitions),
    xp: award.xp,
  }));
  const total = awards.reduce((sum, award) => sum + award.xp, 0);
  const rankPath = getRankPath(facts.xp.totalXpBefore, facts.xp.totalXpAfter);
  const rankProgress = getRankProgress(facts.xp.totalXpAfter);

  const collectibles: RunRewardCollectible[] = facts.collectibles.newlyAcquired.map((id) => {
    const def = COLLECTIBLE_REGISTRY[id];
    return { id, name: def.name, rarity: def.rarity, rarityLabel: COLLECTIBLE_RARITY_LABELS[def.rarity] };
  });

  // The current timetable: credited/completed by this run first; else the
  // ACTIVE event targeting this game (informational); expired never.
  const credited = facts.eventProgress.find((e) => e.creditedByThisRun || e.completedByThisRun);
  const targeted = facts.eventProgress.find((e) => {
    if (e.status !== 'active') return false;
    const def = eventDefinitions.find((candidate) => candidate.eventId === e.eventId);
    return def !== undefined && def.gameIds.includes(gameId);
  });
  const chosen = credited ?? targeted ?? null;
  const timetable: RunRewardTimetable | null =
    chosen === null
      ? null
      : {
          eventId: chosen.eventId,
          name: chosen.name,
          creditedBefore: chosen.creditedBefore,
          creditedAfter: chosen.creditedAfter,
          total: chosen.total,
          creditedByThisRun: chosen.creditedByThisRun,
          completedByThisRun: chosen.completedByThisRun,
          rewardGranted: chosen.rewardGranted,
        };

  const nextObjective = resolveNextObjective({
    facts,
    after,
    now: args.now,
    unlockedTaleIds: args.unlockedTaleIds,
    dispatch: args.dispatch,
    raceAvailable: args.raceAvailable,
    ...(args.assistedOffered !== undefined ? { assistedOffered: args.assistedOffered } : {}),
    ...(args.registeredGames !== undefined ? { registeredGames: args.registeredGames } : {}),
    eventDefinitions,
    questDefinitions,
  });

  return {
    summaryVersion: RUN_REWARD_SUMMARY_VERSION,
    outcome: facts.result.won ? 'won' : 'lost',
    game: {
      gameId,
      title: definition.title,
      ...(definition.taleId !== undefined ? { taleId: definition.taleId } : {}),
    },
    origin: args.origin,
    scoring: {
      score: facts.result.score,
      durationMs: facts.result.durationMs,
      attempt: facts.result.attempt,
      assisted: facts.difficulty.assisted,
    },
    mastery: {
      candidateTier: facts.mastery.candidateTier,
      durableBefore: facts.mastery.durableBefore,
      durableAfter: facts.mastery.durableAfter,
      promoted: facts.mastery.promoted,
      nextTierLabel: getNextMasteryObjectiveLabel(definition, facts.mastery.durableAfter),
    },
    pb: classifyPb(facts),
    stamp: { challengeStampEarned: facts.stamp.challengeStampEarned },
    xp: {
      total,
      awards,
      totalBefore: facts.xp.totalXpBefore,
      totalAfter: facts.xp.totalXpAfter,
    },
    rank: {
      before: rankPath.before,
      after: rankPath.after,
      rankedUp: rankPath.rankedUp,
      passed: rankPath.passed,
      next: rankProgress.next?.name ?? null,
      remainingToNext: rankProgress.remaining,
    },
    collectibles,
    trainOrders: facts.questProgress.map((q) => ({
      questId: q.questId,
      name: q.name,
      satisfiedBefore: q.satisfiedBefore,
      satisfiedAfter: q.satisfiedAfter,
      total: q.total,
      completedByThisRun: q.completedByThisRun,
    })),
    timetable,
    race: {
      selected: facts.race.selected,
      ...(facts.race.finishedDeltaMs !== undefined ? { finishedDeltaMs: facts.race.finishedDeltaMs } : {}),
      ahead: facts.race.finishedAhead === true,
      behind: facts.race.finishedBehind === true,
      even: facts.race.finishedEven === true,
    },
    nextObjective,
  };
}
