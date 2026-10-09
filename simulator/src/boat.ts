import { TOPICS } from './topics.js';

const LAT_MIN = 45.96;
const LAT_MAX = 46.01;
const LON_MIN = 9.22;
const LON_MAX = 9.29;

export type Boat = {
  lat: number;
  lon: number;
  yaw: number;
  roll: number;
  pitch: number;
  marks: { type: number; lat: number; lon: number }[];
  recording: boolean;
  bagName: string;
  heightWand: number;
  heightUs: number;
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function nudge(value: number, min: number, max: number, step: number) {
  return Math.min(max, Math.max(min, value + rand(-step, step)));
}

export function createBoat(): Boat {
  const lat = rand(LAT_MIN, LAT_MAX);
  const lon = rand(LON_MIN, LON_MAX);
  return {
    lat, lon,
    yaw: rand(0, 360),
    roll: rand(-8, 8),
    pitch: rand(-3, 3),
    marks: [
      { type: 0, lat: lat + 0.004, lon: lon - 0.003 },
      { type: 1, lat: lat + 0.002, lon: lon + 0.004 },
      { type: 2, lat: lat - 0.003, lon: lon + 0.001 },
    ],
    recording: false,
    bagName: '',
    heightWand: 0.22,
    heightUs: 0.22,
  };
}

export function step(b: Boat): void {
  b.lat = nudge(b.lat, LAT_MIN, LAT_MAX, 0.0003);
  b.lon = nudge(b.lon, LON_MIN, LON_MAX, 0.0003);
  b.yaw = (b.yaw + rand(-4, 4) + 360) % 360;
  b.roll = nudge(b.roll, -12, 12, 1.5);
  b.pitch = nudge(b.pitch, -5, 5, 0.6);
  b.heightWand = nudge(b.heightWand, 0.05, 0.45, 0.01);
  b.heightUs = nudge(b.heightUs, 0.05, 0.45, 0.01);
}

export function telemetry(b: Boat, now: number) {
  const stamp = {sec: Math.floor(now / 1000), nanosec: Math.floor((now % 1000) * 1e6)};
  return [
    {
      topic: TOPICS.dashboard,
      payload: {stamp, roll: b.roll, pitch: b.pitch, yaw: b.yaw},
    },
    {
      topic: TOPICS.map,
      payload: {stamp, lat: b.lat, lon: b.lon, yaw: b.yaw, marks: b.marks},
    },
    {
      topic: TOPICS.mechatronics,
      payload: {
        stamp,
        current_height_est_wand: b.heightWand,
        current_height_est_ultrasound: b.heightUs,
      },
    },
    {
      topic: TOPICS.indicators,
      payload: {indicators: [
        // The simplified UI displays height but has no sensor-selection control.
        {indicator: 'ACTIVE_SENSOR', value: 0, failed: false, can_increase: false, can_decrease: false},
      ]},
    },
    {
      topic: TOPICS.recording,
      payload: {recording: b.recording, ...(b.bagName ? {bag_name: b.bagName} : {})},
    },
  ];
}

export function startRec(b: Boat, now = Date.now()): void {
  b.recording = true;
  b.bagName = 'sim-bag-' + new Date(now).toISOString().replace(/[:.]/g, '-');
}

export function stopRec(b: Boat): void {
  b.recording = false;
}
