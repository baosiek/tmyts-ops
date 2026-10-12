import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { finalize } from 'rxjs';
import { APP_CONFIG, defaultNamespaces } from '../../../interfaces/i-app-config';
import { IJobInfo } from '../../../interfaces/i-job-info';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { describeCron } from '../../../shared/cron-schedule';
import { NamespaceFilter } from '../../../shared/namespace-filter/namespace-filter';
import { NamespaceFilterState } from '../../../shared/namespace-filter/namespace-filter-state';
import { PageHeader } from '../../../shared/page-header/page-header';
import { ringClass, StatusTone } from '../../../shared/status-ring';

/** What the server sends as `scheduled` for a job whose CronJob has no schedule (or that has no CronJob). */
const NO_SCHEDULE = 'NO SCHEDULE';

/** A job's run, ready for display. */
export interface JobRunView {
  /** Short state, e.g. "Complete", "Failed" or "Running". */
  status: string;
  tone: StatusTone;
  /** Start time, already formatted. */
  started: string;
  /** Elapsed time, already formatted. */
  duration: string;
}

/**
 * The run state of a job, or null while none has arrived.
 * TODO: build this from the JobMetrics data once that service exists (match on job.uid).
 */
function runOf(_job: IJobInfo): JobRunView | null {
  return null;
}

@Component({
  imports: [PageHeader, MatCardModule, NamespaceFilter],
  selector: 'app-jobs-dashboard',
  styleUrl: './jobs-dashboard.scss',
  templateUrl: './jobs-dashboard.html',
})
export class JobsDashboard implements OnInit {
  private readonly api = inject(K8sResourcesApi);
  private readonly config = inject(APP_CONFIG);

  /** True until the jobs list has arrived (or failed). */
  protected readonly loading = signal(true);

  private readonly jobs = signal<IJobInfo[]>([]);

  protected readonly nsFilter = new NamespaceFilterState(
    () => this.jobs().map((j) => j.namespace),
    defaultNamespaces(this.config),
  );

  /** Visible jobs grouped by namespace and CronJob (manual jobs last), with schedules in plain English. */
  protected readonly cards = computed(() =>
    this.jobs()
      .filter((j) => this.nsFilter.includes(j.namespace))
      .sort(
        (a, b) =>
          a.namespace.localeCompare(b.namespace) ||
          Number(a.cron_job === null) - Number(b.cron_job === null) ||
          (a.cron_job ?? '').localeCompare(b.cron_job ?? '') ||
          a.name.localeCompare(b.name),
      )
      .map((j) => {
        const run = runOf(j);
        const hasSchedule = j.scheduled !== NO_SCHEDULE;
        return {
          ...j,
          key: j.uid ?? `${j.namespace}/${j.name}`,
          hasSchedule,
          schedule: hasSchedule ? describeCron(j.scheduled) : null,
          run,
          tone: run?.tone ?? ('neutral' as StatusTone),
        };
      }),
  );

  protected readonly ringClass = ringClass;

  ngOnInit(): void {
    this.api
      .getJobsInfo()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((jobs) => this.jobs.set(jobs));
  }
}
