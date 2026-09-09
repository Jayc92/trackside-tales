// ================== TRACKSIDE ARCADE — cross-game handoff (ephemeral) ==================
// PUBLIC-v7.4B.GAME.22D §§17,33 — the SMALLEST transient handoff state. When
// a result screen's primary action targets ANOTHER game, the launching page
// records the target here, routes to the Arcade, and the Arcade consumes it
// exactly once on mount to scroll to and briefly emphasize that cabinet.
//
// Module memory only — never localStorage, never the URL, never the reducer.
// A refresh forgets it (safe), an unknown target is ignored by the consumer
// (fail closed), and consumption clears it so nothing lingers.

import type { GameId } from '../games/registry';

let pendingTarget: GameId | null = null;

export function setArcadeHandoffTarget(gameId: GameId): void {
  pendingTarget = gameId;
}

/** Returns the pending target once and clears it. */
export function consumeArcadeHandoffTarget(): GameId | null {
  const target = pendingTarget;
  pendingTarget = null;
  return target;
}
