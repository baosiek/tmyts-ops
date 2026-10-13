import { IContainerMetrics } from './i-deployment-metrics';

/** One condition of a StatefulSet's status. */
export interface IStatefulSetStatus {
    /** When the condition last changed (RFC 3339); null if never reported. */
    last_transition_time: string | null;
    message: string | null;
    reason: string | null;
    /** "True", "False" or "Unknown". */
    status: string;
    /** The condition's kind. The server sends it as `type_`, with the trailing underscore. */
    type_: string;
}

export interface IStatefulSetMetrics {
    namespace: string;
    name: string;
    /** Pods that are ready and have been for the minimum ready time; null if the cluster reports none. */
    available_replicas: number | null;
    conditions: IStatefulSetStatus[];
    /** Pods created from the current revision; null if none reported. */
    current_replicas: number | null;
    ready_replicas: number | null;
    /** Desired number of pods. */
    replicas: number;
    /** The revision the pods are being updated to, e.g. "kafka-6d5cf96dd9"; null if none reported. */
    update_revision: string | null;
    /** Pods created from the update revision; null if none reported. */
    updated_replicas: number | null;
    /** Live usage per container, in base units: cores for cpu, bytes for memory. */
    containers: IContainerMetrics[];
    /** Live usage summed over all the StatefulSet's pods, in the same units. */
    statefulset_total_usage: Record<string, number>;
}
