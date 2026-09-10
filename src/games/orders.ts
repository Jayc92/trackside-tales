// ================== TRACKSIDE ARCADE — ORDERS (WEEKLY DISPATCH) ==================
// PUBLIC-v7.4B.GAME.22E.B — the PURE authority foundation for the first
// repeatable progression source. An ORDER is a posted, recurring
// objective with one completion per calendar period; v1 ships exactly
// one order, WEEKLY DISPATCH. This module holds the definition, the
// deterministic featured-game rotation, the durable store contract, the
// strict sanitizer, the qualifying-result completion fold, the award-id
// builder and the read-only period/objective adapters.
//
// NOTHING here is wired yet (GAME.22E.C activates authority): no reducer
// importer, no persistence effect, no XP evaluator family, no UI. Pure
// and side-effect free — no React, no DOM, no localStorage, no Date.now
// (every instant is an explicit input, normally result.completedAt).
//
// ── Frozen product contract (GAME.22E.A, ratified for 22E.B) ────────────
//   one WEEKLY DISPATCH · one completion per Trackside calendar week
//   week = Monday 00:00 → next Monday 00:00 America/New_York
//   qualifies: WIN · STANDARD band · SILVER OR BETTER ON THIS RUN · the
//              period's FEATURED game
//   never: Assisted, loss, Standard Bronze, the wrong game, a period
//          already complete
//   a qualifying REPLAY may complete an incomplete period
//   reward 150 XP, granted ONCE per award identity by the XP ledger
//
// ── Frozen authority order for 22E.C (documented, not implemented) ──────
//   badge (prior action) → RECORD_GAME_RESULT: 1 PB · 2 mastery · 3 event
//   · 4 collectibles · 5 quests · 6 ORDERS · 7 XP. Orders settle before
//   XP; XP runs exactly once and grants from the order-store TRANSITION
//   (completion absent before, present after). No order-side XP grant.
//
// ── Frozen clock policy: IDENTITY ONLY ──────────────────────────────────
//   A completion is authoritative for the period containing the sealed
//   result.completedAt. There is NO monotonic "period must follow the
//   latest completion" guard: the app is localStorage-only, a device
//   clock cannot be trusted or verified without server time, and such a
//   guard would permanently lock an honest player out after a wrongly
//   future-set clock was corrected. Consequences, documented and
//   accepted: a backdated or forward-dated qualifying result may consume
//   its own (absent) period; once the clock is corrected, ordinary
//   current periods stay completable unless their exact identity was
//   already consumed. The only guarantees the client can give are
//   identity uniqueness (one record per order per period) and record
//   consistency (the sanitizer drops a record whose completedAt is not
//   inside its own period).
//
// ── Hydration vs recovery (frozen distinction) ──────────────────────────
//   NORMAL ORDER HYDRATION (22E.C loader): parse/sanitize this store →
//   zero XP, zero completions created, zero progression mutation. There
//   is no historical backfill: only a newly processed sealed result can
//   create a completion, so a player's prior Silver in a featured game
//   never becomes a retroactive dispatch.
//   PROGRESSION LEDGER RECOVERY (22E.C, existing one-time initializer
//   path only): when the XP ledger itself is missing/corrupt, the valid
//   durable completion records enumerated by `enumerateOrderXpRecovery`
//   let the initializer reconstruct their ALREADY-EARNED award records
//   (frozen xpReward, derived award id). That is recovery of derived XP
//   truth — never a new completion, never normal-hydration XP.
//
// ── Rollback safety (GAME.22E.B §17) ────────────────────────────────────
//   The parse primitive returns a TAGGED result. An envelope whose
//   ordersVersion is above the version this runtime understands is
//   reported as `unsupported` (with the raw version) — never rewritten
//   into an empty v1 store. 22E.C decides how AppContext treats that
//   case; the principle is fixed here: future-version data is never
//   destroyed automatically.

import type { DifficultyBand, GameId, GameResult } from './registry';
import { STANDARD_BAND } from './challengePolicy';
import type { MasteryTier } from './mastery';
import { MASTERY_TIER_RANK } from './mastery';
import type { WeeklyPeriod } from './weeklyPeriod';
import { getWeeklyPeriod } from './weeklyPeriod';
import type { DispatchObjectiveState } from './nextObjective';

// ── Definition (versioned, immutable, no player state) ──────────────────
export type OrderCadence = 'weekly';

export interface OrderDefinition {
  readonly orderId: string;
  /** Semantics version. A future objective change mints orderVersion 2
   *  (new award identities); it never rewrites what v1 meant. */
  readonly orderVersion: number;
  /** Player-facing name (the XP label stays WEEKLY DISPATCH). */
  readonly name: string;
  readonly cadence: OrderCadence;
  readonly requiredDifficultyBand: DifficultyBand;
  /** THIS RUN's candidate tier must rank at or above this tier. */
  readonly requiredTier: MasteryTier;
  /** The Monday-local period id whose featured game is rotation[0]. */
  readonly rotationAnchorPeriodId: string;
  /** EXPLICIT canonical rotation — frozen here on purpose so registering
   *  a new game never silently changes which game a week features. */
  readonly featuredRotation: readonly GameId[];
  /** Copied into each completion record at completion time and FROZEN. */
  readonly xpReward: number;
}

export const WEEKLY_DISPATCH_ORDER_ID = 'weekly-dispatch';
export const WEEKLY_DISPATCH_NAME = 'WEEKLY DISPATCH';
export const WEEKLY_DISPATCH_XP = 150;
/** Frozen anchor (22E.A §16 / 22E.B §4): Monday 2026-09-07 → Allen. */
export const WEEKLY_DISPATCH_ROTATION_ANCHOR_PERIOD_ID = '2026-09-07';
/** Canonical game order (registry declaration order, pinned by test). */
export const ORDER_CANONICAL_ROTATION: readonly GameId[] = [
  'allen-town-grid',
  'packer-rail-line',
  'station-preservation',
];

export const WEEKLY_DISPATCH_ORDER: OrderDefinition = {
  orderId: WEEKLY_DISPATCH_ORDER_ID,
  orderVersion: 1,
  name: WEEKLY_DISPATCH_NAME,
  cadence: 'weekly',
  requiredDifficultyBand: STANDARD_BAND,
  requiredTier: 'silver',
  rotationAnchorPeriodId: WEEKLY_DISPATCH_ROTATION_ANCHOR_PERIOD_ID,
  featuredRotation: ORDER_CANONICAL_ROTATION,
  xpReward: WEEKLY_DISPATCH_XP,
};

// ── Registry (one v1 definition; declaration order is canonical) ────────
const ORDER_REGISTRY_ORDER: readonly OrderDefinition[] = [WEEKLY_DISPATCH_ORDER];

export function getAllOrderDefinitions(): readonly OrderDefinition[] {
  return ORDER_REGISTRY_ORDER;
}

export function getOrderDefinition(orderId: string): OrderDefinition | undefined {
  return ORDER_REGISTRY_ORDER.find((def) => def.orderId === orderId);
}

// ── Period ids and calendar-day arithmetic ──────────────────────────────
// A period id is the LOCAL Monday date (YYYY-MM-DD) from weeklyPeriod.ts.
// Rotation arithmetic works on calendar DAYS of that date triple (UTC
// space is used only as an integer day counter) — never on elapsed UTC
// milliseconds between period instants, which DST makes 167/169 hours.
const DAY_MS = 86_400_000;
const PERIOD_ID_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 for a strictly valid YYYY-MM-DD, else null
 *  (rejects malformed text AND impossible dates such as 2026-02-30). */
export function periodIdToDayIndex(periodId: string): number | null {
  const match = PERIOD_ID_PATTERN.exec(periodId);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(utc);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) return null;
  return utc / DAY_MS;
}

/** Whether a valid period id names a Monday (every real period id does). */
export function isMondayPeriodId(periodId: string): boolean {
  const dayIndex = periodIdToDayIndex(periodId);
  return dayIndex !== null && new Date(dayIndex * DAY_MS).getUTCDay() === 1;
}

/** Mathematically correct modulo for negative ordinals (pre-anchor weeks). */
export function floorMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** Signed whole weeks from the anchor period to `periodId`; null when
 *  either id is invalid or the two dates are not on the same weekday
 *  grid (a non-Monday id fails closed instead of being rounded). */
export function weekOrdinalFromAnchor(periodId: string, anchorPeriodId: string): number | null {
  const anchorDay = periodIdToDayIndex(anchorPeriodId);
  const periodDay = periodIdToDayIndex(periodId);
  if (anchorDay === null || periodDay === null) return null;
  const dayDelta = periodDay - anchorDay;
  if (dayDelta % 7 !== 0) return null;
  return dayDelta / 7;
}

/** periodId → featured GameId for `definition`, or null (invalid id,
 *  off-grid id, empty rotation). Depends only on the id, the anchor and
 *  the explicit rotation — no storage, locale, randomness or clock. */
export function resolveFeaturedGameId(definition: OrderDefinition, periodId: string): GameId | null {
  const rotation = definition.featuredRotation;
  if (rotation.length === 0) return null;
  const ordinal = weekOrdinalFromAnchor(periodId, definition.rotationAnchorPeriodId);
  if (ordinal === null) return null;
  return rotation[floorMod(ordinal, rotation.length)];
}

// ── Durable store contract (future key tb_arcade_orders — NOT written here)
export const ORDERS_STORE_VERSION = 1;

/** One durable completion. `gameId` is the game actually played (history
 *  survives a later rotation change); `xpReward` is frozen at completion
 *  (the ledger can be reconstructed from this record alone). The award
 *  id is NOT stored — it derives from orderId + periodId + orderVersion. */
export interface OrderCompletionRecord {
  readonly orderId: string;
  readonly orderVersion: number;
  readonly periodId: string;
  readonly gameId: string;
  /** The sealed result.completedAt that completed the order. */
  readonly completedAt: string;
  readonly origin: 'result';
  readonly xpReward: number;
}

export type OrderCompletionMap = Readonly<Record<string, OrderCompletionRecord>>;

export interface OrderStore {
  /** Envelope schema version (this runtime understands exactly 1). */
  readonly ordersVersion: number;
  /** Keyed `<orderId>@<periodId>` — one logical completion per order per period. */
  readonly completions: OrderCompletionMap;
}

export function createEmptyOrderStore(): OrderStore {
  return { ordersVersion: ORDERS_STORE_VERSION, completions: {} };
}

export const ORDER_COMPLETION_KEY_SEPARATOR = '@';

/** `<orderId>@<periodId>`. orderVersion is deliberately absent: product
 *  law is one completion per period even if semantics change later. */
export function orderCompletionKey(orderId: string, periodId: string): string {
  return `${orderId}${ORDER_COMPLETION_KEY_SEPARATOR}${periodId}`;
}

export function parseOrderCompletionKey(key: string): { orderId: string; periodId: string } | null {
  const parts = key.split(ORDER_COMPLETION_KEY_SEPARATOR);
  if (parts.length !== 2) return null;
  const [orderId, periodId] = parts;
  if (orderId.length === 0) return null;
  if (periodIdToDayIndex(periodId) === null) return null;
  return { orderId, periodId };
}

// ── Award identity (internal; the player label stays WEEKLY DISPATCH) ───
/** `order:completion:<orderId>:<periodId>:v<orderVersion>` — plain
 *  colon-delimited family namespace, version LAST like every existing
 *  award family. One order, one period, one identity. */
export function orderCompletionAwardId(
  record: Pick<OrderCompletionRecord, 'orderId' | 'periodId' | 'orderVersion'>,
): string {
  return `order:completion:${record.orderId}:${record.periodId}:v${record.orderVersion}`;
}

// ── Sanitizer / loader primitives (pure; the 22E.C loader owns storage) ─
/** Defensible upper bound for one stored reward (the real value is 150). */
export const ORDER_XP_REWARD_MAX = 10_000;

export type OrderStoreParseResult =
  /** A versioned v1 envelope; malformed children dropped individually. */
  | { readonly kind: 'current'; readonly store: OrderStore; readonly droppedKeys: readonly string[] }
  /** Missing, unparseable, not an object, or no valid version marker. */
  | { readonly kind: 'empty' }
  /** A future envelope this runtime cannot interpret. NEVER rewritten. */
  | { readonly kind: 'unsupported'; readonly rawVersion: number };

/** Validate one stored child STRUCTURALLY and return its canonical
 *  reconstruction (known fields only — unknown extras are not carried
 *  into the typed store), or null to drop it. Historical durability:
 *  orderId is a plain recorded string (never a live-registry foreign
 *  key) and any integer orderVersion >= 1 is accepted, so retired or
 *  re-versioned orders keep their history; gameId is likewise a plain
 *  string. Consistency: the record must agree with its key, and its
 *  completedAt must fall inside its own period. */
export function sanitizeStoredOrderCompletion(key: string, raw: unknown): OrderCompletionRecord | null {
  const parsedKey = parseOrderCompletionKey(key);
  if (parsedKey === null) return null;
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.orderId !== parsedKey.orderId) return null;
  if (r.periodId !== parsedKey.periodId) return null;
  if (
    typeof r.orderVersion !== 'number' ||
    !Number.isInteger(r.orderVersion) ||
    r.orderVersion < 1
  ) return null;
  if (typeof r.completedAt !== 'string' || r.completedAt.length === 0) return null;
  const period = getWeeklyPeriod(r.completedAt);
  if (period === null || period.periodId !== parsedKey.periodId) return null;
  if (typeof r.gameId !== 'string' || r.gameId.length === 0) return null;
  if (r.origin !== 'result') return null;
  if (
    typeof r.xpReward !== 'number' ||
    !Number.isSafeInteger(r.xpReward) ||
    r.xpReward < 1 ||
    r.xpReward > ORDER_XP_REWARD_MAX
  ) return null;
  return {
    orderId: parsedKey.orderId,
    orderVersion: r.orderVersion,
    periodId: parsedKey.periodId,
    gameId: r.gameId,
    completedAt: r.completedAt,
    origin: 'result',
    xpReward: r.xpReward,
  };
}

/** Sanitize an already-parsed value. Never throws, never mutates `raw`,
 *  never creates a completion, never touches XP. */
export function sanitizeStoredOrders(raw: unknown): OrderStoreParseResult {
  if (typeof raw !== 'object' || raw === null) return { kind: 'empty' };
  const r = raw as Record<string, unknown>;
  const version = r.ordersVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { kind: 'empty' };
  }
  if (version > ORDERS_STORE_VERSION) return { kind: 'unsupported', rawVersion: version };
  const completions: Record<string, OrderCompletionRecord> = {};
  const droppedKeys: string[] = [];
  if (typeof r.completions === 'object' && r.completions !== null) {
    for (const [key, value] of Object.entries(r.completions as Record<string, unknown>)) {
      const record = sanitizeStoredOrderCompletion(key, value);
      if (record === null) droppedKeys.push(key);
      else completions[key] = record;
    }
  }
  return { kind: 'current', store: { ordersVersion: ORDERS_STORE_VERSION, completions }, droppedKeys };
}

/** Sanitize raw storage TEXT (what a future loader reads from the key).
 *  null/empty/unparseable text is `empty`; nothing here reads storage. */
export function parseStoredOrdersText(text: string | null | undefined): OrderStoreParseResult {
  if (typeof text !== 'string' || text.length === 0) return { kind: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    return { kind: 'empty' };
  }
  return sanitizeStoredOrders(parsed);
}

// ── Qualification (THIS RUN's candidate tier, never durable mastery) ────
export interface OrderQualification {
  readonly definition: OrderDefinition;
  readonly period: WeeklyPeriod;
  readonly featuredGameId: GameId;
}

/** Pure predicate: does THIS sealed result satisfy `definition`?
 *  `runTier` is the per-run candidate the reducer already computes at
 *  step 2 (`evaluateMastery(definition, result)`) — Assisted and
 *  untrusted-score runs arrive as 'bronze' there and fail here. Durable
 *  mastery is never consulted: a Gold holder replaying to Bronze does
 *  not qualify. Completion occupancy is the fold's concern, not this. */
export function qualifyOrderResult(
  definition: OrderDefinition,
  result: GameResult,
  runTier: MasteryTier | null,
): OrderQualification | null {
  if (!result.won) return null;
  if (result.difficultyBand !== definition.requiredDifficultyBand) return null;
  if (runTier === null) return null;
  if (MASTERY_TIER_RANK[runTier] < MASTERY_TIER_RANK[definition.requiredTier]) return null;
  const period = getWeeklyPeriod(result.completedAt);
  if (period === null) return null;
  const featuredGameId = resolveFeaturedGameId(definition, period.periodId);
  if (featuredGameId === null) return null;
  if (result.gameId !== featuredGameId) return null;
  return { definition, period, featuredGameId };
}

export function createOrderCompletionRecord(
  qualification: OrderQualification,
  result: GameResult,
): OrderCompletionRecord {
  return {
    orderId: qualification.definition.orderId,
    orderVersion: qualification.definition.orderVersion,
    periodId: qualification.period.periodId,
    gameId: result.gameId,
    completedAt: result.completedAt,
    origin: 'result',
    xpReward: qualification.definition.xpReward,
  };
}

// ── Pure completion fold (future reducer step 6) ────────────────────────
/** Fold one sealed result into the completion map. Returns the SAME
 *  reference when nothing completes (loss, non-qualifying run, period
 *  already complete) and a new map holding exactly one new record per
 *  newly completed order otherwise. Idempotent: applying the same
 *  qualifying result twice creates the record once. No storage, no XP,
 *  no clock — completedAt is the sealed result's own timestamp. */
export function applyResultToOrders(args: {
  currentCompletions: OrderCompletionMap;
  result: GameResult;
  runTier: MasteryTier | null;
  orderDefinitions?: readonly OrderDefinition[];
}): OrderCompletionMap {
  const { currentCompletions, result, runTier } = args;
  if (!result.won) return currentCompletions;
  const definitions = args.orderDefinitions ?? getAllOrderDefinitions();
  let next: Record<string, OrderCompletionRecord> | null = null;
  for (const definition of definitions) {
    const qualification = qualifyOrderResult(definition, result, runTier);
    if (qualification === null) continue;
    const key = orderCompletionKey(definition.orderId, qualification.period.periodId);
    if (key in currentCompletions) continue; // one completion per order per period
    next = next ?? { ...currentCompletions };
    next[key] = createOrderCompletionRecord(qualification, result);
  }
  return next ?? currentCompletions;
}

/** Store-level convenience for the future reducer: same store reference
 *  when the completion map did not change. */
export function applyResultToOrderStore(
  store: OrderStore,
  args: { result: GameResult; runTier: MasteryTier | null; orderDefinitions?: readonly OrderDefinition[] },
): OrderStore {
  const completions = applyResultToOrders({ currentCompletions: store.completions, ...args });
  if (completions === store.completions) return store;
  return { ordersVersion: store.ordersVersion, completions };
}

// ── Read-only period / objective adapters (explicit instant, no clock) ─
export type OrderPeriodStatus = 'active' | 'complete';

export interface CurrentOrderState {
  readonly definition: OrderDefinition;
  readonly period: WeeklyPeriod;
  readonly featuredGameId: GameId;
  readonly status: OrderPeriodStatus;
  readonly completion: OrderCompletionRecord | null;
}

/** The order's state for the period containing `now` (an explicit
 *  instant). Every calendar week has an order, so the only statuses are
 *  active and complete; historical completions stay in the store and
 *  are not modelled here. Null for an unparseable instant. */
export function getCurrentOrderState(
  definition: OrderDefinition,
  completions: OrderCompletionMap,
  now: string | Date,
): CurrentOrderState | null {
  const period = getWeeklyPeriod(now);
  if (period === null) return null;
  const featuredGameId = resolveFeaturedGameId(definition, period.periodId);
  if (featuredGameId === null) return null;
  const completion = completions[orderCompletionKey(definition.orderId, period.periodId)] ?? null;
  return {
    definition,
    period,
    featuredGameId,
    status: completion === null ? 'active' : 'complete',
    completion,
  };
}

/** Adapter to the existing next-objective resolver's P4 input (GAME.22B
 *  froze `requiredTier: 'silver'`). Derived from definition + explicit
 *  instant + completion map; nothing is persisted. The first registered
 *  weekly order is the dispatch; null when there is none, when the
 *  instant is unparseable, or when the definition's requirement cannot
 *  be represented by the frozen resolver contract. Not imported by any
 *  runtime module in 22E.B — P4 stays inactive. */
export function getDispatchObjectiveState(
  completions: OrderCompletionMap,
  now: string | Date,
  orderDefinitions: readonly OrderDefinition[] = getAllOrderDefinitions(),
): DispatchObjectiveState | null {
  const definition = orderDefinitions.find((def) => def.cadence === 'weekly');
  if (definition === undefined || definition.requiredTier !== 'silver') return null;
  const state = getCurrentOrderState(definition, completions, now);
  if (state === null) return null;
  return {
    orderId: definition.orderId,
    periodId: state.period.periodId,
    featuredGameId: state.featuredGameId,
    complete: state.status === 'complete',
    requiredTier: 'silver',
    nextPeriodStart: state.period.endsAt,
  };
}

// ── Future XP recovery input (data only — no award is created here) ─────
export interface OrderXpRecoveryEntry {
  readonly awardId: string;
  readonly xpReward: number;
  readonly completedAt: string;
  readonly source: {
    readonly kind: 'order-completion';
    readonly orderId: string;
    readonly orderVersion: number;
    readonly periodId: string;
  };
}

/** Enumerate what the progression ledger's one-time recovery path would
 *  need to reconstruct already-earned order XP from durable completion
 *  truth (22E.C wires it; nothing is granted here). Deterministic order:
 *  periodId, then orderId. */
export function enumerateOrderXpRecovery(completions: OrderCompletionMap): OrderXpRecoveryEntry[] {
  return Object.values(completions)
    .slice()
    .sort((a, b) =>
      a.periodId < b.periodId ? -1 : a.periodId > b.periodId ? 1 :
      a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0,
    )
    .map((record) => ({
      awardId: orderCompletionAwardId(record),
      xpReward: record.xpReward,
      completedAt: record.completedAt,
      source: {
        kind: 'order-completion',
        orderId: record.orderId,
        orderVersion: record.orderVersion,
        periodId: record.periodId,
      },
    }));
}
