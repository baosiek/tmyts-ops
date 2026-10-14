import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { WorkloadType } from '../../interfaces/i-workload-action';

export interface ScaleDialogData {
  name: string;
  namespace: string;
  type: WorkloadType;
  /** Desired replicas right now. */
  current: number;
}

/** A guard against a mistyped count, not a Kubernetes limit. */
export const MAX_REPLICAS = 100;

/** Asks for a new replica count; closes with the number, or with nothing if cancelled. */
@Component({
  selector: 'app-scale-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Scale {{ data.name }}</h2>
    <mat-dialog-content>
      <p class="m-0 mb-4 text-sm text-(--mat-sys-on-surface-variant)">
        <span class="font-mono">{{ data.namespace }}</span> · currently {{ data.current }}
        {{ data.current === 1 ? 'replica' : 'replicas' }}
      </p>
      <div class="flex items-start gap-2">
        <button mat-stroked-button type="button" class="mt-1" aria-label="One fewer replica" [disabled]="value() === null || value() === 0" (click)="step(-1)">−</button>
        <mat-form-field class="w-32" subscriptSizing="dynamic">
          <mat-label>Replicas</mat-label>
          <input
            matInput
            #field
            cdkFocusInitial
            inputmode="numeric"
            autocomplete="off"
            [value]="text()"
            (input)="text.set(field.value)"
            (keydown.enter)="submit()"
          />
        </mat-form-field>
        <button mat-stroked-button type="button" class="mt-1" aria-label="One more replica" [disabled]="value() === null || value()! >= max" (click)="step(1)">+</button>
      </div>
      @if (value() === null) {
        <p class="m-0 mt-3 text-sm text-(--mat-sys-error)" role="alert">Enter a whole number from 0 to {{ max }}.</p>
      } @else if (value() === 0) {
        <p class="m-0 mt-3 text-sm text-(--mat-sys-error)">Scaling to 0 stops every pod of this {{ data.type }}.</p>
      } @else if (data.type === 'StatefulSet' && value()! < data.current) {
        <p class="m-0 mt-3 text-sm text-(--mat-sys-on-surface-variant)">Pods are removed starting with the highest number.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancel</button>
      <button mat-flat-button type="button" [disabled]="!canSubmit()" [mat-dialog-close]="value()">
        {{ value() === null ? 'Scale' : 'Scale to ' + value() }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ScaleDialog {
  protected readonly data = inject<ScaleDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ScaleDialog, number>>(MatDialogRef);
  protected readonly max = MAX_REPLICAS;

  protected readonly text = signal(String(this.data.current));

  /** The typed count, or null when it isn't a whole number in range. */
  protected readonly value = computed(() => {
    const typed = this.text().trim();
    if (!/^\d+$/.test(typed)) return null;
    const n = Number(typed);
    return n <= MAX_REPLICAS ? n : null;
  });

  protected readonly canSubmit = computed(() => this.value() !== null && this.value() !== this.data.current);

  protected step(delta: number): void {
    const next = (this.value() ?? this.data.current) + delta;
    this.text.set(String(Math.min(MAX_REPLICAS, Math.max(0, next))));
  }

  /** Enter in the field confirms, when the button would. */
  protected submit(): void {
    const value = this.value();
    if (this.canSubmit() && value !== null) this.ref.close(value);
  }
}
