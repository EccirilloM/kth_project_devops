import type { MechatronicsData } from '../../dtos/MechatronicsData';
import type { IndicatorsState } from '../../dtos/indicator/Indicator.telemetry';
import { IndicatorType } from '../../dtos/indicator/IndicatorType';
import { ActiveSensor, activeSensorFromIndicatorValue } from '../../dtos/indicator/ActiveSensor';

/** Missing, expired or failed sensor selection must not look like a zero height. */
export function activeHeight(data: MechatronicsData | null, indicators: IndicatorsState | null): number | null {
  const selection = indicators?.[IndicatorType.ACTIVE_SENSOR];
  if (!data || !selection || selection.failed) return null;
  const sensor = activeSensorFromIndicatorValue(selection.value);
  if (sensor === ActiveSensor.WAND) return data.current_height_est_wand;
  if (sensor === ActiveSensor.ULTRASOUND) return data.current_height_est_ultrasound;
  return null;
}
