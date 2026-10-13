import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { finalize } from 'rxjs';
import { APP_CONFIG, defaultNamespaces } from '../../../interfaces/i-app-config';
import { IStatefulSetInfo } from '../../../interfaces/i-statefulset-info';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { resourceLines } from '../../../shared/format-quantity';
import { NamespaceFilter } from '../../../shared/namespace-filter/namespace-filter';
import { NamespaceFilterState } from '../../../shared/namespace-filter/namespace-filter-state';
import { PageHeader } from '../../../shared/page-header/page-header';
import { ringClass } from '../../../shared/status-ring';

@Component({
  imports: [PageHeader, MatCardModule, MatDividerModule, NamespaceFilter],
  selector: 'app-statefulsets-dashboard',
  styleUrl: './statefulsets-dashboard.scss',
  templateUrl: './statefulsets-dashboard.html',
})
export class StatefulSetsDashboard implements OnInit {
  private readonly api = inject(K8sResourcesApi);
  private readonly config = inject(APP_CONFIG);

  /** True until the StatefulSet list has arrived (or failed). */
  protected readonly loading = signal(true);

  private readonly statefulSets = signal<IStatefulSetInfo[]>([]);

  protected readonly nsFilter = new NamespaceFilterState(
    () => this.statefulSets().map((s) => s.namespace),
    defaultNamespaces(this.config),
  );

  /** Visible StatefulSets sorted by namespace then name, with display-ready container resources. */
  protected readonly cards = computed(() =>
    this.statefulSets()
      .filter((s) => this.nsFilter.includes(s.namespace))
      .sort((a, b) => a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name))
      .map((s) => ({
        ...s,
        containerRows: s.containers.map((c) => ({
          name: c.container_type,
          image: c.image,
          requests: resourceLines(c.requests),
          limits: resourceLines(c.limits),
        })),
      })),
  );

  protected readonly ringClass = ringClass;

  ngOnInit(): void {
    this.api
      .getStatefulSetsInfo()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((statefulSets) => this.statefulSets.set(statefulSets));
  }
}
