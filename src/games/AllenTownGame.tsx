import React, { useCallback, useEffect, useRef, useState } from 'react';

// ================== ALLEN TOWN GRID GAME ==================
// Tap the grid lots in sequence to lay Allen's 1762 street plan.
// v4.6.1 bug fixes preserved:
//   - completed flag set synchronously at puzzle completion
//   - winFired prevents duplicate win flow
//   - quizShowing blocks timers and fail states
//   - gameLose guards against completed || quizShowing || winFired

const GRID_COLS = 7;
const GRID_ROWS = 6;
const TOTAL_CELLS = GRID_COLS * GRID_ROWS;
const TARGET_COUNT = 12; // number of lots to place

function buildSequence(): number[] {
  // Generate a winding path through the grid
  const used = new Set<number>();
  const seq: number[] = [];
  let row = 0;
  let col = 0;
  while (seq.length < TARGET_COUNT) {
    const idx = row * GRID_COLS + col;
    if (!used.has(idx)) {
      seq.push(idx);
      used.add(idx);
    }
    col++;
    if (col >= GRID_COLS) { col = 0; row++; }
    if (row >= GRID_ROWS) break;
  }
  return seq;
}

interface AllenTownGameProps {
  onWin: () => void;
  onLose: () => void;
  quizShowing: boolean;
}

export function AllenTownGame({ onWin, onLose, quizShowing }: AllenTownGameProps) {
  const [sequence] = useState(() => buildSequence());
  const [step, setStep] = useState(0);
  const [placed, setPlaced] = useState<Set<number>>(new Set());
  const [wrongCells, setWrongCells] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(30);

  const completedRef = useRef(false);
  const winFiredRef  = useRef(false);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const triggerWin = useCallback(() => {
    if (winFiredRef.current) return;
    winFiredRef.current = true;
    stopTimer();
    onWin();
  }, [onWin, stopTimer]);

  const triggerLose = useCallback(() => {
    if (completedRef.current || quizShowing || winFiredRef.current) return;
    stopTimer();
    onLose();
  }, [quizShowing, onLose, stopTimer]);

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (completedRef.current || quizShowing) return;
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          triggerLose();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return stopTimer;
  }, [quizShowing, triggerLose, stopTimer]);

  const handleCellTap = useCallback((idx: number) => {
    if (completedRef.current || winFiredRef.current || quizShowing) return;

    if (sequence[step] === idx) {
      const newPlaced = new Set(placed);
      newPlaced.add(idx);
      setPlaced(newPlaced);
      const newStep = step + 1;
      setStep(newStep);
      if (newStep >= sequence.length) {
        // ── SYNCHRONOUSLY mark completed before calling onWin ──
        completedRef.current = true;
        triggerWin();
      }
    } else {
      // Wrong tap — flash cell
      setWrongCells((w) => new Set([...w, idx]));
      setTimeout(() => setWrongCells((w) => { const n = new Set(w); n.delete(idx); return n; }), 500);
    }
  }, [step, sequence, placed, quizShowing, triggerWin]);

  const progressPct = Math.round((step / sequence.length) * 100);

  return (
    <div className="game-content game-allen">
      <div className="game-timer-bar">
        <div className="game-timer-fill" style={{ width: `${(timeLeft / 30) * 100}%` }} />
      </div>
      <div className="game-progress-label">{step}/{sequence.length} lots placed</div>

      <div
        className="allen-grid"
        style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)` }}
        aria-label="Allentown street grid"
      >
        {Array.from({ length: TOTAL_CELLS }, (_, idx) => {
          const isPlaced  = placed.has(idx);
          const isPulsing = sequence[step] === idx && !completedRef.current;
          const isWrong   = wrongCells.has(idx);
          return (
            <button
              key={idx}
              className={[
                'allen-cell',
                isPlaced  ? 'placed'  : '',
                isPulsing ? 'pulsing' : '',
                isWrong   ? 'wrong'   : '',
              ].filter(Boolean).join(' ')}
              onClick={() => handleCellTap(idx)}
              aria-label={`Lot ${idx + 1}`}
            />
          );
        })}
      </div>

      <div className="game-progress-bar">
        <div className="game-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
    </div>
  );
}
