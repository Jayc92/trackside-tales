// ================== TRACKSIDE ADMIN — Supabase server client ==================
// Service-role Supabase factory. RLS is bypassed for any client
// produced by this module; that is the entire point — the admin app
// reads drafts, soft-deleted rows, qr_codes, media_assets, event
// streams, and guest_profiles, none of which are anon-readable.
//
// HARD RULES (do not relax without a security review):
//
//   1. `import 'server-only'` is the FIRST line of executable code in
//      this module. Next.js fails the build if a Client Component
//      ever imports a transitive dep of `server-only`. This catches
//      accidental leaks before they reach a deploy.
//
//   2. The key read is `SUPABASE_SERVICE_ROLE_KEY` — NO `NEXT_PUBLIC_`
//      prefix. A `NEXT_PUBLIC_` prefixed key gets inlined into the
//      browser bundle at build time, which would publish a full RLS
//      bypass to every visitor.
//
//   3. The factory does NOT cache a module-level client. Each call
//      returns a fresh client. Reasoning: server actions and route
//      handlers run per-request; a long-lived client risks holding
//      stale auth state across requests, and the Supabase client is
//      cheap to construct. If profiling later proves construction is
//      a real cost, introduce request-scoped caching via
//      `unstable_cache` or React `cache()`, NOT a module-level singleton.
//
//   4. `auth.persistSession: false` and `auth.autoRefreshToken: false`
//      disable the browser-shaped session-cookie behavior the JS
//      client carries by default. We are not "a user" — we are
//      service role. Disabling these prevents accidental cookie
//      writes from a server runtime that has no session to persist.
//
// v7.0 scaffold: this factory exists but has no callers yet. v7.2
// will introduce the first reads (overview tiles, lists, activity
// feed). v7.4+ will introduce writes via server actions.

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Construct a fresh service-role Supabase client.
 *
 * Throws synchronously if the required env vars are missing — this is
 * intentional: a server runtime missing service-role credentials
 * cannot do anything useful, and a clear failure at import/call time
 * is much better than silent 500s deeper in a server action.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      '[trackside-admin] NEXT_PUBLIC_SUPABASE_URL is not set. ' +
        'Set it in .env.local (development) or in the Vercel project ' +
        'environment variables (deploy).',
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      '[trackside-admin] SUPABASE_SERVICE_ROLE_KEY is not set. ' +
        'This key MUST stay server-only (no NEXT_PUBLIC_ prefix). ' +
        'Set it in .env.local (development) or in Vercel ' +
        'environment variables scoped to Production only.',
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      // Service role does not represent an end-user session.
      persistSession:   false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        // Helpful for Supabase logs / future audit middleware. Not a
        // security boundary on its own.
        'X-Trackside-App': 'admin',
      },
    },
  });
}
