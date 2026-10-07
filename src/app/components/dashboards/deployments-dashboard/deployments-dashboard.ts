import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { IDeploymentInfo } from '../../../interfaces/i-deployment-info';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { PageHeader } from '../../../shared/page-header/page-header';
import { catchError, EMPTY, switchMap, timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IDeploymentMetrics } from '../../../interfaces/i-deployment-metrics';
import { Echart } from '../../../shared/echart/echart';
import { replicaRingOption, USAGE_WINDOW_MS, usageChartOption, UsageSample } from '../../../shared/echart/charts';
import { formatQuantity } from '../../../shared/format-quantity';

/** Above this many namespaces the filter switches from chips to a dropdown. */
const MAX_NAMESPACE_CHIPS = 8;

const isSystemNamespace = (ns: string) => ns.startsWith('kube-');

/**
 * Heading for one usage panel: the latest value, plus the ceiling when every
 * container sets a limit (per-pod limits times the desired replica count, since
 * usage is summed across all pods).
 */
function usageHeading(label: string, key: 'cpu' | 'memory', d: IDeploymentInfo, latest: UsageSample | undefined) {
  if (!latest) return `${label}  —`;
  const limits = d.containers.map((c) => c.limits?.[key]);
  const hasLimit = d.replicas > 0 && limits.length > 0 && limits.every((l) => l !== undefined);
  const used = formatQuantity(key, latest[key]);
  if (!hasLimit) return `${label}  ${used}`;
  const total = limits.reduce((sum: number, l) => sum + l!, 0) * d.replicas;
  return `${label}  ${used} of ${formatQuantity(key, total)}`;
}

/** Key that ties metrics to a deployment; the server doesn't send namespaces yet. */
const metricsKey = (name: string, namespace?: string) => (namespace ? `${namespace}/${name}` : name);

function formatResources(r: Record<string, number> | null): string {
  if (!r || Object.keys(r).length === 0) return '—';
  return Object.entries(r)
    .map(([k, v]) => `${k}: ${formatQuantity(k, v)}`)
    .join(', ');
}

@Component({
  imports: [
    PageHeader,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
    Echart,
  ],
  selector: 'app-deployments-dashboard',
  styleUrl: './deployments-dashboard.scss',
  templateUrl: './deployments-dashboard.html',
})
export class DeploymentsDashboard implements OnInit {
  private readonly api = inject(K8sResourcesApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly deployments = signal<IDeploymentInfo[]>([]);
  /** Recent usage samples per deployment, oldest first, covering USAGE_WINDOW_MS. */
  private readonly history = signal<Record<string, UsageSample[]>>({});
  private readonly lastSampleAt = signal(Date.now());

  /** Whether deployments in kube-* namespaces are shown. */
  protected readonly showSystem = signal(false);

  protected readonly hasSystemNamespaces = computed(() =>
    this.deployments().some((d) => isSystemNamespace(d.namespace)),
  );

  /** Deployments left after applying the system-namespace toggle. */
  private readonly scopedDeployments = computed(() =>
    this.showSystem()
      ? this.deployments()
      : this.deployments().filter((d) => !isSystemNamespace(d.namespace)),
  );

  /** Distinct namespaces available to filter on, sorted for display. */
  protected readonly namespaces = computed(() =>
    [...new Set(this.scopedDeployments().map((d) => d.namespace))].sort(),
  );

  protected readonly useDropdown = computed(() => this.namespaces().length > MAX_NAMESPACE_CHIPS);

  /** Namespaces the user picked, possibly including ones no longer present. */
  private readonly pickedNamespaces = signal<string[]>([]);

  /** The picked namespaces that still exist; empty means show all. */
  protected readonly selectedNamespaces = computed(() =>
    this.pickedNamespaces().filter((ns) => this.namespaces().includes(ns)),
  );

  private readonly visibleDeployments = computed(() => {
    const selected = this.selectedNamespaces();
    return selected.length === 0
      ? this.scopedDeployments()
      : this.scopedDeployments().filter((d) => selected.includes(d.namespace));
  });

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
          requests: formatResources(c.requests),
          limits: formatResources(c.limits),
        })),
      };
    });
  });

  protected onNamespaceChange(value: string[] | null): void {
    this.pickedNamespaces.set(value ?? []);
  }

  ngOnInit(): void {
    this.api.getDeployments().subscribe((deployments) => this.deployments.set(deployments));

    timer(0, 10_000)
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
