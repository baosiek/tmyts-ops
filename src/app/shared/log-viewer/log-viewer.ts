import { afterNextRender, afterRenderEffect, Component, computed, ElementRef, inject, Injector, input, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { LogLevel, parseLog, shortSource } from '../log-lines';

/** Longer lines are cut for display (one line can be 160 KB) until the user expands them. */
const MAX_LINE_CHARS = 2000;

const LEVEL_ORDER: LogLevel[] = ['CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG'];

/**
 * Log lines with search, level and pod filters, an error summary, and copy/download.
 * Lines are "<RFC 3339 timestamp> <message>", optionally prefixed with "[pod] " when
 * several pods are merged. Stays at the newest line while "Follow" is on.
 */
@Component({
  imports: [MatButtonModule, MatChipsModule, MatFormFieldModule, MatInputModule, MatSlideToggleModule],
  selector: 'app-log-viewer',
  templateUrl: './log-viewer.html',
})
export class LogViewer {
  private readonly injector = inject(Injector);

  readonly lines = input.required<string[]>();
  /** Shown under the line count, e.g. "Collection finished" or "Live". */
  readonly status = input('');
  /** Shown instead of the log when there are no lines. */
  readonly emptyMessage = input('There are no log lines.');
  /** Base name of the downloaded file. */
  readonly filename = input('logs');

  protected readonly search = signal('');
  /** Levels to show; empty means all. */
  protected readonly levels = signal<LogLevel[]>([]);
  /** Pods to show; empty means all. */
  protected readonly sources = signal<string[]>([]);
  protected readonly wrap = signal(false);
  /** Keep the view at the newest line while it grows. */
  protected readonly follow = signal(true);
  protected readonly copied = signal(false);
  /** The line the user last jumped to, outlined so it's easy to find. */
  protected readonly highlighted = signal<number | null>(null);
  private readonly expanded = signal<ReadonlySet<number>>(new Set());

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  private readonly parsed = computed(() => parseLog(this.lines()));

  protected readonly totalLines = computed(() => this.parsed().length);

  /** Line counts per level present in the log, most severe first. */
  protected readonly levelCounts = computed(() => {
    const counts = new Map<LogLevel, number>();
    for (const l of this.parsed()) if (l.level) counts.set(l.level, (counts.get(l.level) ?? 0) + 1);
    return LEVEL_ORDER.filter((lv) => counts.has(lv)).map((level) => ({ level, count: counts.get(level)! }));
  });

  /** Line counts per pod, when the log merges several. */
  protected readonly sourceCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const l of this.parsed()) if (l.source) counts.set(l.source, (counts.get(l.source) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([source, count]) => ({ source, count }));
  });
  protected readonly multiSource = computed(() => this.sourceCounts().length > 1);

  private readonly errorLines = computed(() => this.parsed().filter((l) => l.level === 'ERROR' || l.level === 'CRITICAL'));
  protected readonly errorCount = computed(() => this.errorLines().length);
  protected readonly warningCount = computed(() => this.parsed().filter((l) => l.level === 'WARNING').length);

  protected readonly visible = computed(() => {
    const levels = this.levels();
    const sources = this.sources();
    const query = this.search().trim().toLowerCase();
    return this.parsed().filter(
      (l) =>
        (levels.length === 0 || (l.level !== null && levels.includes(l.level))) &&
        (sources.length === 0 || (l.source !== null && sources.includes(l.source))) &&
        (!query || l.raw.toLowerCase().includes(query)),
    );
  });

  protected readonly filtered = computed(
    () => this.levels().length > 0 || this.sources().length > 0 || this.search().trim() !== '',
  );

  protected readonly shortSource = shortSource;

  constructor() {
    // After each render, stick to the newest line while following.
    afterRenderEffect(() => {
      this.visible();
      const el = this.scroller()?.nativeElement;
      if (el && this.follow()) el.scrollTop = el.scrollHeight;
    });
  }

  protected onLevels(value: LogLevel[] | null): void {
    this.levels.set(value ?? []);
  }

  protected onSources(value: string[] | null): void {
    this.sources.set(value ?? []);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.levels.set([]);
    this.sources.set([]);
  }

  /** Follows the log only while the view is at (or near) the bottom. */
  protected onScroll(el: HTMLElement): void {
    this.follow.set(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  }

  protected text(line: { index: number; message: string }): string {
    return line.message.length <= MAX_LINE_CHARS || this.expanded().has(line.index)
      ? line.message
      : line.message.slice(0, MAX_LINE_CHARS);
  }

  protected hiddenChars(line: { index: number; message: string }): number {
    return line.message.length > MAX_LINE_CHARS && !this.expanded().has(line.index)
      ? line.message.length - MAX_LINE_CHARS
      : 0;
  }

  protected expand(index: number): void {
    this.expanded.update((set) => new Set(set).add(index));
  }

  /** Scrolls to the first error, clearing any filter that would hide it. */
  protected jumpToFirstError(): void {
    const first = this.errorLines()[0];
    if (!first) return;
    if (!this.visible().some((l) => l.index === first.index)) this.clearFilters();
    this.follow.set(false);
    this.highlighted.set(first.index);
    // Scroll inside the log box only; scrollIntoView would also scroll the page behind it.
    afterNextRender(
      () => {
        const box = this.scroller()?.nativeElement;
        const row = box?.querySelector<HTMLElement>(`[data-line="${first.index}"]`);
        if (!box || !row) return;
        const offset = row.getBoundingClientRect().top - box.getBoundingClientRect().top;
        box.scrollTop += offset - box.clientHeight / 2 + row.offsetHeight / 2;
      },
      { injector: this.injector },
    );
  }

  protected jumpToEnd(): void {
    this.follow.set(true);
  }

  protected rowClass(level: LogLevel | null): string {
    switch (level) {
      case 'ERROR':
      case 'CRITICAL':
        return 'border-(--mat-sys-error) bg-(--mat-sys-error-container)/50';
      case 'WARNING':
        return 'border-amber-500 bg-amber-100/60';
      case 'DEBUG':
        return 'border-transparent text-(--mat-sys-on-surface-variant)';
      default:
        return 'border-transparent';
    }
  }

  protected async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.visible().map((l) => (l.source ? `[${l.source}] ` : '') + l.raw).join('\n'));
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  protected download(): void {
    const text = this.visible().map((l) => (l.source ? `[${l.source}] ` : '') + l.raw).join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.filename()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
