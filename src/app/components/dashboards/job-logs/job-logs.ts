import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, EMPTY, switchMap, takeWhile, tap, timer } from 'rxjs';
import { APP_CONFIG, refreshIntervalMs } from '../../../interfaces/i-app-config';
import { IJobLog } from '../../../interfaces/i-job-log';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { LogViewer } from '../../../shared/log-viewer/log-viewer';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  imports: [PageHeader, RouterLink, MatButtonModule, LogViewer],
  selector: 'app-job-logs',
  styleUrl: './job-logs.scss',
  templateUrl: './job-logs.html',
})
export class JobLogs implements OnInit {
  private readonly api = inject(K8sResourcesApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refreshMs = refreshIntervalMs(inject(APP_CONFIG));

  protected readonly namespace = signal('');
  protected readonly job = signal('');

  /** True until the first response (or failure) has arrived. */
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  private readonly log = signal<IJobLog | null>(null);

  protected readonly loaded = computed(() => this.log() !== null);
  protected readonly lines = computed(() => this.log()?.lines ?? []);

  protected readonly status = computed(() => {
    if (this.log()?.done) return 'Collection finished';
    return this.lines().length > 0 ? 'Still collecting' : 'Nothing collected';
  });

  protected readonly emptyMessage = computed(() =>
    this.log()?.done
      ? 'This job produced no output.'
      : "No logs were captured for this job. It may not have started yet, or its pod may have been deleted before the server collected anything.",
  );

  ngOnInit(): void {
    // Re-poll while the server is still collecting, so a running job's log grows on screen.
    this.route.paramMap
      .pipe(
        tap((params) => {
          this.namespace.set(params.get('namespace') ?? '');
          this.job.set(params.get('job') ?? '');
          this.log.set(null);
          this.loading.set(true);
        }),
        switchMap(() =>
          timer(0, this.refreshMs).pipe(
            switchMap(() =>
              this.api.getJobLogs(this.namespace(), this.job()).pipe(
                tap(() => this.failed.set(false)),
                catchError(() => {
                  this.failed.set(true);
                  this.loading.set(false);
                  return EMPTY;
                }),
              ),
            ),
            tap((log) => {
              this.log.set(log);
              this.loading.set(false);
            }),
            takeWhile((log) => !log.done, true),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }
}
