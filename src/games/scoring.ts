// ================== TRACKSIDE ARCADE — PER-GAME SCORING ==================
// PUBLIC-v7.4B.GAME.6B — the real scoring model replacing the GAME.2
// compatibility placeholder (won → 5000). One ScoringSpec per game,
// each PURE, deterministic, side-effect free, and bounded 0..10000.
//
// ── What each formula scores (from the GAME.6B mechanic audit) ─────────
// All three active games are DECISION-QUALITY games sharing one shape:
// a pool of allowed mistakes + a countdown, win by completing all five
// objectives before either runs out. No timing windows, combos, or
// reaction mechanics exist in any runtime today, so none are scored
// (HONEST METRIC CONTRACT — nothing here is derived from state the
// games don't actually track).
//
//   allen-town-grid      7-mistake pool / 90s  (wrong placement or
//                        wrong unlock-quiz answer both burn a move)
//   packer-rail-line     7-mistake pool / 90s  (wrong junction,
//                        out-of-order lay, or wrong quiz answer)
//   station-preservation 4-match pool / 120s   (wrong preservation
//                        decision burns a match)
//
// ── Common score shape ─────────────────────────────────────────────────
//   completion base                (winning at all)
// + accuracy    × (1 − mistakes/pool)
// + time        × (timeLeftSec/duration)
// + flawless bonus (only when the runtime REPORTED zero mistakes)
// → clamp 0..10000
//
// Weights differ per game (see each spec) because the mechanics differ:
// Packer's route execution has three distinct failure modes, so route
// accuracy carries more weight there; the station game is almost pure
// decision quality (only four matches), so accuracy dominates and the
// completion base is lower. Weights per game sum to exactly 10000
// INCLUDING the flawless bonus, and the theoretical 10000 requires
// timeLeftSec == duration (an instant win), so the practical ceiling
// sits ~9600–9700 — headroom is deliberate for future difficulty bands.
//
// Losses score 0 (GAME.6B §4 posture): partial progress is recorded in
// GameResult.metrics but is not score-bearing yet.
//
// ── Robustness ─────────────────────────────────────────────────────────
// Metrics arrive as an untrusted numeric map. Any missing, NaN,
// non-finite, or out-of-range value falls back to the WORST honest
// value for that axis (mistakes → full pool, timeLeftSec → 0): invalid
// input can never inflate a score. The flawless bonus requires a real
// reported 0, never a fallback.
//
// ── Versioning ─────────────────────────────────────────────────────────
// All three specs are scoringVersion 2 (version 1 was the
// compatibility placeholder). sealGameResult stamps the version onto
// every GameResult, and hydration in AppContext rejects any persisted
// best whose scoringVersion is not the game's CURRENT one — a stored
// "5000" from the placeholder era is never comparable to a real score.

import type { DifficultyBand, GameOutcome, ScoringSpec } from './registry';
import { clampScore } from './registry';
// GAME.17D1 — the Wooden pilot's normalization inputs come from the SAME
// ChallengeProfile that tunes its runtime (the single-source rule: a
// 150s/6-pool assisted run must never be normalized against 120/4).
// Allen/Packer stay on their fixed constants until they are
// profile-wired; their standard profiles are mechanically proven equal
// to those constants by the GAME.17 alignment pins.
import { getChallengeProfile } from './challengePolicy';

/** Read one bounded metric from the untrusted map. Anything missing,
 *  non-numeric, non-finite, or outside [0, max] yields `fallback`
 *  (callers pass the WORST honest value so bad input never helps). */
function boundedMetric(
  metrics: Record<string, number>,
  key: string,
  max: number,
  fallback: number,
): number {
  const value = metrics[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < 0 || value > max) return fallback;
  return value;
}

/** Shared weighted model for the three mistake-pool games. Pure. */
function poolGameScore(
  outcome: GameOutcome,
  tuning: {
    mistakePool: number;
    durationSec: number;
    completionBase: number;
    accuracyWeight: number;
    timeWeight: number;
    flawlessBonus: number;
  },
): number {
  if (!outcome.won) return 0;
  const mistakes = boundedMetric(
    outcome.metrics, 'mistakes', tuning.mistakePool, tuning.mistakePool,
  );
  const timeLeftSec = boundedMetric(
    outcome.metrics, 'timeLeftSec', tuning.durationSec, 0,
  );
  const raw =
    tuning.completionBase +
    tuning.accuracyWeight * (1 - mistakes / tuning.mistakePool) +
    tuning.timeWeight * (timeLeftSec / tuning.durationSec) +
    (mistakes === 0 ? tuning.flawlessBonus : 0);
  return clampScore(raw);
}

/** LAY OUT ALLEN'S TOWN — planning accuracy under a survey clock.
 *  40% completion / 36% accuracy / 20% time / 4% flawless. */
export const ALLEN_TOWN_SCORING: ScoringSpec = {
  scoringVersion: 2,
  score(outcome: GameOutcome, _band: DifficultyBand): number {
    return poolGameScore(outcome, {
      mistakePool: 7,
      durationSec: 90,
      completionBase: 4000,
      accuracyWeight: 3600,
      timeWeight: 2000,
      flawlessBonus: 400,
    });
  },
};

/** BUILD THE LEHIGH VALLEY LINE — route execution quality. Accuracy
 *  weighs highest of the three (wrong junction, out-of-order lay, and
 *  wrong quiz answer are all misroutes); deliberate west→east building
 *  is a virtue, so time weighs least.
 *  40% completion / 38% accuracy / 18% time / 4% flawless. */
export const PACKER_ROUTE_SCORING: ScoringSpec = {
  scoringVersion: 2,
  score(outcome: GameOutcome, _band: DifficultyBand): number {
    return poolGameScore(outcome, {
      mistakePool: 7,
      durationSec: 90,
      completionBase: 4000,
      accuracyWeight: 3800,
      timeWeight: 1800,
      flawlessBonus: 400,
    });
  },
};

/** STRIKE THE MATCH — preservation decision quality. The mechanic is
 *  five decisions against a four-match pool, so decision accuracy
 *  dominates (each mistake costs 1050 points) and the completion base
 *  is the lowest of the three. (GAME.6B §8 note: the suggested
 *  timing-precision axis does not exist in this runtime — no timing
 *  windows or combos are implemented — so accuracy IS this game's
 *  precision axis.)
 *  36% completion / 42% accuracy / 18% time / 4% flawless. */
export const STATION_PRESERVATION_SCORING: ScoringSpec = {
  scoringVersion: 2,
  // GAME.17D1 — band-aware normalization: the previously ignored band
  // argument now selects the ChallengeProfile whose mistakePool and
  // durationSec tuned the actual run (STANDARD band 1 resolves the
  // exact historical 120/4, so every existing score vector is
  // bit-identical). The formula shape and weights are unchanged —
  // scoringVersion stays 2 because band + profile identity fully
  // describe the contract and the result already carries the band.
  // A band with no profile (ADVANCED/EXPERT/RESERVED — unreachable
  // live) fails closed to 0 rather than borrowing another band's
  // normalization.
  score(outcome: GameOutcome, band: DifficultyBand): number {
    const profile = getChallengeProfile('station-preservation', band);
    if (profile === null) return 0;
    return poolGameScore(outcome, {
      mistakePool: profile.mistakePool,
      durationSec: profile.durationSec,
      completionBase: 3600,
      accuracyWeight: 4200,
      timeWeight: 1800,
      flawlessBonus: 400,
    });
  },
};
