// ================== TRACKSIDE ARCADE — MASTERY ==================
// PUBLIC-v7.4B.GAME.7 — the first Arcade mastery system: BRONZE →
// SILVER → GOLD → ENGINEER'S MARK, per game, earned from the real
// GAME.6B performance scores. Pure model + evaluator only; persistence
// lives in AppContext, presentation in ArcadePage.
//
// ── The three separations (critical invariants) ────────────────────────
//   COMPLETION  = state.gameBadges.has(taleId)   (frozen legacy contract)
//   PERSONAL BEST = state.gameResultsBest[gameId] (GAME.6/6B; may be
//                   version-invalidated when scoring changes)
//   MASTERY     = state.gameMastery[gameId]       (THIS gate)
// Mastery never grants completion, never unlocks a Tale, never touches
// the Passport (GAME.8), and is cosmetic/status progression only.
//
// ── Monotonicity (§5) ──────────────────────────────────────────────────
// Mastery is an ACHIEVEMENT RECORD: none → bronze → silver → gold →
// engineer, never downward. A worse replay cannot reduce it, and — the
// key difference from personal bests — a future scoring/mastery version
// bump must never silently remove an earned tier (see the grandfathering
// notes on GameMasteryRecord below).
//
// ── Bronze compatibility (§6) ──────────────────────────────────────────
// Bronze means "completed the game at least once". A legacy player who
// holds the tale-id game badge is treated as at least Bronze even with
// no mastery record and no current PB — resolved AT DISPLAY TIME
// (ArcadePage), never by synthesizing records into storage. No
// tb_game_badges migration.

import type { GameDefinition, GameId, GameResult } from './registry';
// GAME.17D1 — the approved band→mastery authority: ASSISTED results cap
// at Bronze, STANDARD keeps full canonical rules, unsupported bands
// fail closed to the completion tier. Prospective only — stored tiers
// are durable (the reducer's monotone upgrade rule never downgrades).
import { masteryCapForBand } from './challengePolicy';

// ── Tiers ───────────────────────────────────────────────────────────────
export type MasteryTier = 'bronze' | 'silver' | 'gold' | 'engineer';

/** Strict ordering for monotonic upgrades (higher = better). */
export const MASTERY_TIER_RANK: Record<MasteryTier, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  engineer: 4,
};

/** Public labels. ENGINEER'S MARK is Trackside's highest mastery
 *  distinction (never "platinum"; not a player rank — see §35). */
export const MASTERY_TIER_LABELS: Record<MasteryTier, string> = {
  bronze: 'BRONZE',
  silver: 'SILVER',
  gold: 'GOLD',
  engineer: "ENGINEER'S MARK",
};

// ── Definition model (§9) ───────────────────────────────────────────────
// Data-only variant of the gate's conceptual model: thresholds +
// Engineer predicate inputs live per game, and ONE shared pure
// evaluator (evaluateMastery below) interprets them — cleaner than
// three per-definition closures, same determinism. No UI component
// owns threshold logic; ArcadePage only reads these values for labels.
export interface MasteryDefinition {
  masteryVersion: number;
  /** Score floors for the score-based tiers (canonical 0..10000). */
  silverScore: number;
  goldScore: number;
  engineerScore: number;
  /** ENGINEER'S MARK is deliberately more than a score (§8): it also
   *  requires zero mistakes, zero hints, and the game's full-completion
   *  metric at its required value. A hint-assisted 9,600 stays GOLD —
   *  intentional. */
  engineerCompletionMetric: string;
  engineerCompletionValue: number;
  /** Player-facing Engineer criteria (§19/§20) — plain language only,
   *  never raw metric names. Full completion is implicit in winning. */
  engineerCriteriaLabel: string;
}

// ── The three approved definitions (GAME.7 §7 — do not retune) ─────────
// Thresholds map the reviewed GAME.6B vectors: poor win → Bronze,
// average win → Silver, strong/near-perfect → Silver/Gold, exceptional
// flawless no-hint run → Engineer's Mark. All Engineer floors are
// proven reachable by the GAME.6B real runs (9,925 / 9,844 / 9,860).

export const ALLEN_TOWN_MASTERY: MasteryDefinition = {
  masteryVersion: 1,
  silverScore: 6_500,
  goldScore: 8_500,
  engineerScore: 9_500,
  engineerCompletionMetric: 'placements',
  engineerCompletionValue: 5,
  engineerCriteriaLabel: '9,500+ · FLAWLESS · NO HINTS',
};

export const PACKER_ROUTE_MASTERY: MasteryDefinition = {
  masteryVersion: 1,
  silverScore: 6_600,
  goldScore: 8_600,
  engineerScore: 9_500,
  engineerCompletionMetric: 'placements',
  engineerCompletionValue: 5,
  engineerCriteriaLabel: '9,500+ · FLAWLESS · NO HINTS',
};

export const STATION_PRESERVATION_MASTERY: MasteryDefinition = {
  masteryVersion: 1,
  silverScore: 6_200,
  goldScore: 8_400,
  engineerScore: 9_500,
  engineerCompletionMetric: 'roomsRestored',
  engineerCompletionValue: 5,
  engineerCriteriaLabel: '9,500+ · FLAWLESS · NO HINTS',
};

// ── Persisted record (§11/§12) ──────────────────────────────────────────
// tb_game_mastery = Record<GameId, GameMasteryRecord>. Deliberately
// minimal: NOT the qualifying GameResult — no score, duration, runtime
// metrics, or Tale content is duplicated here (those live in the PB
// store / result envelope).
//
// GRANDFATHERING POLICY (§12): earned mastery is durable. Hydration
// keeps a record whose masteryVersion/scoringVersion are positive
// integers at or BELOW the game's current versions (an achievement
// earned under v1 rules survives a v2 tuning pass; a future result
// evaluated under v2 may RAISE the tier, never lower it). Records
// claiming an UNSUPPORTED FUTURE version fail closed and are ignored.
export interface GameMasteryRecord {
  gameId: GameId;
  tier: MasteryTier;
  /** MasteryDefinition version the tier was earned under. */
  masteryVersion: number;
  /** ScoringSpec version of the qualifying result. */
  scoringVersion: number;
  /** ISO timestamp — recordkeeping only, never behavior. */
  achievedAt: string;
}

// ── Pure evaluator (§10) ────────────────────────────────────────────────
/** Read one metric strictly: only a real, finite number counts. Missing
 *  or malformed metrics can never satisfy an Engineer predicate. */
function strictMetric(metrics: Record<string, number>, key: string): number | null {
  const value = metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Evaluate the mastery tier one sealed GameResult qualifies for.
 * Deterministic and side-effect free.
 *
 *   loss                        → null
 *   win                         → at least 'bronze'
 *   then highest qualifying tier wins (engineer → gold → silver).
 *
 * SCORE-VERSION SAFETY (§10/§30): score-based tiers (silver+) are only
 * granted when the result's scoringVersion matches the definition's
 * CURRENT scoring spec version — stale scoring data (e.g. a GAME.6
 * placeholder 5000) can complete a game (Bronze is completion-based)
 * but can never buy Silver/Gold/Engineer.
 */
export function evaluateMastery(
  definition: GameDefinition,
  result: GameResult,
): MasteryTier | null {
  if (result.gameId !== definition.gameId) return null;
  if (!result.won) return null;

  // GAME.17D1 — band authority (approved matrix): only a 'full'-cap
  // band may earn score-based tiers. ASSISTED (bronze cap) and any
  // unsupported band (fail closed) still complete the game — Bronze is
  // completion-based — but can never buy Silver/Gold/Engineer, no
  // matter the score or metrics. This caps what THIS RESULT can earn;
  // durable higher tiers are untouched by the monotone upgrade rule.
  if (masteryCapForBand(result.difficultyBand) !== 'full') {
    return 'bronze';
  }

  const mastery = definition.mastery;
  const scoreTrusted =
    result.scoringVersion === definition.scoring.scoringVersion;

  if (scoreTrusted) {
    if (result.score >= mastery.engineerScore) {
      const mistakes = strictMetric(result.metrics, 'mistakes');
      const hintsUsed = strictMetric(result.metrics, 'hintsUsed');
      const completion = strictMetric(
        result.metrics, mastery.engineerCompletionMetric,
      );
      if (
        mistakes === 0 &&
        hintsUsed === 0 &&
        completion === mastery.engineerCompletionValue
      ) {
        return 'engineer';
      }
    }
    if (result.score >= mastery.goldScore) return 'gold';
    if (result.score >= mastery.silverScore) return 'silver';
  }
  return 'bronze';
}

/** PUBLIC-v7.4B.GAME.8 — the ONE shared display-tier resolution rule
 *  for every surface that presents mastery (Arcade cabinets, Passport
 *  endorsements, future surfaces):
 *
 *    not completed          → null   (mastery renders only on top of
 *                                     the surface's completion notion —
 *                                     seeded mastery without completion
 *                                     is never presented as earned)
 *    completed, persisted   → the persisted tier
 *    completed, no record   → 'bronze' (legacy compatibility floor:
 *                                     completion IS Bronze; display
 *                                     only — nothing is synthesized
 *                                     into storage)
 *
 *  Callers pass their own `completed` (Arcade: gameBadges.has(taleId);
 *  Passport: SCAN + CHLG both stamped). ArcadePage currently inlines
 *  this same rule (GAME.7) — swapping it onto this helper is deferred
 *  cleanup, since GAME.8's scope excludes ArcadePage edits. */
export function resolveDisplayMasteryTier(
  persistedTier: MasteryTier | undefined,
  completed: boolean,
): MasteryTier | null {
  if (!completed) return null;
  return persistedTier ?? 'bronze';
}

/** Monotonic upgrade check (§14): true only when the candidate tier
 *  strictly outranks the incumbent. null candidate (loss) and
 *  equal/lower tiers never upgrade — callers keep existing state
 *  references and skip storage writes in that case. */
export function isTierUpgrade(
  candidate: MasteryTier | null,
  incumbent: MasteryTier | undefined,
): boolean {
  if (candidate === null) return false;
  if (incumbent === undefined) return true;
  return MASTERY_TIER_RANK[candidate] > MASTERY_TIER_RANK[incumbent];
}

/** Build the persisted achievement record for a newly earned tier.
 *  `achievedAt` is injectable for deterministic tests. */
export function createMasteryRecord(
  definition: GameDefinition,
  tier: MasteryTier,
  achievedAt: string = new Date().toISOString(),
): GameMasteryRecord {
  return {
    gameId: definition.gameId,
    tier,
    masteryVersion: definition.mastery.masteryVersion,
    scoringVersion: definition.scoring.scoringVersion,
    achievedAt,
  };
}
