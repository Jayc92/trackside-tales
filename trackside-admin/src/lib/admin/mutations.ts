// ================== TRACKSIDE ADMIN — write helpers ==================
// Server-only mutation helpers for v7.3 tap-list management. Every
// helper here:
//
//   * runs server-side only (`import 'server-only'`)
//   * uses the service-role Supabase client (RLS bypass — required
//     because tap_list and admin_actions both have RLS enabled with
//     no anon-readable / anon-writable policies)
//   * goes through a Postgres function (supabase.rpc) so the
//     mutation AND its admin_actions audit row land in ONE
//     transaction. Don't add helpers that issue raw INSERT /
//     UPDATE on tap_list — that path bypasses the audit trail.
//   * returns a uniform `{ ok, data } | { ok, error }` envelope so
//     pages and Server Actions render generic error copy and never
//     leak Postgres error text to the browser
//
// HARD RULES:
//
//   1. NEVER import this module from a Client Component. The
//      `server-only` import will fail the build at the first such
//      import; ESLint `no-restricted-imports` adds a second guard.
//
//   2. NEVER add a helper that writes to tap_list without also
//      writing admin_actions. The Postgres functions are the
//      contract — keep them in sync.
//
//   3. NEVER add a DELETE helper for tap_list. Pour history is
//      append-only; bad pours get ended (and optionally annotated).
//
//   4. NEVER pass the actor's user ID to client-supplied actions.
//      The Server Action MUST resolve the actor from `requireAdmin()`
//      and pass it in. Any "actor_id" arriving from a form field
//      is a privilege-escalation attempt.
//
// Postgres errcodes we surface (sanitized):
//   * 23505  — tap_number unique violation (someone else just took
//              that handle). Mapped to "Tap N is already pouring."
//   * 23503  — beer_slug FK violation (race). Mapped to "Unknown
//              beer."
//   * P0001  — beer not active (raised by fn_tap_start)
//   * P0002  — no live pour matched (raised by fn_tap_end /
//              fn_tap_edit_notes when the live row vanished
//              between page render and submit)
//   * other  — generic "could not save change."

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';

// ---------- result envelope ----------------------------------------------

export type MutationResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: string };

interface PgError {
  code?:    string;
  message?: string;
}

function isPgError(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null;
}

function logMutationError(scope: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[trackside-admin][mutations:${scope}]`, err);
}

/**
 * Translate a Postgres / PostgREST error into a user-safe message.
 * The original error is logged via `logMutationError`; only the
 * sanitized text crosses the wire.
 */
function sanitizeRpcError(scope: string, err: PgError): string {
  logMutationError(scope, err);
  switch (err.code) {
    case '23505':
      // Only one unique partial index is reachable from these RPCs:
      // tap_list_one_live_per_tap_idx on tap_number where
      // ended_at is null and tap_number is not null.
      return 'That tap number is already pouring. End the current pour first.';
    case '23503':
      return 'Unknown beer slug. Refresh the page and try again.';
    case 'P0001':
      return 'That beer is not active. Activate it before pouring.';
    case 'P0002':
      return 'That pour is no longer live. Refresh the page and try again.';
    default:
      return 'Could not save change.';
  }
}

// ---------- tap_list shape -----------------------------------------------

export interface TapListRow {
  beer_slug:  string;
  tap_number: number | null;
  started_at: string;
  ended_at:   string | null;
  notes:      string | null;
  created_at: string;
}

// ---------- inputs --------------------------------------------------------
//
// These types are the Server Action's contract with the mutations
// layer. Server Actions perform Zod validation BEFORE constructing
// these payloads; by the time the mutation helpers see them, the
// values are already trustworthy.

export interface ActorContext {
  id:    string;
  email: string;
}

export interface TapStartInput {
  beerSlug:   string;
  tapNumber:  number | null;
  notes:      string | null;
}

export interface TapEndInput {
  beerSlug:   string;
  startedAt:  string; // ISO timestamptz from the live row
}

export interface TapEditNotesInput {
  beerSlug:   string;
  startedAt:  string;
  notes:      string | null;
}

// ---------- tapStart ------------------------------------------------------

export async function tapStart(
  actor: ActorContext,
  input: TapStartInput,
): Promise<MutationResult<TapListRow>> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('fn_tap_start', {
      p_actor:      actor.id,
      p_email:      actor.email,
      p_beer_slug:  input.beerSlug,
      p_tap_number: input.tapNumber,
      p_notes:      input.notes,
    });

    if (error) {
      return { ok: false, error: sanitizeRpcError('tapStart', error as PgError) };
    }
    return { ok: true, data: data as TapListRow };
  } catch (err) {
    if (isPgError(err)) {
      return { ok: false, error: sanitizeRpcError('tapStart', err) };
    }
    logMutationError('tapStart', err);
    return { ok: false, error: 'Could not save change.' };
  }
}

// ---------- tapEnd --------------------------------------------------------

export async function tapEnd(
  actor: ActorContext,
  input: TapEndInput,
): Promise<MutationResult<TapListRow>> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('fn_tap_end', {
      p_actor:      actor.id,
      p_email:      actor.email,
      p_beer_slug:  input.beerSlug,
      p_started_at: input.startedAt,
    });

    if (error) {
      return { ok: false, error: sanitizeRpcError('tapEnd', error as PgError) };
    }
    return { ok: true, data: data as TapListRow };
  } catch (err) {
    if (isPgError(err)) {
      return { ok: false, error: sanitizeRpcError('tapEnd', err) };
    }
    logMutationError('tapEnd', err);
    return { ok: false, error: 'Could not save change.' };
  }
}

// ---------- tapEditNotes --------------------------------------------------

export async function tapEditNotes(
  actor: ActorContext,
  input: TapEditNotesInput,
): Promise<MutationResult<TapListRow>> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('fn_tap_edit_notes', {
      p_actor:      actor.id,
      p_email:      actor.email,
      p_beer_slug:  input.beerSlug,
      p_started_at: input.startedAt,
      p_notes:      input.notes,
    });

    if (error) {
      return { ok: false, error: sanitizeRpcError('tapEditNotes', error as PgError) };
    }
    return { ok: true, data: data as TapListRow };
  } catch (err) {
    if (isPgError(err)) {
      return { ok: false, error: sanitizeRpcError('tapEditNotes', err) };
    }
    logMutationError('tapEditNotes', err);
    return { ok: false, error: 'Could not save change.' };
  }
}
