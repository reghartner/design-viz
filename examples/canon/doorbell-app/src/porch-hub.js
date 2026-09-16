import {createRecording} from './recording-service.js';
import {notifyResident} from './notification-service.js';

// flow:receiveButton:start
export async function receiveButton(event, ports) {
  if (event?.type !== 'doorbell.pressed' || !event.residentId) {
    throw new Error('Expected a doorbell press with a resident.');
  }
  const recording = await createRecording(event, ports);
  await notifyResident(recording, ports);
  return {status: 'recorded-and-notified', recordingId: recording.id};
}
// flow:receiveButton:end
