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

// ── Wooden Match ─────────────────────────────────────────────────────────────
export const WOODEN_MATCH_GAME: GameConfig = {
  taleId: 'wooden-match',
  type: 'match',
  badgeKey: 'game:wooden-match',
  title: 'STRIKE THE MATCH',
  instructions:
    'The old station has been dark since 1967. Swipe across the strike strip to light a match — every strike lights one of the station lamps. Light all five.',
  successTitle: 'STATION LIT',
  successMsg:
    'The old station lights up again. A hundred and fifty years of footsteps, and the lamps are still on.',
  quizQuestion: 'When did the last scheduled passenger train depart the Bethlehem CNJ station?',
  quizOptions: ['August 18, 1967', 'December 12, 1970', 'March 3, 1975', 'June 11, 1955'],
  quizCorrectIndex: 0,
};

export const GAME_CONFIGS: GameConfig[] = [
  ALLEN_TOWN_GAME,
  PACKER_RAIL_GAME,
  WOODEN_MATCH_GAME,
];

export function getGameConfig(taleId: string): GameConfig | undefined {
  return GAME_CONFIGS.find((g) => g.taleId === taleId);
}
