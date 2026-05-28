import React, { createContext, useContext, useReducer, useCallback, useEffect, useState } from 'react';
import { AppState, PageId, Tale, Beer, FoodItem } from './types';
import { loadState, saveState, getOrCreateGuestId } from '../services/guestPersistence';
import { LOCAL_TALES } from '../data/tales';
import { LOCAL_REGULARS, LOCAL_NON_ALC, LOCAL_FOOD } from '../data/menu';
import {
  fetchRemoteTales,
  fetchRemoteRegulars,
  fetchRemoteNonAlc,
  fetchRemoteFood,
} from '../services/contentService';

// ================== STATE ==================

const initialState: AppState = {
  page: 'home',
  currentTale: null,
  currentGame: null,
  lastEarnedGame: null,
  lastUnlocked: null,
  ...loadState(),
};

// ================== ACTIONS ==================

type Action =
  | { type: 'NAV'; page: PageId }
  | { type: 'SET_TALE'; tale: Tale | null }
  | { type: 'UNLOCK'; id: string }
  | { type: 'AWARD_SCAN_BADGE'; id: string }
  | { type: 'AWARD_GAME_BADGE'; id: string }
  | { type: 'CLEAR_LAST_EARNED' }
  | { type: 'CLEAR_LAST_UNLOCKED' }
  | { type: 'SET_USER'; user: { name: string; email?: string } | null }
  | { type: 'RECORD_DATE'; id: string }
  | { type: 'RESET_DEMO' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'NAV':
      return { ...state, page: action.page };

    case 'SET_TALE':
      return { ...state, currentTale: action.tale };

    case 'UNLOCK': {
      const wasUnlocked = state.unlocked.has(action.id);
      const unlocked = new Set(state.unlocked);
      unlocked.add(action.id);
      // UI-v6.5: surface the ceremonial unlock moment exactly once,
      // only on the locked → unlocked transition. Re-visiting an already
      // unlocked Tale must not re-trigger the modal.
      return {
        ...state,
        unlocked,
        lastUnlocked: wasUnlocked ? state.lastUnlocked : action.id,
      };
    }

    case 'AWARD_SCAN_BADGE': {
      const scanBadges = new Set(state.scanBadges);
      scanBadges.add(action.id);
      return { ...state, scanBadges };
    }

    case 'AWARD_GAME_BADGE': {
      const gameBadges = new Set(state.gameBadges);
      // v5.3: only mark as "newly earned" the first time per session —
      // re-entering the overlay on a tale that's already complete must
      // not re-trigger the Passport's celebration treatment. The
      // alreadyEarned guard in GameOverlay should prevent re-award, but
      // this is defense-in-depth.
      const wasFresh = !state.gameBadges.has(action.id);
      gameBadges.add(action.id);
      return {
        ...state,
        gameBadges,
        lastEarnedGame: wasFresh ? action.id : state.lastEarnedGame,
      };
    }

    case 'CLEAR_LAST_EARNED':
      return { ...state, lastEarnedGame: null };

    case 'CLEAR_LAST_UNLOCKED':
      return { ...state, lastUnlocked: null };

    case 'SET_USER':
      return { ...state, user: action.user };

    case 'RECORD_DATE': {
      if (state.collectedDates[action.id]) return state;
      return {
        ...state,
        collectedDates: {
          ...state.collectedDates,
          [action.id]: new Date().toISOString(),
        },
      };
    }

    case 'RESET_DEMO':
      return {
        ...state,
        unlocked: new Set(),
        scanBadges: new Set(),
        gameBadges: new Set(),
        collectedDates: {},
        lastEarnedGame: null,
        lastUnlocked: null,
      };

    default:
      return state;
  }
}

// ================== CONTEXT ==================

interface AppContextValue {
  state: AppState;
  guestId: string;
  nav: (page: PageId) => void;
  navToTale: (tale: Tale) => void;
  unlockTale: (id: string) => void;
  awardScanBadge: (id: string) => void;
  awardGameBadge: (id: string) => void;
  clearLastEarned: () => void;
  clearLastUnlocked: () => void;
  setUser: (user: { name: string; email?: string } | null) => void;
  recordDate: (id: string) => void;
  resetDemo: () => void;
  // ADMIN-v6.4 — content arrays. Local data is the first-render
  // value; if `USE_REMOTE_CONTENT` is on AND the remote fetch
  // succeeds with valid rows, the array is replaced after mount.
  // Failures keep the local arrays. Consumers should treat these
  // as the only source of truth.
  tales: Tale[];
  regulars: Beer[];
  nonAlc: Beer[];
  food: FoodItem[];
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const guestId = getOrCreateGuestId();

  // ADMIN-v6.4 — remote content hydration (fail-safe).
  // First render uses LOCAL_*. After mount, if USE_REMOTE_CONTENT
  // is on, each fetcher independently swaps in remote rows when
  // they validate. Any failure (no env vars, network error, RLS
  // refusal, malformed JSON, zero valid rows) keeps the local
  // array — there is no path that blanks the app.
  const [tales,    setTales]    = useState<Tale[]>(LOCAL_TALES);
  const [regulars, setRegulars] = useState<Beer[]>(LOCAL_REGULARS);
  const [nonAlc,   setNonAlc]   = useState<Beer[]>(LOCAL_NON_ALC);
  const [food,     setFood]     = useState<FoodItem[]>(LOCAL_FOOD);

  useEffect(() => {
    let cancelled = false;
    // Fire all four in parallel; each one is independent — a
    // failure in one section never affects the others.
    void fetchRemoteTales().then((rows) => {
      if (!cancelled && rows) setTales(rows);
    });
    void fetchRemoteRegulars().then((rows) => {
      if (!cancelled && rows) setRegulars(rows);
    });
    void fetchRemoteNonAlc().then((rows) => {
      if (!cancelled && rows) setNonAlc(rows);
    });
    void fetchRemoteFood().then((rows) => {
      if (!cancelled && rows) setFood(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist whenever state changes
  useEffect(() => {
    saveState(state);
  }, [state]);

  const nav = useCallback((page: PageId) => {
    dispatch({ type: 'NAV', page });
    // Update URL hash for deep-linking
    const hashMap: Partial<Record<PageId, string>> = {
      home:       '#/home',
      menu:       '#/beers',
      tales:      '#/tales',
      scan:       '#/scan',
      passport:   '#/passport',
      ourstory:   '#/story',
      about:      '#/about',
      woodenmatch:'#/woodenmatch',
      tracks:     '#/tracks',
    };
    const hash = hashMap[page] || '#/home';
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }, []);

  const navToTale = useCallback((tale: Tale) => {
    dispatch({ type: 'SET_TALE', tale });
    dispatch({ type: 'NAV', page: 'story' });
    history.replaceState(null, '', `#/story/${tale.id}`);
  }, []);

  const unlockTale = useCallback((id: string) => {
    dispatch({ type: 'UNLOCK', id });
    dispatch({ type: 'RECORD_DATE', id });
  }, []);

  const awardScanBadge    = useCallback((id: string) => dispatch({ type: 'AWARD_SCAN_BADGE', id }),  []);
  const awardGameBadge    = useCallback((id: string) => dispatch({ type: 'AWARD_GAME_BADGE', id }),  []);
  const clearLastEarned   = useCallback(() => dispatch({ type: 'CLEAR_LAST_EARNED' }), []);
  const clearLastUnlocked = useCallback(() => dispatch({ type: 'CLEAR_LAST_UNLOCKED' }), []);
  const setUser           = useCallback((user: { name: string } | null) => dispatch({ type: 'SET_USER', user }), []);
  const recordDate        = useCallback((id: string) => dispatch({ type: 'RECORD_DATE', id }), []);
  const resetDemo         = useCallback(() => dispatch({ type: 'RESET_DEMO' }), []);

  return (
    <AppContext.Provider value={{
      state,
      guestId,
      nav,
      navToTale,
      unlockTale,
      awardScanBadge,
      awardGameBadge,
      clearLastEarned,
      clearLastUnlocked,
      setUser,
      recordDate,
      resetDemo,
      tales,
      regulars,
      nonAlc,
      food,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
