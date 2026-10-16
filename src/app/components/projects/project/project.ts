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
import { catchError, finalize, map, of, Subscription, switchMap, takeWhile, tap, TimeoutError, timer } from 'rxjs';
import { actionsEnabled, APP_CONFIG, githubOwner } from '../../../interfaces/i-app-config';
import { IActionsInfo, IActionsMetrics, IActionsRequest } from '../../../interfaces/i-project-actions';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { describeApiError } from '../../../shared/api-error';
import { formatDateTime, formatDuration } from '../../../shared/format-time';
import { PageHeader } from '../../../shared/page-header/page-header';
import { deriveConclusion, resolveStatus, RunState } from '../../../shared/run-status';
import { chipClass } from '../../../shared/status-ring';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/workload-actions/confirm-dialog';

/** The only workflow and trigger the page starts; the branch is up to the user. */
const WORKFLOW = 'ci.yml';
const EVENT = 'workflow_dispatch';
const DEFAULT_BRANCH = 'main';

/** How often a running workflow is checked, and how many failed checks in a row end the watching. */
const POLL_MS = 3_000;
const MAX_FAILED_POLLS = 5;

/** What's remembered about the last run of each repository, so a reload can pick it up again. */
interface StoredRun {
  id: number;
  title: string;
  htmlUrl: string;
  branch: string;
  startedAt: number;
}

const storageKey = (owner: string, repo: string) => `tmyts.ops.lastRun.${owner}/${repo}`;

function loadStoredRun(owner: string, repo: string): StoredRun | null {
  try {
    const raw = localStorage.getItem(storageKey(owner, repo));
    const run = raw ? (JSON.parse(raw) as StoredRun) : null;
    return run && typeof run.id === 'number' ? run : null;
  } catch {
    return null;
  }
}

function saveStoredRun(owner: string, repo: string, run: StoredRun): void {
  try {
    localStorage.setItem(storageKey(owner, repo), JSON.stringify(run));
  } catch {
    // Storage can be blocked or full; the page works without it.
  }
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

  protected readonly owner = githubOwner(this.config);
  protected readonly actionsOn = actionsEnabled(this.config);
  protected readonly workflow = WORKFLOW;

  protected readonly repo = signal('');
  protected readonly branch = signal(DEFAULT_BRANCH);

  /** True from the click until the server has reported the new run. */
  protected readonly starting = signal(false);
  protected readonly startError = signal<string | null>(null);

  private readonly run = signal<StoredRun | null>(null);
  protected readonly metrics = signal<IActionsMetrics | null>(null);
  /** The watching gave up after several failed checks in a row. */
  protected readonly lostContact = signal(false);
  private readonly finishedAt = signal<number | null>(null);
  /** The run was already finished when the page first saw it, so how long it took isn't known (the server sends no times). */
  protected readonly durationUnknown = signal(false);
  /** Ticks every second so the elapsed time moves while a run is under way. */
  private readonly now = signal(Date.now());

  protected readonly runInfo = this.run.asReadonly();
  protected readonly status = computed(() => {
    const m = this.metrics();
    if (!this.run()) return null;
    const reported = resolveStatus(m?.status ?? 'queued', m?.conclusion);
    // A finished run that doesn't state its own result gets it from its jobs.
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

  protected readonly startedText = computed(() => {
    const run = this.run();
    return run ? (formatDateTime(new Date(run.startedAt).toISOString())?.text ?? '') : '';
  });
  protected readonly elapsed = computed(() => {
    const run = this.run();
    if (!run) return '';
    return formatDuration(((this.finishedAt() ?? this.now()) - run.startedAt) / 1000);
  });

  /** Final but without a reported result: the page can't say whether it passed. */
  protected readonly resultUnknown = computed(() => {
    const status = this.status();
    return status !== null && status.final && !status.hasResult;
  });

  protected readonly chipClass = chipClass;

  constructor() {
    timer(0, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));
    this.destroyRef.onDestroy(() => this.monitoring?.unsubscribe());
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.monitoring?.unsubscribe();
      this.repo.set(params.get('repo') ?? '');
      this.branch.set(DEFAULT_BRANCH);
      this.startError.set(null);
      this.starting.set(false);
      this.metrics.set(null);
      this.lostContact.set(false);
      this.finishedAt.set(null);
      this.durationUnknown.set(false);
      const stored = loadStoredRun(this.owner, this.repo());
      this.run.set(stored);
      // Pick up where the last visit left off; a finished run is checked once and then left alone.
      if (stored) this.monitor(stored, true);
    });
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
        next: (runs) => {
          const info: IActionsInfo | undefined = runs[0];
          if (!info) {
            this.startError.set('The server started the workflow but did not report a run.');
            return;
          }
          const stored: StoredRun = { id: info.id, title: info.title, htmlUrl: info.run_html, branch: info.branch, startedAt: Date.now() };
          saveStoredRun(this.owner, this.repo(), stored);
          this.run.set(stored);
          this.metrics.set(null);
          this.lostContact.set(false);
          this.finishedAt.set(null);
          this.durationUnknown.set(false);
          this.monitor(stored, false);
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
  private monitor(run: StoredRun, reattached: boolean): void {
    this.monitoring?.unsubscribe();
    let failures = 0;
    let first = true;
    this.monitoring = timer(0, POLL_MS)
      .pipe(
        switchMap(() =>
          this.api.monitorProjectActions(this.owner, this.repo(), run.id).pipe(
            map((metrics) => ({ metrics })),
            catchError(() => of({ metrics: null })),
          ),
        ),
        tap(({ metrics }) => {
          if (metrics) {
            failures = 0;
            this.lostContact.set(false);
            this.metrics.set(metrics);
            const final = resolveStatus(metrics.status, metrics.conclusion).final;
            if (final) this.finishedAt.set(Date.now());
            // Seen finished on the very first look after a reload: the finish time we'd record is just "now".
            if (final && first && reattached) this.durationUnknown.set(true);
            first = false;
          } else if (++failures >= MAX_FAILED_POLLS) {
            this.lostContact.set(true);
          }
        }),
        takeWhile(({ metrics }) => (metrics ? !resolveStatus(metrics.status, metrics.conclusion).final : failures < MAX_FAILED_POLLS), true),
      )
      .subscribe();
  }

  protected retryWatching(): void {
    const run = this.run();
    if (run) {
      this.lostContact.set(false);
      this.monitor(run, true);
    }
  }
}
