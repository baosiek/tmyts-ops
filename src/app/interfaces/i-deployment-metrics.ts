/** Subset of the Kubernetes ObjectMeta the server currently fills in. */
export interface IObjectMeta {
    name: string;
    /** Not sent yet; used for matching once the server includes it. */
    namespace?: string;
}

export interface IContainerMetrics {
    name: string;
    /** Usage in base units: cores for cpu, bytes for memory. */
    usage: Record<string, number>;
}

export interface IDeploymentMetrics {
    metadata: IObjectMeta;
    containers: IContainerMetrics[];
}
