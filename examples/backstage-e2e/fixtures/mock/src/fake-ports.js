// In-memory fakes only: no network, real camera, clock delay, or resident data.
export function fakePorts({storageLatencyMs = 120} = {}) {
  if (!Number.isFinite(storageLatencyMs) || storageLatencyMs < 0) throw new Error('Invalid fake storage latency.');
  const state = {events: [], recordings: [], notifications: []};
  return {
    state,
    async storeRecording(event, {timeoutMs}) {
      state.events.push({type: 'recording.requested', timeoutMs});
      if (storageLatencyMs > timeoutMs) {
        state.events.push({type: 'recording.timed-out', elapsedMs: timeoutMs});
        throw Object.assign(new Error('Recording timed out before storage completed.'), {code: 'RECORDING_TIMEOUT'});
      }
      const recording = {id: 'clip-' + event.id, residentId: event.residentId};
      state.recordings.push(recording);
      state.events.push({type: 'recording.saved', elapsedMs: storageLatencyMs});
      return recording;
    },
    async sendPush(notification) {
      if (!state.recordings.some(r => r.id === notification.recordingId)) throw new Error('Cannot notify before the recording is saved.');
      state.notifications.push(notification);
      state.events.push({type: 'resident.notified'});
      return {delivered: true};
    }
  };
}
