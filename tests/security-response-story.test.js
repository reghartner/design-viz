'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {readSource} = require('../tools/source-loader.cjs');
const source = JSON.parse(fs.readFileSync(require.resolve('../src/starters/security-response.json'), 'utf8'));
const core = {};
vm.runInNewContext(readSource('validator.js'), core);
const diagram = source.page.sections[0].diagram;
const plain = value => JSON.parse(JSON.stringify(value));
const folded = path => core.foldPanelStates(core.diagramForPath(diagram, path));

test('security response teaching seed validates without warnings and preserves its authored source', () => {
  const before = JSON.stringify(source);
  const result = core.validate(core.normalize(source));
  assert.deepEqual(plain(result.errors), []);
  assert.deepEqual(plain(result.warnings), []);
  for (const path of ['confirmed', 'false-alarm', 'dispatch-unavailable']) folded(path);
  assert.equal(JSON.stringify(source), before);
});

test('verification, assignment, travel and arrival remain separate authored events', () => {
  const states = folded('confirmed');
  assert.deepEqual(plain(states.monitor.map(s => s.status)),
    ['armed', 'alarm', 'reviewing', 'reviewing', 'verified', 'verified', 'verified', 'verified', 'verified']);
  assert.deepEqual(plain(states.response.map(s => s.status)),
    ['idle', 'idle', 'idle', 'idle', 'requested', 'assigned', 'enroute', 'enroute', 'onscene']);
  assert.equal(states.response[4].patrol.status, 'available');
  assert.equal(states.response[5].patrol.status, 'assigned');
  assert.equal(states.response.at(-1).patrol.status, 'onscene');
  assert.equal(states.response.at(-1).backup.status, 'available');
});

test('operator evidence and responder movement are explicit separate story beats', () => {
  const states = folded('confirmed');
  assert.equal(states.monitor[1].video, 'closed');
  assert.equal(states.monitor[2].video, 'opening');
  assert.equal(states.monitor[2].scenePlayback, 'waiting');
  assert.equal(states.monitor[3].video, 'reviewing');
  assert.equal(states.monitor[3].scenePlayback, 'playing');
  assert.deepEqual(plain(states.response.slice(5).map(s => s.patrol.progress)), [0,35,78,100]);
  assert.equal(folded('false-alarm').monitor.at(-1).video, 'closed');
  assert.equal(folded('dispatch-unavailable').response.at(-1).patrol.progress, undefined);
});

test('false-alarm and unavailable handoffs cannot inherit a previous responder assignment', () => {
  folded('confirmed');
  const falseAlarm = folded('false-alarm');
  assert.equal(falseAlarm.monitor.at(-1).assessment, 'false-alarm');
  assert.equal(falseAlarm.response.at(-1).status, 'idle');
  assert.equal(falseAlarm.response.at(-1).patrol.status, 'available');
  const unavailable = folded('dispatch-unavailable');
  assert.equal(unavailable.monitor.at(-1).assessment, 'verified');
  assert.equal(unavailable.response.at(-1).status, 'blocked');
  assert.equal(unavailable.response.at(-1).patrol.status, 'available');
  assert.equal(unavailable.response.at(-1).patrol.eta, '');
  const failed = core.diagramForPath(diagram, 'dispatch-unavailable');
  assert.deepEqual(plain(failed.steps.at(-1).failures), {'monitor->dispatch':'dropped'});
});
