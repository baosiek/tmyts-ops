import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { load as parseYaml } from 'js-yaml';
import { IAppConfig } from '../interfaces/i-app-config';


@Injectable({ providedIn: 'root' })
export class ConfigLoader {
  private http = inject(HttpClient);
  private config?: IAppConfig;

  async load(): Promise<void> {
    const text = await firstValueFrom(
      this.http.get('/config.yaml', { responseType: 'text' })
    );
    this.config = parseYaml(text) as IAppConfig;
  }

  get(): IAppConfig {
    if (!this.config) {
      throw new Error('ConfigLoader.get() called before load() resolved');
    }
    return this.config;
  }
}