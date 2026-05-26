// ================== GAME CONFIGURATIONS ==================
// Per-tale game type and metadata.
// Badge keys must match the values in tales.ts exactly.
//
// v5.1.7+: extended with `unlockQuestions` and `logicClues` to support
// the interleaved unlock-quiz flow. The legacy single-question fields
// (`quizQuestion`, `quizOptions`, `quizCorrectIndex`) are kept for any
// game type that still uses the post-puzzle quiz pattern.

export type GameType = 'grid' | 'spike' | 'match';

export interface UnlockQuestion {
  /** Element id this question unlocks when answered correctly. Must match
   *  an entry in the planning game's ELEMENTS array. */
  elementId: string;
  question: string;
  options: string[];
  correctIndex: number;
}

export interface GameConfig {
  taleId: string;
  type: GameType;
  badgeKey: string;  // localStorage key for the game badge
  title: string;
  instructions: string;
  successTitle: string;
  successMsg: string;

  // ── Legacy single post-puzzle quiz (still used by spike + match) ──
  quizQuestion: string;
  quizOptions: string[];
  quizCorrectIndex: number;

  // ── v5.1.7+ Planning-game additions ──────────────────────────────
  /** Inline unlock questions, one per locked element (4 for the grid
   *  game; the first element starts unlocked for free). Optional so
   *  non-planning games can ignore. */
  unlockQuestions?: UnlockQuestion[];
  /** Short placement hints surfaced in the Tale Logic Clues panel. */
  logicClues?: string[];
}

// ── Allen Town Grid ──────────────────────────────────────────────────────────
export const ALLEN_TOWN_GAME: GameConfig = {
  taleId: 'wa-lager',
  type: 'grid',
  badgeKey: 'game:wa-lager',
  title: "LAY OUT ALLEN'S TOWN",
  instructions:
    'Allen drew Allentown as a 42-block grid in 1762. Place the COAL YARD, DEPOT, FREIGHT HOUSE, BRIDGE, and MAIN STREET in the right spots — use clues from the Tale to unlock each one.',
  successTitle: 'STREETS LAID',
  successMsg:
    "You laid the first streets of Allen's Town. The grid you just traced is still the layout of downtown Allentown today.",

  // Legacy field — unused by the planning game but kept for type safety.
  quizQuestion: 'What year did William Allen officially lay out the town of Allentown?',
  quizOptions: ['1735', '1762', '1777', '1780'],
  quizCorrectIndex: 1,

  // v5.1.7+ interleaved unlock questions. MAIN STREET starts unlocked
  // for free so the player can immediately make a move; the other four
  // open up as the player answers each clue correctly.
  unlockQuestions: [
    {
      elementId: 'coal-yard',
      question: 'When did William Allen acquire his Lehigh Valley tract?',
      options: ['1704', '1735', '1762', '1780'],
      correctIndex: 1,
    },
    {
      elementId: 'depot',
      question: 'How many lots did Allen lay out in his 1762 town plan?',
      options: ['256', '500', '756', '1,000'],
      correctIndex: 2,
    },
    {
      elementId: 'freight-house',
      question: "What was William Allen's highest judicial office?",
      options: [
        'Mayor of Philadelphia',
        'Governor of Pennsylvania',
        'Chief Justice of Pennsylvania',
        'Supreme Court Justice',
      ],
      correctIndex: 2,
    },
    {
      elementId: 'bridge',
      question: 'Where was the Liberty Bell hidden during the Revolution?',
      options: [
        'Boston',
        'Carpenters’ Hall, Philadelphia',
        'Albany',
        'Beneath Zion Reformed Church in Allentown',
      ],
      correctIndex: 3,
    },
  ],

  // v5.1.7 logic clues — short placement hints surfaced in the bottom
  // panel beside the lantern. These are GAME hints (where things go),
  // distinct from the unlock QUIZ questions (Tale trivia).
  logicClues: [
    'Coal shipments arrived from upper-valley mines to the north.',
    'Jordan Creek bends along the western edge of the tract.',
    'The depot sits at the river crossing, near the town’s spine.',
    'Freight cars roll east toward the iron works.',
  ],
};

// ── Packer Rail Route ───────────────────────────────────────────────────────
// v5.1.14: rebuilt from the old spike-tap into a sequenced rail-building
// puzzle. Five LVRR junctions must be laid west-to-east. Each junction
// has its own card, its own unlock quiz, and its own placement reason.
export const PACKER_RAIL_GAME: GameConfig = {
  taleId: 'packer-pils',
  type: 'spike',
  badgeKey: 'game:packer-pils',
  title: 'BUILD THE LEHIGH VALLEY LINE',
  instructions:
    "Asa Packer's Lehigh Valley Railroad ran west-to-east, from the Mauch Chunk coal seams to the Delaware at Easton. Lay each junction in order — use the Tale clues to know which stop comes next.",
  successTitle: 'THE LINE IS LAID',
  successMsg:
    'Forty-six miles of iron between Mauch Chunk and Easton. Packer\'s coal trains roll east — and the valley starts to move.',

  // Legacy single quiz preserved for type safety; the route game uses
  // unlockQuestions below.
  quizQuestion: 'What did the Bethlehem Iron Company — founded to supply Packer\'s railroad with rails — eventually become?',
  quizOptions: ['U.S. Steel', 'Bethlehem Steel', 'Carnegie Steel', 'Lehigh Iron'],
  quizCorrectIndex: 1,

  // Four unlock questions, one per locked junction. MAUCH CHUNK starts
  // unlocked (it's the western terminus — where the line begins).
  unlockQuestions: [
    {
      elementId: 'parryville',
      question: 'In what year did the Lehigh Valley Railroad open between Mauch Chunk and Easton?',
      options: ['1840', '1855', '1865', '1880'],
      correctIndex: 1,
    },
    {
      elementId: 'lehighton',
      question: "What did Packer's coal trains carry east toward Philadelphia and New York?",
      options: ['Iron ore', 'Anthracite coal', 'Lumber', 'Wheat'],
      correctIndex: 1,
    },
    {
      elementId: 'bethlehem',
      question: "What did the Bethlehem Iron Company — founded to supply Packer's rails — eventually become?",
      options: ['U.S. Steel', 'Bethlehem Steel', 'Carnegie Steel', 'Lehigh Iron'],
      correctIndex: 1,
    },
    {
      elementId: 'easton',
      question: 'How many miles did the LVRR mainline cover between Mauch Chunk and Easton?',
      options: ['24', '36', '46', '60'],
      correctIndex: 2,
    },
  ],

  logicClues: [
    'Coal trains roll east, down from the western mountains.',
    'The Lehigh River guides the line from Mauch Chunk to Easton.',
    "The iron works at Bethlehem feed Packer's mainline.",
    'Each junction can only be laid after the one before it.',
  ],
};

// ── Wooden Match Station ────────────────────────────────────────────────────
// v5.1.15: rebuilt from the old strike-the-match into a preservation-
// decision puzzle. Five heritage artifacts. For each, the player picks
// the right preservation action from four options. Correct → that
// artifact's room lights amber. Wrong → "THE MATCH FALTERS" + 1 mistake.
//
// The mechanic is deliberately distinct from W.A. (spatial sorting) and
// Packer (sequencing). Here it's curation: pick the right action for
// each historic object. There's no separate unlock-quiz step — the
// decisions ARE the quiz, interleaved with the gameplay.
export const WOODEN_MATCH_GAME: GameConfig = {
  taleId: 'wooden-match',
  type: 'match',
  badgeKey: 'game:wooden-match',
  title: 'PRESERVE THE STATION LIGHT',
  instructions:
    "The old Wooden Match station has been dark since 1967. Walk the rooms by lantern light, decide what to do with each heritage piece, and bring the station back to life — without erasing what's there.",
  successTitle: 'STATION RELIT',
  successMsg:
    "The lanterns are back on. A hundred and fifty years of footsteps, and the room remembers every one. The match holds.",

  // Legacy single quiz preserved for type safety; the station game uses
  // the per-artifact decisions in unlockQuestions instead.
  quizQuestion: 'When did the last scheduled passenger train depart the Bethlehem CNJ station?',
  quizOptions: ['August 18, 1967', 'December 12, 1970', 'March 3, 1975', 'June 11, 1955'],
  quizCorrectIndex: 0,

  // v5.1.15: each entry is a per-artifact decision. elementId references
  // an artifact in WoodenStationGame's ARTIFACTS array; the question is
  // "what should we do with the [artifact]?"; options are 4 actions; the
  // correctIndex picks the preservation-appropriate action.
  unlockQuestions: [
    {
      elementId: 'lantern',
      question: 'The brass station lantern over the platform door is dark. What should be done with it?',
      options: [
        'Replace it with a modern electric light',
        'Light it with a fresh wick',
        'Remove the lantern entirely',
        'Paint the brass a brighter colour',
      ],
      correctIndex: 1,
    },
    {
      elementId: 'bar',
      question: 'The long pine bar is scarred from a century of glasses and forearms. What should be done with it?',
      options: [
        'Sand and re-varnish the original wood',
        'Replace it with a modern bar',
        'Paint it a new colour',
        'Remove it entirely',
      ],
      correctIndex: 0,
    },
    {
      elementId: 'window',
      question: 'The leaded-glass trackside window has two cracks. What should be done with it?',
      options: [
        'Replace it with modern plate glass',
        'Board it up permanently',
        'Lead-seal the cracks, keep the glass',
        'Remove the window altogether',
      ],
      correctIndex: 2,
    },
    {
      elementId: 'floorboards',
      question: 'The wide-plank pine floorboards are worn smooth by 150 years of footsteps. What should be done with them?',
      options: [
        'Tile over the floor',
        'Sand the boards down to raw wood',
        'Wax and seal the existing boards',
        'Carpet the floor wall to wall',
      ],
      correctIndex: 2,
    },
    {
      elementId: 'sign',
      question: 'The cast-iron platform sign — WOODEN MATCH STATION — is weathered but legible. What should be done with it?',
      options: [
        'Replace it with a printed sign',
        'Restore the patina, keep the original',
        'Repaint it bright white',
        'Remove the sign and store it away',
      ],
      correctIndex: 1,
    },
  ],

  // Short preservation principles that guide every decision. Surfaced in
  // the bottom Logic Clues panel.
  logicClues: [
    'Restore — don\'t replace. The original is the heritage.',
    'Wear and patina are proof. Keep them visible.',
    'Light the room with the same brass that lit it in 1868.',
    'Every footstep matters. Preserve what carried them.',
  ],
};

export const GAME_CONFIGS: GameConfig[] = [
  ALLEN_TOWN_GAME,
  PACKER_RAIL_GAME,
  WOODEN_MATCH_GAME,
];

export function getGameConfig(taleId: string): GameConfig | undefined {
  return GAME_CONFIGS.find((g) => g.taleId === taleId);
}
