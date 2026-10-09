import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomId} from '../src/app/core/mqtt/random-id';

test('MQTT identifiers remain UUID v4 when the browser has no randomUUID method', () => {
  const source = {getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto)};
  const ids = Array.from({length: 32}, () => randomId(source));
  for (const id of ids) assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(new Set(ids).size, ids.length);
});

test('MQTT identifiers use native UUID generation when available and fail if randomness is unavailable', () => {
  const id = '00000000-0000-4000-8000-000000000000';
  const unavailable = () => { throw new Error('Randomness unavailable'); };
  assert.equal(randomId({randomUUID: () => id, getRandomValues: unavailable}), id);
  assert.throws(() => randomId({getRandomValues: unavailable}), /Randomness unavailable/);
});
