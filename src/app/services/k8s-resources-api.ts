import { inject, Service } from '@angular/core';
import { APP_CONFIG } from '../interfaces/i-app-config';
import { Observable } from 'rxjs';
import { INodeInfo } from '../interfaces/i-node-info';
import { HttpClient } from '@angular/common/http';
import { INodeUsage } from '../interfaces/i-node-usage';
import { IDeploymentInfo } from '../interfaces/i-deployment-info';
import { IDeploymentMetrics } from '../interfaces/i-deployment-metrics';
import { IPodInfo } from '../interfaces/i-pod-info';

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
}
