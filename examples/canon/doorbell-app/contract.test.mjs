import test from 'node:test';
import assert from 'node:assert/strict';
import {runDoorbell} from './run.mjs';
import {receiveButton} from './src/porch-hub.js';
import {fakePorts} from './src/fake-ports.js';

test('a normal 120 ms recording is saved before the resident is notified', async () => {
  const out = await runDoorbell(120);
  assert.equal(out.error, null);
  assert.equal(out.result.status, 'recorded-and-notified');
  assert.equal(out.recordings.length, 1);
  assert.deepEqual(out.notifications, [{residentId:'fictional-resident', recordingId:out.recordings[0].id}]);
  assert.deepEqual(out.events.map(e=>e.type), ['recording.requested','recording.saved','resident.notified']);
});
test('the recording contract accepts storage completing at the 500 ms deadline', async () => {
  const out = await runDoorbell(500);
  assert.equal(out.error, null);
  assert.equal(out.notifications.length, 1);
});
test('storage beyond the deadline fails without a misleading resident notification', async () => {
  const out = await runDoorbell(501);
  assert.equal(out.error.code, 'RECORDING_TIMEOUT');
  assert.equal(out.recordings.length, 0);
  assert.equal(out.notifications.length, 0);
});
test('invalid events cannot record or notify', async () => {
  const ports = fakePorts();
  await assert.rejects(receiveButton({type:'motion.detected'}, ports), /doorbell press/);
  assert.deepEqual(ports.state, {events:[], recordings:[], notifications:[]});
});
