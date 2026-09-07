// ================== TRACKSIDE ARCADE — POST-RUN FACT ENVELOPE ==================
// PUBLIC-v7.4B.GAME.19B — the deterministic factual envelope future
// post-run commentary will consume. FACTS OBSERVE AUTHORITY; FACTS
// NEVER BECOME AUTHORITY: nothing here dispatches, awards, scores,
// compares PBs, re-runs eligibility, or persists. This module is PURE —
// no React, no storage, no DOM, no network — and carries NO prose, no
// copy templates, and no commentary of any kind (GAME.19C territory).
//
// ── The observation model (G19A §§12–14) ────────────────────────────────
// Every transition fact is derived from BEFORE/AFTER references around
// one RECORD_GAME_RESULT dispatch. This is exact — not heuristic —
// because every authority fold is reference-gated by construction:
//   gameResultsBest  — reducer spreads only when pbImproved
//   gameMastery      — reducer spreads only on a monotone upgrade
//   collectibles     — applyCollectibleGrants returns `current` when
//                      nothing fresh grants
//   gameEvents       — applyResultToGameEvents returns
//                      `currentProgress` on every non-qualifying result
//   quests           — applyResultToQuests returns `currentCompletions`
//                      unchanged on no-ops
//   progression      — applyXpAwards returns `progression` when no
//                      fresh award exists
// Reference inequality across one dispatch therefore IS the "this
// result caused it" fact. The GAME.19B unit battery re-proves the
// contract mechanically for the exported folds.
//
// ── Ownership (G19B §46) ────────────────────────────────────────────────
//   Launching page — captures the before snapshot per dispatch and
//     builds the PostRunObservation (authority + result + loss facts).
//   GameOverlay    — owns race/session facts (the frozen opponent never
//     leaves the overlay) and merges both into the final PostRunFacts,
//     correlation-checked against ITS OWN last sealed result.
//   This module    — all shapes + all pure derivations for both owners.

import {
  DifficultyBand,
  GAME_REGISTRY,
  GameDefinition,
  GameId,
  GameResult,
  GameResultSummary,
} from './registry';
import type { GhostTrace } from './ghostTrace';
import { GameMasteryRecord, MasteryTier, evaluateMastery } from './mastery';
import { ASSISTED_BAND, getChallengeProfile, masteryCapForBand } from './challengePolicy';
import type { CollectibleOwnershipRecord } from './collectibles';
import { COLLECTIBLE_REGISTRY, CollectibleId } from './collectibles';
import type { GameEventProgress } from './events';
import {
  ArcadeProgression,
  XpAwardId,
  getRankForXp,
  getTotalXp,
} from './progression';
import type { QuestCompletionRecord, QuestStore } from './quests';
import type { GameLaunchWorldContext } from './worldState';

// ── Before snapshot (G19B §6) ───────────────────────────────────────────
/** The minimal per-dispatch baseline: the six authoritative store
 *  REFERENCES (never a deep clone — reducer immutability makes the
 *  frozen references authoritative and free). Captured by the launching
 *  page immediately BEFORE recordGameResult(result), once per dispatch
 *  (retry chains dispatch multiple results; a launch-time-only snapshot
 *  would pair result N with baseline 0). */
export interface PostRunBeforeSnapshot {
  readonly gameResultsBest: Record<string, GameResultSummary>;
  readonly gameMastery: Record<string, GameMasteryRecord>;
  readonly collectibles: Record<string, CollectibleOwnershipRecord>;
  readonly gameEvents: Record<string, GameEventProgress>;
  readonly progression: ArcadeProgression;
  readonly quests: QuestStore;
}

/** Pick the six authoritative references from app state. Shared by both
 *  launch surfaces (Arcade/Tale parity by construction) and reused for
 *  the AFTER observation — one capture path, zero cloning. */
export function capturePostRunBeforeSnapshot(state: {
  gameResultsBest: Record<string, GameResultSummary>;
  gameMastery: Record<string, GameMasteryRecord>;
  collectibles: Record<string, CollectibleOwnershipRecord>;
  gameEvents: Record<string, GameEventProgress>;
  progression: ArcadeProgression;
  quests: QuestStore;
}): PostRunBeforeSnapshot {
  return {
    gameResultsBest: state.gameResultsBest,
    gameMastery: state.gameMastery,
    collectibles: state.collectibles,
    gameEvents: state.gameEvents,
    progression: state.progression,
    quests: state.quests,
  };
}

// ── Correlation (G19B §§41–42) ──────────────────────────────────────────
/** Transient identity binding one observation to one sealed result so a
 *  loss→retry→loss→retry→win chain can never pair result N with
 *  baseline N−1 or after-state N+1. sessionId appears HERE only — it is
 *  deliberately excluded from PostRunFacts.result — and is never
 *  persisted anywhere. */
export interface PostRunCorrelationKey {
  readonly sessionId: string;
  readonly attempt: number;
  readonly completedAt: string;
  readonly gameId: GameId;
}

// ── Session facts (G19B §15 — supplied by GameOverlay only) ─────────────
/** Race facts are session-local by design (GAME.18): the frozen
 *  opponent lives in the overlay and is never read from AppContext. */
export interface PostRunSessionFacts {
  /** True iff a frozen opponent was armed at BEGIN for the run. */
  readonly raceSelected: boolean;
  readonly frozenRaceGhost?: GhostTrace | null;
  /** The last checkpoint pace delta (ms; negative = ahead), if any. */
  readonly lastRaceCheckpointDeltaMs?: number | null;
}

// ── The envelope (G19B §8) — facts only, no prose ───────────────────────
export interface PostRunResultFacts {
  readonly gameId: GameId;
  readonly taleId?: string;
  readonly won: boolean;
  readonly score: number;
  readonly durationMs: number;
  readonly attempt: number;
  readonly difficultyBand: DifficultyBand;
  readonly challengeVersion?: number;
  readonly metrics: Record<string, number>;
}

export interface PostRunPbFacts {
  readonly hadPbSlotBefore: boolean;
  /** A loss-seeded slot (GAME.6 semantics) is NOT a winning PB. */
  readonly hadWinningPbBefore: boolean;
  readonly priorScore?: number;
  readonly priorDurationMs?: number;
  /** True ONLY on the authoritative before→after replacement,
   *  identity-bound to THIS result (§§11–12). Never re-derived from the
   *  comparator, score, duration, or band. */
  readonly becamePb: boolean;
  /** Signed exact deltas, present only when a WINNING prior was
   *  replaced by this result. */
  readonly scoreDelta?: number;
  readonly durationDeltaMs?: number;
  /** True iff the canonical PB's embedded ghost child differs after
   *  this dispatch (added, swapped, or dropped with the parent). */
  readonly ghostReplaced: boolean;
}

export interface PostRunRaceFacts {
  readonly selected: boolean;
  readonly opponentDurationMs?: number;
  readonly lastCheckpointDeltaMs?: number;
  /** result.durationMs − frozen opponent durationMs, wins only.
   *  Speaks ONLY about "the run you raced" — never the canonical PB
   *  (§17: no helper here may map race outcome to PB status). */
  readonly finishedDeltaMs?: number;
  readonly finishedAhead?: boolean;
  readonly finishedBehind?: boolean;
  readonly finishedEven?: boolean;
}

export type EngineerBlocker = 'band' | 'score' | 'mistakes' | 'hints' | 'completion';

export interface PostRunMasteryFacts {
  readonly durableBefore: MasteryTier | null;
  readonly durableAfter: MasteryTier | null;
  /** Authoritative durable transition only (record reference change). */
  readonly promoted: boolean;
  /** What THIS run evaluated to under the one shipped rule — distinct
   *  from durableAfter/promoted ("scored at Gold level" is not "Gold
   *  was newly earned"). */
  readonly candidateTier: MasteryTier | null;
  /** Why this won run did not evaluate to Engineer (null = not
   *  derivable: loss, untrusted scoringVersion, or malformed metric —
   *  a malformed metric must never create a false blocker claim).
   *  G19B §22 INVARIANT for GAME.19C: when difficultyBand is ASSISTED
   *  this reads ['band'] and near-miss commentary MUST be suppressed —
   *  assistance is never framed as what cost the player Engineer. */
  readonly engineerBlockers: readonly EngineerBlocker[] | null;
}

export interface PostRunDifficultyFacts {
  readonly band: DifficultyBand;
  readonly assisted: boolean;
}

export interface PostRunEventFacts {
  /** From the launch-frozen GAME.16 context when one existed. */
  readonly eventName?: string;
  /** Launch context present OR credited by this run. NOTE (documented
   *  boundary): an already-credited replay carries no launch context by
   *  GAME.16's own rules, so it reads false here — the same fact
   *  boundary the shipped stamp uses. */
  readonly targeted: boolean;
  /** Uncredited before AND credited after, for THIS gameId — a pure
   *  record transition; no window/eligibility re-evaluation. */
  readonly creditedByThisRun: boolean;
  /** completedAt absent before AND present after on the same event
   *  record — the whole-event completion caused by this dispatch. */
  readonly eventCompletedByThisRun: boolean;
  /** Alias VIEW over the collectibles diff (provenance kind
   *  'event-completion') — never a second reward evaluation. */
  readonly rewardCollectibleNewlyGranted: boolean;
}

export interface PostRunXpAwardFact {
  readonly awardId: XpAwardId;
  readonly xp: number;
}

export interface PostRunXpFacts {
  readonly newAwards: readonly PostRunXpAwardFact[];
  readonly totalXpBefore: number;
  readonly totalXpAfter: number;
  readonly rankBefore: string;
  readonly rankAfter: string;
  readonly rankedUp: boolean;
}

export interface PostRunQuestCompletionFact {
  readonly questId: string;
  readonly questVersion: number;
  readonly xpReward: number;
}

export interface PostRunQuestFacts {
  readonly newCompletions: readonly PostRunQuestCompletionFact[];
}

export interface PostRunCollectibleFacts {
  /** Registry order (the one existing deterministic order); rarity
   *  prioritization, if ever needed, belongs to GAME.19C. */
  readonly newlyAcquired: readonly CollectibleId[];
}

export interface PostRunLossFacts {
  /** timeLeftSec strictly 0 (the runtimes write the true zero at the
   *  timer-death moment). */
  readonly timeExpired?: boolean;
  /** mistakes strictly equal to the run's profile mistakePool. */
  readonly mistakePoolExhausted?: boolean;
  /** Objectives left at the terminal loss (definition-driven completion
   *  metric); fail-closed undefined on malformed metrics. */
  readonly progressRemaining?: number;
}

export interface PostRunAuthorityFacts {
  readonly result: PostRunResultFacts;
  readonly pb: PostRunPbFacts;
  readonly mastery: PostRunMasteryFacts;
  readonly difficulty: PostRunDifficultyFacts;
  readonly event: PostRunEventFacts;
  readonly xp: PostRunXpFacts;
  readonly quest: PostRunQuestFacts;
  readonly collectibles: PostRunCollectibleFacts;
  readonly loss?: PostRunLossFacts;
}

/** One page-built observation: authority facts bound to one dispatch. */
export interface PostRunObservation {
  readonly correlation: PostRunCorrelationKey;
  readonly authority: PostRunAuthorityFacts;
}

/** The final envelope (authority + overlay session race facts). */
export interface PostRunFacts extends PostRunAuthorityFacts {
  readonly race: PostRunRaceFacts;
}

// ── Metric reads (G19B §37) ─────────────────────────────────────────────
/** Strict finite-number read, pinned to the same semantics as
 *  mastery.ts's module-private strictMetric (that helper is not
 *  exported; the THRESHOLDS all come from the exported definitions, and
 *  the unit battery proves blocker/evaluateMastery parity so these
 *  read semantics can never silently drift). Malformed → null; a
 *  malformed metric never creates a fact, and never rejects the
 *  underlying result. */
function strictMetric(metrics: Record<string, number>, key: string): number | null {
  const value = metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// ── Engineer blockers (G19B §21) ────────────────────────────────────────
/** PURE factual list of why a WON run did not evaluate to Engineer.
 *  Threshold/config values come exclusively from the game's shipped
 *  MasteryDefinition — no independent thresholds exist here. Returns
 *  null when the question is not honestly answerable (loss, untrusted
 *  scoringVersion, malformed metric). A non-'full' band returns
 *  ['band'] ALONE: Engineer is out of reach for the band, and mixing in
 *  performance blockers would fabricate a near-miss framing (§22). */
export function getEngineerBlockers(
  definition: GameDefinition,
  result: GameResult,
): readonly EngineerBlocker[] | null {
  if (!result.won) return null;
  if (masteryCapForBand(result.difficultyBand) !== 'full') return ['band'];
  if (result.scoringVersion !== definition.scoring.scoringVersion) return null;
  const mastery = definition.mastery;
  const mistakes = strictMetric(result.metrics, 'mistakes');
  const hintsUsed = strictMetric(result.metrics, 'hintsUsed');
  const completion = strictMetric(result.metrics, mastery.engineerCompletionMetric);
  if (mistakes === null || hintsUsed === null || completion === null) return null;
  const blockers: EngineerBlocker[] = [];
  if (result.score < mastery.engineerScore) blockers.push('score');
  if (mistakes !== 0) blockers.push('mistakes');
  if (hintsUsed !== 0) blockers.push('hints');
  if (completion !== mastery.engineerCompletionValue) blockers.push('completion');
  return blockers;
}

// ── Loss facts (G19B §§34–36) ───────────────────────────────────────────
/** Metric-derived terminal-loss classification, validated per game by
 *  the GAME.19B batteries. The mistake pool resolves from the run's own
 *  band profile (the same table that tuned the run; historical
 *  constants ≡ the STANDARD rows by the GAME.17 proofs). Facts only —
 *  each field is independently fail-closed on malformed input. */
function deriveLossFacts(
  definition: GameDefinition,
  result: GameResult,
): PostRunLossFacts | undefined {
  if (result.won) return undefined;
  const out: {
    timeExpired?: boolean;
    mistakePoolExhausted?: boolean;
    progressRemaining?: number;
  } = {};
  const timeLeft = strictMetric(result.metrics, 'timeLeftSec');
  if (timeLeft !== null) out.timeExpired = timeLeft === 0;
  const profile = getChallengeProfile(result.gameId, result.difficultyBand);
  const mistakes = strictMetric(result.metrics, 'mistakes');
  if (profile !== null && mistakes !== null) {
    out.mistakePoolExhausted = mistakes === profile.mistakePool;
  }
  const completionMetric = definition.mastery.engineerCompletionMetric;
  const completionTotal = definition.mastery.engineerCompletionValue;
  const completed = strictMetric(result.metrics, completionMetric);
  if (
    completed !== null &&
    Number.isInteger(completed) &&
    completed >= 0 &&
    completed <= completionTotal
  ) {
    out.progressRemaining = completionTotal - completed;
  }
  return out;
}

// ── The page-side builder (G19B §§8–13, 18–33) ──────────────────────────
/**
 * Build one dispatch's authority observation from the sealed result,
 * the per-dispatch BEFORE snapshot, and the AFTER references. PURE
 * OBSERVATION: the only shipped evaluators consulted are the pure
 * fact-safe ones (evaluateMastery for the candidate tier — the single
 * existing mastery rule — plus getTotalXp/getRankForXp); every
 * transition is a reference/identity comparison. Unknown gameIds
 * observe nothing (null), mirroring the reducer's own no-op.
 */
export function buildPostRunObservation(args: {
  result: GameResult;
  before: PostRunBeforeSnapshot;
  after: PostRunBeforeSnapshot;
  /** The page's GAME.16 launch-frozen context (already gameId-guarded
   *  by the caller), consumed where it is already exact — never a
   *  duplicate event system. */
  launchContext?: GameLaunchWorldContext | null;
}): PostRunObservation | null {
  const { result, before, after } = args;
  const launchContext = args.launchContext ?? null;
  if (!(result.gameId in GAME_REGISTRY)) return null;
  const definition = GAME_REGISTRY[result.gameId];

  // — result facts (§9: no sessionId; correlation carries it instead) —
  const resultFacts: PostRunResultFacts = {
    gameId: result.gameId,
    ...(result.taleId !== undefined ? { taleId: result.taleId } : {}),
    won: result.won,
    score: result.score,
    durationMs: result.durationMs,
    attempt: result.attempt,
    difficultyBand: result.difficultyBand,
    ...(result.challengeVersion !== undefined
      ? { challengeVersion: result.challengeVersion }
      : {}),
    metrics: result.metrics,
  };

  // — PB facts (§§10–14) —
  const beforeEntry = before.gameResultsBest[result.gameId];
  const afterEntry = after.gameResultsBest[result.gameId];
  const hadPbSlotBefore = beforeEntry !== undefined;
  const hadWinningPbBefore = beforeEntry?.won === true;
  // becamePb: authoritative replacement, identity-bound to THIS result
  // (§12 — the entry must be a NEW reference whose identity fields all
  // match this dispatch's sealed result; the comparator is never
  // consulted here).
  const becamePb =
    after.gameResultsBest !== before.gameResultsBest &&
    afterEntry !== undefined &&
    afterEntry !== beforeEntry &&
    afterEntry.gameId === result.gameId &&
    afterEntry.completedAt === result.completedAt &&
    afterEntry.score === result.score &&
    afterEntry.durationMs === result.durationMs &&
    afterEntry.difficultyBand === result.difficultyBand &&
    afterEntry.won === result.won;
  const pb: PostRunPbFacts = {
    hadPbSlotBefore,
    hadWinningPbBefore,
    ...(hadWinningPbBefore
      ? { priorScore: beforeEntry.score, priorDurationMs: beforeEntry.durationMs }
      : {}),
    becamePb,
    ...(becamePb && hadWinningPbBefore
      ? {
          scoreDelta: result.score - beforeEntry.score,
          durationDeltaMs: result.durationMs - beforeEntry.durationMs,
        }
      : {}),
    ghostReplaced: becamePb && afterEntry?.ghost !== beforeEntry?.ghost,
  };

  // — mastery facts (§§18–19) —
  const beforeMastery = before.gameMastery[result.gameId];
  const afterMastery = after.gameMastery[result.gameId];
  const mastery: PostRunMasteryFacts = {
    durableBefore: beforeMastery?.tier ?? null,
    durableAfter: afterMastery?.tier ?? null,
    promoted: afterMastery !== beforeMastery && afterMastery !== undefined,
    candidateTier: evaluateMastery(definition, result),
    engineerBlockers: getEngineerBlockers(definition, result),
  };

  // — difficulty facts (§61) —
  const difficulty: PostRunDifficultyFacts = {
    band: result.difficultyBand,
    assisted: result.difficultyBand === ASSISTED_BAND,
  };

  // — collectible diff (§§32–33: observation only, registry order) —
  const newlyAcquired = (Object.keys(COLLECTIBLE_REGISTRY) as CollectibleId[]).filter(
    (id) => id in after.collectibles && !(id in before.collectibles),
  );
  const collectibles: PostRunCollectibleFacts = { newlyAcquired };

  // — event facts (§§23–27: pure record transitions) —
  let creditedByThisRun = false;
  let eventCompletedByThisRun = false;
  if (after.gameEvents !== before.gameEvents) {
    for (const [eventId, afterRecord] of Object.entries(after.gameEvents)) {
      const beforeRecord = before.gameEvents[eventId];
      if (afterRecord === beforeRecord) continue;
      const creditedBefore =
        beforeRecord !== undefined &&
        beforeRecord.eventVersion === afterRecord.eventVersion &&
        beforeRecord.completedGameIds.includes(result.gameId);
      if (afterRecord.completedGameIds.includes(result.gameId) && !creditedBefore) {
        creditedByThisRun = true;
      }
      if (afterRecord.completedAt !== undefined && beforeRecord?.completedAt === undefined) {
        eventCompletedByThisRun = true;
      }
    }
  }
  const rewardCollectibleNewlyGranted = newlyAcquired.some(
    (id) => after.collectibles[id]?.source.kind === 'event-completion',
  );
  const event: PostRunEventFacts = {
    ...(launchContext !== null ? { eventName: launchContext.eventName } : {}),
    targeted: launchContext !== null || creditedByThisRun,
    creditedByThisRun,
    eventCompletedByThisRun,
    rewardCollectibleNewlyGranted,
  };

  // — XP / rank facts (§§28–30: shipped totals + rank helpers only) —
  const newAwards: PostRunXpAwardFact[] =
    after.progression === before.progression
      ? []
      : Object.keys(after.progression.awards)
          .filter((id) => !(id in before.progression.awards))
          .map((id) => ({
            awardId: id as XpAwardId,
            xp: after.progression.awards[id as XpAwardId].xp,
          }));
  const totalXpBefore = getTotalXp(before.progression);
  const totalXpAfter = getTotalXp(after.progression);
  const rankBefore = getRankForXp(totalXpBefore).name;
  const rankAfter = getRankForXp(totalXpAfter).name;
  const xp: PostRunXpFacts = {
    newAwards,
    totalXpBefore,
    totalXpAfter,
    rankBefore,
    rankAfter,
    rankedUp: rankBefore !== rankAfter,
  };

  // — quest diff (§31: observation of what DID happen) —
  const newCompletions: PostRunQuestCompletionFact[] =
    after.quests.completions === before.quests.completions
      ? []
      : Object.entries(after.quests.completions)
          .filter(([id]) => !(id in before.quests.completions))
          .map(([, record]: [string, QuestCompletionRecord]) => ({
            questId: record.questId,
            questVersion: record.questVersion,
            xpReward: record.xpReward,
          }));
  const quest: PostRunQuestFacts = { newCompletions };

  // — loss facts (§§34–36) —
  const loss = deriveLossFacts(definition, result);

  return {
    correlation: {
      sessionId: result.sessionId,
      attempt: result.attempt,
      completedAt: result.completedAt,
      gameId: result.gameId,
    },
    authority: {
      result: resultFacts,
      pb,
      mastery,
      difficulty,
      event,
      xp,
      quest,
      collectibles,
      ...(loss !== undefined ? { loss } : {}),
    },
  };
}

// ── The overlay-side merge (G19B §§15–16, 41–45) ────────────────────────
/**
 * Combine one page observation with the overlay's own session facts
 * into the final PostRunFacts — ONLY when the observation's correlation
 * key matches the overlay's last SEALED result exactly (sessionId +
 * attempt + completedAt + gameId), so a multi-dispatch session can
 * never pair result N with another attempt's transition facts.
 * Race facts speak exclusively about the frozen opponent; nothing here
 * reads or implies PB status (§17).
 */
export function mergePostRunSessionFacts(
  observation: PostRunObservation,
  session: PostRunSessionFacts,
  sealedResult: Pick<GameResult, 'sessionId' | 'attempt' | 'completedAt' | 'gameId'>,
): PostRunFacts | null {
  const key = observation.correlation;
  if (
    key.sessionId !== sealedResult.sessionId ||
    key.attempt !== sealedResult.attempt ||
    key.completedAt !== sealedResult.completedAt ||
    key.gameId !== sealedResult.gameId
  ) {
    return null;
  }
  const frozen = session.frozenRaceGhost ?? null;
  const selected = session.raceSelected && frozen !== null;
  const lastDelta = session.lastRaceCheckpointDeltaMs;
  const won = observation.authority.result.won;
  const finishedDeltaMs =
    selected && won && frozen !== null
      ? observation.authority.result.durationMs - frozen.durationMs
      : undefined;
  const race: PostRunRaceFacts = {
    selected,
    ...(selected && frozen !== null ? { opponentDurationMs: frozen.durationMs } : {}),
    ...(selected && typeof lastDelta === 'number' && Number.isFinite(lastDelta)
      ? { lastCheckpointDeltaMs: lastDelta }
      : {}),
    ...(finishedDeltaMs !== undefined
      ? {
          finishedDeltaMs,
          finishedAhead: finishedDeltaMs < 0,
          finishedBehind: finishedDeltaMs > 0,
          finishedEven: finishedDeltaMs === 0,
        }
      : {}),
  };
  return { ...observation.authority, race };
}
