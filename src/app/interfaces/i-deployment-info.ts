export interface ICondition {
    condition_type: string;
    condition_status: string;
    condition_reason: string;
    condition_message: string;
}

export interface IK8SContainer {
    container_type: string;
    image: string;
    limits: Record<string, number> | null;
    requests: Record<string, number> | null;
}

export interface IDeploymentInfo {
    name: string;
    namespace: string;
    available_replicas: number;
    ready_replicas: number;
    replicas: number;
    updated_replicas: number;
    conditions: ICondition[];
    containers: IK8SContainer[];
}
