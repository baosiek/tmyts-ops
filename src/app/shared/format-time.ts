/** "20 s", "11 m 37 s", "1 h 52 m", "2 d 3 h": the two largest non-zero units. */
export function formatDuration(totalSeconds: number): string {
  const units: [string, number][] = [['d', 86_400], ['h', 3_600], ['m', 60], ['s', 1]];
  const parts: string[] = [];
  let rest = Math.max(0, Math.round(totalSeconds));
  for (const [unit, size] of units) {
    const n = Math.floor(rest / size);
    rest -= n * size;
    if (n > 0 || (unit === 's' && parts.length === 0)) parts.push(`${n} ${unit}`);
    if (parts.length === 2) break;
  }
  return parts.join(' ');
}

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "3 hours ago", "yesterday", "2 weeks ago". */
export function formatAgo(from: Date, nowMs: number): string {
  const seconds = Math.round((from.getTime() - nowMs) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relativeTime.format(Math.trunc(seconds / size), unit);
  }
  return 'just now';
}

/** "Oct 12, 2026, 12:30 PM" in the viewer's time zone; null if `iso` isn't a valid date. */
export function formatDateTime(iso: string | null): { date: Date; text: string } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return { date, text: date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) };
}
