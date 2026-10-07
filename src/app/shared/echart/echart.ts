import { afterNextRender, Directive, effect, ElementRef, inject, input, OnDestroy } from '@angular/core';
import { GaugeChart, LineChart } from 'echarts/charts';
import { AxisPointerComponent, GridComponent, TitleComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

// Register only what the dashboards use, so the rest of ECharts is tree-shaken out.
echarts.use([LineChart, GaugeChart, GridComponent, TooltipComponent, AxisPointerComponent, TitleComponent, SVGRenderer]);

export type EChartOption = echarts.EChartsCoreOption;

/** Renders an ECharts chart into the host element and keeps it in sync with `options`. */
@Directive({ selector: '[appEchart]' })
export class Echart implements OnDestroy {
  readonly options = input.required<EChartOption>({ alias: 'appEchart' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private chart?: echarts.ECharts;
  private resizeObserver?: ResizeObserver;

  constructor() {
    afterNextRender(() => {
      this.chart = echarts.init(this.host.nativeElement, null, { renderer: 'svg' });
      this.chart.setOption(this.options());
      this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
      this.resizeObserver.observe(this.host.nativeElement);
    });

    effect(() => {
      const options = this.options();
      this.chart?.setOption(options);
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }
}
