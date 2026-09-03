import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProvider } from './app/AppContext';
import { App } from './app/App';

// ================== STYLES ==================
// Phase 2: Full CSS extracted from index-v4_6_1-golden.html.
// The file is split into named modules for maintainability but
// app.css contains the complete original ruleset in one place
// as a stable reference during migration.
import './styles/tokens.css';        // :root CSS custom properties
import './styles/app.css';           // complete extracted CSS (5,697 lines)
import './styles/polish.css';        // v5.0.1+ scoped polish overrides
import './styles/design-system.css'; // v6.0 — Structured Design Language v1 (additive, opt-in)
import './styles/p28e.css';          // P.28e — rebuilt public presentation system (px-*)
import './styles/story-page.css';    // P.28g.2 — restored Our Story editorial page (story-*)
import './styles/tracks-page.css';   // P.28g.3 — restored Tracks rail-history page (tracks-*)
import './styles/venue-page.css';    // P.28g.4 — Alburtis Tavern venue page (venue-*)
import './styles/tales-page.css';    // P.28g.5 — polished Tales archive hub (tales-*)
import './styles/tale-detail-page.css'; // P.28g.6 — refined Tale dossier (tale-detail-*)
import './styles/passport-page.css';    // P.28g.7 — refined Passport document (passport-*)

// ================== MOUNT ==================
console.log('[trackside] App version: 4.6.1 — Vite migration');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
