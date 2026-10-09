import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createBoat, step, telemetry} from '../dist/boat.js';
import {handleCommand} from '../dist/commands.js';
import {MAX_PAYLOAD_BYTES, TOPICS} from '../dist/topics.js';

const request = id => Buffer.from(JSON.stringify({requestId: id}));

test('the runtime refuses missing credentials before opening a broker connection', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../dist/index.js', import.meta.url))], {
    env: {...process.env, MQTT_USERNAME: '', MQTT_PASSWORD: ''},
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MQTT_USERNAME and MQTT_PASSWORD must be supplied at runtime/);
});

test('telemetry contains the frontend wire fields, valid timestamps and recording state', () => {
  const now = 1720000000123;
  const boat = createBoat();
  const messages = telemetry(boat, now);
  const byTopic = new Map(messages.map(message => [message.topic, message.payload]));
  for (const [topic, fields] of [
    [TOPICS.dashboard, ['roll', 'pitch', 'yaw']],
    [TOPICS.map, ['lat', 'lon', 'yaw']],
    [TOPICS.mechatronics, ['current_height_est_wand', 'current_height_est_ultrasound']],
  ]) {
    const payload = byTopic.get(topic);
    assert.ok(payload, 'Missing telemetry topic: ' + topic);
    assert.deepEqual(payload.stamp, {sec: 1720000000, nanosec: 123000000});
    for (const field of fields) assert.ok(Number.isFinite(payload[field]), topic + ': ' + field);
  }
  for (const mark of byTopic.get(TOPICS.map).marks) {
    assert.ok([0, 1, 2].includes(mark.type));
    assert.ok(Math.abs(mark.lat) <= 90 && Math.abs(mark.lon) <= 180);
  }
  const indicators = byTopic.get(TOPICS.indicators).indicators;
  assert.deepEqual(indicators.map(item => item.indicator), ['ACTIVE_SENSOR']);
  assert.equal(indicators[0].failed, false);
  assert.deepEqual([...byTopic.keys()].sort(), [
    TOPICS.dashboard, TOPICS.map, TOPICS.mechatronics, TOPICS.indicators, TOPICS.recording,
  ].sort());
  assert.deepEqual(Object.keys(byTopic.get(TOPICS.dashboard)).sort(), ['stamp', 'roll', 'pitch', 'yaw'].sort());
  assert.deepEqual(Object.keys(byTopic.get(TOPICS.map)).sort(), ['stamp', 'lat', 'lon', 'yaw', 'marks'].sort());
  assert.deepEqual(Object.keys(byTopic.get(TOPICS.mechatronics)).sort(),
    ['stamp', 'current_height_est_wand', 'current_height_est_ultrasound'].sort());
  assert.equal(byTopic.get(TOPICS.recording).recording, false);
  for (const {payload} of messages) {
    assert.ok(Buffer.byteLength(JSON.stringify(payload)) <= MAX_PAYLOAD_BYTES);
  }
});

test('repeated simulation steps keep displayed values finite and within declared bounds', () => {
  const boat = createBoat();
  for (let i = 0; i < 2000; i++) {
    step(boat);
    for (const [field, min, max] of [
      ['lat', 45.96, 46.01], ['lon', 9.22, 9.29], ['yaw', 0, 360],
      ['roll', -12, 12], ['pitch', -5, 5], ['heightWand', 0.05, 0.45], ['heightUs', 0.05, 0.45],
    ]) {
      assert.ok(Number.isFinite(boat[field]) && boat[field] >= min && boat[field] <= max, field);
    }
  }
});

test('start and stop echo request IDs and publish the resulting recording state', () => {
  const boat = createBoat();
  const started = handleCommand(boat, TOPICS.start, request('test-start'));
  assert.equal(boat.recording, true);
  assert.ok(boat.bagName.length > 0);
  assert.deepEqual(started[0], {
    topic: TOPICS.startResponse, qos: 1, payload: {requestId: 'test-start', success: true},
  });
  assert.equal(started[1].topic, TOPICS.recording);
  assert.equal(started[1].payload.recording, true);
  const stopped = handleCommand(boat, TOPICS.stop, request('test-stop'));
  assert.equal(boat.recording, false);
  assert.deepEqual(stopped[0], {
    topic: TOPICS.stopResponse, qos: 1, payload: {requestId: 'test-stop', success: true},
  });
  assert.equal(stopped[1].topic, TOPICS.recording);
  assert.equal(stopped[1].payload.recording, false);
});

test('duplicate recording commands do not repeat their state change', () => {
  const boat = createBoat();
  handleCommand(boat, TOPICS.start, request('duplicate-start'));
  const bag = boat.bagName;
  const startAgain = handleCommand(boat, TOPICS.start, request('duplicate-start'));
  assert.equal(startAgain[0].payload.success, false);
  assert.equal(startAgain[0].payload.requestId, 'duplicate-start');
  assert.equal(boat.bagName, bag);
  assert.equal(boat.recording, true);
  handleCommand(boat, TOPICS.stop, request('duplicate-stop'));
  assert.equal(handleCommand(boat, TOPICS.stop, request('duplicate-stop'))[0].payload.success, false);
  assert.equal(boat.recording, false);
});

test('malformed, oversized and uncorrelated recording requests leave state unchanged', () => {
  const boat = createBoat();
  const original = structuredClone(boat);
  for (const raw of [
    Buffer.from('{'), Buffer.from('null'), Buffer.from('[]'), Buffer.from('{}'),
    Buffer.from('{"requestId":5}'), Buffer.from('{"requestId":""}'),
    Buffer.alloc(MAX_PAYLOAD_BYTES + 1),
  ]) {
    for (const topic of [TOPICS.start, TOPICS.stop]) {
      assert.deepEqual(handleCommand(boat, topic, raw), []);
      assert.deepEqual(boat, original);
    }
  }
});

test('unknown command topics cannot change the simulated boat', () => {
  const boat = createBoat();
  const original = structuredClone(boat);
  for (const topic of ['test/unknown-command', 'sail_gui/cmd/set_mark',
    'sail_gui/cmd/update', 'sail_gui/cmd/show_servo_angle']) {
    assert.deepEqual(handleCommand(boat, topic, Buffer.from(JSON.stringify({
      requestId: 'unsupported', type: 0, lat: 0, lon: 0,
      indicator: 'ACTIVE_SENSOR', method: 'CHANGE', command: 'FLAP_MAX',
    }))), []);
    assert.deepEqual(boat, original);
  }
});
