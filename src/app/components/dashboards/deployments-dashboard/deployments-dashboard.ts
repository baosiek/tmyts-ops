import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { MatDividerModule } from '@angular/material/divider';
import { IDeploymentInfo } from '../../../interfaces/i-deployment-info';
import { APP_CONFIG, defaultNamespaces, refreshIntervalMs } from '../../../interfaces/i-app-config';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { NamespaceFilter } from '../../../shared/namespace-filter/namespace-filter';
import { NamespaceFilterState } from '../../../shared/namespace-filter/namespace-filter-state';
import { PageHeader } from '../../../shared/page-header/page-header';
import { catchError, EMPTY, finalize, merge, Subject, switchMap, timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IDeploymentMetrics } from '../../../interfaces/i-deployment-metrics';
import { Echart } from '../../../shared/echart/echart';
import { replicaRingOption, USAGE_WINDOW_MS, usageChartOption, UsageSample } from '../../../shared/echart/charts';
import { formatQuantity, resourceLines } from '../../../shared/format-quantity';
import { usageHeading } from '../../../shared/usage-heading';
import { ActionProgress } from '../../../shared/workload-actions/action-progress';
import { WorkloadActions } from '../../../shared/workload-actions/workload-actions';

/** Key that ties metrics to a deployment. */
const metricsKey = (namespace: string, name: string) => `${namespace}/${name}`;

@Component({
  imports: [
    PageHeader,
    MatCardModule,
    MatDividerModule,
    Echart,
    NamespaceFilter,
    MatButtonModule,
    RouterLink,
    WorkloadActions,
  ],
  selector: 'app-deployments-dashboard',
  styleUrl: './deployments-dashboard.scss',
  templateUrl: './deployments-dashboard.html',
})
export class DeploymentsDashboard implements OnInit {
  private readonly api = inject(K8sResourcesApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly config = inject(APP_CONFIG);
  private readonly refreshMs = refreshIntervalMs(this.config);

  /** True until the deployments list has arrived (or failed). */
  protected readonly loading = signal(true);

  private readonly deployments = signal<IDeploymentInfo[]>([]);
  /** The latest metrics per deployment, with the live replica counts and conditions. */
  private readonly latestMetrics = signal<Record<string, IDeploymentMetrics>>({});
  /** Recent usage samples per deployment, oldest first, covering USAGE_WINDOW_MS. */
  private readonly history = signal<Record<string, UsageSample[]>>({});
  private readonly lastSampleAt = signal(Date.now());

  /** Scale and restart requests made from the cards, and whether they're still under way. */
  private readonly actions = new ActionProgress();
  /** Fires to poll right away, e.g. after a scale request, instead of waiting for the next tick. */
  private readonly refresh$ = new Subject<void>();

  protected readonly nsFilter = new NamespaceFilterState(
    () => this.deployments().map((d) => d.namespace),
    defaultNamespaces(this.config),
  );

  private readonly visibleDeployments = computed(() =>
    this.deployments().filter((d) => this.nsFilter.includes(d.namespace)),
  );

  /** Each deployment with its chart options and display-ready container resources. */
  protected readonly cards = computed(() => {
    const history = this.history();
    const latestMetrics = this.latestMetrics();
    const now = this.lastSampleAt();
    return this.visibleDeployments().map((info) => {
      const id = metricsKey(info.namespace, info.name);
      const samples = history[id] ?? [];
      const latest = samples.at(-1);
      const m = latestMetrics[id];
      // Live counts and conditions come with the metrics; the list (fetched once, then on each refresh)
      // fills in until a metrics entry arrives. Desired replicas always come from the list.
      const d: IDeploymentInfo = {
        ...info,
        ready_replicas: m?.ready_replicas ?? info.ready_replicas,
        available_replicas: m?.available_replicas ?? info.available_replicas,
        updated_replicas: m?.updated_replicas ?? info.updated_replicas,
        conditions: m?.conditions ?? info.conditions,
      };
      const healthy = d.replicas > 0 && d.available_replicas === d.replicas && d.ready_replicas === d.replicas;
      return {
        ...d,
        healthy,
        status: d.replicas === 0 ? 'Scaled down' : healthy ? 'Healthy' : 'Degraded',
        progress: this.actions.label(id, { desired: d.replicas, ready: d.ready_replicas, updated: d.updated_replicas }),
        replicaRows: [
          { label: 'Ready', count: d.ready_replicas },
          { label: 'Available', count: d.available_replicas },
          { label: 'Updated', count: d.updated_replicas },
        ],
        ringOption: replicaRingOption(d.ready_replicas, d.replicas),
        usageOption: usageChartOption(samples, now, formatQuantity, {
          cpu: usageHeading('CPU', 'cpu', d, latest),
          memory: usageHeading('Memory', 'memory', d, latest),
        }),
        containerRows: d.containers.map((c) => ({
          name: c.container_type,
          image: c.image,
          requests: resourceLines(c.requests),
          limits: resourceLines(c.limits),
        })),
      };
    });
  });

  ngOnInit(): void {
    // Poll the list too, so a scaled deployment (a new desired count) or a new one shows up without a reload.
    merge(timer(0, this.refreshMs), this.refresh$)
      .pipe(
        switchMap(() =>
          this.api.getDeployments().pipe(
            finalize(() => this.loading.set(false)),
            catchError(() => EMPTY),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((deployments) => this.deployments.set(deployments));

    merge(timer(0, this.refreshMs), this.refresh$)
      .pipe(
        switchMap(() => this.api.getDeploymentMetrics().pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((metrics) => this.recordSamples(metrics));
  }

  protected onScaled(deployment: { namespace: string; name: string }, replicas: number): void {
    this.actions.scaling(metricsKey(deployment.namespace, deployment.name), replicas);
    this.refresh$.next();
  }

  protected onRestarted(deployment: { namespace: string; name: string }): void {
    this.actions.restarting(metricsKey(deployment.namespace, deployment.name));
    this.refresh$.next();
  }

  /** Keeps the latest metrics per deployment and appends a usage sample, dropping old ones. */
  private recordSamples(metrics: IDeploymentMetrics[]): void {
    const t = Date.now();
    const cutoff = t - USAGE_WINDOW_MS;
    const previous = this.history();
    const next: Record<string, UsageSample[]> = {};
    const latest: Record<string, IDeploymentMetrics> = {};
    for (const m of metrics) {
      const key = metricsKey(m.metadata.namespace, m.metadata.name);
      latest[key] = m;
      const sum = (k: string) => m.containers.reduce((total, c) => total + (c.usage[k] ?? 0), 0);
      next[key] = [...(previous[key] ?? []).filter((s) => s.t >= cutoff), { t, cpu: sum('cpu'), memory: sum('memory') }];
    }
    this.history.set(next);
    this.latestMetrics.set(latest);
    this.lastSampleAt.set(t);
  }
}
