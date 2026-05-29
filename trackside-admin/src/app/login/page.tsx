// ================== TRACKSIDE ADMIN — /login ==================
// Magic-link login page. Server Component renders the form; the form
// posts to a server action that calls Supabase auth.signInWithOtp.
//
// HARD RULES:
//
//   1. ENUMERATION RESISTANCE — the action returns the same neutral
//      "If your email is authorized, a sign-in link has been sent."
//      message regardless of whether the email exists, is on the
//      allowlist, is rate-limited, or hit a transient Supabase error.
//      A determined attacker can still time the response to infer
//      account existence; the v7.1 surface only hardens the
//      visible-text channel. Future hardening (constant-time delays,
//      CAPTCHA) is deferred until staff reports any abuse.
//
//   2. ALLOWLIST AT INVITE TIME — `shouldCreateUser: false` ensures
//      Supabase will not auto-provision a new auth.users row for an
//      unknown email. Combined with the manual app_metadata.role
//      bootstrap (see README), the only way to reach the admin shell
//      is to be in auth.users AND have role='admin' set by SQL.
//
//   3. NO SERVICE-ROLE — sign-in is a normal client SDK flow against
//      auth.users. The service-role client is not used here.
//
//   4. The redirect URL passed to Supabase is built from
//      NEXT_PUBLIC_SITE_URL (or request origin in dev), and points to
//      /auth/callback. Supabase enforces an additional allowlist via
//      the Auth dashboard "Redirect URLs" — see README.

import { headers } from 'next/headers';
import { createAuthClient } from '@/lib/supabase/auth';

// Force dynamic rendering. The page itself is mostly static, but the
// server action wrapping `signInWithOtp` reads cookies and request
// headers and must run per-request. Marking the page dynamic also
// keeps the build off the env-var-required code path during static
// generation.
export const dynamic = 'force-dynamic';

interface SearchParams {
  status?: string | string[];
}

const NEUTRAL_OK_MESSAGE =
  'If your email is authorized, a sign-in link has been sent.';

const NEUTRAL_INVALID_MESSAGE =
  'Enter a valid email address to receive a sign-in link.';

function resolveSiteUrl(): string {
  const envSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envSite) return envSite.replace(/\/+$/, '');
  // Dev fallback: derive from request headers. Vercel sets x-forwarded-*;
  // local dev sets host. In both cases the value is acceptable for a
  // magic-link callback because Supabase enforces an allowlist on its
  // side anyway.
  const h = headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}

async function sendMagicLink(formData: FormData): Promise<{ ok: boolean; reason: 'ok' | 'invalid' }> {
  'use server';
  const raw = formData.get('email');
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';

  // Bare-minimum syntactic check. Supabase will reject malformed
  // emails too, but failing fast lets us return a stable
  // neutral-looking error instead of leaking server-side variance.
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!looksLikeEmail) {
    return { ok: false, reason: 'invalid' };
  }

  try {
    const supabase = createAuthClient();
    const redirectTo = `${resolveSiteUrl()}/auth/callback`;
    await supabase.auth.signInWithOtp({
      email,
      options: {
        // Critical: do NOT auto-create users. The admin allowlist is
        // populated by manual SQL on the auth.users + app_metadata.role
        // path. Auto-create would let any attacker create an unprivileged
        // auth.users row, which still fails requireAdmin() but pollutes
        // the user table.
        shouldCreateUser: false,
        emailRedirectTo: redirectTo,
      },
    });
  } catch {
    // Swallow transient errors. Returning a uniform success message
    // preserves enumeration resistance — a "Supabase is down" page
    // would leak that this endpoint exists at all.
  }

  // Always report success at the visible-copy level.
  return { ok: true, reason: 'ok' };
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const status = Array.isArray(searchParams.status)
    ? searchParams.status[0]
    : searchParams.status;

  let banner: string | null = null;
  if (status === 'sent')    banner = NEUTRAL_OK_MESSAGE;
  if (status === 'invalid') banner = NEUTRAL_INVALID_MESSAGE;
  if (status === 'denied')  banner = NEUTRAL_OK_MESSAGE;
  if (status === 'expired') banner = 'Your sign-in link has expired or is invalid. Request a new one below.';

  // Server action that wraps sendMagicLink + redirects with the right
  // status query so the page is a normal RSC render after submit.
  async function action(formData: FormData) {
    'use server';
    const result = await sendMagicLink(formData);
    const { redirect } = await import('next/navigation');
    redirect(result.reason === 'invalid' ? '/login?status=invalid' : '/login?status=sent');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
      <div className="w-full rounded-md border border-brass/30 bg-white/60 p-6 shadow-sm">
        <h1 className="font-serif text-2xl text-rail">
          Trackside Tales — Admin Sign-In
        </h1>
        <p className="mt-2 text-sm text-ink/70">
          Enter your authorized email to receive a magic sign-in link.
        </p>

        {banner && (
          <div
            role="status"
            className="mt-4 rounded border border-brass/40 bg-parchment/80 p-3 text-sm text-ink/80"
          >
            {banner}
          </div>
        )}

        <form action={action} className="mt-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-ink/80">
            Email
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              className="rounded border border-brass/40 bg-white px-3 py-2 text-base text-ink focus:border-brass focus:outline-none"
              placeholder="you@example.com"
            />
          </label>
          <button
            type="submit"
            className="mt-1 rounded bg-rail px-4 py-2 text-sm font-medium uppercase tracking-widest text-parchment transition hover:bg-ink"
          >
            Send magic link
          </button>
        </form>

        <p className="mt-4 text-xs text-ink/50">
          Staff use only. Unauthorized emails will not receive a link.
        </p>
      </div>
    </main>
  );
}
