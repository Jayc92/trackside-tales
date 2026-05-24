// ================== BADGE SERVICE ==================
// Records scan and game badges to localStorage and optionally to Supabase.

import { supabaseFetch, USE_REMOTE_CONTENT } from './supabaseClient';

export async function recordBadgeRemote(
  guestId: string,
  taleId: string,
  badgeType: 'scan' | 'game'
): Promise<void> {
  if (!USE_REMOTE_CONTENT || !guestId || !taleId) return;
  try {
    await supabaseFetch('user_badges', '', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer:         'resolution=ignore-duplicates',
        'Return-Type':  'minimal',
      },
      body: JSON.stringify({
        guest_id:    guestId,
        tale_id:     taleId,
        badge_type:  badgeType,
        awarded_at:  new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn('[trackside] Badge sync skipped (will persist locally):', e);
  }
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const dt = new Date(dateStr);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
