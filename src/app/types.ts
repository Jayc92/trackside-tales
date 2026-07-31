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
  /**
   * Optional admin-managed intro media (PUBLIC-v7.4B.P.12a), surfaced
   * from production tales.intro_asset_url / tales.intro_type by the
   * remote adapter. Exposed on the model only — no intro playback
   * surface exists yet, so nothing renders these today. `introType`
   * mirrors the production CHECK constraint values.
   */
  introAssetUrl?: string;
  introType?: 'css_animation' | 'video' | 'none';
  /**
   * Optional admin-assigned stamp/card artwork URL from production
   * tales.stamp_image_url (PUBLIC-v7.4B.P.12a). For non-curated Tales
   * the adapter also copies this into `image` so card/hero art slots
   * pick it up; curated Tales keep their local pack art.
   */
  stampImageUrl?: string;
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
  /**
   * Production beer slug (PUBLIC-v7.4B.P.18), populated by the remote
   * adapter so live tap-list rows (keyed by beer_slug) can decorate
   * the card with a truthful ON TAP badge. Absent on the static
   * LOCAL_* fallback records — those never claim live availability.
   */
  slug?: string;
}

export interface FoodItem {
  name: string;
  desc: string;
  /**
   * Optional public image URL for this Food item, surfaced by the
   * remote adapter when production carries a nonblank
   * food_items.image_url (ADMIN-v7.4B.N.5.a). Omitted entirely
   * when the remote row has a null/blank value and on local
   * fallback records — the Food card renders the existing glyph
   * fallback in that case. camelCase to match the public UI
   * convention; the wire column remains snake_case `image_url`
   * and is transformed by mapFoodRow.
   */
  imageUrl?: string;
  /**
   * Optional price in integer cents (PUBLIC-v7.4B.P.9), surfaced from
   * production food_items.price_cents (managed in admin as of
   * ADMIN-v7.4B.P.8). Omitted/undefined when the remote row has a null
   * price and on local fallback records — the Food card shows no price
   * in that case. camelCase to match the UI convention; the wire
   * column is snake_case `price_cents`, transformed by mapFoodRow.
   */
  priceCents?: number | null;
  /**
   * Optional "featured / chef's pick" flag (PUBLIC-v7.4B.P.9) from
   * production food_items.is_featured. When true, the Food card shows
   * the CHEF'S PICK badge. Omitted on local fallback records — the
   * card falls back to its static FOOD_VISUAL_META hint.
   */
  isFeatured?: boolean;
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
  /** UI-v6.5 — transient (non-persisted) signal: id of the most recently
   *  unlocked Tale, so the app can surface the ceremonial "stamp earned"
   *  modal exactly once. Cleared by user action (VIEW TALE / VIEW PASSPORT
   *  / KEEP SCANNING / close). Persists nothing; never affects badge,
   *  scan, or unlock contracts. */
  lastUnlocked: string | null;
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
