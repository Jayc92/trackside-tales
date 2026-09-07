// ================== TRACKSIDE ARCADE — POST-RUN COMMENTARY ==================
// PUBLIC-v7.4B.GAME.19C — the deterministic LOCAL commentary engine over
// the committed GAME.19B fact envelope. PURE: same PostRunFacts in,
// byte-identical PostRunCommentary out — no React, no DOM, no storage,
// no network, no AI, no randomness, no clocks, no locale formatting.
//
// ── The one rule (G19C §1) ──────────────────────────────────────────────
// Commentary OBSERVES, SELECTS, FORMATS, PRIORITIZES, DESCRIBES. It
// never decides, awards, dispatches, mutates, or recalculates
// authority. Every sensitive claim is guarded by the governing boolean
// TRANSITION in PostRunFacts — a forged or contradictory envelope fails
// closed to silence, never to a false claim.
//
// ── Not rendered yet (G19C §42) ─────────────────────────────────────────
// Nothing imports this module in production. GAME.19D owns the result-
// screen presentation; until then the strings below are copy-review
// material only and must not reach the shipped bundle.
//
// ── Voice (G19C §10) ────────────────────────────────────────────────────
// Concise, factual, confident, lightly railway-flavored. Never goofy,
// never sports-announcer, never shaming. Losses get useful facts — the
// result screen already says NOT QUITE.

import type { PostRunFacts } from './postRunFacts';
import { MASTERY_TIER_LABELS } from './mastery';
import {
  COLLECTIBLE_REGISTRY,
  CollectibleId,
  CollectibleRarity,
} from './collectibles';
import { QUEST_REGISTRY, QuestId } from './quests';

// ── Output shape (G19C §6) ──────────────────────────────────────────────
export type CommentaryTemplateId =
  | 'collectible-new'
  | 'engineer-earned'
  | 'event-completed'
  | 'pb-first'
  | 'pb-improved'
  | 'pb-delta-time'
  | 'pb-delta-score'
  | 'mastery-promoted'
  // G19D1A — 'event-recorded' was retired: on the only rendering
  // surface, creditedByThisRun already produces the authoritative
  // GAME.16 stamp (SPECIAL TIMETABLE · RUN RECORDED), so a commentary
  // line carried zero new information and rendered as a verbatim
  // duplicate. event-completed remains — a stronger transition than
  // the per-run stamp.
  | 'quest-completed'
  | 'rank-up'
  | 'race-ahead'
  | 'race-behind'
  | 'race-even'
  | 'engineer-near-miss'
  | 'first-ticket'
  | 'flawless'
  | 'no-hints'
  | 'first-attempt'
  | 'assisted-complete'
  | 'assisted-records-note'
  | 'loss-time'
  | 'loss-mistakes'
  | 'loss-time-and-mistakes'
  | 'loss-progress';

export interface CommentaryLine {
  readonly templateId: CommentaryTemplateId;
  readonly text: string;
}

/** At most one primary + one optional secondary (G19C §6). Plain text
 *  only — no HTML, JSX, markdown, or rich text. null = nothing useful
 *  to say (an ordinary run needs no manufactured praise, §33). */
export interface PostRunCommentary {
  readonly primary: CommentaryLine;
  readonly secondary?: CommentaryLine;
}

// ── Length budget (G19C §11) ────────────────────────────────────────────
export const COMMENTARY_PRIMARY_MAX_CHARS = 48;
export const COMMENTARY_SECONDARY_MAX_CHARS = 64;

// ── Pure formatters (G19C §§14/37) ──────────────────────────────────────
/** Tenths-of-a-second magnitude using the SAME rounding convention as
 *  GAME.18's formatGhostPace (Math.round(|ms|/100); zero tenths means
 *  "no meaningful gap"). Returns null instead of ever producing a
 *  "0.0s" artifact — callers fall back to another variant. The unit
 *  battery parity-tests this against the shipped pace formatter. */
export function formatTenthsMagnitude(deltaMs: number): string | null {
  if (!Number.isFinite(deltaMs)) return null;
  const tenths = Math.round(Math.abs(deltaMs) / 100);
  if (tenths === 0) return null;
  return `${(tenths / 10).toFixed(1)}s`;
}

/** Plain unsigned integer — deterministic, no locale separators (§39). */
function formatPoints(points: number): string {
  return String(Math.abs(Math.trunc(points)));
}

/** "1 STOP REMAINS" / "N STOPS REMAIN" — the game-neutral progress noun
 *  (§29). Null for zero/invalid so no "0 STOPS REMAIN" line exists. */
function formatStopsRemaining(remaining: number): string | null {
  if (!Number.isInteger(remaining) || remaining <= 0) return null;
  return remaining === 1 ? '1 STOP REMAINS' : `${remaining} STOPS REMAIN`;
}

// ── Collectible significance (G19C §25) ─────────────────────────────────
// Derived from the COMMITTED registry's own rarity taxonomy (legendary >
// rare > uncommon > common) with registry declaration order as the
// deterministic tiebreak — never an independent competing rarity system.
const RARITY_SIGNIFICANCE: Record<CollectibleRarity, number> = {
  legendary: 3,
  rare: 2,
  uncommon: 1,
  common: 0,
};

function topCollectible(ids: readonly CollectibleId[]): CollectibleId | null {
  let best: CollectibleId | null = null;
  let bestSig = -1;
  for (const id of Object.keys(COLLECTIBLE_REGISTRY) as CollectibleId[]) {
    if (!ids.includes(id)) continue;
    const sig = RARITY_SIGNIFICANCE[COLLECTIBLE_REGISTRY[id].rarity];
    if (sig > bestSig) {
      best = id;
      bestSig = sig;
    }
  }
  return best;
}

// ── Claim-token guards (G19C §36) ───────────────────────────────────────
/** Sensitive phrase → the governing fact transition that must be true
 *  for ANY produced line containing it. This is the deterministic
 *  precursor to a future AI claims-whitelist (G19E); today the pure
 *  validator below re-checks the engine's own output in tests. */
export const COMMENTARY_CLAIM_GUARDS: ReadonlyArray<{
  phrase: string;
  allows: (facts: PostRunFacts) => boolean;
}> = [
  // G19D1A — the PB claims require the WIN itself, not merely the
  // storage transition (a fresh terminal loss legitimately seeds the
  // empty slot under GAME.6).
  {
    phrase: 'NEW PERSONAL BEST',
    allows: (f) => f.result.won && f.pb.becamePb && f.pb.hadWinningPbBefore,
  },
  {
    phrase: 'FIRST RUN ON THE BOARD',
    allows: (f) => f.result.won && f.pb.becamePb && !f.pb.hadWinningPbBefore,
  },
  // G19D1A — no commentary template emits RUN RECORDED anymore (the
  // GAME.16 stamp owns that presentation); the guard is deliberately
  // RETAINED as whitelist defense for any future generative layer.
  { phrase: 'RUN RECORDED', allows: (f) => f.event.creditedByThisRun },
  { phrase: 'PROMOTED TO', allows: (f) => f.xp.rankedUp },
  { phrase: 'FASTER', allows: (f) => f.pb.durationDeltaMs !== undefined && f.pb.durationDeltaMs < 0 },
  { phrase: 'AHEAD OF THE RUN YOU RACED', allows: (f) => f.race.finishedAhead === true },
  { phrase: 'BEHIND THE RUN YOU RACED', allows: (f) => f.race.finishedBehind === true },
  {
    phrase: 'EVEN WITH THE RUN YOU RACED',
    // The display convention is GAME.18's: a gap that rounds to zero
    // tenths IS even at display precision (the shipped pace line makes
    // the same statement), so the guard encodes exactly that rule.
    allows: (f) =>
      f.race.finishedEven === true ||
      (typeof f.race.finishedDeltaMs === 'number' &&
        Math.round(Math.abs(f.race.finishedDeltaMs) / 100) === 0),
  },
  { phrase: ' EARNED', allows: (f) => f.mastery.promoted || f.collectibles.newlyAcquired.length > 0 },
  // G19C1 — the Engineer phrases carry their exact governing facts: the
  // promotion forms (EARNED as primary, SECURED as contextual secondary)
  // require the durable Engineer transition; the EARNED form is also
  // legitimate when a newly acquired collectible's own registry name
  // contains the phrase (the per-game marks). SECURED is promotion-only
  // and must never appear from ownership, candidates, or blockers.
  {
    phrase: "ENGINEER'S MARK SECURED",
    allows: (f) => f.mastery.promoted && f.mastery.durableAfter === 'engineer',
  },
  {
    phrase: "ENGINEER'S MARK EARNED",
    allows: (f) =>
      (f.mastery.promoted && f.mastery.durableAfter === 'engineer') ||
      f.collectibles.newlyAcquired.some((id) =>
        COLLECTIBLE_REGISTRY[id]?.name.includes("ENGINEER'S MARK"),
      ),
  },
  { phrase: 'COMPLETE', allows: (f) => f.result.won || false },
];

/** Pure output validator: every guarded phrase appearing in a produced
 *  line must be allowed by its governing facts. Returns the violating
 *  phrases (empty = clean). Test/validation surface only. */
export function validateCommentaryClaims(
  commentary: PostRunCommentary | null,
  facts: PostRunFacts,
): string[] {
  if (commentary === null) return [];
  const texts = [commentary.primary.text, commentary.secondary?.text ?? ''];
  const violations: string[] = [];
  for (const guard of COMMENTARY_CLAIM_GUARDS) {
    if (texts.some((t) => t.includes(guard.phrase)) && !guard.allows(facts)) {
      violations.push(guard.phrase);
    }
  }
  return violations;
}

// ── Candidate model (G19C §§7-8/35) ─────────────────────────────────────
// Every candidate carries: a stable template id, a CLUSTER (primary and
// secondary must come from different clusters unless the secondary is
// an explicit designated complement of the primary), a strict priority
// (lower = stronger), and its exact precise predicate applied at build
// time. Priorities are a single documented order — deterministic, no
// rotation, no randomness.
type CommentaryCluster =
  | 'collectible'
  | 'mastery'
  | 'event'
  | 'pb'
  | 'quest'
  | 'rank'
  | 'race'
  | 'near-miss'
  | 'performance'
  | 'assisted'
  | 'loss';

interface CommentaryCandidate {
  readonly id: CommentaryTemplateId;
  readonly cluster: CommentaryCluster;
  readonly priority: number;
  readonly text: string;
  /** Never selectable as primary (delta/progress/note complements). */
  readonly secondaryOnly?: boolean;
}

/** Designated within-cluster complements (§9's sanctioned pattern:
 *  "NEW PERSONAL BEST" + its magnitude, a loss reason + its progress,
 *  the assisted note pair). Checked before the cross-cluster rule. */
const COMPLEMENTS: Partial<Record<CommentaryTemplateId, CommentaryTemplateId[]>> = {
  'pb-improved': ['pb-delta-time', 'pb-delta-score'],
  'loss-time': ['loss-progress'],
  'loss-mistakes': ['loss-progress'],
  'loss-time-and-mistakes': ['loss-progress'],
  'assisted-complete': ['assisted-records-note'],
};

function buildCandidates(facts: PostRunFacts): CommentaryCandidate[] {
  const out: CommentaryCandidate[] = [];
  const push = (
    id: CommentaryTemplateId,
    cluster: CommentaryCluster,
    priority: number,
    text: string | null,
    secondaryOnly = false,
  ) => {
    if (text === null) return;
    const budget = secondaryOnly ? COMMENTARY_SECONDARY_MAX_CHARS : COMMENTARY_PRIMARY_MAX_CHARS;
    if (text.length > budget) return; // fail closed on budget, never ellipsize (§11)
    out.push({ id, cluster, priority, text, secondaryOnly });
  };
  const { pb, race, mastery, difficulty, event, xp, quest, collectibles, loss, result } = facts;
  const assisted = difficulty.assisted;
  const engineerPromoted = mastery.promoted && mastery.durableAfter === 'engineer';

  // P10 — newly acquired significant collectible (rarity ≥ uncommon).
  // Dedupe (§§19/24/26): mastery-sourced marks defer to the Engineer
  // promotion line of the SAME dispatch; event-completion-sourced
  // artifacts defer to the event-completion line; only the single
  // top-significance artifact ever becomes a candidate (no reward spam).
  const top = topCollectible(collectibles.newlyAcquired);
  if (top !== null) {
    const def = COLLECTIBLE_REGISTRY[top];
    const suppressed =
      (def.source.kind === 'mastery' && engineerPromoted) ||
      (def.source.kind === 'event-completion' && event.eventCompletedByThisRun);
    if (!suppressed && RARITY_SIGNIFICANCE[def.rarity] >= RARITY_SIGNIFICANCE.uncommon) {
      push('collectible-new', 'collectible', 10, `${def.name} EARNED`);
    }
    if (!suppressed && def.rarity === 'common' && top === 'first-ticket') {
      push('first-ticket', 'collectible', 110, `${def.name} EARNED`);
    }
  }

  // P20 — ENGINEER promotion (durable transition only, §17).
  if (engineerPromoted) {
    push('engineer-earned', 'mastery', 20, `${MASTERY_TIER_LABELS.engineer} EARNED`);
  }

  // P30 — whole event completed by this run (§23).
  if (event.eventCompletedByThisRun) {
    const named = event.eventName !== undefined ? `${event.eventName} COMPLETE` : null;
    push(
      'event-completed',
      'event',
      30,
      named !== null && named.length <= COMMENTARY_PRIMARY_MAX_CHARS
        ? named
        : 'SPECIAL TIMETABLE COMPLETE',
    );
  }

  // P40 — canonical PB (authoritative transition only, §§12-13). The
  // assisted guard is structural (becamePb is false under the live band
  // gate) and repeated here for fail-closed defense (§§21/55).
  // G19D1A — the WON guard is load-bearing, not defensive: GAME.6
  // legitimately seeds an empty PB slot with a terminal LOSS, so
  // becamePb alone is a STORAGE transition, not a winning personal
  // best. Player-facing PB language requires the win itself.
  if (result.won && pb.becamePb && !assisted) {
    if (pb.hadWinningPbBefore) {
      push('pb-improved', 'pb', 40, 'NEW PERSONAL BEST');
      // Complement secondaries — wording must respect the comparator
      // (§13): FASTER only when genuinely faster; otherwise points.
      if (pb.durationDeltaMs !== undefined && pb.durationDeltaMs < 0) {
        const t = formatTenthsMagnitude(pb.durationDeltaMs);
        if (t !== null) {
          push('pb-delta-time', 'pb', 41, `${t} FASTER THAN YOUR PREVIOUS BEST`, true);
        }
      }
      if (pb.scoreDelta !== undefined && pb.scoreDelta > 0) {
        push('pb-delta-score', 'pb', 42, `+${formatPoints(pb.scoreDelta)} POINTS ON YOUR PREVIOUS BEST`, true);
      }
    } else {
      push('pb-first', 'pb', 40, 'FIRST RUN ON THE BOARD');
    }
  }

  // P50 — lower mastery promotions (durable transition only, §17; the
  // Engineer promotion owns P20). candidateTier NEVER claims here (§18).
  if (mastery.promoted && !engineerPromoted && mastery.durableAfter !== null) {
    push('mastery-promoted', 'mastery', 50, `${MASTERY_TIER_LABELS[mastery.durableAfter]} EARNED`);
  }

  // P60 — RETIRED (G19D1A): the ordinary run-credit line duplicated the
  // GAME.16 stamp verbatim wherever it could appear (the stamp renders
  // exactly when creditedByThisRun is true). The stamp remains the one
  // presentation of that fact; commentary stays silent about it.

  // P70 — quest completion (new completion records only, §27).
  const newQuest = quest.newCompletions[0];
  if (newQuest !== undefined) {
    const def = QUEST_REGISTRY[newQuest.questId as QuestId];
    const named = def !== undefined ? `${def.name} COMPLETE` : null;
    push(
      'quest-completed',
      'quest',
      70,
      named !== null && named.length <= COMMENTARY_PRIMARY_MAX_CHARS
        ? named
        : 'TRAIN ORDERS COMPLETE',
    );
  }

  // P80 — rank promotion (rank TRANSITION only, never raw XP, §28).
  if (xp.rankedUp) {
    push('rank-up', 'rank', 80, `PROMOTED TO ${xp.rankAfter}`);
  }

  // P90 — Race Best outcome (frozen-opponent facts only, wins only;
  // never the canonical PB, §§15-16; assisted fail-closed, §55).
  if (race.selected && !assisted && race.finishedDeltaMs !== undefined) {
    const t = formatTenthsMagnitude(race.finishedDeltaMs);
    if (race.finishedEven === true || t === null) {
      push('race-even', 'race', 90, 'EVEN WITH THE RUN YOU RACED');
    } else if (race.finishedAhead === true) {
      push('race-ahead', 'race', 90, `${t} AHEAD OF THE RUN YOU RACED`);
    } else if (race.finishedBehind === true) {
      push('race-behind', 'race', 90, `${t} BEHIND THE RUN YOU RACED`);
    }
  }

  // P100 — Engineer near-miss (§20): STANDARD wins with a trusted,
  // non-empty blocker list — never ASSISTED (the band blocker must not
  // read as a near-miss), never when Engineer is already durable, and
  // ONLY when the run was genuinely close: a SINGLE decisive blocker
  // (specific copy), or multiple blockers on a run that still scored at
  // GOLD level (generic cleaner-run copy). An ordinary mid-tier run is
  // not lectured about Engineer.
  const blockers = mastery.engineerBlockers;
  if (
    result.won &&
    !assisted &&
    blockers !== null &&
    blockers.length > 0 &&
    !blockers.includes('band') &&
    mastery.durableAfter !== 'engineer' &&
    (blockers.length === 1 || mastery.candidateTier === 'gold')
  ) {
    if (blockers.length === 1) {
      const only = blockers[0];
      if (only === 'score') push('engineer-near-miss', 'near-miss', 100, 'ENGINEER CALLS FOR A HIGHER SCORE');
      if (only === 'mistakes') {
        const m = result.metrics.mistakes;
        push(
          'engineer-near-miss',
          'near-miss',
          100,
          m === 1 ? 'ONE MISTAKE KEPT ENGINEER OUT OF REACH' : 'MISTAKES KEPT ENGINEER OUT OF REACH',
        );
      }
      if (only === 'hints') push('engineer-near-miss', 'near-miss', 100, 'ENGINEER RUNS TAKE NO HINTS');
      if (only === 'completion') push('engineer-near-miss', 'near-miss', 100, 'ENGINEER NEEDS A CLEANER RUN');
    } else {
      push('engineer-near-miss', 'near-miss', 100, 'ENGINEER NEEDS A CLEANER RUN');
    }
  }

  // P120 — game-neutral performance observations (§30). Wins only;
  // strict metric truth; flawless > no-hints > first-attempt.
  if (result.won) {
    if (result.metrics.mistakes === 0) push('flawless', 'performance', 120, 'FLAWLESS RUN');
    if (result.metrics.hintsUsed === 0) push('no-hints', 'performance', 121, 'NO HINTS USED');
    if (result.attempt === 1) push('first-attempt', 'performance', 122, 'FIRST ATTEMPT');
  }

  // P130 — assisted completion note (§21): calm, factual, low priority;
  // the records note requires the authoritative becamePb false.
  if (result.won && assisted) {
    push('assisted-complete', 'assisted', 130, 'ASSISTED RUN COMPLETE');
    if (!pb.becamePb) {
      push('assisted-records-note', 'assisted', 131, 'STANDARD RECORDS UNCHANGED', true);
    }
  }

  // P140 — loss facts (§§29/34): the committed derivation only; a loss
  // with malformed facts says nothing rather than something false.
  if (!result.won && loss !== undefined) {
    const time = loss.timeExpired === true;
    const pool = loss.mistakePoolExhausted === true;
    if (time && pool) push('loss-time-and-mistakes', 'loss', 140, 'TIME EXPIRED · OUT OF MOVES');
    else if (time) push('loss-time', 'loss', 140, 'TIME EXPIRED');
    else if (pool) push('loss-mistakes', 'loss', 140, 'OUT OF MOVES');
    if (loss.progressRemaining !== undefined) {
      push('loss-progress', 'loss', 141, formatStopsRemaining(loss.progressRemaining), true);
    }
  }

  return out;
}

// ── The engine (G19C §§8-9/33/39) ───────────────────────────────────────
/**
 * Deterministic commentary for one PostRunFacts envelope: the single
 * strongest candidate as primary, plus at most one secondary — a
 * designated complement of the primary when one exists, else the next
 * candidate from a DIFFERENT cluster (no repeated fact, no reward
 * spam). Returns null when nothing useful exists: an ordinary run is
 * not padded with manufactured praise.
 */
export function getPostRunCommentary(facts: PostRunFacts): PostRunCommentary | null {
  const candidates = buildCandidates(facts).sort((a, b) => a.priority - b.priority);
  const primary = candidates.find((c) => c.secondaryOnly !== true);
  if (primary === undefined) return null;

  let secondary: CommentaryCandidate | undefined;
  const complements = COMPLEMENTS[primary.id];
  if (complements !== undefined) {
    for (const id of complements) {
      secondary = candidates.find((c) => c.id === id);
      if (secondary !== undefined) break;
    }
  }
  if (secondary === undefined) {
    secondary = candidates.find(
      (c) => c !== primary && c.secondaryOnly !== true && c.cluster !== primary.cluster,
    );
  }

  // G19C1 — contextual cadence polish: when the Engineer promotion rides
  // as SECONDARY beneath a stronger newly earned collectible (e.g.
  // YARDMASTER'S SEAL EARNED), the pair must not read EARNED / EARNED.
  // Same fact, same template id, same authority predicate (the candidate
  // only exists on the durable Engineer transition) — copy only. The
  // promotion as PRIMARY keeps ENGINEER'S MARK EARNED.
  const secondaryText =
    secondary !== undefined &&
    secondary.id === 'engineer-earned' &&
    primary.id === 'collectible-new'
      ? "ENGINEER'S MARK SECURED"
      : secondary?.text;

  return {
    primary: { templateId: primary.id, text: primary.text },
    ...(secondary !== undefined && secondaryText !== undefined
      ? { secondary: { templateId: secondary.id, text: secondaryText } }
      : {}),
  };
}
