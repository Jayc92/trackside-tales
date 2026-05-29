// ================== TRACKSIDE ADMIN — tap-list Server Actions ==================
// Three Server Actions wrapping the v7.3 tap-list mutations. Every
// action follows the same recipe:
//
//   1. `requireAdmin()` first — re-verifies the request even though
//      the layout already gated rendering. Server Actions can be
//      invoked from the action endpoint independently of the page
//      that hosted the form, so the gate must run again here.
//
//   2. Zod-validate the FormData. Validation failures redirect back
//      to /admin/tap-list with a generic-but-actionable error in
//      the `err` query param.
//
//   3. Build a typed input from the parsed values, hand it to the
//      mutation helper. The mutation helper handles Postgres
//      sanitization and returns a uniform `{ ok, error }` envelope.
//
//   4. On success, call `revalidatePath('/admin/tap-list')` so the
//      page re-fetches its server-rendered tables, and redirect
//      back without query params. On error, redirect with `?err=…`
//      so the page can surface the message via `<StatusNotice>`.
//
// Why redirect-with-query instead of returning a value:
//   * Returning `ActionResult` from a Server Action requires the
//     form to be wired through `useActionState`, which is a Client
//     Component hook. v7.3's safety budget forbids new client
//     components, so we report errors through the URL instead.
//
// HARD RULES:
//   * Actor identity comes ONLY from `requireAdmin()`. Never trust a
//     hidden form field for actor_id.
//   * No DELETE on tap_list.
//   * No retroactive `started_at`. fn_tap_start sets it to now()
//     server-side; this action never accepts a started_at param
//     for the start case.
//   * No mutation here without a successful Zod parse first.

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import {
  tapStart,
  tapEnd,
  tapEditNotes,
  type ActorContext,
} from '@/lib/admin/mutations';

const TAP_LIST_PATH = '/admin/tap-list';

function adminToActor(user: { id: string; email: string }): ActorContext {
  return { id: user.id, email: user.email };
}

/**
 * Redirect back to /admin/tap-list with a one-shot error or success
 * banner. The page renders banners from `searchParams.err` /
 * `searchParams.ok`. We don't persist them — a refresh clears the
 * banner because the URL no longer carries it.
 */
function backWithError(message: string): never {
  redirect(`${TAP_LIST_PATH}?err=${encodeURIComponent(message)}`);
}
function backWithSuccess(action: 'start' | 'end' | 'notes'): never {
  redirect(`${TAP_LIST_PATH}?ok=${action}`);
}

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// ---------- Zod schemas --------------------------------------------------

// Matches beers.slug naming convention (kebab/lowercase). Bounded
// length keeps a malicious form from posting megabytes of text.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const TapStartSchema = z.object({
  beer_slug:  z.string().regex(SLUG_RE, 'Invalid beer slug.'),
  // tap_number is optional (cask / handpump can be untracked).
  tap_number: z.union([z.number().int().min(1).max(99), z.null()]),
  notes:      z.union([z.string().max(280), z.null()]),
});

const TapEndSchema = z.object({
  beer_slug:  z.string().regex(SLUG_RE, 'Invalid beer slug.'),
  // ISO timestamp from a hidden form field — we don't trust it
  // beyond syntactic validation; the Postgres function refuses
  // to update if the row is no longer live.
  started_at: z.string().datetime({ offset: true }),
});

const TapEditNotesSchema = z.object({
  beer_slug:  z.string().regex(SLUG_RE, 'Invalid beer slug.'),
  started_at: z.string().datetime({ offset: true }),
  notes:      z.union([z.string().max(280), z.null()]),
});

// ---------- tapStartAction -----------------------------------------------

export async function tapStartAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const rawTap = formData.get('tap_number');
  const tapNumber =
    typeof rawTap === 'string' && rawTap.trim().length > 0
      ? Number(rawTap)
      : null;

  const parsed = TapStartSchema.safeParse({
    beer_slug:  trimOrNull(formData.get('beer_slug')) ?? '',
    tap_number: tapNumber === null || Number.isFinite(tapNumber) ? tapNumber : null,
    notes:      trimOrNull(formData.get('notes')),
  });

  if (!parsed.success) {
    backWithError(parsed.error.issues[0]?.message ?? 'Invalid input.');
  }

  const result = await tapStart(adminToActor(user), {
    beerSlug:   parsed.data.beer_slug,
    tapNumber:  parsed.data.tap_number,
    notes:      parsed.data.notes,
  });

  if (!result.ok) backWithError(result.error);

  revalidatePath(TAP_LIST_PATH);
  backWithSuccess('start');
}

// ---------- tapEndAction -------------------------------------------------

export async function tapEndAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const parsed = TapEndSchema.safeParse({
    beer_slug:  trimOrNull(formData.get('beer_slug')) ?? '',
    started_at: trimOrNull(formData.get('started_at')) ?? '',
  });

  if (!parsed.success) {
    backWithError(parsed.error.issues[0]?.message ?? 'Invalid input.');
  }

  const result = await tapEnd(adminToActor(user), {
    beerSlug:   parsed.data.beer_slug,
    startedAt:  parsed.data.started_at,
  });

  if (!result.ok) backWithError(result.error);

  revalidatePath(TAP_LIST_PATH);
  backWithSuccess('end');
}

// ---------- tapEditNotesAction -------------------------------------------

export async function tapEditNotesAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const parsed = TapEditNotesSchema.safeParse({
    beer_slug:  trimOrNull(formData.get('beer_slug')) ?? '',
    started_at: trimOrNull(formData.get('started_at')) ?? '',
    notes:      trimOrNull(formData.get('notes')),
  });

  if (!parsed.success) {
    backWithError(parsed.error.issues[0]?.message ?? 'Invalid input.');
  }

  const result = await tapEditNotes(adminToActor(user), {
    beerSlug:   parsed.data.beer_slug,
    startedAt:  parsed.data.started_at,
    notes:      parsed.data.notes,
  });

  if (!result.ok) backWithError(result.error);

  revalidatePath(TAP_LIST_PATH);
  backWithSuccess('notes');
}
