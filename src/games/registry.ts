// ================== TRACKSIDE ARCADE — GAME PLATFORM REGISTRY ==================
// PUBLIC-v7.4B.GAME.2 — the typed foundation approved by the GAME.1
// architecture gate. PURE ADDITIVE: nothing imports this module yet, no
// behavior, storage, route, or UI changes. gameConfigs.ts and the
// current TaleDetailPage → GameOverlay → awardGameBadge flow remain the
// production path until GAME.3 (result adapter) and GAME.4 (launcher
// migration) wire this registry in.
//
// ── LEGACY COMPATIBILITY CONTRACT (critical invariant) ─────────────────
// Current production completion ownership remains:
//
//   state.gameBadges contains TALE ids (e.g. 'wooden-match'),
//   NOT GameIds.
//
// awardGameBadge(tale.id) and BADGE_KEY_GAME are frozen contracts.
// GAME.2 does NOT convert legacy badges, alter BADGE_KEY_GAME, migrate
// localStorage, or reinterpret Passport completion in any way.
// GameDefinition.taleId is the compatibility bridge: a player who holds
// the tale-id game badge is treated by later gates as having completed
// the associated game (implicit Bronze), with no data rewrite.
//
// ── Deferred items recorded for later gates ────────────────────────────
//   * GAME.4 — the wooden-match title mismatch (Tale Detail shows the
//     Tale copy "STRIKE THE MATCH"; the overlay shows the config title
//     "PRESERVE THE STATION LIGHT"). Structural gate only — not fixed
//     here.
//   * The dead legacy runtimes on disk (AllenTownGame.tsx,
//     PackerRailGame.tsx, WoodenMatchGame.tsx) remain unreferenced and
//     untouched; this registry uses only the currently active
//     implementations. Cleanup needs separate authorization.

import type { ComponentType } from 'react';
import {
  GameConfig,
  GameType,
  ALLEN_TOWN_GAME,
  PACKER_RAIL_GAME,
  WOODEN_MATCH_GAME,
} from './gameConfigs';
import {
  ALLEN_TOWN_SCORING,
  PACKER_ROUTE_SCORING,
  STATION_PRESERVATION_SCORING,
} from './scoring';
import type { MasteryDefinition } from './mastery';
import {
  ALLEN_TOWN_MASTERY,
  PACKER_ROUTE_MASTERY,
  STATION_PRESERVATION_MASTERY,
} from './mastery';

// ── Stable game identity ────────────────────────────────────────────────
// GameId is the platform's primary identity and is independent of Tale
// id. Tale association is metadata (GameDefinition.taleId), never the
// registry key. These strings are FROZEN once shipped: results, mastery,
// ghosts, and collectibles will key off them in later gates.

export type GameId =
  | 'allen-town-grid'
  | 'packer-rail-line'
  | 'station-preservation';

// ── Difficulty (G4 placeholder — typed now, computed later) ────────────
export type DifficultyBand = 0 | 1 | 2 | 3 | 4;

export interface DifficultyContext {
  /** Hidden difficulty band. Until GAME.10 (dynamic difficulty) every
   *  session runs at the default band 1. */
  band: DifficultyBand;
}

// ── Session ─────────────────────────────────────────────────────────────
// One launch of one game (an attempt-set: retries increment `attempt`
// within the same session). GAME.2 defines the type only — session
// creation lives in the GAME.3/4 launcher.
export interface GameSession {
  sessionId: string;
  gameId: GameId;
  /** Narrative association carried for result records; optional so
   *  future standalone (non-Tale) arcade games stay representable. */
  taleId?: string;
  /** ISO timestamp. */
  startedAt: string;
  /** 1-based attempt counter within this session. */
  attempt: number;
}

// ── Result (authoritative, immutable, versioned) ───────────────────────
// The ONLY authoritative record of play. Everything downstream
// (mastery, XP, ghosts, leaderboards) is derived from GameResults and
// never stored redundantly as truth.
//
//   * `score` is the canonical normalized scale 0..10000 — comparable
//     across games, difficulty bands, and future seasons.
//   * `metrics` is a numeric-only open map, namespaced by the game that
//     produced it (e.g. { mistakes: 1, perfectPlacements: 4 }). Only the
//     owning game's ScoringSpec / future MasteryDefinition may interpret
//     a game's metrics; the platform treats them as opaque numbers.
//     Future server persistence stores this map as a single JSON column
//     — never per-game schema columns.
// No persistence logic exists in this gate.
export interface GameResult {
  resultVersion: 1;
  sessionId: string;
  gameId: GameId;
  taleId?: string;
  /** ISO timestamp. */
  completedAt: string;
  attempt: number;
  durationMs: number;
  won: boolean;
  /** Canonical normalized score, clamped to 0..10000. */
  score: number;
  /** PUBLIC-v7.4B.GAME.6B — the ScoringSpec version that produced
   *  `score` (stamped by sealGameResult). Scores are only comparable
   *  within one scoringVersion of one game; hydration rejects persisted
   *  bests whose version is not the game's current one. */
  scoringVersion: number;
  difficultyBand: DifficultyBand;
  /** Numeric-only, game-namespaced metrics. */
  metrics: Record<string, number>;
}

/** Compact projection of a GameResult for prior-best display, Arcade
 *  cards, and (later) ghost metadata. Intentionally minimal.
 *  PUBLIC-v7.4B.GAME.6 — carries resultVersion so persisted summaries
 *  (tb_game_results_best) can be version-checked/rejected safely when
 *  future result versions appear.
 *  PUBLIC-v7.4B.GAME.6B — also carries scoringVersion: a persisted best
 *  is only valid while its game's ScoringSpec version matches. GAME.6
 *  summaries (placeholder scoring, no scoringVersion field) fail
 *  hydration and are discarded — the player re-establishes a real PB on
 *  their next win. */
export interface GameResultSummary {
  resultVersion: 1;
  gameId: GameId;
  won: boolean;
  score: number;
  scoringVersion: number;
  difficultyBand: DifficultyBand;
  completedAt: string;
  durationMs: number;
}

// ── Outcome (raw runtime output) ────────────────────────────────────────
// What a runtime hands the platform BEFORE the shell seals a
// GameResult. BOUNDARY: runtimes report what happened and nothing else —
// they never award badges, compute mastery, grant XP, or persist
// anything. The platform shell owns identity, timing, scoring
// (ScoringSpec), and every downstream consequence.
export interface GameOutcome {
  won: boolean;
  /** Numeric-only raw metrics from the runtime (same rules as
   *  GameResult.metrics). */
  metrics: Record<string, number>;
  /** Optional raw score input for games whose runtime already computes
   *  an internal score. The ScoringSpec still owns normalization —
   *  this value is never trusted as the canonical score directly. */
  rawScore?: number;
}

// ── Scoring ─────────────────────────────────────────────────────────────
/** Clamp any scoring output onto the canonical 0..10000 scale. */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10_000, Math.round(value)));
}

// Deterministic, side-effect-free conversion of an outcome (at a
// difficulty band) onto the canonical scale. Versioned so future tuning
// can trigger clean recomputation of derived values.
// PUBLIC-v7.4B.GAME.6B — scoringVersion widened from the literal 1 to
// number and BUMPED to 2 for all three games (real formulas in
// scoring.ts replace the GAME.2 compatibility placeholder, which was
// version 1: won → 5000). Any formula change must bump the game's
// version — persisted bests from other versions are never comparable
// and are dropped at hydration (see AppContext).
export interface ScoringSpec {
  scoringVersion: number;
  score(outcome: GameOutcome, band: DifficultyBand): number;
}

// ── Requirements / capabilities ─────────────────────────────────────────
export interface GameRequirements {
  /** Tale that must be unlocked before this game is playable (matches
   *  the current rule: games launch only from an unlocked Tale). */
  unlockedTale?: string;
}

// Reserved capability flags. All three current games are registered
// conservatively (no flags set) — nothing here enables unshipped
// functionality; later gates flip flags per game as features land.
export interface GameCapabilities {
  ghost?: boolean;          // G5 — deterministic ghost/replay support
  webgpu?: boolean;         // G13 — enhanced-renderer opt-in
  seasonVariants?: boolean; // G10 — seasonal parameterization
}

// ── Ghost placeholder (G5 — deliberately NOT implemented) ──────────────
// A minimal opaque future-safe reference so GameRuntimeProps can carry
// the slot without prematurely designing GhostTrace internals here.
export interface GhostTraceRef {
  readonly __ghostTracePlaceholder: true;
}

// ── Runtime contract (future — nothing is wired to this yet) ───────────
export interface GameRuntimeProps {
  session: GameSession;
  definition: GameDefinition;
  context: {
    /** Resolved once by the platform shell (prefers-reduced-motion). */
    reducedMotion: boolean;
    difficulty: DifficultyContext;
    priorBest?: GameResultSummary;
    ghost?: GhostTraceRef;
  };
  onComplete(outcome: GameOutcome): void;
  onExit(): void;
}

export type GameRuntimeComponent = ComponentType<GameRuntimeProps>;

// The shape ALL THREE current runtimes actually share today
// (AllenTownPlanningGame, PackerRouteGame, WoodenStationGame — verified
// identical prop interfaces at GAME.2 time). Registered loaders resolve
// these until the GAME.3 compatibility adapter wraps them into
// GameRuntimeComponent, at which point RegisteredRuntimeComponent
// collapses to the future type and this alias can retire.
//
// PUBLIC-v7.4B.GAME.6B — onWin/onLose now carry an OPTIONAL numeric
// metrics payload (the smallest honest evolution toward the GameOutcome
// contract): each runtime reports only values derived from its actual
// gameplay state (see each game's METRIC CONTRACT comment). The shell
// merges them into the sealed GameResult. Runtimes still never award
// badges, persist, or score — they report raw performance only.
export interface LegacyGameRuntimeProps {
  config: GameConfig;
  onWin: (metrics?: Record<string, number>) => void;
  onLose: (metrics?: Record<string, number>) => void;
  quizShowing: boolean;
}

export type LegacyGameRuntimeComponent = ComponentType<LegacyGameRuntimeProps>;

/** Lazy loader — the registry is the ONLY runtime source; GameOverlay
 *  loads the selected game's chunk on demand (PUBLIC-v7.4B.GAME.4), so
 *  no runtime ships in the initial bundle.
 *
 *  GAME.4 typing decision: the loader resolves the LEGACY runtime
 *  contract, because that is the contract the shell's adapter actually
 *  speaks today — all three active runtimes take
 *  { config, onWin, onLose, quizShowing }. The GAME.2 transitional
 *  union (GameRuntimeComponent | LegacyGameRuntimeComponent) is
 *  narrowed to this honest single type rather than force-casting the
 *  active games to the future GameRuntimeProps contract. Remaining
 *  future cleanup: when a later gate migrates runtimes to
 *  GameRuntimeProps, this alias flips to GameRuntimeComponent. */
export type GameRuntimeLoader = () => Promise<{ default: LegacyGameRuntimeComponent }>;

// ── Definition ──────────────────────────────────────────────────────────
export interface GameDefinition {
  gameId: GameId;
  /** Narrative association — metadata, not identity (see header note). */
  taleId?: string;
  /** The existing gameConfigs entry, referenced verbatim (single source
   *  for copy/quiz content during the transition). */
  legacyConfig?: GameConfig;
  title: string;
  type: GameType;
  requires: GameRequirements;
  runtime: GameRuntimeLoader;
  scoring: ScoringSpec;
  /** PUBLIC-v7.4B.GAME.7 — per-game mastery thresholds + Engineer
   *  predicate inputs (see mastery.ts). Evaluation is the shared pure
   *  evaluateMastery; persistence is AppContext's tb_game_mastery. */
  mastery: MasteryDefinition;
  capabilities: GameCapabilities;
}

// ── The registry ────────────────────────────────────────────────────────
// Exactly the three shipped games. Titles and content are referenced
// from the existing configs (no copy duplication). Declaration order is
// meaningful (stable Arcade listing order later): the narrative order
// wa-lager → packer-pils → wooden-match, matching tales.ts.

export const GAME_REGISTRY: Record<GameId, GameDefinition> = {
  'allen-town-grid': {
    gameId: 'allen-town-grid',
    taleId: ALLEN_TOWN_GAME.taleId,            // 'wa-lager'
    legacyConfig: ALLEN_TOWN_GAME,
    title: ALLEN_TOWN_GAME.title,              // "LAY OUT ALLEN'S TOWN"
    type: ALLEN_TOWN_GAME.type,                // 'grid'
    requires: { unlockedTale: ALLEN_TOWN_GAME.taleId },
    runtime: () =>
      import('./AllenTownPlanningGame').then((m) => ({ default: m.AllenTownPlanningGame })),
    // GAME.6B — real planning-accuracy scoring (v2), see scoring.ts.
    scoring: ALLEN_TOWN_SCORING,
    // GAME.7 — mastery thresholds (v1), see mastery.ts.
    mastery: ALLEN_TOWN_MASTERY,
    capabilities: {},
  },
  'packer-rail-line': {
    gameId: 'packer-rail-line',
    taleId: PACKER_RAIL_GAME.taleId,           // 'packer-pils'
    legacyConfig: PACKER_RAIL_GAME,
    title: PACKER_RAIL_GAME.title,             // 'BUILD THE LEHIGH VALLEY LINE'
    type: PACKER_RAIL_GAME.type,               // 'spike'
    requires: { unlockedTale: PACKER_RAIL_GAME.taleId },
    runtime: () =>
      import('./PackerRouteGame').then((m) => ({ default: m.PackerRouteGame })),
    // GAME.6B — real route-execution scoring (v2), see scoring.ts.
    scoring: PACKER_ROUTE_SCORING,
    // GAME.7 — mastery thresholds (v1), see mastery.ts.
    mastery: PACKER_ROUTE_MASTERY,
    capabilities: {},
  },
  'station-preservation': {
    gameId: 'station-preservation',
    taleId: WOODEN_MATCH_GAME.taleId,          // 'wooden-match'
    legacyConfig: WOODEN_MATCH_GAME,
    // PUBLIC-v7.4B.GAME.4 — canonical public title (operator-approved).
    // The definition is the authoritative title source; the legacy
    // config's internal 'PRESERVE THE STATION LIGHT' heading is
    // superseded in all chrome. Mechanics, instructions, success copy,
    // and badge titles are untouched.
    title: 'STRIKE THE MATCH',
    type: WOODEN_MATCH_GAME.type,              // 'match'
    requires: { unlockedTale: WOODEN_MATCH_GAME.taleId },
    runtime: () =>
      import('./WoodenStationGame').then((m) => ({ default: m.WoodenStationGame })),
    // GAME.6B — real preservation-decision scoring (v2), see scoring.ts.
    scoring: STATION_PRESERVATION_SCORING,
    // GAME.7 — mastery thresholds (v1), see mastery.ts.
    mastery: STATION_PRESERVATION_MASTERY,
    capabilities: {},
  },
};

// ── Helpers — deterministic, side-effect free, no state, no UI ─────────

/** Declaration order of the registry (stable listing order). */
const REGISTRY_ORDER: readonly GameId[] = [
  'allen-town-grid',
  'packer-rail-line',
  'station-preservation',
];

export function getGameDefinition(gameId: GameId): GameDefinition {
  return GAME_REGISTRY[gameId];
}

export function getGamesForTale(taleId: string): GameDefinition[] {
  return REGISTRY_ORDER
    .map((id) => GAME_REGISTRY[id])
    .filter((def) => def.taleId === taleId);
}

export function getAllGameDefinitions(): GameDefinition[] {
  return REGISTRY_ORDER.map((id) => GAME_REGISTRY[id]);
}
