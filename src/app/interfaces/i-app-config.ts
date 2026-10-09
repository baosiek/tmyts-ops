import { InjectionToken } from "@angular/core";

export interface IAppConfig {
    apiUrl: string;
    endpoints: Record<string, string>;
    /** How often dashboards poll live data, in seconds. Defaults to 10. */
    refreshIntervalSeconds?: number;
    /** Namespaces pre-selected in the dashboards' namespace filter; none means all. */
    defaultNamespaces?: string[] | string;
}

/** Fallback when config.yaml has no (or an invalid) refreshIntervalSeconds. */
const DEFAULT_REFRESH_SECONDS = 10;

/** The namespaces the namespace filter starts with, from a YAML list or a single name. */
export function defaultNamespaces(config: IAppConfig): string[] {
    const value = config.defaultNamespaces;
    const list = Array.isArray(value) ? value : value ? [value] : [];
    return list.map(String).filter((ns) => ns.length > 0);
}

/** The dashboards' polling interval in milliseconds, never below one second. */
export function refreshIntervalMs(config: IAppConfig): number {
    const seconds = Number(config.refreshIntervalSeconds);
    return (Number.isFinite(seconds) && seconds > 0 ? Math.max(1, seconds) : DEFAULT_REFRESH_SECONDS) * 1000;
}

export const APP_CONFIG = new InjectionToken<IAppConfig>('app.config');