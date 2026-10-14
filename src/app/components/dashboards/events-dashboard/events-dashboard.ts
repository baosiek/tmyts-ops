import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { catchError, EMPTY, finalize, switchMap, timer } from 'rxjs';
import { APP_CONFIG, defaultNamespaces, refreshIntervalMs } from '../../../interfaces/i-app-config';
import { IEventInfo } from '../../../interfaces/i-event-info';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { formatAgo, formatDateTime } from '../../../shared/format-time';
import { NamespaceFilter } from '../../../shared/namespace-filter/namespace-filter';
import { NamespaceFilterState } from '../../../shared/namespace-filter/namespace-filter-state';
import { PageHeader } from '../../../shared/page-header/page-header';

/** Types in the order the filter lists them; anything else follows. */
const TYPE_ORDER = ['Warning', 'Normal'];

@Component({
  imports: [PageHeader, MatButtonModule, MatChipsModule, MatFormFieldModule, MatInputModule, NamespaceFilter],
  selector: 'app-events-dashboard',
  styleUrl: './events-dashboard.scss',
  templateUrl: './events-dashboard.html',
})
export class EventsDashboard implements OnInit {
  private readonly api = inject(K8sResourcesApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly config = inject(APP_CONFIG);
  private readonly refreshMs = refreshIntervalMs(this.config);

  /** True until the first response (or failure) has arrived. */
  protected readonly loading = signal(true);

  private readonly events = signal<IEventInfo[]>([]);

  protected readonly nsFilter = new NamespaceFilterState(
    () => this.events().map((e) => e.namespace),
    defaultNamespaces(this.config),
  );

  protected readonly search = signal('');
  /** Types to show; empty means all. */
  protected readonly types = signal<string[]>([]);

  /** Events in the selected namespaces; the search and type filters apply on top. */
  private readonly inNamespaces = computed(() => this.events().filter((e) => this.nsFilter.includes(e.namespace)));

  /** Counts per type among the events in the selected namespaces, Warning first. */
  protected readonly typeCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const e of this.inNamespaces()) if (e.type_) counts.set(e.type_, (counts.get(e.type_) ?? 0) + 1);
    const rank = (t: string) => (TYPE_ORDER.includes(t) ? TYPE_ORDER.indexOf(t) : TYPE_ORDER.length);
    return [...counts].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b)).map(([type, count]) => ({ type, count }));
  });

  protected readonly warningCount = computed(() => this.inNamespaces().filter((e) => e.type_ === 'Warning').length);
  protected readonly totalInNamespaces = computed(() => this.inNamespaces().length);

  /** The events to show, newest first, with display-ready times and the object split into kind and name. */
  protected readonly rows = computed(() => {
    const now = Date.now();
    const query = this.search().trim().toLowerCase();
    const types = this.types();
    return this.inNamespaces()
      .filter(
        (e) =>
          (types.length === 0 || types.includes(e.type_)) &&
          (!query || `${e.reason} ${e.object} ${e.message} ${e.namespace}`.toLowerCase().includes(query)),
      )
      .map((e) => {
        const when = formatDateTime(e.time);
        const slash = e.object.indexOf('/');
        return {
          ...e,
          warning: e.type_ === 'Warning',
          normal: e.type_ === 'Normal',
          at: when?.date.getTime() ?? 0,
          ago: when ? formatAgo(when.date, now) : '—',
          absolute: when?.text ?? '',
          kind: slash > 0 ? e.object.slice(0, slash) : '',
          name: slash > 0 ? e.object.slice(slash + 1) : e.object,
        };
      })
      .sort((a, b) => b.at - a.at);
  });

  protected readonly filtered = computed(() => this.search().trim() !== '' || this.types().length > 0);

  ngOnInit(): void {
    timer(0, this.refreshMs)
      .pipe(
        switchMap(() =>
          this.api.getEvents().pipe(
            finalize(() => this.loading.set(false)),
            catchError(() => EMPTY),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((events) => this.events.set(events));
  }

  protected onTypes(value: string[] | null): void {
    this.types.set(value ?? []);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.types.set([]);
  }
}
