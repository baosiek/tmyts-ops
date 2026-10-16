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

/** Tailwind classes for a status chip of the given tone. */
export function chipClass(tone: StatusTone): string {
  switch (tone) {
    case 'good':
      return 'bg-emerald-100 text-emerald-800';
    case 'warning':
      return 'bg-amber-100 text-amber-900';
    case 'critical':
      return 'bg-(--mat-sys-error-container) text-(--mat-sys-on-error-container)';
    default:
      return 'bg-(--mat-sys-surface-container) text-(--mat-sys-on-surface-variant)';
  }
}
