import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute } from '@angular/router';
import { catchError, EMPTY, finalize, map, merge, of, Subject, Subscription, switchMap, takeWhile, tap, TimeoutError, timer } from 'rxjs';
import { actionsEnabled, APP_CONFIG, githubOwner } from '../../../interfaces/i-app-config';
import { IActionsInfo, IActionsMetrics, IActionsRequest, IProjectRunInfo } from '../../../interfaces/i-project-actions';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { describeApiError } from '../../../shared/api-error';
import { formatAgo, formatDuration, parseTimestamp } from '../../../shared/format-time';
import { PageHeader } from '../../../shared/page-header/page-header';
import { deriveConclusion, resolveStatus, RunState } from '../../../shared/run-status';
import { chipClass } from '../../../shared/status-ring';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/workload-actions/confirm-dialog';

/** The only workflow and trigger the page starts; the branch is up to the user. */
const WORKFLOW = 'ci.yml';
const EVENT = 'workflow_dispatch';
const DEFAULT_BRANCH = 'main';

/** How often the open run is checked, and how many failed checks in a row end the watching. */
const POLL_MS = 3_000;
const MAX_FAILED_POLLS = 5;
/** How often the list of recent runs is refreshed (a new run shows up within this time). */
const RUNS_POLL_MS = 15_000;

const EVENT_LABELS: Record<string, string> = {
  push: 'Push',
  workflow_dispatch: 'Manual',
  pull_request: 'Pull request',
  schedule: 'Scheduled',
};

/** The run whose steps are on screen. */
interface SelectedRun {
  id: number;
  title: string;
  htmlUrl: string;
  branch: string;
  event: string;
  /** When it was created, in ms; from the click until the list reports the real time. */
  createdAt: number | null;
}

@Component({
  imports: [PageHeader, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressBarModule, MatProgressSpinnerModule],
  selector: 'app-project',
  styleUrl: './project.scss',
  templateUrl: './project.html',
})
export class Project implements OnInit {
  private readonly api = inject(K8sResourcesApi);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly config = inject(APP_CONFIG);
  private monitoring?: Subscription;
  /** Fires to reload the run list right away, e.g. after starting a run. */
  private readonly refreshRuns$ = new Subject<void>();

  protected readonly owner = githubOwner(this.config);
  protected readonly actionsOn = actionsEnabled(this.config);
  protected readonly workflow = WORKFLOW;

  protected readonly repo = signal('');
  protected readonly branch = signal(DEFAULT_BRANCH);

  /** True from the click until the server has reported the new run. */
  protected readonly starting = signal(false);
  protected readonly startError = signal<string | null>(null);

  private readonly runs = signal<IProjectRunInfo[]>([]);
  protected readonly runsLoaded = signal(false);
  protected readonly runsFailed = signal(false);

  protected readonly selected = signal<SelectedRun | null>(null);
  /** The user chose this run (or started it); otherwise the page follows the newest run that's still going. */
  private readonly picked = signal(false);

  protected readonly metrics = signal<IActionsMetrics | null>(null);
  /** The watching gave up after several failed checks in a row. */
  protected readonly lostContact = signal(false);
  private readonly finishedAt = signal<number | null>(null);
  /** Ticks every second so elapsed times move while a run is under way. */
  private readonly now = signal(Date.now());

  /** The selected run's entry in the list, once the list has it. */
  private readonly entry = computed(() => this.runs().find((r) => r.id === this.selected()?.id) ?? null);

  protected readonly status = computed(() => {
    if (!this.selected()) return null;
    const source = this.metrics() ?? this.entry();
    const reported = resolveStatus(source?.status ?? 'queued', source?.conclusion);
    // A finished run that doesn't state its own result gets it from its jobs.
    const m = this.metrics();
    if (m && reported.final && !reported.hasResult) {
      const derived = deriveConclusion(m.jobs.map((job) => job.job_conclusion));
      if (derived) return resolveStatus(m.status, derived);
    }
    return reported;
  });
  protected readonly busy = computed(() => this.starting() || (this.status() !== null && !this.status()!.final && !this.lostContact()));

  protected readonly jobs = computed(() =>
    (this.metrics()?.jobs ?? []).map((job) => {
      const steps = job.job_steps.map((step) => ({
        name: step.step_name,
        status: resolveStatus(step.step_status, step.step_conclusion),
      }));
      const done = steps.filter((step) => step.status.final).length;
      return {
        name: job.job_name,
        status: resolveStatus(job.job_status, job.job_conclusion),
        steps,
        done,
        percent: steps.length ? Math.round((done / steps.length) * 100) : 0,
      };
    }),
  );

  /** "7 of 11 steps" across every job, once GitHub has listed any. */
  protected readonly stepSummary = computed(() => {
    const jobs = this.jobs();
    const total = jobs.reduce((sum, job) => sum + job.steps.length, 0);
    const done = jobs.reduce((sum, job) => sum + job.done, 0);
    return total > 0 ? `${done} of ${total} steps` : '';
  });

  private readonly createdAt = computed(() => {
    const entry = this.entry();
    return (entry ? parseTimestamp(entry.created_at) : null) ?? this.selected()?.createdAt ?? null;
  });
  protected readonly startedText = computed(() => {
    const at = this.createdAt();
    return at === null ? '—' : new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  });
  /** How long the selected run took, or has been running. GitHub's times when it has them. */
  protected readonly elapsed = computed(() => {
    const start = this.createdAt();
    if (start === null) return '—';
    const entry = this.entry();
    const entryFinal = entry ? resolveStatus(entry.status, entry.conclusion).final : false;
    const end = this.status()?.final
      ? ((entryFinal && entry ? parseTimestamp(entry.updated_at) : null) ?? this.finishedAt() ?? this.now())
      : this.now();
    return formatDuration((end - start) / 1000);
  });

  /** True while the page is waiting for data: the list of runs, or the first look at the selected run's steps. */
  protected readonly loadingData = computed(
    () => !this.runsLoaded() || (this.selected() !== null && this.metrics() === null && !this.lostContact()),
  );

  /** Final but without a reported result: the page can't say whether it passed. */
  protected readonly resultUnknown = computed(() => {
    const status = this.status();
    return status !== null && status.final && !status.hasResult;
  });

  /** The recent runs, newest first, ready to show. */
  protected readonly rows = computed(() => {
    const now = this.now();
    const selectedId = this.selected()?.id;
    return this.runs()
      .map((run) => {
        const status = resolveStatus(run.status, run.conclusion);
        const created = parseTimestamp(run.created_at);
        const updated = parseTimestamp(run.updated_at);
        return {
          run,
          id: run.id,
          number: run.run_number,
          title: run.commit_message.split('\n')[0].trim() || `Run #${run.run_number}`,
          sha: run.head_sha.slice(0, 7),
          event: EVENT_LABELS[run.event] ?? run.event,
          branch: run.head_branch,
          status,
          created,
          ago: created === null ? '' : formatAgo(new Date(created), now),
          took: created === null ? '' : formatDuration(((status.final ? (updated ?? now) : now) - created) / 1000),
          selected: run.id === selectedId,
        };
      })
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  });

  protected readonly chipClass = chipClass;

  constructor() {
    timer(0, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));
    this.destroyRef.onDestroy(() => this.monitoring?.unsubscribe());
  }

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        tap((params) => {
          this.monitoring?.unsubscribe();
          this.repo.set(params.get('repo') ?? '');
          this.branch.set(DEFAULT_BRANCH);
          this.startError.set(null);
          this.starting.set(false);
          this.runs.set([]);
          this.runsLoaded.set(false);
          this.runsFailed.set(false);
          this.selected.set(null);
          this.picked.set(false);
          this.metrics.set(null);
          this.lostContact.set(false);
          this.finishedAt.set(null);
        }),
        // Load the recent runs now and every so often; a failed refresh keeps what's shown.
        switchMap(() =>
          merge(timer(0, RUNS_POLL_MS), this.refreshRuns$).pipe(
            switchMap(() =>
              this.api.getProjectRuns(this.owner, this.repo()).pipe(
                catchError(() => {
                  this.runsFailed.set(true);
                  this.runsLoaded.set(true);
                  return EMPTY;
                }),
              ),
            ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((runs) => {
        this.runs.set(runs);
        this.runsLoaded.set(true);
        this.runsFailed.set(false);
        this.followLatest(runs);
      });
  }

  /** Unless the user chose a run, show the newest one that's still going, else the newest of all. */
  private followLatest(runs: IProjectRunInfo[]): void {
    if (this.picked() || runs.length === 0) return;
    const newest = [...runs].sort((a, b) => (parseTimestamp(b.created_at) ?? 0) - (parseTimestamp(a.created_at) ?? 0));
    const target = newest.find((r) => !resolveStatus(r.status, r.conclusion).final) ?? newest[0];
    if (target.id !== this.selected()?.id) {
      this.select(
        {
          id: target.id,
          title: target.commit_message.split('\n')[0].trim() || `Run #${target.run_number}`,
          htmlUrl: target.run_html,
          branch: target.head_branch,
          event: EVENT_LABELS[target.event] ?? target.event,
          createdAt: parseTimestamp(target.created_at),
        },
        false,
      );
    }
  }

  protected pick(run: IProjectRunInfo): void {
    if (run.id === this.selected()?.id) return;
    this.select(
      {
        id: run.id,
        title: run.commit_message.split('\n')[0].trim() || `Run #${run.run_number}`,
        htmlUrl: run.run_html,
        branch: run.head_branch,
        event: EVENT_LABELS[run.event] ?? run.event,
        createdAt: parseTimestamp(run.created_at),
      },
      true,
    );
    // On narrow screens the panel sits above the list; keep it in view after a click.
    document.getElementById('run-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  private select(run: SelectedRun, picked: boolean): void {
    this.selected.set(run);
    this.picked.set(picked);
    this.metrics.set(null);
    this.lostContact.set(false);
    this.finishedAt.set(null);
    this.monitor(run.id);
  }

  protected githubUrl(): string {
    return `https://github.com/${this.owner}/${this.repo()}`;
  }

  /** The state's mark: a symbol (the label next to it says the same in words). */
  protected glyph(state: RunState): string {
    switch (state) {
      case 'success':
        return '✓';
      case 'failure':
      case 'timed_out':
        return '✗';
      case 'cancelled':
      case 'skipped':
      case 'neutral':
        return '–';
      case 'running':
        return '';
      case 'queued':
        return '○';
      default:
        return '●';
    }
  }

  protected glyphClass(state: RunState): string {
    switch (state) {
      case 'success':
        return 'text-emerald-700';
      case 'failure':
      case 'timed_out':
        return 'text-(--mat-sys-error)';
      default:
        return 'text-(--mat-sys-on-surface-variant)';
    }
  }

  protected confirmRun(): void {
    const branch = this.branch().trim() || DEFAULT_BRANCH;
    const data: ConfirmDialogData = {
      title: `Run CI for ${this.repo()}?`,
      message: `This starts the ${WORKFLOW} workflow on GitHub for the ${branch} branch (${EVENT}).`,
      confirmLabel: 'Run CI',
    };
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data, width: '440px' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) this.start(branch);
      });
  }

  private start(branch: string): void {
    const request: IActionsRequest = { event: EVENT, workflow: WORKFLOW, branch };
    this.starting.set(true);
    this.startError.set(null);
    this.api
      .executeProjectActions(this.owner, this.repo(), request)
      .pipe(finalize(() => this.starting.set(false)))
      .subscribe({
        next: (started) => {
          const info: IActionsInfo | undefined = started[0];
          if (!info) {
            this.startError.set('The server started the workflow but did not report a run.');
            return;
          }
          this.select(
            { id: info.id, title: info.title, htmlUrl: info.run_html, branch: info.branch, event: EVENT_LABELS[info.event] ?? info.event, createdAt: Date.now() },
            true,
          );
          this.refreshRuns$.next();
        },
        error: (error) => this.startError.set(this.describeStartError(error)),
      });
  }

  private describeStartError(error: unknown): string {
    if (error instanceof TimeoutError || (error instanceof HttpErrorResponse && error.status === 504)) {
      return "GitHub didn't start a run in time. Check the repository's Actions tab to see whether it did.";
    }
    return describeApiError(error);
  }

  /** Checks the run every few seconds until it has finished, or until several checks in a row fail. */
  private monitor(runId: number): void {
    this.monitoring?.unsubscribe();
    let failures = 0;
    this.monitoring = timer(0, POLL_MS)
      .pipe(
        switchMap(() =>
          this.api.monitorProjectActions(this.owner, this.repo(), runId).pipe(
            map((metrics) => ({ metrics })),
            catchError(() => of({ metrics: null })),
          ),
        ),
        tap(({ metrics }) => {
          if (metrics) {
            failures = 0;
            this.lostContact.set(false);
            this.metrics.set(metrics);
            if (resolveStatus(metrics.status, metrics.conclusion).final) {
              this.finishedAt.set(Date.now());
              // The list still shows this run as going; reload it now instead of at the next tick.
              this.refreshRuns$.next();
            }
          } else if (++failures >= MAX_FAILED_POLLS) {
            this.lostContact.set(true);
          }
        }),
        takeWhile(({ metrics }) => (metrics ? !resolveStatus(metrics.status, metrics.conclusion).final : failures < MAX_FAILED_POLLS), true),
      )
      .subscribe();
  }

  protected retryWatching(): void {
    const run = this.selected();
    if (run) {
      this.lostContact.set(false);
      this.monitor(run.id);
    }
  }
}
