import { ICondition } from './i-deployment-info';

/** Subset of the Kubernetes ObjectMeta the server fills in. */
export interface IObjectMeta {
    name: string;
    namespace: string;
}

export interface IContainerMetrics {
    name: string;
    /** Usage in base units: cores for cpu, bytes for memory. */
    usage: Record<string, number>;
}

export interface IDeploymentMetrics {
    metadata: IObjectMeta;
    /** Live replica counts from the deployment's status. */
    available_replicas: number;
    ready_replicas: number;
    /** Pods that currently exist (the status count). The desired count is `replicas` in IDeploymentInfo. */
    replicas: number;
    updated_replicas: number;
    conditions: ICondition[];
    /** Live usage of the deployment's pods, summed. */
    containers: IContainerMetrics[];
}
