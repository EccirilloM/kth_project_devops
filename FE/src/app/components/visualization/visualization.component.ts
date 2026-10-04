import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DashboardData } from '../../dtos/DashboardData';
import { MechatronicsData } from '../../dtos/MechatronicsData';
import { IndicatorsState } from '../../dtos/indicator/Indicator.telemetry';
import { activeHeight } from '../../core/mqtt/attitude';

@Component({
  selector: 'app-visualization',
  imports: [CommonModule],
  templateUrl: './visualization.component.html',
  styleUrl: './visualization.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisualizationComponent {
  readonly dashboard = input<DashboardData | null>(null);
  readonly mechatronics = input<MechatronicsData | null>(null);
  readonly indicators = input<IndicatorsState | null>(null);
  readonly height = computed(() => activeHeight(this.mechatronics(), this.indicators()));
  readonly views = computed(() => [
    {label: 'Front view', metric: 'Roll', angle: this.dashboard()?.roll ?? null, image: 'assets/svg/moth_front_view.svg'},
    {label: 'Side view', metric: 'Pitch', angle: this.dashboard()?.pitch ?? null, image: 'assets/svg/moth_side_view.svg'},
  ]);

  boatTransform(angle: number): string {
    // Preserve the original illustration scale; only the drawing is clamped.
    const height = Math.max(-1, Math.min(1, this.height() ?? 0));
    const rotation = Math.max(-90, Math.min(90, angle));
    return `translateY(${-height / 6.601 * 100}%) rotate(${rotation}deg)`;
  }
}
