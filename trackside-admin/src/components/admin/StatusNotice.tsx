// ================== TRACKSIDE ADMIN — StatusNotice ==================
// Tiny presentational primitive for the read-only list / dashboard
// pages. Renders a parchment-styled callout box; used for both
// "no rows yet" empty states and "couldn't read X" error states.
//
// This is a Server Component (no 'use client'). It MUST stay so —
// the data fetches happen in Server Components, and pulling the
// presentational layer client-side would force every page that
// uses this notice to also become a Client Component.

import type { ReactNode } from 'react';

type Tone = 'info' | 'error';

// Error tone uses Tailwind's built-in red rather than a custom rust
// token because the admin palette in tailwind.config.ts only defines
// brass / parchment / ink / rail. Adding theme colors is out of scope
// for this read-only phase.
const toneClasses: Record<Tone, string> = {
  info:  'border-brass/40 bg-parchment/80 text-ink/80',
  error: 'border-red-700/50 bg-red-50 text-red-800',
};

export function StatusNotice({
  tone = 'info',
  children,
}: {
  tone?:     Tone;
  children:  ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded border p-4 text-sm ${toneClasses[tone]}`}
    >
      {children}
    </div>
  );
}
