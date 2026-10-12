export interface IJobInfo {
    namespace: string;
    name: string;
    /** The CronJob that owns this job; null for jobs not created by a CronJob (e.g. by Helm). */
    cron_job: string | null;
    /** The owning CronJob's schedule, e.g. "5 0 * * *"; "NO SCHEDULE" for jobs without one. */
    scheduled: string;
}
