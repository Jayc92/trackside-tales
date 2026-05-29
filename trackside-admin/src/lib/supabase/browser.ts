// ================== TRACKSIDE ADMIN — Supabase browser client ==================
// Anon-key Supabase factory for Client Components. Subject to the same
// Row Level Security rules as the public app's anon access — meaning
// it can only see is_active+published content rows, live tap_list
// rows, and active reward_tiers. It cannot see drafts, qr_codes,
// media_assets, guest_profiles, user_badges, or event streams.
//
// In v7.0 this factory has no callers. It exists so that future client
// components in v7.1+ (e.g. a "preview as customer" panel that renders
// published content the way the public app sees it) have a stable
// import path. Most of the admin UI will be Server Components reading
// via lib/supabase/server.ts; client-side Supabase access is the
// exception, not the rule.
//
// HARD RULES:
//
//   1. NEVER read SUPABASE_SERVICE_ROLE_KEY here. Only NEXT_PUBLIC_*.
//   2. NEVER re-export from server.ts. They are different worlds.
//   3. If a Client Component needs admin-scope data, it MUST go
//      through a Server Action or Route Handler that uses
//      lib/supabase/server.ts internally. The Client Component does
//      not get to "just call service role from here."

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Get (or lazily construct) the browser-side anon Supabase client.
 * Module-level caching is appropriate here because the anon client
 * holds no per-request secrets and is safe to share across components
 * in the browser session.
 */
export function getBrowserClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      '[trackside-admin] NEXT_PUBLIC_SUPABASE_URL or ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Both must be ' +
        'present in .env.local (development) or in Vercel env vars.',
    );
  }

  cached = createClient(url, anonKey, {
    auth: {
      persistSession:    true,
      autoRefreshToken:  true,
      detectSessionInUrl: true,
    },
  });
  return cached;
}
