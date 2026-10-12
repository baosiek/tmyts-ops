export interface IJobMetrics {
    namespace: string;
    name: string;
    /** The owning CronJob; empty for jobs not created by a CronJob. */
    cron_job: string;
    /** Pods of this job that are running (including ones still starting). */
    active: number;
    /** Start time (RFC 3339); null if the job hasn't started. */
    start_time: string | null;
    /** Completion time (RFC 3339); null while running and for failed jobs. */
    completion_time: string | null;
    /** Pods that are ready. */
    ready: number;
    /** Pods that failed, including earlier attempts that were retried. */
    failed: number;
    /** Pods that finished successfully. */
    succeeded: number;
    /** Pods being shut down. */
    terminating: number;
}
