import { IK8SContainer } from '../interfaces/i-deployment-info';
import { UsageSample } from './echart/charts';
import { formatQuantity } from './format-quantity';

/**
 * Heading for one panel of a workload's usage chart: the latest value, plus the ceiling when
 * every container sets a limit (per-pod limits times the desired replica count, since usage is
 * summed across all pods).
 */
export function usageHeading(
  label: string,
  key: 'cpu' | 'memory',
  workload: { replicas: number; containers: IK8SContainer[] },
  latest: UsageSample | undefined,
): string {
  if (!latest) return `${label}  —`;
  const limits = workload.containers.map((c) => c.limits?.[key]);
  const hasLimit = workload.replicas > 0 && limits.length > 0 && limits.every((l) => l !== undefined);
  const used = formatQuantity(key, latest[key]);
  if (!hasLimit) return `${label}  ${used}`;
  const total = limits.reduce((sum: number, l) => sum + l!, 0) * workload.replicas;
  return `${label}  ${used} of ${formatQuantity(key, total)}`;
}
