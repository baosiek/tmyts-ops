import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { IPodContainer, IPodInfo, IPodVolume } from '../../../interfaces/i-pod-info';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { NamespaceFilter } from '../../../shared/namespace-filter/namespace-filter';
import { NamespaceFilterState } from '../../../shared/namespace-filter/namespace-filter-state';
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

/** Pod-level status is the worst of its containers' statuses. */
function podStatus(statuses: (ContainerStatusView | null)[]): ContainerStatusView | null {
  const known = statuses.filter((s): s is ContainerStatusView => s !== null);
  if (known.length === 0) return null;
  return known.reduce((worst, s) => (TONE_RANK[s.tone] > TONE_RANK[worst.tone] ? s : worst));
}

/**
 * The live status of one container, or null while none has arrived.
 * TODO: map the 10-second container status data here once the server sends it.
 */
function containerStatus(_pod: IPodInfo, _container: IPodContainer): ContainerStatusView | null {
  return null;
}

const RESOURCE_LABELS: Record<string, string> = { cpu: 'CPU', memory: 'Memory', 'ephemeral-storage': 'Storage' };

/** One display line per resource, e.g. ["CPU 10m", "Memory 128 MiB"]. */
function resourceLines(r: Record<string, number> | undefined): string[] {
  return Object.entries(r ?? {}).map(([k, v]) => `${RESOURCE_LABELS[k] ?? k} ${formatQuantity(k, v)}`);
}

function volumeKind(v: IPodVolume): string | null {
  if (v.pvc_name) return `PVC ${v.pvc_name}${v.pvc_read_only ? ' · read-only' : ''}`;
  if (v.image) return `Image ${v.image}`;
  if (v.name.startsWith('kube-api-access-')) return 'Service account token';
  return null;
}

@Component({
  imports: [PageHeader, MatCardModule, MatDividerModule, NamespaceFilter],
  selector: 'app-pods-dashboard',
  styleUrl: './pods-dashboard.scss',
  templateUrl: './pods-dashboard.html',
})
export class PodsDashboard implements OnInit {
  private readonly api = inject(K8sResourcesApi);

  private readonly pods = signal<IPodInfo[]>([]);

  protected readonly nsFilter = new NamespaceFilterState(() => this.pods().map((p) => p.namespace));

  /** Visible pods, sorted by namespace then name, with display-ready containers and volumes. */
  protected readonly cards = computed(() =>
    this.pods()
      .filter((p) => this.nsFilter.includes(p.namespace))
      .sort((a, b) => a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name))
      .map((p) => {
        const containers = p.containers.map((c) => {
          const res = p.resources.find((r) => r.container === c.name);
          return {
            name: c.name,
            image: c.image,
            workingDir: c.working_dir,
            requests: resourceLines(res?.requests),
            limits: resourceLines(res?.limits),
            claims: res?.claims ?? [],
            status: containerStatus(p, c),
          };
        });
        return {
          ...p,
          status: podStatus(containers.map((c) => c.status)),
          containers,
          volumeRows: p.volumes.map((v) => ({ name: v.name, kind: volumeKind(v) })),
        };
      }),
  );

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
    this.api.getPodsInfo().subscribe((pods) => this.pods.set(pods));
  }
}
