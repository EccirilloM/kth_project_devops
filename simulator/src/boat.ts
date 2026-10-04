import { TOPICS } from './topics.js';

const LAT_MIN = 45.96;
const LAT_MAX = 46.01;
const LON_MIN = 9.22;
const LON_MAX = 9.29;

export type Boat = {
  t0: number;
  lat: number;
  lon: number;
  yaw: number;
  roll: number;
  pitch: number;
  sog: number; // knots
  vmg: number;
  twa: number;
  twd: number;
  tws: number;
  dtl: number;
  marks: { type: number; lat: number; lon: number }[];
  recording: boolean;
  bagName: string;
  kp: number;
  ki: number;
  kd: number;
  heightTarget: number;
  servoMax: number;
  servoMin: number;
  activeSensor: number;
  actuationMode: number;
  flap: number;
  servo: number;
  wand: number;
  heightWand: number;
  heightUs: number;
  ultrasound: number;
  temperature: number;
  cpu: number;
  memUsed: number;
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function nudge(value: number, min: number, max: number, step: number) {
  // small random step, then clip to [min, max]
  const next = value + rand(-step, step);
  return Math.min(max, Math.max(min, next));
}

export function createBoat(now = Date.now()): Boat {
  const lat = rand(LAT_MIN, LAT_MAX);
  const lon = rand(LON_MIN, LON_MAX);
  return {
    t0: now,
    lat,
    lon,
    yaw: rand(0, 360),
    roll: rand(-8, 8),
    pitch: rand(-3, 3),
    sog: rand(2, 7),
    vmg: rand(0, 5),
    twa: rand(-120, 120),
    twd: rand(0, 360),
    tws: rand(4, 12),
    dtl: rand(5, 40),
    marks: [
      { type: 0, lat: lat + 0.004, lon: lon - 0.003 },
      { type: 1, lat: lat + 0.002, lon: lon + 0.004 },
      { type: 2, lat: lat - 0.003, lon: lon + 0.001 },
    ],
    recording: false,
    bagName: '',
    kp: 1.2,
    ki: 0.15,
    kd: 0.4,
    heightTarget: 0.22,
    servoMax: 45,
    servoMin: -45,
    activeSensor: 0,
    actuationMode: 0,
    flap: 0,
    servo: 0,
    wand: 5,
    heightWand: 0.22,
    heightUs: 0.22,
    ultrasound: 0.2,
    temperature: 45,
    cpu: 20,
    memUsed: 1_200_000_000,
  };
}

export function step(b: Boat) {
  b.lat = nudge(b.lat, LAT_MIN, LAT_MAX, 0.0003);
  b.lon = nudge(b.lon, LON_MIN, LON_MAX, 0.0003);
  b.yaw = (nudge(b.yaw, 0, 360, 4) + 360) % 360;
  b.roll = nudge(b.roll, -12, 12, 1.5);
  b.pitch = nudge(b.pitch, -5, 5, 0.6);
  b.sog = nudge(b.sog, 0.5, 10, 0.3);
  b.tws = nudge(b.tws, 2, 18, 0.4);
  b.twd = (nudge(b.twd, 0, 360, 3) + 360) % 360;
  b.twa = nudge(b.twa, -150, 150, 4);
  b.vmg = nudge(b.vmg, -2, b.sog, 0.3);
  b.dtl = nudge(b.dtl, 0, 80, 1);

  b.heightWand = nudge(b.heightWand, 0.05, 0.45, 0.01);
  b.heightUs = nudge(b.heightUs, 0.05, 0.45, 0.01);
  b.ultrasound = nudge(b.ultrasound, 0.05, 0.5, 0.01);
  b.wand = nudge(b.wand, -20, 20, 1);
  // flap/servo wander near the commanded angles, still inside servo limits
  b.flap = nudge(b.flap, b.servoMin, b.servoMax, 2);
  b.servo = nudge(b.servo, b.servoMin, b.servoMax, 2);

  b.temperature = nudge(b.temperature, 35, 70, 0.5);
  b.cpu = nudge(b.cpu, 5, 85, 3);
  b.memUsed = Math.round(nudge(b.memUsed, 400_000_000, 3_500_000_000, 20_000_000));
}

function stamp(ms: number) {
  return { sec: Math.floor(ms / 1000), nanosec: Math.floor((ms % 1000) * 1e6) };
}

export function telemetry(b: Boat, now: number) {
  const st = stamp(now);
  const out: { topic: string; payload: unknown }[] = [];

  out.push({
    topic: TOPICS.dashboard,
    payload: {
      stamp: st,
      roll: b.roll, pitch: b.pitch, yaw: b.yaw,
      sog: b.sog, vmg: b.vmg, twa: b.twa, twd: b.twd, tws: b.tws,
    },
  });

  out.push({
    topic: TOPICS.map,
    payload: {
      stamp: st,
      lat: b.lat, lon: b.lon,
      yaw: b.yaw, twd: b.twd, tws: b.tws,
      ttl: -1, dtl: b.dtl,
      marks: b.marks,
    },
  });

  out.push({
    topic: TOPICS.mechatronics,
    payload: {
      stamp: st,
      servo_limit_max: b.servoMax,
      servo_limit_min: b.servoMin,
      kp: b.kp, ki: b.ki, kd: b.kd,
      current_height_est_wand: b.heightWand,
      current_height_est_ultrasound: b.heightUs,
      ultrasound_data: b.ultrasound,
      height_target: b.heightTarget,
      flap_angle_out: b.flap,
      servo_angle_out: b.servo,
      roll: b.roll, pitch: b.pitch,
      wand_angle: b.wand,
    },
  });

  out.push({
    topic: TOPICS.indicators,
    payload: {
      indicators: [
        knob('KP', b.kp, 0, 20),
        knob('KI', b.ki, 0, 10),
        knob('KD', b.kd, 0, 10),
        knob('HEIGHT_TARGET', b.heightTarget, 0.05, 0.45),
        knob('SERVO_LIMIT_MAX', b.servoMax, 0, 90),
        knob('SERVO_LIMIT_MIN', b.servoMin, -90, 0),
        { indicator: 'ACTIVE_SENSOR', value: b.activeSensor, failed: false, can_increase: false, can_decrease: false },
        { indicator: 'ACTUATION_MODE', value: b.actuationMode, failed: false, can_increase: false, can_decrease: false },
      ],
    },
  });

  const rec: Record<string, unknown> = { recording: b.recording };
  if (b.bagName) rec.bag_name = b.bagName;
  out.push({ topic: TOPICS.recording, payload: rec });

  out.push({
    topic: TOPICS.diagnostic,
    payload: {
      stamp: st,
      device_id: 'simulator-pi',
      temperature: b.temperature,
      temperature_valid: true,
      cpu_usage_percent: b.cpu,
      cpu_valid: true,
      memory_used_bytes: b.memUsed,
      memory_total_bytes: 4_294_967_296,
      memory_valid: true,
      uptime_seconds: Math.max(0, (now - b.t0) / 1000),
      uptime_valid: true,
    },
  });

  return out;
}

function knob(name: string, value: number, min: number, max: number) {
  return {
    indicator: name,
    value,
    failed: false,
    can_increase: value < max,
    can_decrease: value > min,
  };
}

export function setMark(b: Boat, type: number, lat: number, lon: number) {
  if (type !== 0 && type !== 1 && type !== 2) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
  const existing = b.marks.find((m) => m.type === type);
  if (existing) {
    existing.lat = lat;
    existing.lon = lon;
  } else {
    b.marks.push({ type, lat, lon });
  }
}

export function bumpIndicator(b: Boat, name: string, method: string) {
  if (name === 'ACTIVE_SENSOR') {
    if (method === 'CHANGE') b.activeSensor = b.activeSensor ? 0 : 1;
    return;
  }
  if (name === 'ACTUATION_MODE') {
    if (method === 'CHANGE') b.actuationMode = b.actuationMode ? 0 : 1;
    return;
  }

  const stepSize =
    name === 'KP' ? 0.1 :
    name === 'KI' || name === 'KD' ? 0.05 :
    name === 'HEIGHT_TARGET' ? 0.01 : 1;
  const delta = method === 'INCREASE' ? stepSize : method === 'DECREASE' ? -stepSize : 0;
  if (!delta) return;

  if (name === 'KP') b.kp = clamp(b.kp + delta, 0, 20);
  else if (name === 'KI') b.ki = clamp(b.ki + delta, 0, 10);
  else if (name === 'KD') b.kd = clamp(b.kd + delta, 0, 10);
  else if (name === 'HEIGHT_TARGET') b.heightTarget = clamp(b.heightTarget + delta, 0.05, 0.45);
  else if (name === 'SERVO_LIMIT_MAX') b.servoMax = clamp(b.servoMax + delta, 0, 90);
  else if (name === 'SERVO_LIMIT_MIN') b.servoMin = clamp(b.servoMin + delta, -90, 0);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function flapCmd(b: Boat, cmd: string) {
  if (cmd === 'FLAP_MAX') {
    b.flap = b.servoMax;
    b.servo = b.servoMax;
  } else if (cmd === 'FLAP_MIN') {
    b.flap = b.servoMin;
    b.servo = b.servoMin;
  }
}

export function startRec(b: Boat, now = Date.now()) {
  b.recording = true;
  b.bagName = 'sim-bag-' + new Date(now).toISOString().replace(/[:.]/g, '-');
}

export function stopRec(b: Boat) {
  b.recording = false;
}
