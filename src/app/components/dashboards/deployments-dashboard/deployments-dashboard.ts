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
import { catchError, EMPTY, switchMap, timer, finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IDeploymentMetrics } from '../../../interfaces/i-deployment-metrics';
import { Echart } from '../../../shared/echart/echart';
import { replicaRingOption, USAGE_WINDOW_MS, usageChartOption, UsageSample } from '../../../shared/echart/charts';
import { formatQuantity, resourceLines } from '../../../shared/format-quantity';
import { usageHeading } from '../../../shared/usage-heading';

/** Key that ties metrics to a deployment; the server doesn't send namespaces yet. */
const metricsKey = (name: string, namespace?: string) => (namespace ? `${namespace}/${name}` : name);

@Component({
  imports: [
    PageHeader,
    MatCardModule,
    MatDividerModule,
    Echart,
    NamespaceFilter,
    MatButtonModule,
    RouterLink,
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
  /** Recent usage samples per deployment, oldest first, covering USAGE_WINDOW_MS. */
  private readonly history = signal<Record<string, UsageSample[]>>({});
  private readonly lastSampleAt = signal(Date.now());

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
    const now = this.lastSampleAt();
    return this.visibleDeployments().map((d) => {
      const samples = history[metricsKey(d.name, d.namespace)] ?? history[metricsKey(d.name)] ?? [];
      const latest = samples.at(-1);
      const healthy = d.replicas > 0 && d.available_replicas === d.replicas && d.ready_replicas === d.replicas;
      return {
        ...d,
        healthy,
        status: d.replicas === 0 ? 'Scaled down' : healthy ? 'Healthy' : 'Degraded',
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
    this.api
      .getDeployments()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((deployments) => this.deployments.set(deployments));

    timer(0, this.refreshMs)
      .pipe(
        switchMap(() => this.api.getDeploymentMetrics().pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((metrics) => this.recordSamples(metrics));
  }

  /** Appends one sample per deployment and drops samples older than the window. */
  private recordSamples(metrics: IDeploymentMetrics[]): void {
    const t = Date.now();
    const cutoff = t - USAGE_WINDOW_MS;
    const previous = this.history();
    const next: Record<string, UsageSample[]> = {};
    for (const m of metrics) {
      const key = metricsKey(m.metadata.name, m.metadata.namespace);
      const sum = (k: string) => m.containers.reduce((total, c) => total + (c.usage[k] ?? 0), 0);
      next[key] = [...(previous[key] ?? []).filter((s) => s.t >= cutoff), { t, cpu: sum('cpu'), memory: sum('memory') }];
    }
    this.history.set(next);
    this.lastSampleAt.set(t);
  }
}
