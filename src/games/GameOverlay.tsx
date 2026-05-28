import React, { useCallback, useRef, useState } from 'react';
import { GameConfig } from './gameConfigs';
import { AllenTownPlanningGame } from './AllenTownPlanningGame';
import { PackerRouteGame } from './PackerRouteGame';
import { WoodenStationGame } from './WoodenStationGame';
import { TsIcon } from '../components/TsIcon';
import { logEvent, flushEvents } from '../services/eventLogger';

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

type GamePhase = 'intro' | 'playing' | 'quiz' | 'success' | 'fail';

interface GameOverlayProps {
  config: GameConfig;
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
}

export function GameOverlay({
  config,
  onClose,
  onBadgeAwarded,
  alreadyEarned,
  successBadgeIcon = 'town-seal',
  successBadgeTitle,
  guestId,
}: GameOverlayProps) {
  const [phase, setPhase] = useState<GamePhase>('intro');
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
  const handleGameWin = useCallback(() => {
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
      return;
    }
    quizShowingRef.current = true;
    setPhase('quiz');
    // The quiz branch is dead code today (no current GameConfig has a
    // non-grid/spike/match type) but stays for type safety. We do NOT
    // emit game_completed here — completion is the badge-grant moment
    // in handleAnswer below, not the moment we route to the quiz.
  }, [config, alreadyEarned, onBadgeAwarded, emitGameCompleted]);

  const handleGameLose = useCallback(() => {
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
  }, [config, guestId]);

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
      }, 700);
    }
    // Wrong answer: stay on quiz panel, show the correct one highlighted,
    // and surface the RETRY GAME button (handled in render below).
  }, [selectedOption, config, alreadyEarned, onBadgeAwarded, emitGameCompleted]);

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
  const renderIntro = () => (
    <div className="game-canvas-wrap">
      <p className="game-instructions">{config.instructions}</p>
      <button
        type="button"
        className="game-start-btn"
        onClick={handleBegin}
      >
        BEGIN
      </button>
    </div>
  );

  const renderPlaying = () => {
    if (config.type === 'grid') {
      return (
        <div className="game-canvas-wrap game-canvas-planning">
          <AllenTownPlanningGame
            config={config}
            onWin={handleGameWin}
            onLose={handleGameLose}
            quizShowing={quizShowingRef.current}
          />
        </div>
      );
    }
    if (config.type === 'spike') {
      // v5.1.14: Packer Pilsner sequenced rail-building puzzle.
      return (
        <div className="game-canvas-wrap game-canvas-planning">
          <PackerRouteGame
            config={config}
            onWin={handleGameWin}
            onLose={handleGameLose}
            quizShowing={quizShowingRef.current}
          />
        </div>
      );
    }
    if (config.type === 'match') {
      // v5.1.15: Wooden Match preservation-decision puzzle.
      return (
        <div className="game-canvas-wrap game-canvas-planning">
          <WoodenStationGame
            config={config}
            onWin={handleGameWin}
            onLose={handleGameLose}
            quizShowing={quizShowingRef.current}
          />
        </div>
      );
    }
    // Defensive fallback for any future unwired type.
    return (
      <div className="game-canvas-wrap">
        <p className="game-instructions">
          This challenge is on the way — coming soon.
        </p>
        <button type="button" className="game-start-btn" onClick={onClose}>
          CLOSE
        </button>
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
        <button type="button" className="game-start-btn" onClick={onClose}>
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
    return (
      <div className="game-fail active">
        <div className="game-fail-mark">○</div>
        <h3 className="game-fail-title">NOT QUITE</h3>
        <p className="game-fail-msg">{failMsg}</p>
        <div className="game-success-btns">
          <button type="button" className="game-start-btn" onClick={retryGame}>
            TRY AGAIN
          </button>
          <button type="button" className="game-success-story-btn" onClick={onClose}>
            SKIP
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      id="game-overlay"
      className="active"
      role="dialog"
      aria-modal="true"
      aria-label={config.title}
    >
      <div className="game-header">
        <h2 className="game-title">{config.title}</h2>
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
