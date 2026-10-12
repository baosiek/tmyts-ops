export interface IJobLog {
    /** Log lines, each "<RFC 3339 timestamp> <message>", oldest first. */
    lines: string[];
    /** True once the server has finished collecting; false while still collecting, or if it never found a pod. */
    done: boolean;
}
