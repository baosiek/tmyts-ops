import { DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { catchError, EMPTY, switchMap, timer } from 'rxjs';
import { INodeInfo } from '../../../interfaces/i-node-info';
import { INodeUsage } from '../../../interfaces/i-node-usage';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { usageChartOption, usageRingOption, USAGE_WINDOW_MS, UsageSample } from '../../../shared/echart/charts';
import { Echart } from '../../../shared/echart/echart';
import { formatQuantity } from '../../../shared/format-quantity';
import { PageHeader } from '../../../shared/page-header/page-header';

const GIB = 2 ** 30;

@Component({
  imports: [PageHeader, DecimalPipe, MatCardModule, MatDividerModule, Echart],
  selector: 'app-nodes-dashboard',
  styleUrl: './nodes-dashboard.scss',
  templateUrl: './nodes-dashboard.html',
})
export class NodesDashboard implements OnInit {
  private readonly api = inject(K8sResourcesApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly nodes = signal<INodeInfo[]>([]);

  /** Recent usage samples per node name, oldest first, covering USAGE_WINDOW_MS. */
  private readonly history = signal<Record<string, UsageSample[]>>({});
  private readonly lastSampleAt = signal(Date.now());

  /** Each node with its latest usage against capacity, and chart options. */
  protected readonly cards = computed(() => {
    const history = this.history();
    const now = this.lastSampleAt();
    return this.nodes().map((n) => {
      const samples = history[n.name] ?? [];
      const latest = samples.at(-1);
      const rings = (['cpu', 'memory'] as const).map((key) => {
        const total = key === 'cpu' ? n.cpu : n.ram;
        const used = latest?.[key];
        const pct = used === undefined ? null : (used / total) * 100;
        // One unit for both figures keeps the caption short: "1.03 / 16 cores".
        const [scale, digits, unit] = key === 'cpu' ? [1, 2, 'cores'] : [GIB, 1, 'GiB'];
        const fmt = (v: number) => `${+(v / scale).toFixed(digits)}`;
        return {
          label: key === 'cpu' ? 'CPU' : 'Memory',
          detail: `${used === undefined ? '—' : fmt(used)} / ${fmt(total)} ${unit}`,
          option: usageRingOption(key, pct),
        };
      });
      return {
        ...n,
        ready: n.status === 'Ready',
        diskGiB: n.disk / GIB,
        rings,
        usageOption: usageChartOption(samples, now, formatQuantity, {
          cpu: `CPU  ${latest ? formatQuantity('cpu', latest.cpu) : '—'}`,
          memory: `Memory  ${latest ? formatQuantity('memory', latest.memory) : '—'}`,
        }),
      };
    });
  });

  ngOnInit(): void {
    this.api.getNodes().subscribe((nodes) => this.nodes.set(nodes));

    timer(0, 10_000)
      .pipe(
        switchMap(() => this.api.getNodeUsage().pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((usage) => this.recordSamples(usage));
  }

  /** Appends one sample per node and drops samples older than the window. */
  private recordSamples(usage: INodeUsage[]): void {
    const t = Date.now();
    const cutoff = t - USAGE_WINDOW_MS;
    const previous = this.history();
    const next: Record<string, UsageSample[]> = {};
    for (const u of usage) {
      next[u.name] = [...(previous[u.name] ?? []).filter((s) => s.t >= cutoff), { t, cpu: u.cpu, memory: u.ram }];
    }
    this.history.set(next);
    this.lastSampleAt.set(t);
  }
}
