import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { finalize } from 'rxjs';
import { APP_CONFIG, defaultNamespaces } from '../../../interfaces/i-app-config';
import { ICronJobInfo } from '../../../interfaces/i-cron-job-info';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { describeCron } from '../../../shared/cron-schedule';
import { NamespaceFilter } from '../../../shared/namespace-filter/namespace-filter';
import { NamespaceFilterState } from '../../../shared/namespace-filter/namespace-filter-state';
import { PageHeader } from '../../../shared/page-header/page-header';
import { ringClass, StatusTone } from '../../../shared/status-ring';

/** The latest run of a CronJob, ready for display. */
export interface CronJobRunView {
  /** Short state, e.g. "Complete", "Failed" or "Running". */
  status: string;
  tone: StatusTone;
  /** Start time, already formatted. */
  started: string;
  /** Elapsed time, already formatted. */
  duration: string;
}

/**
 * The latest run of a CronJob, or null while none has arrived.
 * TODO: build this from the JobMetrics data once that service exists.
 */
function lastRun(_cronJob: ICronJobInfo): CronJobRunView | null {
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

  /** True until the CronJob list has arrived (or failed). */
  protected readonly loading = signal(true);

  private readonly cronJobs = signal<ICronJobInfo[]>([]);

  protected readonly nsFilter = new NamespaceFilterState(
    () => this.cronJobs().map((c) => c.namespace),
    defaultNamespaces(this.config),
  );

  /** Visible CronJobs, sorted by namespace then name, with their schedule in plain English. */
  protected readonly cards = computed(() =>
    this.cronJobs()
      .filter((c) => this.nsFilter.includes(c.namespace))
      .sort((a, b) => a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name))
      .map((c) => {
        const run = lastRun(c);
        return {
          ...c,
          schedule: describeCron(c.scheduled),
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
      .subscribe((cronJobs) => this.cronJobs.set(cronJobs));
  }
}
