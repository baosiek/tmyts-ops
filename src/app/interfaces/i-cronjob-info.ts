export interface ICronJobInfo {
    namespace: string;
    name: string;
    /** The cron expression, e.g. "30 20 * * 0-4". */
    schedule: string;
    /** The CronJob's `spec.timeZone` (e.g. "America/New_York"); null when it sets none (the controller's zone, UTC here). */
    time_zone: string | null;
    /** True while the CronJob is paused: no new jobs are created from its schedule. */
    suspend: boolean;
    /** Allow, Forbid or Replace. */
    concurrency_policy: string;
    /** When a job was last created from the schedule (RFC 3339). */
    last_schedule_time: string | null;
    /** When a job of this CronJob last finished successfully (RFC 3339). */
    last_successful_time: string | null;
    /** Jobs of this CronJob running right now. */
    active: number;
    /** The next scheduled run (RFC 3339, UTC); null if the schedule couldn't be read. Not adjusted for `suspend`. */
    next_run: string | null;
    /** How many finished jobs Kubernetes keeps. */
    successful_jobs_history_limit: number | null;
    failed_jobs_history_limit: number | null;
}
