// ================== TRACKSIDE ARCADE — RUN RESULTS LEDGER (rows) ==================
// PUBLIC-v7.4B.GAME.22C — the pure presentation step between RunRewardSummary
// v1 (settled authority, observed) and the success screen's RUN RESULTS
// panel. DERIVE, DON'T RE-AWARD: every row is read off the summary; nothing
// here grants, credits, persists, dispatches, or reads a clock.
//
// Anti-noise IS the contract (§§9, 20): a row renders ONLY when the summary
// says this run changed that thing. Canonical row order:
//   SCORE · BEST · XP · RANK · ARTIFACT… · TRAIN ORDERS · TIMETABLE
// Losses have no ledger at all (§7). SCORE is the only row a plain replay
// shows. BEST renders for an IMPROVED canonical best only — a first PB is
// already ceremony (§11). The TIMETABLE row is the event-result
// communication that replaces the standalone RUN RECORDED stamp (§18).
//
// Layer discipline (§1): this is the INFORMATION layer. Commentary stays
// the ceremony and is never fed from here; direction (next objective)
// is GAME.22D and is deliberately absent.

import { MASTERY_TIER_LABELS } from './mastery';
import type { RunRewardSummary } from './runRewardSummary';
import { formatScoreValue } from './runRewardSummary';

export const RUN_REWARD_LEDGER_LABEL = 'RUN RESULTS';
/** XP source labels shown before collapsing to "+N MORE" (§12). */
export const LEDGER_MAX_XP_SOURCES = 4;
/** Artifact rows shown before collapsing to "+N MORE" (§15). */
export const LEDGER_MAX_ARTIFACT_ROWS = 3;

export type RunRewardLedgerRowKind =
  | 'score'
  | 'best'
  | 'xp'
  | 'rank'
  | 'artifact'
  | 'train-orders'
  | 'timetable';

export const LEDGER_ROW_LABELS: Readonly<Record<RunRewardLedgerRowKind, string>> = {
  score: 'SCORE',
  best: 'BEST',
  xp: 'XP',
  rank: 'RANK',
  artifact: 'ARTIFACT',
  'train-orders': 'TRAIN ORDERS',
  timetable: 'TIMETABLE',
};

/** Frozen player-facing fragments (GAME.22C §49 inventory). */
export const LEDGER_COPY = {
  new: 'NEW',
  passed: 'PASSED',
  complete: 'COMPLETE',
  recorded: 'RECORDED',
  points: 'PTS',
  faster: 'FASTER',
  xp: 'XP',
  more: (n: number): string => `+${n} MORE`,
  toNext: (remaining: number, rank: string): string => `${formatScoreValue(remaining)} TO ${rank}`,
} as const;

export interface RunRewardLedgerRow {
  readonly kind: RunRewardLedgerRowKind;
  /** Stable render key (artifact rows carry their collectible id). */
  readonly key: string;
  readonly label: string;
  /** Primary value text, uppercase player vocabulary. */
  readonly value: string;
  /** Screen-reader replacement when `value` carries a symbol (the rank
   *  arrow reads "to"); absent when the visible text already reads well. */
  readonly srValue?: string;
  /** Muted supporting line (sources, path, rarity). */
  readonly detail?: string;
  /** Compact NEW treatment — this run newly promoted mastery (§10). */
  readonly isNew?: boolean;
}

/** Tenths-of-a-second magnitude with the SAME rounding convention as the
 *  shipped pace/commentary formatters (Math.round(|ms| / 100)); null when
 *  it would read "0.0s", so a caller never prints a zero delta. */
export function formatLedgerSeconds(deltaMs: number): string | null {
  if (!Number.isFinite(deltaMs)) return null;
  const tenths = Math.round(Math.abs(deltaMs) / 100);
  if (tenths === 0) return null;
  return `${(tenths / 10).toFixed(1)}s`;
}

/** "8,933 · GOLD" — the run's own mastery candidate beside the score; a
 *  bare score when the run carries no tier (never happens for a won
 *  result under the shipped evaluator, but fail soft). */
export function formatLedgerScore(summary: RunRewardSummary): string {
  const tier = summary.mastery.candidateTier ?? summary.mastery.durableAfter;
  const score = formatScoreValue(summary.scoring.score);
  return tier === null ? score : `${score} · ${MASTERY_TIER_LABELS[tier]}`;
}

/** RunRewardSummary v1 → renderable rows. Deterministic and pure. */
export function buildRunRewardLedger(summary: RunRewardSummary): readonly RunRewardLedgerRow[] {
  if (summary.outcome !== 'won') return [];
  const rows: RunRewardLedgerRow[] = [];

  // 1 — SCORE (every win)
  rows.push({
    kind: 'score',
    key: 'score',
    label: LEDGER_ROW_LABELS.score,
    value: formatLedgerScore(summary),
    ...(summary.mastery.promoted ? { isNew: true } : {}),
  });

  // 2 — BEST (improved canonical best only; positive deltas only)
  if (summary.pb.kind === 'improved') {
    const parts: string[] = [];
    if (summary.pb.scoreDelta !== undefined && summary.pb.scoreDelta > 0) {
      parts.push(`+${formatScoreValue(summary.pb.scoreDelta)} ${LEDGER_COPY.points}`);
    }
    if (summary.pb.durationDeltaMs !== undefined && summary.pb.durationDeltaMs < 0) {
      const faster = formatLedgerSeconds(summary.pb.durationDeltaMs);
      if (faster !== null) parts.push(`${faster} ${LEDGER_COPY.faster}`);
    }
    if (parts.length > 0) {
      rows.push({ kind: 'best', key: 'best', label: LEDGER_ROW_LABELS.best, value: parts.join(' · ') });
    }
  }

  // 3 — XP (earned only; sources in authority order, collapsed past four)
  if (summary.xp.total > 0) {
    const sources = summary.xp.awards.map((award) => award.label);
    const shown = sources.slice(0, LEDGER_MAX_XP_SOURCES);
    const hidden = sources.length - shown.length;
    const detail = hidden > 0 ? [...shown, LEDGER_COPY.more(hidden)].join(' · ') : shown.join(' · ');
    rows.push({
      kind: 'xp',
      key: 'xp',
      label: LEDGER_ROW_LABELS.xp,
      value: `+${formatScoreValue(summary.xp.total)} ${LEDGER_COPY.xp}`,
      ...(detail.length > 0 ? { detail } : {}),
    });
  }

  // 4 — RANK (changed only; ONE line names the final rank, passed ranks muted)
  if (summary.rank.rankedUp) {
    const detailParts: string[] = [];
    if (summary.rank.passed.length > 0) {
      detailParts.push(`${LEDGER_COPY.passed} ${summary.rank.passed.join(' · ')}`);
    }
    if (summary.rank.next !== null && summary.rank.remainingToNext > 0) {
      detailParts.push(LEDGER_COPY.toNext(summary.rank.remainingToNext, summary.rank.next));
    }
    rows.push({
      kind: 'rank',
      key: 'rank',
      label: LEDGER_ROW_LABELS.rank,
      value: `${summary.rank.before} → ${summary.rank.after}`,
      srValue: `${summary.rank.before} to ${summary.rank.after}`,
      ...(detailParts.length > 0 ? { detail: detailParts.join(' · ') } : {}),
    });
  }

  // 5 — ARTIFACT rows (newly granted only; summary order; collapsed past three)
  const artifacts = summary.collectibles;
  for (const artifact of artifacts.slice(0, LEDGER_MAX_ARTIFACT_ROWS)) {
    rows.push({
      kind: 'artifact',
      key: `artifact:${artifact.id}`,
      label: LEDGER_ROW_LABELS.artifact,
      value: artifact.name,
      detail: artifact.rarityLabel,
    });
  }
  if (artifacts.length > LEDGER_MAX_ARTIFACT_ROWS) {
    rows.push({
      kind: 'artifact',
      key: 'artifact:more',
      label: LEDGER_ROW_LABELS.artifact,
      value: LEDGER_COPY.more(artifacts.length - LEDGER_MAX_ARTIFACT_ROWS),
    });
  }

  // 6 — TRAIN ORDERS (progress changed or completed by this run)
  for (const order of summary.trainOrders) {
    if (!order.completedByThisRun && order.satisfiedAfter === order.satisfiedBefore) continue;
    const state = order.completedByThisRun
      ? LEDGER_COPY.complete
      : `${order.satisfiedAfter} OF ${order.total}`;
    rows.push({
      kind: 'train-orders',
      key: `train-orders:${order.questId}`,
      label: LEDGER_ROW_LABELS['train-orders'],
      value: `${order.name} · ${state}`,
    });
  }

  // 7 — TIMETABLE (credited or completed by this run; replaces the stamp)
  const timetable = summary.timetable;
  if (timetable !== null && (timetable.creditedByThisRun || timetable.completedByThisRun)) {
    const state = timetable.completedByThisRun
      ? LEDGER_COPY.complete
      : `${timetable.creditedAfter} OF ${timetable.total} ${LEDGER_COPY.recorded}`;
    rows.push({
      kind: 'timetable',
      key: `timetable:${timetable.eventId}`,
      label: LEDGER_ROW_LABELS.timetable,
      value: `${timetable.name} · ${state}`,
    });
  }

  return rows;
}

/** §18 — the standalone RUN RECORDED stamp yields to the TIMETABLE row
 *  only when that row is actually present. */
export function ledgerHasTimetableRow(rows: readonly RunRewardLedgerRow[]): boolean {
  return rows.some((row) => row.kind === 'timetable');
}
