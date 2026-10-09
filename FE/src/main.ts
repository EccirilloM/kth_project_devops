import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { APP_CONFIG } from './app/core/mqtt/app-config';
import { loadRuntimeConfig } from './app/core/mqtt/runtime-config';



loadRuntimeConfig(document.baseURI)
  .then(config => {
    Object.assign(APP_CONFIG, config);
    return bootstrapApplication(AppComponent, appConfig);
  })
  .catch(() => {
    const root = document.querySelector('app-root');
    if (!root) return;
    const title = document.createElement('h1');
    title.textContent = 'Sailing monitor could not start';
    const explanation = document.createElement('p');
    explanation.textContent = 'Check the public configuration in assets/config.json, then reload the page.';
    root.setAttribute('role', 'alert');
    root.setAttribute('style', 'display:block;padding:2rem;color:white;background:#101722;min-height:100vh');
    root.replaceChildren(title, explanation);
  });
