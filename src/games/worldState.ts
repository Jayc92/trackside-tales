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
      name: string;
      status: 'active' | 'upcoming';
    };
  };
  player: {
    /** Present only when a primary ACTIVE event was selected. */
    eventComplete?: boolean;
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
    return { mode: 'baseline', headline: null, platform: {}, player: {} };
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
        event: { eventId: primary.definition.eventId, name, status: 'active' },
      },
      player: { eventComplete },
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
      event: { eventId: primary.definition.eventId, name, status: 'upcoming' },
    },
    player: {},
  };
}
