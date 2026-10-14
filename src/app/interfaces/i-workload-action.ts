/** The workload kinds the scale and restart endpoints accept; the server compares them exactly. */
export type WorkloadType = 'Deployment' | 'StatefulSet';

export interface IScaleRequest {
    replicas: number;
}

/** What the server answers when it accepts a scale or restart (202); the work finishes afterwards. */
export interface IWorkloadActionResponse {
    message: string;
}
