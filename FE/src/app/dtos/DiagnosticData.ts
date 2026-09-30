import type { TimeStamp } from './common/TimeStamp';

/** View models. Units are explicit; null means unavailable. */
export type DiagnosticStatus = 'ok' | 'warning' | 'error' | 'unknown';

export interface RaspberryDiagnostic {
  device_id: string;
  temperature_c: number | null;
  cpu_usage_percent: number | null;
  memory_usage_percent: number | null;
  memory_used_bytes: number | null;
  memory_total_bytes: number | null;
  uptime_s: number | null;
}

export interface BatteryDiagnostic {
  id: string;
  name: string;
  level_percent: number | null;
  voltage_v: number | null;
  current_a: number | null;
  temperature_c: number | null;
  status: DiagnosticStatus;
}

export interface DiagnosticData {
  stamp: TimeStamp;
  raspberry: RaspberryDiagnostic;
}
