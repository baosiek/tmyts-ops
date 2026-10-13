import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { catchError, EMPTY, finalize, switchMap, timer } from 'rxjs';
import { APP_CONFIG, defaultNamespaces, refreshIntervalMs } from '../../../interfaces/i-app-config';
import { IStatefulSetInfo } from '../../../interfaces/i-statefulset-info';
import { IStatefulSetMetrics } from '../../../interfaces/i-statefulset-metrics';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { USAGE_WINDOW_MS, usageChartOption, UsageSample } from '../../../shared/echart/charts';
import { Echart } from '../../../shared/echart/echart';
import { formatQuantity, resourceLines } from '../../../shared/format-quantity';
import { NamespaceFilter } from '../../../shared/namespace-filter/namespace-filter';
import { NamespaceFilterState } from '../../../shared/namespace-filter/namespace-filter-state';
import { PageHeader } from '../../../shared/page-header/page-header';
import { ringClass, StatusTone } from '../../../shared/status-ring';
import { usageHeading } from '../../../shared/usage-heading';

const key = (namespace: string, name: string) => `${namespace}/${name}`;

@Component({
  imports: [PageHeader, MatCardModule, MatDividerModule, Echart, NamespaceFilter],
  selector: 'app-statefulsets-dashboard',
  styleUrl: './statefulsets-dashboard.scss',
  templateUrl: './statefulsets-dashboard.html',
})
export class StatefulSetsDashboard implements OnInit {
  private readonly api = inject(K8sResourcesApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly config = inject(APP_CONFIG);
  private readonly refreshMs = refreshIntervalMs(this.config);

  /** True until the StatefulSet list has arrived (or failed). */
  protected readonly loading = signal(true);

  private readonly statefulSets = signal<IStatefulSetInfo[]>([]);

  /** The latest metrics per StatefulSet (namespace/name). */
  private readonly latestMetrics = signal<Record<string, IStatefulSetMetrics>>({});
  /** Recent total usage samples per StatefulSet, oldest first, covering USAGE_WINDOW_MS. */
  private readonly history = signal<Record<string, UsageSample[]>>({});
  private readonly lastSampleAt = signal(Date.now());

  protected readonly nsFilter = new NamespaceFilterState(
    () => this.statefulSets().map((s) => s.namespace),
    defaultNamespaces(this.config),
  );

  /** Visible StatefulSets sorted by namespace then name, with their live status and usage. */
  protected readonly cards = computed(() => {
    const latestMetrics = this.latestMetrics();
    const history = this.history();
    const now = this.lastSampleAt();
    return this.statefulSets()
      .filter((s) => this.nsFilter.includes(s.namespace))
      .sort((a, b) => a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name))
      .map((s) => {
        const id = key(s.namespace, s.name);
        const m = latestMetrics[id];
        const samples = history[id] ?? [];
        const latest = samples.at(-1);
        const replicas = m?.replicas ?? s.replicas;
        const ready = m ? (m.ready_replicas ?? 0) : null;
        const tone: StatusTone = ready === null || replicas === 0 ? 'neutral' : ready >= replicas ? 'good' : 'critical';
        return {
          ...s,
          replicas,
          tone,
          ringValue: ready === null ? `${replicas}` : `${ready}/${replicas}`,
          ringCaption: ready !== null ? 'ready' : replicas === 1 ? 'replica' : 'replicas',
          counts: m
            ? [
                { label: 'Ready', count: m.ready_replicas ?? 0 },
                { label: 'Available', count: m.available_replicas ?? 0 },
                { label: 'Updated', count: m.updated_replicas ?? 0 },
              ].map((c) => ({ ...c, behind: c.count < replicas }))
            : [],
          revision: m?.update_revision ?? null,
          conditions: m?.conditions ?? [],
          usageOption: usageChartOption(samples, now, formatQuantity, {
            cpu: usageHeading('CPU', 'cpu', { ...s, replicas }, latest),
            memory: usageHeading('Memory', 'memory', { ...s, replicas }, latest),
          }),
          containerRows: s.containers.map((c) => ({
            name: c.container_type,
            image: c.image,
            usage: resourceLines(m?.containers.find((u) => u.name === c.container_type)?.usage),
            requests: resourceLines(c.requests),
            limits: resourceLines(c.limits),
          })),
        };
      });
  });

  protected readonly ringClass = ringClass;

  ngOnInit(): void {
    this.api
      .getStatefulSetsInfo()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((statefulSets) => this.statefulSets.set(statefulSets));

    timer(0, this.refreshMs)
      .pipe(
        switchMap(() => this.api.getStatefulSetMetrics().pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((metrics) => this.recordSamples(metrics));
  }

  /** Keeps the latest metrics and appends a total-usage sample per StatefulSet, dropping old ones. */
  private recordSamples(metrics: IStatefulSetMetrics[]): void {
    const t = Date.now();
    const cutoff = t - USAGE_WINDOW_MS;
    const previous = this.history();
    const next: Record<string, UsageSample[]> = {};
    const latest: Record<string, IStatefulSetMetrics> = {};
    for (const m of metrics) {
      const id = key(m.namespace, m.name);
      const total = (k: string) => m.statefulset_total_usage[k] ?? m.containers.reduce((sum, c) => sum + (c.usage[k] ?? 0), 0);
      next[id] = [...(previous[id] ?? []).filter((s) => s.t >= cutoff), { t, cpu: total('cpu'), memory: total('memory') }];
      latest[id] = m;
    }
    this.history.set(next);
    this.latestMetrics.set(latest);
    this.lastSampleAt.set(t);
  }
}
