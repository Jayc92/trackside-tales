// ================== SHARED TYPES ==================

export interface StoryBlock {
  type: 'p' | 'quote' | 'h2' | 'h3';
  text?: string;
  cite?: string;
}

export interface MapPin {
  x: number;
  y: number;
  label: string;
  year: string;
  title: string;
  desc: string;
}

export interface TimelineEvent {
  year: string;
  event: string;
  detail: string;
  major?: boolean;
}

export interface Badge {
  icon: string;
  title: string;
  desc: string;
}

export interface GameConfig {
  type: 'grid' | 'spike' | 'match';
  title: string;
  instructions: string;
  successTitle: string;
  successMsg: string;
}

export interface BarSummary {
  who: string;
  why: string;
  beer: string;
}

export interface StillHere {
  place: string;
  detail: string;
}

export interface PersonInfo {
  name: string;
  dates: string;
  role: string;
  initials: string;
  portrait?: string;
}

export interface Tale {
  id: string;
  name: string;
  abbr: string;
  image: string;
  style: string;
  abv: string;
  ibu: string;
  tagline: string;
  icon: string;
  unlockSeal: string;
  person: PersonInfo;
  personBio: string;
  chapter: string;
  year: string;
  title: string;
  story: StoryBlock[];
  mapTitle: string;
  pins: MapPin[];
  timeline: TimelineEvent[];
  scanBadge: Badge;
  gameBadge: Badge;
  game: GameConfig;
  tapStatus: 'on-tap' | 'retired' | 'coming-soon';
  retiredDate: string | null;
  barSummary: BarSummary;
  stillHere: StillHere[];
}

export interface Beer {
  name: string;
  abbr: string;
  image: string;
  style: string;
  abv: string;
  ibu: string;
  tasting?: string;
  tapStatus?: string;
}

export interface FoodItem {
  name: string;
  desc: string;
}

export interface AppUser {
  name: string;
  email?: string;
  guestId?: string;
}

export type PageId =
  | 'home'
  | 'menu'
  | 'tales'
  | 'story'
  | 'scan'
  | 'passport'
  | 'ourstory'
  | 'about'
  | 'woodenmatch'
  | 'tracks';

export interface AppState {
  page: PageId;
  user: AppUser | null;
  unlocked: Set<string>;
  scanBadges: Set<string>;
  gameBadges: Set<string>;
  collectedDates: Record<string, string>;
  currentTale: Tale | null;
  currentGame: GameConfig | null;
  /** v5.3 — transient (non-persisted) signal: id of the most recently
   *  awarded game badge in this session, so the Passport can surface a
   *  "newly earned" treatment. Cleared after the Passport reads it. */
  lastEarnedGame: string | null;
}

// Badge key constants — must not change (localStorage + Supabase keys)
export const BADGE_KEY_SCAN = (id: string) => id;
export const BADGE_KEY_GAME = (id: string) => `game:${id}`;

// localStorage keys — must not change
export const LS_USER             = 'tb_user';
export const LS_UNLOCKED         = 'tb_unlocked';
export const LS_SCAN_BADGES      = 'tb_scan_badges';
export const LS_GAME_BADGES      = 'tb_game_badges';
export const LS_COLLECTED_DATES  = 'tb_collected_dates';
export const LS_HOW_DISMISSED    = 'tb_how_dismissed';
export const LS_PASSPORT_PAGE    = 'trackside_passport_book_page';
