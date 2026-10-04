import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { TelemetryService } from '../../core/services/telemetry.service';
import { AuthService } from '../../core/services/auth.service';
import { CommandService } from '../../core/services/command.service';
import { ClientCommandFactory } from '../../dtos/commands/ClientCommandFactory';
import { VisualizationComponent } from '../../components/visualization/visualization.component';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, VisualizationComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly telemetry = inject(TelemetryService);
  readonly auth = inject(AuthService);
  readonly commands = inject(CommandService);
  readonly dashboard = toSignal(this.telemetry.dashboardData$, {requireSync: true});
  readonly mechatronics = toSignal(this.telemetry.mechatronicsData$, {requireSync: true});
  readonly indicators = toSignal(this.telemetry.indicatorsState$, {requireSync: true});
  readonly measurements = [
    {key: 'roll', label: 'Roll', description: 'Side-to-side tilt'},
    {key: 'pitch', label: 'Pitch', description: 'Bow-to-stern tilt'},
    {key: 'yaw', label: 'Yaw', description: 'Heading'},
  ] as const;

  startRecording(): void {
    this.commands.sendCommand(ClientCommandFactory.startRecording());
  }

  stopRecording(): void {
    this.commands.sendCommand(ClientCommandFactory.stopRecording());
  }
}
