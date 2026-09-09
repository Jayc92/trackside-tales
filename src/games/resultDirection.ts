// ================== TRACKSIDE ARCADE — RESULT DIRECTION (view model) ==================
// PUBLIC-v7.4B.GAME.22D — the DIRECTION layer's pure presentation step: one
// resolved NextObjective + the launch origin + the current game → what the
// success screen shows under NEXT OBJECTIVE and which two actions it offers.
//
// Pure: no navigation, no DOM, no storage, no clock, no authority. The page
// layer interprets `primary.kind`:
//   'replay'         — relaunch THIS game from its intro (same page, no route);
//   'arcade-target'  — hand the player to the Arcade with the target cabinet
//                      emphasized (NEVER an auto-launch; a sealed target keeps
//                      its FIND THE TALE state — scan authority is untouched).
// `secondary` always returns to the launch origin, named honestly.
//
// Losses have no direction module (§10): the resolver's 'retry' objective
// returns null here and the fail screen keeps TRY AGAIN / ASSISTED / SKIP.

import type { GameId } from './registry';
import { GAME_REGISTRY } from './registry';
import type { MasteryObjectiveTier, NextObjective } from './nextObjective';
import type { RunOrigin } from './runRewardSummary';

export const DIRECTION_HEADING = 'NEXT OBJECTIVE';

/** Tier words for action labels — the Engineer tier reads as THE MARK so the
 *  button stays short at 390 px ("REPLAY FOR THE MARK"). */
export const DIRECTION_TIER_WORD: Readonly<Record<MasteryObjectiveTier, string>> = {
  silver: 'SILVER',
  gold: 'GOLD',
  engineer: 'THE MARK',
};

/** Frozen player-facing action vocabulary (GAME.22D §§11-16, 29). */
export const DIRECTION_COPY = {
  replay: 'REPLAY',
  replayFor: (tier: MasteryObjectiveTier): string => `REPLAY FOR ${DIRECTION_TIER_WORD[tier]}`,
  playFor: (tier: MasteryObjectiveTier): string => `PLAY FOR ${DIRECTION_TIER_WORD[tier]}`,
  nextStop: 'NEXT STOP',
  findTheTale: 'FIND THE TALE',
  backToTale: 'BACK TO THE TALE',
  backToArcade: 'BACK TO THE ARCADE',
} as const;

export type DirectionActionKind = 'replay' | 'arcade-target';

export interface DirectionAction {
  readonly kind: DirectionActionKind;
  readonly label: string;
  readonly gameId: GameId;
  /** Arcade targets only: the cabinet is still sealed (FIND THE TALE). */
  readonly sealed: boolean;
}

export interface DirectionReturn {
  readonly kind: 'return';
  readonly label: string;
}

export interface ResultDirection {
  readonly heading: string;
  readonly text: string;
  readonly detail?: string;
  /** null ⇒ nothing actionable (completionist without a ghost, or a target
   *  the registry no longer knows — §34 fail closed); the return stays. */
  readonly primary: DirectionAction | null;
  readonly secondary: DirectionReturn;
}

export interface BuildResultDirectionInput {
  readonly objective: NextObjective;
  readonly origin: RunOrigin;
  readonly currentGameId: GameId;
  /** Injectable for tests; the shipped registry by default. */
  readonly registeredGameIds?: ReadonlySet<string>;
}

/** The origin-honest return label (§§12-13). */
export function getReturnLabel(origin: RunOrigin): string {
  return origin === 'arcade' ? DIRECTION_COPY.backToArcade : DIRECTION_COPY.backToTale;
}

/** NextObjective → direction view model. Deterministic and pure. */
export function buildResultDirection(input: BuildResultDirectionInput): ResultDirection | null {
  const { objective, origin, currentGameId } = input;
  if (objective.kind === 'retry') return null;
  const registered = input.registeredGameIds ?? new Set<string>(Object.keys(GAME_REGISTRY));
  const secondary: DirectionReturn = { kind: 'return', label: getReturnLabel(origin) };
  const base = {
    heading: DIRECTION_HEADING,
    text: objective.text,
    ...(objective.detail !== undefined ? { detail: objective.detail } : {}),
    secondary,
  };
  const gameId = objective.destination.gameId;
  // LINE COMPLETE without a ghost, or a target the registry does not know:
  // informational state only, return action only.
  if (objective.kind === 'line-complete' || gameId === undefined || !registered.has(gameId)) {
    return { ...base, primary: null };
  }
  const sameGame = gameId === currentGameId && objective.destination.surface === 'replay';
  if (sameGame) {
    const label =
      objective.kind !== 'race-best' && objective.targetTier !== undefined
        ? DIRECTION_COPY.replayFor(objective.targetTier)
        : DIRECTION_COPY.replay;
    return { ...base, primary: { kind: 'replay', label, gameId, sealed: false } };
  }
  if (objective.destination.sealed === true) {
    return { ...base, primary: { kind: 'arcade-target', label: DIRECTION_COPY.findTheTale, gameId, sealed: true } };
  }
  const label =
    objective.kind !== 'event-game' && objective.targetTier !== undefined
      ? DIRECTION_COPY.playFor(objective.targetTier)
      : DIRECTION_COPY.nextStop;
  return { ...base, primary: { kind: 'arcade-target', label, gameId, sealed: false } };
}
