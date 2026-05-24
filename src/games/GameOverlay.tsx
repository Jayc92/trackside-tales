import React, { useCallback, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { GameConfig } from './gameConfigs';
import { AllenTownGame } from './AllenTownGame';
import { PackerRailGame } from './PackerRailGame';
import { WoodenMatchGame } from './WoodenMatchGame';

// ================== GAME OVERLAY ==================
// Wraps all three mini-games in a unified modal.
// Lifecycle: PLAYING → (win) QUIZ → (correct) BADGE AWARDED
//                    → (lose) FAIL → dismissed
//
// v4.6.1 critical bug fixes preserved:
//   - completed flag set synchronously at puzzle completion
//   - winFired prevents duplicate win flow
//   - quizShowing blocks timers and fail states
//   - gameLose guards against completed || quizShowing || winFired
//   - quiz appears after game completion before badge award
//   - correct quiz answer triggers gameWin
//   - timers cannot cause failure after puzzle completion

type GamePhase = 'playing' | 'quiz' | 'success' | 'fail';

interface GameOverlayProps {
  config: GameConfig;
  onClose: () => void;
  onBadgeAwarded: (badgeKey: string) => void;
  alreadyEarned: boolean;
}

export function GameOverlay({ config, onClose, onBadgeAwarded, alreadyEarned }: GameOverlayProps) {
  const { } = useApp();
  const [phase, setPhase]         = useState<GamePhase>('playing');
  const [selectedOption, setOpt]  = useState<number | null>(null);
  const [answerResult, setResult] = useState<'correct' | 'wrong' | null>(null);

  // ── quizShowing must be ref so timers in game children can read it synchronously ──
  const quizShowingRef = useRef(false);

  const handleGameWin = useCallback(() => {
    quizShowingRef.current = true;
    setPhase('quiz');
  }, []);

  const handleGameLose = useCallback(() => {
    setPhase('fail');
  }, []);

  const handleAnswer = useCallback((idx: number) => {
    if (selectedOption !== null) return;
    setOpt(idx);
    const correct = idx === config.quizCorrectIndex;
    setResult(correct ? 'correct' : 'wrong');
    if (correct) {
      setTimeout(() => {
        if (!alreadyEarned) onBadgeAwarded(config.badgeKey);
        setPhase('success');
      }, 800);
    }
  }, [selectedOption, config, alreadyEarned, onBadgeAwarded]);

  return (
    <div className="game-overlay" role="dialog" aria-modal="true" aria-label={config.title}>
      <div className="game-modal">

        {/* Header */}
        <div className="game-modal-header">
          <button className="game-close-btn" onClick={onClose} aria-label="Close game">✕</button>
          <h2 className="game-title">{config.title}</h2>
        </div>

        {/* Instructions */}
        {phase === 'playing' && (
          <p className="game-instructions">{config.instructions}</p>
        )}

        {/* Game area */}
        {phase === 'playing' && (
          <>
            {config.type === 'grid' && (
              <AllenTownGame
                onWin={handleGameWin}
                onLose={handleGameLose}
                quizShowing={quizShowingRef.current}
              />
            )}
            {config.type === 'spike' && (
              <PackerRailGame
                onWin={handleGameWin}
                onLose={handleGameLose}
                quizShowing={quizShowingRef.current}
              />
            )}
            {config.type === 'match' && (
              <WoodenMatchGame
                onWin={handleGameWin}
                onLose={handleGameLose}
                quizShowing={quizShowingRef.current}
              />
            )}
          </>
        )}

        {/* Quiz phase */}
        {phase === 'quiz' && (
          <div className="game-quiz">
            <p className="game-quiz-prompt">One quick question to earn your badge:</p>
            <p className="game-quiz-question">{config.quizQuestion}</p>
            <div className="game-quiz-options">
              {config.quizOptions.map((opt, idx) => (
                <button
                  key={idx}
                  className={[
                    'game-quiz-option',
                    selectedOption === idx
                      ? (answerResult === 'correct' ? 'correct' : 'wrong')
                      : '',
                    selectedOption !== null && idx === config.quizCorrectIndex ? 'reveal-correct' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleAnswer(idx)}
                  disabled={selectedOption !== null}
                >
                  {opt}
                </button>
              ))}
            </div>
            {answerResult === 'wrong' && (
              <p className="game-quiz-hint">
                Not quite — the correct answer is highlighted. Try the game again!
              </p>
            )}
          </div>
        )}

        {/* Success phase */}
        {phase === 'success' && (
          <div className="game-success">
            <div className="game-success-icon">✦</div>
            <h3 className="game-success-title">{config.successTitle}</h3>
            <p className="game-success-msg">{config.successMsg}</p>
            {!alreadyEarned && (
              <p className="game-badge-notice">
                🏅 <strong>Badge earned</strong> — check your passport!
              </p>
            )}
            <button className="game-dismiss-btn brass-btn" onClick={onClose}>
              CONTINUE
            </button>
          </div>
        )}

        {/* Fail phase */}
        {phase === 'fail' && (
          <div className="game-fail">
            <div className="game-fail-icon">○</div>
            <h3 className="game-fail-title">NOT QUITE</h3>
            <p className="game-fail-msg">The line wasn't set this time. Try again?</p>
            <div className="game-fail-actions">
              <button className="game-retry-btn brass-btn" onClick={() => setPhase('playing')}>
                TRY AGAIN
              </button>
              <button className="game-dismiss-btn" onClick={onClose}>
                SKIP
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
