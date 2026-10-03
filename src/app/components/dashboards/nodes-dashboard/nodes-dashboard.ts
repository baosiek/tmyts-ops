import { DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { INodeInfo } from '../../../interfaces/i-node-info';
import { INodeUsage } from '../../../interfaces/i-node-usage';
import { PageHeader } from '../../../shared/page-header/page-header';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { EMPTY } from 'rxjs/internal/observable/empty';
import { catchError, switchMap, timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

const GIB = 2 ** 30;

@Component({
  imports: [PageHeader, DecimalPipe, MatCardModule, MatDividerModule, MatProgressBarModule],
  selector: 'app-nodes-dashboard',
  styleUrl: './nodes-dashboard.scss',
  templateUrl: './nodes-dashboard.html',
})
export class NodesDashboard implements OnInit {
  private readonly api = inject(K8sResourcesApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly nodes = signal<INodeInfo[]>([]);
  private readonly usage = signal<INodeUsage[]>([]);

  /** Each node joined with its usage (matched by name), in display units. */
  protected readonly cards = computed(() =>
    this.nodes().map((n) => {
      const u = this.usage().find((x) => x.name === n.name);
      const ramTotal = n.ram / GIB;
      return {
        ...n,
        ready: n.status === 'Ready',
        diskGiB: n.disk / GIB,
        meters: [
          { label: 'CPU', used: u?.cpu, total: n.cpu, unit: 'cores', digits: '1.0-2' },
          { label: 'Memory', used: u && u.ram / GIB, total: ramTotal, unit: 'GiB', digits: '1.0-1' },
        ].map((m) => ({
          ...m,
          pct: m.used === undefined ? null : Math.min(100, (m.used / m.total) * 100),
        })),
      };
    }),
  );

  ngOnInit(): void {
    this.api.getNodes().subscribe((nodes) => this.nodes.set(nodes));

  timer(0, 10_000)
    .pipe(
      switchMap(() => this.api.getNodeUsage().pipe(catchError(() => EMPTY))),
      takeUntilDestroyed(this.destroyRef),
    )
    .subscribe((usage) => this.usage.set(usage));
  }
}
