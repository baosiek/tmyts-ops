import { Component, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  imports: [MatProgressSpinnerModule],
  selector: 'app-page-header',
  template: `
    <header class="mb-6">
      <div class="flex items-center gap-3">
        <h1 class="m-0 text-2xl font-semibold tracking-tight">{{ title() }}</h1>
        @if (loading()) {
          <mat-progress-spinner mode="indeterminate" diameter="20" strokeWidth="2.5" aria-label="Loading" />
        }
      </div>
      @if (subtitle()) {
        <p class="m-0 mt-1 text-sm text-(--mat-sys-on-surface-variant)">{{ subtitle() }}</p>
      }
    </header>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  /** Shows a spinner beside the title while the page's data is loading. */
  readonly loading = input(false);
}
