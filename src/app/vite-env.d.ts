/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // ADMIN-v7.4B.M.5.2.2 — per-category remote content gates. Each
  // category gate must be the literal string 'true' to enable that
  // category. Anything else (including unset, '', 'false', 'TRUE',
  // '1') leaves the category disabled. The Supabase URL+anon key
  // are necessary but not sufficient; an explicit category opt-in
  // is also required.
  readonly VITE_USE_REMOTE_TALES?:   string
  readonly VITE_USE_REMOTE_BEERS?:   string
  readonly VITE_USE_REMOTE_FOOD?:    string
  readonly VITE_USE_REMOTE_REWARDS?: string
  // Pre-existing per-category flags (ADMIN-v6.6 / v6.8B). Same
  // string-literal contract.
  readonly VITE_USE_REMOTE_QR_VALIDATION?: string
  readonly VITE_USE_REMOTE_EVENTS?:        string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
