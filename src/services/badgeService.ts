// ================== BADGE SERVICE ==================
// Badge/date presentation helpers. PUBLIC-v7.4B.P.20 removed the dead
// `recordBadgeRemote` writer (zero callers since the v6.x remote-sync
// experiments; badge persistence is localStorage via guestPersistence,
// and server-side event logging is the separate — still deferred —
// log-events pipeline).

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const dt = new Date(dateStr);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
