export interface IPodContainer {
    name: string;
    image: string;
    working_dir: string;
}

export interface IPodVolume {
    name: string;
    image: string;
    pvc_name: string;
    pvc_read_only: boolean;
}

/** Resource requirements of one container, matched to it by name. */
export interface IPodResourceRequirement {
    container: string;
    claims: string[];
    /** Base units: cores for cpu, bytes for memory and storage. */
    limits: Record<string, number>;
    requests: Record<string, number>;
}

export interface IPodInfo {
    namespace: string;
    hostname: string;
    /** Empty until the pod is assigned an IP. */
    pod_ip: string;
    name: string;
    /** Null until the pod is scheduled onto a node. */
    node: string | null;
    containers: IPodContainer[];
    volumes: IPodVolume[];
    resources: IPodResourceRequirement[];
}
