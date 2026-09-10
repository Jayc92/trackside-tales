// ================== TRACKSIDE ARCADE — ORDER BOARD (Weekly Dispatch notice model) ==================
// PUBLIC-v7.4B.GAME.22E.E — the pure presentation model for the CURRENT
// Weekly Dispatch on the Arcade's Train Orders board: which game, what the
// run must be, what it pays, when the order closes or when the next one
// posts, and whether it is already complete. DERIVE, DON'T RE-AWARD: every
// field is read off committed authority (the order store + the session's
// suspension flag) through the committed pure adapter; nothing here
// completes, grants, persists, navigates, or reads a clock — the caller
// supplies the render instant.
//
// The board represents WHAT IS ACTIVE NOW, so its instant is the page's
// render instant (unlike the frozen result overlay, whose row keeps the
// result's own period). Nothing is persisted and no timer exists: a normal
// rerender or navigation refreshes the current state.
//
// Authority separation: this is NOT a quest. It never becomes a
// QuestDefinition, a QuestCompletion, or a QuestStore entry; the board
// renders heterogeneous presentation models side by side.

import type { GameId } from './registry';
import { GAME_REGISTRY } from './registry';
import { MASTERY_TIER_LABELS } from './mastery';
import type { OrderCompletionMap, OrderDefinition } from './orders';
import { getAllOrderDefinitions, getCurrentOrderState } from './orders';
import { NEXT_OBJECTIVE_COPY, formatDispatchPostDate } from './nextObjective';

export type DispatchBoardStatus = 'active' | 'complete';

export interface DispatchBoardModel {
  readonly id: string;
  /** WEEKLY DISPATCH (the order definition's player-facing name). */
  readonly name: string;
  readonly periodId: string;
  readonly featuredGameId: GameId;
  readonly status: DispatchBoardStatus;
  /** "STANDARD RUN · SILVER OR BETTER · LAY OUT ALLEN'S TOWN" — the
   *  requirement, canonical registry title, never a raw GameId. */
  readonly description: string;
  /** "0 OF 1 CLEARED" while active; "COMPLETE" once complete. */
  readonly progressText: string;
  /** "REWARD · 150 XP" — an objective listing, never "+150 XP". */
  readonly rewardText: string;
  /** "CLOSES MON SEP 14" while active; "NEXT POSTS MON SEP 14" once
   *  complete. Both are the current period's end in the dispatch calendar
   *  zone; null only if the instant could not be formatted. */
  readonly timingText: string | null;
}

/** Frozen player-facing fragments (GAME.22E.E §§10–13, 25). */
export const ORDER_BOARD_COPY = {
  orBetter: 'OR BETTER',
  cleared: (done: number, total: number): string => `${done} OF ${total} CLEARED`,
  complete: 'COMPLETE',
  reward: (xp: number): string => `REWARD · ${xp.toLocaleString('en-US')} XP`,
  closes: (dateLabel: string): string => `CLOSES ${dateLabel}`,
  nextPosts: (dateLabel: string): string => `NEXT POSTS ${dateLabel}`,
} as const;

/** The current Weekly Dispatch notice, or null when it must not render:
 *  order authority suspended for the session (a preserved future-version
 *  payload the runtime refuses to interpret), no weekly order registered,
 *  or an instant that resolves no period. Pure and deterministic. */
export function buildDispatchBoardModel(args: {
  completions: OrderCompletionMap;
  suspended: boolean;
  now: string | Date;
  orderDefinitions?: readonly OrderDefinition[];
}): DispatchBoardModel | null {
  if (args.suspended) return null;
  const definitions = args.orderDefinitions ?? getAllOrderDefinitions();
  const definition = definitions.find((def) => def.cadence === 'weekly');
  if (definition === undefined) return null;
  const current = getCurrentOrderState(definition, args.completions, args.now);
  if (current === null) return null;
  const game = GAME_REGISTRY[current.featuredGameId];
  if (game === undefined) return null;
  const complete = current.status === 'complete';
  const dateLabel = formatDispatchPostDate(current.period.endsAt);
  return {
    id: definition.orderId,
    name: definition.name,
    periodId: current.period.periodId,
    featuredGameId: current.featuredGameId,
    status: current.status,
    description: `${NEXT_OBJECTIVE_COPY.standardRun} · ${MASTERY_TIER_LABELS[definition.requiredTier]} ${ORDER_BOARD_COPY.orBetter} · ${game.title}`,
    progressText: complete ? ORDER_BOARD_COPY.complete : ORDER_BOARD_COPY.cleared(0, 1),
    rewardText: ORDER_BOARD_COPY.reward(definition.xpReward),
    timingText:
      dateLabel === null
        ? null
        : complete
          ? ORDER_BOARD_COPY.nextPosts(dateLabel)
          : ORDER_BOARD_COPY.closes(dateLabel),
  };
}
