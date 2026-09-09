// ================== TRACKSIDE ARCADE — WEEKLY PERIOD (calendar helper) ==================
// PUBLIC-v7.4B.GAME.22B §22 — the FROZEN period contract for the future
// Weekly Dispatch (GAME.22E): one completion per calendar week, where a
// week runs Monday 00:00 through the next Monday 00:00 in
// America/New_York. Period identity is the LOCAL calendar week, never the
// UTC week: a Sunday-evening result in the Lehigh Valley belongs to the
// week that is ending, even though UTC has already turned to Monday.
//
// PURE and dependency-free: the zone math uses the platform Intl API
// with a fixed IANA zone (no server time, no library, no Date.now — the
// caller supplies the instant, normally result.completedAt). Nothing is
// persisted and no award is computed here. 22E decides whether this
// helper becomes the dispatch AUTHORITY; in 22B it is exercised by the
// unit battery only and imported by no runtime module.

export const DISPATCH_TIME_ZONE = 'America/New_York';

export interface WeeklyPeriod {
  /** The local Monday that opens the period, as YYYY-MM-DD (the stable key). */
  readonly periodId: string;
  /** Monday 00:00 local as a UTC ISO instant (inclusive). */
  readonly startsAt: string;
  /** Next Monday 00:00 local as a UTC ISO instant (exclusive). */
  readonly endsAt: string;
  readonly timeZone: string;
}

interface ZonedParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // Monday = 0 … Sunday = 6
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Wall-clock parts of `instantMs` in `timeZone` (pure Intl read). */
function zonedParts(instantMs: number, timeZone: string): ZonedParts | null {
  const parts = formatterFor(timeZone).formatToParts(new Date(instantMs));
  const read = (type: string): string | undefined => parts.find((p) => p.type === type)?.value;
  const weekdayName = read('weekday');
  const year = Number(read('year'));
  const month = Number(read('month'));
  const day = Number(read('day'));
  const hour = Number(read('hour')) % 24; // h23 guard: some engines print 24 for midnight
  const minute = Number(read('minute'));
  const second = Number(read('second'));
  if (weekdayName === undefined || !(weekdayName in WEEKDAY_INDEX)) return null;
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;
  return { year, month, day, hour, minute, second, weekday: WEEKDAY_INDEX[weekdayName] };
}

const DAY_MS = 86_400_000;

/** The UTC instant at which the local calendar day `y-m-d` begins in
 *  `timeZone`. Two-pass offset resolution handles DST boundaries (US
 *  transitions happen at 02:00 local, so local midnight always exists). */
function zonedMidnightToInstant(year: number, month: number, day: number, timeZone: string): number | null {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const resolve = (candidate: number): number | null => {
    const parts = zonedParts(candidate, timeZone);
    if (parts === null) return null;
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return candidate - (asUtc - candidate); // candidate minus the zone offset observed at candidate
  };
  const first = resolve(guess);
  if (first === null) return null;
  const check = zonedParts(first, timeZone);
  if (check !== null && check.year === year && check.month === month && check.day === day && check.hour === 0 && check.minute === 0) {
    return first;
  }
  const second = resolve(first);
  return second;
}

/** Resolve the dispatch period containing `instant`. Null for an
 *  unparseable instant. Deterministic: same input, same output. */
export function getWeeklyPeriod(
  instant: string | Date,
  timeZone: string = DISPATCH_TIME_ZONE,
): WeeklyPeriod | null {
  const ms = typeof instant === 'string' ? Date.parse(instant) : instant.getTime();
  if (!Number.isFinite(ms)) return null;
  const local = zonedParts(ms, timeZone);
  if (local === null) return null;
  // Walk back to Monday on the LOCAL calendar (date arithmetic in UTC space
  // is DST-safe because it only moves calendar days, never instants).
  const localDayUtc = Date.UTC(local.year, local.month - 1, local.day);
  const mondayUtc = localDayUtc - local.weekday * DAY_MS;
  const monday = new Date(mondayUtc);
  const nextMonday = new Date(mondayUtc + 7 * DAY_MS);
  const startsAt = zonedMidnightToInstant(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), timeZone);
  const endsAt = zonedMidnightToInstant(nextMonday.getUTCFullYear(), nextMonday.getUTCMonth() + 1, nextMonday.getUTCDate(), timeZone);
  if (startsAt === null || endsAt === null) return null;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return {
    periodId: `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    timeZone,
  };
}
