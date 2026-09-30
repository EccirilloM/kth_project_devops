// Matches sail_msgs/msg/RaspberryDiagnostics (no schema_version or nested raspberry).
export const diagnosticSample = {
  stamp: {sec: 100, nanosec: 250000000}, device_id: 'raspberry-main',
  temperature: 48, temperature_valid: true,
  cpu_usage_percent: 0, cpu_valid: true,
  memory_used_bytes: 1073741824, memory_total_bytes: 4294967296, memory_valid: true,
  uptime_seconds: 7200.5, uptime_valid: true,
};
