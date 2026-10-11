const ALIASES: Record<string, string> = {
  '@yearly': 'Every year on 1 January at 00:00',
  '@annually': 'Every year on 1 January at 00:00',
  '@monthly': 'Day 1 of every month at 00:00',
  '@weekly': 'Every Sunday at 00:00',
  '@daily': 'Every day at 00:00',
  '@midnight': 'Every day at 00:00',
  '@hourly': 'Every hour',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const num = (s: string, max: number): number | null => {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n <= max ? n : null;
};

/** Parses "1-5", "0,3" or "2" into sorted, de-duplicated numbers; null if it uses anything else. */
function parseList(field: string, max: number): number[] | null {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const [from, to] = [num(range[1], max), num(range[2], max)];
      if (from === null || to === null || from > to) return null;
      for (let i = from; i <= to; i++) out.add(i);
    } else {
      const n = num(part, max);
      if (n === null) return null;
      out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

const pad = (n: number) => String(n).padStart(2, '0');

function describeDays(dow: number[]): string {
  const days = [...new Set(dow.map((d) => d % 7))].sort((a, b) => a - b);
  if (days.length === 7) return 'Every day';
  if (days.join() === '1,2,3,4,5') return 'Weekdays';
  if (days.length === 1) return `Every ${DAY_NAMES[days[0]]}`;
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  const short = (d: number) => DAY_NAMES[d].slice(0, 3);
  return contiguous && days.length >= 3
    ? `${short(days[0])}–${short(days.at(-1)!)}`
    : days.map(short).join(', ');
}

/**
 * A plain-English reading of a cron schedule ("Weekdays at 08:50 UTC"), or null
 * when the expression uses something this doesn't cover (then show it as is).
 * Times are UTC, which is what the cluster's controller uses.
 */
export function describeCron(expr: string): string | null {
  const trimmed = expr.trim();
  if (ALIASES[trimmed]) return trimmed === '@hourly' ? ALIASES[trimmed] : `${ALIASES[trimmed]} UTC`;

  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour, dom, month, dow] = fields;
  if (month !== '*') return null;

  const step = minute.match(/^\*\/(\d+)$/);
  if (step && hour === '*' && dom === '*' && dow === '*') return `Every ${step[1]} minutes`;
  if (minute === '*' && hour === '*' && dom === '*' && dow === '*') return 'Every minute';

  const m = num(minute, 59);
  if (m === null) return null;
  if (hour === '*' && dom === '*' && dow === '*') return `Every hour at minute ${m}`;

  const hours = parseList(hour, 23);
  if (!hours) return null;
  const times = hours.map((h) => `${pad(h)}:${pad(m)}`);
  const at = `at ${times.length > 1 ? `${times.slice(0, -1).join(', ')} and ${times.at(-1)}` : times[0]} UTC`;

  if (dom === '*' && dow === '*') return `Every day ${at}`;
  if (dom === '*') {
    const days = parseList(dow, 7);
    return days ? `${describeDays(days)} ${at}` : null;
  }
  if (dow === '*') {
    const day = num(dom, 31);
    return day === null ? null : `Day ${day} of every month ${at}`;
  }
  return null;
}
