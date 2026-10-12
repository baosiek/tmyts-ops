import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { catchError, EMPTY, finalize, switchMap, timer } from 'rxjs';
import { APP_CONFIG, defaultNamespaces, refreshIntervalMs } from '../../../interfaces/i-app-config';
import { IJobInfo } from '../../../interfaces/i-job-info';
import { IJobMetrics } from '../../../interfaces/i-job-metrics';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { describeCron } from '../../../shared/cron-schedule';
import { formatAgo, formatDateTime, formatDuration } from '../../../shared/format-time';
import { NamespaceFilter } from '../../../shared/namespace-filter/namespace-filter';
import { NamespaceFilterState } from '../../../shared/namespace-filter/namespace-filter-state';
import { PageHeader } from '../../../shared/page-header/page-header';
import { ringClass, StatusTone } from '../../../shared/status-ring';

/** What the server sends as `scheduled` for a job whose CronJob has no schedule (or that has no CronJob). */
const NO_SCHEDULE = 'NO SCHEDULE';

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

@Component({
  imports: [PageHeader, MatCardModule, NamespaceFilter],
  selector: 'app-jobs-dashboard',
  styleUrl: './jobs-dashboard.scss',
  templateUrl: './jobs-dashboard.html',
})
export class JobsDashboard implements OnInit {
  private readonly api = inject(K8sResourcesApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly config = inject(APP_CONFIG);
  private readonly refreshMs = refreshIntervalMs(this.config);

  /** True until the jobs list has arrived (or failed). */
  protected readonly loading = signal(true);

  private readonly jobs = signal<IJobInfo[]>([]);

  /** Latest metrics per job, keyed by namespace/name. */
  private readonly metrics = signal<Map<string, IJobMetrics>>(new Map());

  protected readonly nsFilter = new NamespaceFilterState(
    () => this.jobs().map((j) => j.namespace),
    defaultNamespaces(this.config),
  );

  /** Visible jobs, running ones first, then newest first; jobs without metrics last. */
  protected readonly cards = computed(() => {
    const metrics = this.metrics();
    const now = Date.now();
    return this.jobs()
      .filter((j) => this.nsFilter.includes(j.namespace))
      .map((j) => {
        const key = `${j.namespace}/${j.name}`;
        const m = metrics.get(key);
        const run = m ? runOf(m, now) : null;
        const hasSchedule = j.scheduled !== NO_SCHEDULE;
        return {
          ...j,
          key,
          hasSchedule,
          schedule: hasSchedule ? describeCron(j.scheduled) : null,
          run,
          tone: run?.tone ?? ('neutral' as StatusTone),
        };
      })
      .sort(
        (a, b) =>
          Number(b.run?.status === 'Running') - Number(a.run?.status === 'Running') ||
          (b.run?.startedAt ?? 0) - (a.run?.startedAt ?? 0) ||
          a.namespace.localeCompare(b.namespace) ||
          a.name.localeCompare(b.name),
      );
  });

  protected readonly ringClass = ringClass;

  ngOnInit(): void {
    // Poll both so new jobs appear and a running job flips to Complete or Failed without a reload.
    timer(0, this.refreshMs)
      .pipe(
        switchMap(() =>
          this.api.getJobsInfo().pipe(
            finalize(() => this.loading.set(false)),
            catchError(() => EMPTY),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((jobs) => this.jobs.set(jobs));

    timer(0, this.refreshMs)
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
}
