const MIB = 2 ** 20;
const GIB = 2 ** 30;

/** Formats a resource quantity (cores for CPU, bytes for memory) for display. */
export function formatQuantity(key: string, value: number): string {
  if (key === 'cpu') {
    if (value < 1) {
      const milli = value * 1000;
      return `${milli < 10 ? +milli.toFixed(1) : Math.round(milli)}m`;
    }
    const cores = +value.toFixed(2);
    return `${cores} ${cores === 1 ? 'core' : 'cores'}`;
  }
  if (key === 'memory' || key.includes('storage')) {
    return value >= GIB ? `${+(value / GIB).toFixed(1)} GiB` : `${Math.round(value / MIB)} MiB`;
  }
  return `${value}`;
}
