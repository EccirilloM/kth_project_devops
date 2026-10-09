import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthRoles } from '../../dtos/auth/auth-roles';
import { TelemetryService } from '../../core/services/telemetry.service';
import { MqttConnectionState } from '../../dtos/mqtt/Mqtt.connection.model';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  private readonly telemetry = inject(TelemetryService);
  readonly connection = toSignal(this.telemetry.mqttState$, {requireSync: true});
  readonly authRole = input.required<AuthRoles | null>();
  readonly logout = output<void>();
  readonly isAdmin = computed(() => this.authRole() === AuthRoles.Admin);
  readonly connected = computed(() => this.connection().status === MqttConnectionState.CONNECTED);
}
