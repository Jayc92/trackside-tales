import React, { useCallback, useEffect, useRef, useState } from 'react';

// ================== WOODEN MATCH STRIKE GAME ==================
// Swipe across the strike strip to light matches.
// Light all 5 station lamps to win.
// v4.6.1 guards preserved: completed, winFired, quizShowing.

const LAMPS_NEEDED = 5;
const STRIKE_ZONE_PX = 80;  // minimum swipe distance to count as a strike
const COOLDOWN_MS   = 800;  // between valid strikes

interface WoodenMatchGameProps {
  onWin: () => void;
  onLose: () => void;
  quizShowing: boolean;
}

export function WoodenMatchGame({ onWin, onLose, quizShowing }: WoodenMatchGameProps) {
  const [lamps, setLamps]     = useState(0);
  const [isLit, setIsLit]     = useState(false);  // match flame showing
  const [strikes, setStrikes] = useState(0);
  const [attempts, setAttempts] = useState(0);

  const completedRef   = useRef(false);
  const winFiredRef    = useRef(false);
  const cooldownRef    = useRef(false);
  const dragStartX     = useRef<number | null>(null);
  const stripRef       = useRef<HTMLDivElement>(null);

  const triggerWin = useCallback(() => {
    if (winFiredRef.current) return;
    winFiredRef.current = true;
    onWin();
  }, [onWin]);

  const doStrike = useCallback(() => {
    if (completedRef.current || winFiredRef.current || quizShowing || cooldownRef.current) return;
    cooldownRef.current = true;
    setIsLit(true);
    setStrikes((s) => s + 1);
    setAttempts((a) => a + 1);

    // Light next lamp
    setLamps((l) => {
      const next = l + 1;
      if (next >= LAMPS_NEEDED) {
        completedRef.current = true;
        setTimeout(triggerWin, 400);
      }
      return Math.min(next, LAMPS_NEEDED);
    });

    // Extinguish flame after a beat
    setTimeout(() => {
      setIsLit(false);
      cooldownRef.current = false;
    }, COOLDOWN_MS);
  }, [quizShowing, triggerWin]);

  // Touch/pointer handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    const dx = e.clientX - dragStartX.current;
    if (Math.abs(dx) >= STRIKE_ZONE_PX) {
      dragStartX.current = null;
      doStrike();
    }
  }, [doStrike]);

  const handlePointerUp = useCallback(() => {
    dragStartX.current = null;
  }, []);

  return (
    <div className="game-content game-match">
      {/* Station lamps */}
      <div className="match-lamps" aria-label="Station lamps">
        {Array.from({ length: LAMPS_NEEDED }, (_, i) => (
          <div
            key={i}
            className={`match-lamp${i < lamps ? ' lit' : ''}`}
            aria-label={i < lamps ? 'Lamp lit' : 'Lamp dark'}
          >
            <div className="match-lamp-body" />
            {i < lamps && <div className="match-lamp-glow" />}
          </div>
        ))}
      </div>

      {/* Match flame indicator */}
      <div className={`match-flame-indicator${isLit ? ' lit' : ''}`} aria-hidden="true">
        <div className="match-flame" />
        <div className="match-stick" />
      </div>

      {/* Strike strip */}
      <div
        ref={stripRef}
        className="match-strike-strip"
        role="button"
        aria-label="Strike strip — swipe to light a match"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="match-strike-texture" />
        <span className="match-strike-label">← SWIPE TO STRIKE →</span>
      </div>

      <div className="match-progress">
        {lamps}/{LAMPS_NEEDED} lamps lit
      </div>
    </div>
  );
}
