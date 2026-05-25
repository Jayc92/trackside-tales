import React, { useCallback, useEffect, useRef, useState } from 'react';

// =====================================================================
// W.A. LAGER PLANNING GAME — v5.1.3 through v5.1.6 rollup
// ---------------------------------------------------------------------
// Replaces the simple 7×6 tap-in-sequence AllenTownGame with a richer
// historical-planning puzzle:
//
//   v5.1.3  Parchment map background + five named drop zones
//   v5.1.4  5-stat HUD strip (PROGRESS / TIME / CLUE POINTS / MOVES / BADGE)
//   v5.1.5  Side rail of element cards with tap-to-place
//   v5.1.6  Pointer-based drag-and-drop (mobile-first)
//
// The component keeps the same { onWin, onLose, quizShowing } prop
// contract as the v5.1.2 AllenTownGame so GameOverlay.tsx just swaps
// the import. Win condition: all five elements placed in their correct
// zones. Lose condition: moves reach 0 or time reaches 0.
//
// CLUE POINTS in the HUD is a placeholder for v5.1.7 (Tale Logic Clues
// panel). Held at a static "0/5" for now so the slot stays in place
// when the panel ships.
// =====================================================================


// ── Game tuning ──────────────────────────────────────────────────────
const GAME_DURATION_SEC = 90;
const STARTING_MOVES    = 7;


// ── Element + zone definitions ───────────────────────────────────────
// IDs intentionally match between element and zone so the "correct"
// pairing is just `element.id === zone.correctElement`. The visual
// label may be slightly different (e.g. zone shows "MAIN STREET" while
// the element is also labelled "MAIN STREET" — they're the same thing).
// Positions are percentages of the SVG viewBox (0–100).

interface MapZone {
  id: string;
  label: string;
  /** Top-left corner X as % of map width */
  x: number;
  /** Top-left corner Y as % of map height */
  y: number;
  /** Width  as % of map width */
  width: number;
  /** Height as % of map height */
  height: number;
  /** Which element id belongs here */
  correctElement: string;
}

interface PlaceableElement {
  id: string;
  label: string;
  /** Short historical hint surfaced on the card */
  blurb: string;
}

// Zones positioned to evoke the storyboard's Allentown survey-map layout.
// COAL YARD sits north, BRIDGE crosses the Jordan-Creek-shaped river on
// the west, DEPOT sits at the river crossing, MAIN STREET runs through
// the center, FREIGHT HOUSE sits east of the line.
const ZONES: MapZone[] = [
  { id: 'coal-yard',     label: 'COAL YARD',     x: 32, y: 10, width: 26, height: 16, correctElement: 'coal-yard' },
  { id: 'bridge',        label: 'BRIDGE',        x:  4, y: 44, width: 22, height: 14, correctElement: 'bridge' },
  { id: 'depot',         label: 'DEPOT',         x: 30, y: 65, width: 22, height: 16, correctElement: 'depot' },
  { id: 'main-street',   label: 'MAIN STREET',   x: 38, y: 38, width: 28, height: 14, correctElement: 'main-street' },
  { id: 'freight-house', label: 'FREIGHT HOUSE', x: 72, y: 30, width: 24, height: 16, correctElement: 'freight-house' },
];

const ELEMENTS: PlaceableElement[] = [
  { id: 'coal-yard',     label: 'COAL YARD',     blurb: 'Receives shipments from upper-valley mines.' },
  { id: 'depot',         label: 'DEPOT',         blurb: 'Built near the central river crossing.' },
  { id: 'freight-house', label: 'FREIGHT HOUSE', blurb: 'Serves the eastbound line.' },
  { id: 'bridge',        label: 'BRIDGE',        blurb: 'Spans Jordan Creek to the west.' },
  { id: 'main-street',   label: 'MAIN STREET',   blurb: 'The town spine — runs through center.' },
];


// ── Props ────────────────────────────────────────────────────────────
interface AllenTownPlanningGameProps {
  onWin: () => void;
  onLose: () => void;
  quizShowing: boolean;
}


export function AllenTownPlanningGame({ onWin, onLose, quizShowing }: AllenTownPlanningGameProps) {
  // ── State ──────────────────────────────────────────────────────────
  // `placements` maps zoneId → elementId for filled zones.
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [movesLeft, setMovesLeft]   = useState(STARTING_MOVES);
  const [timeLeft, setTimeLeft]     = useState(GAME_DURATION_SEC);

  // Tap-to-place: which element is "armed" for the next zone tap.
  const [armedElementId, setArmedElementId] = useState<string | null>(null);

  // Drag state. We mirror into refs because pointermove handlers attached
  // to the window read these synchronously — React state alone would lag
  // a render behind.
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [hoverZoneId, setHoverZoneId] = useState<string | null>(null);

  // Brief visual flash when a wrong placement is attempted.
  const [invalidZoneId, setInvalidZoneId] = useState<string | null>(null);

  // ── Refs preserved verbatim from the v4.6.1 → v5.1.2 lineage ───────
  const completedRef = useRef(false);  // set sync at puzzle completion
  const winFiredRef  = useRef(false);  // prevents duplicate onWin
  const loseFiredRef = useRef(false);  // prevents duplicate onLose
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


  // ── Lose / Win triggers (guarded against double-fire) ──────────────
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
    if (placements[zoneId]) return; // zone already filled — no-op

    const zone = ZONES.find((z) => z.id === zoneId);
    if (!zone) return;

    // Also reject if this element is already placed somewhere (no swaps).
    const alreadyPlaced = Object.values(placements).includes(elementId);
    if (alreadyPlaced) return;

    if (zone.correctElement === elementId) {
      // Correct → snap in
      const next = { ...placements, [zoneId]: elementId };
      setPlacements(next);
      setArmedElementId(null);

      // Win when all five zones filled — set the sync flag BEFORE the
      // setTimeout so a runaway timer can't fire triggerLose first.
      if (Object.keys(next).length >= ZONES.length) {
        completedRef.current = true;
        // Tiny beat so the success-snap animation registers visually.
        window.setTimeout(triggerWin, 350);
      }
    } else {
      // Wrong → cost a move, flash the zone red
      setInvalidZoneId(zoneId);
      window.setTimeout(() => setInvalidZoneId(null), 450);
      setMovesLeft((m) => {
        const next = Math.max(0, m - 1);
        if (next <= 0) {
          // Out of moves → lose. Defer so React has the chance to flush
          // the flash before the parent unmounts us.
          window.setTimeout(triggerLose, 480);
        }
        return next;
      });
      setArmedElementId(null);
    }
  }, [placements, triggerWin, triggerLose]);


  // ── Tap-to-place: arm an element, then tap a zone ──────────────────
  const handleElementTap = useCallback((elementId: string) => {
    if (completedRef.current || quizShowing) return;
    // If this element is already placed, ignore taps on it.
    if (Object.values(placements).includes(elementId)) return;
    setArmedElementId((current) => (current === elementId ? null : elementId));
  }, [placements, quizShowing]);

  const handleZoneTap = useCallback((zoneId: string) => {
    if (!armedElementId) return;
    attemptPlacement(armedElementId, zoneId);
  }, [armedElementId, attemptPlacement]);


  // ── Pointer drag: drag a card → drop on a zone ────────────────────
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
    if (Object.values(placements).includes(elementId)) return;
    // Capture the pointer so subsequent moves/ups come back to this element
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragStateRef.current = { elementId, hoverZoneId: null };
    setDraggingElementId(elementId);
    setDragPos({ x: e.clientX, y: e.clientY });
    setArmedElementId(null);
  }, [placements, quizShowing]);

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
    // Re-hit-test on release in case the pointer moved between last
    // move event and release.
    const zoneId = hitTestZone(e.clientX, e.clientY);
    dragStateRef.current = { elementId: null, hoverZoneId: null };
    setDraggingElementId(null);
    setDragPos(null);
    setHoverZoneId(null);
    if (zoneId) attemptPlacement(elementId, zoneId);
  }, [attemptPlacement]);


  // ── Render helpers ─────────────────────────────────────────────────
  const placed = Object.keys(placements).length;
  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const timeWarn = timeLeft <= 15 && timeLeft > 0;
  const movesWarn = movesLeft <= 2 && movesLeft > 0;


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
          <div className="game-hud-val">0/5</div>
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
          {/* Jordan Creek — west river */}
          <path
            d="M28 0 Q44 60 38 120 Q30 180 50 280"
            stroke="#1a3a4a" strokeWidth="11" fill="none" opacity="0.55" strokeLinecap="round"
          />
          <path
            d="M28 0 Q44 60 38 120 Q30 180 50 280"
            stroke="#284f60" strokeWidth="4" fill="none" opacity="0.4" strokeLinecap="round"
          />
          {/* Forest stipple NW */}
          <circle cx="118" cy="40" r="14" fill="#2a3618" opacity="0.4" />
          <circle cx="135" cy="55" r="9"  fill="#2a3618" opacity="0.35" />
          <circle cx="105" cy="52" r="8"  fill="#2a3618" opacity="0.3" />
          <circle cx="350" cy="240" r="11" fill="#2a3618" opacity="0.32" />
          <circle cx="365" cy="225" r="7"  fill="#2a3618" opacity="0.28" />
          {/* Compass rose NE */}
          <g transform="translate(370 30)" opacity="0.6">
            <circle cx="0" cy="0" r="14" fill="none" stroke="#a07808" strokeWidth="0.7" />
            <line x1="0" y1="-13" x2="0" y2="-1" stroke="#a07808" strokeWidth="1.2" />
            <polygon points="0,-16 -3,-8 3,-8" fill="#a07808" />
            <text x="0" y="22" fontSize="6" fill="#a07808" textAnchor="middle" fontFamily="serif">N</text>
          </g>
          {/* Survey label */}
          <text
            x="20" y="270" fontSize="6" fill="#6b4e22" opacity="0.55"
            fontFamily="'Source Code Pro', monospace" letterSpacing="0.12em"
          >
            SURVEY MAP · ALLEN TRACT · 1762
          </text>
        </svg>

        {/* Zones */}
        {ZONES.map((zone) => {
          const filled = !!placements[zone.id];
          const targeted = !filled && hoverZoneId === zone.id;
          const invalid  = invalidZoneId === zone.id;
          const armedAndZone = !filled && armedElementId !== null;
          const cls = [
            'allen-map-zone',
            filled    ? 'filled'    : '',
            targeted  ? 'targeted'  : '',
            invalid   ? 'invalid'   : '',
            armedAndZone ? 'armed-target' : '',
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

      {/* Element rail ─────────────────────────────────────────── */}
      <div className="allen-elements-rail-label">PLACE THESE ELEMENTS</div>
      <div
        className="allen-elements-rail"
        role="list"
        aria-label="Buildings and infrastructure to place"
      >
        {ELEMENTS.map((el) => {
          const isPlaced  = Object.values(placements).includes(el.id);
          const isArmed   = armedElementId === el.id;
          const isDragging = draggingElementId === el.id;
          const cls = [
            'allen-element-card',
            isPlaced   ? 'placed'   : '',
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
              onClick={() => { if (!isPlaced) handleElementTap(el.id); }}
              aria-pressed={isArmed}
              aria-disabled={isPlaced}
            >
              <div className="allen-element-icon" aria-hidden="true">◈</div>
              <div className="allen-element-label">{el.label}</div>
              <div className="allen-element-blurb">{el.blurb}</div>
              {isPlaced && <div className="allen-element-check" aria-hidden="true">✓ PLACED</div>}
            </div>
          );
        })}
      </div>

      {/* Helper line under the rail */}
      <div className="allen-elements-hint">
        {armedElementId
          ? 'Tap a zone on the map to place this element.'
          : 'Tap an element to arm it, or drag it onto a zone.'}
      </div>

      {/* Floating drag ghost */}
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
