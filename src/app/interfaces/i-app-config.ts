import { InjectionToken } from "@angular/core";

export interface IAppConfig {
    apiUrl: string;
    endpoints: Record<string, string>;
}

export const APP_CONFIG = new InjectionToken<IAppConfig>('app.config');