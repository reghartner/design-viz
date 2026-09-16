// flow:notifyResident:start
export async function notifyResident(recording, ports) {
  return ports.sendPush({residentId: recording.residentId, recordingId: recording.id});
}
// flow:notifyResident:end
