import { InjectionToken } from '@angular/core';
import type { AppConfig } from './app-config';

/** Validated runtime config from `./config.json`, provided before bootstrap. */
export const APP_CONFIG_TOKEN = new InjectionToken<AppConfig>('APP_CONFIG');
