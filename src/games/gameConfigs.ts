// ================== GAME CONFIGURATIONS ==================
// Per-tale game type and metadata.
// Badge keys must match the values in tales.ts exactly.

export type GameType = 'grid' | 'spike' | 'match';

export interface GameConfig {
  taleId: string;
  type: GameType;
  badgeKey: string;  // localStorage key for the game badge
  title: string;
  instructions: string;
  successTitle: string;
  successMsg: string;
  quizQuestion: string;
  quizOptions: string[];
  quizCorrectIndex: number;
}

// ── Allen Town Grid ──────────────────────────────────────────────────────────
export const ALLEN_TOWN_GAME: GameConfig = {
  taleId: 'wa-lager',
  type: 'grid',
  badgeKey: 'game:wa-lager',
  title: "LAY OUT ALLEN'S TOWN",
  instructions:
    'Allen drew Allentown as a 42-block grid in 1762. Tap the lots in order to lay the first streets of his town — the pulsing block is your next stop.',
  successTitle: 'STREETS LAID',
  successMsg:
    "You laid the first streets of Allen's Town. The grid you just traced is still the layout of downtown Allentown today.",
  quizQuestion: 'What year did William Allen officially lay out the town of Allentown?',
  quizOptions: ['1735', '1762', '1777', '1780'],
  quizCorrectIndex: 1,
};

// ── Packer Rail Spike ────────────────────────────────────────────────────────
export const PACKER_RAIL_GAME: GameConfig = {
  taleId: 'packer-pils',
  type: 'spike',
  badgeKey: 'game:packer-pils',
  title: 'DRIVE THE RAIL SPIKES',
  instructions:
    "Packer's crews drove thousands of spikes to lay the Lehigh Valley line. Tap each spike on the rail before it slips by — land 8 of 12 to earn your badge.",
  successTitle: 'LINE COMPLETE',
  successMsg:
    'The line is set. The valley is moving. Forty-six miles of iron between Easton and Mauch Chunk — and the coal that built America starts rolling.',
  quizQuestion: 'What did the Bethlehem Iron Company — founded to supply Packer\'s railroad with rails — eventually become?',
  quizOptions: ['U.S. Steel', 'Bethlehem Steel', 'Carnegie Steel', 'Lehigh Iron'],
  quizCorrectIndex: 1,
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
