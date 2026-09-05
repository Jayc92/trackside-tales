// ================== TRACKSIDE ARCADE — QUESTS (TRAIN ORDERS) ==================
// PUBLIC-v7.4B.GAME.13 — the general-purpose quest layer: explicitly
// POSTED objectives with a visible lifecycle, driven entirely by the
// authoritative progression truths the platform already records. Pure
// model only — persistence lives in AppContext; presentation is the
// Arcade's TRAIN ORDERS board.
//
// ── Quest vs achievement ────────────────────────────────────────────────
// Achievements (mastery, collectibles, XP awards) record accomplishments
// silently when they happen. A QUEST is a posted objective: it appears
// on the board, tracks derived progress toward a finite goal, and
// resolves to COMPLETE (or EXPIRED for a future event-bound order). A
// quest must add a DISTINCT objective experience — a combination of
// systems or an intermediate threshold — never a restatement of one
// existing milestone (GAME.13A §16 policy C).
//
// ── What a quest is NOT (hard boundaries) ───────────────────────────────
// No manual acceptance, no claim button, no counters, no infinite or
// repeatable loops, no currency, no leaderboard, no collectible reward,
// no physical entitlement, no backend authority. Completion is
// automatic, finite, idempotent, and browser-local.
//
// ── State model ─────────────────────────────────────────────────────────
// COMPLETION-ONLY ledger (tb_arcade_quests): live objective progress is
// always DERIVED from durable badge/mastery truth; only completions are
// stored, each freezing its earned xpReward so a retired quest's XP
// stays reconstructable forever (GAME.13B §25). questsVersion doubles
// as the one-time retroactive-initializer marker (the GAME.12 pattern):
// RESET keeps the marker with empty completions, so cleared quests can
// never resurrect.

import type { GameId, GameResult } from './registry';
import { GAME_REGISTRY } from './registry';
import type { GameMasteryRecord, MasteryTier } from './mastery';
import { MASTERY_TIER_RANK } from './mastery';
import type { EventId, GameEventDefinition } from './events';
import { getAllGameEvents, getGameEventStatus } from './events';

// ── Stable quest identity ───────────────────────────────────────────────
// QuestId is durable and migration-sensitive: completion records and XP
// award identities key off it forever. The definition `version` bumps
// ONLY on objective-semantics changes (copy-only edits never bump);
// one durable completion exists per QuestId, and later version changes
// never revoke it.
export type QuestId = 'three-green-signals';

export type QuestAvailability =
  | { kind: 'always' }
  | { kind: 'event'; eventId: EventId };

// ── Objective model (v1: exactly two kinds) ─────────────────────────────
// Both are finite, monotone, and fully reconstructable from durable
// truth — no counters, no PB/score thresholds (the PB store is
// scoring-version-invalidated and therefore an unsafe authority).
export type QuestObjective =
  | { kind: 'reach-mastery'; gameId: GameId; minimumTier: MasteryTier }
  | { kind: 'win-game'; gameId: GameId };

export interface QuestDefinition {
  questId: QuestId;
  name: string;
  description: string;
  version: number;
  availability: QuestAvailability;
  /** Unordered finite set; evaluation and display use declaration
   *  order, satisfaction order is irrelevant. */
  objectives: readonly QuestObjective[];
  /** Copied (frozen) into the completion record and the XP award at
   *  completion time — a later definition change never rewrites
   *  history. */
  xpReward: number;
  /** May existing durable truth complete this quest at the one-time
   *  initializer? REQUIRED true for mastery-threshold quests: tier
   *  upgrades are monotone and unrepeatable, so veterans could never
   *  re-trigger them. Only 'always' quests may be retroactive. */
  retroactive: boolean;
  /** Progress-line noun, e.g. "SIGNALS CLEARED" → "2 OF 3 SIGNALS
   *  CLEARED". Falls back to COMPLETE when omitted. */
  progressNoun?: string;
}

// ── The registry ────────────────────────────────────────────────────────
// Every entry is a REAL posted quest, registered one per approved gate.
// THREE GREEN SIGNALS deliberately FREEZES its three objective
// identities rather than deriving them from the registered-game
// universe: a future fourth game must not silently change an
// already-published order's semantics.
export const QUEST_REGISTRY: Record<QuestId, QuestDefinition> = {
  'three-green-signals': {
    questId: 'three-green-signals',
    name: 'THREE GREEN SIGNALS',
    description:
      'Bring every signal on the line to green — earn SILVER or better in all three Tale games.',
    version: 1,
    availability: { kind: 'always' },
    objectives: [
      { kind: 'reach-mastery', gameId: 'allen-town-grid', minimumTier: 'silver' },
      { kind: 'reach-mastery', gameId: 'packer-rail-line', minimumTier: 'silver' },
      { kind: 'reach-mastery', gameId: 'station-preservation', minimumTier: 'silver' },
    ],
    xpReward: 300,
    retroactive: true,
    progressNoun: 'SIGNALS CLEARED',
  },
};

/** Every registered quest definition, in stable declaration order. */
export function getAllQuests(): QuestDefinition[] {
  return Object.values(QUEST_REGISTRY);
}

// ── Completion record (persisted inside tb_arcade_quests) ───────────────
export interface QuestCompletionRecord {
  questId: string;
  /** The definition version actually completed (provenance). */
  questVersion: number;
  /** result-origin: the completing GameResult.completedAt. backfill:
   *  the strongest historical underlying truth (for mastery
   *  objectives, the MAX achievedAt across the qualifying records —
   *  never an invented earlier moment). */
  completedAt: string;
  origin: 'result' | 'backfill';
  /** FROZEN at completion time. Lets a future progression-store
   *  recovery reconstruct this quest's XP even after the definition is
   *  retired from the live registry. */
  xpReward: number;
}

export interface QuestStore {
  /** Store schema version AND the one-time retroactive-initializer
   *  marker: a store carrying version >= 1 never re-derives — including
   *  the post-RESET empty store. */
  questsVersion: number;
  completions: Record<string, QuestCompletionRecord>;
}

export function createEmptyQuestStore(): QuestStore {
  return { questsVersion: 1, completions: {} };
}

/** Defensible bound for one stored reward (real values are ≤ 1000). */
export const QUEST_XP_REWARD_MAX = 10_000;

// ── Objective evaluation (pure, durable-truth authorities) ──────────────
export interface QuestTruths {
  /** Tale-id completion truth (the frozen badge contract). */
  gameBadges: ReadonlySet<string>;
  /** Durable mastery map (post-result when evaluating a result). */
  gameMastery: Record<string, GameMasteryRecord>;
}

export function isObjectiveSatisfied(
  objective: QuestObjective,
  truths: QuestTruths,
): boolean {
  switch (objective.kind) {
    case 'reach-mastery': {
      const tier = truths.gameMastery[objective.gameId]?.tier;
      // Tier skipping is inherent: gold/engineer rank above silver.
      return (
        tier !== undefined &&
        MASTERY_TIER_RANK[tier] >= MASTERY_TIER_RANK[objective.minimumTier]
      );
    }
    case 'win-game': {
      const taleId =
        objective.gameId in GAME_REGISTRY
          ? GAME_REGISTRY[objective.gameId].taleId
          : undefined;
      return taleId !== undefined && truths.gameBadges.has(taleId);
    }
  }
}

/** How many of a quest's objectives the given durable truth satisfies. */
export function countSatisfiedObjectives(
  definition: QuestDefinition,
  truths: QuestTruths,
): number {
  return definition.objectives.filter((o) => isObjectiveSatisfied(o, truths)).length;
}

// ── Lifecycle ───────────────────────────────────────────────────────────
// available → complete (forever) | expired (event-bound, window over,
// incomplete). No locked, no accepted, no in-progress enum — partial
// progress is data on an available quest. A quest bound to an event
// that has not started yet is simply NOT POSTED (null).
export type QuestStatus = 'available' | 'complete' | 'expired';

export function isQuestAvailable(
  definition: QuestDefinition,
  now: Date | string,
  eventDefinitions: readonly GameEventDefinition[] = getAllGameEvents(),
): boolean {
  if (definition.availability.kind === 'always') return true;
  const bound = definition.availability.eventId;
  const event = eventDefinitions.find((e) => e.eventId === bound);
  return event !== undefined && getGameEventStatus(event, now) === 'active';
}

/** Lifecycle status, or null when the quest is not yet posted (an
 *  event-bound quest before its event starts). Completion is durable:
 *  ANY stored completion for the QuestId means 'complete', regardless
 *  of later definition versions. */
export function getQuestStatus(
  definition: QuestDefinition,
  completions: Record<string, QuestCompletionRecord>,
  now: Date | string,
  eventDefinitions: readonly GameEventDefinition[] = getAllGameEvents(),
): QuestStatus | null {
  if (definition.questId in completions) return 'complete';
  if (definition.availability.kind === 'always') return 'available';
  const event = eventDefinitions.find(
    (e) => definition.availability.kind === 'event' && e.eventId === definition.availability.eventId,
  );
  if (event === undefined) return null; // unbound → never posted
  const status = getGameEventStatus(event, now);
  if (status === 'active') return 'available';
  if (status === 'expired') return 'expired';
  return null; // upcoming → not posted yet
}

// ── Result-driven completion fold (G13B §§15–17) ────────────────────────
/**
 * Fold one terminal result into the completion ledger. Pure and
 * deterministic; returns the SAME reference when nothing newly
 * completes.
 *
 * A quest completes from a result only when ALL hold:
 *   - no completion exists yet for its QuestId
 *   - the quest is AVAILABLE at result.completedAt
 *   - every objective is satisfied by the RESULTING durable truth
 *   - THE RESULT IS RELEVANT (§16 transition authority): at least one
 *     objective transitioned unsatisfied → satisfied BY THIS RESULT.
 *     Already-satisfied-but-uncompleted state (possible only through
 *     store loss or tampering) must never complete opportunistically
 *     from an arbitrary replay — that repair belongs exclusively to
 *     the one-time retroactive initializer.
 *
 * Transition predicates (pre/post reducer truth):
 *   reach-mastery — resulting tier rank >= minimum AND previous tier
 *     rank was below it (tier skips transition every crossed tier).
 *   win-game — this result IS a win of that game and no durable
 *     mastery record existed before it (a win always creates one, so
 *     record-absence marks the first proven win; a legacy pre-GAME.7
 *     badge-holder's next win of that game counts as the transition —
 *     the GAME.11 reconciliation posture, finite by ledger identity).
 */
export function applyResultToQuests(args: {
  result: GameResult;
  previousGameMastery: Record<string, GameMasteryRecord>;
  resultingGameMastery: Record<string, GameMasteryRecord>;
  resultingGameBadges: ReadonlySet<string>;
  currentCompletions: Record<string, QuestCompletionRecord>;
  questDefinitions?: readonly QuestDefinition[];
  eventDefinitions?: readonly GameEventDefinition[];
}): Record<string, QuestCompletionRecord> {
  const {
    result,
    previousGameMastery,
    resultingGameMastery,
    resultingGameBadges,
    currentCompletions,
  } = args;
  if (!result.won) return currentCompletions;
  const questDefinitions = args.questDefinitions ?? getAllQuests();
  const eventDefinitions = args.eventDefinitions ?? getAllGameEvents();
  const resultingTruths: QuestTruths = {
    gameBadges: resultingGameBadges,
    gameMastery: resultingGameMastery,
  };

  const transitioned = (objective: QuestObjective): boolean => {
    switch (objective.kind) {
      case 'reach-mastery': {
        const before = previousGameMastery[objective.gameId]?.tier;
        const after = resultingGameMastery[objective.gameId]?.tier;
        const min = MASTERY_TIER_RANK[objective.minimumTier];
        return (
          after !== undefined &&
          MASTERY_TIER_RANK[after] >= min &&
          (before === undefined || MASTERY_TIER_RANK[before] < min)
        );
      }
      case 'win-game':
        return (
          result.gameId === objective.gameId &&
          previousGameMastery[objective.gameId] === undefined
        );
    }
  };

  let next: Record<string, QuestCompletionRecord> | null = null;
  for (const def of questDefinitions) {
    if (def.questId in currentCompletions) continue;
    if (!isQuestAvailable(def, result.completedAt, eventDefinitions)) continue;
    if (!def.objectives.every((o) => isObjectiveSatisfied(o, resultingTruths))) continue;
    if (!def.objectives.some(transitioned)) continue; // §16 relevance
    next = next ?? { ...currentCompletions };
    next[def.questId] = {
      questId: def.questId,
      questVersion: def.version,
      completedAt: result.completedAt,
      origin: 'result',
      xpReward: def.xpReward,
    };
  }
  return next ?? currentCompletions;
}

// ── One-time retroactive derivation (G13B §22) ──────────────────────────
/** Derive completions an EXISTING player has already earned, from
 *  durable truth only, when the quest store is first initialized.
 *  Applies ONLY to `retroactive: true`, always-available quests (an
 *  event-bound quest's window cannot be reconstructed honestly).
 *  completedAt = the strongest historical underlying truth: the MAX
 *  achievedAt across the objectives' qualifying mastery records, else
 *  the single initialization instant. */
export function deriveRetroactiveQuestCompletions(args: {
  gameBadges: ReadonlySet<string>;
  gameMastery: Record<string, GameMasteryRecord>;
  backfillTimestamp: string;
  questDefinitions?: readonly QuestDefinition[];
}): QuestCompletionRecord[] {
  const { gameBadges, gameMastery, backfillTimestamp } = args;
  const questDefinitions = args.questDefinitions ?? getAllQuests();
  const truths: QuestTruths = { gameBadges, gameMastery };
  const completions: QuestCompletionRecord[] = [];
  for (const def of questDefinitions) {
    if (!def.retroactive || def.availability.kind !== 'always') continue;
    if (!def.objectives.every((o) => isObjectiveSatisfied(o, truths))) continue;
    let strongest: string | null = null;
    for (const objective of def.objectives) {
      const record = gameMastery[objective.gameId];
      if (record && (strongest === null || record.achievedAt > strongest)) {
        strongest = record.achievedAt;
      }
    }
    completions.push({
      questId: def.questId,
      questVersion: def.version,
      completedAt: strongest ?? backfillTimestamp,
      origin: 'backfill',
      xpReward: def.xpReward,
    });
  }
  return completions;
}

/** Fold completion records into a store. PURE and idempotent: existing
 *  QuestIds are never overwritten (completedAt/provenance/xpReward all
 *  frozen); the SAME reference returns when nothing is new. */
export function applyQuestCompletions(
  store: QuestStore,
  records: readonly QuestCompletionRecord[],
): QuestStore {
  const fresh = records.filter((r) => !(r.questId in store.completions));
  if (fresh.length === 0) return store;
  const completions = { ...store.completions };
  for (const r of fresh) completions[r.questId] = r;
  return { questsVersion: store.questsVersion, completions };
}

// ── Hydration sanitization (pure core) ──────────────────────────────────
function isValidStoredQuestCompletion(id: string, raw: unknown): raw is QuestCompletionRecord {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    r.questId === id && typeof id === 'string' && id.length > 0 &&
    typeof r.questVersion === 'number' &&
    Number.isInteger(r.questVersion) && r.questVersion >= 1 &&
    typeof r.completedAt === 'string' && r.completedAt.length > 0 &&
    (r.origin === 'result' || r.origin === 'backfill') &&
    typeof r.xpReward === 'number' && Number.isSafeInteger(r.xpReward) &&
    r.xpReward > 0 && r.xpReward <= QUEST_XP_REWARD_MAX
  );
}

/** Sanitize a parsed store. Returns null when no valid versioned store
 *  exists (missing / malformed / pre-v1) — the caller then runs the
 *  ONE-TIME retroactive initializer and writes the marker. Historical
 *  durability: a completion whose QuestId is no longer in the live
 *  registry is KEPT (completed history survives removed quests, games,
 *  threshold changes, and rollback); malformed children are dropped
 *  individually; a stored FUTURE questsVersion is preserved as-is. */
export function sanitizeStoredQuests(raw: unknown): QuestStore | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.questsVersion !== 'number' ||
    !Number.isInteger(r.questsVersion) ||
    r.questsVersion < 1
  ) return null;
  const completions: Record<string, QuestCompletionRecord> = {};
  if (typeof r.completions === 'object' && r.completions !== null) {
    for (const [id, value] of Object.entries(r.completions as Record<string, unknown>)) {
      if (isValidStoredQuestCompletion(id, value)) completions[id] = value;
    }
  }
  return { questsVersion: r.questsVersion, completions };
}

// ── Presentation projection (pure; TRAIN ORDERS board) ──────────────────
export interface QuestPresentationModel {
  definition: QuestDefinition;
  status: QuestStatus;
  /** Per-objective satisfaction, declaration order. A COMPLETED quest
   *  reports every objective satisfied — the historical completion is
   *  the authority even if live truth later changed. */
  objectiveSatisfied: readonly boolean[];
  satisfiedCount: number;
  completion?: QuestCompletionRecord;
}

/** Board order: available → complete → expired; within a status,
 *  declaration order. Unposted (null-status) quests are omitted. */
const QUEST_STATUS_ORDER: Record<QuestStatus, number> = {
  available: 0,
  complete: 1,
  expired: 2,
};

export function getQuestPresentationModels(
  completions: Record<string, QuestCompletionRecord>,
  truths: QuestTruths,
  now: Date | string,
  questDefinitions: readonly QuestDefinition[] = getAllQuests(),
  eventDefinitions: readonly GameEventDefinition[] = getAllGameEvents(),
): QuestPresentationModel[] {
  const models: QuestPresentationModel[] = [];
  for (const definition of questDefinitions) {
    const status = getQuestStatus(definition, completions, now, eventDefinitions);
    if (status === null) continue;
    const completion = completions[definition.questId];
    const objectiveSatisfied =
      status === 'complete'
        ? definition.objectives.map(() => true)
        : definition.objectives.map((o) => isObjectiveSatisfied(o, truths));
    models.push({
      definition,
      status,
      objectiveSatisfied,
      satisfiedCount: objectiveSatisfied.filter(Boolean).length,
      ...(completion ? { completion } : {}),
    });
  }
  return models.sort(
    (a, b) => QUEST_STATUS_ORDER[a.status] - QUEST_STATUS_ORDER[b.status],
  );
}
