import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GameConfig } from './gameConfigs';
import { TsIcon } from '../components/TsIcon';

// =====================================================================
// PACKER PILSNER — BUILD THE LEHIGH VALLEY LINE (v5.1.14)
// ---------------------------------------------------------------------
// Distinct mechanic from W.A. Lager:
//   - W.A. Lager:  WHERE elements go (spatial sorting on a town map)
//   - Packer:      WHEN elements happen (sequencing along a rail route)
//
// Five LVRR junctions sit west→east along the Lehigh Valley:
//   MAUCH CHUNK → PARRYVILLE → LEHIGHTON → BETHLEHEM → EASTON
//
// MAUCH CHUNK starts unlocked (the line begins at the coal source).
// The other four are gated behind unlock quizzes. Once unlocked, each
// card can be placed only AFTER the junction immediately west of it
// has been laid. Out-of-order attempts cost a mistake and surface a
// "PACKER RECONSIDERS" reason explaining what comes first.
//
// Reuses the AllenTownPlanningGame patterns: HUD, action bar, quiz
// overlay, planning note, drag-portal, parchment feedback. The map,
// junctions, spike markers, and feedback eyebrows are Packer-specific.
//
// HARD RULES (unchanged):
//   - same { config, onWin, onLose, quizShowing } prop contract
//   - badge contract unchanged — onWin only fires when all 5 are laid
//   - no badge-key, localStorage, Supabase, scan, or QR changes
//   - old PackerRailGame.tsx remains on disk as the legacy fallback
// =====================================================================


// ── Game tuning ──────────────────────────────────────────────────────
const GAME_DURATION_SEC = 90;
const STARTING_MOVES    = 7;
const STARTING_HINTS    = 2;
const SECONDS_PER_DAY   = 3;


// ── Junction + card definitions ─────────────────────────────────────
interface MapZone {
  id: string;
  label: string;
  /** Order index — strict west→east. 0 = westernmost. */
  order: number;
  x: number;
  y: number;
  width: number;
  height: number;
  correctElement: string;
}

interface PlaceableElement {
  id: string;
  label: string;
  rationale: string;
  planningLogic: string;
  successReason: string;
  /** Used when the card is dropped on a wrong junction. */
  wrongReason: string;
  /** Used when the card is dropped on the right junction but BEFORE
   *  the previous junction has been laid (sequence violation). */
  outOfOrderReason: string;
  startsUnlocked?: boolean;
}

// Five junctions along the LVRR mainline, plotted on a horizontal-ish
// path that drops slightly east-southeast (mirroring the actual river
// route from the Pocono foothills down to the Delaware).
const ZONES: MapZone[] = [
  { id: 'mauch-chunk', label: 'MAUCH CHUNK', order: 0, x:  6, y: 32, width: 16, height: 16, correctElement: 'mauch-chunk' },
  { id: 'parryville',  label: 'PARRYVILLE',  order: 1, x: 25, y: 38, width: 16, height: 16, correctElement: 'parryville'  },
  { id: 'lehighton',   label: 'LEHIGHTON',   order: 2, x: 44, y: 44, width: 16, height: 16, correctElement: 'lehighton'   },
  { id: 'bethlehem',   label: 'BETHLEHEM',   order: 3, x: 62, y: 50, width: 16, height: 16, correctElement: 'bethlehem'   },
  { id: 'easton',      label: 'EASTON',      order: 4, x: 80, y: 56, width: 16, height: 16, correctElement: 'easton'      },
];

const ELEMENTS: PlaceableElement[] = [
  {
    id: 'mauch-chunk',
    label: 'MAUCH CHUNK',
    rationale: 'The coal terminus — the line begins here in the western mountains.',
    planningLogic: 'The route begins at the coal terminus. Find the westernmost junction, near the coal piles.',
    successReason: 'Mauch Chunk anchors the western end, where the coal comes down.',
    wrongReason: 'Mauch Chunk is the coal source — it belongs at the western terminus.',
    outOfOrderReason: 'Mauch Chunk is the start of the line.',
    startsUnlocked: true,
  },
  {
    id: 'parryville',
    label: 'PARRYVILLE',
    rationale: 'The first siding east of the coal seams.',
    planningLogic: 'The first junction east of Mauch Chunk — beside the small creek crossing.',
    successReason: 'Parryville sits at the first crossing east of the coal piles.',
    wrongReason: 'Parryville is the first stop east of Mauch Chunk — not a later junction.',
    outOfOrderReason: 'Mauch Chunk must be laid before Parryville.',
  },
  {
    id: 'lehighton',
    label: 'LEHIGHTON',
    rationale: 'A switching junction where canal and rail meet.',
    planningLogic: 'The mid-route switching junction, where the canal runs parallel to the rail.',
    successReason: 'Lehighton handles the switching where canal and rail meet.',
    wrongReason: 'Lehighton sits mid-route, between Parryville and Bethlehem.',
    outOfOrderReason: 'Parryville must be laid before Lehighton.',
  },
  {
    id: 'bethlehem',
    label: 'BETHLEHEM',
    rationale: "The iron works — Packer's biggest junction on the line.",
    planningLogic: 'The largest junction, beside the iron-furnace markings.',
    successReason: "Bethlehem feeds Packer's iron works — the heart of the line.",
    wrongReason: 'Bethlehem is the iron-works junction, between Lehighton and Easton.',
    outOfOrderReason: 'Lehighton must be laid before Bethlehem.',
  },
  {
    id: 'easton',
    label: 'EASTON',
    rationale: 'The Delaware terminus — eastern end of the line.',
    planningLogic: 'The eastern terminus where the rail meets the Delaware River.',
    successReason: 'Easton brings coal to the Delaware, completing the line.',
    wrongReason: 'Easton is the Delaware terminus — it belongs at the eastern end.',
    outOfOrderReason: 'Bethlehem must be laid before Easton.',
  },
];

const FALLBACK_WRONG_REASON =
  'This site is wrong for that junction.';


// ── HUD helpers ─────────────────────────────────────────────────────
const ROMAN: Record<number, string> = {
  0: '0', 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII',
};
function toRoman(n: number): string {
  return ROMAN[n] ?? String(n);
}


// ── Props ────────────────────────────────────────────────────────────
interface PackerRouteGameProps {
  config: GameConfig;
  onWin: () => void;
  onLose: () => void;
  quizShowing: boolean;
}


export function PackerRouteGame({ config, onWin, onLose, quizShowing }: PackerRouteGameProps) {
  // ── State ──────────────────────────────────────────────────────────
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [movesLeft, setMovesLeft]   = useState(STARTING_MOVES);
  const [timeLeft, setTimeLeft]     = useState(GAME_DURATION_SEC);
  const [hintsLeft, setHintsLeft]   = useState(STARTING_HINTS);

  const [unlocked, setUnlocked] = useState<Set<string>>(
    () => new Set(ELEMENTS.filter((e) => e.startsUnlocked).map((e) => e.id)),
  );

  const [armedElementId, setArmedElementId] = useState<string | null>(null);
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [hoverZoneId, setHoverZoneId] = useState<string | null>(null);
  const [hintZoneId, setHintZoneId]   = useState<string | null>(null);

  // v5.1.14 carries TWO reasons for rejected placements: wrong junction
  // vs out-of-order (right junction, but the previous one isn't laid).
  // We store the elementId + a kind so the JSX can pick the right
  // reason string from the ELEMENT entry.
  const [reconsider, setReconsider] = useState<
    { elementId: string; kind: 'wrong' | 'out-of-order' } | null
  >(null);
  const [approveElementId, setApproveElementId] = useState<string | null>(null);

  const [activeQuizElementId, setActiveQuizElementId] = useState<string | null>(null);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizResult, setQuizResult]     = useState<'correct' | 'wrong' | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────
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
    setApproveElementId(null);
    setReconsider(null);
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

  // Lock body scroll while dragging (same trick as W.A.)
  useEffect(() => {
    if (!draggingElementId) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [draggingElementId]);


  // ── Feedback parchment triggers ───────────────────────────────────
  const triggerReconsider = useCallback(
    (elementId: string, kind: 'wrong' | 'out-of-order') => {
      setApproveElementId(null);
      setReconsider({ elementId, kind });
      window.setTimeout(() => setReconsider(null), 2200);
    },
    [],
  );

  const triggerApprove = useCallback((elementId: string) => {
    setReconsider(null);
    setApproveElementId(elementId);
    window.setTimeout(() => setApproveElementId(null), 2200);
  }, []);


  // ── Placement logic ──────────────────────────────────────────────
  const attemptPlacement = useCallback(
    (elementId: string, zoneId: string) => {
      if (completedRef.current || winFiredRef.current || loseFiredRef.current) return;
      if (placements[zoneId]) return;
      if (!unlocked.has(elementId)) return;
      if (Object.values(placements).includes(elementId)) return;

      const zone = ZONES.find((z) => z.id === zoneId);
      if (!zone) return;

      // Card-to-junction match check
      if (zone.correctElement !== elementId) {
        triggerReconsider(elementId, 'wrong');
        setMovesLeft((m) => {
          const next = Math.max(0, m - 1);
          if (next <= 0) window.setTimeout(triggerLose, 480);
          return next;
        });
        setArmedElementId(null);
        return;
      }

      // v5.1.14 ordering constraint: each junction (except MAUCH CHUNK
      // at order 0) requires its immediate western neighbour to be
      // laid first. We never block the placement of MAUCH CHUNK.
      if (zone.order > 0) {
        const prevZone = ZONES.find((z) => z.order === zone.order - 1);
        if (prevZone && !placements[prevZone.id]) {
          triggerReconsider(elementId, 'out-of-order');
          setMovesLeft((m) => {
            const next = Math.max(0, m - 1);
            if (next <= 0) window.setTimeout(triggerLose, 480);
            return next;
          });
          setArmedElementId(null);
          return;
        }
      }

      // Correct + in order → snap in
      const next = { ...placements, [zoneId]: elementId };
      setPlacements(next);
      setArmedElementId(null);

      if (Object.keys(next).length >= ZONES.length) {
        completedRef.current = true;
        window.setTimeout(triggerWin, 400);
      } else {
        triggerApprove(elementId);
      }
    },
    [placements, unlocked, triggerWin, triggerLose, triggerReconsider, triggerApprove],
  );


  // ── Tap-to-place / open-quiz ─────────────────────────────────────
  const handleElementTap = useCallback(
    (elementId: string) => {
      if (completedRef.current || quizShowing) return;
      if (Object.values(placements).includes(elementId)) return;
      if (!unlocked.has(elementId)) {
        setActiveQuizElementId(elementId);
        setQuizSelected(null);
        setQuizResult(null);
        setArmedElementId(null);
        return;
      }
      setArmedElementId((cur) => (cur === elementId ? null : elementId));
    },
    [placements, unlocked, quizShowing],
  );

  const handleZoneTap = useCallback(
    (zoneId: string) => {
      if (!armedElementId) return;
      attemptPlacement(armedElementId, zoneId);
    },
    [armedElementId, attemptPlacement],
  );


  // ── Pointer drag ─────────────────────────────────────────────────
  const hitTestZone = (x: number, y: number): string | null => {
    const nodes = document.querySelectorAll<HTMLElement>('.packer-junction:not(.filled)');
    for (const node of Array.from(nodes)) {
      const r = node.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return node.dataset.zoneId ?? null;
      }
    }
    return null;
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, elementId: string) => {
      if (completedRef.current || quizShowing) return;
      if (!unlocked.has(elementId)) return;
      if (Object.values(placements).includes(elementId)) return;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      dragStateRef.current = { elementId, hoverZoneId: null };
      setDraggingElementId(elementId);
      setDragPos({ x: e.clientX, y: e.clientY });
      setArmedElementId(null);
    },
    [placements, unlocked, quizShowing],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.elementId) return;
    setDragPos({ x: e.clientX, y: e.clientY });
    const zoneId = hitTestZone(e.clientX, e.clientY);
    if (zoneId !== dragStateRef.current.hoverZoneId) {
      dragStateRef.current.hoverZoneId = zoneId;
      setHoverZoneId(zoneId);
    }
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const elementId = dragStateRef.current.elementId;
      if (!elementId) return;
      const zoneId = hitTestZone(e.clientX, e.clientY);
      dragStateRef.current = { elementId: null, hoverZoneId: null };
      setDraggingElementId(null);
      setDragPos(null);
      setHoverZoneId(null);
      if (zoneId) attemptPlacement(elementId, zoneId);
    },
    [attemptPlacement],
  );


  // ── Quiz handlers ────────────────────────────────────────────────
  const activeQuiz = activeQuizElementId
    ? config.unlockQuestions?.find((q) => q.elementId === activeQuizElementId) ?? null
    : null;

  const handleQuizAnswer = useCallback(
    (idx: number) => {
      if (quizSelected !== null || !activeQuiz) return;
      setQuizSelected(idx);
      const isCorrect = idx === activeQuiz.correctIndex;
      setQuizResult(isCorrect ? 'correct' : 'wrong');
      if (isCorrect) {
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
        setMovesLeft((m) => {
          const next = Math.max(0, m - 1);
          if (next <= 0) window.setTimeout(triggerLose, 480);
          return next;
        });
        window.setTimeout(() => {
          setQuizSelected(null);
          setQuizResult(null);
        }, 1200);
      }
    },
    [quizSelected, activeQuiz, triggerLose],
  );

  const closeQuiz = useCallback(() => {
    setActiveQuizElementId(null);
    setQuizSelected(null);
    setQuizResult(null);
  }, []);


  // ── HINT + RESET ─────────────────────────────────────────────────
  const handleHint = useCallback(() => {
    if (hintsLeft <= 0) return;
    // For Packer the most useful hint is the NEXT junction to be laid,
    // which is the smallest-order unfilled zone whose previous neighbour
    // is filled (or order 0).
    const candidates = ZONES
      .filter((z) => !placements[z.id])
      .sort((a, b) => a.order - b.order);
    const target = candidates.find((z) => {
      if (z.order === 0) return true;
      const prev = ZONES.find((pz) => pz.order === z.order - 1);
      return !!(prev && placements[prev.id]);
    }) ?? candidates[0];
    if (!target) return;
    setHintZoneId(target.id);
    setHintsLeft((h) => h - 1);
    window.setTimeout(() => setHintZoneId(null), 2400);
  }, [hintsLeft, placements]);

  const handleReset = useCallback(() => {
    setPlacements({});
    setArmedElementId(null);
    setHintZoneId(null);
  }, []);


  // ── Derived values ──────────────────────────────────────────────
  const placed = Object.keys(placements).length;
  const cluesEarned = Math.max(
    0,
    unlocked.size - ELEMENTS.filter((e) => e.startsUnlocked).length,
  );
  const totalCluesAvailable = config.unlockQuestions?.length ?? 0;
  const surveyDaysLeft = Math.ceil(timeLeft / SECONDS_PER_DAY);
  const timeWarn = timeLeft <= 15 && timeLeft > 0;
  const movesWarn = movesLeft <= 2 && movesLeft > 0;

  const nextLocked = ELEMENTS.find(
    (el) => !unlocked.has(el.id) && !Object.values(placements).includes(el.id),
  );
  const logicClues = config.logicClues ?? [];
  const focusedElementId = draggingElementId ?? armedElementId;

  // Junctions, sorted west→east — used both for rendering the rail and
  // for hint targeting.
  const zonesByOrder = ZONES.slice().sort((a, b) => a.order - b.order);


  return (
    <div className="packer-route-game allen-planning-game">

      {/* HUD strip (v5.1.13 labels reused) ───────────────────────── */}
      <div className="game-hud" role="status" aria-live="polite">
        <div className="game-hud-stat">
          <div className="game-hud-label">DAYS LEFT</div>
          <div className={`game-hud-val${timeWarn ? ' game-time-warn' : ''}`}>
            <span className="hud-sundial" aria-hidden="true">◐</span>
            <span className="hud-num">{surveyDaysLeft}</span>
          </div>
        </div>
        <div className="game-hud-stat">
          <div className="game-hud-label">MISTAKES LEFT</div>
          <div
            className={`game-hud-val hud-pips${movesWarn ? ' game-time-warn' : ''}`}
            aria-label={`${movesLeft} mistakes remaining`}
          >
            <span className="hud-pips-filled">{'●'.repeat(movesLeft)}</span>
            <span className="hud-pips-empty">{'○'.repeat(Math.max(0, STARTING_MOVES - movesLeft))}</span>
          </div>
        </div>
        <div className="game-hud-stat">
          <div className="game-hud-label">CLUES SOLVED</div>
          <div className="game-hud-val hud-roman">
            <span className="hud-roman-num">{toRoman(cluesEarned)}</span>
            <span className="hud-roman-sep">/</span>
            <span className="hud-roman-total">{toRoman(totalCluesAvailable)}</span>
          </div>
        </div>
      </div>

      <div className="game-hud-helper">
        Time to build · Wrong placements remaining · Tale clues solved
      </div>

      {/* Rail-survey map + junctions ─────────────────────────────── */}
      <div className="packer-map-wrap allen-map-wrap" aria-label="Lehigh Valley rail survey map">
        <svg
          className="packer-map-svg allen-map-svg"
          viewBox="0 0 400 280"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <pattern id="packerParchGrid" x="0" y="0" width="40" height="28" patternUnits="userSpaceOnUse">
              <rect width="40" height="28" fill="none" stroke="#6b4e22" strokeWidth="0.4" opacity="0.22" />
            </pattern>
            <linearGradient id="packerParchBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3a2810" />
              <stop offset="100%" stopColor="#1f1408" />
            </linearGradient>
            <linearGradient id="packerFoldCrease" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"  stopColor="rgba(0,0,0,0)" />
              <stop offset="49%" stopColor="rgba(0,0,0,0.18)" />
              <stop offset="50%" stopColor="rgba(255,235,200,0.05)" />
              <stop offset="51%" stopColor="rgba(0,0,0,0.18)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </linearGradient>
          </defs>

          {/* Parchment ground */}
          <rect width="400" height="280" fill="url(#packerParchBg)" />
          <rect width="400" height="280" fill="url(#packerParchGrid)" />

          {/* Pocono foothills — stippled forest patches across the north */}
          <g fill="#2a3618" opacity="0.55">
            <circle cx="40"  cy="32" r="1.4" /><circle cx="56"  cy="38" r="1.2" />
            <circle cx="72"  cy="30" r="1.3" /><circle cx="92"  cy="36" r="1.1" />
            <circle cx="112" cy="28" r="1.4" /><circle cx="130" cy="34" r="1.0" />
            <circle cx="150" cy="30" r="1.2" /><circle cx="170" cy="36" r="1.1" />
            <circle cx="192" cy="28" r="1.3" /><circle cx="216" cy="34" r="1.0" />
            <circle cx="240" cy="30" r="1.1" /><circle cx="264" cy="36" r="1.2" />
            <circle cx="288" cy="28" r="1.3" /><circle cx="316" cy="32" r="1.0" />
            <circle cx="346" cy="38" r="1.1" />
          </g>
          {/* Faint contour lines suggesting the hill terrain */}
          <g stroke="#6b4e22" strokeWidth="0.4" fill="none" opacity="0.22">
            <path d="M0 50  Q100 44 200 48 Q300 52 400 46" />
            <path d="M0 64  Q100 60 200 64 Q300 68 400 62" />
            <path d="M0 78  Q100 74 200 78 Q300 82 400 76" />
          </g>

          {/* Lehigh River + canal — running parallel below the rail */}
          <path
            d="M0 218 Q100 210 200 222 Q300 234 400 226"
            stroke="#1a3a4a" strokeWidth="9" fill="none" opacity="0.55" strokeLinecap="round"
          />
          <path
            d="M0 218 Q100 210 200 222 Q300 234 400 226"
            stroke="#284f60" strokeWidth="3" fill="none" opacity="0.4" strokeLinecap="round"
          />
          {/* Canal tow-path — dashed parallel south of the river */}
          <path
            d="M0 232 Q100 224 200 236 Q300 248 400 240"
            stroke="#6b4e22" strokeWidth="0.8" strokeDasharray="6 3"
            fill="none" opacity="0.55"
          />

          {/* The rail mainline — pre-drawn as a faint route. Then lit
              segments are drawn over the top, west to east, for each
              junction that's been laid. */}
          <g stroke="#7a5c28" strokeWidth="1.4" fill="none" opacity="0.55">
            <path d="M22 116 L110 134 L210 156 L310 178 L390 196" />
            {/* rail-tie ticks along the route for texture */}
            {Array.from({ length: 18 }).map((_, i) => {
              // approximate position along the line (linear segments)
              const t = i / 17;
              const segPts = [
                { x: 22, y: 116 }, { x: 110, y: 134 },
                { x: 210, y: 156 }, { x: 310, y: 178 }, { x: 390, y: 196 },
              ];
              const segIndex = Math.min(Math.floor(t * (segPts.length - 1)), segPts.length - 2);
              const segT = (t * (segPts.length - 1)) - segIndex;
              const a = segPts[segIndex];
              const b = segPts[segIndex + 1];
              const px = a.x + (b.x - a.x) * segT;
              const py = a.y + (b.y - a.y) * segT;
              // perpendicular tick
              const dx = b.x - a.x, dy = b.y - a.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              const nx = -dy / len, ny = dx / len;
              return (
                <line
                  key={i}
                  x1={px - nx * 3} y1={py - ny * 3}
                  x2={px + nx * 3} y2={py + ny * 3}
                  stroke="#6b4e22" strokeWidth="0.7" opacity="0.6"
                />
              );
            })}
          </g>

          {/* Lit segments — each segment from junction i to junction i+1
              brightens when the EAST end (i+1) is filled. */}
          <g fill="none" strokeLinecap="round">
            {[
              { from: { x: 36,  y: 110 }, to: { x: 132, y: 134 }, eastId: 'parryville' },
              { from: { x: 132, y: 134 }, to: { x: 208, y: 156 }, eastId: 'lehighton'  },
              { from: { x: 208, y: 156 }, to: { x: 280, y: 178 }, eastId: 'bethlehem'  },
              { from: { x: 280, y: 178 }, to: { x: 360, y: 200 }, eastId: 'easton'     },
            ].map((seg, i) => {
              const lit = !!Object.values(placements).find((id) => id === seg.eastId);
              return (
                <line
                  key={i}
                  x1={seg.from.x} y1={seg.from.y}
                  x2={seg.to.x}   y2={seg.to.y}
                  stroke={lit ? '#E0A15A' : 'transparent'}
                  strokeWidth="2.2"
                  opacity={lit ? 0.9 : 0}
                  className={lit ? 'packer-segment-lit' : 'packer-segment'}
                />
              );
            })}
          </g>

          {/* Landmark icons near each junction — visual cues that
              help the player match each card to its junction. */}
          {/* MAUCH CHUNK: coal pile (NW) */}
          <g opacity="0.85">
            <path d="M22 96 L34 80 L46 96 Z" fill="#1a1308" stroke="#7a5c28" strokeWidth="0.7" />
            <line x1="26" y1="92" x2="42" y2="92" stroke="#7a5c28" strokeWidth="0.5" />
          </g>
          {/* PARRYVILLE: small creek crossing perpendicular to rail */}
          <g opacity="0.8">
            <line x1="116" y1="106" x2="120" y2="180" stroke="#284f60" strokeWidth="1.2" opacity="0.55" />
            <line x1="114" y1="124" x2="124" y2="120" stroke="#7a5c28" strokeWidth="0.6" />
            <line x1="114" y1="128" x2="124" y2="124" stroke="#7a5c28" strokeWidth="0.6" />
          </g>
          {/* LEHIGHTON: switch crossing */}
          <g opacity="0.8" transform="translate(196 154)">
            <line x1="-6" y1="0" x2="6" y2="0"  stroke="#7a5c28" strokeWidth="0.8" />
            <line x1="-4" y1="-4" x2="4" y2="4" stroke="#7a5c28" strokeWidth="0.7" />
          </g>
          {/* BETHLEHEM: iron furnace silhouette */}
          <g opacity="0.85" transform="translate(284 168)">
            <rect x="-7" y="-6" width="14" height="8" fill="#2a1f10" stroke="#7a5c28" strokeWidth="0.6" />
            <rect x="-2" y="-12" width="4" height="6" fill="#2a1f10" stroke="#7a5c28" strokeWidth="0.5" />
            <line x1="0" y1="-18" x2="0" y2="-12" stroke="#7a5c28" strokeWidth="0.5" />
          </g>
          {/* EASTON: vertical Delaware River + dock */}
          <g opacity="0.85">
            <path
              d="M386 0 Q380 60 388 120 Q390 180 380 280"
              stroke="#1a3a4a" strokeWidth="6" fill="none" opacity="0.6" strokeLinecap="round"
            />
            <rect x="364" y="194" width="10" height="6" fill="#2a1f10" stroke="#7a5c28" strokeWidth="0.5" />
          </g>

          {/* Parchment fold crease */}
          <rect width="400" height="280" fill="url(#packerFoldCrease)" opacity="0.55" />

          {/* Compass rose */}
          <g transform="translate(370 30)" opacity="0.6">
            <circle cx="0" cy="0" r="14" fill="none" stroke="#a07808" strokeWidth="0.7" />
            <line x1="0" y1="-13" x2="0" y2="-1" stroke="#a07808" strokeWidth="1.2" />
            <polygon points="0,-16 -3,-8 3,-8" fill="#a07808" />
            <line x1="-12" y1="0" x2="-2"  y2="0"  stroke="#a07808" strokeWidth="0.6" />
            <line x1="12"  y1="0" x2="2"   y2="0"  stroke="#a07808" strokeWidth="0.6" />
            <text x="0" y="22" fontSize="6" fill="#a07808" textAnchor="middle" fontFamily="serif">N</text>
          </g>

          {/* Surveyor footer */}
          <text
            x="20" y="270" fontSize="6" fill="#6b4e22" opacity="0.6"
            fontFamily="'IM Fell English', serif" letterSpacing="0.16em"
          >
            LEHIGH VALLEY MAINLINE · ANNO 1855
          </text>

          {/* Region labels */}
          <g
            fontFamily="'IM Fell English', serif"
            fontStyle="italic"
            fill="#a07808"
            opacity="0.5"
          >
            <text x="40"  y="22" fontSize="7" letterSpacing="0.16em">Pocono foothills</text>
            <text x="36"  y="100" fontSize="7" letterSpacing="0.16em">coal seams</text>
            <text x="232" y="200" fontSize="7" letterSpacing="0.16em">canal tow-path</text>
            <text x="290" y="190" fontSize="7" letterSpacing="0.16em">iron works</text>
            <text x="350" y="252" fontSize="7" letterSpacing="0.16em">Delaware</text>
          </g>
        </svg>

        {ZONES.map((zone) => {
          const filled = !!placements[zone.id];
          const elementHere = placements[zone.id];
          const targeted = !filled && hoverZoneId === zone.id;
          const isArmedTarget =
            !filled && focusedElementId !== null && zone.correctElement === focusedElementId;
          const hinted = hintZoneId === zone.id;
          const cls = [
            'packer-junction',
            filled        ? 'filled'       : '',
            targeted      ? 'targeted'     : '',
            isArmedTarget ? 'armed-target' : '',
            hinted        ? 'hinted'       : '',
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
              aria-label={`${zone.label} junction${filled ? ' — laid' : ''}`}
            >
              {filled && elementHere ? (
                <div className="packer-junction-spike" aria-hidden="true">
                  <span className="packer-junction-numeral">{toRoman(zone.order + 1)}</span>
                </div>
              ) : (
                <>
                  {isArmedTarget ? (
                    <svg className="packer-junction-crosshair allen-map-zone-crosshair" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="0.8" />
                      <line x1="12" y1="2"  x2="12" y2="22" stroke="currentColor" strokeWidth="0.8" />
                      <line x1="2"  y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="0.8" />
                      <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                  ) : (
                    <span className="packer-junction-marker" aria-hidden="true" />
                  )}
                  {isArmedTarget && (
                    <span className="allen-map-zone-label">{zone.label}</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Action bar */}
      <div className="allen-action-bar">
        <button
          type="button"
          className="allen-action-btn"
          onClick={handleHint}
          disabled={hintsLeft <= 0 || !!activeQuizElementId}
          aria-label={`Survey hint — ${hintsLeft} left`}
        >
          <span className="allen-action-icon" aria-hidden="true">◈</span>
          <span className="allen-action-label">SURVEY HINT</span>
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

      {/* Quiz overlay OR rail rail+clues ─────────────────────────── */}
      {activeQuiz ? (
        <div className="allen-quiz-overlay">
          <div className="allen-quiz-header">
            <span className="allen-quiz-eyebrow">TALE CLUE</span>
            <button type="button" className="allen-quiz-close" onClick={closeQuiz} aria-label="Close clue">✕</button>
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
              ✓ Correct — junction unlocked.
            </div>
          )}
          {quizResult === 'wrong' && (
            <div className="allen-quiz-feedback wrong">
              Not quite — that costs 1 mistake. Try again.
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="allen-elements-rail-label">LAY THESE JUNCTIONS · WEST TO EAST</div>
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
                  <div className="allen-element-blurb">{el.rationale}</div>
                  {isPlaced && <div className="allen-element-check" aria-hidden="true">✓ LAID</div>}
                  {isLocked && <div className="allen-element-locked" aria-hidden="true">TAP TO UNLOCK</div>}
                </div>
              );
            })}
          </div>

          {armedElementId ? (
            (() => {
              const armed = ELEMENTS.find((e) => e.id === armedElementId);
              return (
                <div className="allen-planning-note">
                  <span className="allen-planning-eyebrow">PLANNING NOTE</span>
                  <span className="allen-planning-text">
                    {armed?.planningLogic ?? 'Place this junction on the route.'}
                  </span>
                </div>
              );
            })()
          ) : (
            <div className="allen-elements-hint">
              {nextLocked
                ? 'Tap a locked junction to answer its Tale clue.'
                : 'Tap a junction to arm it, or drag it onto the rail.'}
            </div>
          )}

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
                  <div className="allen-next-unlock-hint">Answer a Tale clue to unlock.</div>
                </>
              ) : (
                <>
                  <div className="allen-next-unlock-icon" aria-hidden="true">✓</div>
                  <div className="allen-next-unlock-name">ALL UNLOCKED</div>
                  <div className="allen-next-unlock-hint">Lay the remaining junctions in order.</div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Portal drag ghost (same Portal/transform pattern as W.A.) */}
      {draggingElementId && dragPos && createPortal(
        <div
          className="allen-drag-ghost"
          style={{
            transform: `translate3d(${dragPos.x}px, ${dragPos.y}px, 0) translate(-50%, -50%)`,
          }}
          aria-hidden="true"
        >
          ◈ {ELEMENTS.find((e) => e.id === draggingElementId)?.label}
        </div>,
        document.body
      )}

      {/* "Packer reconsiders" parchment — two flavours */}
      {(() => {
        if (!reconsider) return null;
        const el = ELEMENTS.find((e) => e.id === reconsider.elementId);
        if (!el) return null;
        const reasonRaw = reconsider.kind === 'out-of-order'
          ? el.outOfOrderReason
          : el.wrongReason;
        const reason = (reasonRaw || FALLBACK_WRONG_REASON)
          .replace(/^["“]|["”]$/g, '')
          .replace(/\.$/, '') + '.';
        const eyebrowText = reconsider.kind === 'out-of-order'
          ? 'OUT OF ORDER'
          : 'PACKER RECONSIDERS';
        return (
          <div className="allen-reconsider" role="status" aria-live="polite">
            <div className="allen-reconsider-eyebrow">
              <span className="allen-reconsider-mark" aria-hidden="true">✕</span>
              {eyebrowText}
            </div>
            <div className="allen-reconsider-name">{el.label}</div>
            <div className="allen-reconsider-quote">{reason}</div>
          </div>
        );
      })()}

      {/* "Packer approves" parchment */}
      {(() => {
        const el = approveElementId ? ELEMENTS.find((e) => e.id === approveElementId) : null;
        if (!el) return null;
        const reason = el.successReason
          .replace(/^["“]|["”]$/g, '')
          .replace(/\.$/, '') + '.';
        return (
          <div className="allen-approve" role="status" aria-live="polite">
            <div className="allen-approve-eyebrow">
              <span className="allen-approve-mark" aria-hidden="true">✓</span>
              LAID ON THE LINE
            </div>
            <div className="allen-approve-name">{el.label}</div>
            <div className="allen-approve-quote">{reason}</div>
          </div>
        );
      })()}
    </div>
  );
}
