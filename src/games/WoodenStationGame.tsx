import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameConfig } from './gameConfigs';
import { TsIcon } from '../components/TsIcon';

// =====================================================================
// WOODEN MATCH STATION — PRESERVE THE STATION LIGHT (v5.1.15)
// ---------------------------------------------------------------------
// Distinct mechanic from W.A. Lager + Packer Pilsner:
//   - W.A. Lager:    WHERE elements go    (spatial sorting on a town map)
//   - Packer:        WHEN elements happen (sequencing along a rail route)
//   - Wooden Match:  HOW heritage is kept (preservation decision per artifact)
//
// The player walks the 1868 station by lantern light. Each darkened room
// holds one heritage artifact (lantern, bar, window, floorboards, sign).
// Tap a room → a per-artifact preservation decision opens with 4 options.
// Pick the preservation-appropriate action → that room lights amber.
// Pick wrong → "THE MATCH FALTERS" + 1 mistake. Restore all 5 rooms before
// the matches run out.
//
// Reuses the AllenTownPlanningGame visual shell: same HUD, action bar,
// quiz overlay, parchment feedback. Specific to the station: the floor
// plan, the room amber-glow, the lantern motif.
//
// HARD RULES:
//   - same { config, onWin, onLose, quizShowing } prop contract
//   - badge contract unchanged — onWin only fires once all 5 are restored
//   - no badge-key, localStorage, Supabase, scan, or QR changes
//   - legacy WoodenMatchGame.tsx remains on disk untouched
// =====================================================================


// ── Game tuning ──────────────────────────────────────────────────────
const GAME_DURATION_SEC = 120;
const STARTING_MATCHES  = 4;
const STARTING_HINTS    = 1;
const SECONDS_PER_DAY   = 4;


// ── Artifact + room definitions ─────────────────────────────────────
interface StationRoom {
  id: string;
  label: string;
  artifact: string;
  /** Position on the floor-plan SVG, in % of the wrap. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Short rationale shown on the room when it's been restored. */
  restoredCaption: string;
}

const ROOMS: StationRoom[] = [
  {
    id: 'lantern',
    label: 'PLATFORM DOORWAY',
    artifact: 'BRASS LANTERN',
    x: 38, y: 5, width: 24, height: 18,
    restoredCaption: 'Lit with a fresh wick.',
  },
  {
    id: 'bar',
    label: 'WAITING ROOM',
    artifact: 'PINE BAR',
    x: 6, y: 28, width: 32, height: 22,
    restoredCaption: 'Sanded and re-varnished.',
  },
  {
    id: 'window',
    label: 'TRACKSIDE WALL',
    artifact: 'LEADED-GLASS WINDOW',
    x: 64, y: 28, width: 30, height: 22,
    restoredCaption: 'Cracks lead-sealed; glass kept.',
  },
  {
    id: 'floorboards',
    label: 'MAIN HALL',
    artifact: 'PINE FLOORBOARDS',
    x: 24, y: 54, width: 52, height: 18,
    restoredCaption: 'Waxed, sealed, footsteps preserved.',
  },
  {
    id: 'sign',
    label: 'PLATFORM',
    artifact: 'CAST-IRON SIGN',
    x: 30, y: 76, width: 40, height: 18,
    restoredCaption: 'Patina restored; original kept.',
  },
];


// ── HUD helpers ─────────────────────────────────────────────────────
const ROMAN: Record<number, string> = {
  0: '0', 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII',
};
function toRoman(n: number): string {
  return ROMAN[n] ?? String(n);
}


// ── Room icons (inline SVG, brass on currentColor) ──────────────
function LanternIcon() {
  return (
    <svg className="wm-room-icon" viewBox="0 0 40 48" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <line x1="20" y1="2"  x2="20" y2="8" />
        <path d="M12 8 L28 8 L26 12 L14 12 Z" />
        <rect x="13" y="14" width="14" height="20" />
        <line x1="13" y1="18" x2="27" y2="18" />
        <line x1="13" y1="30" x2="27" y2="30" />
        <line x1="20" y1="14" x2="20" y2="34" />
        <path d="M14 36 L26 36 L24 40 L16 40 Z" />
      </g>
      <circle className="wm-flame" cx="20" cy="24" r="3.2" fill="currentColor" />
    </svg>
  );
}

function BarIcon() {
  return (
    <svg className="wm-room-icon" viewBox="0 0 64 36" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round">
        <rect x="2" y="14" width="60" height="8" />
        <line x1="2"  y1="22" x2="2"  y2="32" />
        <line x1="62" y1="22" x2="62" y2="32" />
        <line x1="14" y1="22" x2="14" y2="32" />
        <line x1="26" y1="22" x2="26" y2="32" />
        <line x1="38" y1="22" x2="38" y2="32" />
        <line x1="50" y1="22" x2="50" y2="32" />
        <line x1="2"  y1="14" x2="62" y2="14" />
        <circle cx="10" cy="9"  r="2" />
        <circle cx="22" cy="9"  r="2" />
        <circle cx="34" cy="9"  r="2" />
        <circle cx="46" cy="9"  r="2" />
        <circle cx="58" cy="9"  r="2" />
      </g>
    </svg>
  );
}

function WindowIcon() {
  return (
    <svg className="wm-room-icon" viewBox="0 0 48 36" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round">
        <path d="M6 32 L6 12 Q24 2 42 12 L42 32 Z" />
        <line x1="24" y1="6"  x2="24" y2="32" />
        <line x1="6"  y1="22" x2="42" y2="22" />
        <line x1="14" y1="14" x2="14" y2="32" strokeDasharray="2 2" opacity="0.7" />
        <line x1="34" y1="14" x2="34" y2="32" strokeDasharray="2 2" opacity="0.7" />
      </g>
    </svg>
  );
}

function FloorboardsIcon() {
  return (
    <svg className="wm-room-icon" viewBox="0 0 80 28" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round">
        <line x1="2"  y1="6"  x2="78" y2="6"  />
        <line x1="2"  y1="13" x2="78" y2="13" />
        <line x1="2"  y1="20" x2="78" y2="20" />
        <line x1="2"  y1="26" x2="78" y2="26" />
        <line x1="20" y1="6"  x2="20" y2="13" opacity="0.55" />
        <line x1="42" y1="6"  x2="42" y2="13" opacity="0.55" />
        <line x1="62" y1="6"  x2="62" y2="13" opacity="0.55" />
        <line x1="12" y1="13" x2="12" y2="20" opacity="0.55" />
        <line x1="34" y1="13" x2="34" y2="20" opacity="0.55" />
        <line x1="56" y1="13" x2="56" y2="20" opacity="0.55" />
        <line x1="70" y1="13" x2="70" y2="20" opacity="0.55" />
        <line x1="24" y1="20" x2="24" y2="26" opacity="0.55" />
        <line x1="48" y1="20" x2="48" y2="26" opacity="0.55" />
      </g>
    </svg>
  );
}

function SignIcon() {
  return (
    <svg className="wm-room-icon" viewBox="0 0 80 28" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round">
        <rect x="4" y="6" width="72" height="14" />
        <line x1="4"  y1="20" x2="4"  y2="26" />
        <line x1="76" y1="20" x2="76" y2="26" />
        <text x="40" y="16" fontSize="6" fontFamily="'IM Fell English', serif"
              textAnchor="middle" fill="currentColor" stroke="none" letterSpacing="0.18em">
          WOODEN MATCH
        </text>
      </g>
    </svg>
  );
}

function IconForRoom({ id }: { id: string }) {
  switch (id) {
    case 'lantern':     return <LanternIcon />;
    case 'bar':         return <BarIcon />;
    case 'window':      return <WindowIcon />;
    case 'floorboards': return <FloorboardsIcon />;
    case 'sign':        return <SignIcon />;
    default: return null;
  }
}


// ── Props ────────────────────────────────────────────────────────────
interface WoodenStationGameProps {
  config: GameConfig;
  onWin: () => void;
  onLose: () => void;
  quizShowing: boolean;
}


export function WoodenStationGame({ config, onWin, onLose, quizShowing }: WoodenStationGameProps) {
  // ── State ──────────────────────────────────────────────────────────
  const [restored, setRestored] = useState<Set<string>>(new Set());
  const [matchesLeft, setMatchesLeft] = useState(STARTING_MATCHES);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_SEC);
  const [hintsLeft, setHintsLeft] = useState(STARTING_HINTS);
  const [hintRoomId, setHintRoomId] = useState<string | null>(null);

  const [activeQuizRoomId, setActiveQuizRoomId] = useState<string | null>(null);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizResult, setQuizResult] = useState<'correct' | 'wrong' | null>(null);

  const [preservedRoomId, setPreservedRoomId] = useState<string | null>(null);
  const [falteredRoomId, setFalteredRoomId] = useState<string | null>(null);

  // ── Refs (same guards as W.A. + Packer) ────────────────────────────
  const completedRef = useRef(false);
  const winFiredRef  = useRef(false);
  const loseFiredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

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
    setPreservedRoomId(null);
    setFalteredRoomId(null);
    stopTimer();
    onWin();
  }, [onWin, stopTimer]);

  // Countdown
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


  // ── Parchment feedback ──────────────────────────────────────────
  const triggerPreserved = useCallback((roomId: string) => {
    setFalteredRoomId(null);
    setPreservedRoomId(roomId);
    window.setTimeout(() => setPreservedRoomId(null), 2200);
  }, []);

  const triggerFaltered = useCallback((roomId: string) => {
    setPreservedRoomId(null);
    setFalteredRoomId(roomId);
    window.setTimeout(() => setFalteredRoomId(null), 2200);
  }, []);


  // ── Room tap → open the artifact's preservation question ───────
  const handleRoomTap = useCallback((roomId: string) => {
    if (completedRef.current || quizShowing) return;
    if (restored.has(roomId)) return;
    if (activeQuizRoomId) return;
    setActiveQuizRoomId(roomId);
    setQuizSelected(null);
    setQuizResult(null);
  }, [restored, quizShowing, activeQuizRoomId]);

  const closeQuiz = useCallback(() => {
    setActiveQuizRoomId(null);
    setQuizSelected(null);
    setQuizResult(null);
  }, []);


  // ── Quiz answer → restore room or burn a match ─────────────────
  const activeQuiz = activeQuizRoomId
    ? config.unlockQuestions?.find((q) => q.elementId === activeQuizRoomId) ?? null
    : null;

  const handleQuizAnswer = useCallback((idx: number) => {
    if (quizSelected !== null || !activeQuiz) return;
    setQuizSelected(idx);
    const isCorrect = idx === activeQuiz.correctIndex;
    setQuizResult(isCorrect ? 'correct' : 'wrong');

    if (isCorrect) {
      const roomId = activeQuiz.elementId;
      window.setTimeout(() => {
        setRestored((prev) => {
          const next = new Set(prev);
          next.add(roomId);
          if (next.size >= ROOMS.length) {
            completedRef.current = true;
            window.setTimeout(triggerWin, 500);
          } else {
            triggerPreserved(roomId);
          }
          return next;
        });
        setActiveQuizRoomId(null);
        setQuizSelected(null);
        setQuizResult(null);
      }, 700);
    } else {
      const roomId = activeQuiz.elementId;
      setMatchesLeft((m) => {
        const next = Math.max(0, m - 1);
        if (next <= 0) window.setTimeout(triggerLose, 600);
        return next;
      });
      window.setTimeout(() => {
        triggerFaltered(roomId);
        setQuizSelected(null);
        setQuizResult(null);
      }, 1100);
    }
  }, [quizSelected, activeQuiz, triggerPreserved, triggerFaltered, triggerWin, triggerLose]);


  // ── HINT: highlight the next un-restored room briefly ─────────
  const handleHint = useCallback(() => {
    if (hintsLeft <= 0 || activeQuizRoomId) return;
    const target = ROOMS.find((r) => !restored.has(r.id));
    if (!target) return;
    setHintRoomId(target.id);
    setHintsLeft((h) => h - 1);
    window.setTimeout(() => setHintRoomId(null), 2400);
  }, [hintsLeft, restored, activeQuizRoomId]);


  // ── Derived ─────────────────────────────────────────────────────
  const restoredCount = restored.size;
  const totalRooms = ROOMS.length;
  const surveyDaysLeft = Math.ceil(timeLeft / SECONDS_PER_DAY);
  const timeWarn = timeLeft <= 20 && timeLeft > 0;
  const matchesWarn = matchesLeft <= 1 && matchesLeft > 0;
  const logicClues = config.logicClues ?? [];
  const nextRoom = ROOMS.find((r) => !restored.has(r.id));


  return (
    <div className="wm-station-game allen-planning-game">

      {/* HUD strip — diegetic instruments, station-themed labels */}
      <div className="game-hud" role="status" aria-live="polite">
        <div className="game-hud-stat">
          <div className="game-hud-label">TIME LEFT</div>
          <div className={`game-hud-val${timeWarn ? ' game-time-warn' : ''}`}>
            <span className="hud-sundial" aria-hidden="true">◐</span>
            <span className="hud-num">{surveyDaysLeft}</span>
          </div>
        </div>
        <div className="game-hud-stat">
          <div className="game-hud-label">MATCHES LEFT</div>
          <div
            className={`game-hud-val hud-pips${matchesWarn ? ' game-time-warn' : ''}`}
            aria-label={`${matchesLeft} matches remaining`}
          >
            <span className="hud-pips-filled">{'●'.repeat(matchesLeft)}</span>
            <span className="hud-pips-empty">{'○'.repeat(Math.max(0, STARTING_MATCHES - matchesLeft))}</span>
          </div>
        </div>
        <div className="game-hud-stat">
          <div className="game-hud-label">ROOMS LIT</div>
          <div
            className="game-hud-val hud-roman"
            aria-label={`${restoredCount} of ${totalRooms} rooms lit`}
          >
            <span className="hud-roman-num">{toRoman(restoredCount)}</span>
            <span className="hud-roman-sep">/</span>
            <span className="hud-roman-total">{toRoman(totalRooms)}</span>
          </div>
        </div>
      </div>

      <div className="game-hud-helper">
        Time to walk the rooms · Mistaken decisions left · Heritage rooms restored
      </div>

      {/* Station floor plan + rooms ─────────────────────────────── */}
      <div className="wm-floor-wrap allen-map-wrap" aria-label="Wooden Match station floor plan">
        <svg
          className="wm-floor-svg allen-map-svg"
          viewBox="0 0 400 280"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="wmFloorBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#1a120a" />
              <stop offset="100%" stopColor="#0e0905" />
            </linearGradient>
            <radialGradient id="wmLanternHalo" cx="50%" cy="40%" r="55%">
              <stop offset="0%"  stopColor="rgba(255, 196, 100, 0.20)" />
              <stop offset="60%" stopColor="rgba(192, 78, 24, 0.05)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>

          {/* Dark interior ground */}
          <rect width="400" height="280" fill="url(#wmFloorBg)" />

          {/* Faint floorplan walls — drawn in aged brass at low opacity */}
          <g stroke="#5a3f1c" strokeWidth="1.4" fill="none" opacity="0.5">
            {/* Outer station shell — mansard-roof outline */}
            <path d="M30 22 L30 256 L370 256 L370 22 Q370 18 366 18 L34 18 Q30 18 30 22 Z" />
            {/* Internal partitions (waiting room | main hall | trackside wall) */}
            <line x1="160" y1="76"  x2="160" y2="206" strokeDasharray="3 3" />
            <line x1="240" y1="76"  x2="240" y2="206" strokeDasharray="3 3" />
            {/* Platform line below */}
            <line x1="30"  y1="218" x2="370" y2="218" />
          </g>

          {/* Lantern halo — gentle warm bloom centered in the upper doorway,
              but only when at least one room is restored. Builds across the
              game so the player sees light returning to the building. */}
          {restoredCount > 0 && (
            <ellipse
              cx="200" cy="124" rx={80 + restoredCount * 26} ry={60 + restoredCount * 18}
              fill="url(#wmLanternHalo)"
              opacity={Math.min(0.85, 0.35 + restoredCount * 0.12)}
            />
          )}

          {/* Period footer label */}
          <text
            x="200" y="272" fontSize="6" fill="#6b4e22" opacity="0.55"
            fontFamily="'IM Fell English', serif" letterSpacing="0.22em" textAnchor="middle"
          >
            CNJ STATION · LEHIGH STREET · ANNO 1868
          </text>

          {/* Compass-style platform marker */}
          <g transform="translate(200 234)" opacity="0.45">
            <line x1="-22" y1="0" x2="22" y2="0" stroke="#7a5c28" strokeWidth="0.6" />
            <text x="0" y="10" fontSize="5" fill="#7a5c28" textAnchor="middle"
                  fontFamily="serif" letterSpacing="0.3em">PLATFORM</text>
          </g>
        </svg>

        {ROOMS.map((room) => {
          const isLit = restored.has(room.id);
          const isHinted = hintRoomId === room.id;
          // UI-v6.7D — presentation-only flags. deciding: this room's
          // preservation question is open (focus its frame, hush the
          // rest). faltered: the last wrong decision was about this
          // room (amber gutter-flicker + archive mismatch stamp while
          // the existing parchment shows). Neither is read by game
          // logic; falteredRoomId/activeQuizRoomId timing unchanged.
          const isDeciding = activeQuizRoomId === room.id;
          const isFaltered = falteredRoomId === room.id;
          const cls = [
            'wm-room',
            isLit      ? 'lit'      : '',
            isHinted   ? 'hinted'   : '',
            isDeciding ? 'deciding' : '',
            isFaltered ? 'faltered' : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={room.id}
              type="button"
              className={cls}
              data-room-id={room.id}
              style={{
                left:   `${room.x}%`,
                top:    `${room.y}%`,
                width:  `${room.width}%`,
                height: `${room.height}%`,
              }}
              onClick={() => handleRoomTap(room.id)}
              disabled={isLit || !!activeQuizRoomId}
              aria-label={`${room.label} — ${room.artifact}${isLit ? ' (restored)' : ''}`}
            >
              <div className="wm-room-glow" aria-hidden="true" />
              <div className="wm-room-frame" aria-hidden="true" />
              {/* UI-v6.7D: display-case snap-in — a brass case edge that
                  settles around the artifact when the room is restored. */}
              {isLit && <span className="wm-room-case" aria-hidden="true" />}
              <div className="wm-room-art" aria-hidden="true">
                <IconForRoom id={room.id} />
              </div>
              <div className="wm-room-label">
                <span className="wm-room-zone">{room.label}</span>
                <span className="wm-room-artifact">{room.artifact}</span>
              </div>
              {isLit && (
                <div className="wm-room-caption">{room.restoredCaption}</div>
              )}
              {/* UI-v6.7D: archive-mismatch stamp on the room of the
                  last wrong decision — clears with falteredRoomId. */}
              {isFaltered && (
                <span className="wm-room-mismatch" aria-hidden="true">
                  ARCHIVE MISMATCH
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Action bar — DRAW LANTERN (hint) only; no reset, the decisions
         that have been made are preservation actions and shouldn't undo. */}
      <div className="allen-action-bar">
        <button
          type="button"
          className="allen-action-btn"
          onClick={handleHint}
          disabled={hintsLeft <= 0 || !!activeQuizRoomId || restoredCount >= totalRooms}
          aria-label={`Draw the lantern closer — ${hintsLeft} left`}
        >
          <span className="allen-action-icon" aria-hidden="true">◈</span>
          <span className="allen-action-label">DRAW LANTERN</span>
          <span className="allen-action-count">[{hintsLeft}]</span>
        </button>
      </div>

      {/* Quiz overlay OR the bottom panels ─────────────────────── */}
      {activeQuiz && activeQuizRoomId ? (
        (() => {
          const room = ROOMS.find((r) => r.id === activeQuizRoomId);
          if (!room) return null;
          return (
            <div className="allen-quiz-overlay wm-quiz-overlay">
              <div className="allen-quiz-header">
                <span className="allen-quiz-eyebrow">PRESERVATION DECISION · {room.artifact}</span>
                <button
                  type="button"
                  className="allen-quiz-close"
                  onClick={closeQuiz}
                  aria-label="Close decision"
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
                  ✓ Memory preserved — the room comes back to life.
                </div>
              )}
              {quizResult === 'wrong' && (
                <div className="allen-quiz-feedback wrong">
                  ✕ The match falters — that costs you one. Heritage isn't replaced.
                </div>
              )}
            </div>
          );
        })()
      ) : (
        <>
          <div className="allen-elements-hint wm-rooms-hint">
            {nextRoom
              ? 'Tap a darkened room to make its preservation decision.'
              : 'All rooms restored. The station is lit.'}
          </div>

          <div className="allen-bottom-panels">
            <div className="allen-clues-panel">
              <div className="allen-clues-lantern" aria-hidden="true">
                <TsIcon icon="station-lantern" className="ts-icon-md" />
              </div>
              <div className="allen-clues-body">
                <div className="allen-clues-label">PRESERVATION PRINCIPLES</div>
                <ol className="allen-clues-list">
                  {logicClues.map((c, i) => (
                    <li key={i} className="allen-clues-item">{c}</li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="allen-next-unlock">
              <div className="allen-next-unlock-label">NEXT ROOM</div>
              {nextRoom ? (
                <>
                  <div className="allen-next-unlock-icon" aria-hidden="true">◉</div>
                  <div className="allen-next-unlock-name">{nextRoom.artifact}</div>
                  <div className="allen-next-unlock-hint">{nextRoom.label}.</div>
                </>
              ) : (
                <>
                  <div className="allen-next-unlock-icon" aria-hidden="true">✓</div>
                  <div className="allen-next-unlock-name">STATION RELIT</div>
                  <div className="allen-next-unlock-hint">Every room remembers.</div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* "✓ MEMORY PRESERVED" parchment */}
      {(() => {
        const room = preservedRoomId
          ? ROOMS.find((r) => r.id === preservedRoomId)
          : null;
        if (!room) return null;
        return (
          <div className="allen-approve" role="status" aria-live="polite">
            <div className="allen-approve-eyebrow">
              <span className="allen-approve-mark" aria-hidden="true">✓</span>
              MEMORY PRESERVED
            </div>
            <div className="allen-approve-name">{room.artifact}</div>
            <div className="allen-approve-quote">{room.restoredCaption}</div>
          </div>
        );
      })()}

      {/* "✕ THE MATCH FALTERS" parchment */}
      {(() => {
        const room = falteredRoomId
          ? ROOMS.find((r) => r.id === falteredRoomId)
          : null;
        if (!room) return null;
        return (
          <div className="allen-reconsider" role="status" aria-live="polite">
            <div className="allen-reconsider-eyebrow">
              <span className="allen-reconsider-mark" aria-hidden="true">✕</span>
              THE MATCH FALTERS
            </div>
            <div className="allen-reconsider-name">{room.artifact}</div>
            <div className="allen-reconsider-quote">
              Heritage isn't replaced. Walk the room again.
            </div>
          </div>
        );
      })()}
    </div>
  );
}
