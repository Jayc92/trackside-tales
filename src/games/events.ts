// ================== TRACKSIDE ARCADE — SEASONAL / EVENT FRAMEWORK ==================
// PUBLIC-v7.4B.GAME.10A — the architecture for limited-time Arcade
// events: stable identity, time-bounded definitions, pure status and
// participation evaluation, and version-aware local progress. Pure
// framework only — persistence lives in AppContext, and NO production
// event exists yet (the registry below ships EMPTY, so production
// behavior is byte-for-byte today's; presentation is GAME.10B).
//
// ── Design principles (G10A §4) ────────────────────────────────────────
// Events are deterministic, registry-defined, time-bounded, and
// location-agnostic. They are ADDITIVE to the base games: an inactive,
// upcoming, or expired event never seals, disables, or modifies the
// underlying game, its scoring, or the canonical Tale content. No
// randomness, no drops, no prizes, no venue rules, no physical claims,
// no marketplace concepts. Local-first: GAME.10A has no server time or
// schedule authority (a future gate may add one).
//
// ── The progression families (unchanged + this gate) ───────────────────
//   COMPLETION   = gameBadges          (Tale ids)
//   PB           = gameResultsBest     (GameIds, version-invalidated)
//   MASTERY      = gameMastery         (GameIds, durable/grandfathered)
//   COLLECTIBLES = collectibles        (CollectibleIds, durable)
//   EVENTS       = gameEvents          (EventIds, VERSION-SENSITIVE —
//                  unlike collectible ownership, stored participation
//                  for a changed event version is ignored, because
//                  event rules may change materially between runs)

import type { GameId, GameResult } from './registry';
import { GAME_REGISTRY } from './registry';

// ── Stable event identity ───────────────────────────────────────────────
// EventId is durable and migration-sensitive, independent of GameId,
// TaleId, and CollectibleId. 'framework-test-event' is the GAME.10A
// architecture-validation id: it is NEVER registered in the production
// registry below and never appears in player-facing UI (test fixtures
// only). Real event ids are added one per approved registration gate.
export type EventId =
  | 'framework-test-event'
  // PUBLIC-v7.4B.GAME.10D — the first real Trackside event.
  | 'inaugural-run';

// ── Definition (data-oriented; no UI/reward/backend concerns) ───────────
export interface GameEventDefinition {
  eventId: EventId;
  name: string;
  /** UTC ISO timestamp — INCLUSIVE window start. */
  startsAt: string;
  /** UTC ISO timestamp — EXCLUSIVE window end. */
  endsAt: string;
  /** The games this event targets (one, several, or all). Base games
   *  remain playable independently of event state. */
  gameIds: readonly GameId[];
  /** Event rules version. Stored progress from another version is
   *  ignored at hydration (see GameEventProgress). */
  version: number;
}

/** GAME.10A.A §5 — EXPLICIT UTC contract. Event schedule timestamps
 *  must be ISO 8601 with an EXPLICIT UTC designator (trailing `Z`, or
 *  the equivalent `+00:00`/`-00:00` offset). Timezone-less strings are
 *  REJECTED even though Date.parse can parse them, because that parse
 *  is local-time and would make event windows locale-dependent.
 *  Returns the epoch millis, or NaN for anything non-conforming. */
const UTC_ISO_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]00:00)$/;

function parseUtcInstant(value: string): number {
  if (!UTC_ISO_PATTERN.test(value)) return NaN;
  return Date.parse(value);
}

/** Structural validity for a definition (used by fixtures/tests and any
 *  future registration path): EXPLICIT-UTC ISO timestamps (see
 *  parseUtcInstant — timezone-less strings fail) in order, a
 *  non-empty unique set of known GameIds, and a positive integer
 *  version. Definitions failing this must never reach evaluation. */
export function isValidEventDefinition(def: GameEventDefinition): boolean {
  const start = parseUtcInstant(def.startsAt);
  const end = parseUtcInstant(def.endsAt);
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start < end &&
    def.gameIds.length > 0 &&
    def.gameIds.every((id) => id in GAME_REGISTRY) &&
    new Set(def.gameIds).size === def.gameIds.length &&
    Number.isInteger(def.version) && def.version >= 1
  );
}

// ── The registry ────────────────────────────────────────────────────────
// Every entry here is a REAL production event, registered one per
// approved gate (never a data tweak): each carries operator-approved
// identity, name, explicit-UTC window, targets, and version. Test
// fixtures still never live here — probes inject definitions through
// the test-only seam below. Rollback for any event is removal of its
// entry (+ union member): the board renders nothing again, base games
// are untouched, and stored local progress for the removed id is
// simply ignored at hydration as unknown.
export const GAME_EVENT_REGISTRY: Readonly<Record<string, GameEventDefinition>> = {
  // PUBLIC-v7.4B.GAME.10D — THE INAUGURAL RUN: the first real event.
  // One successful result in each targeted game while active completes
  // it. Completion is status only — no reward, no collectible, no
  // physical item, no venue or location dependency.
  'inaugural-run': {
    eventId: 'inaugural-run',
    name: 'THE INAUGURAL RUN',
    startsAt: '2026-09-04T22:00:00.000Z',
    endsAt: '2026-09-18T22:00:00.000Z',
    gameIds: [
      'allen-town-grid',
      'packer-rail-line',
      'station-preservation',
    ],
    version: 1,
  },
};

// GAME.10B §7 — TEST-ONLY definition seam. The production registry
// above stays EMPTY and getAllGameEvents() reads it by default; the
// setter below lets local probes inject fixture definitions into the
// SAME source the reducer and the presentation layer read, so the
// full live loop (real result → GAME.10A participation → UI) can be
// proven without registering anything in production. Production code
// NEVER calls the setter, no query-param/URL backdoor exists, and a
// page reload resets it (module re-evaluation). Ships as a few inert
// bytes.
let eventDefinitionSource: () => GameEventDefinition[] = () =>
  Object.values(GAME_EVENT_REGISTRY);

/** TEST-ONLY (never called by production code): override or reset the
 *  event-definition source for local probe validation. */
export function __setGameEventDefinitionsForTesting(
  definitions?: readonly GameEventDefinition[],
): void {
  eventDefinitionSource = definitions
    ? () => [...definitions]
    : () => Object.values(GAME_EVENT_REGISTRY);
}

/** Every registered event definition (production: empty array). */
export function getAllGameEvents(): GameEventDefinition[] {
  return eventDefinitionSource();
}

// ── Status (pure, injected now — never Date.now() in here) ─────────────
export type GameEventStatus = 'upcoming' | 'active' | 'expired';

/** Resolve an event's status at an injected instant.
 *  startsAt inclusive, endsAt exclusive:
 *    now <  startsAt          → upcoming
 *    startsAt <= now < endsAt → active
 *    now >= endsAt            → expired
 *  Event timestamps go through the explicit-UTC parser: unparseable OR
 *  timezone-less schedule strings fail CLOSED to 'expired' (never
 *  credits) — isValidEventDefinition is the real gate; this is defense
 *  in depth. The injected `now` (a Date, or the sealed
 *  result.completedAt — always toISOString's Z form) is parsed the
 *  same strict way when given as a string. */
export function getGameEventStatus(
  event: GameEventDefinition,
  now: Date | string,
): GameEventStatus {
  const t = typeof now === 'string' ? parseUtcInstant(now) : now.getTime();
  const start = parseUtcInstant(event.startsAt);
  const end = parseUtcInstant(event.endsAt);
  if (!Number.isFinite(t) || !Number.isFinite(start) || !Number.isFinite(end)) {
    return 'expired';
  }
  if (t < start) return 'upcoming';
  if (t < end) return 'active';
  return 'expired';
}

// ── Participation record (persisted to tb_game_events) ─────────────────
// Deliberately minimal: which targeted games have been successfully
// completed during the active window, when participation began, and
// when the event was completed. NOT stored: scores, sessions,
// per-attempt timestamps, ranks, or rewards.
export interface GameEventProgress {
  eventId: EventId;
  /** The definition version this progress was earned under. A stored
   *  record whose version differs from the CURRENT definition is
   *  ignored at hydration (event rules may change materially) — the
   *  child is skipped, never globally deleted. */
  eventVersion: number;
  /** ISO timestamp of the first CREDITED (won, in-window) result. */
  firstPlayedAt?: string;
  /** Unique targeted GameIds with successful in-window completion. */
  completedGameIds: GameId[];
  /** Set exactly once, when the final required game is credited;
   *  never rewritten by replays. */
  completedAt?: string;
}

// ── Pure participation evaluation (G10A §13/§14/§19) ────────────────────
/**
 * Fold one terminal result into event progress. Pure and
 * deterministic: the event window is evaluated at
 * result.completedAt — the sealed terminal-result moment (§18's
 * time authority) — never render or hydration time.
 *
 * Credit requires ALL of:
 *   - the event is ACTIVE at result.completedAt
 *   - result.won === true (losses never credit)
 *   - result.gameId is one of the event's targeted gameIds
 *   - the game is not already credited (duplicate no-op: no re-add,
 *     no firstPlayedAt/completedAt rewrite)
 *
 * Upcoming and expired events never credit; base-game progression is
 * unaffected either way. One result may credit several concurrently
 * active events independently. Returns the SAME reference when
 * nothing changes (empty registry ⇒ always a no-op).
 */
export function applyResultToGameEvents(args: {
  result: GameResult;
  eventDefinitions: readonly GameEventDefinition[];
  currentProgress: Record<string, GameEventProgress>;
}): Record<string, GameEventProgress> {
  const { result, eventDefinitions, currentProgress } = args;
  if (!result.won || eventDefinitions.length === 0) return currentProgress;

  let next: Record<string, GameEventProgress> | null = null;
  for (const def of eventDefinitions) {
    if (!def.gameIds.includes(result.gameId)) continue;
    if (getGameEventStatus(def, result.completedAt) !== 'active') continue;

    const existing = currentProgress[def.eventId];
    // Defensive: hydration already drops other-version records, so a
    // version mismatch here means stale in-memory state — start fresh
    // under the current rules rather than mixing versions.
    const base =
      existing && existing.eventVersion === def.version ? existing : undefined;
    if (base?.completedGameIds.includes(result.gameId)) continue; // no-op

    const completedGameIds = [...(base?.completedGameIds ?? []), result.gameId];
    const complete = def.gameIds.every((id) => completedGameIds.includes(id));
    const record: GameEventProgress = {
      eventId: def.eventId,
      eventVersion: def.version,
      firstPlayedAt: base?.firstPlayedAt ?? result.completedAt,
      completedGameIds,
      ...(base?.completedAt !== undefined
        ? { completedAt: base.completedAt }
        : complete
          ? { completedAt: result.completedAt }
          : {}),
    };
    next = next ?? { ...currentProgress };
    next[def.eventId] = record;
  }
  return next ?? currentProgress;
}

// ================== GAME.10B — presentation helpers (pure) ==================
// Read-only projection of definitions + participation truth into what
// the EventBoard component renders. Pages never reimplement status or
// completion logic.

export interface EventPresentationModel {
  definition: GameEventDefinition;
  status: GameEventStatus;
  /** CURRENT-version progress only — a stored record from another
   *  event version is omitted here (the event presents as
   *  zero-progress under the current rules; no player-facing
   *  stale-version messaging in GAME.10B). */
  progress?: GameEventProgress;
}

/** Deterministic board order (G10B §15): ACTIVE → UPCOMING → ENDED;
 *  within a status, startsAt ascending; eventId as the final
 *  tie-break. */
const EVENT_STATUS_ORDER: Record<GameEventStatus, number> = {
  active: 0,
  upcoming: 1,
  expired: 2,
};

export function getEventPresentationModels(
  progress: Record<string, GameEventProgress>,
  now: Date | string,
  definitions: readonly GameEventDefinition[] = getAllGameEvents(),
): EventPresentationModel[] {
  return definitions
    .map((definition) => {
      const stored = progress[definition.eventId];
      return {
        definition,
        status: getGameEventStatus(definition, now),
        ...(stored && stored.eventVersion === definition.version
          ? { progress: stored }
          : {}),
      };
    })
    .sort(
      (a, b) =>
        EVENT_STATUS_ORDER[a.status] - EVENT_STATUS_ORDER[b.status] ||
        Date.parse(a.definition.startsAt) - Date.parse(b.definition.startsAt) ||
        a.definition.eventId.localeCompare(b.definition.eventId),
    );
}

/** All required games credited under the current version? */
export function isEventComplete(model: EventPresentationModel): boolean {
  const done = model.progress?.completedGameIds ?? [];
  return model.definition.gameIds.every((id) => done.includes(id));
}

/** Compact, calm, locale-safe date range — "OCT 1 – OCT 7" style.
 *  endsAt is EXCLUSIVE, so the displayed final day is the last
 *  INCLUSIVE UTC day (endsAt minus 1ms). No raw ISO, no ticking
 *  countdown (G10B §10). */
const EVENT_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function formatEventDateRange(definition: GameEventDefinition): string {
  const start = Date.parse(definition.startsAt);
  const end = Date.parse(definition.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '';
  const first = EVENT_DATE_FORMAT.format(new Date(start)).toUpperCase();
  const last = EVENT_DATE_FORMAT.format(new Date(end - 1)).toUpperCase();
  return first === last ? first : `${first} – ${last}`;
}
