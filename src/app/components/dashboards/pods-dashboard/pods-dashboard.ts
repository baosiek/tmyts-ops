import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { catchError, EMPTY, switchMap, timer, finalize } from 'rxjs';
import { IPodContainer, IPodInfo, IPodResourceRequirement, IPodVolume } from '../../../interfaces/i-pod-info';
import { IPodMetrics } from '../../../interfaces/i-pod-metrics';
import { APP_CONFIG, defaultNamespaces, refreshIntervalMs } from '../../../interfaces/i-app-config';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { NamespaceFilter } from '../../../shared/namespace-filter/namespace-filter';
import { NamespaceFilterState } from '../../../shared/namespace-filter/namespace-filter-state';
import { USAGE_WINDOW_MS, usageChartOption, UsageSample } from '../../../shared/echart/charts';
import { Echart } from '../../../shared/echart/echart';
import { formatQuantity } from '../../../shared/format-quantity';
import { PageHeader } from '../../../shared/page-header/page-header';

/** How a status reads at a glance; drives the dot and chip colors. */
export type StatusTone = 'good' | 'warning' | 'critical' | 'neutral';

/** A container's live status, ready for display. */
export interface ContainerStatusView {
  /** Short state, e.g. "Running", "Waiting", "Terminated". */
  label: string;
  tone: StatusTone;
  /** Secondary line, e.g. a reason or restart count. */
  detail?: string;
}

const TONE_RANK: Record<StatusTone, number> = { neutral: 0, good: 1, warning: 2, critical: 3 };

/** Pod-level status is the worst of the given statuses (pod readiness and its containers'). */
function podStatus(statuses: (ContainerStatusView | null)[]): ContainerStatusView | null {
  const known = statuses.filter((s): s is ContainerStatusView => s !== null);
  if (known.length === 0) return null;
  return known.reduce((worst, s) => (TONE_RANK[s.tone] > TONE_RANK[worst.tone] ? s : worst));
}

/** Readiness from a "ready/total" string, e.g. "1/1"; null if it can't be read. */
function readiness(ready: string): ContainerStatusView | null {
  const match = ready.match(/^(\d+)\/(\d+)$/);
  if (!match) return null;
  const [readyCount, total] = [Number(match[1]), Number(match[2])];
  return readyCount === total && total > 0
    ? { label: 'Ready', tone: 'good' }
    : { label: 'Not ready', tone: 'critical' };
}

/**
 * The pod's own status from its metrics entry: phase first, readiness for
 * running pods. Pods the metrics server doesn't report on get "No metrics".
 */
function podPhaseStatus(m: IPodMetrics | undefined): ContainerStatusView {
  if (!m) return { label: 'No metrics', tone: 'neutral' };
  switch (m.phase) {
    case 'Succeeded':
      return { label: 'Completed', tone: 'neutral' };
    case 'Pending':
      return { label: 'Pending', tone: 'warning' };
    case 'Failed':
      return { label: 'Failed', tone: 'critical' };
    case 'Running':
    case '':
      return readiness(m.ready) ?? { label: m.phase || 'Unknown', tone: 'neutral' };
    default:
      return { label: m.phase, tone: 'neutral' };
  }
}

/**
 * The live status of one container, or null while none has arrived.
 * TODO: map the live container status data here once the server sends it.
 */
function containerStatus(_pod: IPodInfo, _container: IPodContainer): ContainerStatusView | null {
  return null;
}

const RESOURCE_LABELS: Record<string, string> = { cpu: 'CPU', memory: 'Memory', 'ephemeral-storage': 'Storage' };

/** One display line per resource, e.g. ["CPU 10m", "Memory 128 MiB"]. */
function resourceLines(r: Record<string, number> | undefined): string[] {
  return Object.entries(r ?? {}).map(([k, v]) => `${RESOURCE_LABELS[k] ?? k} ${formatQuantity(k, v)}`);
}

const podKey = (namespace: string, name: string) => `${namespace}/${name}`;

/**
 * One container's live usage as display lines, e.g. ["CPU 1.2m · 24% of limit", "Memory 37 MiB"].
 * Empty until the first metrics sample arrives.
 */
function usageLines(usage: Record<string, number> | undefined, res: IPodResourceRequirement | undefined): string[] {
  if (!usage) return [];
  return (['cpu', 'memory'] as const)
    .filter((k) => usage[k] !== undefined)
    .map((k) => {
      const line = `${RESOURCE_LABELS[k]} ${formatQuantity(k, usage[k])}`;
      const limit = res?.limits[k];
      if (!limit) return line;
      const pct = (usage[k] / limit) * 100;
      return `${line} · ${pct > 0 && pct < 1 ? '<1' : Math.round(pct)}% of limit`;
    });
}

/**
 * Heading for one panel of the pod's usage chart: the latest value, plus the
 * pod's ceiling when every container sets a limit for that resource.
 */
function usageHeading(label: string, key: 'cpu' | 'memory', p: IPodInfo, latest: UsageSample | undefined): string {
  if (!latest) return `${label}  —`;
  const used = formatQuantity(key, latest[key]);
  const limits = p.containers.map((c) => p.resources.find((r) => r.container === c.name)?.limits[key]);
  if (limits.length === 0 || limits.some((l) => !l)) return `${label}  ${used}`;
  const total = limits.reduce((sum: number, l) => sum + l!, 0);
  return `${label}  ${used} of ${formatQuantity(key, total)}`;
}

function volumeKind(v: IPodVolume): string | null {
  if (v.pvc_name) return `PVC ${v.pvc_name}${v.pvc_read_only ? ' · read-only' : ''}`;
  if (v.image) return `Image ${v.image}`;
  if (v.name.startsWith('kube-api-access-')) return 'Service account token';
  return null;
}

@Component({
  imports: [PageHeader, MatCardModule, MatDividerModule, NamespaceFilter, Echart],
  selector: 'app-pods-dashboard',
  styleUrl: './pods-dashboard.scss',
  templateUrl: './pods-dashboard.html',
})
export class PodsDashboard implements OnInit {
  private readonly api = inject(K8sResourcesApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly config = inject(APP_CONFIG);
  private readonly refreshMs = refreshIntervalMs(this.config);

  /** True until the pods list has arrived (or failed). */
  protected readonly loading = signal(true);

  private readonly pods = signal<IPodInfo[]>([]);

  /** Recent pod-total usage samples per pod (namespace/name), oldest first, covering USAGE_WINDOW_MS. */
  private readonly history = signal<Record<string, UsageSample[]>>({});
  private readonly lastSampleAt = signal(Date.now());

  /** The latest metrics per pod (namespace/name), for per-container usage. */
  private readonly latestMetrics = signal<Record<string, IPodMetrics>>({});

  protected readonly nsFilter = new NamespaceFilterState(
    () => this.pods().map((p) => p.namespace),
    defaultNamespaces(this.config),
  );

  /** Visible pods, those needing attention first, then by namespace and name, with display-ready containers and volumes. */
  protected readonly cards = computed(() => {
    const history = this.history();
    const latestMetrics = this.latestMetrics();
    const now = this.lastSampleAt();
    return this.pods()
      .filter((p) => this.nsFilter.includes(p.namespace))
      .map((p) => {
        const key = podKey(p.namespace, p.name);
        const samples = history[key] ?? [];
        const latest = samples.at(-1);
        const metrics = latestMetrics[key];
        const containers = p.containers.map((c) => {
          const res = p.resources.find((r) => r.container === c.name);
          const usage = metrics?.containers.find((m) => m.name === c.name)?.usage;
          return {
            name: c.name,
            image: c.image,
            workingDir: c.working_dir,
            usage: usageLines(usage, res),
            requests: resourceLines(res?.requests),
            limits: resourceLines(res?.limits),
            claims: res?.claims ?? [],
            status: containerStatus(p, c),
          };
        });
        const status = podStatus([podPhaseStatus(metrics), ...containers.map((c) => c.status)]);
        return {
          ...p,
          status,
          /** Not ready or failed: outlined, sorted first and listed in the alert. */
          needsAttention: status?.tone === 'critical',
          ready: metrics?.ready || '—',
          restarts: metrics ? metrics.restart_count : null,
          containers,
          volumeRows: p.volumes.map((v) => ({ name: v.name, kind: volumeKind(v) })),
          usageOption: usageChartOption(samples, now, formatQuantity, {
            cpu: usageHeading('CPU', 'cpu', p, latest),
            memory: usageHeading('Memory', 'memory', p, latest),
          }),
        };
      })
      // Pods needing attention first, then by namespace and name.
      .sort(
        (a, b) =>
          Number(b.needsAttention) - Number(a.needsAttention) ||
          a.namespace.localeCompare(b.namespace) ||
          a.name.localeCompare(b.name),
      );
  });

  /** Visible pods that aren't ready or have failed, for the alert above the cards. */
  protected readonly attentionPods = computed(() => this.cards().filter((c) => c.needsAttention));

  /** Border color of the pod status ring; the same greens and reds as the replica rings. */
  protected ringClass(tone: StatusTone): string {
    switch (tone) {
      case 'good':
        return 'border-[#0ca30c]';
      case 'warning':
        return 'border-[#fab219]';
      case 'critical':
        return 'border-[#d03b3b]';
      default:
        return 'border-(--mat-sys-outline-variant)';
    }
  }

  /** Tailwind classes for a status chip of the given tone. */
  protected chipClass(tone: StatusTone): string {
    switch (tone) {
      case 'good':
        return 'bg-emerald-100 text-emerald-800';
      case 'warning':
        return 'bg-amber-100 text-amber-900';
      case 'critical':
        return 'bg-(--mat-sys-error-container) text-(--mat-sys-on-error-container)';
      default:
        return 'bg-(--mat-sys-surface-container) text-(--mat-sys-on-surface-variant)';
    }
  }

  ngOnInit(): void {
    this.api
      .getPodsInfo()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((pods) => this.pods.set(pods));

    timer(0, this.refreshMs)
      .pipe(
        switchMap(() => this.api.getPodMetrics().pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((metrics) => this.recordSamples(metrics));
  }

  /** Keeps the latest metrics per pod and appends a pod-total sample to its history. */
  private recordSamples(metrics: IPodMetrics[]): void {
    const t = Date.now();
    const cutoff = t - USAGE_WINDOW_MS;
    const previous = this.history();
    const next: Record<string, UsageSample[]> = {};
    const latest: Record<string, IPodMetrics> = {};
    for (const m of metrics) {
      const key = podKey(m.namespace, m.name);
      const sum = (k: string) => m.containers.reduce((total, c) => total + (c.usage[k] ?? 0), 0);
      next[key] = [...(previous[key] ?? []).filter((s) => s.t >= cutoff), { t, cpu: sum('cpu'), memory: sum('memory') }];
      latest[key] = m;
    }
    this.history.set(next);
    this.latestMetrics.set(latest);
    this.lastSampleAt.set(t);
  }
}
