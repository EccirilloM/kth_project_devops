import type { TimeStamp } from './common/TimeStamp';

export interface MechatronicsData {
  stamp: TimeStamp;
  current_height_est_wand: number;
  current_height_est_ultrasound: number;
}
