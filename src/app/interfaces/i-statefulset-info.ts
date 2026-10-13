import { IK8SContainer } from './i-deployment-info';

export interface IStatefulSetInfo {
    namespace: string;
    name: string;
    /** The headless Service that governs the pods' network identity; null if none is set. */
    service_name: string | null;
    /** Desired number of pods. */
    replicas: number;
    containers: IK8SContainer[];
}
