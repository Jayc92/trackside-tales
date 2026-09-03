import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameType } from './gameConfigs';
import { TsIcon } from '../components/TsIcon';
import { logEvent, flushEvents } from '../services/eventLogger';
import {
  GameDefinition,
  GameResult,
  LegacyGameRuntimeComponent,
} from './registry';
import {
  DEFAULT_DIFFICULTY_BAND,
  createGameSession,
  sealGameResult,
} from './resultPipeline';

// ================== GAME OVERLAY (v5.1.2 — orchestrator) ==================
// First playable vertical slice. Renders against the golden CSS schema in
// app.css: #game-overlay + .game-header + .game-instructions + .game-stats
// + .game-start-btn + .game-success + .game-fail + .game-quiz-panel.
//
// Flow:
//   intro    → user reads the OBJECTIVE panel, taps "BEGIN"
//   playing  → AllenTownGame runs; onWin → quiz, onLose → fail
//   quiz     → one question; correct → success (badge awarded once),
//              wrong → reveal correct + retry option
//   success  → brass medallion + CONTINUE; badge already recorded
//   fail     → TRY AGAIN (replay game) or SKIP (close)
//
// v5.1.2 SCOPE: only W.A. Lager is reachable from the UI. The other two
// games stay behind the COMING SOON disabled CTA on Tale Detail. If this
// overlay is ever opened with a non-grid config (dev console, future
// regression) it shows a polite "rebuild in progress" fallback rather
// than the broken game UI.
//
// HARD CONSTRAINTS PRESERVED:
//   - awardGameBadge is only called via onBadgeAwarded AFTER a correct
//     quiz answer, never on game win alone.
//   - alreadyEarned prop suppresses double-awarding for users who
//     already have the badge from a prior session.
//   - No badge-key, localStorage-key, Supabase, scan, or QR changes.
//
// ADMIN-v6.8D: fire-and-forget event logging for the game lifecycle.
// Three events emit from this file: game_started (on BEGIN), then
// exactly one of game_completed (success path) or game_failed (lose
// path). Failed retries can re-emit game_failed; success is terminal
// for the overlay session.
//   - logEvent / flushEvents are no-ops when USE_REMOTE_EVENTS is off.
//   - Per-attempt attempts + durationMs included on completed/failed
//     so admin queries can compute first-try rate, replay rate, and
//     median time-to-complete without re-deriving from raw rows.
//   - Child game components (AllenTownPlanningGame, PackerRouteGame,
//     WoodenStationGame) are NOT touched. Their onWin/onLose callbacks
//     remain the single funnels through which lifecycle transitions
//     route, so all instrumentation lives at the funnel level here.
//   - Logging runs AFTER the visible setPhase / state transition so a
//     slow logEvent can never delay the phase paint. Same posture as
//     ADMIN-v6.8C in ScanPage.
//
// UI-v6.7A: presentation-only shell pass.
//   - Cinematic intro card (themed emblem plate, eyebrow, era stamp,
//     flavor line) wrapped around the existing OBJECTIVE panel + BEGIN.
//   - Already-earned replay banner on the intro when alreadyEarned is
//     true; BEGIN relabels to PLAY AGAIN. Award gating is unchanged.
//   - Fail state gets a themed emblem + per-game eyebrow.
//   - No prop, phase, analytics, or badge-flow changes. SHELL_THEMES is
//     a static lookup keyed by the frozen GameType strings.

type GamePhase = 'intro' | 'playing' | 'quiz' | 'success' | 'fail';

// UI-v6.7A — per-game shell theming for the intro card and fail state.
// Presentation-only: icons come from the existing TsIcon library, copy is
// static, and nothing here feeds back into game logic, badges, or
// analytics. Keyed by the frozen GameType strings (grid/spike/match).
interface ShellTheme {
  /** TsIcon name for the intro plate + fail emblem. */
  icon: string;
  /** Small-caps line above the title plate, e.g. "SURVEYOR'S COMMISSION". */
  eyebrow: string;
  /** Period stamp under the eyebrow, e.g. "ANNO 1762". */
  era: string;
  /** One-line cinematic framing shown above the OBJECTIVE panel. */
  flavor: string;
  /** Small-caps line above "NOT QUITE" on the fail screen. */
  failEyebrow: string;
}

const SHELL_THEMES: Record<GameType, ShellTheme> = {
  grid: {
    icon: 'survey-grid',
    eyebrow: "SURVEYOR'S COMMISSION",
    era: 'ANNO 1762',
    flavor:
      'William Allen has drawn the lines of a new town. The survey table is yours.',
    failEyebrow: 'THE SURVEY STANDS UNFINISHED',
  },
  spike: {
    icon: 'rail-spike',
    eyebrow: "ENGINEER'S ORDERS",
    era: 'ANNO 1855',
    flavor:
      'Asa Packer is building the Lehigh Valley line. Every junction waits on your spike.',
    failEyebrow: 'THE LINE STOPS SHORT',
  },
  match: {
    icon: 'station-lantern',
    eyebrow: "KEEPER'S CHARGE",
    era: 'ANNO 1868',
    flavor:
      'The old station has been dark since 1967. One match stands between memory and loss.',
    failEyebrow: 'THE MATCH GUTTERS OUT',
  },
};

// Fallback for any future unwired GameType so the shell never renders
// without a theme (mirrors the defensive fallback in renderPlaying).
const DEFAULT_THEME: ShellTheme = {
  icon: 'town-seal',
  eyebrow: 'TRACKSIDE CHALLENGE',
  era: 'TRACKSIDE TALES',
  flavor: 'A piece of the Tale is waiting to be earned.',
  failEyebrow: 'THE CHALLENGE STANDS',
};

// ================== GAME.8B — modal keyboard containment ==================
// GameOverlay always rendered dialog semantics but never contained
// keyboard focus: background PLAY/REPLAY buttons stayed Tab-reachable
// (the GAME.6B stale-session finding). This block makes the overlay a
// real keyboard modal: focus enters on open, Tab/Shift+Tab cycle
// inside, Escape maps to the SAME onClose as the always-present EXIT
// control (every phase already permits explicit closure, and closing
// never awards, seals, or emits anything), and focus returns to the
// launching element on genuine unmount only — never on retry or phase
// changes. Only Tab/Shift+Tab/Escape are intercepted; gameplay,
// scoring, mastery, badges, sessions, and persistence are untouched.

/** Visible, enabled, focusable descendants — queried at KEYDOWN time
 *  (never snapshotted) because the overlay's controls change per phase
 *  and per runtime mount. */
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.closest('[aria-hidden="true"]') && el.getClientRects().length > 0,
  );
}

/** Move focus to the current phase's primary control
 *  ([data-modal-focus]), else the first focusable, else the dialog
 *  container itself (tabIndex=-1). */
function focusModalEntry(root: HTMLElement): void {
  const marked = root.querySelector<HTMLElement>('[data-modal-focus]');
  const target =
    (marked && !marked.hasAttribute('disabled') && marked.getClientRects().length > 0
      ? marked
      : null) ??
    getFocusableIn(root)[0] ??
    root;
  try { target.focus(); } catch (_) { /* focus is best-effort */ }
}

/** One dialog-focus boundary per overlay instance: launcher capture at
 *  first render, capture-phase Tab trap + Escape→onClose while
 *  mounted, launcher restore on unmount. No global state, no storage,
 *  no third-party trap. */
function useModalDialogFocus(onClose: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Launcher capture happens at FIRST RENDER (a pure DOM read), before
  // any effect can move focus into the dialog — effects of children
  // run before this component's own, so an effect-time capture would
  // read the dialog itself, not the button that opened it.
  const launcherRef = useRef<HTMLElement | null | undefined>(undefined);
  if (launcherRef.current === undefined) {
    launcherRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  useEffect(() => {
    // Initial focus for render paths with no inner phase manager (the
    // fail-closed panel); the standard path has already focused its
    // intro primary by the time this parent effect runs, so this is a
    // no-op there.
    const root = rootRef.current;
    if (
      root &&
      !(document.activeElement instanceof HTMLElement && root.contains(document.activeElement))
    ) {
      focusModalEntry(root);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const dialog = rootRef.current;
      if (!dialog) return;
      if (e.key === 'Escape') {
        // Same contract as the always-present EXIT control: close in
        // every phase; never awards a badge, never seals a result.
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = getFocusableIn(dialog);
      const active = document.activeElement;
      if (focusables.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const inside = active instanceof HTMLElement && dialog.contains(active);
      if (!inside) {
        // Focus escaped (or was lost to <body>) — pull it back in.
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      }
    };
    // Capture phase: trapped Tabs never reach page-level handlers or
    // background controls.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Focus restoration — genuine unmount only (retries and phase
      // changes never tear this effect down).
      const launcher = launcherRef.current;
      if (launcher && launcher.isConnected && !launcher.hasAttribute('disabled')) {
        try { launcher.focus(); } catch (_) { /* ignore */ }
      }
    };
  }, []);

  return rootRef;
}

interface GameOverlayProps {
  /** PUBLIC-v7.4B.GAME.4 — the registry GameDefinition is now the
   *  launch authority (identity, title, type, runtime loader, scoring,
   *  legacy config bridge). The overlay no longer resolves runtimes
   *  from config.type or imports them eagerly. */
  definition: GameDefinition;
  onClose: () => void;
  onBadgeAwarded: (badgeKey: string) => void;
  alreadyEarned: boolean;
  /** Optional icon name for the success-state medallion. Falls back to a
   *  generic "town-seal" so the overlay still renders if not provided. */
  successBadgeIcon?: string;
  /** Optional title for the success-state medallion label. Falls back to
   *  the game title from config. */
  successBadgeTitle?: string;
  /** ADMIN-v6.8D — current session's tb_guest_id, passed at flush time
   *  to log-events. Required because the analytics path is meaningless
   *  without it; eventLogger no-ops when guestId is empty. */
  guestId: string;
  /** PUBLIC-v7.4B.GAME.3 — optional platform result observer. Called
   *  exactly once per TERMINAL attempt (each failed attempt, and the
   *  single winning attempt), with the already-sealed GameResult.
   *  Observational only: results are not persisted, and badge award
   *  semantics are entirely independent of this callback (and of
   *  GameResult.score). No caller passes it yet — wiring belongs to
   *  later GAME gates. */
  onResult?: (result: GameResult) => void;
}

export function GameOverlay(props: GameOverlayProps) {
  // GAME.8B — one keyboard-modal boundary per overlay instance,
  // covering BOTH render paths below (the hook runs unconditionally;
  // only the ref target differs).
  const rootRef = useModalDialogFocus(props.onClose);
  // The legacy config remains the copy/quiz/content bridge for the
  // active runtimes (GAME.4 §10). Every registered game carries one;
  // a definition without it fails CLOSED here (readable panel, no
  // crash, no hooks-order hazard) instead of reaching gameplay.
  const config = props.definition.legacyConfig;
  if (!config) {
    return (
      <div id="game-overlay" className="active" role="dialog" aria-modal="true"
        aria-label={props.definition.title} ref={rootRef} tabIndex={-1}>
        <div className="game-canvas-wrap">
          <p className="game-instructions">
            This challenge couldn't be prepared. Please try again later.
          </p>
          <button type="button" className="game-start-btn" onClick={props.onClose} data-modal-focus>
            CLOSE
          </button>
        </div>
      </div>
    );
  }
  return <GameOverlayInner {...props} config={config} rootRef={rootRef} />;
}

function GameOverlayInner({
  definition,
  config,
  onClose,
  onBadgeAwarded,
  alreadyEarned,
  successBadgeIcon = 'town-seal',
  successBadgeTitle,
  guestId,
  onResult,
  rootRef,
}: GameOverlayProps & {
  config: NonNullable<GameDefinition['legacyConfig']>;
  rootRef: React.RefObject<HTMLDivElement>;
}) {
  const [phase, setPhase] = useState<GamePhase>('intro');

  // ── PUBLIC-v7.4B.GAME.4 — lazy runtime loading state machine ──
  // The definition's loader is the ONLY runtime source. Loading starts
  // at mount (intro phase) so BEGIN usually lands on a ready runtime;
  // 'playing' renders a quiet loading panel until then. A failed chunk
  // load fails CLOSED: readable message, TRY AGAIN re-invokes the
  // loader, CLOSE exits — no badge, no GameResult, and no
  // game_completed/game_failed analytics (a load failure is not
  // gameplay; game_started may already have fired at BEGIN, which
  // correctly records intent).
  const [RuntimeComp, setRuntimeComp] =
    useState<LegacyGameRuntimeComponent | null>(null);
  const [runtimeLoad, setRuntimeLoad] =
    useState<'loading' | 'loaded' | 'load-failed'>('loading');
  // Chromium caches a FAILED dynamic import in the module map, so a
  // bare re-import can reject instantly without refetching. TRY AGAIN
  // therefore re-attempts the loader once (browsers that refetch will
  // recover), and after a second failure the panel escalates to a
  // deterministic RELOAD PAGE — hash routing + persisted unlock state
  // land the guest back on this Tale. No crash loop either way.
  const [loadAttempts, setLoadAttempts] = useState(0);
  const loadRuntime = useCallback(() => {
    setLoadAttempts((n) => n + 1);
    setRuntimeLoad('loading');
    definition
      .runtime()
      .then((mod) => {
        setRuntimeComp(() => mod.default);
        setRuntimeLoad('loaded');
      })
      .catch(() => {
        setRuntimeComp(null);
        setRuntimeLoad('load-failed');
      });
  }, [definition]);
  useEffect(() => { loadRuntime(); }, [loadRuntime]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<'correct' | 'wrong' | null>(null);

  // Child games read this synchronously to halt their fail timers as soon
  // as we leave the playing phase. ref so timers see the current value
  // without waiting for a re-render.
  const quizShowingRef = useRef(false);

  // ADMIN-v6.8D — analytics dedupe + per-attempt metadata refs.
  //
  // gameStartedLoggedRef:    set true once we emit game_started so
  //                          retries (and any defensive re-entry into
  //                          'playing') don't re-emit a start.
  // gameCompletedLoggedRef:  set true once we emit game_completed.
  //                          'success' is terminal, so this also
  //                          double-protects against any future code
  //                          path that re-runs handleGameWin.
  // gameFailedLoggedRef:     set true once we emit game_failed for the
  //                          CURRENT attempt; cleared by retryGame so
  //                          a second failure of a retried attempt
  //                          legitimately re-emits.
  // attemptsRef:             starts at 1, increments on retryGame.
  //                          Surfaced on completed/failed payloads.
  // gameStartedAtRef:        Date.now() set when game_started fires
  //                          (and reset on retryGame). Used to compute
  //                          per-attempt durationMs. 0 means "not yet
  //                          started" — guards against negative
  //                          durations if the overlay somehow reaches
  //                          win/lose without intro→playing.
  const gameStartedLoggedRef   = useRef(false);
  const gameCompletedLoggedRef = useRef(false);
  const gameFailedLoggedRef    = useRef(false);
  const attemptsRef            = useRef(1);
  const gameStartedAtRef       = useRef(0);

  // ── PUBLIC-v7.4B.GAME.3/4 — platform result sealing (observational) ──
  // One GameSession per overlay session. GAME.4: identity comes
  // DIRECTLY from the passed GameDefinition (gameId + taleId) — the
  // overlay no longer derives it indirectly from the Tale id. Retries
  // share the session and vary only the per-result attempt count,
  // matching the attemptsRef semantics above.
  //
  // Emission gates mirror the analytics gates deliberately but stay
  // SEPARATE refs so the result pipeline can never entangle the frozen
  // analytics contract:
  //   resultWonEmittedRef  — once per overlay session (win is terminal)
  //   resultLostEmittedRef — once per attempt; cleared by retryGame
  const sessionRef = useRef(
    createGameSession(definition.gameId, definition.taleId),
  );
  const resultWonEmittedRef  = useRef(false);
  const resultLostEmittedRef = useRef(false);

  // GAME.6B — the CURRENT attempt's runtime metric payload, captured at
  // the onWin/onLose funnel (each runtime's METRIC CONTRACT documents
  // its keys). Cleared by retryGame so a stale attempt's numbers can
  // never leak into the next attempt's sealed result.
  const runtimeMetricsRef = useRef<Record<string, number> | null>(null);

  /** Seal + surface one terminal result. Pure sealing; the only side
   *  effect is the optional onResult callback. Badge award, phases, and
   *  analytics are all decided BEFORE this runs and never depend on it. */
  const emitResult = useCallback((won: boolean) => {
    const def = definition;
    const session = sessionRef.current;
    if (!session) return;
    if (won) {
      if (resultWonEmittedRef.current) return;
      resultWonEmittedRef.current = true;
    } else {
      if (resultLostEmittedRef.current) return;
      resultLostEmittedRef.current = true;
    }
    const startedAt = gameStartedAtRef.current;
    const durationMs = startedAt > 0 ? Math.max(0, Date.now() - startedAt) : 0;
    const result = sealGameResult({
      session,
      outcome: {
        won,
        // GAME.6B — the runtime's honest per-attempt metrics (mistakes,
        // timeLeftSec, hintsUsed, progress), merged under the
        // platform-owned attempts count. The shell never edits or
        // reinterprets runtime values; the game's own ScoringSpec is
        // the only consumer that assigns them meaning.
        metrics: {
          ...(runtimeMetricsRef.current ?? {}),
          attempts: attemptsRef.current,
        },
      },
      scoring: def.scoring,
      difficultyBand: DEFAULT_DIFFICULTY_BAND,
      durationMs,
      attempt: attemptsRef.current,
    });
    onResult?.(result);
  }, [definition, onResult]);

  /** Compute per-attempt durationMs from gameStartedAtRef, or undefined
   *  if we never recorded a start (defensive — shouldn't happen via the
   *  BEGIN button path). The eventLogger wire shape drops `undefined`
   *  fields so the server never sees a key it can't validate. */
  const computeDurationMs = (): number | undefined => {
    const startedAt = gameStartedAtRef.current;
    if (!startedAt) return undefined;
    const delta = Date.now() - startedAt;
    return delta >= 0 ? delta : undefined;
  };

  // ADMIN-v6.8D — small helper kept inline so the lifecycle handlers
  // below stay readable. Idempotent via gameCompletedLoggedRef. Always
  // safe to call; no-ops when the flag is off via eventLogger itself.
  const emitGameCompleted = useCallback(() => {
    if (gameCompletedLoggedRef.current) return;
    gameCompletedLoggedRef.current = true;
    const durationMs = computeDurationMs();
    logEvent({
      type:     'game_completed',
      taleSlug: config.taleId,
      gameType: config.type,
      attempts: attemptsRef.current,
      ...(durationMs !== undefined ? { durationMs } : {}),
    });
    void flushEvents(guestId);
  }, [config, guestId]);

  // ── Lifecycle ────────────────────────────────────────────────────────────
  const handleGameWin = useCallback((metrics?: Record<string, number>) => {
    // GAME.6B — capture the runtime's terminal metric payload FIRST so
    // emitResult below seals it into this attempt's GameResult.
    runtimeMetricsRef.current = metrics ?? null;
    // v5.1.7+: planning game (grid) integrates its own unlock-quiz.
    // v5.1.14: Packer route game (spike) does the same — interleaved
    // unlock quizzes per junction, no post-puzzle quiz needed.
    // v5.1.15: Wooden Match station game (match) interleaves a
    // preservation-decision quiz per artifact. All three award the
    // badge directly and go to the success medallion.
    if (config.type === 'grid' || config.type === 'spike' || config.type === 'match') {
      if (!alreadyEarned) onBadgeAwarded(config.badgeKey);
      setPhase('success');
      // ADMIN-v6.8D — direct-award branch (the only path reachable in
      // current builds). game_completed emits AFTER the visible phase
      // transition so a slow logEvent can never delay paint.
      emitGameCompleted();
      // GAME.3 — seal the winning attempt's platform result LAST (after
      // badge, phase, and analytics; observational only).
      emitResult(true);
      return;
    }
    quizShowingRef.current = true;
    setPhase('quiz');
    // The quiz branch is dead code today (no current GameConfig has a
    // non-grid/spike/match type) but stays for type safety. We do NOT
    // emit game_completed here — completion is the badge-grant moment
    // in handleAnswer below, not the moment we route to the quiz.
  }, [config, alreadyEarned, onBadgeAwarded, emitGameCompleted]);

  const handleGameLose = useCallback((metrics?: Record<string, number>) => {
    // GAME.6B — same capture-first contract as handleGameWin.
    runtimeMetricsRef.current = metrics ?? null;
    setPhase('fail');
    // ADMIN-v6.8D — game_failed emits AFTER setPhase. Gated by
    // gameFailedLoggedRef so a single onLose firing twice can't
    // double-count, but retryGame clears the gate so a second
    // failure of a retried attempt re-emits cleanly.
    if (!gameFailedLoggedRef.current) {
      gameFailedLoggedRef.current = true;
      const durationMs = computeDurationMs();
      logEvent({
        type:     'game_failed',
        taleSlug: config.taleId,
        gameType: config.type,
        attempts: attemptsRef.current,
        ...(durationMs !== undefined ? { durationMs } : {}),
      });
      void flushEvents(guestId);
    }
    // GAME.3 — seal the failed attempt's platform result (its own
    // per-attempt gate; observational only, never awards anything).
    emitResult(false);
  }, [config, guestId, emitResult]);

  const handleAnswer = useCallback((idx: number) => {
    if (selectedOption !== null) return; // one answer per attempt
    setSelectedOption(idx);
    const correct = idx === config.quizCorrectIndex;
    setAnswerResult(correct ? 'correct' : 'wrong');
    if (correct) {
      // Award the badge after a brief reveal — gives the user a beat to
      // see the green highlight on their correct answer before the
      // success screen replaces it.
      window.setTimeout(() => {
        if (!alreadyEarned) onBadgeAwarded(config.badgeKey);
        setPhase('success');
        // ADMIN-v6.8D — legacy quiz branch's success moment. Dead path
        // today (no shipped GameConfig routes through here) but covered
        // for forward-safety. Same idempotency contract as the inline
        // branch: emitGameCompleted's ref gate ensures one emission per
        // overlay session even if both branches somehow fire.
        emitGameCompleted();
        // GAME.3 — same forward-safety for the platform result (its own
        // once-per-session won gate).
        emitResult(true);
      }, 700);
    }
    // Wrong answer: stay on quiz panel, show the correct one highlighted,
    // and surface the RETRY GAME button (handled in render below).
  }, [selectedOption, config, alreadyEarned, onBadgeAwarded, emitGameCompleted, emitResult]);

  const retryGame = useCallback(() => {
    setSelectedOption(null);
    setAnswerResult(null);
    quizShowingRef.current = false;
    setPhase('playing');
    // ADMIN-v6.8D — bump attempts and re-arm the failed-event gate so
    // a second failure on the retried attempt logs cleanly. We do NOT
    // emit a fresh game_started here (per spec) — a retry is the same
    // logical session continued. We DO reset gameStartedAtRef so the
    // next durationMs is per-attempt rather than cumulative. We do NOT
    // touch gameCompletedLoggedRef — success remains terminal for the
    // overlay session even across retries.
    attemptsRef.current        += 1;
    gameStartedAtRef.current    = Date.now();
    gameFailedLoggedRef.current = false;
    // GAME.3 — re-arm the per-attempt result gate (mirrors the
    // game_failed gate; the won gate stays terminal for the session).
    resultLostEmittedRef.current = false;
    // GAME.6B — drop the failed attempt's runtime metrics; the retried
    // attempt reports its own.
    runtimeMetricsRef.current = null;
  }, []);

  // ADMIN-v6.8D — BEGIN handler. Visible behavior is identical to the
  // previous inline arrow (setPhase 'playing'). The only addition is
  // analytics: record the start timestamp, transition phase, then emit
  // game_started exactly once per overlay session. Retries do NOT
  // re-enter this handler — they go through retryGame, which sets phase
  // directly without logging a new start.
  const handleBegin = useCallback(() => {
    gameStartedAtRef.current = Date.now();
    setPhase('playing');
    if (!gameStartedLoggedRef.current) {
      gameStartedLoggedRef.current = true;
      logEvent({
        type:     'game_started',
        taleSlug: config.taleId,
        gameType: config.type,
      });
      void flushEvents(guestId);
    }
  }, [config, guestId]);

  // ── Phase renderers ──────────────────────────────────────────────────────
  // UI-v6.7A — cinematic intro card. The old intro was a bare paragraph +
  // BEGIN. This version stages the same content as a ceremony: themed
  // emblem plate → title → flavor line → OBJECTIVE panel → BEGIN, with an
  // already-earned banner above when the badge is held. handleBegin stays
  // the single start funnel; replaying with the badge held never re-awards
  // (alreadyEarned gate in handleGameWin is untouched).
  const renderIntro = () => {
    const theme = SHELL_THEMES[config.type] ?? DEFAULT_THEME;
    return (
      <div className="game-canvas-wrap">
        <div className="game-intro-card">
          {alreadyEarned && (
            <div className="game-earned-banner" role="status">
              <span className="game-earned-banner-seal" aria-hidden="true">
                <TsIcon icon={successBadgeIcon} className="ts-icon-sm" />
              </span>
              <span className="game-earned-banner-text">
                <strong>BADGE ALREADY STAMPED</strong>
                Replay for the story — your Passport keeps the original.
              </span>
            </div>
          )}
          <div className="game-intro-plate" aria-hidden="true">
            <span className="game-intro-plate-ring" />
            <TsIcon icon={theme.icon} className="ts-icon-lg" />
          </div>
          <div className="game-intro-eyebrow">{theme.eyebrow}</div>
          <div className="game-intro-era" aria-hidden="true">
            <span className="game-intro-era-rule" />
            <span>{theme.era}</span>
            <span className="game-intro-era-rule" />
          </div>
          <p className="game-intro-flavor">{theme.flavor}</p>
          <p className="game-instructions">{config.instructions}</p>
          <button
            type="button"
            className="game-start-btn"
            onClick={handleBegin}
            data-modal-focus
          >
            {alreadyEarned ? 'PLAY AGAIN' : 'BEGIN'}
          </button>
        </div>
      </div>
    );
  };

  // PUBLIC-v7.4B.GAME.4 — the definition's lazy-loaded runtime is the
  // only runtime source (the config.type switch and the three eager
  // runtime imports are gone). The adapter contract is unchanged: the
  // active runtimes still receive their legacy props, and the GAME.3
  // outcome/result funnel stays the platform boundary.
  const renderPlaying = () => {
    if (runtimeLoad === 'load-failed') {
      // Fail CLOSED: no badge, no GameResult, no gameplay analytics.
      const exhausted = loadAttempts >= 2;
      return (
        <div className="game-canvas-wrap">
          <p className="game-instructions">
            The challenge couldn't be loaded. Check your connection and
            try again.
          </p>
          <button
            type="button"
            className="game-start-btn"
            onClick={exhausted ? () => window.location.reload() : loadRuntime}
            data-modal-focus
          >
            {exhausted ? 'RELOAD PAGE' : 'TRY AGAIN'}
          </button>
          <button type="button" className="game-quiz-skip" onClick={onClose}>
            CLOSE
          </button>
        </div>
      );
    }
    if (runtimeLoad === 'loading' || !RuntimeComp) {
      // Quiet neutral loading state — no fabricated progress.
      return (
        <div className="game-canvas-wrap">
          <p className="game-instructions" role="status">
            LOADING THE CHALLENGE…
          </p>
        </div>
      );
    }
    return (
      <div className="game-canvas-wrap game-canvas-planning">
        <RuntimeComp
          config={config}
          onWin={handleGameWin}
          onLose={handleGameLose}
          quizShowing={quizShowingRef.current}
        />
      </div>
    );
  };

  const renderQuiz = () => {
    const answered = selectedOption !== null;
    return (
      <div className="game-canvas-wrap">
        <div className="game-quiz-panel active">
          <p className="game-quiz-question">{config.quizQuestion}</p>
          <div className="game-quiz-answers">
            {config.quizOptions.map((opt, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrectAnswer = idx === config.quizCorrectIndex;
              const cls = [
                'game-quiz-answer',
                answered && isCorrectAnswer ? 'correct' : '',
                answered && isSelected && !isCorrectAnswer ? 'wrong' : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={idx}
                  type="button"
                  className={cls}
                  onClick={() => handleAnswer(idx)}
                  disabled={answered}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {answerResult === 'correct' && (
            <div className="game-quiz-feedback show-correct">
              Correct — the badge is yours.
            </div>
          )}
          {answerResult === 'wrong' && (
            <>
              <div className="game-quiz-feedback show-wrong">
                Not quite — the correct answer is highlighted. Re-run the
                challenge to claim the badge.
              </div>
              <button
                type="button"
                className="game-quiz-retry"
                onClick={retryGame}
                data-modal-focus
              >
                RETRY GAME
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderSuccess = () => (
    <div className="game-success active">
      {/* v5.1.10: engraved medallion with ray burst + ribbon. The old
         .game-success-badge is replaced by a layered medallion only for
         grid games; non-grid games keep their original simpler badge.
         v5.1.15: match games (Wooden Match) get the medallion treatment
         too, since their flow ends in the same direct-award path. */}
      {config.type === 'grid' || config.type === 'spike' || config.type === 'match' ? (
        <div className="game-medallion" aria-hidden="true">
          <div className="game-medallion-rays" />
          <div className="game-medallion-ring-outer" />
          <div className="game-medallion-ring-inner" />
          <div className="game-medallion-face">
            <TsIcon icon={successBadgeIcon} className="ts-icon-lg" />
          </div>
          {successBadgeTitle && (
            <div className="game-medallion-ribbon">
              <span>{successBadgeTitle.toUpperCase()}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="game-success-badge">
          <TsIcon icon={successBadgeIcon} className="ts-icon-lg" />
        </div>
      )}
      <div className="game-success-eyebrow">
        {config.type === 'grid'
          ? 'TOWN LAYOUT COMPLETE'
          : config.type === 'spike'
            ? 'LINE COMPLETE'
            : config.type === 'match'
              ? 'STATION RELIT'
              : 'BADGE EARNED'}
      </div>
      <h3 className="game-success-title">{config.successTitle}</h3>
      <p className="game-success-msg">{config.successMsg}</p>
      <div className="game-success-btns">
        <button type="button" className="game-start-btn" onClick={onClose} data-modal-focus>
          CONTINUE TO TALE
        </button>
      </div>
    </div>
  );

  const renderFail = () => {
    // v5.1.16: failure copy is now game-aware. The original draft
    // hardcoded W.A. Lager grid language and assumed every fail came
    // from running out of time. Both Packer (spike) and Wooden Match
    // (match) can also fail from running out of mistakes, and neither
    // is a "grid". Branch by config.type to match renderSuccess.
    const failMsg =
      config.type === 'grid'
        ? 'The town plan isn\'t set yet — give it another pass.'
        : config.type === 'spike'
          ? 'The line isn\'t complete yet — give it another pass.'
          : config.type === 'match'
            ? 'The station is still dark — give it another pass.'
            : 'The challenge isn\'t complete yet — give it another pass.';
    // UI-v6.7A — themed fail emblem (dimmed plate + the game's own icon)
    // replaces the bare ○ glyph, with a per-game eyebrow line. Buttons and
    // handlers are unchanged: retryGame keeps its attempt/analytics
    // semantics, SKIP still closes.
    const theme = SHELL_THEMES[config.type] ?? DEFAULT_THEME;
    return (
      <div className="game-fail active">
        <div className="game-fail-emblem" aria-hidden="true">
          <TsIcon icon={theme.icon} className="ts-icon-lg" />
        </div>
        <div className="game-fail-eyebrow">{theme.failEyebrow}</div>
        <h3 className="game-fail-title">NOT QUITE</h3>
        <p className="game-fail-msg">{failMsg}</p>
        <div className="game-success-btns">
          <button type="button" className="game-start-btn" onClick={retryGame} data-modal-focus>
            TRY AGAIN
          </button>
          <button type="button" className="game-success-story-btn" onClick={onClose}>
            SKIP
          </button>
        </div>
      </div>
    );
  };

  // PUBLIC-v7.4B.P.28e (CP2 correction §1) — while the game dialog is
  // open it owns the viewport: the underlying Tale document must not
  // scroll behind it. The Tale's scroll position is captured on mount
  // and restored after Exit/close, so leaving the game returns the
  // reader exactly where they were. Game logic is untouched — this
  // effect only locks/unlocks the background document.
  // GAME.8B — keep keyboard context inside the dialog across phase
  // transitions (BEGIN unmounts, fail/success panels swap in, the
  // lazy runtime mounts). Two postures, both firing once per
  // transition (deps), never per render:
  //   terminal phases (success/fail/quiz) — the panel content is
  //     wholly replaced, so focus MOVES to the new primary CTA even
  //     if the always-present EXIT still held a valid focus;
  //   intro/playing/loading — gentle: only recover focus that was
  //     LOST (unmounted control → body), never steal a control the
  //     user deliberately reached (e.g. mid-game tabbing).
  // Unmount restoration is the hook's job, not this effect's.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const terminal = phase === 'success' || phase === 'fail' || phase === 'quiz';
    if (!terminal) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && root.contains(active)) return;
    }
    focusModalEntry(root);
  }, [phase, runtimeLoad, rootRef]);

  useEffect(() => {
    const savedScrollY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      // Restore after the unmount frame settles — an immediate scrollTo
      // can be overridden by the browser's post-unmount focus/layout pass.
      requestAnimationFrame(() => {
        window.scrollTo(0, savedScrollY);
        setTimeout(() => window.scrollTo(0, savedScrollY), 60);
      });
    };
  }, []);

  return (
    <div
      id="game-overlay"
      className="active"
      role="dialog"
      aria-modal="true"
      // GAME.8B — the dialog is named by its real visible title
      // heading (preferred over aria-label); tabIndex=-1 lets the
      // container itself take focus in states with no actionable
      // control, without entering the Tab order.
      aria-labelledby="game-overlay-title"
      ref={rootRef}
      tabIndex={-1}
    >
      <div className="game-header">
        <h2 className="game-title" id="game-overlay-title">{definition.title}</h2>
        <button
          type="button"
          className="game-close"
          onClick={onClose}
          aria-label="Close challenge"
        >
          EXIT
        </button>
      </div>

      {phase === 'intro'   && renderIntro()}
      {phase === 'playing' && renderPlaying()}
      {phase === 'quiz'    && renderQuiz()}
      {phase === 'success' && renderSuccess()}
      {phase === 'fail'    && renderFail()}
    </div>
  );
}
