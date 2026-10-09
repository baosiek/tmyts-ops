import { EChartOption } from './echart';

/** One usage sample (a node's, or a deployment's summed across its pods) at time `t`. */
export interface UsageSample {
  t: number;
  cpu: number;
  memory: number;
}

/** How much history the usage chart shows. */
export const USAGE_WINDOW_MS = 5 * 60_000;

// Light-mode chart colors (the app is light-only). Series colors are fixed per
// resource so CPU is always blue and memory always orange, on every card.
const CPU_COLOR = '#2a78d6';
const MEMORY_COLOR = '#eb6834';
const GOOD = '#0ca30c';
const CRITICAL = '#d03b3b';
const TEXT_PRIMARY = '#1b1b1f';
const TEXT_SECONDARY = '#52514e';
const GRID_LINE = 'rgba(0, 0, 0, 0.08)';
const RING_TRACK = 'rgba(0, 0, 0, 0.08)';

/** A progress ring filled to `pct` (0-100) with `label` in the middle. */
function ringOption(pct: number, label: string, color: string): EChartOption {
  return {
    animationDuration: 400,
    series: [
      {
        type: 'gauge',
        startAngle: 90,
        endAngle: -270,
        min: 0,
        max: 100,
        radius: '92%',
        pointer: { show: false },
        // Transparent at 0%, where a zero-length arc would still draw its rounded cap
        // as a dot. Not `show: false`: ECharts throws when an update later turns it on.
        progress: { show: true, roundCap: true, width: 8, itemStyle: { color, opacity: pct > 0 ? 1 : 0 } },
        axisLine: { lineStyle: { width: 8, color: [[1, RING_TRACK]] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        title: { show: false },
        detail: {
          offsetCenter: [0, 0],
          fontSize: 16,
          fontWeight: 500,
          color: TEXT_PRIMARY,
          formatter: () => label,
        },
        data: [{ value: pct }],
      },
    ],
  };
}

/** Ready replicas against desired: green when all are ready, red when not, grey at zero. */
export function replicaRingOption(ready: number, desired: number): EChartOption {
  const pct = desired === 0 ? 0 : Math.min(100, (ready / desired) * 100);
  const color = desired === 0 ? TEXT_SECONDARY : ready >= desired ? GOOD : CRITICAL;
  return ringOption(pct, `${ready}/${desired}`, color);
}

/** Usage above this share of capacity turns a usage ring red. */
export const HIGH_USAGE_PCT = 85;

/**
 * Share of capacity in use, in the resource's series color (red when above
 * HIGH_USAGE_PCT). `pct` is null until the first usage sample arrives.
 */
export function usageRingOption(key: 'cpu' | 'memory', pct: number | null): EChartOption {
  if (pct === null) return ringOption(0, '—', TEXT_SECONDARY);
  const color = pct > HIGH_USAGE_PCT ? CRITICAL : key === 'cpu' ? CPU_COLOR : MEMORY_COLOR;
  return ringOption(Math.min(100, pct), `${Math.round(pct)}%`, color);
}

const MIB = 2 ** 20;
const GIB = 2 ** 30;

/**
 * Formats axis ticks in a single unit picked from the largest plotted value, so an
 * axis never mixes units (e.g. "500m" next to "1 core", or "0 MiB" under "18 GiB").
 */
function axisFormatter(key: 'cpu' | 'memory', max: number): (v: number) => string {
  if (key === 'cpu') {
    return max >= 1 ? (v) => `${+v.toFixed(2)}` : (v) => `${+(v * 1000).toFixed(1)}m`;
  }
  return max >= GIB ? (v) => `${+(v / GIB).toFixed(1)} GiB` : (v) => `${Math.round(v / MIB)} MiB`;
}

/**
 * CPU and memory over the last few minutes as two stacked panels that share one
 * time axis and one hover crosshair. They are deliberately not drawn on two y-axes
 * of the same plot: the scales are unrelated, so where the lines cross would mean
 * nothing.
 */
export function usageChartOption(
  samples: UsageSample[],
  now: number,
  format: (key: 'cpu' | 'memory', value: number) => string,
  headings: { cpu: string; memory: string },
): EChartOption {
  const xAxis = (gridIndex: number, showLabels: boolean) => ({
    type: 'time',
    gridIndex,
    min: now - USAGE_WINDOW_MS,
    max: now,
    axisLine: { lineStyle: { color: GRID_LINE } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: {
      show: showLabels,
      color: TEXT_SECONDARY,
      fontSize: 11,
      hideOverlap: true,
      formatter: '{HH}:{mm}',
    },
  });
  const yAxis = (gridIndex: number, key: 'cpu' | 'memory') => ({
    type: 'value',
    gridIndex,
    min: 0,
    splitNumber: 2,
    axisLabel: {
      color: TEXT_SECONDARY,
      fontSize: 11,
      formatter: axisFormatter(key, Math.max(0, ...samples.map((s) => s[key]))),
    },
    splitLine: { lineStyle: { color: GRID_LINE } },
  });
  const line = (name: string, key: 'cpu' | 'memory', index: number, color: string) => ({
    name,
    type: 'line',
    xAxisIndex: index,
    yAxisIndex: index,
    showSymbol: false,
    symbolSize: 8,
    lineStyle: { width: 2, color },
    itemStyle: { color, borderColor: '#fff', borderWidth: 2 },
    areaStyle: { color, opacity: 0.08 },
    data: samples.map((s) => [s.t, s[key]]),
  });

  return {
    animation: false,
    textStyle: { fontFamily: 'Inter, sans-serif' },
    title: [
      { text: headings.cpu, left: 0, top: 0, padding: 0, textStyle: { fontSize: 13, fontWeight: 500, color: TEXT_PRIMARY } },
      { text: headings.memory, left: 0, top: '50%', padding: 0, textStyle: { fontSize: 13, fontWeight: 500, color: TEXT_PRIMARY } },
    ],
    grid: [
      { left: 0, right: 8, top: 26, height: '28%', containLabel: true },
      { left: 0, right: 8, top: '62%', bottom: 4, containLabel: true },
    ],
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: TEXT_SECONDARY, type: 'dashed' } },
      formatter: (params: { seriesName: string; value: [number, number]; marker: string }[]) => {
        if (!params.length) return '';
        const time = new Date(params[0].value[0]).toLocaleTimeString();
        const t = params[0].value[0];
        const at = samples.find((s) => s.t === t);
        if (!at) return time;
        return [
          `<div style="color:${TEXT_SECONDARY}">${time}</div>`,
          `<span style="color:${CPU_COLOR}">●</span> CPU <b>${format('cpu', at.cpu)}</b>`,
          `<span style="color:${MEMORY_COLOR}">●</span> Memory <b>${format('memory', at.memory)}</b>`,
        ].join('<br>');
      },
    },
    xAxis: [xAxis(0, false), xAxis(1, true)],
    yAxis: [yAxis(0, 'cpu'), yAxis(1, 'memory')],
    series: [line('CPU', 'cpu', 0, CPU_COLOR), line('Memory', 'memory', 1, MEMORY_COLOR)],
  };
}
