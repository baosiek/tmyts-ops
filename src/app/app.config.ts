import { ApplicationConfig, inject, InjectionToken, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { APP_CONFIG } from './interfaces/i-app-config';
import { ConfigLoader } from './core/config-loader';
import { provideHttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideAppInitializer(
      async () => inject(ConfigLoader).load()
    ),
    {
      provide: APP_CONFIG, 
      useFactory: () => inject(ConfigLoader).get()
    },
  ]
};

