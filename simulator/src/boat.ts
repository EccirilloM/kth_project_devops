import { TOPICS } from './topics.js';

export type Boat = {
  t0: number;
  lat: number;
  lon: number;
  heading: number; // rad
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
};

const LAT0 = 45.986;
const LON0 = 9.257;

export function createBoat(now = Date.now()): Boat {
  return {
    t0: now,
    lat: LAT0,
    lon: LON0,
    heading: 0.35,
    marks: [
      { type: 0, lat: LAT0 + 0.004, lon: LON0 - 0.003 },
      { type: 1, lat: LAT0 + 0.002, lon: LON0 + 0.004 },
      { type: 2, lat: LAT0 - 0.003, lon: LON0 + 0.001 },
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
  };
}

function sin(t: number, period: number, amp: number, phase = 0) {
  return amp * Math.sin((2 * Math.PI * t) / period + phase);
}

function stamp(ms: number) {
  return { sec: Math.floor(ms / 1000), nanosec: Math.floor((ms % 1000) * 1e6) };
}

export function step(b: Boat, now: number, dt: number) {
  const t = (now - b.t0) / 1000;
  b.heading += sin(t, 40, 0.02) * dt;
  const sog = 2.2 + sin(t, 18, 0.4); // m/s-ish
  b.lat += (sog * Math.cos(b.heading) / 111320) * dt;
  b.lon += (sog * Math.sin(b.heading) / (111320 * Math.cos(b.lat * Math.PI / 180))) * dt;
  // keep it in a small box so the map doesn't wander off
  b.lat = Math.min(LAT0 + 0.02, Math.max(LAT0 - 0.02, b.lat));
  b.lon = Math.min(LON0 + 0.03, Math.max(LON0 - 0.03, b.lon));
}

export function telemetry(b: Boat, now: number) {
  const t = (now - b.t0) / 1000;
  const yaw = ((b.heading * 180) / Math.PI + 360) % 360;
  const twd = (yaw + 40 + sin(t, 25, 8) + 360) % 360;
  const tws = 6 + sin(t, 14, 1.5);
  const twa = ((twd - yaw + 540) % 360) - 180;
  const sog = 2.2 + sin(t, 18, 0.4);
  const roll = sin(t, 7, 8);
  const pitch = sin(t, 9, 3, 1);
  const st = stamp(now);

  const out: { topic: string; payload: unknown }[] = [];

  out.push({
    topic: TOPICS.dashboard,
    payload: {
      stamp: st,
      roll, pitch, yaw,
      sog, vmg: sog * Math.cos(twa * Math.PI / 180),
      twa, twd, tws,
    },
  });

  out.push({
    topic: TOPICS.map,
    payload: {
      stamp: st,
      lat: b.lat, lon: b.lon,
      yaw, twd, tws,
      ttl: -1,
      dtl: 12 + sin(t, 30, 3),
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
      current_height_est_wand: b.heightTarget + sin(t, 5, 0.02),
      current_height_est_ultrasound: b.heightTarget + sin(t, 6, 0.015, 0.7),
      ultrasound_data: 0.2 + sin(t, 4, 0.03),
      height_target: b.heightTarget,
      flap_angle_out: b.flap + sin(t, 8, 1.5),
      servo_angle_out: b.servo + sin(t, 8, 1.2, 0.4),
      roll, pitch,
      wand_angle: b.wand + sin(t, 5, 2),
    },
  });

  // FE wants these as a list with snake_case
  const indicators = [
    knob('KP', b.kp, 0, 20),
    knob('KI', b.ki, 0, 10),
    knob('KD', b.kd, 0, 10),
    knob('HEIGHT_TARGET', b.heightTarget, 0.05, 0.45),
    knob('SERVO_LIMIT_MAX', b.servoMax, 0, 90),
    knob('SERVO_LIMIT_MIN', b.servoMin, -90, 0),
    { indicator: 'ACTIVE_SENSOR', value: b.activeSensor, failed: false, can_increase: false, can_decrease: false },
    { indicator: 'ACTUATION_MODE', value: b.actuationMode, failed: false, can_increase: false, can_decrease: false },
  ];
  out.push({ topic: TOPICS.indicators, payload: { indicators } });

  const rec: Record<string, unknown> = { recording: b.recording };
  if (b.bagName) rec.bag_name = b.bagName;
  out.push({ topic: TOPICS.recording, payload: rec });

  const memTotal = 4294967296;
  out.push({
    topic: TOPICS.diagnostic,
    payload: {
      stamp: st,
      device_id: 'simulator-pi',
      temperature: 42 + sin(t, 90, 4),
      temperature_valid: true,
      cpu_usage_percent: Math.min(100, Math.max(0, 18 + sin(t, 20, 12))),
      cpu_valid: true,
      memory_used_bytes: Math.round(Math.min(memTotal - 1, Math.max(256e6, 1e9 + sin(t, 60, 8e7)))),
      memory_total_bytes: memTotal,
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

  const step =
    name === 'KP' ? 0.1 :
    name === 'KI' || name === 'KD' ? 0.05 :
    name === 'HEIGHT_TARGET' ? 0.01 : 1;
  const delta = method === 'INCREASE' ? step : method === 'DECREASE' ? -step : 0;
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
