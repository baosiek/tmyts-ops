import { signal } from '@angular/core';

/** What a card currently shows for a workload; enough to tell when an action has finished. */
export interface WorkloadState {
  /** Desired replicas (spec). */
  desired: number;
  ready: number;
  /** Pods already on the newest revision. */
  updated: number;
}

type Entry = { kind: 'scale'; target: number; since: number } | { kind: 'restart'; since: number };

/** After a restart is requested, the controller needs a moment before pods start changing. */
const RESTART_GRACE_MS = 8_000;
/** Stop showing progress after this long, whatever the pods are doing (e.g. a crash loop). */
const GIVE_UP_MS = 5 * 60_000;

/**
 * Remembers scale and restart requests made from the cards and says, from the live counts,
 * whether each one is still in progress. The server answers 202 as soon as it accepts a request,
 * so the cards have to watch the pods themselves.
 */
export class ActionProgress {
  private readonly entries = signal<Record<string, Entry>>({});

  scaling(id: string, target: number): void {
    this.entries.update((all) => ({ ...all, [id]: { kind: 'scale', target, since: Date.now() } }));
  }

  restarting(id: string): void {
    this.entries.update((all) => ({ ...all, [id]: { kind: 'restart', since: Date.now() } }));
  }

  /** "Scaling to 3…" or "Restarting…" while the action is under way, otherwise null. Reads signals, so call it inside computed(). */
  label(id: string, state: WorkloadState, now = Date.now()): string | null {
    const entry = this.entries()[id];
    if (!entry || now - entry.since > GIVE_UP_MS) return null;
    if (entry.kind === 'scale') {
      const done = state.desired === entry.target && state.ready === entry.target;
      return done ? null : `Scaling to ${entry.target}…`;
    }
    const settled = state.ready === state.desired && state.updated === state.desired;
    return now - entry.since < RESTART_GRACE_MS || !settled ? 'Restarting…' : null;
  }
}
