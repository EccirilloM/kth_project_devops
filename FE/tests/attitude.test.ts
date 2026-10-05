import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeHeight } from '../src/app/core/mqtt/attitude';
import type { MechatronicsData } from '../src/app/dtos/MechatronicsData';
import type { IndicatorsState } from '../src/app/dtos/indicator/Indicator.telemetry';

const data: MechatronicsData = {
  stamp: {sec: 1, nanosec: 0},
  current_height_est_wand: 0,
  current_height_est_ultrasound: 0.4,
};
function selection(value: number, failed = false): IndicatorsState {
  return {ACTIVE_SENSOR: {value, failed, canIncrease: false, canDecrease: false}} as IndicatorsState;
}

test('ride height follows the selected sensor and preserves a real zero reading', () => {
  assert.equal(activeHeight(data, selection(0)), 0);
  assert.equal(activeHeight(data, selection(1)), 0.4);
});

test('expired telemetry, unknown selection and failed selection never look like zero height', () => {
  assert.equal(activeHeight(null, selection(0)), null);
  assert.equal(activeHeight(data, null), null);
  assert.equal(activeHeight(data, {} as IndicatorsState), null);
  assert.equal(activeHeight(data, selection(99)), null);
  assert.equal(activeHeight(data, selection(0, true)), null);
});
