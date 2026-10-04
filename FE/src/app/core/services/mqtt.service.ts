import { Injectable, OnDestroy, inject } from '@angular/core';
import mqtt from 'mqtt';
import { APP_CONFIG_TOKEN } from '../mqtt/app-config.token';
import { MqttSession } from '../mqtt/mqtt-session';

@Injectable({providedIn: 'root'})
export class MqttService extends MqttSession implements OnDestroy {
  constructor() {
    super((url, options) => mqtt.connect(url, options), inject(APP_CONFIG_TOKEN));
    window.addEventListener('pagehide', this.onPageHide);
  }
  private readonly onPageHide = () => this.logout();
  ngOnDestroy(): void {
    window.removeEventListener('pagehide', this.onPageHide);
    this.destroy();
  }
}
