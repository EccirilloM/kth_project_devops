import type { TimeStamp } from './common/TimeStamp';

export interface DashboardData {
  stamp: TimeStamp;
  roll: number;
  pitch: number;
  yaw: number;
}
