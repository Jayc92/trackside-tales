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

// ================== MOUNT ==================
console.log('[trackside] App version: 4.6.1 — Vite migration');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
