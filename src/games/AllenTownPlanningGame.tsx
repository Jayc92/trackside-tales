import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameConfig } from './gameConfigs';
import { TsIcon } from '../components/TsIcon';

// =====================================================================
// W.A. LAGER PLANNING GAME — v5.1.3 → v5.1.11
// ---------------------------------------------------------------------
// History:
//   v5.1.3–6   map + zones + HUD + element rail + drag
//   v5.1.7–9   inline unlock-quiz interleaved with placement
//   v5.1.10    premium engraved-medallion success state
//   v5.1.11    DIEGETIC SURVEYOR PASS — visual/feedback layer only
//
// v5.1.11 ships:
//   - Surveyor-style 3-stat HUD: SURVEY DAYS (sundial), ALLEN'S RESOLVE
//     (pips), JOURNAL (Roman numerals). Drops the generic 5-stat strip.
//   - Map richness: contour lines, dashed road from SE, mile markers,
//     fold crease, denser stippled forest, river current marks.
//   - 5 inline SVG building icons that stroke-in over 700ms when a
//     zone is filled. Hand-drawn ink-line style, brass on currentColor.
//   - Emergent brass crosshair: visible only on the correct zone when
//     its element is armed or being dragged. Empty zones show a faint
//     dot marker instead of the dashed-rectangle scaffolding.
//   - "Allen reconsiders…" parchment slide-up replaces the red flash
//     on wrong placement. Same penalty (lose 1 MOVE), softer feedback.
//   - Letterpress text shadows and IM FELL English on Tale-clue copy
//     for a period-printed feel.
//
// HARD RULES (unchanged from v5.1.7+):
//   - same { config, onWin, onLose, quizShowing } prop contract
//   - badge contract unchanged — onWin is gated on all 5 placed
//   - no badge-key, localStorage, Supabase, scan, or QR changes
//   - AllenTownGame.tsx (v5.1.2 fallback) still on disk untouched
// =====================================================================


// ── Game tuning ──────────────────────────────────────────────────────
const GAME_DURATION_SEC = 90;
const STARTING_MOVES    = 7;
const STARTING_HINTS    = 2;

// 1 survey day = ~3 seconds of game time. Purely a display unit; the
// underlying timer still counts seconds and the warn thresholds still
// trigger on seconds.
const SECONDS_PER_DAY = 3;


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
  /** Why this element exists in the town plan — shown on the card. */
  rationale: string;
  /** Where it should logically go — shown as a "PLANNING NOTE" when armed. */
  planningLogic: string;
  /** Why the chosen site works — shown via "ALLEN APPROVES" on a correct placement. */
  successReason: string;
  /** Why the chosen site doesn't — shown via "ALLEN RECONSIDERS" on a wrong placement. */
  wrongReason: string;
  startsUnlocked?: boolean;
}

const ZONES: MapZone[] = [
  { id: 'coal-yard',     label: 'COAL YARD',     x: 32, y: 10, width: 26, height: 16, correctElement: 'coal-yard' },
  { id: 'bridge',        label: 'BRIDGE',        x:  4, y: 44, width: 22, height: 14, correctElement: 'bridge' },
  { id: 'depot',         label: 'DEPOT',         x: 30, y: 65, width: 22, height: 16, correctElement: 'depot' },
  { id: 'main-street',   label: 'MAIN STREET',   x: 38, y: 38, width: 28, height: 14, correctElement: 'main-street' },
  { id: 'freight-house', label: 'FREIGHT HOUSE', x: 72, y: 30, width: 24, height: 16, correctElement: 'freight-house' },
];

// v5.1.12: every element now carries its planning logic — why it exists,
// where it belongs, and what counts as a right vs wrong placement. Copy
// is framed as planning logic ("A practical town plan would…",
// "Allen's survey would favor…") rather than historical certainty,
// since we don't have block-by-block evidence for 1762.
const ELEMENTS: PlaceableElement[] = [
  {
    id: 'main-street',
    label: 'MAIN STREET',
    rationale:
      'The town needs a central road to organise trade, homes, and civic life.',
    planningLogic:
      "A practical town plan would anchor Main Street at the centre, connecting the market blocks.",
    successReason:
      '"Main Street gives Allen’s town a civic spine."',
    wrongReason:
      '"The town’s spine belongs at the heart of the plan, not at its edges."',
    startsUnlocked: true,
  },
  {
    id: 'coal-yard',
    label: 'COAL YARD',
    rationale:
      'Fuel and bulk shipments need a working edge of town, clear of the civic blocks.',
    planningLogic:
      'The logic of trade suggests placing the coal yard near transport access, clear of the civic blocks.',
    successReason:
      '"The coal yard sits at the working edge, where shipments can move."',
    wrongReason:
      '"A coal yard would crowd the civic blocks. It belongs at the working edge."',
  },
  {
    id: 'depot',
    label: 'DEPOT',
    rationale:
      'Trade needs a receiving point near the main road and the water crossing.',
    planningLogic:
      "Allen’s survey would favour a depot near both the main road and the water crossing.",
    successReason:
      '"The depot now sits where goods can move between road and water."',
    wrongReason:
      '"A depot needs the main route within reach. This site is too far from trade."',
  },
  {
    id: 'freight-house',
    label: 'FREIGHT HOUSE',
    rationale:
      'Goods need storage close to the transport route — not in the civic centre.',
    planningLogic:
      'A practical town plan keeps the freight house close to the trade route, not the civic centre.',
    successReason:
      '"The freight house anchors the eastbound trade line."',
    wrongReason:
      '"A freight house has no place in the civic centre. Move it to the trade edge."',
  },
  {
    id: 'bridge',
    label: 'BRIDGE',
    rationale:
      'A crossing connects the settlement across Jordan Creek.',
    planningLogic:
      "Allen’s survey would place the bridge where the road meets Jordan Creek.",
    successReason:
      '"The bridge completes the crossing over Jordan Creek."',
    wrongReason:
      '"A bridge must cross water — not sit inside the town blocks."',
  },
];


// v5.1.12: random reconsider quotes removed. Each wrong placement now
// surfaces the element's own wrongReason from the ELEMENTS array, so
// the player learns WHY the placement was wrong, element by element.
//
// Fallback used only if a placement happens with an unrecognized id.
const FALLBACK_WRONG_REASON =
  '"This site is wrong for that element."';


// ── Building icons (inline SVG, drawn line-by-line) ──────────────
// Each icon is a small ink-line drawing rendered inside its zone
// when placed. Children inherit `currentColor` (brass-gold) from the
// `.allen-bldg` wrapper. `.allen-bldg-stroke` triggers the draw-in
// animation defined in polish.css.

function MainStreetIcon() {
  return (
    <svg className="allen-bldg" viewBox="0 0 60 36" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g className="allen-bldg-stroke">
        {/* Two rows of small lots flanking a central road */}
        <rect x="4"  y="4"  width="9" height="10" />
        <rect x="16" y="4"  width="9" height="10" />
        <rect x="35" y="4"  width="9" height="10" />
        <rect x="47" y="4"  width="9" height="10" />
        <rect x="4"  y="22" width="9" height="10" />
        <rect x="16" y="22" width="9" height="10" />
        <rect x="35" y="22" width="9" height="10" />
        <rect x="47" y="22" width="9" height="10" />
        {/* Central road */}
        <line x1="2" y1="18" x2="58" y2="18" />
        {/* Cross-road */}
        <line x1="30" y1="2" x2="30" y2="34" strokeDasharray="2 1.5" />
      </g>
    </svg>
  );
}

function CoalYardIcon() {
  return (
    <svg className="allen-bldg" viewBox="0 0 60 36" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g className="allen-bldg-stroke">
        {/* Coal pile (triangular heap) */}
        <path d="M4 30 L18 12 L32 30 Z" />
        <line x1="9"  y1="22" x2="27" y2="22" />
        <line x1="13" y1="26" x2="23" y2="26" />
        {/* Industrial building with smokestack */}
        <rect x="36" y="14" width="20" height="16" />
        <path d="M36 14 L46 6 L56 14" />
        <line x1="50" y1="6" x2="50" y2="2" />
        <circle cx="50" cy="1.5" r="1.5" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

function DepotIcon() {
  return (
    <svg className="allen-bldg" viewBox="0 0 60 36" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g className="allen-bldg-stroke">
        {/* Peaked-roof depot */}
        <path d="M8 24 L8 12 L30 4 L52 12 L52 24 Z" />
        <line x1="8"  y1="24" x2="52" y2="24" />
        {/* Door */}
        <rect x="26" y="14" width="8" height="10" />
        {/* Rail line below */}
        <line x1="0"  y1="30" x2="60" y2="30" />
        <line x1="0"  y1="33" x2="60" y2="33" />
        <line x1="6"  y1="29" x2="6"  y2="34" />
        <line x1="18" y1="29" x2="18" y2="34" />
        <line x1="30" y1="29" x2="30" y2="34" />
        <line x1="42" y1="29" x2="42" y2="34" />
        <line x1="54" y1="29" x2="54" y2="34" />
      </g>
    </svg>
  );
}

function BridgeIcon() {
  return (
    <svg className="allen-bldg" viewBox="0 0 60 36" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g className="allen-bldg-stroke">
        {/* Truss bridge deck */}
        <line x1="2"  y1="20" x2="58" y2="20" />
        <line x1="2"  y1="14" x2="58" y2="14" />
        <line x1="2"  y1="14" x2="2"  y2="20" />
        <line x1="58" y1="14" x2="58" y2="20" />
        {/* Truss diagonals */}
        <line x1="2"  y1="20" x2="14" y2="14" />
        <line x1="14" y1="20" x2="2"  y2="14" />
        <line x1="14" y1="20" x2="28" y2="14" />
        <line x1="28" y1="20" x2="14" y2="14" />
        <line x1="28" y1="20" x2="44" y2="14" />
        <line x1="44" y1="20" x2="28" y2="14" />
        <line x1="44" y1="20" x2="58" y2="14" />
        <line x1="58" y1="20" x2="44" y2="14" />
        {/* Water current beneath */}
        <path d="M0 28 Q15 26 30 28 T 60 28" />
        <path d="M0 32 Q15 30 30 32 T 60 32" />
      </g>
    </svg>
  );
}

function FreightHouseIcon() {
  return (
    <svg className="allen-bldg" viewBox="0 0 60 36" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g className="allen-bldg-stroke">
        {/* Long barn body with peaked roof */}
        <path d="M2 26 L2 14 L12 6 L52 6 L52 14 L58 14 L58 26 Z" />
        <line x1="2"  y1="26" x2="58" y2="26" />
        <line x1="12" y1="6"  x2="12" y2="26" />
        {/* Loading dock door */}
        <rect x="18" y="14" width="14" height="12" />
        <line x1="25" y1="14" x2="25" y2="26" />
        {/* Side door */}
        <rect x="38" y="16" width="8" height="10" />
        {/* Dock platform */}
        <line x1="2" y1="30" x2="58" y2="30" />
        <line x1="2" y1="30" x2="2"  y2="34" />
        <line x1="58" y1="30" x2="58" y2="34" />
      </g>
    </svg>
  );
}

function BuildingForElement({ id }: { id: string }) {
  switch (id) {
    case 'main-street':   return <MainStreetIcon />;
    case 'coal-yard':     return <CoalYardIcon />;
    case 'depot':         return <DepotIcon />;
    case 'bridge':        return <BridgeIcon />;
    case 'freight-house': return <FreightHouseIcon />;
    default: return null;
  }
}


// ── Diegetic HUD helpers ─────────────────────────────────────────
const ROMAN: Record<number, string> = {
  0: '0', 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII',
};
function toRoman(n: number): string {
  return ROMAN[n] ?? String(n);
}


// ── Props ────────────────────────────────────────────────────────────
interface AllenTownPlanningGameProps {
  config: GameConfig;
  onWin: () => void;
  onLose: () => void;
  quizShowing: boolean;
}


export function AllenTownPlanningGame({ config, onWin, onLose, quizShowing }: AllenTownPlanningGameProps) {
  // ── State (unchanged logic from v5.1.10) ───────────────────────────
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

  // v5.1.11: parchment slide-up on wrong placement. v5.1.12 makes the
  // quote element-specific so the player learns why the site doesn't fit.
  const [reconsiderMessage, setReconsiderMessage] = useState<string | null>(null);

  // v5.1.12: positive counterpart shown on correct placements. Pulls
  // each element's successReason; auto-dismisses on the next placement
  // attempt or on win.
  const [approveMessage, setApproveMessage] = useState<string | null>(null);

  const [activeQuizElementId, setActiveQuizElementId] = useState<string | null>(null);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizResult, setQuizResult]     = useState<'correct' | 'wrong' | null>(null);

  // ── Refs preserved from the v5.1.x lineage ────────────────────────
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
    // Clear the per-placement parchment so it doesn't linger over the
    // success screen during the phase transition.
    setApproveMessage(null);
    setReconsiderMessage(null);
    stopTimer();
    onWin();
  }, [onWin, stopTimer]);

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


  // ── Surface a parchment slide-up for 1.5s ─────────────────────────
  // v5.1.12: quotes are now element-specific so the player understands
  // why this particular element doesn't belong on the chosen site.
  const triggerReconsider = useCallback((elementId: string) => {
    const el = ELEMENTS.find((e) => e.id === elementId);
    setApproveMessage(null);
    setReconsiderMessage(el?.wrongReason ?? FALLBACK_WRONG_REASON);
    window.setTimeout(() => setReconsiderMessage(null), 1500);
  }, []);

  // v5.1.12: positive counterpart surfaced on correct placements.
  const triggerApprove = useCallback((elementId: string) => {
    const el = ELEMENTS.find((e) => e.id === elementId);
    if (!el) return;
    setReconsiderMessage(null);
    setApproveMessage(el.successReason);
    window.setTimeout(() => setApproveMessage(null), 1500);
  }, []);


  // ── Placement logic (penalty/state behavior unchanged) ───────────
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
      // v5.1.12: positive "ALLEN APPROVES" parchment with the element's
      // own reasoning. Suppressed on the FINAL placement so it doesn't
      // overlap the success-medallion transition.
      if (Object.keys(next).length >= ZONES.length) {
        completedRef.current = true;
        window.setTimeout(triggerWin, 400);
      } else {
        triggerApprove(elementId);
      }
    } else {
      // v5.1.11: parchment slide-up instead of red flash.
      // v5.1.12: element-specific wrongReason for the quote.
      triggerReconsider(elementId);
      setMovesLeft((m) => {
        const nextMoves = Math.max(0, m - 1);
        if (nextMoves <= 0) window.setTimeout(triggerLose, 480);
        return nextMoves;
      });
      setArmedElementId(null);
    }
  }, [placements, unlocked, triggerWin, triggerLose, triggerReconsider, triggerApprove]);


  // ── Tap interactions ─────────────────────────────────────────────
  const handleElementTap = useCallback((elementId: string) => {
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
  }, [placements, unlocked, quizShowing]);

  const handleZoneTap = useCallback((zoneId: string) => {
    if (!armedElementId) return;
    attemptPlacement(armedElementId, zoneId);
  }, [armedElementId, attemptPlacement]);


  // ── Pointer drag (unchanged) ─────────────────────────────────────
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
    if (!unlocked.has(elementId)) return;
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


  // ── Quiz handlers (unchanged) ────────────────────────────────────
  const activeQuiz = activeQuizElementId
    ? config.unlockQuestions?.find((q) => q.elementId === activeQuizElementId) ?? null
    : null;

  const handleQuizAnswer = useCallback((idx: number) => {
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
        const nextMoves = Math.max(0, m - 1);
        if (nextMoves <= 0) window.setTimeout(triggerLose, 480);
        return nextMoves;
      });
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


  // ── HINT + RESET (unchanged behavior) ───────────────────────────
  const handleHint = useCallback(() => {
    if (hintsLeft <= 0) return;
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
    setHintZoneId(null);
  }, []);


  // ── Derived values ───────────────────────────────────────────────
  const placed = Object.keys(placements).length;
  const cluesEarned = Math.max(
    0,
    unlocked.size - ELEMENTS.filter((e) => e.startsUnlocked).length,
  );
  const totalCluesAvailable = config.unlockQuestions?.length ?? 0;
  const surveyDaysLeft = Math.ceil(timeLeft / SECONDS_PER_DAY);
  const timeWarn  = timeLeft  <= 15 && timeLeft  > 0;
  const movesWarn = movesLeft <= 2  && movesLeft > 0;

  const nextLocked = ELEMENTS.find(
    (el) => !unlocked.has(el.id) && !Object.values(placements).includes(el.id),
  );

  const logicClues = config.logicClues ?? [];

  // The element currently in play (armed or being dragged) — used to
  // light up the matching brass crosshair on the correct zone only.
  const focusedElementId = draggingElementId ?? armedElementId;


  return (
    <div className="allen-planning-game">

      {/* HUD strip — v5.1.11 diegetic surveyor instruments ──────── */}
      <div className="game-hud" role="status" aria-live="polite">
        <div className="game-hud-stat hud-survey-days">
          <div className="game-hud-label">SURVEY DAYS</div>
          <div className={`game-hud-val${timeWarn ? ' game-time-warn' : ''}`}>
            <span className="hud-sundial" aria-hidden="true">◐</span>
            <span className="hud-num">{surveyDaysLeft}</span>
          </div>
        </div>
        <div className="game-hud-stat hud-resolve">
          <div className="game-hud-label">ALLEN'S RESOLVE</div>
          <div
            className={`game-hud-val hud-pips${movesWarn ? ' game-time-warn' : ''}`}
            aria-label={`${movesLeft} of ${STARTING_MOVES}`}
          >
            <span className="hud-pips-filled">{'●'.repeat(movesLeft)}</span>
            <span className="hud-pips-empty">{'○'.repeat(Math.max(0, STARTING_MOVES - movesLeft))}</span>
          </div>
        </div>
        <div className="game-hud-stat hud-journal">
          <div className="game-hud-label">JOURNAL</div>
          <div className="game-hud-val hud-roman">
            <span className="hud-roman-num">{toRoman(cluesEarned)}</span>
            <span className="hud-roman-sep">/</span>
            <span className="hud-roman-total">{toRoman(totalCluesAvailable)}</span>
          </div>
        </div>
      </div>

      {/* Map + zones — v5.1.11 ink topography ──────────────────── */}
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
            <linearGradient id="allenFoldCrease" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"  stopColor="rgba(0,0,0,0)" />
              <stop offset="49%" stopColor="rgba(0,0,0,0.18)" />
              <stop offset="50%" stopColor="rgba(255,235,200,0.05)" />
              <stop offset="51%" stopColor="rgba(0,0,0,0.18)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </linearGradient>
          </defs>

          {/* Parchment ground */}
          <rect width="400" height="280" fill="url(#allenParchBg)" />
          <rect width="400" height="280" fill="url(#allenParchGrid)" />

          {/* Ink contour lines — faint topography running parallel to the river */}
          <g stroke="#6b4e22" strokeWidth="0.4" fill="none" opacity="0.22">
            <path d="M60 0  Q72 60 66 120 Q60 180 78 280" />
            <path d="M88 0  Q102 60 96 120 Q90 180 108 280" />
            <path d="M118 0 Q130 60 124 120 Q120 180 136 280" />
            <path d="M156 0 Q166 60 162 120 Q160 180 174 280" />
          </g>

          {/* Old road from Philadelphia — diagonal dashed line entering SE */}
          <g opacity="0.55">
            <path
              d="M400 240 L120 110"
              stroke="#7a5c28" strokeWidth="1.5" strokeDasharray="5 3" fill="none"
            />
            {/* Mile markers — small Roman numerals along the road */}
            <g fontFamily="serif" fontSize="6" fill="#a07808" opacity="0.65">
              <text x="328" y="207" transform="rotate(-22 328 207)">II</text>
              <text x="248" y="170" transform="rotate(-22 248 170)">V</text>
              <text x="168" y="133" transform="rotate(-22 168 133)">VIII</text>
            </g>
            <text x="394" y="252" fontSize="5" fill="#7a5c28" textAnchor="end"
                  fontFamily="serif" fontStyle="italic" opacity="0.65">
              to Philadelphia
            </text>
          </g>

          {/* Jordan Creek — main river */}
          <path d="M28 0 Q44 60 38 120 Q30 180 50 280"
                stroke="#1a3a4a" strokeWidth="11" fill="none" opacity="0.55" strokeLinecap="round" />
          <path d="M28 0 Q44 60 38 120 Q30 180 50 280"
                stroke="#284f60" strokeWidth="4" fill="none" opacity="0.4" strokeLinecap="round" />

          {/* River current marks — short cross-hatches showing flow */}
          <g stroke="#9ec0d0" strokeWidth="0.4" opacity="0.45" fill="none">
            <line x1="35" y1="20"  x2="42" y2="14"  />
            <line x1="40" y1="60"  x2="48" y2="55"  />
            <line x1="40" y1="100" x2="48" y2="95"  />
            <line x1="34" y1="140" x2="42" y2="135" />
            <line x1="32" y1="180" x2="40" y2="176" />
            <line x1="38" y1="220" x2="46" y2="216" />
            <line x1="44" y1="260" x2="52" y2="256" />
          </g>

          {/* Stippled forest patches — small dot clusters NW + SE */}
          <g fill="#2a3618" opacity="0.55">
            {/* NW cluster */}
            <circle cx="104" cy="38"  r="1.4" />
            <circle cx="112" cy="44"  r="1.2" />
            <circle cx="118" cy="36"  r="1.3" />
            <circle cx="124" cy="42"  r="1.0" />
            <circle cx="130" cy="50"  r="1.4" />
            <circle cx="116" cy="56"  r="1.2" />
            <circle cx="108" cy="50"  r="1.0" />
            <circle cx="138" cy="42"  r="1.1" />
            <circle cx="146" cy="52"  r="1.3" />
            <circle cx="132" cy="60"  r="1.2" />
            <circle cx="122" cy="62"  r="1.0" />
            <circle cx="100" cy="48"  r="1.0" />
            {/* SE cluster */}
            <circle cx="332" cy="244" r="1.3" />
            <circle cx="346" cy="238" r="1.2" />
            <circle cx="356" cy="248" r="1.4" />
            <circle cx="362" cy="232" r="1.0" />
            <circle cx="372" cy="244" r="1.2" />
            <circle cx="350" cy="256" r="1.0" />
            <circle cx="338" cy="258" r="1.1" />
            <circle cx="324" cy="252" r="1.0" />
          </g>

          {/* Parchment fold crease — subtle diagonal across the map */}
          <rect width="400" height="280" fill="url(#allenFoldCrease)" opacity="0.55" />

          {/* Compass rose NE */}
          <g transform="translate(370 30)" opacity="0.6">
            <circle cx="0" cy="0" r="14" fill="none" stroke="#a07808" strokeWidth="0.7" />
            <line x1="0" y1="-13" x2="0" y2="-1" stroke="#a07808" strokeWidth="1.2" />
            <polygon points="0,-16 -3,-8 3,-8" fill="#a07808" />
            <line x1="-12" y1="0" x2="-2"  y2="0"  stroke="#a07808" strokeWidth="0.6" />
            <line x1="12"  y1="0" x2="2"   y2="0"  stroke="#a07808" strokeWidth="0.6" />
            <line x1="0"   y1="12" x2="0"  y2="2"  stroke="#a07808" strokeWidth="0.6" />
            <text x="0" y="22" fontSize="6" fill="#a07808" textAnchor="middle" fontFamily="serif">N</text>
          </g>

          {/* Surveyor label */}
          <text x="20" y="270" fontSize="6" fill="#6b4e22" opacity="0.6"
                fontFamily="'IM Fell English', serif" letterSpacing="0.16em">
            SURVEY MAP · ALLEN TRACT · ANNO 1762
          </text>

          {/* v5.1.12 region labels — period-correct italic IM Fell at
              low opacity so they read as map annotations rather than UI.
              They give the player a mental model of WHERE each kind of
              element belongs, without crowding the canvas. */}
          <g
            fontFamily="'IM Fell English', serif"
            fontStyle="italic"
            fill="#a07808"
            opacity="0.5"
          >
            {/* Jordan Creek — vertical, beside the river */}
            <text x="16" y="170" fontSize="8" transform="rotate(-86 16 170)">
              Jordan Creek
            </text>
            {/* civic core — near MAIN STREET */}
            <text x="172" y="100" fontSize="7" letterSpacing="0.16em">civic core</text>
            {/* industrial edge — north, near COAL YARD */}
            <text x="148" y="22" fontSize="7" letterSpacing="0.16em">industrial edge</text>
            {/* crossing point — between river + BRIDGE */}
            <text x="56" y="178" fontSize="7" letterSpacing="0.16em">crossing point</text>
            {/* trade edge — east, near FREIGHT HOUSE */}
            <text x="304" y="86" fontSize="7" letterSpacing="0.16em">trade edge</text>
          </g>
        </svg>

        {ZONES.map((zone) => {
          const filled = !!placements[zone.id];
          const elementHere = placements[zone.id];
          const targeted = !filled && hoverZoneId === zone.id;
          const isArmedTarget = !filled && focusedElementId !== null && zone.correctElement === focusedElementId;
          const hinted = hintZoneId === zone.id;
          const cls = [
            'allen-map-zone',
            filled        ? 'filled'        : '',
            targeted      ? 'targeted'      : '',
            isArmedTarget ? 'armed-target'  : '',
            hinted        ? 'hinted'        : '',
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
              aria-label={`${zone.label} site${filled ? ' — placed' : ''}`}
            >
              {filled && elementHere ? (
                <BuildingForElement id={elementHere} />
              ) : (
                <>
                  {/* Faint dot marker when empty; brass crosshair when armed for this zone */}
                  {isArmedTarget ? (
                    <svg className="allen-map-zone-crosshair" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="0.8" />
                      <line x1="12" y1="2"  x2="12" y2="22" stroke="currentColor" strokeWidth="0.8" />
                      <line x1="2"  y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="0.8" />
                      <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                  ) : (
                    <span className="allen-map-zone-marker" aria-hidden="true" />
                  )}
                  {/* Label only when armed for this zone (player gets confirmation) */}
                  {isArmedTarget && (
                    <span className="allen-map-zone-label">{zone.label}</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Action bar — HINT + RESET (unchanged) ─────────────────── */}
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

      {/* Quiz overlay OR element rail + clues + next ─────────── */}
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
              Not quite — lost 1 day. Try again.
            </div>
          )}
        </div>
      ) : (
        <>
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
                  {/* v5.1.12: card now shows WHY this element exists in
                      the town plan, not just a one-line hint. */}
                  <div className="allen-element-blurb">{el.rationale}</div>
                  {isPlaced && <div className="allen-element-check" aria-hidden="true">✓ PLACED</div>}
                  {isLocked && <div className="allen-element-locked" aria-hidden="true">TAP TO UNLOCK</div>}
                </div>
              );
            })}
          </div>

          {/* v5.1.12: when an element is armed, replace the generic hint
              with its planning logic — a small "PLANNING NOTE" surfacing
              the reasoning for where this element belongs. */}
          {armedElementId ? (
            (() => {
              const armed = ELEMENTS.find((e) => e.id === armedElementId);
              return (
                <div className="allen-planning-note">
                  <span className="allen-planning-eyebrow">PLANNING NOTE</span>
                  <span className="allen-planning-text">
                    {armed?.planningLogic ?? 'Place this element on the map.'}
                  </span>
                </div>
              );
            })()
          ) : (
            <div className="allen-elements-hint">
              {nextLocked
                ? 'Tap a locked element to answer its Tale clue.'
                : 'Tap an element to arm it, or drag it onto the map.'}
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

      {/* v5.1.11: parchment slide-up on wrong placement.
         v5.1.12: quote is now element-specific. */}
      {reconsiderMessage && (
        <div className="allen-reconsider" role="status" aria-live="polite">
          <div className="allen-reconsider-eyebrow">ALLEN RECONSIDERS</div>
          <div className="allen-reconsider-quote">{reconsiderMessage}</div>
        </div>
      )}

      {/* v5.1.12: positive parchment on correct placement, surfacing
         the element's own successReason so the player learns why the
         site works. Auto-dismisses; suppressed on the final placement
         so it doesn't overlap the medallion transition. */}
      {approveMessage && (
        <div className="allen-approve" role="status" aria-live="polite">
          <div className="allen-approve-eyebrow">ALLEN APPROVES</div>
          <div className="allen-approve-quote">{approveMessage}</div>
        </div>
      )}
    </div>
  );
}
