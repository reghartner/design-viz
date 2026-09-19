import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {receiveButton} from './src/porch-hub.js';
import {fakePorts} from './src/fake-ports.js';

export async function runDoorbell(storageLatencyMs = 120) {
  const ports = fakePorts({storageLatencyMs});
  let result = null, error = null;
  try { result = await receiveButton({id:'press-1', type:'doorbell.pressed', residentId:'fictional-resident'}, ports); }
  catch (e) { error = {code:e.code || 'INVALID_EVENT', message:e.message}; }
  return {simulated:true, storageLatencyMs, result, error, ...ports.state};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const observation = await runDoorbell();
  console.log(JSON.stringify(observation, null, 2));
  process.exitCode = observation.error ? 1 : 0;
}
