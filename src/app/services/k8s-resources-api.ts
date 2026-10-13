import { inject, Service } from '@angular/core';
import { APP_CONFIG } from '../interfaces/i-app-config';
import { Observable } from 'rxjs';
import { INodeInfo } from '../interfaces/i-node-info';
import { HttpClient } from '@angular/common/http';
import { INodeUsage } from '../interfaces/i-node-usage';
import { IDeploymentInfo } from '../interfaces/i-deployment-info';
import { IDeploymentMetrics } from '../interfaces/i-deployment-metrics';
import { IPodMetrics } from '../interfaces/i-pod-metrics';
import { IJobInfo } from '../interfaces/i-job-info';
import { IJobLog } from '../interfaces/i-job-log';
import { IJobMetrics } from '../interfaces/i-job-metrics';
import { IPodInfo } from '../interfaces/i-pod-info';
import { IStatefulSetInfo } from '../interfaces/i-statefulset-info';

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

    getJobMetrics(): Observable<IJobMetrics[]> {
        let url: string = `${this.baseUrl}${this.endpoints['jobMetrics']}`;
        return this.http.get<IJobMetrics[]>(url);
    }

    getJobLogs(namespace: string, job: string): Observable<IJobLog> {
        let url: string = `${this.baseUrl}${this.endpoints['jobs']}/${encodeURIComponent(namespace)}/${encodeURIComponent(job)}/logs`;
        return this.http.get<IJobLog>(url);
    }

    /**
     * Live logs of every pod of a deployment: the last 200 lines of each pod, then new lines as
     * they arrive, each prefixed "[pod] ". The server sends "(no pods found)" when none are running.
     * Completes with a `closed` event when the stream ends or breaks; it doesn't reconnect by
     * itself, because a reconnect would replay the last 200 lines and duplicate them.
     */
    streamDeploymentLogs(namespace: string, name: string): Observable<LogStreamEvent> {
        const url = `${this.baseUrl}${this.endpoints['deployments']}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/logs`;
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
