export interface IPodContainerMetrics {
    name: string;
    /** Usage in base units: cores for cpu, bytes for memory. */
    usage: Record<string, number>;
}

export interface IPodMetrics {
    namespace: string;
    name: string;
    /** When the sample was taken (RFC 3339); empty if the server didn't get one. */
    timestamp: string;
    /** Duration the sample covers, e.g. "15.391s"; empty if unknown. */
    window: string;
    /** Ready containers / total containers, e.g. "1/1"; empty if unknown. */
    ready: string;
    /** Sum of restart counts over the pod's containers. */
    restart_count: number;
    /** Pod phase: Pending, Running, Succeeded, Failed or Unknown; empty if unknown. */
    phase: string;
    containers: IPodContainerMetrics[];
}
