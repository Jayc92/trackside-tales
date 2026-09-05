// ================== TRACKSIDE ARCADE — WORLD STATE (LINE STATUS) ==================
// PUBLIC-v7.4B.GAME.14 — the pure derived world-state composer: a
// read-only lens that summarizes the currently relevant platform
// context (is a Special Timetable running?) and this player's standing
// inside it, recomputed at render from the authoritative systems that
// produced it. It owns NO truth: no storage, no reducer surface, no
// lifecycle, no campaign registry — and it never mutates events,
// quests, progression, mastery, or badges.
//
// ── World state vs everything else ──────────────────────────────────────
//   EVENT   = time-bounded platform content w/ per-player credit
//   QUEST   = posted objective w/ a completion ledger
//   XP/RANK = the progression ledger
//   WORLD STATE (this) = a derived one-glance summary over them
// A future CAMPAIGN registry (a named grouping with eyebrow/headline
// metadata, event/quest refs, and an explicit priority) would plug in
// as ONE MORE optional definitions input here — the composer shape is
// deliberately registry-ready, but no registry exists until a second
// concurrent context justifies one (G14A §5). Dead abstraction is not
// carried in the meantime (G14B §21): v1 composes exactly the inputs
// the LINE STATUS rail needs — event definitions, this player's event
// progress, and an injected `now`.

import type { GameId } from './registry';
import type { GameEventProgress } from './events';
import {
  GameEventDefinition,
  formatEventDateRange,
  getAllGameEvents,
  getEventPresentationModels,
  isEventComplete,
} from './events';

// ── The facet model (G14B §6) ───────────────────────────────────────────
// Two platform modes ONLY. Player completion is a FACET, never a mode —
// there is deliberately no 'timetable-complete' / 'quests-active' /
// 'campaign-*' enum growth.
export type ArcadeWorldMode = 'baseline' | 'timetable';

export interface ArcadeWorldHeadline {
  eyebrow: string;
  line: string;
  /** ACTIVE + this player's version-current event progress COMPLETE
   *  only. Never present for incomplete players or UPCOMING windows. */
  playerNote?: string;
}

export interface ArcadeWorldState {
  mode: ArcadeWorldMode;
  /** null ⇒ the rail renders NOTHING (zero DOM at baseline). */
  headline: ArcadeWorldHeadline | null;
  platform: {
    event?: {
      eventId: string;
      /** GAME.16 — the selected event's definition version, needed by
       *  the launch snapshot's version-current credit comparison.
       *  Definition authority, like gameIds below. */
      version: number;
      name: string;
      status: 'active' | 'upcoming';
      /** GAME.15 — the selected event's target games, straight from
       *  its definition (never a hard-coded list). The one authority
       *  cabinet reactions may use for targeting. */
      gameIds: readonly GameId[];
    };
  };
  player: {
    /** Present only when a primary ACTIVE event was selected. */
    eventComplete?: boolean;
    /** GAME.15 — the selected event's VERSION-CURRENT credited
     *  GameIds ([] for baseline/UPCOMING, and [] when stored progress
     *  is version-stale — stale credit never leaks into the current
     *  timetable treatment). The one authority cabinet reactions may
     *  use for credit; badges/PB/mastery/quests/collectibles never
     *  imply it. */
    eventCreditedGameIds: readonly GameId[];
  };
}

/** The first (start) and last (inclusive end) display days of an event
 *  window, derived by splitting the SHIPPED range formatter's output —
 *  never a second date-handling path. formatEventDateRange already
 *  applies the strict-UTC, exclusive-end-shown-as-last-inclusive-day
 *  contract and collapses single-day windows, so:
 *    "SEP 4 – SEP 18" → begins "SEP 4", ends "SEP 18"
 *    "OCT 1"          → begins/ends both "OCT 1". */
function eventDisplayDays(definition: GameEventDefinition): { begins: string; ends: string } {
  const parts = formatEventDateRange(definition).split(' – ');
  return { begins: parts[0], ends: parts[parts.length - 1] };
}

// ── The composer (G14B §7) ──────────────────────────────────────────────
/**
 * Derive the Arcade's world state at an injected instant. PURE:
 * identical inputs give deep-equal output; a different `now` changes
 * only the derived state; no input is mutated; nothing is read from
 * storage or the DOM and nothing is ever written.
 *
 * Priority (G14B §8) reuses the ONE existing event ordering —
 * getEventPresentationModels (ACTIVE → UPCOMING → ENDED, startsAt
 * ascending, eventId tie-break) — so no second, subtly different
 * ordering system exists. The primary context is the first ACTIVE
 * model, else the first UPCOMING model, else nothing (ENDED events
 * belong to the EventBoard's historical presentation, never to the
 * rail — no LINE CLOSED banner, G14B §13). Invalid/timezone-less
 * definitions fail closed to 'expired' in the shipped status helper
 * and therefore compose to baseline.
 */
export function getArcadeWorldState(args: {
  now: Date | string;
  /** This player's stored event participation (state.gameEvents). */
  gameEvents: Record<string, GameEventProgress>;
  /** Injectable for tests; defaults to the production registry. */
  eventDefinitions?: readonly GameEventDefinition[];
}): ArcadeWorldState {
  const { now, gameEvents } = args;
  const eventDefinitions = args.eventDefinitions ?? getAllGameEvents();
  const models = getEventPresentationModels(gameEvents, now, eventDefinitions);
  const primary =
    models.find((m) => m.status === 'active') ??
    models.find((m) => m.status === 'upcoming');

  if (primary === undefined) {
    return {
      mode: 'baseline',
      headline: null,
      platform: {},
      player: { eventCreditedGameIds: [] },
    };
  }

  const name = primary.definition.name;
  const days = eventDisplayDays(primary.definition);

  if (primary.status === 'active') {
    // Player completion comes from EVENT PROGRESS AUTHORITY only: the
    // model's progress is attached only when version-current, and
    // isEventComplete is the shipped completion rule — never inferred
    // from badges or collectibles.
    const eventComplete = isEventComplete(primary);
    return {
      mode: 'timetable',
      headline: {
        eyebrow: 'LINE STATUS',
        line: `SPECIAL TIMETABLE ACTIVE — ${name} · ENDS ${days.ends}`,
        ...(eventComplete ? { playerNote: 'YOUR RUN IS COMPLETE' } : {}),
      },
      platform: {
        event: {
          eventId: primary.definition.eventId,
          version: primary.definition.version,
          name,
          status: 'active',
          gameIds: primary.definition.gameIds,
        },
      },
      player: {
        eventComplete,
        // primary.progress is attached only when version-current, so
        // stale stored credit composes to [] here by construction.
        eventCreditedGameIds: primary.progress?.completedGameIds ?? [],
      },
    };
  }

  // UPCOMING — posted, no player clause (whatever stored progress says),
  // no countdown, no urgency copy.
  return {
    mode: 'timetable',
    headline: {
      eyebrow: 'LINE STATUS',
      line: `SPECIAL TIMETABLE POSTED — ${name} · BEGINS ${days.begins}`,
    },
    platform: {
      event: {
        eventId: primary.definition.eventId,
        version: primary.definition.version,
        name,
        status: 'upcoming',
        gameIds: primary.definition.gameIds,
      },
    },
    player: { eventCreditedGameIds: [] },
  };
}

// ── GAME.15 — cabinet world reactions ───────────────────────────────────
/** A temporary presentation treatment on one cabinet, derived solely
 *  from the SELECTED event above — never a game-truth change and never
 *  a second event-selection path. Copy composes at render from
 *  eventName + status; nothing here stores final strings. */
export interface CabinetWorldReaction {
  eventName: string;
  status: 'pending' | 'recorded';
}

/**
 * The cabinet's reaction to the current world state, or null (= zero
 * DOM) when ANY of these hold (G15B §10):
 *   - baseline mode / no selected event
 *   - the selected event is UPCOMING (the rail's POSTED line owns
 *     pre-start awareness; cabinets never imply early participation)
 *   - the WHOLE selected event is complete (the rail's YOUR RUN IS
 *     COMPLETE owns that statement once — three redundant RECORDED
 *     strips would be noise)
 *   - this gameId is not targeted by the selected event
 *
 * status: 'recorded' iff this gameId is in the selected event's
 * version-current credited ids — an in-window won result recorded by
 * the event framework. Mastery, badges, PBs, quests, and collectibles
 * never imply it. Pure; the clock enters only through the composer.
 */
export function getCabinetWorldReaction(
  gameId: GameId,
  worldState: ArcadeWorldState,
): CabinetWorldReaction | null {
  const event = worldState.platform.event;
  if (worldState.mode !== 'timetable' || event === undefined) return null;
  if (event.status !== 'active') return null;
  if (worldState.player.eventComplete === true) return null;
  if (!event.gameIds.includes(gameId)) return null;
  return {
    eventName: event.name,
    status: worldState.player.eventCreditedGameIds.includes(gameId)
      ? 'recorded'
      : 'pending',
  };
}

// ── GAME.16 — launch / result world context ─────────────────────────────
/** A launch-frozen presentation snapshot: the one selected ACTIVE event
 *  this game session belongs to, captured by the launching page at the
 *  moment of launch and held for the overlay session only. It is NOT
 *  event credit, NOT eligibility, and never persisted — eligibility
 *  stays with the reducer, evaluated at result.completedAt. */
export interface GameLaunchWorldContext {
  eventId: string;
  eventVersion: number;
  eventName: string;
  gameId: GameId;
}

/** What the shared GameOverlay receives (optional prop): the frozen
 *  event name for the intro context line, plus the authoritative
 *  observed credit transition for the result stamp. Derived by the
 *  launching page every render — never stored, never a promise. */
export interface GameOverlayTimetableContext {
  eventName: string;
  runRecorded: boolean;
}

/**
 * The launch context for one game at launch time, or null (= zero
 * overlay context) when ANY of these hold (G16B §§10–13):
 *   - baseline mode / no selected event
 *   - the selected event is UPCOMING or the whole event is complete
 *   - this gameId is not targeted by the selected event
 *   - this gameId is ALREADY credited (the cabinet owns RUN RECORDED;
 *     another credit is impossible, so membership copy would mislead)
 * Pure: no clock (it enters only through the composer), no registry
 * lookup, no storage. Because the context exists only for an
 * uncredited game, a later credited read IS the false→true transition.
 */
export function getGameLaunchWorldContext(
  gameId: GameId,
  worldState: ArcadeWorldState,
): GameLaunchWorldContext | null {
  const event = worldState.platform.event;
  if (worldState.mode !== 'timetable' || event === undefined) return null;
  if (event.status !== 'active') return null;
  if (worldState.player.eventComplete === true) return null;
  if (!event.gameIds.includes(gameId)) return null;
  if (worldState.player.eventCreditedGameIds.includes(gameId)) return null;
  return {
    eventId: event.eventId,
    eventVersion: event.version,
    eventName: event.name,
    gameId,
  };
}

/**
 * Whether the captured launch event/version/game is credited in the
 * authoritative post-result event state. A pure OBSERVATION of the
 * reducer's output — deliberately no won/clock/target/registry/
 * event-complete predicates here; those decisions belong exclusively
 * to the existing RECORD_GAME_RESULT fold. Version mismatch and
 * de-registration fail closed (no record, or a re-versioned record,
 * simply reads false).
 */
export function isLaunchRunRecorded(
  context: GameLaunchWorldContext,
  gameEvents: Record<string, GameEventProgress>,
): boolean {
  const record = gameEvents[context.eventId];
  return (
    record !== undefined &&
    record.eventVersion === context.eventVersion &&
    record.completedGameIds.includes(context.gameId)
  );
}
