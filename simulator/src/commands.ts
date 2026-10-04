import { Boat, bumpIndicator, flapCmd, setMark, startRec, stopRec } from './boat.js';
import { MAX_PAYLOAD_BYTES, TOPICS } from './topics.js';

export type Msg = { topic: string; payload: unknown; qos?: 0 | 1 };

export function handleCommand(b: Boat, topic: string, raw: Buffer): Msg[] {
  if (raw.length > MAX_PAYLOAD_BYTES) return [];

  let data: any;
  try {
    data = JSON.parse(raw.toString());
  } catch {
    return [];
  }
  if (!data || typeof data !== 'object') return [];

  if (topic === TOPICS.start) {
    const id = data.requestId;
    if (typeof id !== 'string' || !id) return [];
    if (b.recording) {
      return [{
        topic: TOPICS.startResponse, qos: 1,
        payload: { requestId: id, success: false, error_message: 'already recording' },
      }];
    }
    startRec(b);
    return [
      { topic: TOPICS.startResponse, qos: 1, payload: { requestId: id, success: true } },
      { topic: TOPICS.recording, payload: { recording: true, bag_name: b.bagName } },
    ];
  }

  if (topic === TOPICS.stop) {
    const id = data.requestId;
    if (typeof id !== 'string' || !id) return [];
    if (!b.recording) {
      return [{
        topic: TOPICS.stopResponse, qos: 1,
        payload: { requestId: id, success: false, error_message: 'not recording' },
      }];
    }
    stopRec(b);
    return [
      { topic: TOPICS.stopResponse, qos: 1, payload: { requestId: id, success: true } },
      { topic: TOPICS.recording, payload: { recording: false, bag_name: b.bagName } },
    ];
  }

  if (topic === TOPICS.setMark) {
    if (typeof data.type === 'number' && typeof data.lat === 'number' && typeof data.lon === 'number') {
      setMark(b, data.type, data.lat, data.lon);
    }
    return [];
  }

  if (topic === TOPICS.update) {
    if (typeof data.indicator === 'string' && typeof data.method === 'string') {
      bumpIndicator(b, data.indicator, data.method);
    }
    return [];
  }

  if (topic === TOPICS.testServo) {
    if (typeof data.command === 'string') flapCmd(b, data.command);
    return [];
  }

  return [];
}
