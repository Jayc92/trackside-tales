// ================== PASSPORT — pure meta-progression view model ==================
// PUBLIC-v7.4B.PASS.1B — the Passport is a VIEW over durable player truth.
// This module derives every presentation-ready record the Passport surface
// will later render from the already-sanitized AppState (plus the canonical
// Tale list, which lives in the provider rather than in AppState). It reads,
// it never writes: no storage, no reducer, no XP, no unlock, no navigation,
// no DOM, no React, no ambient clock. The ONLY time input is the explicit
// `now`, and the ONLY time-sensitive output is event status (UPCOMING /
// ACTIVE / ENDED) and the reward availability that follows from it.
//
// Everything else is copied from, or computed by, the existing pure
// helpers so no algorithm is duplicated here:
//   rank / XP            → progression.ts   (getTotalXp, getRankProgress)
//   mastery display      → mastery.ts       (resolveDisplayMasteryTier, labels)
//   artifacts            → collectibles.ts  (registry, rarity labels, mappings)
//   events               → events.ts        (getEventPresentationModels, isEventComplete)
//   Weekly Dispatch      → orders.ts        (WEEKLY_DISPATCH_ORDER_ID — lifetime count only)
//   game universe        → registry.ts      (getAllGameDefinitions; Tale↔game by taleId)
//
// Deliberately NOT modelled (PASS.1A decisions): the active Weekly Dispatch
// objective, active quest detail, personal-best scores, any completion
// percentage, the placeholder passport code, the founders-tier / 12-stamp
// rewards program, and account promises. Final player copy belongs to the
// presentation gates; this model exposes semantic fields.
//
// No runtime file imports this module in PASS.1B (isolation, as GAME.22E.B).

import type { AppState, Tale } from '../app/types';
import {
  getAllGameDefinitions,
  type GameDefinition,
  type GameId,
} from './registry';
import {
  MASTERY_TIER_LABELS,
  resolveDisplayMasteryTier,
  type MasteryTier,
} from './mastery';
import {
  COLLECTIBLE_REGISTRY,
  COLLECTIBLE_RARITY_LABELS,
  getEngineerCollectibleForGame,
  getEventCompletionCollectible,
  type CollectibleDefinition,
  type CollectibleId,
  type CollectibleRarity,
  type CollectibleSource,
} from './collectibles';
import {
  getAllGameEvents,
  getEventPresentationModels,
  isEventComplete,
  type GameEventDefinition,
  type GameEventStatus,
} from './events';
import { getRankProgress, getTotalXp } from './progression';
import { WEEKLY_DISPATCH_ORDER_ID } from './orders';

// ── Input ─────────────────────────────────────────────────────────────────
/** The Tale fields the Passport record renders (identity + labels only). */
export type PassportTaleSource = Pick<Tale, 'id' | 'name' | 'title' | 'chapter' | 'year'>;

/** The AppState slice the model reads. `tales` is added because the
 *  canonical (possibly remote) Tale list is provider state, not AppState. */
export type PassportStateSource = Pick<
  AppState,
  | 'user'
  | 'unlocked'
  | 'scanBadges'
  | 'gameBadges'
  | 'gameMastery'
  | 'collectibles'
  | 'gameEvents'
  | 'progression'
  | 'quests'
  | 'orders'
  | 'ordersSuspended'
>;

export interface PassportModelInput extends PassportStateSource {
  tales: readonly PassportTaleSource[];
}

/** Registry seams (test-only injection; production defaults). Every total
 *  in the model is derived from these universes, never hard-coded. */
export interface PassportRegistries {
  games?: readonly GameDefinition[];
  collectibles?: readonly CollectibleDefinition[];
  events?: readonly GameEventDefinition[];
}

// ── Output ────────────────────────────────────────────────────────────────
export interface PassportIdentityModel {
  /** Trimmed saved name, or null for a guest (no generated identifier). */
  displayName: string | null;
  /** First code point of displayName, upper-cased; null for a guest. */
  monogram: string | null;
  isGuest: boolean;
}

export interface PassportServiceRecordModel {
  rankName: string;
  rankThreshold: number;
  totalXp: number;
  /** null at the top rank — never a fake next. */
  nextRankName: string | null;
  nextRankThreshold: number | null;
  /** 0 at the top rank. */
  remainingXp: number;
  /** 0–100 within the current band; 100 at the top rank. */
  progressPercent: number;
  isMaxRank: boolean;
}

export interface PassportTaleRecordModel {
  taleId: string;
  name: string;
  title: string;
  chapter: string;
  year: string;
  unlocked: boolean;
  scanComplete: boolean;
  challengeComplete: boolean;
  /** SCAN + CHALLENGE, exactly the shipped grammar. Never inferred from mastery. */
  complete: boolean;
  /** Registered games narratively tied to this Tale (may be empty). */
  gameIds: readonly GameId[];
  /** Durable persisted tier of the Tale's game, if a record exists (truth). */
  masteryTier: MasteryTier | null;
  /** The shipped Passport endorsement rule: persisted tier — or the Bronze
   *  display floor — only on a COMPLETE record; null otherwise. View only. */
  displayMasteryTier: MasteryTier | null;
}

export interface PassportMasteryRowModel {
  gameId: GameId;
  title: string;
  taleId: string | null;
  /** The game's challenge stamp is held (gameBadges by Tale id). */
  challengeComplete: boolean;
  /** Durable persisted tier (truth) — representable even when the Tale
   *  record is not COMPLETE (e.g. scan missing). */
  persistedTier: MasteryTier | null;
  /** resolveDisplayMasteryTier(persisted, challengeComplete): persisted tier,
   *  Bronze floor for a legacy completed challenge without a record, null
   *  when the challenge was never completed (seeded tiers never present). */
  displayTier: MasteryTier | null;
  displayTierLabel: string | null;
  /** The mapped Engineer's Mark artifact and its OWNERSHIP truth (not mastery). */
  engineersMark: { collectibleId: CollectibleId; owned: boolean } | null;
}

/** Grouping derived from each definition's SOURCE kind (never from names). */
export type PassportArtifactGroup = 'ticket' | 'engineers-mark' | 'line' | 'event';

/** For the cross-game 'line' chain: the requirement strength, derived from
 *  the source (completion < gold mastery < engineer mastery). */
export type PassportLineRequirement = 'completion' | 'gold' | 'engineer';

export interface PassportArtifactModel {
  collectibleId: CollectibleId;
  name: string;
  shortDescription: string;
  rarity: CollectibleRarity;
  rarityLabel: string;
  owned: boolean;
  acquiredAt: string | null;
  /** The registry's earning condition, verbatim (requirement metadata). */
  requirement: CollectibleSource;
  group: PassportArtifactGroup;
  lineRequirement: PassportLineRequirement | null;
  /** Routing identifiers only (no navigation contract in PASS.1B). */
  gameId: GameId | null;
  eventId: string | null;
}

/** Player-facing availability of an event's completion artifact:
 *  pending (event UPCOMING) · earnable (ACTIVE, event incomplete) ·
 *  claimable (ACTIVE, event complete, next valid replay collects) ·
 *  owned · closed (ENDED and never earned — nothing can still be earned). */
export type PassportRewardAvailability =
  | 'pending'
  | 'earnable'
  | 'claimable'
  | 'owned'
  | 'closed';

export interface PassportSpecialRunModel {
  eventId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  /** The shared event vocabulary: 'expired' is the ENDED state. */
  status: GameEventStatus;
  requiredCount: number;
  completedCount: number;
  /** Version-current progress credits every required game. */
  complete: boolean;
  completedAt: string | null;
  /** Event completion and artifact ownership are distinct truths. */
  reward: {
    collectibleId: CollectibleId;
    name: string;
    owned: boolean;
    availability: PassportRewardAvailability;
  } | null;
}

export interface PassportServiceLogModel {
  /** Durable quest completions (lifetime). */
  questsCompleted: number;
  /** Durable WEEKLY DISPATCH completions (lifetime), or null while order
   *  authority is suspended (future ordersVersion): the safe in-memory
   *  empty store is NOT evidence of zero historical dispatches. */
  weeklyDispatchesCleared: number | null;
  eventsCompleted: number;
  artifactsOwned: number;
}

/** Current collection inventory (registry denominators may grow). No
 *  global completion percentage exists — by design. */
export interface PassportSummaryModel {
  talesTotal: number;
  talesUnlocked: number;
  talesComplete: number;
  scansComplete: number;
  challengesComplete: number;
  artifactsOwned: number;
  artifactsTotal: number;
  engineerMasteryCount: number;
  gameCount: number;
}

export interface PassportModel {
  identity: PassportIdentityModel;
  serviceRecord: PassportServiceRecordModel;
  taleRecords: readonly PassportTaleRecordModel[];
  challengeMastery: readonly PassportMasteryRowModel[];
  artifacts: readonly PassportArtifactModel[];
  specialRuns: readonly PassportSpecialRunModel[];
  serviceLog: PassportServiceLogModel;
  summary: PassportSummaryModel;
}

// ── Derivations ───────────────────────────────────────────────────────────
function buildIdentity(user: AppState['user']): PassportIdentityModel {
  const name = user?.name?.trim() ?? '';
  if (name.length === 0) return { displayName: null, monogram: null, isGuest: true };
  const [first] = Array.from(name); // code-point safe first glyph
  return { displayName: name, monogram: first.toUpperCase(), isGuest: false };
}

function buildServiceRecord(progression: AppState['progression']): PassportServiceRecordModel {
  const rp = getRankProgress(getTotalXp(progression));
  return {
    rankName: rp.rank.name,
    rankThreshold: rp.rank.threshold,
    totalXp: rp.totalXp,
    nextRankName: rp.next?.name ?? null,
    nextRankThreshold: rp.next?.threshold ?? null,
    remainingXp: rp.remaining,
    progressPercent: rp.percent,
    isMaxRank: rp.next === null,
  };
}

function buildTaleRecord(
  tale: PassportTaleSource,
  source: PassportStateSource,
  games: readonly GameDefinition[],
): PassportTaleRecordModel {
  const scanComplete = source.scanBadges.has(tale.id);
  const challengeComplete = source.gameBadges.has(tale.id);
  const complete = scanComplete && challengeComplete;
  const taleGames = games.filter((g) => g.taleId === tale.id);
  const primary = taleGames[0];
  const persisted = primary ? source.gameMastery[primary.gameId]?.tier : undefined;
  return {
    taleId: tale.id,
    name: tale.name,
    title: tale.title,
    chapter: tale.chapter,
    year: tale.year,
    unlocked: source.unlocked.has(tale.id),
    scanComplete,
    challengeComplete,
    complete,
    gameIds: taleGames.map((g) => g.gameId),
    masteryTier: persisted ?? null,
    displayMasteryTier: primary ? resolveDisplayMasteryTier(persisted, complete) : null,
  };
}

function buildMasteryRow(
  game: GameDefinition,
  source: PassportStateSource,
): PassportMasteryRowModel {
  const taleId = game.taleId ?? null;
  const challengeComplete = taleId !== null && source.gameBadges.has(taleId);
  const persisted = source.gameMastery[game.gameId]?.tier;
  const displayTier = resolveDisplayMasteryTier(persisted, challengeComplete);
  const mark = getEngineerCollectibleForGame(game.gameId);
  return {
    gameId: game.gameId,
    title: game.title,
    taleId,
    challengeComplete,
    persistedTier: persisted ?? null,
    displayTier,
    displayTierLabel: displayTier ? MASTERY_TIER_LABELS[displayTier] : null,
    engineersMark: mark
      ? { collectibleId: mark.collectibleId, owned: mark.collectibleId in source.collectibles }
      : null,
  };
}

function classifyArtifact(source: CollectibleSource): {
  group: PassportArtifactGroup;
  lineRequirement: PassportLineRequirement | null;
  gameId: GameId | null;
  eventId: string | null;
} {
  switch (source.kind) {
    case 'first-game-completion':
      return { group: 'ticket', lineRequirement: null, gameId: null, eventId: null };
    case 'mastery':
      return { group: 'engineers-mark', lineRequirement: null, gameId: source.gameId, eventId: null };
    case 'all-game-completion':
      return { group: 'line', lineRequirement: 'completion', gameId: null, eventId: null };
    case 'all-game-mastery':
      return { group: 'line', lineRequirement: source.minimumTier, gameId: null, eventId: null };
    case 'all-game-engineer':
      return { group: 'line', lineRequirement: 'engineer', gameId: null, eventId: null };
    case 'event-completion':
      return { group: 'event', lineRequirement: null, gameId: null, eventId: source.eventId };
  }
}

function buildArtifact(
  def: CollectibleDefinition,
  owned: AppState['collectibles'],
): PassportArtifactModel {
  const record = owned[def.collectibleId];
  return {
    collectibleId: def.collectibleId,
    name: def.name,
    shortDescription: def.shortDescription,
    rarity: def.rarity,
    rarityLabel: COLLECTIBLE_RARITY_LABELS[def.rarity],
    owned: record !== undefined,
    acquiredAt: record?.acquiredAt ?? null,
    requirement: def.source,
    ...classifyArtifact(def.source),
  };
}

function resolveRewardAvailability(
  status: GameEventStatus,
  complete: boolean,
  owned: boolean,
): PassportRewardAvailability {
  if (owned) return 'owned';
  if (status === 'upcoming') return 'pending';
  if (status === 'expired') return 'closed';
  return complete ? 'claimable' : 'earnable';
}

function buildSpecialRuns(
  source: PassportStateSource,
  now: Date | string,
  events: readonly GameEventDefinition[],
): PassportSpecialRunModel[] {
  return getEventPresentationModels(source.gameEvents, now, events).map((model) => {
    const complete = isEventComplete(model);
    const rewardDef = getEventCompletionCollectible(model.definition.eventId);
    const owned = rewardDef !== undefined && rewardDef.collectibleId in source.collectibles;
    return {
      eventId: model.definition.eventId,
      name: model.definition.name,
      startsAt: model.definition.startsAt,
      endsAt: model.definition.endsAt,
      status: model.status,
      requiredCount: model.definition.gameIds.length,
      completedCount: model.progress?.completedGameIds.length ?? 0,
      complete,
      completedAt: model.progress?.completedAt ?? null,
      reward: rewardDef
        ? {
            collectibleId: rewardDef.collectibleId,
            name: rewardDef.name,
            owned,
            availability: resolveRewardAvailability(model.status, complete, owned),
          }
        : null,
    };
  });
}

function countWeeklyDispatches(source: PassportStateSource): number | null {
  if (source.ordersSuspended) return null;
  return Object.values(source.orders.completions)
    .filter((record) => record.orderId === WEEKLY_DISPATCH_ORDER_ID).length;
}

// ── Entry point ───────────────────────────────────────────────────────────
/**
 * Build the complete Passport view model from sanitized state at an
 * explicit instant. Pure and deterministic: equal inputs give deep-equal
 * output; no input is mutated. `now` is a Date or an explicit-UTC ISO
 * string (the events helper's contract) and affects event status only.
 */
export function buildPassportModel(
  source: PassportModelInput,
  now: Date | string,
  registries: PassportRegistries = {},
): PassportModel {
  const games = registries.games ?? getAllGameDefinitions();
  const collectibles =
    registries.collectibles ?? Object.values(COLLECTIBLE_REGISTRY);
  const events = registries.events ?? getAllGameEvents();

  const taleRecords = source.tales.map((tale) => buildTaleRecord(tale, source, games));
  const challengeMastery = games.map((game) => buildMasteryRow(game, source));
  const artifacts = collectibles.map((def) => buildArtifact(def, source.collectibles));
  const specialRuns = buildSpecialRuns(source, now, events);
  const artifactsOwned = artifacts.filter((a) => a.owned).length;

  return {
    identity: buildIdentity(source.user),
    serviceRecord: buildServiceRecord(source.progression),
    taleRecords,
    challengeMastery,
    artifacts,
    specialRuns,
    serviceLog: {
      questsCompleted: Object.keys(source.quests.completions).length,
      weeklyDispatchesCleared: countWeeklyDispatches(source),
      eventsCompleted: specialRuns.filter((run) => run.complete).length,
      artifactsOwned,
    },
    summary: {
      talesTotal: source.tales.length,
      talesUnlocked: taleRecords.filter((r) => r.unlocked).length,
      talesComplete: taleRecords.filter((r) => r.complete).length,
      scansComplete: taleRecords.filter((r) => r.scanComplete).length,
      challengesComplete: taleRecords.filter((r) => r.challengeComplete).length,
      artifactsOwned,
      artifactsTotal: artifacts.length,
      engineerMasteryCount: challengeMastery.filter((row) => row.persistedTier === 'engineer').length,
      gameCount: games.length,
    },
  };
}
