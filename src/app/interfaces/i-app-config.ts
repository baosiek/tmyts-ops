import { InjectionToken } from "@angular/core";

export interface IAppConfig {
    apiUrl: string;
    endpoints: Record<string, string>;
    /** How often dashboards poll live data, in seconds. Defaults to 10. */
    refreshIntervalSeconds?: number;
    /** Namespaces pre-selected in the dashboards' namespace filter; none means all. */
    defaultNamespaces?: string[] | string;
    /** Show the Scale and Restart buttons on the cards. Defaults to true; set false for a read-only dashboard. */
    actionsEnabled?: boolean;
    /** The GitHub account (owner) of the repositories the Projects section works with. */
    githubOwner?: string;
}

/** Fallback when config.yaml has no (or an invalid) refreshIntervalSeconds. */
const DEFAULT_REFRESH_SECONDS = 10;

/** The namespaces the namespace filter starts with, from a YAML list or a single name. */
export function defaultNamespaces(config: IAppConfig): string[] {
    const value = config.defaultNamespaces;
    const list = Array.isArray(value) ? value : value ? [value] : [];
    return list.map(String).filter((ns) => ns.length > 0);
}

/** Whether the cards offer Scale and Restart; on unless config.yaml says `actionsEnabled: false`. */
export function actionsEnabled(config: IAppConfig): boolean {
    return config.actionsEnabled !== false;
}

/** The GitHub owner from config.yaml; empty when it isn't set. */
export function githubOwner(config: IAppConfig): string {
    return String(config.githubOwner ?? '').trim();
}

/** The dashboards' polling interval in milliseconds, never below one second. */
export function refreshIntervalMs(config: IAppConfig): number {
    const seconds = Number(config.refreshIntervalSeconds);
    return (Number.isFinite(seconds) && seconds > 0 ? Math.max(1, seconds) : DEFAULT_REFRESH_SECONDS) * 1000;
}

export const APP_CONFIG = new InjectionToken<IAppConfig>('app.config');