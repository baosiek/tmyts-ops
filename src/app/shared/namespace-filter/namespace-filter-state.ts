import { computed, signal } from '@angular/core';

const isSystemNamespace = (ns: string) => ns.startsWith('kube-');

/** Above this many namespaces the filter switches from chips to a dropdown. */
const MAX_NAMESPACE_CHIPS = 8;

/**
 * Namespace filter state shared by a dashboard and its <app-namespace-filter>.
 * The dashboard creates one, passing the namespaces of everything it lists, and
 * filters its items with `includes()`.
 */
export class NamespaceFilterState {
  /** Whether items in kube-* namespaces are shown. */
  readonly showSystem = signal(false);

  /** Namespaces the user picked, possibly including ones no longer present. */
  private readonly picked = signal<string[]>([]);

  constructor(private readonly allNamespaces: () => string[]) {}

  readonly hasSystemNamespaces = computed(() => this.allNamespaces().some(isSystemNamespace));

  /** Distinct namespaces available to filter on, sorted for display. */
  readonly namespaces = computed(() =>
    [...new Set(this.allNamespaces())].filter((ns) => this.showSystem() || !isSystemNamespace(ns)).sort(),
  );

  readonly useDropdown = computed(() => this.namespaces().length > MAX_NAMESPACE_CHIPS);

  /** The picked namespaces that still exist; empty means show all. */
  readonly selected = computed(() => this.picked().filter((ns) => this.namespaces().includes(ns)));

  setPicked(value: string[] | null): void {
    this.picked.set(value ?? []);
  }

  /** Whether an item in namespace `ns` passes the filter. Reads signals, so use it inside computed(). */
  includes(ns: string): boolean {
    if (!this.showSystem() && isSystemNamespace(ns)) return false;
    const selected = this.selected();
    return selected.length === 0 || selected.includes(ns);
  }
}
