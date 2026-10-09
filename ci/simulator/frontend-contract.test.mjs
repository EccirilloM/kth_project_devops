import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBoat, step, telemetry} from '../../simulator/dist/boat.js';
import {TOPICS} from '../../FE/src/app/core/mqtt/topics.ts';
import {activeHeight} from '../../FE/src/app/core/mqtt/attitude.ts';
import {
  dashboardPayload, mapPayload, mechatronicsPayload, indicatorsPayload, recordingPayload,
} from '../../FE/src/app/core/mqtt/payloads.ts';

test('the simplified simulator produces messages accepted by Ettore frontend parsers', () => {
  const boat = createBoat();
  for (let i = 0; i < 20; i++) {
    step(boat);
    const messages = new Map(telemetry(boat, Date.now()).map(message => [message.topic, message.payload]));
    const dashboard = dashboardPayload(messages.get(TOPICS.dashboard));
    const position = mapPayload(messages.get(TOPICS.map));
    const heights = mechatronicsPayload(messages.get(TOPICS.mechatronics));
    const indicators = indicatorsPayload(messages.get(TOPICS.indicators));
    const recording = recordingPayload(messages.get(TOPICS.recording));
    assert.equal(dashboard.roll, boat.roll);
    assert.equal(dashboard.pitch, boat.pitch);
    assert.equal(dashboard.yaw, boat.yaw);
    assert.equal(position.lat, boat.lat);
    assert.equal(position.lon, boat.lon);
    assert.deepEqual(position.marks.map(mark => mark.type), ['COMITATO', 'PIN', 'BOLINA']);
    assert.equal(activeHeight(heights, indicators), boat.heightWand);
    assert.equal(recording.recording, false);
  }
});
