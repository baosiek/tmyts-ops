import type { StatusTone } from './status-ring';

export type RunState =
  | 'queued'
  | 'running'
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | 'action_required'
  | 'neutral'
  | 'completed'
  | 'unknown';

export interface ResolvedStatus {
  state: RunState;
  label: string;
  tone: StatusTone;
  /** Nothing more will change: the run, job or step has finished. */
  final: boolean;
  /** Whether the result (success, failure…) is known; false for a bare "completed". */
  hasResult: boolean;
}

/** GitHub and the server spell statuses in different ways ("in_progress", "InProgress"); compare them loosely. */
const normalize = (value: string | null | undefined): string => (value ?? '').toLowerCase().replace(/[\s_-]/g, '');

const known: Record<string, ResolvedStatus> = {
  success: { state: 'success', label: 'Success', tone: 'good', final: true, hasResult: true },
  failure: { state: 'failure', label: 'Failed', tone: 'critical', final: true, hasResult: true },
  failed: { state: 'failure', label: 'Failed', tone: 'critical', final: true, hasResult: true },
  timedout: { state: 'timed_out', label: 'Timed out', tone: 'critical', final: true, hasResult: true },
  cancelled: { state: 'cancelled', label: 'Cancelled', tone: 'neutral', final: true, hasResult: true },
  canceled: { state: 'cancelled', label: 'Cancelled', tone: 'neutral', final: true, hasResult: true },
  skipped: { state: 'skipped', label: 'Skipped', tone: 'neutral', final: true, hasResult: true },
  neutral: { state: 'neutral', label: 'Neutral', tone: 'neutral', final: true, hasResult: true },
  actionrequired: { state: 'action_required', label: 'Action required', tone: 'warning', final: true, hasResult: true },
  inprogress: { state: 'running', label: 'Running', tone: 'warning', final: false, hasResult: false },
  queued: { state: 'queued', label: 'Queued', tone: 'neutral', final: false, hasResult: false },
  pending: { state: 'queued', label: 'Queued', tone: 'neutral', final: false, hasResult: false },
  requested: { state: 'queued', label: 'Queued', tone: 'neutral', final: false, hasResult: false },
  waiting: { state: 'queued', label: 'Waiting', tone: 'neutral', final: false, hasResult: false },
  completed: { state: 'completed', label: 'Completed', tone: 'neutral', final: true, hasResult: false },
};

/**
 * The state of a run, job or step. A result (the conclusion, or a status that is itself a result)
 * wins; otherwise the status says where it is. A bare "completed" means finished with the result
 * not reported.
 */
export function resolveStatus(status: string | null | undefined, conclusion?: string | null): ResolvedStatus {
  const result = known[normalize(conclusion)];
  if (result?.hasResult) return result;
  const byStatus = known[normalize(status)];
  if (byStatus) return byStatus;
  const raw = (status ?? '').trim();
  return { state: 'unknown', label: raw || 'Unknown', tone: 'neutral', final: false, hasResult: false };
}

/**
 * A run's result worked out from its jobs' conclusions, for when the run itself doesn't report one:
 * any failure fails it, then any cancellation, otherwise it succeeded. Null while any job's result is
 * missing, so an unfinished run is never given a verdict.
 */
export function deriveConclusion(jobConclusions: (string | null | undefined)[]): string | null {
  if (jobConclusions.length === 0) return null;
  const states = jobConclusions.map((c) => known[normalize(c)]);
  if (states.some((s) => !s?.hasResult)) return null;
  if (states.some((s) => s.state === 'failure' || s.state === 'timed_out')) return 'failure';
  if (states.some((s) => s.state === 'cancelled')) return 'cancelled';
  if (states.every((s) => s.state === 'skipped')) return 'skipped';
  return 'success';
}

