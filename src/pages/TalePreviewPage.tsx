// ================== TALE PREVIEW PAGE (PUBLIC-v7.4B.P.15c) ==================
// Standalone operator-facing draft preview. Rendered by the App shell
// INSTEAD of the normal page stack whenever the hash carries a
// `?preview=<token>` on a story route. Validates the token against the
// preview-tale Edge Function, maps the single authorized row through
// the SAME adapter production uses (mapTaleRow), and renders it with
// the SAME TaleDetailPage — so what the operator sees is exactly what
// publishing would produce.
//
// Isolation guarantees:
//   * Nothing here calls unlockTale / awardScanBadge / awardGameBadge,
//     writes localStorage, or emits analytics — preview leaves zero
//     passport residue.
//   * The previewed tale is NEVER added to the global tales collection
//     and the page never falls back to local/curated content on a
//     failed validation.
//   * The game CTA is disabled by TaleDetailPage's previewMode.
//   * The token stays in component memory for one fetch; reload after
//     expiry fails closed with a distinct message.

import React, { useEffect, useState } from 'react';
import { TaleDetailPage } from './TaleDetailPage';
import { mapTaleRow } from '../services/contentService';
import {
  fetchTalePreview,
  type TalePreviewRequest,
} from '../services/talePreview';
import type { Tale } from '../app/types';

type PreviewState =
  | { phase: 'loading' }
  | { phase: 'ready'; tale: Tale; expiresAt: number }
  | { phase: 'expired' }
  | { phase: 'invalid' }
  | { phase: 'tale_unavailable' }
  | { phase: 'unavailable' };

const FAILURE_COPY: Record<Exclude<PreviewState['phase'], 'loading' | 'ready'>, { title: string; body: string }> = {
  expired: {
    title: 'Preview link expired',
    body:  'Preview links last about 10 minutes. Go back to the admin Tale editor and open a fresh preview.',
  },
  invalid: {
    title: 'Preview link not valid',
    body:  'This preview link is not recognized. Open a fresh preview from the admin Tale editor.',
  },
  tale_unavailable: {
    title: 'Tale not available',
    body:  'The Tale behind this preview link no longer exists. Check the admin Tales list.',
  },
  unavailable: {
    title: 'Preview service unreachable',
    body:  'Could not reach the preview service. Check your connection and try again, or open a fresh preview from the admin editor.',
  },
};

function formatExpiry(expiresAtSeconds: number): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(new Date(expiresAtSeconds * 1000));
  } catch {
    return '';
  }
}

export function TalePreviewPage({ request }: { request: TalePreviewRequest }) {
  const [state, setState] = useState<PreviewState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchTalePreview(request.token);
      if (cancelled) return;
      if (result.status === 'ok') {
        const tale = mapTaleRow(result.row);
        if (!tale) {
          // Row exists but fails the minimum contract (slug/title) —
          // surface as unavailable rather than rendering garbage.
          setState({ phase: 'tale_unavailable' });
          return;
        }
        setState({ phase: 'ready', tale, expiresAt: result.expiresAt });
        return;
      }
      setState({ phase: result.status === 'expired' ? 'expired'
        : result.status === 'tale_unavailable' ? 'tale_unavailable'
        : result.status === 'invalid' ? 'invalid'
        : 'unavailable' });
    })();
    return () => { cancelled = true; };
  }, [request.token]);

  // Flip to the expired state once the server-provided expiry passes,
  // so a tab left open doesn't imply the link is durable.
  useEffect(() => {
    if (state.phase !== 'ready') return;
    const msLeft = state.expiresAt * 1000 - Date.now();
    if (msLeft <= 0) { setState({ phase: 'expired' }); return; }
    const timer = window.setTimeout(() => setState({ phase: 'expired' }), msLeft);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <div id="app-root">
      {/* ---- persistent preview banner (never rendered for customers —
              this whole shell exists only behind a valid admin-minted
              token route) ---- */}
      <div
        role="status"
        style={{
          position: 'sticky', top: 0, zIndex: 60,
          background: '#7a1f1f', color: '#f5ead1',
          padding: '10px 16px', fontSize: 13,
          display: 'flex', flexWrap: 'wrap', gap: 12,
          alignItems: 'center', justifyContent: 'center',
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}
      >
        <strong>Draft preview</strong>
        <span>— not public —</span>
        {state.phase === 'ready' && (
          <span>expires at {formatExpiry(state.expiresAt)}</span>
        )}
        <a
          href="https://trackside-admin.vercel.app/admin/tales"
          style={{ color: '#f5ead1', textDecoration: 'underline' }}
        >
          Back to admin
        </a>
      </div>

      <main id="page-container" className={state.phase !== 'ready' ? 'px-screen' : undefined}>
        {state.phase === 'loading' && (
          <div className="px-preview-note" role="status">
            <p>Loading preview…</p>
          </div>
        )}
        {state.phase === 'ready' && (
          <TaleDetailPage previewTale={state.tale} previewMode />
        )}
        {state.phase !== 'loading' && state.phase !== 'ready' && (
          <div className="px-preview-note" role="alert">
            <h2>{FAILURE_COPY[state.phase].title}</h2>
            <p>{FAILURE_COPY[state.phase].body}</p>
          </div>
        )}
      </main>
    </div>
  );
}
