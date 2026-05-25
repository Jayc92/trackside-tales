import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameConfig } from './gameConfigs';
import { TsIcon } from '../components/TsIcon';

// =====================================================================
// W.A. LAGER PLANNING GAME — v5.1.3 → v5.1.10 rollup
// ---------------------------------------------------------------------
// History of this file:
//   v5.1.3  parchment map background + 5 named drop zones
//   v5.1.4  5-stat HUD strip (PROGRESS / TIME / CLUE POINTS / MOVES / BADGE)
//   v5.1.5  side rail of element cards with tap-to-place
//   v5.1.6  pointer-based drag-and-drop
//   v5.1.7  Tale Logic Clues panel + lantern (now wired)
//   v5.1.8  HINT + RESET action bar (auto-commit drop, no CONFIRM)
//   v5.1.9  Inline unlock-quiz interleaved with placement,
//           Next Unlock preview card
//   v5.1.10 Premium engraved-medallion success state (in polish.css)
//
// Game loop (revised in v5.1.7+):
//   1. The first element (MAIN STREET) starts unlocked.
//   2. Tap a locked element → inline quiz appears → correct answer
//      unlocks the element + ticks CLUE POINTS; wrong answer costs
//      one MOVE and lets the player retry.
//   3. Drag or tap an unlocked element onto a map zone. Auto-commit
//      on drop. Wrong placement costs one MOVE and flashes the zone red.
//   4. When all 5 elements are placed correctly → onWin (the badge is
//      awarded by GameOverlay because the unlock-quiz is the quiz now,
//      and the post-puzzle quiz phase is skipped for grid games).
//   5. MOVES → 0 or TIME → 0 → onLose.
//
// HARD RULES PRESERVED:
//   - same { onWin, onLose, quizShowing } prop contract as before
//   - no badge-key, localStorage-key, Supabase, scan, or QR changes
//   - AllenTownGame.tsx (the v5.1.2 tap-in-sequence game) is still on
//     disk untouched as the rollback fallback
// =====================================================================


// ── Game tuning ──────────────────────────────────────────────────────
const GAME_DURATION_SEC = 90;
const STARTING_MOVES    = 7;
const STARTING_HINTS    = 2;


// ── Element + zone definitions ───────────────────────────────────────
interface MapZone {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  correctElement: string;
}

interface PlaceableElement {
  id: string;
  label: string;
  blurb: string;
  /** v5.1.7+: true if this element does not require a quiz to unlock. */
  startsUnlocked?: boolean;
}

const ZONES: MapZone[] = [
  { id: 'coal-yard',     label: 'COAL YARD',     x: 32, y: 10, width: 26, height: 16, correctElement: 'coal-yard' },
  { id: 'bridge',        label: 'BRIDGE',        x:  4, y: 44, width: 22, height: 14, correctElement: 'bridge' },
  { id: 'depot',         label: 'DEPOT',         x: 30, y: 65, width: 22, height: 16, correctElement: 'depot' },
  { id: 'main-street',   label: 'MAIN STREET',   x: 38, y: 38, width: 28, height: 14, correctElement: 'main-street' },
  { id: 'freight-house', label: 'FREIGHT HOUSE', x: 72, y: 30, width: 24, height: 16, correctElement: 'freight-house' },
];

// MAIN STREET is at the top of the rail and starts unlocked — it's the
// town's spine, the most obvious historical reference point, and lets
// the player make a placement immediately.
const ELEMENTS: PlaceableElement[] = [
  { id: 'main-street',   label: 'MAIN STREET',   blurb: 'The town spine — runs through center.',          startsUnlocked: true },
  { id: 'coal-yard',     label: 'COAL YARD',     blurb: 'Receives shipments from upper-valley mines.' },
  { id: 'depot',         label: 'DEPOT',         blurb: 'Built near the central river crossing.' },
  { id: 'freight-house', label: 'FREIGHT HOUSE', blurb: 'Serves the eastbound line.' },
  { id: 'bridge',        label: 'BRIDGE',        blurb: 'Spans Jordan Creek to the west.' },
];


// ── Props ────────────────────────────────────────────────────────────
interface AllenTownPlanningGameProps {
  config: GameConfig;
  onWin: () => void;
  onLose: () => void;
  quizShowing: boolean;
}


export function AllenTownPlanningGame({ config, onWin, onLose, quizShowing }: AllenTownPlanningGameProps) {
  // ── State ──────────────────────────────────────────────────────────
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [movesLeft, setMovesLeft]   = useState(STARTING_MOVES);
  const [timeLeft, setTimeLeft]     = useState(GAME_DURATION_SEC);
  const [hintsLeft, setHintsLeft]   = useState(STARTING_HINTS);

  // v5.1.7+ unlock state: ids of elements that have passed their quiz
  // (or started unlocked).
  const [unlocked, setUnlocked] = useState<Set<string>>(
    () => new Set(ELEMENTS.filter((e) => e.startsUnlocked).map((e) => e.id)),
  );

  // Tap-to-place: which UNLOCKED element is armed for the next zone tap.
  const [armedElementId, setArmedElementId] = useState<string | null>(null);

  // Drag state.
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [hoverZoneId, setHoverZoneId] = useState<string | null>(null);

  // Brief flash states.
  const [invalidZoneId, setInvalidZoneId] = useState<string | null>(null);
  const [hintZoneId, setHintZoneId]       = useState<string | null>(null);

  // v5.1.7+: active unlock quiz (id of the element being asked about).
  const [activeQuizElementId, setActiveQuizElementId] = useState<string | null>(null);
  const [quizSelected, setQuizSelected]   = useState<number | null>(null);
  const [quizResult, setQuizResult]       = useState<'correct' | 'wrong' | null>(null);

  // ── Refs preserved from the v5.1.2 lineage ─────────────────────────
  const completedRef = useRef(false);
  const winFiredRef  = useRef(false);
  const loseFiredRef = useRef(false);
  const dragStateRef = useRef<{ elementId: string | null; hoverZoneId: string | null }>({
    elementId: null,
    hoverZoneId: null,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);


  // ── Lose / Win triggers ────────────────────────────────────────────
  const triggerLose = useCallback(() => {
    if (completedRef.current || quizShowing || winFiredRef.current || loseFiredRef.current) return;
    loseFiredRef.current = true;
    stopTimer();
    onLose();
  }, [quizShowing, onLose, stopTimer]);

  const triggerWin = useCallback(() => {
    if (winFiredRef.current) return;
    winFiredRef.current = true;
    completedRef.current = true;
    stopTimer();
    onWin();
  }, [onWin, stopTimer]);


  // ── Countdown timer ────────────────────────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (completedRef.current || quizShowing) return;
      setTimeLeft((t) => {
        if (t <= 1) {
          stopTimer();
          triggerLose();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return stopTimer;
  }, [quizShowing, triggerLose, stopTimer]);


  // ── Placement logic ────────────────────────────────────────────────
  const attemptPlacement = useCallback((elementId: string, zoneId: string) => {
    if (completedRef.current || winFiredRef.current || loseFiredRef.current) return;
    if (placements[zoneId]) return;
    if (!unlocked.has(elementId)) return;
    if (Object.values(placements).includes(elementId)) return;

    const zone = ZONES.find((z) => z.id === zoneId);
    if (!zone) return;

    if (zone.correctElement === elementId) {
      const next = { ...placements, [zoneId]: elementId };
      setPlacements(next);
      setArmedElementId(null);

      if (Object.keys(next).length >= ZONES.length) {
        completedRef.current = true;
        window.setTimeout(triggerWin, 400);
      }
    } else {
      setInvalidZoneId(zoneId);
      window.setTimeout(() => setInvalidZoneId(null), 450);
      setMovesLeft((m) => {
        const nextMoves = Math.max(0, m - 1);
        if (nextMoves <= 0) window.setTimeout(triggerLose, 480);
        return nextMoves;
      });
      setArmedElementId(null);
    }
  }, [placements, unlocked, triggerWin, triggerLose]);


  // ── Tap-to-place / open-quiz ───────────────────────────────────────
  const handleElementTap = useCallback((elementId: string) => {
    if (completedRef.current || quizShowing) return;
    if (Object.values(placements).includes(elementId)) return;

    if (!unlocked.has(elementId)) {
      // Open the inline quiz for this element.
      setActiveQuizElementId(elementId);
      setQuizSelected(null);
      setQuizResult(null);
      setArmedElementId(null);
      return;
    }
    // Toggle armed for placement.
    setArmedElementId((cur) => (cur === elementId ? null : elementId));
  }, [placements, unlocked, quizShowing]);

  const handleZoneTap = useCallback((zoneId: string) => {
    if (!armedElementId) return;
    attemptPlacement(armedElementId, zoneId);
  }, [armedElementId, attemptPlacement]);


  // ── Pointer drag ───────────────────────────────────────────────────
  const hitTestZone = (x: number, y: number): string | null => {
    const nodes = document.querySelectorAll<HTMLElement>('.allen-map-zone:not(.filled)');
    for (const node of Array.from(nodes)) {
      const r = node.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return node.dataset.zoneId ?? null;
      }
    }
    return null;
  };

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, elementId: string) => {
    if (completedRef.current || quizShowing) return;
    if (!unlocked.has(elementId)) return;     // can't drag locked
    if (Object.values(placements).includes(elementId)) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragStateRef.current = { elementId, hoverZoneId: null };
    setDraggingElementId(elementId);
    setDragPos({ x: e.clientX, y: e.clientY });
    setArmedElementId(null);
  }, [placements, unlocked, quizShowing]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.elementId) return;
    setDragPos({ x: e.clientX, y: e.clientY });
    const zoneId = hitTestZone(e.clientX, e.clientY);
    if (zoneId !== dragStateRef.current.hoverZoneId) {
      dragStateRef.current.hoverZoneId = zoneId;
      setHoverZoneId(zoneId);
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const elementId = dragStateRef.current.elementId;
    if (!elementId) return;
    const zoneId = hitTestZone(e.clientX, e.clientY);
    dragStateRef.current = { elementId: null, hoverZoneId: null };
    setDraggingElementId(null);
    setDragPos(null);
    setHoverZoneId(null);
    if (zoneId) attemptPlacement(elementId, zoneId);
  }, [attemptPlacement]);


  // ── Quiz handlers ──────────────────────────────────────────────────
  const activeQuiz = activeQuizElementId
    ? config.unlockQuestions?.find((q) => q.elementId === activeQuizElementId) ?? null
    : null;

  const handleQuizAnswer = useCallback((idx: number) => {
    if (quizSelected !== null || !activeQuiz) return;
    setQuizSelected(idx);
    const isCorrect = idx === activeQuiz.correctIndex;
    setQuizResult(isCorrect ? 'correct' : 'wrong');
    if (isCorrect) {
      // Brief beat so the green highlight reads, then unlock + close.
      window.setTimeout(() => {
        setUnlocked((prev) => {
          const next = new Set(prev);
          next.add(activeQuiz.elementId);
          return next;
        });
        setActiveQuizElementId(null);
        setQuizSelected(null);
        setQuizResult(null);
      }, 700);
    } else {
      // Wrong → cost 1 move; player can retry the same question.
      setMovesLeft((m) => {
        const nextMoves = Math.max(0, m - 1);
        if (nextMoves <= 0) {
          window.setTimeout(triggerLose, 480);
        }
        return nextMoves;
      });
      // Allow retry after a short pause.
      window.setTimeout(() => {
        setQuizSelected(null);
        setQuizResult(null);
      }, 1200);
    }
  }, [quizSelected, activeQuiz, triggerLose]);

  const closeQuiz = useCallback(() => {
    setActiveQuizElementId(null);
    setQuizSelected(null);
    setQuizResult(null);
  }, []);


  // ── HINT + RESET (v5.1.8) ─────────────────────────────────────────
  const handleHint = useCallback(() => {
    if (hintsLeft <= 0) return;
    // Pulse the next correct zone for whichever element is armed (or
    // pick the next still-unfilled zone if nothing is armed).
    let zoneId: string | null = null;
    if (armedElementId) {
      const z = ZONES.find((z) => z.correctElement === armedElementId);
      zoneId = z?.id ?? null;
    } else {
      const remaining = ZONES.find((z) => !placements[z.id]);
      zoneId = remaining?.id ?? null;
    }
    if (!zoneId) return;
    setHintZoneId(zoneId);
    setHintsLeft((h) => h - 1);
    window.setTimeout(() => setHintZoneId(null), 2400);
  }, [hintsLeft, armedElementId, placements]);

  const handleReset = useCallback(() => {
    setPlacements({});
    setArmedElementId(null);
    setInvalidZoneId(null);
    setHintZoneId(null);
    // Unlocked elements stay unlocked; quizzes already answered stay
    // answered. Moves and time stay as they are — this is a placement
    // do-over, not a full game restart.
  }, []);


  // ── Derived values ─────────────────────────────────────────────────
  const placed = Object.keys(placements).length;
  const cluesEarned = Math.max(
    0,
    unlocked.size - ELEMENTS.filter((e) => e.startsUnlocked).length,
  );
  const totalCluesAvailable = config.unlockQuestions?.length ?? 0;
  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  const timeWarn  = timeLeft  <= 15 && timeLeft  > 0;
  const movesWarn = movesLeft <= 2  && movesLeft > 0;

  // The next locked element (for Next Unlock preview)
  const nextLocked = ELEMENTS.find(
    (el) => !unlocked.has(el.id) && !Object.values(placements).includes(el.id),
  );

  const logicClues = config.logicClues ?? [];


  return (
    <div className="allen-planning-game">

      {/* HUD strip ─────────────────────────────────────────────── */}
      <div className="game-hud" role="status" aria-live="polite">
        <div className="game-hud-stat">
          <div className="game-hud-label">PROGRESS</div>
          <div className="game-hud-val">{placed}/{ZONES.length}</div>
        </div>
        <div className="game-hud-stat">
          <div className="game-hud-label">TIME</div>
          <div className={`game-hud-val${timeWarn ? ' game-time-warn' : ''}`}>{fmt(timeLeft)}</div>
        </div>
        <div className="game-hud-stat">
          <div className="game-hud-label">CLUE POINTS</div>
          <div className="game-hud-val">{cluesEarned}/{totalCluesAvailable}</div>
        </div>
        <div className="game-hud-stat">
          <div className="game-hud-label">MOVES</div>
          <div className={`game-hud-val${movesWarn ? ' game-time-warn' : ''}`}>{movesLeft}</div>
        </div>
        <div className="game-hud-stat">
          <div className="game-hud-label">BADGE</div>
          <div className="game-hud-val">1/2</div>
        </div>
      </div>

      {/* Map + zones ───────────────────────────────────────────── */}
      <div className="allen-map-wrap" aria-label="Allen Town survey map">
        <svg
          className="allen-map-svg"
          viewBox="0 0 400 280"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <pattern id="allenParchGrid" x="0" y="0" width="40" height="28" patternUnits="userSpaceOnUse">
              <rect width="40" height="28" fill="none" stroke="#6b4e22" strokeWidth="0.4" opacity="0.22" />
            </pattern>
            <linearGradient id="allenParchBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3a2810" />
              <stop offset="100%" stopColor="#1f1408" />
            </linearGradient>
          </defs>
          <rect width="400" height="280" fill="url(#allenParchBg)" />
          <rect width="400" height="280" fill="url(#allenParchGrid)" />
          <path d="M28 0 Q44 60 38 120 Q30 180 50 280" stroke="#1a3a4a" strokeWidth="11" fill="none" opacity="0.55" strokeLinecap="round" />
          <path d="M28 0 Q44 60 38 120 Q30 180 50 280" stroke="#284f60" strokeWidth="4" fill="none" opacity="0.4" strokeLinecap="round" />
          <circle cx="118" cy="40"  r="14" fill="#2a3618" opacity="0.4" />
          <circle cx="135" cy="55"  r="9"  fill="#2a3618" opacity="0.35" />
          <circle cx="105" cy="52"  r="8"  fill="#2a3618" opacity="0.3" />
          <circle cx="350" cy="240" r="11" fill="#2a3618" opacity="0.32" />
          <circle cx="365" cy="225" r="7"  fill="#2a3618" opacity="0.28" />
          <g transform="translate(370 30)" opacity="0.6">
            <circle cx="0" cy="0" r="14" fill="none" stroke="#a07808" strokeWidth="0.7" />
            <line x1="0" y1="-13" x2="0" y2="-1" stroke="#a07808" strokeWidth="1.2" />
            <polygon points="0,-16 -3,-8 3,-8" fill="#a07808" />
            <text x="0" y="22" fontSize="6" fill="#a07808" textAnchor="middle" fontFamily="serif">N</text>
          </g>
          <text x="20" y="270" fontSize="6" fill="#6b4e22" opacity="0.55" fontFamily="'Source Code Pro', monospace" letterSpacing="0.12em">
            SURVEY MAP · ALLEN TRACT · 1762
          </text>
        </svg>

        {ZONES.map((zone) => {
          const filled = !!placements[zone.id];
          const targeted = !filled && hoverZoneId === zone.id;
          const invalid  = invalidZoneId === zone.id;
          const armedAndZone = !filled && armedElementId !== null;
          const hinted = hintZoneId === zone.id;
          const cls = [
            'allen-map-zone',
            filled       ? 'filled'       : '',
            targeted     ? 'targeted'     : '',
            invalid      ? 'invalid'      : '',
            armedAndZone ? 'armed-target' : '',
            hinted       ? 'hinted'       : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={zone.id}
              type="button"
              className={cls}
              data-zone-id={zone.id}
              style={{
                left:   `${zone.x}%`,
                top:    `${zone.y}%`,
                width:  `${zone.width}%`,
                height: `${zone.height}%`,
              }}
              onClick={() => handleZoneTap(zone.id)}
              disabled={filled}
              aria-label={`${zone.label} zone${filled ? ' — placed' : ''}`}
            >
              <span className="allen-map-zone-label">{zone.label}</span>
              {filled && <span className="allen-map-zone-mark" aria-hidden="true">◈</span>}
            </button>
          );
        })}
      </div>

      {/* Action bar — v5.1.8 ─────────────────────────────────── */}
      <div className="allen-action-bar">
        <button
          type="button"
          className="allen-action-btn"
          onClick={handleHint}
          disabled={hintsLeft <= 0 || !!activeQuizElementId}
          aria-label={`Hint — ${hintsLeft} left`}
        >
          <span className="allen-action-icon" aria-hidden="true">◈</span>
          <span className="allen-action-label">HINT</span>
          <span className="allen-action-count">[{hintsLeft}]</span>
        </button>
        <button
          type="button"
          className="allen-action-btn"
          onClick={handleReset}
          disabled={placed === 0 || !!activeQuizElementId}
        >
          <span className="allen-action-icon" aria-hidden="true">↺</span>
          <span className="allen-action-label">RESET</span>
        </button>
      </div>

      {/* Quiz overlay (when active) OR element rail + clues + next ── */}
      {activeQuiz ? (
        <div className="allen-quiz-overlay">
          <div className="allen-quiz-header">
            <span className="allen-quiz-eyebrow">TALE CLUE</span>
            <button
              type="button"
              className="allen-quiz-close"
              onClick={closeQuiz}
              aria-label="Close clue"
            >
              ✕
            </button>
          </div>
          <p className="allen-quiz-question">{activeQuiz.question}</p>
          <div className="allen-quiz-options">
            {activeQuiz.options.map((opt, idx) => {
              const answered = quizSelected !== null;
              const isSelected = quizSelected === idx;
              const isCorrect = idx === activeQuiz.correctIndex;
              const cls = [
                'allen-quiz-option',
                answered && isCorrect ? 'correct' : '',
                answered && isSelected && !isCorrect ? 'wrong' : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={idx}
                  type="button"
                  className={cls}
                  onClick={() => handleQuizAnswer(idx)}
                  disabled={answered}
                >
                  <span className="allen-quiz-option-num">{idx + 1}</span>
                  <span className="allen-quiz-option-text">{opt}</span>
                </button>
              );
            })}
          </div>
          {quizResult === 'correct' && (
            <div className="allen-quiz-feedback correct">
              ✓ Correct — element unlocked.
            </div>
          )}
          {quizResult === 'wrong' && (
            <div className="allen-quiz-feedback wrong">
              Not quite — lost 1 move. Try again.
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Element rail (v5.1.5 with locked states from v5.1.7) ── */}
          <div className="allen-elements-rail-label">PLACE THESE ELEMENTS</div>
          <div className="allen-elements-rail" role="list">
            {ELEMENTS.map((el) => {
              const isPlaced  = Object.values(placements).includes(el.id);
              const isUnlocked = unlocked.has(el.id);
              const isLocked  = !isUnlocked && !isPlaced;
              const isArmed   = armedElementId === el.id;
              const isDragging = draggingElementId === el.id;
              const cls = [
                'allen-element-card',
                isPlaced   ? 'placed'   : '',
                isLocked   ? 'locked'   : '',
                isArmed    ? 'armed'    : '',
                isDragging ? 'dragging' : '',
              ].filter(Boolean).join(' ');
              return (
                <div
                  key={el.id}
                  role="listitem"
                  className={cls}
                  onPointerDown={(e) => handlePointerDown(e, el.id)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onClick={() => handleElementTap(el.id)}
                  aria-pressed={isArmed}
                  aria-disabled={isPlaced}
                >
                  <div className="allen-element-icon" aria-hidden="true">
                    {isLocked ? '◉' : '◈'}
                  </div>
                  <div className="allen-element-label">{el.label}</div>
                  <div className="allen-element-blurb">{el.blurb}</div>
                  {isPlaced && <div className="allen-element-check" aria-hidden="true">✓ PLACED</div>}
                  {isLocked && <div className="allen-element-locked" aria-hidden="true">TAP TO UNLOCK</div>}
                </div>
              );
            })}
          </div>

          {/* Helper hint under the rail */}
          <div className="allen-elements-hint">
            {armedElementId
              ? 'Tap a zone on the map to place this element.'
              : nextLocked
                ? 'Tap a locked element to answer its Tale clue.'
                : 'Tap an element to arm it, or drag it onto a zone.'}
          </div>

          {/* Logic Clues + Next Unlock — v5.1.7 + v5.1.9 ──────── */}
          <div className="allen-bottom-panels">
            <div className="allen-clues-panel">
              <div className="allen-clues-lantern" aria-hidden="true">
                <TsIcon icon="station-lantern" className="ts-icon-md" />
              </div>
              <div className="allen-clues-body">
                <div className="allen-clues-label">TALE LOGIC CLUES</div>
                <ol className="allen-clues-list">
                  {logicClues.map((c, i) => (
                    <li key={i} className="allen-clues-item">{c}</li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="allen-next-unlock">
              <div className="allen-next-unlock-label">NEXT UNLOCK</div>
              {nextLocked ? (
                <>
                  <div className="allen-next-unlock-icon" aria-hidden="true">◉</div>
                  <div className="allen-next-unlock-name">{nextLocked.label}</div>
                  <div className="allen-next-unlock-hint">
                    Answer a Tale clue to unlock.
                  </div>
                </>
              ) : (
                <>
                  <div className="allen-next-unlock-icon" aria-hidden="true">✓</div>
                  <div className="allen-next-unlock-name">ALL UNLOCKED</div>
                  <div className="allen-next-unlock-hint">
                    Place the remaining elements on the map.
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Drag ghost */}
      {draggingElementId && dragPos && (
        <div
          className="allen-drag-ghost"
          style={{ left: dragPos.x, top: dragPos.y }}
          aria-hidden="true"
        >
          ◈ {ELEMENTS.find((e) => e.id === draggingElementId)?.label}
        </div>
      )}
    </div>
  );
}
