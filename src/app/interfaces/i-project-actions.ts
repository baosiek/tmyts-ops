/** Body of execute-project-actions: which workflow to start, and how. */
export interface IActionsRequest {
    /** The trigger; "workflow_dispatch" for a manual start. */
    event: string;
    /** The workflow file, e.g. "ci.yml". */
    workflow: string;
    branch: string;
}

/** The run that execute-project-actions started (the server answers with a one-element array). */
export interface IActionsInfo {
    owner: string;
    repo: string;
    title: string;
    workflow: string;
    branch: string;
    event: string;
    /** The GitHub run id; pass it to monitor-project-actions. */
    id: number;
    /** The run's page on github.com. */
    run_html: string;
}

export interface IJobStep {
    step_name: string;
    /** E.g. "Completed" or "InProgress" (the server prints GitHub's enum). */
    step_status: string;
    /** The result once the step has finished: "success", "failure", "skipped"…; empty until then. */
    step_conclusion?: string | null;
}

export interface IGhJob {
    job_name: string;
    job_status: string;
    /** The result once the job has finished; empty until then. */
    job_conclusion?: string | null;
    job_steps: IJobStep[];
}

/** A snapshot of a run. Poll monitor-project-actions until the run is final. */
export interface IActionsMetrics {
    owner: string;
    repo: string;
    id: number;
    /** GitHub's run status: "queued", "in_progress" or "completed". The result isn't part of it. */
    status: string;
    /** The result once the run has finished: "success", "failure", "cancelled"…; empty until then. */
    conclusion?: string | null;
    jobs: IGhJob[];
}
