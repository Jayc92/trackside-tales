// ================== TRACKSIDE ADMIN — /admin/tap-list ==================
// Server Component. First write-capable admin route (v7.3).
//
// Sections:
//   1. "Tap a beer" form: beer dropdown (active beers only), optional
//      tap number, optional notes. Submits to tapStartAction.
//   2. "Live pours" table: every tap_list row with ended_at IS NULL.
//      Each row has an "End pour" form and an inline "Edit notes" form.
//   3. "Recent ended pours" table: 25 most recent ended rows. Read-only.
//
// All forms target Server Actions in ./actions.ts. Actions are
// `'use server'`, call `requireAdmin()` again at the action endpoint,
// Zod-validate FormData, and call the mutation helpers (which go
// through Postgres functions that write tap_list AND admin_actions
// in a single transaction).
//
// Banner posture:
//   * `?err=…`  → red banner
//   * `?ok=start` → "Pour started." (similar for end / notes)
//   * No params → no banner
//   * The banner clears as soon as staff navigate away or refresh
//     onto a clean URL.

import {
  listLiveTapList,
  listRecentEndedTapList,
  listActiveBeerOptions,
} from '@/lib/admin/queries';
import {
  tapStartAction,
  tapEndAction,
  tapEditNotesAction,
} from './actions';
import { StatusNotice } from '@/components/admin/StatusNotice';

interface SearchParams {
  err?: string | string[];
  ok?:  string | string[];
}

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const okMessages: Record<string, string> = {
  start: 'Pour started.',
  end:   'Pour ended.',
  notes: 'Notes updated.',
};

export default async function AdminTapListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [liveResult, endedResult, beerResult] = await Promise.all([
    listLiveTapList(),
    listRecentEndedTapList(25),
    listActiveBeerOptions(),
  ]);

  const errMsg = pickFirst(searchParams.err);
  const okKey  = pickFirst(searchParams.ok);
  const okMsg  = okKey ? okMessages[okKey] : undefined;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h2 className="font-serif text-xl text-rail">Tap list</h2>
        <p className="text-sm text-ink/60">
          Pour beers, end pours, and edit notes on the live row. Every
          mutation is logged to <code className="text-xs">admin_actions</code>{' '}
          in the same transaction.
        </p>
      </header>

      {errMsg && <StatusNotice tone="error">{errMsg}</StatusNotice>}
      {okMsg  && <StatusNotice>{okMsg}</StatusNotice>}

      {/* ---------- Tap a beer form ---------- */}
      <section className="flex flex-col gap-3">
        <h3 className="font-serif text-lg text-rail">Tap a beer</h3>
        {!beerResult.ok ? (
          <StatusNotice tone="error">{beerResult.error}</StatusNotice>
        ) : beerResult.data.length === 0 ? (
          <StatusNotice>No active beers. Activate a beer first.</StatusNotice>
        ) : (
          <form
            action={tapStartAction}
            className="flex flex-col gap-3 rounded-md border border-brass/30 bg-white/40 p-4 sm:max-w-xl"
          >
            <label className="flex flex-col gap-1 text-sm text-ink/80">
              Beer
              <select
                name="beer_slug"
                required
                className="rounded border border-brass/40 bg-white px-3 py-2 text-base text-ink focus:border-brass focus:outline-none"
                defaultValue=""
              >
                <option value="" disabled>
                  Choose a beer
                </option>
                {beerResult.data.map((b) => (
                  <option key={b.slug} value={b.slug}>
                    {b.name} ({b.slug})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm text-ink/80">
              Tap number (optional)
              <input
                type="number"
                name="tap_number"
                min={1}
                max={99}
                step={1}
                placeholder="e.g. 4"
                className="rounded border border-brass/40 bg-white px-3 py-2 text-base text-ink focus:border-brass focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-ink/80">
              Notes (optional)
              <input
                type="text"
                name="notes"
                maxLength={280}
                placeholder="e.g. cask conditioned, second batch"
                className="rounded border border-brass/40 bg-white px-3 py-2 text-base text-ink focus:border-brass focus:outline-none"
              />
            </label>

            <div>
              <button
                type="submit"
                className="rounded bg-rail px-4 py-2 text-sm font-medium uppercase tracking-widest text-parchment transition hover:bg-ink"
              >
                Start pour
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ---------- Live pours ---------- */}
      <section className="flex flex-col gap-3">
        <h3 className="font-serif text-lg text-rail">Live pours</h3>
        {!liveResult.ok ? (
          <StatusNotice tone="error">{liveResult.error}</StatusNotice>
        ) : liveResult.data.length === 0 ? (
          <StatusNotice>Nothing pouring right now.</StatusNotice>
        ) : (
          <ul className="flex flex-col gap-3">
            {liveResult.data.map((row) => (
              <li
                key={`${row.beer_slug}|${row.started_at}`}
                className="rounded-md border border-brass/30 bg-white/40 p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <div className="font-serif text-rail">
                      {row.beer_name ?? row.beer_slug}{' '}
                      {row.tap_number != null && (
                        <span className="ml-2 text-xs uppercase tracking-widest text-ink/60">
                          tap {row.tap_number}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-ink/60">
                      {row.beer_slug}
                    </div>
                    <div className="text-xs text-ink/60">
                      started {formatDate(row.started_at)}
                    </div>
                  </div>

                  <form action={tapEndAction}>
                    <input type="hidden" name="beer_slug"  value={row.beer_slug} />
                    <input type="hidden" name="started_at" value={row.started_at} />
                    <button
                      type="submit"
                      className="rounded border border-brass/40 bg-white/60 px-3 py-1.5 text-xs uppercase tracking-widest text-ink/80 hover:bg-white/90"
                    >
                      End pour
                    </button>
                  </form>
                </div>

                <form
                  action={tapEditNotesAction}
                  className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
                >
                  <input type="hidden" name="beer_slug"  value={row.beer_slug} />
                  <input type="hidden" name="started_at" value={row.started_at} />
                  <label className="flex flex-1 flex-col gap-1 text-xs uppercase tracking-widest text-ink/60">
                    Notes
                    <input
                      type="text"
                      name="notes"
                      maxLength={280}
                      defaultValue={row.notes ?? ''}
                      className="rounded border border-brass/40 bg-white px-3 py-1.5 text-sm text-ink focus:border-brass focus:outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded border border-brass/40 bg-white/60 px-3 py-1.5 text-xs uppercase tracking-widest text-ink/80 hover:bg-white/90"
                  >
                    Save notes
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Recent ended pours ---------- */}
      <section className="flex flex-col gap-3">
        <h3 className="font-serif text-lg text-rail">Recent ended pours</h3>
        <p className="text-xs text-ink/50">
          History only — ended pours cannot be edited or resurrected.
        </p>
        {!endedResult.ok ? (
          <StatusNotice tone="error">{endedResult.error}</StatusNotice>
        ) : endedResult.data.length === 0 ? (
          <StatusNotice>No ended pours yet.</StatusNotice>
        ) : (
          <div className="overflow-x-auto rounded-md border border-brass/30 bg-white/40">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-parchment/60 text-xs uppercase tracking-widest text-ink/60">
                <tr>
                  <th className="px-3 py-2">beer</th>
                  <th className="px-3 py-2">tap</th>
                  <th className="px-3 py-2">started</th>
                  <th className="px-3 py-2">ended</th>
                  <th className="px-3 py-2">notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brass/20">
                {endedResult.data.map((row) => (
                  <tr
                    key={`${row.beer_slug}|${row.started_at}`}
                    className="align-top text-ink/80"
                  >
                    <td className="px-3 py-2">
                      <div>{row.beer_name ?? row.beer_slug}</div>
                      <div className="font-mono text-xs text-ink/50">
                        {row.beer_slug}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {row.tap_number ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink/60">
                      {formatDate(row.started_at)}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink/60">
                      {formatDate(row.ended_at)}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink/70">
                      {row.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
