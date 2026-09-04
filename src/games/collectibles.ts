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

import type { GameId, GameResult } from './registry';
import { GAME_REGISTRY } from './registry';
import type { MasteryTier } from './mastery';

// ── Stable collectible identity ─────────────────────────────────────────
// CollectibleId is durable and migration-sensitive (like GameId):
// ownership records key off it forever. Never derive identity from
// display labels; never reuse GameIds/TaleIds/badge keys/mastery tiers.
export type CollectibleId =
  | 'first-ticket'
  | 'engineers-mark-wa'
  | 'engineers-mark-packer'
  | 'engineers-mark-station';

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
  | { kind: 'mastery'; gameId: GameId; tier: 'engineer' };

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
};

/** Stable evaluation/listing order (declaration order). */
const COLLECTIBLE_ORDER: readonly CollectibleId[] = [
  'first-ticket',
  'engineers-mark-wa',
  'engineers-mark-packer',
  'engineers-mark-station',
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
  | { kind: 'mastery'; gameId: GameId; tier: 'engineer' };

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

// ── Pure grant evaluation ───────────────────────────────────────────────
/**
 * Which collectibles does this terminal result newly earn?
 * Pure, deterministic, duplicate-safe, stable order (FIRST TICKET
 * before Engineer artifacts). No storage access, no timestamps — the
 * caller stamps acquiredAt when it actually grants.
 *
 * Rules (G9A §15–§17):
 *   loss                → nothing (ever).
 *   won                 → FIRST TICKET, unless already owned. This is
 *                         the first completion OBSERVED UNDER G9;
 *                         legacy badge-holders are deliberately NOT
 *                         retro-granted from hydration (no truthful
 *                         acquisition provenance exists for that) —
 *                         they earn it on their next successful replay.
 *   engineer artifact   → granted when the RESULT is a current-
 *                         scoring-version win for the mapped game AND
 *                         the resulting mastery truth for that game is
 *                         'engineer' (either this run upgraded to it,
 *                         or the player already held it and confirmed
 *                         with a valid replay win). A stale
 *                         scoring-version result never grants it, and
 *                         hydration alone never grants anything —
 *                         every grant originates from a real result.
 *
 * A first-ever run that is Engineer-grade validly returns TWO ids.
 */
export function evaluateCollectibleGrants(args: {
  result: GameResult;
  /** The CURRENT mastery truth for result.gameId AFTER this result's
   *  mastery evaluation (upgraded tier if it upgraded, else the
   *  existing record's tier, else null). */
  resultingMasteryTier: MasteryTier | null;
  ownedCollectibles: Record<string, CollectibleOwnershipRecord>;
}): CollectibleId[] {
  const { result, resultingMasteryTier, ownedCollectibles } = args;
  if (!result.won) return [];

  const grants: CollectibleId[] = [];
  const currentScoringVersion =
    result.gameId in GAME_REGISTRY
      ? GAME_REGISTRY[result.gameId].scoring.scoringVersion
      : null;

  for (const id of COLLECTIBLE_ORDER) {
    if (id in ownedCollectibles) continue; // duplicate-safe
    const def = COLLECTIBLE_REGISTRY[id];
    if (def.source.kind === 'first-game-completion') {
      grants.push(id);
    } else if (
      def.source.kind === 'mastery' &&
      def.source.gameId === result.gameId &&
      currentScoringVersion !== null &&
      result.scoringVersion === currentScoringVersion &&
      resultingMasteryTier === def.source.tier
    ) {
      grants.push(id);
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
  const source: CollectibleAcquisitionSource =
    def.source.kind === 'mastery'
      ? { kind: 'mastery', gameId: def.source.gameId, tier: 'engineer' }
      : {
          kind: 'game-completion',
          gameId: result.gameId,
          ...(result.taleId !== undefined ? { taleId: result.taleId } : {}),
        };
  return { collectibleId, acquiredAt, source };
}
