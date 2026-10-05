import type { Mark } from './mark/Mark';
import type { TimeStamp } from './common/TimeStamp';

export interface MapData {
  stamp: TimeStamp;
  lat: number;
  lon: number;
  yaw: number;
  marks: Mark[];
}
