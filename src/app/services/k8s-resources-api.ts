import { inject, Service } from '@angular/core';
import { APP_CONFIG } from '../interfaces/i-app-config';
import { Observable, timeout } from 'rxjs';
import { INodeInfo } from '../interfaces/i-node-info';
import { HttpClient } from '@angular/common/http';
import { INodeUsage } from '../interfaces/i-node-usage';
import { IDeploymentInfo } from '../interfaces/i-deployment-info';
import { IDeploymentMetrics } from '../interfaces/i-deployment-metrics';
import { IPodMetrics } from '../interfaces/i-pod-metrics';
import { IActionsInfo, IActionsMetrics, IActionsRequest } from '../interfaces/i-project-actions';
import { IEventInfo } from '../interfaces/i-event-info';
import { IJobInfo } from '../interfaces/i-job-info';
import { IJobLog } from '../interfaces/i-job-log';
import { IJobMetrics } from '../interfaces/i-job-metrics';
import { IPodInfo } from '../interfaces/i-pod-info';
import { IStatefulSetInfo } from '../interfaces/i-statefulset-info';
import { IStatefulSetMetrics } from '../interfaces/i-statefulset-metrics';
import { IScaleRequest, IWorkloadActionResponse, WorkloadType } from '../interfaces/i-workload-action';

@Service()
export class K8sResourcesApi {
    private config = inject(APP_CONFIG);
    private baseUrl: string = this.config.apiUrl;
    private endpoints: Record<string, string> = this.config.endpoints;

    private http = inject(HttpClient);

    getNodes(): Observable<INodeInfo[]> {
        let url: string = `${this.baseUrl}${this.endpoints['nodes']}`;
        return this.http.get<INodeInfo[]>(url);
    }

    getNodeUsage(): Observable<INodeUsage[]> {
        let url: string = `${this.baseUrl}${this.endpoints['nodeUsage']}`;
        return this.http.get<INodeUsage[]>(url);
    }

    getDeployments(): Observable<IDeploymentInfo[]> {
        let url: string = `${this.baseUrl}${this.endpoints['deployments']}`;
        return this.http.get<IDeploymentInfo[]>(url);
    }

    getDeploymentMetrics(): Observable<IDeploymentMetrics[]> {
        let url: string = `${this.baseUrl}${this.endpoints['deploymentMetrics']}`;
        return this.http.get<IDeploymentMetrics[]>(url);
    }

    getPodsInfo(): Observable<IPodInfo[]> {
        let url: string = `${this.baseUrl}${this.endpoints['pods']}`;
        return this.http.get<IPodInfo[]>(url);
    }

    getPodMetrics(): Observable<IPodMetrics[]> {
        let url: string = `${this.baseUrl}${this.endpoints['podMetrics']}`;
        return this.http.get<IPodMetrics[]>(url);
    }

    getJobsInfo(): Observable<IJobInfo[]> {
        let url: string = `${this.baseUrl}${this.endpoints['jobs']}`;
        return this.http.get<IJobInfo[]>(url);
    }

    getStatefulSetsInfo(): Observable<IStatefulSetInfo[]> {
        let url: string = `${this.baseUrl}${this.endpoints['statefulset']}`;
        return this.http.get<IStatefulSetInfo[]>(url);
    }

    getStatefulSetMetrics(): Observable<IStatefulSetMetrics[]> {
        let url: string = `${this.baseUrl}${this.endpoints['statefulsetMetrics']}`;
        return this.http.get<IStatefulSetMetrics[]>(url);
    }

    /** Sets the desired replica count. The server answers 202 right away; the pods follow. */
    scaleWorkload(namespace: string, name: string, type: WorkloadType, replicas: number): Observable<IWorkloadActionResponse> {
        const url = `${this.baseUrl}${this.endpoints['scale']}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${type}`;
        const body: IScaleRequest = { replicas };
        return this.http.post<IWorkloadActionResponse>(url, body);
    }

    /** Starts a rolling restart (like `kubectl rollout restart`). The server answers 202 right away. */
    restartWorkload(namespace: string, name: string, type: WorkloadType): Observable<IWorkloadActionResponse> {
        const url = `${this.baseUrl}${this.endpoints['restart']}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${type}`;
        return this.http.post<IWorkloadActionResponse>(url, null);
    }

    /** The latest cluster events (the server returns at most 50, newest first). */
    getEvents(): Observable<IEventInfo[]> {
        let url: string = `${this.baseUrl}${this.endpoints['events']}`;
        return this.http.get<IEventInfo[]>(url);
    }

    /** The repositories (folder names) that have a ci.yml workflow. */
    getProjects(): Observable<string[]> {
        let url: string = `${this.baseUrl}${this.endpoints['projects']}`;
        return this.http.get<string[]>(url);
    }

    /**
     * Starts a workflow on GitHub. The server waits for the run to appear, up to about 90 seconds
     * (then answers 504), so this allows a little longer before giving up on its own.
     */
    executeProjectActions(owner: string, repo: string, request: IActionsRequest): Observable<IActionsInfo[]> {
        const url = `${this.baseUrl}${this.endpoints['executeProjectActions']}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
        return this.http.post<IActionsInfo[]>(url, request).pipe(timeout(100_000));
    }

    /** One snapshot of a run; the caller polls until the run is final. */
    monitorProjectActions(owner: string, repo: string, runId: number): Observable<IActionsMetrics> {
        const url = `${this.baseUrl}${this.endpoints['monitorProjectActions']}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${runId}`;
        return this.http.get<IActionsMetrics>(url);
    }

    getJobMetrics(): Observable<IJobMetrics[]> {
        let url: string = `${this.baseUrl}${this.endpoints['jobMetrics']}`;
        return this.http.get<IJobMetrics[]>(url);
    }

    getJobLogs(namespace: string, job: string): Observable<IJobLog> {
        let url: string = `${this.baseUrl}${this.endpoints['jobs']}/${encodeURIComponent(namespace)}/${encodeURIComponent(job)}/logs`;
        return this.http.get<IJobLog>(url);
    }

    /**
     * Live logs of every pod of a deployment or statefulset: the last 200 lines of each pod, then new lines as
     * they arrive, each prefixed "[pod] ". The server sends "(no pods found)" when none are running.
     * Completes with a `closed` event when the stream ends or breaks; it doesn't reconnect by
     * itself, because a reconnect would replay the last 200 lines and duplicate them.
     */
    streamWorkloadLogs(type: WorkloadType, namespace: string, name: string): Observable<LogStreamEvent> {
        const endpoint = this.endpoints[type === 'Deployment' ? 'deployments' : 'statefulset'];
        const url = `${this.baseUrl}${endpoint}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/logs`;
        return new Observable<LogStreamEvent>((subscriber) => {
            const source = new EventSource(url);
            source.onopen = () => subscriber.next({ kind: 'open' });
            source.onmessage = (event) => subscriber.next({ kind: 'line', line: event.data });
            source.onerror = () => {
                source.close();
                subscriber.next({ kind: 'closed' });
                subscriber.complete();
            };
            return () => source.close();
        });
    }
}

/** What a live log stream reports. */
export type LogStreamEvent = { kind: 'open' } | { kind: 'line'; line: string } | { kind: 'closed' };
