import type { DiagnosticData } from '../../dtos/DiagnosticData';
import { object } from './payloads';

function measure(value: unknown, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error('Misura diagnostica non valida');
  }
  return value;
}

function valid(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Indicatore di validità diagnostica non valido');
  return value;
}

function bytes(value: unknown): number {
  const result = measure(value, 0);
  if (!Number.isSafeInteger(result)) throw new Error('Memoria diagnostica non valida');
  return result;
}

/** Adapt the flat sail_msgs/msg/RaspberryDiagnostics JSON published by the ROS/MQTT gateway. */
export function diagnosticPayload(value: unknown): DiagnosticData {
  const data = object(value);
  const stamp = object(data['stamp']);
  const sec = measure(stamp['sec'], -2147483648, 2147483647);
  const nanosec = measure(stamp['nanosec'], 0, 999999999);
  if (!Number.isInteger(sec) || !Number.isInteger(nanosec)) {
    throw new Error('Timestamp diagnostico non valido');
  }
  const deviceId = data['device_id'];
  if (typeof deviceId !== 'string' || !deviceId.trim()) throw new Error('ID dispositivo non valido');

  // A false flag makes the measurement unavailable, regardless of its placeholder value.
  const temperature = valid(data['temperature_valid']) ? measure(data['temperature'], -273.15) : null;
  const cpu = valid(data['cpu_valid']) ? measure(data['cpu_usage_percent'], 0, 100) : null;
  const uptime = valid(data['uptime_valid']) ? measure(data['uptime_seconds'], 0) : null;
  let used: number | null = null;
  let total: number | null = null;
  if (valid(data['memory_valid'])) {
    used = bytes(data['memory_used_bytes']);
    total = bytes(data['memory_total_bytes']);
    if (total === 0 || used > total) throw new Error('Memoria diagnostica non valida');
  }

  return {
    stamp: {sec, nanosec},
    raspberry: {
      device_id: deviceId.trim(),
      temperature_c: temperature,
      cpu_usage_percent: cpu,
      memory_used_bytes: used,
      memory_total_bytes: total,
      memory_usage_percent: used !== null && total !== null ? used / total * 100 : null,
      uptime_s: uptime,
    },
  };
}
