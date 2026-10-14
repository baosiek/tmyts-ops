import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { bufferTime, filter, map, Subscription, tap } from 'rxjs';
import { WorkloadType } from '../../../interfaces/i-workload-action';
import { K8sResourcesApi } from '../../../services/k8s-resources-api';
import { LogViewer } from '../../../shared/log-viewer/log-viewer';
import { PageHeader } from '../../../shared/page-header/page-header';

/** What the server sends when a deployment has no running pods. */
const NO_PODS = '(no pods found)';

/** Lines kept on screen; when exceeded, the oldest are dropped in chunks so the view isn't reshuffled on every line. */
const MAX_LINES = 10_000;
const DROP_LINES = 2_000;

/** New lines are added in batches, so a burst (the server replays 200 lines per pod at the start) renders once. */
const BATCH_MS = 250;

type Connection = 'connecting' | 'live' | 'closed';

@Component({
  imports: [PageHeader, RouterLink, MatButtonModule, LogViewer],
  selector: 'app-workload-logs',
  templateUrl: './workload-logs.html',
})
export class WorkloadLogs implements OnInit {
  private readonly api = inject(K8sResourcesApi);
  private readonly route = inject(ActivatedRoute);
  private subscription?: Subscription;

  /** Which kind of workload, from the route's data: 'Deployment' or 'StatefulSet'. */
  protected readonly type: WorkloadType = this.route.snapshot.data['type'];
  /** For the page's wording and its back link. */
  protected readonly label = this.type === 'StatefulSet' ? 'StatefulSet' : 'Deployment';
  protected readonly listPath = this.type === 'StatefulSet' ? '/dashboards/statefulsets' : '/dashboards/deployments';

  protected readonly namespace = signal('');
  protected readonly name = signal('');
  protected readonly lines = signal<string[]>([]);
  protected readonly connection = signal<Connection>('connecting');
  /** Whether the stream ever connected; a stream that closes without connecting never got logs (e.g. the server answered an error). */
  protected readonly opened = signal(false);
  /** The server found no running pods for this deployment. */
  protected readonly noPods = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.namespace.set(params.get('namespace') ?? '');
      this.name.set(params.get('name') ?? '');
      this.connect();
    });
  }

  /** Starts a fresh stream; also the retry after a dropped connection. */
  protected connect(): void {
    this.subscription?.unsubscribe();
    this.lines.set([]);
    this.noPods.set(false);
    this.opened.set(false);
    this.connection.set('connecting');

    this.subscription = this.api
      .streamWorkloadLogs(this.type, this.namespace(), this.name())
      .pipe(
        tap((event) => {
          if (event.kind === 'open') {
            this.opened.set(true);
            this.connection.set('live');
          }
          else if (event.kind === 'closed') this.connection.set('closed');
          else if (event.line === NO_PODS) this.noPods.set(true);
        }),
        map((event) => (event.kind === 'line' && event.line !== NO_PODS ? event.line : null)),
        filter((line): line is string => line !== null),
        bufferTime(BATCH_MS),
        filter((batch) => batch.length > 0),
      )
      .subscribe((batch) => this.lines.update((previous) => this.append(previous, batch)));
  }

  private append(previous: string[], batch: string[]): string[] {
    let all = previous.concat(batch);
    // The server replays each pod's last lines one pod after another, so a batch can be older
    // than what's already shown; put the lines back in time order when that happens.
    const lastBefore = previous.length ? timeKey(previous[previous.length - 1]) : '';
    if (batch.some((line) => timeKey(line) < lastBefore) || (previous.length === 0 && batch.length > 1)) {
      all = sortByTime(all);
    }
    return all.length > MAX_LINES ? all.slice(all.length - (MAX_LINES - DROP_LINES)) : all;
  }
}

/** The ISO timestamp in a "[pod] <timestamp> message" line; ISO strings sort correctly as text. */
const TIME_PREFIX = /^(?:\[[^\]\s]+\] )?(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/;
const timeKey = (line: string): string => line.match(TIME_PREFIX)?.[1] ?? '';

/** Stable sort by timestamp; a line without one stays right after the line before it. */
function sortByTime(lines: string[]): string[] {
  let last = '';
  const keyed = lines.map((line, position) => {
    last = timeKey(line) || last;
    return { line, key: last, position };
  });
  return keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.position - b.position)).map((k) => k.line);
}
