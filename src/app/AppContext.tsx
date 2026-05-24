import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { AppState, PageId, Tale } from './types';
import { loadState, saveState, getOrCreateGuestId } from '../services/guestPersistence';
import { LOCAL_TALES } from '../data/tales';

// ================== STATE ==================

const initialState: AppState = {
  page: 'home',
  currentTale: null,
  currentGame: null,
  ...loadState(),
};

// ================== ACTIONS ==================

type Action =
  | { type: 'NAV'; page: PageId }
  | { type: 'SET_TALE'; tale: Tale | null }
  | { type: 'UNLOCK'; id: string }
  | { type: 'AWARD_SCAN_BADGE'; id: string }
  | { type: 'AWARD_GAME_BADGE'; id: string }
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
      const unlocked = new Set(state.unlocked);
      unlocked.add(action.id);
      return { ...state, unlocked };
    }

    case 'AWARD_SCAN_BADGE': {
      const scanBadges = new Set(state.scanBadges);
      scanBadges.add(action.id);
      return { ...state, scanBadges };
    }

    case 'AWARD_GAME_BADGE': {
      const gameBadges = new Set(state.gameBadges);
      gameBadges.add(action.id);
      return { ...state, gameBadges };
    }

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
  setUser: (user: { name: string; email?: string } | null) => void;
  recordDate: (id: string) => void;
  resetDemo: () => void;
  tales: Tale[];
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const guestId = getOrCreateGuestId();

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

  const awardScanBadge  = useCallback((id: string) => dispatch({ type: 'AWARD_SCAN_BADGE', id }),  []);
  const awardGameBadge  = useCallback((id: string) => dispatch({ type: 'AWARD_GAME_BADGE', id }),  []);
  const setUser         = useCallback((user: { name: string } | null) => dispatch({ type: 'SET_USER', user }), []);
  const recordDate      = useCallback((id: string) => dispatch({ type: 'RECORD_DATE', id }), []);
  const resetDemo       = useCallback(() => dispatch({ type: 'RESET_DEMO' }), []);

  return (
    <AppContext.Provider value={{
      state,
      guestId,
      nav,
      navToTale,
      unlockTale,
      awardScanBadge,
      awardGameBadge,
      setUser,
      recordDate,
      resetDemo,
      tales: LOCAL_TALES,
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
