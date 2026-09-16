// flow:createRecording:start
export async function createRecording(event, ports) {
  return ports.storeRecording(event, {timeoutMs: 500});
}
// flow:createRecording:end
