# Reviewed code locations

These are the only approved code references. Each was reviewed at the listed commit.

## ingest.heartbeat
- repository: https://github.kestrel.example.test/kestrel/event-ingest
- path: src/routes/heartbeat.ts
- revision: 232a7fae7a1b9c1a2cc709bbfb2b2f28ec579359
- anchor start: `// flow:heartbeat:start`
- anchor end: `// flow:heartbeat:end`
- lines: 18-44
- what it does: Accepts a heartbeat and writes battery/charging to device-shadow

## ingest.event
- repository: https://github.kestrel.example.test/kestrel/event-ingest
- path: src/routes/events.ts
- revision: 232a7fae7a1b9c1a2cc709bbfb2b2f28ec579359
- anchor start: `export async function postEvent(`
- anchor end: `// flow:event:end`
- lines: 22-81
- what it does: Accepts a motion event, requests a classification label, and forwards person/package events to notify-service

## shadow.lowbattery
- repository: https://github.kestrel.example.test/kestrel/device-shadow
- path: src/rules/lowBattery.go
- revision: e69b820b1ed193a5c961cacb200492a7b6d51a55
- anchor start: `// rule:low-battery:start`
- anchor end: `// rule:low-battery:end`
- lines: 9-37
- what it does: Marks low_battery at <=20% and re-arms above 30%; triggers one low-battery push

## shadow.offline
- repository: https://github.kestrel.example.test/kestrel/device-shadow
- path: src/rules/offline.go
- revision: e69b820b1ed193a5c961cacb200492a7b6d51a55
- anchor start: `// rule:offline:start`
- anchor end: `// rule:offline:end`
- lines: 11-29
- what it does: Marks a device offline after two missed heartbeats (60 min)

## notify.push
- repository: https://github.kestrel.example.test/kestrel/notify-service
- path: lib/push/send.py
- revision: 2fb55bedb2130e15b05eb2675aec70aed75874d3
- anchor start: `def send_push(`
- anchor end: `# flow:push:end`
- lines: 40-88
- what it does: Sends push through APNs/FCM; animal events are skipped by default preference

## clips.upload
- repository: https://github.kestrel.example.test/kestrel/clip-store
- path: src/upload.rs
- revision: fc642217b0d93e1bd231ed4d9fd969b1415833de
- anchor start: `// flow:upload:start`
- anchor end: `// flow:upload:end`
- lines: 15-62
- what it does: Stores an uploaded clip, including late uploads from SD card queues

## app.devicepage
- repository: https://github.kestrel.example.test/kestrel/kestrel-app
- path: app/screens/DevicePage.tsx
- revision: 35715c5be4b5abc83e15d8dc51d216b7119657cd
- anchor start: `export function DevicePage(`
- anchor end: `// screen:device:end`
- lines: 12-140
- what it does: Device page: battery %, charging icon, 'updated <time>', online/offline
