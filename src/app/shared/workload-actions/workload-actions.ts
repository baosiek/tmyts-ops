import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';
import { actionsEnabled, APP_CONFIG } from '../../interfaces/i-app-config';
import { WorkloadType } from '../../interfaces/i-workload-action';
import { K8sResourcesApi } from '../../services/k8s-resources-api';
import { describeApiError } from '../api-error';
import { ConfirmDialog, ConfirmDialogData } from './confirm-dialog';
import { ScaleDialog, ScaleDialogData } from './scale-dialog';

const SNACK_MS = 6_000;
const SNACK_ERROR_MS = 12_000;

/**
 * Scale and Restart buttons for a deployment or statefulset card. Each asks first, sends the
 * request and reports the outcome; the parent decides how to follow the work (see ActionProgress).
 * Renders nothing when `actionsEnabled: false` is set in config.yaml.
 */
@Component({
  imports: [MatButtonModule, MatProgressSpinnerModule],
  selector: 'app-workload-actions',
  templateUrl: './workload-actions.html',
})
export class WorkloadActions {
  private readonly api = inject(K8sResourcesApi);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly namespace = input.required<string>();
  readonly name = input.required<string>();
  readonly type = input.required<WorkloadType>();
  /** Desired replicas right now. */
  readonly replicas = input.required<number>();
  /** What the card says is under way, e.g. "Scaling to 3…"; buttons stay disabled meanwhile. */
  readonly progress = input<string | null>(null);

  /** Emitted with the new count once the server has accepted a scale request. */
  readonly scaled = output<number>();
  /** Emitted once the server has accepted a restart request. */
  readonly restarted = output<void>();

  protected readonly enabled = actionsEnabled(inject(APP_CONFIG));
  protected readonly sending = signal(false);
  protected readonly busy = computed(() => this.sending() || !!this.progress());
  protected readonly status = computed(() => (this.sending() ? 'Sending…' : this.progress()));

  protected scale(): void {
    const data: ScaleDialogData = {
      name: this.name(),
      namespace: this.namespace(),
      type: this.type(),
      current: this.replicas(),
    };
    this.dialog
      .open<ScaleDialog, ScaleDialogData, number>(ScaleDialog, { data, width: '420px' })
      .afterClosed()
      .subscribe((replicas) => {
        // Cancel closes the dialog with an empty string, not with nothing.
        if (typeof replicas !== 'number') return;
        this.send(this.api.scaleWorkload(this.namespace(), this.name(), this.type(), replicas), () => {
          this.snackBar.open(`Scaling ${this.name()} to ${replicas} ${replicas === 1 ? 'replica' : 'replicas'}.`, 'Dismiss', { duration: SNACK_MS });
          this.scaled.emit(replicas);
        });
      });
  }

  protected restart(): void {
    const single = this.replicas() === 1;
    const data: ConfirmDialogData = {
      title: `Restart ${this.name()}?`,
      message:
        this.type() === 'StatefulSet'
          ? 'Its pods are replaced one at a time, starting with the highest number.'
          : 'Its pods are replaced one at a time (a rolling restart).',
      warning:
        this.type() === 'StatefulSet' && single
          ? 'It has a single replica, so it will be unavailable while that pod restarts.'
          : undefined,
      confirmLabel: 'Restart',
    };
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data, width: '440px' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.send(this.api.restartWorkload(this.namespace(), this.name(), this.type()), () => {
          this.snackBar.open(`Restarting ${this.name()}.`, 'Dismiss', { duration: SNACK_MS });
          this.restarted.emit();
        });
      });
  }

  /** Runs a request, keeping the buttons disabled meanwhile, and reports success or the server's error. */
  private send(request: ReturnType<K8sResourcesApi['restartWorkload']>, onAccepted: () => void): void {
    this.sending.set(true);
    request.pipe(finalize(() => this.sending.set(false))).subscribe({
      next: onAccepted,
      error: (error) => this.snackBar.open(describeApiError(error), 'Dismiss', { duration: SNACK_ERROR_MS }),
    });
  }
}
