/** How a status reads at a glance; drives the colors of status rings and chips. */
export type StatusTone = 'good' | 'warning' | 'critical' | 'neutral';

/** Tailwind border color for a status ring; the same greens and reds as the replica rings. */
export function ringClass(tone: StatusTone): string {
  switch (tone) {
    case 'good':
      return 'border-[#0ca30c]';
    case 'warning':
      return 'border-[#fab219]';
    case 'critical':
      return 'border-[#d03b3b]';
    default:
      return 'border-(--mat-sys-outline-variant)';
  }
}
