import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { loadRuntimeConfig } from './app/core/mqtt/app-config';
import { APP_CONFIG_TOKEN } from './app/core/mqtt/app-config.token';

loadRuntimeConfig()
  .then((runtimeConfig) => bootstrapApplication(AppComponent, {
    ...appConfig,
    providers: [
      ...appConfig.providers,
      {provide: APP_CONFIG_TOKEN, useValue: runtimeConfig},
    ],
  }))
  .catch((err) => {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    document.body.textContent = message;
  });
