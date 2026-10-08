import { Component, input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { NamespaceFilterState } from './namespace-filter-state';

/** "Select namespaces" box: chips (dropdown when there are many) and a system-namespace toggle. */
@Component({
  imports: [MatChipsModule, MatFormFieldModule, MatSelectModule, MatSlideToggleModule],
  selector: 'app-namespace-filter',
  templateUrl: './namespace-filter.html',
})
export class NamespaceFilter {
  readonly state = input.required<NamespaceFilterState>();
}
