// ================== TRACKSIDE ARCADE — COLLECTIBLES ==================
// PUBLIC-v7.4B.GAME.9A — the collectible foundation: stable identity,
// definitions, rarity taxonomy, ownership records, and pure grant
// evaluation. Pure model only; persistence lives in AppContext and no
// player-facing UI exists yet (G9B).
//
// ── What a collectible IS here ─────────────────────────────────────────
// A local-profile-bound, non-tradable, non-transferable, duplicate-safe
// archive artifact earned from real play. Ownership is binary (owned /
// not owned — no quantities, no stacking) and durable until RESET_DEMO.
//
// ── What a collectible is NOT (hard boundaries) ────────────────────────
// No physical item is promised and no redemption exists. There are no
// claim codes, no venue association, no editions/numbering, no cash
// value, and explicitly NO blockchain/NFT/token/wallet/mint/marketplace
// concepts — collectibles never transfer between profiles and are never
// tradable. Nothing here is pay-to-win: artifacts are presentation-
// oriented progression records only.
//
// ── The four separations (unchanged invariants) ────────────────────────
//   COMPLETION  = state.gameBadges (Tale ids)
//   PB          = state.gameResultsBest (GameIds, version-sensitive)
//   MASTERY     = state.gameMastery (GameIds, durable/grandfathered)
//   COLLECTIBLE = state.collectibles (CollectibleIds — THIS gate)
// Collectibles never grant completion, badges, unlocks, score, or
// mastery, and never alter Arcade/Passport state labels.

import type { GameDefinition, GameId, GameResult } from './registry';
import { GAME_REGISTRY, getAllGameDefinitions } from './registry';
import type { GameMasteryRecord, MasteryTier } from './mastery';
import { MASTERY_TIER_RANK } from './mastery';

// ── Stable collectible identity ─────────────────────────────────────────
// CollectibleId is durable and migration-sensitive (like GameId):
// ownership records key off it forever. Never derive identity from
// display labels; never reuse GameIds/TaleIds/badge keys/mastery tiers.
export type CollectibleId =
  | 'first-ticket'
  | 'engineers-mark-wa'
  | 'engineers-mark-packer'
  | 'engineers-mark-station'
  // PUBLIC-v7.4B.GAME.9E — the three cross-game scarce artifacts.
  | 'full-line'
  | 'master-of-the-line'
  | 'yardmasters-seal';

// ── Rarity taxonomy ─────────────────────────────────────────────────────
// Restrained, archive-toned. 'legendary' is typed for the future but no
// legendary collectible is issued in G9A.
export type CollectibleRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

// ── How a collectible is EARNED (definition-side source) ────────────────
// The mapping between play and artifact lives HERE, centrally — the
// grant evaluator below is generic and reads it; nothing scatters
// per-game conditionals through app state code.
export type CollectibleSource =
  | { kind: 'first-game-completion' }
  | { kind: 'mastery'; gameId: GameId; tier: 'engineer' }
  // GAME.9E — platform-wide sources. All three evaluate against the
  // CURRENT registered game universe (registry-derived, never a
  // hard-coded count): a future newly registered game prospectively
  // raises the requirement for players who have not yet earned the
  // artifact, while already-earned ownership stays durable forever.
  // Deterministic achievement rules only — no randomness, no drops.
  | { kind: 'all-game-completion' }
  | { kind: 'all-game-mastery'; minimumTier: 'gold' }
  | { kind: 'all-game-engineer' };

// ── Definition (data-oriented; no UI concerns) ──────────────────────────
export interface CollectibleDefinition {
  collectibleId: CollectibleId;
  name: string;
  shortDescription: string;
  rarity: CollectibleRarity;
  source: CollectibleSource;
}

// ── The initial four ────────────────────────────────────────────────────
// Copy is location-agnostic and promises nothing physical.
export const COLLECTIBLE_REGISTRY: Record<CollectibleId, CollectibleDefinition> = {
  'first-ticket': {
    collectibleId: 'first-ticket',
    name: 'FIRST TICKET',
    shortDescription:
      'Punched for completing your first Trackside challenge.',
    rarity: 'common',
    source: { kind: 'first-game-completion' },
  },
  'engineers-mark-wa': {
    collectibleId: 'engineers-mark-wa',
    name: "ALLEN ENGINEER'S MARK",
    shortDescription:
      "Earned by reaching ENGINEER'S MARK mastery in LAY OUT ALLEN'S TOWN.",
    rarity: 'rare',
    source: { kind: 'mastery', gameId: 'allen-town-grid', tier: 'engineer' },
  },
  'engineers-mark-packer': {
    collectibleId: 'engineers-mark-packer',
    name: "PACKER ENGINEER'S MARK",
    shortDescription:
      "Earned by reaching ENGINEER'S MARK mastery in BUILD THE LEHIGH VALLEY LINE.",
    rarity: 'rare',
    source: { kind: 'mastery', gameId: 'packer-rail-line', tier: 'engineer' },
  },
  'engineers-mark-station': {
    collectibleId: 'engineers-mark-station',
    name: "STATION ENGINEER'S MARK",
    shortDescription:
      "Earned by reaching ENGINEER'S MARK mastery in STRIKE THE MATCH.",
    rarity: 'rare',
    source: { kind: 'mastery', gameId: 'station-preservation', tier: 'engineer' },
  },
  // ── GAME.9E — the cross-game scarce artifacts ──────────────────────
  'full-line': {
    collectibleId: 'full-line',
    name: 'FULL LINE',
    shortDescription:
      'Every Trackside challenge completed at least once.',
    rarity: 'uncommon',
    source: { kind: 'all-game-completion' },
  },
  'master-of-the-line': {
    collectibleId: 'master-of-the-line',
    name: 'MASTER OF THE LINE',
    shortDescription:
      'GOLD mastery or better held in every Trackside challenge.',
    rarity: 'rare',
    source: { kind: 'all-game-mastery', minimumTier: 'gold' },
  },
  // The first currently-issued LEGENDARY artifact — scarce because of
  // the accomplishment (Engineer's Mark everywhere), never artificial
  // scarcity.
  'yardmasters-seal': {
    collectibleId: 'yardmasters-seal',
    name: "YARDMASTER'S SEAL",
    shortDescription:
      "ENGINEER'S MARK held in every Trackside challenge.",
    rarity: 'legendary',
    source: { kind: 'all-game-engineer' },
  },
};

/** Stable evaluation/listing order (declaration order). */
// GAME.9E §13 — this is also the STABLE GRANT ORDER for a multi-grant
// result event: ticket, then the per-game Engineer mark, then the
// cross-game artifacts in ascending scarcity.
const COLLECTIBLE_ORDER: readonly CollectibleId[] = [
  'first-ticket',
  'engineers-mark-wa',
  'engineers-mark-packer',
  'engineers-mark-station',
  'full-line',
  'master-of-the-line',
  'yardmasters-seal',
];

// ── Ownership record (persisted to tb_collectibles) ─────────────────────
// Compact, truthful provenance only. Deliberately NOT stored: score,
// duration, the full GameResult, user identity, or anything
// redemption-shaped. Ownership records are DURABLE: a future copy or
// rarity change to a definition never invalidates earned ownership,
// and unknown future CollectibleIds are simply ignored by this client.
export type CollectibleAcquisitionSource =
  | {
      kind: 'game-completion';
      gameId: GameId;
      /** Narrative association at acquisition time; optional so future
       *  standalone (non-Tale) games stay representable. */
      taleId?: string;
    }
  | { kind: 'mastery'; gameId: GameId; tier: 'engineer' }
  // GAME.9E — platform-wide provenance. Deliberately compact: the
  // registry defines the game universe, so no per-game list, scores,
  // or histories are stored here.
  | { kind: 'platform-completion' }
  | { kind: 'platform-mastery'; minimumTier: 'gold' }
  | { kind: 'platform-engineer' };

export interface CollectibleOwnershipRecord {
  collectibleId: CollectibleId;
  /** ISO timestamp of the granting result event. One shared timestamp
   *  per result-processing event when a single run grants multiple
   *  artifacts; never rewritten by later duplicate grants. */
  acquiredAt: string;
  source: CollectibleAcquisitionSource;
}

// ── Presentation helpers (PUBLIC-v7.4B.GAME.9B) ─────────────────────────
// Pure lookups shared by every surface that presents artifacts (Arcade,
// Passport, future gallery) so no page hard-codes ids or duplicates the
// game↔collectible mapping. Presentation reads OWNERSHIP TRUTH from
// state.collectibles only — mastery/badges/PBs may gate WHERE an
// artifact renders, never WHETHER it is owned.

/** The one global (non-game-specific) artifact's id, exported so
 *  surfaces reference the canonical constant instead of retyping it. */
export const FIRST_TICKET_ID: CollectibleId = 'first-ticket';

/** Subtle textual rarity labels (§8 — no colored rarity system). */
export const COLLECTIBLE_RARITY_LABELS: Record<CollectibleRarity, string> = {
  common: 'COMMON',
  uncommon: 'UNCOMMON',
  rare: 'RARE',
  legendary: 'LEGENDARY',
};

export function getCollectibleDefinition(id: CollectibleId): CollectibleDefinition {
  return COLLECTIBLE_REGISTRY[id];
}

/** The Engineer artifact mapped to one game (from the definitions'
 *  source model — the single mapping authority), or undefined for a
 *  game with no mastery artifact. */
export function getEngineerCollectibleForGame(
  gameId: GameId,
): CollectibleDefinition | undefined {
  return COLLECTIBLE_ORDER
    .map((id) => COLLECTIBLE_REGISTRY[id])
    .find((def) => def.source.kind === 'mastery' && def.source.gameId === gameId);
}

/** GAME.9E — the GLOBAL (non-game-specific) artifacts, in stable
 *  order: everything except the per-game mastery marks. Surfaces
 *  render owned globals on their platform-wide artifact strips —
 *  never on an arbitrary game card. Data-driven from the source
 *  model; no id list is hard-coded in pages. */
export function getGlobalCollectibles(): CollectibleDefinition[] {
  return COLLECTIBLE_ORDER
    .map((id) => COLLECTIBLE_REGISTRY[id])
    .filter((def) => def.source.kind !== 'mastery');
}

// ── Pure grant evaluation ───────────────────────────────────────────────
/**
 * Which collectibles does this terminal result newly earn?
 * Pure, deterministic, duplicate-safe, stable order (COLLECTIBLE_ORDER:
 * ticket → per-game Engineer mark → full-line → master → yardmaster).
 * No storage access, no timestamps — the caller stamps acquiredAt when
 * it actually grants.
 *
 * Rules (G9A §15–§17 + G9E §10–§12):
 *   loss                → nothing (ever). ALL grants — including the
 *                         cross-game artifacts — evaluate on WON
 *                         results only, keeping every acquisition tied
 *                         to a successful gameplay event (G9E §10
 *                         preferred posture).
 *   won                 → FIRST TICKET, unless already owned (first
 *                         completion OBSERVED under G9; never
 *                         retro-granted from hydration).
 *   engineer artifact   → current-scoring-version win for the mapped
 *                         game AND resulting mastery truth 'engineer'.
 *   FULL LINE           → every currently registered game's Tale holds
 *                         completion truth (resultingGameBadges — the
 *                         frozen tale-id badge store, never PB/mastery/
 *                         collectible inference). A registered game
 *                         with no taleId cannot be completion-tracked
 *                         and fails closed (not satisfied).
 *   MASTER OF THE LINE  → every registered game's durable mastery is
 *                         at or above the source's minimumTier (gold).
 *                         The display-only Bronze fallback is NOT
 *                         progression truth — only persisted records
 *                         count.
 *   YARDMASTER'S SEAL   → every registered game's durable mastery is
 *                         exactly 'engineer'. Never inferred from
 *                         Engineer-collectible ownership.
 *
 * The cross-game rules read POST-RESULT truth: callers pass badge and
 * mastery state that already reflect this result (the badge dispatch
 * precedes the result dispatch in the production win path, and the
 * caller supplies the post-upgrade mastery map), so the current run
 * may supply the final missing requirement. The registered-game
 * universe comes from the production registry by default and is
 * injectable for tests — a future newly registered game prospectively
 * raises requirements for unearned artifacts while owned artifacts
 * stay durable (they are skipped as owned, never re-evaluated).
 *
 * One result event may validly grant several ids (e.g. the final
 * Engineer run of the third game: its mark + FULL LINE + MASTER +
 * YARDMASTER, plus FIRST TICKET if somehow absent).
 */
export function evaluateCollectibleGrants(args: {
  result: GameResult;
  /** The CURRENT mastery truth for result.gameId AFTER this result's
   *  mastery evaluation (upgraded tier if it upgraded, else the
   *  existing record's tier, else null). */
  resultingMasteryTier: MasteryTier | null;
  /** POST-RESULT completion truth: the tale-id badge set including any
   *  badge this result's win just awarded. */
  resultingGameBadges: ReadonlySet<string>;
  /** POST-RESULT durable mastery map: state.gameMastery with this
   *  result's upgrade (if any) already applied. */
  resultingGameMastery: Record<string, GameMasteryRecord>;
  ownedCollectibles: Record<string, CollectibleOwnershipRecord>;
  /** The current registered game universe. Defaults to the production
   *  registry; injectable so tests can prove prospective expansion
   *  (G9E §21) without mutating source. */
  registeredGames?: readonly GameDefinition[];
}): CollectibleId[] {
  const {
    result,
    resultingMasteryTier,
    resultingGameBadges,
    resultingGameMastery,
    ownedCollectibles,
  } = args;
  if (!result.won) return [];
  const registeredGames = args.registeredGames ?? getAllGameDefinitions();

  const currentScoringVersion =
    result.gameId in GAME_REGISTRY
      ? GAME_REGISTRY[result.gameId].scoring.scoringVersion
      : null;

  const everyGameCompleted = registeredGames.every(
    (game) => game.taleId !== undefined && resultingGameBadges.has(game.taleId),
  );
  const everyGameAtLeast = (minimum: MasteryTier) =>
    registeredGames.every((game) => {
      const tier = resultingGameMastery[game.gameId]?.tier;
      return tier !== undefined &&
        MASTERY_TIER_RANK[tier] >= MASTERY_TIER_RANK[minimum];
    });

  const grants: CollectibleId[] = [];
  for (const id of COLLECTIBLE_ORDER) {
    if (id in ownedCollectibles) continue; // duplicate-safe / durable
    const def = COLLECTIBLE_REGISTRY[id];
    switch (def.source.kind) {
      case 'first-game-completion':
        grants.push(id);
        break;
      case 'mastery':
        if (
          def.source.gameId === result.gameId &&
          currentScoringVersion !== null &&
          result.scoringVersion === currentScoringVersion &&
          resultingMasteryTier === def.source.tier
        ) {
          grants.push(id);
        }
        break;
      case 'all-game-completion':
        if (everyGameCompleted) grants.push(id);
        break;
      case 'all-game-mastery':
        if (everyGameAtLeast(def.source.minimumTier)) grants.push(id);
        break;
      case 'all-game-engineer':
        if (everyGameAtLeast('engineer')) grants.push(id);
        break;
    }
  }
  return grants;
}

/** Build the ownership record for one newly granted collectible.
 *  `acquiredAt` is supplied by the granting boundary (one shared
 *  timestamp per result event). */
export function createOwnershipRecord(
  collectibleId: CollectibleId,
  result: GameResult,
  acquiredAt: string,
): CollectibleOwnershipRecord {
  const def = COLLECTIBLE_REGISTRY[collectibleId];
  let source: CollectibleAcquisitionSource;
  switch (def.source.kind) {
    case 'mastery':
      source = { kind: 'mastery', gameId: def.source.gameId, tier: 'engineer' };
      break;
    // GAME.9E — platform provenance: compact, no per-game lists.
    case 'all-game-completion':
      source = { kind: 'platform-completion' };
      break;
    case 'all-game-mastery':
      source = { kind: 'platform-mastery', minimumTier: def.source.minimumTier };
      break;
    case 'all-game-engineer':
      source = { kind: 'platform-engineer' };
      break;
    default:
      source = {
        kind: 'game-completion',
        gameId: result.gameId,
        ...(result.taleId !== undefined ? { taleId: result.taleId } : {}),
      };
  }
  return { collectibleId, acquiredAt, source };
}
