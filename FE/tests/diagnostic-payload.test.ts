import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticPayload } from '../src/app/core/mqtt/diagnostic-payload';
import { diagnosticSample as sample } from './diagnostic-sample';

test('flat RaspberryDiagnostics maps ROS fields and computes RAM percentage from bytes', () => {
  assert.deepEqual(diagnosticPayload(sample), {
    stamp: {sec: 100, nanosec: 250000000},
    raspberry: {
      device_id: 'raspberry-main', temperature_c: 48, cpu_usage_percent: 0,
      memory_used_bytes: 1073741824, memory_total_bytes: 4294967296,
      memory_usage_percent: 25, uptime_s: 7200.5,
    },
  });
});

test('valid zero measurements remain zero; invalid flags hide placeholder values', () => {
  const zero = diagnosticPayload({...sample, temperature: 0, memory_used_bytes: 0, uptime_seconds: 0}).raspberry;
  assert.equal(zero.temperature_c, 0);
  assert.equal(zero.cpu_usage_percent, 0);
  assert.equal(zero.memory_usage_percent, 0);
  assert.equal(zero.uptime_s, 0);
  const unavailable = diagnosticPayload({
    ...sample, temperature_valid: false, cpu_valid: false, memory_valid: false, uptime_valid: false,
    temperature: null, cpu_usage_percent: -1, memory_used_bytes: 0, memory_total_bytes: 0,
    uptime_seconds: null,
  }).raspberry;
  assert.deepEqual(unavailable, {
    device_id: 'raspberry-main', temperature_c: null, cpu_usage_percent: null,
    memory_used_bytes: null, memory_total_bytes: null, memory_usage_percent: null, uptime_s: null,
  });
  const partial = diagnosticPayload({...sample, temperature_valid: false}).raspberry;
  assert.equal(partial.temperature_c, null);
  assert.equal(partial.memory_usage_percent, 25);
});

test('valid flags require finite measurements, correct ranges and consistent integer RAM bytes', () => {
  for (const patch of [
    {temperature: '48'}, {temperature: null}, {temperature: -274}, {temperature: NaN},
    {cpu_usage_percent: -1}, {cpu_usage_percent: 101}, {cpu_usage_percent: undefined},
    {uptime_seconds: -1}, {uptime_seconds: Infinity},
    {memory_used_bytes: -1}, {memory_used_bytes: 1.5}, {memory_used_bytes: 4294967297},
    {memory_total_bytes: 0}, {memory_total_bytes: '4294967296'},
    {memory_total_bytes: Number.MAX_SAFE_INTEGER + 1}, {memory_used_bytes: null},
  ]) assert.throws(() => diagnosticPayload({...sample, ...patch}), JSON.stringify(patch));
});

test('validity flags must be booleans and message identity/timestamp must be well formed', () => {
  for (const flag of ['temperature_valid', 'cpu_valid', 'memory_valid', 'uptime_valid']) {
    for (const value of [undefined, null, 'false', 0, 1]) {
      assert.throws(() => diagnosticPayload({...sample, [flag]: value}), flag);
    }
  }
  for (const stamp of [null, {sec: 1.5, nanosec: 0}, {sec: 1, nanosec: 1e9},
    {sec: 1, nanosec: -1}, {sec: 1, nanosec: 0.5}, {sec: 2147483648, nanosec: 0}]) {
    assert.throws(() => diagnosticPayload({...sample, stamp}));
  }
  for (const device_id of ['', '  ', null, 1]) assert.throws(() => diagnosticPayload({...sample, device_id}));
  assert.throws(() => diagnosticPayload({}));
  assert.throws(() => diagnosticPayload({schema_version: 1, stamp: sample.stamp, raspberry: {}, batteries: []}));
  assert.deepEqual(diagnosticPayload({...sample, extra: 'ignored'}), diagnosticPayload(sample));
});
