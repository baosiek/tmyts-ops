export interface ICronJobInfo {
    namespace: string;
    name: string;
    /** The cron schedule, e.g. "5 0 * * *" or "@daily". */
    scheduled: string;
}
