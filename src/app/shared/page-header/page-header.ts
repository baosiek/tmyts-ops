import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  template: `
    <header class="mb-6">
      <h1 class="m-0 text-2xl font-semibold tracking-tight">{{ title() }}</h1>
      @if (subtitle()) {
        <p class="m-0 mt-1 text-sm text-(--mat-sys-on-surface-variant)">{{ subtitle() }}</p>
      }
    </header>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}
