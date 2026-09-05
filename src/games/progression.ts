// ================== TRACKSIDE ARCADE — XP + RANK PROGRESSION ==================
// PUBLIC-v7.4B.GAME.12 — the platform-wide progression layer: a durable
// append-only ledger of finite XP awards over accomplishments the other
// families already record, plus the SERVICE RECORD rank ladder derived
// from the ledger total. Pure model only — persistence lives in
// AppContext; presentation lives on the Arcade/Passport surfaces.
//
// ── What ARCADE XP is ───────────────────────────────────────────────────
// Durable progression earned from meaningful FIRST-TIME accomplishments
// and improvements across the Arcade. Every award is a finite,
// once-per-identity transition: replays earn nothing, so no grind path
// exists by construction (the awardId space IS the earnable universe).
//
// ── What it is NOT (hard boundaries) ────────────────────────────────────
// Not a currency, not spendable, not redeemable, not a probability, not
// money, not a physical entitlement, not a leaderboard, and not server
// authority — XP/rank is browser-local progression, durable and
// idempotent within normal application execution only.
//
// ── The six separations ─────────────────────────────────────────────────
//   COMPLETION   = gameBadges          (Tale ids)
//   PB           = gameResultsBest     (GameIds, version-invalidated)
//   MASTERY      = gameMastery         (GameIds, durable/grandfathered)
//   COLLECTIBLES = collectibles        (CollectibleIds, durable)
//   EVENTS       = gameEvents          (EventIds, version-sensitive)
//   XP LEDGER    = progression         (XpAwardIds — THIS gate; durable,
//                  append-only, values FROZEN at grant time)
// XP never grants any of the others, and none of the others read XP.
// Double-counting policy (G12A §6/§7): badges/mastery/platform/event
// truths are the PRIMARY sources; collectibles and PBs are derived
// presentations of the same accomplishments and award ZERO XP.

import type { GameDefinition, GameId, GameResult } from './registry';
import { GAME_REGISTRY, getAllGameDefinitions } from './registry';
import type { GameMasteryRecord, MasteryTier } from './mastery';
import { MASTERY_TIER_RANK } from './mastery';
import type { GameEventDefinition, GameEventProgress } from './events';
import { getAllGameEvents } from './events';
// GAME.13 — quest truth for quest-completion XP. One-way import
// (quests.ts never imports this module), so no cycle exists.
import type { QuestCompletionRecord, QuestDefinition } from './quests';
import { getAllQuests } from './quests';

// ── Award identity ──────────────────────────────────────────────────────
// The awardId is the idempotency boundary: one id, at most one ledger
// child, forever. Ids embed the stable GameId/EventId (+ eventVersion,
// so a deliberate v2 re-run is a NEW opportunity) and are historical —
// a removed game/event never revokes an already-earned award.
export type XpAwardId = string;

export function firstWinAwardId(gameId: string): XpAwardId {
  return `game:first-win:${gameId}`;
}
export type MasteryXpTier = 'silver' | 'gold' | 'engineer';
export function masteryAwardId(tier: MasteryXpTier, gameId: string): XpAwardId {
  return `mastery:${tier}:${gameId}`;
}
/** Versioned so a future second platform milestone is an explicit new
 *  identity minted by its own gate, never an automatic re-grant. */
export const PLATFORM_ALL_GAMES_AWARD_ID: XpAwardId = 'platform:all-games:v1';
export function eventParticipationAwardId(eventId: string, eventVersion: number): XpAwardId {
  return `event:participation:${eventId}:v${eventVersion}`;
}
export function eventCompletionAwardId(eventId: string, eventVersion: number): XpAwardId {
  return `event:completion:${eventId}:v${eventVersion}`;
}
// GAME.13 — quest completion (version in the id: provenance records the
// version actually completed).
export function questCompletionAwardId(questId: string, questVersion: number): XpAwardId {
  return `quest:completion:${questId}:v${questVersion}`;
}

// ── Approved v1 XP economy (G12B §1) ────────────────────────────────────
// Values are copied into each award record at grant time and FROZEN
// there: a future economy change mints new identities; it never
// rewrites history.
export const XP_VALUES = {
  firstWin: 100,
  silver: 150,
  gold: 250,
  engineer: 400,
  platformAllGames: 300,
  eventParticipation: 100,
  eventCompletion: 500,
} as const;
const MASTERY_TIER_XP: Record<MasteryXpTier, number> = {
  silver: XP_VALUES.silver,
  gold: XP_VALUES.gold,
  engineer: XP_VALUES.engineer,
};
/** Ordered lowest→highest; evaluation order and rank math rely on it. */
export const MASTERY_XP_TIERS: readonly MasteryXpTier[] = ['silver', 'gold', 'engineer'];

/** Defensible upper bound for one stored award (largest real value is
 *  500). Keeps hand-edited absurdities out of the ledger at hydration. */
export const XP_RECORD_MAX = 10_000;

// ── Ownership record (persisted inside tb_arcade_progression) ───────────
export type XpAwardOrigin = 'result' | 'backfill';

export type XpAwardSource =
  | { kind: 'game-first-win'; gameId: string }
  | { kind: 'mastery-tier'; gameId: string; tier: MasteryXpTier }
  | { kind: 'platform-completion' }
  | { kind: 'event-participation'; eventId: string; eventVersion: number }
  | { kind: 'event-completion'; eventId: string; eventVersion: number }
  // GAME.13 — quest completion. Ids are historical provenance (plain
  // strings, never live-registry foreign keys); the xp VALUE comes from
  // the completion record's frozen xpReward, so a retired quest's XP
  // stays reconstructable without the live registry.
  | { kind: 'quest-completion'; questId: string; questVersion: number };

export interface XpAwardRecord {
  awardId: XpAwardId;
  /** FROZEN at grant time — never recalculated from current constants. */
  xp: number;
  /** result-origin: the granting result.completedAt (one shared
   *  timestamp for every award from the same GameResult). backfill:
   *  the strongest historical timestamp the durable truth exposes,
   *  else the single backfill-initialization instant. */
  earnedAt: string;
  origin: XpAwardOrigin;
  source: XpAwardSource;
}

export interface ArcadeProgression {
  /** Store schema version AND the one-time backfill marker: a store
   *  carrying version >= 1 is never backfilled again — including the
   *  post-RESET empty store, so cleared progression never resurrects. */
  progressionVersion: number;
  awards: Record<XpAwardId, XpAwardRecord>;
}

export function createEmptyProgression(): ArcadeProgression {
  return { progressionVersion: 1, awards: {} };
}

// ── Total XP (the ONLY total authority) ─────────────────────────────────
/** totalXp = sum of ledger values. Never independently stored, so it
 *  can never diverge; record order cannot matter. */
export function getTotalXp(progression: ArcadeProgression): number {
  return Object.values(progression.awards).reduce((sum, a) => sum + a.xp, 0);
}

// ── Rank ladder (approved G12B §2) ──────────────────────────────────────
export interface RankDefinition {
  name: string;
  /** Inclusive minimum total XP. */
  threshold: number;
}
export const RANKS: readonly RankDefinition[] = [
  { name: 'PASSENGER', threshold: 0 },
  { name: 'STATION HAND', threshold: 100 },
  { name: 'BRAKEMAN', threshold: 400 },
  { name: 'SWITCHMAN', threshold: 800 },
  { name: 'FIREMAN', threshold: 1400 },
  { name: 'CONDUCTOR', threshold: 2200 },
  { name: 'DISPATCHER', threshold: 3200 },
  { name: 'TRAINMASTER', threshold: 4500 },
  { name: 'ROAD FOREMAN', threshold: 6500 },
  { name: 'DIVISION SUPERINTENDENT', threshold: 9000 },
];

export function getRankForXp(totalXp: number): RankDefinition {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (totalXp >= rank.threshold) current = rank;
  }
  return current;
}

/** The next rank above the total, or null at the top (no fake next). */
export function getNextRank(totalXp: number): RankDefinition | null {
  for (const rank of RANKS) {
    if (totalXp < rank.threshold) return rank;
  }
  return null;
}

export interface RankProgress {
  rank: RankDefinition;
  next: RankDefinition | null;
  totalXp: number;
  /** XP still needed for `next` (0 at the top rank). */
  remaining: number;
  /** 0–100 within the current rank band (100 at the top rank). */
  percent: number;
}

export function getRankProgress(totalXp: number): RankProgress {
  const rank = getRankForXp(totalXp);
  const next = getNextRank(totalXp);
  if (!next) {
    return { rank, next: null, totalXp, remaining: 0, percent: 100 };
  }
  const span = next.threshold - rank.threshold;
  const into = totalXp - rank.threshold;
  const percent = Math.min(100, Math.max(0, Math.round((into / span) * 100)));
  return { rank, next, totalXp, remaining: next.threshold - totalXp, percent };
}

// ── Pure result evaluation ──────────────────────────────────────────────
/**
 * Which finite XP awards does this terminal result newly earn?
 * Pure, deterministic, duplicate-safe (owned awardIds never re-grant),
 * stable outward order (G12B §19): first-win → silver → gold →
 * engineer → platform → per-event participation → completion (events
 * in definition order). No storage/DOM access; no Date.now() — every
 * result-origin earnedAt is the sealed result.completedAt.
 *
 * Rules (G12B §§12–17):
 *   loss / unknown GameId → nothing, ever.
 *   first win             → 100, once per GameId (first OBSERVED win —
 *                           the badge itself never awards separately).
 *   mastery tiers         → resulting persisted tier RANK >= tier and
 *                           award absent. Tier SKIPS bank every crossed
 *                           tier in one result (none→engineer grants
 *                           silver+gold+engineer). Bronze: no XP —
 *                           first-win owns the completion moment.
 *   platform              → every CURRENT registered game's Tale holds
 *                           completion truth (same prospective-universe
 *                           badge rule as FULL LINE; the collectible
 *                           itself awards nothing).
 *   event participation / → the event record must have CHANGED IN THIS
 *   completion              RESULT (a valid crediting result per the
 *                           event framework — prev !== next for that
 *                           event), be version-current, and the award
 *                           absent. Stored-truth alone never awards
 *                           here (that is the one-time backfill's job);
 *                           post-complete replays are same-reference
 *                           no-ops and so award nothing. The INAUGURAL
 *                           RUN PASS and every other collectible award
 *                           ZERO XP (derived presentations).
 */
export function evaluateXpAwards(args: {
  result: GameResult;
  /** POST-RESULT completion truth (badge dispatch precedes the result
   *  dispatch in the production win path). */
  resultingGameBadges: ReadonlySet<string>;
  /** POST-RESULT durable mastery map (this result's upgrade applied). */
  resultingGameMastery: Record<string, GameMasteryRecord>;
  /** PRE-FOLD event map (state.gameEvents before this result). */
  previousGameEvents: Record<string, GameEventProgress>;
  /** POST-FOLD event map (nextGameEvents). */
  resultingGameEvents: Record<string, GameEventProgress>;
  ownedAwards: Record<string, XpAwardRecord>;
  registeredGames?: readonly GameDefinition[];
  eventDefinitions?: readonly GameEventDefinition[];
  /** GAME.13 — quest completion transition: the completion ledger
   *  before and after this result's quest fold. Quest XP grants ONLY
   *  when a completion is NEW in this result (the quest fold is the
   *  definition/availability/relevance authority); stored completion
   *  state alone never awards at runtime — legacy quest XP comes from
   *  the one-time initializers. Optional so pre-GAME.13 callers stay
   *  valid. */
  previousQuestCompletions?: Record<string, QuestCompletionRecord>;
  resultingQuestCompletions?: Record<string, QuestCompletionRecord>;
  questDefinitions?: readonly QuestDefinition[];
}): XpAwardRecord[] {
  const {
    result,
    resultingGameBadges,
    resultingGameMastery,
    previousGameEvents,
    resultingGameEvents,
    ownedAwards,
  } = args;
  if (!result.won) return [];
  if (!(result.gameId in GAME_REGISTRY)) return [];
  const registeredGames = args.registeredGames ?? getAllGameDefinitions();
  const eventDefinitions = args.eventDefinitions ?? getAllGameEvents();
  const previousQuestCompletions = args.previousQuestCompletions ?? {};
  const resultingQuestCompletions = args.resultingQuestCompletions ?? {};
  const questDefinitions = args.questDefinitions ?? getAllQuests();
  const earnedAt = result.completedAt; // one shared timestamp per result
  const awards: XpAwardRecord[] = [];
  const grant = (awardId: XpAwardId, xp: number, source: XpAwardSource) => {
    if (awardId in ownedAwards) return;
    awards.push({ awardId, xp, earnedAt, origin: 'result', source });
  };

  // 1 — first win (finite per GameId)
  grant(firstWinAwardId(result.gameId), XP_VALUES.firstWin, {
    kind: 'game-first-win',
    gameId: result.gameId,
  });

  // 2–4 — mastery tiers, tier-skip aware
  const resultingTier: MasteryTier | undefined =
    resultingGameMastery[result.gameId]?.tier;
  if (resultingTier !== undefined) {
    for (const tier of MASTERY_XP_TIERS) {
      if (MASTERY_TIER_RANK[resultingTier] >= MASTERY_TIER_RANK[tier]) {
        grant(masteryAwardId(tier, result.gameId), MASTERY_TIER_XP[tier], {
          kind: 'mastery-tier',
          gameId: result.gameId,
          tier,
        });
      }
    }
  }

  // 5 — platform completion (prospective universe; badge truth only)
  const everyGameCompleted = registeredGames.every(
    (game) => game.taleId !== undefined && resultingGameBadges.has(game.taleId),
  );
  if (everyGameCompleted) {
    grant(PLATFORM_ALL_GAMES_AWARD_ID, XP_VALUES.platformAllGames, {
      kind: 'platform-completion',
    });
  }

  // 6–7 — events: only a result that CREDITED the event qualifies
  for (const def of eventDefinitions) {
    const prev = previousGameEvents[def.eventId];
    const next = resultingGameEvents[def.eventId];
    if (next === undefined || next.eventVersion !== def.version) continue;
    const creditedByThisResult = next !== prev;
    if (!creditedByThisResult) continue;
    grant(
      eventParticipationAwardId(def.eventId, def.version),
      XP_VALUES.eventParticipation,
      { kind: 'event-participation', eventId: def.eventId, eventVersion: def.version },
    );
    if (next.completedAt !== undefined) {
      grant(
        eventCompletionAwardId(def.eventId, def.version),
        XP_VALUES.eventCompletion,
        { kind: 'event-completion', eventId: def.eventId, eventVersion: def.version },
      );
    }
  }

  // 8 — quest completions (GAME.13): appended AFTER every existing
  // family so the established outward order is preserved. A grant
  // requires the completion to be NEW in this result (transition),
  // version-current against a registered definition, and unowned; the
  // xp value is the completion's FROZEN xpReward, never re-read from
  // the definition.
  for (const def of questDefinitions) {
    const prev = previousQuestCompletions[def.questId];
    const next = resultingQuestCompletions[def.questId];
    if (next === undefined || next === prev) continue; // not new here
    if (next.questVersion !== def.version) continue;
    grant(questCompletionAwardId(def.questId, next.questVersion), next.xpReward, {
      kind: 'quest-completion',
      questId: def.questId,
      questVersion: next.questVersion,
    });
  }
  return awards;
}

/** Fold newly earned awards into the ledger. PURE and idempotent:
 *  existing awardIds are never overwritten (values/provenance frozen),
 *  and the SAME reference returns when nothing is new. */
export function applyXpAwards(
  progression: ArcadeProgression,
  newAwards: readonly XpAwardRecord[],
): ArcadeProgression {
  const fresh = newAwards.filter((a) => !(a.awardId in progression.awards));
  if (fresh.length === 0) return progression;
  const awards = { ...progression.awards };
  for (const a of fresh) awards[a.awardId] = a;
  return { progressionVersion: progression.progressionVersion, awards };
}

/** GAME.13 — the canonical XP award for one durable quest completion.
 *  The xp value is the completion's FROZEN xpReward (never the live
 *  registry), so a retired quest's XP remains reconstructable forever.
 *  Used by the quest initializer's merge path and by progression-store
 *  recovery below. */
export function questCompletionXpAward(
  completion: QuestCompletionRecord,
): XpAwardRecord {
  return {
    awardId: questCompletionAwardId(completion.questId, completion.questVersion),
    xp: completion.xpReward,
    earnedAt: completion.completedAt,
    origin: 'backfill',
    source: {
      kind: 'quest-completion',
      questId: completion.questId,
      questVersion: completion.questVersion,
    },
  };
}

// ── One-time backfill derivation (G12B §§25–31) ─────────────────────────
/**
 * Derive the awards an EXISTING player has already earned, from durable
 * truth only, at GAME.12 introduction. This is NOT hydration issuance
 * of an accomplishment artifact — it is the one-time initialization of
 * a newly introduced derived ledger over accomplishments that already
 * exist (and mastery upgrades are monotone/unrepeatable, so replay
 * reconciliation could never recover them). Runs ONLY when no
 * versioned store exists (the caller writes the marker even when zero
 * awards derive, so it never re-runs — including after RESET, whose
 * empty store keeps the marker AND whose cleared truths would derive
 * nothing anyway).
 *
 * first-win truth precedence: the Tale badge (the frozen completion
 * contract) OR a durable mastery record (which only a real win can
 * create — covers any pre-GAME.7 edge in reverse). PBs are NOT used:
 * a stored best alone does not prove a win under PB semantics (loss
 * summaries persist too).
 * earnedAt: the strongest historical timestamp available — the mastery
 * record's achievedAt for game/tier awards (the only per-game
 * timestamp durable truth exposes; never an invented earlier date),
 * the event record's own firstPlayedAt/completedAt for event awards,
 * else the single backfill instant.
 */
export function deriveBackfillAwards(args: {
  gameBadges: ReadonlySet<string>;
  gameMastery: Record<string, GameMasteryRecord>;
  gameEvents: Record<string, GameEventProgress>;
  /** The single initialization instant (used when no historical
   *  timestamp exists). Injected — never Date.now() in here. */
  backfillTimestamp: string;
  registeredGames?: readonly GameDefinition[];
  eventDefinitions?: readonly GameEventDefinition[];
  /** GAME.13 §24 — CROSS-STORE RECOVERY: when THIS progression store
   *  is being initialized/recovered, canonical quest-completion XP is
   *  re-derived from valid durable quest completion records (their
   *  frozen xpReward — the live quest registry is deliberately NOT
   *  consulted, so retired quests stay recoverable). This path runs
   *  ONLY inside progression-ledger initialization; a valid versioned
   *  store never synthesizes quest XP from completion state. */
  questCompletions?: Record<string, QuestCompletionRecord>;
}): XpAwardRecord[] {
  const { gameBadges, gameMastery, gameEvents, backfillTimestamp } = args;
  const questCompletions = args.questCompletions ?? {};
  const registeredGames = args.registeredGames ?? getAllGameDefinitions();
  const eventDefinitions = args.eventDefinitions ?? getAllGameEvents();
  const awards: XpAwardRecord[] = [];
  const add = (awardId: XpAwardId, xp: number, earnedAt: string, source: XpAwardSource) => {
    awards.push({ awardId, xp, earnedAt, origin: 'backfill', source });
  };

  let allComplete = registeredGames.length > 0;
  let latestMasteryAt: string | null = null;
  for (const game of registeredGames) {
    const mastery = gameMastery[game.gameId];
    const badgeHeld = game.taleId !== undefined && gameBadges.has(game.taleId);
    const wonBefore = badgeHeld || mastery !== undefined;
    if (!badgeHeld) allComplete = false;
    if (mastery && (latestMasteryAt === null || mastery.achievedAt > latestMasteryAt)) {
      latestMasteryAt = mastery.achievedAt;
    }
    if (wonBefore) {
      add(
        firstWinAwardId(game.gameId),
        XP_VALUES.firstWin,
        mastery?.achievedAt ?? backfillTimestamp,
        { kind: 'game-first-win', gameId: game.gameId },
      );
    }
    if (mastery) {
      for (const tier of MASTERY_XP_TIERS) {
        if (MASTERY_TIER_RANK[mastery.tier] >= MASTERY_TIER_RANK[tier]) {
          add(
            masteryAwardId(tier, game.gameId),
            MASTERY_TIER_XP[tier],
            mastery.achievedAt,
            { kind: 'mastery-tier', gameId: game.gameId, tier },
          );
        }
      }
    }
  }
  if (allComplete) {
    add(
      PLATFORM_ALL_GAMES_AWARD_ID,
      XP_VALUES.platformAllGames,
      latestMasteryAt ?? backfillTimestamp,
      { kind: 'platform-completion' },
    );
  }
  for (const def of eventDefinitions) {
    const progress = gameEvents[def.eventId];
    if (!progress || progress.eventVersion !== def.version) continue;
    if (progress.firstPlayedAt !== undefined && progress.completedGameIds.length > 0) {
      add(
        eventParticipationAwardId(def.eventId, def.version),
        XP_VALUES.eventParticipation,
        progress.firstPlayedAt,
        { kind: 'event-participation', eventId: def.eventId, eventVersion: def.version },
      );
    }
    if (progress.completedAt !== undefined) {
      add(
        eventCompletionAwardId(def.eventId, def.version),
        XP_VALUES.eventCompletion,
        progress.completedAt,
        { kind: 'event-completion', eventId: def.eventId, eventVersion: def.version },
      );
    }
  }
  // GAME.13 — quest XP reconstruction from durable completions (frozen
  // xpReward; registry-independent). See the questCompletions doc above.
  for (const completion of Object.values(questCompletions)) {
    awards.push(questCompletionXpAward(completion));
  }
  return awards;
}

// ── Hydration sanitization (pure core; AppContext owns the boundary) ────
/** Validate one stored source STRUCTURALLY. Historical durability
 *  rules (G12B §9): ids are plain recorded strings — NEVER live
 *  registry/event foreign keys — and an UNKNOWN source kind keeps the
 *  award (a rollback must not erase legitimately earned XP), provided
 *  the record's safe core validates. */
function isValidStoredXpSource(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const s = raw as Record<string, unknown>;
  if (typeof s.kind !== 'string' || s.kind.length === 0) return false;
  if (s.kind === 'game-first-win') {
    return typeof s.gameId === 'string' && s.gameId.length > 0;
  }
  if (s.kind === 'mastery-tier') {
    return (
      typeof s.gameId === 'string' && s.gameId.length > 0 &&
      (s.tier === 'silver' || s.tier === 'gold' || s.tier === 'engineer')
    );
  }
  if (s.kind === 'platform-completion') return true;
  if (s.kind === 'event-participation' || s.kind === 'event-completion') {
    return (
      typeof s.eventId === 'string' && s.eventId.length > 0 &&
      typeof s.eventVersion === 'number' &&
      Number.isInteger(s.eventVersion) && s.eventVersion >= 1
    );
  }
  // GAME.13 — quest provenance: structural only (plain-string questId,
  // never a live-registry foreign key).
  if (s.kind === 'quest-completion') {
    return (
      typeof s.questId === 'string' && s.questId.length > 0 &&
      typeof s.questVersion === 'number' &&
      Number.isInteger(s.questVersion) && s.questVersion >= 1
    );
  }
  return true; // unknown future/historical kind — preserve the XP
}

function isValidStoredXpAward(id: string, raw: unknown): raw is XpAwardRecord {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    r.awardId === id && typeof id === 'string' && id.length > 0 &&
    typeof r.xp === 'number' && Number.isSafeInteger(r.xp) &&
    r.xp > 0 && r.xp <= XP_RECORD_MAX &&
    typeof r.earnedAt === 'string' && r.earnedAt.length > 0 &&
    (r.origin === 'result' || r.origin === 'backfill') &&
    isValidStoredXpSource(r.source)
  );
}

/** Sanitize a parsed store. Returns null when no valid versioned store
 *  exists (missing / not an object / bad version) — the caller then
 *  runs the ONE-TIME backfill and writes the marker. A valid store is
 *  returned with malformed children dropped individually; a stored
 *  FUTURE progressionVersion is preserved as-is (never downgraded). */
export function sanitizeStoredProgression(raw: unknown): ArcadeProgression | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.progressionVersion !== 'number' ||
    !Number.isInteger(r.progressionVersion) ||
    r.progressionVersion < 1
  ) return null;
  const awards: Record<XpAwardId, XpAwardRecord> = {};
  if (typeof r.awards === 'object' && r.awards !== null) {
    for (const [id, value] of Object.entries(r.awards as Record<string, unknown>)) {
      if (isValidStoredXpAward(id, value)) awards[id] = value;
    }
  }
  return { progressionVersion: r.progressionVersion, awards };
}
