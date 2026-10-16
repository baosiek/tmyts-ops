import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { catchError, EMPTY, finalize, merge, Subject, switchMap, timer } from 'rxjs';
import { actionsEnabled, APP_CONFIG, defaultNamespaces, refreshIntervalMs } from '../../../interfaces/i-app-config';
import { ICronJobInfo } from '../../../interfaces/i-cronjob-info';
import { IJobInfo } from '../../../interfaces/i-job-info';
import { IJobMetrics } from '../../../interfaces/i-job-metrics';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { describeApiError } from '../../../shared/api-error';
import { describeCron } from '../../../shared/cron-schedule';
import { formatAgo, formatDateTime, formatDuration, parseTimestamp } from '../../../shared/format-time';
import { NamespaceFilter } from '../../../shared/namespace-filter/namespace-filter';
import { NamespaceFilterState } from '../../../shared/namespace-filter/namespace-filter-state';
import { PageHeader } from '../../../shared/page-header/page-header';
import { chipClass, ringClass, StatusTone } from '../../../shared/status-ring';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/workload-actions/confirm-dialog';

/** A job's run, ready for display. */
interface JobRunView {
  /** Short state: Running, Complete, Failed, Terminating or Pending. */
  status: string;
  tone: StatusTone;
  started: string;
  /** Relative start, e.g. "2 hours ago"; empty if the job hasn't started. */
  startedAgo: string;
  finished: string;
  /** Elapsed time so far for a running job; "—" when unknown (e.g. failed jobs have no end time). */
  duration: string;
  /** The job's pod counts that aren't zero, e.g. ["2 failed", "1 active"]. */
  pods: string[];
  /** Milliseconds since the epoch, for ordering; 0 if unknown. */
  startedAt: number;
}

/**
 * The state of a job from its pod counts and timestamps. A job with a pod still
 * running is Running even if earlier attempts failed (it's retrying); otherwise a
 * succeeded pod means Complete and only failures mean Failed.
 */
function jobStatus(m: IJobMetrics): { status: string; tone: StatusTone } {
  if (m.active > 0) return { status: 'Running', tone: 'warning' };
  if (m.succeeded > 0 || m.completion_time) return { status: 'Complete', tone: 'good' };
  if (m.failed > 0) return { status: 'Failed', tone: 'critical' };
  if (m.terminating > 0) return { status: 'Terminating', tone: 'warning' };
  return { status: 'Pending', tone: 'neutral' };
}

function runOf(m: IJobMetrics, now: number): JobRunView {
  const { status, tone } = jobStatus(m);
  const start = formatDateTime(m.start_time);
  const end = formatDateTime(m.completion_time);
  const seconds = start && end ? (end.date.getTime() - start.date.getTime()) / 1000 : start && status === 'Running' ? (now - start.date.getTime()) / 1000 : null;
  const counts: [number, string][] = [
    [m.active, 'active'],
    [m.ready, 'ready'],
    [m.succeeded, 'succeeded'],
    [m.failed, 'failed'],
    [m.terminating, 'terminating'],
  ];
  return {
    status,
    tone,
    started: start?.text ?? '—',
    startedAgo: start ? formatAgo(start.date, now) : '',
    finished: end?.text ?? '—',
    duration: seconds === null ? '—' : formatDuration(seconds),
    pods: counts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`),
    startedAt: start?.date.getTime() ?? 0,
  };
}

/** Tags a CronJob card can carry; the filter chips select on them. */
type Tag = 'Failing' | 'Running' | 'OK' | 'Paused';
const TAG_ORDER: Tag[] = ['Failing', 'Running', 'OK', 'Paused'];

/** One job (a run) of a CronJob, as listed on its card. */
interface RunRow {
  key: string;
  name: string;
  namespace: string;
  run: JobRunView | null;
}

/** Newest first, with a run that's still going ahead of the rest. */
const byRecency = (a: RunRow, b: RunRow) =>
  Number(b.run?.status === 'Running') - Number(a.run?.status === 'Running') || (b.run?.startedAt ?? 0) - (a.run?.startedAt ?? 0);

@Component({
  imports: [PageHeader, MatButtonModule, MatCardModule, MatChipsModule, MatMenuModule, NamespaceFilter, RouterLink],
  selector: 'app-cronjobs-dashboard',
  styleUrl: './cronjobs-dashboard.scss',
  templateUrl: './cronjobs-dashboard.html',
})
export class CronJobsDashboard implements OnInit {
  private readonly api = inject(K8sResourcesApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly config = inject(APP_CONFIG);
  private readonly refreshMs = refreshIntervalMs(this.config);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly actionsOn = actionsEnabled(this.config);
  /** Fires to reload everything right away, e.g. after running a CronJob. */
  private readonly refresh$ = new Subject<void>();
  /** CronJobs (namespace/name) whose "Run now" request is in flight. */
  protected readonly sending = signal<ReadonlySet<string>>(new Set());

  /** True until the CronJob list has arrived (or failed). */
  protected readonly loading = signal(true);

  private readonly cronJobs = signal<ICronJobInfo[]>([]);
  private readonly jobs = signal<IJobInfo[]>([]);
  /** Latest metrics per job, keyed by namespace/name. */
  private readonly metrics = signal<Map<string, IJobMetrics>>(new Map());

  protected readonly nsFilter = new NamespaceFilterState(
    () => [...this.cronJobs().map((c) => c.namespace), ...this.jobs().map((j) => j.namespace)],
    defaultNamespaces(this.config),
  );

  /** Statuses to show; empty means all. */
  protected readonly tags = signal<Tag[]>([]);

  /** Every CronJob with its runs and state, before the status filter. */
  private readonly all = computed(() => {
    const metrics = this.metrics();
    const now = Date.now();

    const runsByCron = new Map<string, RunRow[]>();
    for (const job of this.jobs()) {
      if (!job.cron_job) continue;
      const key = `${job.namespace}/${job.cron_job}`;
      const jobKey = `${job.namespace}/${job.name}`;
      const m = metrics.get(jobKey);
      const rows = runsByCron.get(key) ?? [];
      rows.push({ key: jobKey, name: job.name, namespace: job.namespace, run: m ? runOf(m, now) : null });
      runsByCron.set(key, rows);
    }

    return this.cronJobs()
      .filter((cj) => this.nsFilter.includes(cj.namespace))
      .map((cj) => {
        const key = `${cj.namespace}/${cj.name}`;
        const runs = (runsByCron.get(key) ?? []).sort(byRecency);
        // The newest run by start time, whether or not another is still going.
        const newest = [...runs].sort((a, b) => (b.run?.startedAt ?? 0) - (a.run?.startedAt ?? 0))[0] ?? null;
        const running = cj.active > 0 || runs.some((r) => r.run?.status === 'Running');
        const failing = !running && newest?.run?.status === 'Failed';
        const ringStatus = running ? 'Running' : (newest?.run?.status ?? 'No runs');
        const ringTone: StatusTone = running ? 'warning' : (newest?.run?.tone ?? 'neutral');

        const next = cj.suspend ? null : parseTimestamp(cj.next_run);
        const lastSuccess = parseTimestamp(cj.last_successful_time);
        const tags: Tag[] = [];
        if (failing) tags.push('Failing');
        if (running) tags.push('Running');
        if (!failing && !running && newest?.run?.status === 'Complete') tags.push('OK');
        if (cj.suspend) tags.push('Paused');

        const scheduleText = describeCron(cj.schedule, cj.time_zone);
        return {
          cj,
          key,
          tags,
          rank: failing ? 0 : running ? 1 : cj.suspend ? 3 : 2,
          nextAt: next,
          running,
          failing,
          /** The latest run succeeded and nothing is running now. */
          ok: !failing && !running && newest?.run?.status === 'Complete',
          runs,
          latest: newest,
          ringStatus,
          ringTone,
          schedule: scheduleText,
          next: next === null ? null : { text: new Date(next).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }), relative: formatAgo(new Date(next), now) },
          lastSuccess: lastSuccess === null ? null : formatAgo(new Date(lastSuccess), now),
          starting: this.sending().has(key),
        };
      });
  });

  /** Counts per status among the visible CronJobs, for the filter chips. */
  protected readonly tagCounts = computed(() =>
    TAG_ORDER.map((tag) => ({ tag, count: this.all().filter((c) => c.tags.includes(tag)).length })).filter((t) => t.count > 0),
  );

  /** The CronJobs to show: failing first, then running, then by soonest next run, paused last. */
  protected readonly cards = computed(() => {
    const selected = this.tags();
    return this.all()
      .filter((c) => selected.length === 0 || selected.some((t) => c.tags.includes(t)))
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          (a.nextAt ?? Number.MAX_SAFE_INTEGER) - (b.nextAt ?? Number.MAX_SAFE_INTEGER) ||
          a.cj.namespace.localeCompare(b.cj.namespace) ||
          a.cj.name.localeCompare(b.cj.name),
      );
  });

  protected readonly filtered = computed(() => this.tags().length > 0);

  /** One line for the top of the page. */
  protected readonly summary = computed(() => {
    const all = this.all();
    const now = Date.now();
    const upcoming = all.filter((c) => c.nextAt !== null).sort((a, b) => a.nextAt! - b.nextAt!)[0];
    return {
      total: all.length,
      failing: all.filter((c) => c.failing).length,
      running: all.filter((c) => c.running).length,
      paused: all.filter((c) => c.cj.suspend).length,
      next: upcoming ? { name: upcoming.cj.name, relative: formatAgo(new Date(upcoming.nextAt!), now) } : null,
    };
  });

  /** Jobs that don't belong to any CronJob listed above (for example ones made by Helm). */
  protected readonly otherJobs = computed(() => {
    const metrics = this.metrics();
    const now = Date.now();
    const known = new Set(this.cronJobs().map((c) => `${c.namespace}/${c.name}`));
    return this.jobs()
      .filter((j) => this.nsFilter.includes(j.namespace) && !(j.cron_job && known.has(`${j.namespace}/${j.cron_job}`)))
      .map((j): RunRow => {
        const key = `${j.namespace}/${j.name}`;
        const m = metrics.get(key);
        return { key, name: j.name, namespace: j.namespace, run: m ? runOf(m, now) : null };
      })
      .sort(byRecency);
  });

  protected readonly chipClass = chipClass;
  protected readonly ringClass = ringClass;

  ngOnInit(): void {
    // Poll all three so runs, states and next-run times stay current without a reload.
    merge(timer(0, this.refreshMs), this.refresh$)
      .pipe(
        switchMap(() =>
          this.api.getCronJobs().pipe(
            finalize(() => this.loading.set(false)),
            catchError(() => EMPTY),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((cronJobs) => this.cronJobs.set(cronJobs));

    merge(timer(0, this.refreshMs), this.refresh$)
      .pipe(
        switchMap(() => this.api.getJobsInfo().pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((jobs) => this.jobs.set(jobs));

    merge(timer(0, this.refreshMs), this.refresh$)
      .pipe(
        switchMap(() => this.api.getJobMetrics().pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((metrics) => {
        const byKey = new Map<string, IJobMetrics>();
        for (const m of metrics) byKey.set(`${m.namespace}/${m.name}`, m);
        this.metrics.set(byKey);
      });
  }

  protected onTags(value: Tag[] | null): void {
    this.tags.set(value ?? []);
  }

  protected clearFilters(): void {
    this.tags.set([]);
  }

  /** Asks first, then creates a new Job from the CronJob's template, outside its schedule. */
  protected runNow(card: { key: string; cj: ICronJobInfo; running: boolean }): void {
    const { cj } = card;
    const data: ConfirmDialogData = {
      title: `Run ${cj.name} now?`,
      message: "This creates a new Job from the CronJob's template right away, outside its schedule. The schedule itself doesn't change.",
      warning: card.running
        ? 'A run of this CronJob is already in progress, and the new one would run alongside it.'
        : cj.concurrency_policy === 'Forbid'
          ? 'This CronJob forbids overlapping runs: while the new job runs, scheduled runs are skipped.'
          : undefined,
      confirmLabel: 'Run now',
    };
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data, width: '460px' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.setSending(card.key, true);
        this.api
          .executeCronJob(cj.namespace, cj.name)
          .pipe(finalize(() => this.setSending(card.key, false)))
          .subscribe({
            next: (started) => {
              this.snackBar
                .open(`Started ${started.name}.`, 'View logs', { duration: 10_000 })
                .onAction()
                .subscribe(() => void this.router.navigate(['/dashboards/cronjobs', started.namespace, started.name, 'logs']));
              this.refresh$.next();
            },
            error: (error) => this.snackBar.open(`Couldn't start ${cj.name}: ${describeApiError(error)}`, 'Dismiss', { duration: 12_000 }),
          });
      });
  }

  private setSending(key: string, on: boolean): void {
    this.sending.update((all) => {
      const next = new Set(all);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }
}
