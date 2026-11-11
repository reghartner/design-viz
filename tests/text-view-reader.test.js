'use strict';
/* #1322: the reader's Text window (src/viewer/text-view.js). Pure state -> text
   logic: which renderer each tab uses, the Queries switch reaching the Steps tab
   only, Copy Markdown always carrying full queries, and the path chooser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {composeSources} = require('../tools/source-loader.cjs');

const FIXTURE = path.join(__dirname, 'fixtures/text-view');
const read = name => JSON.parse(fs.readFileSync(path.join(FIXTURE, name), 'utf8'));

// Renderer stubs record how the window calls them.
function stubbed(){
  const calls = [];
  const C = {
    textViewSteps: (model, options) => { calls.push(['steps', options.queries, options.pathId]); return 'steps ' + options.queries + ' ' + options.pathId; },
    textViewElements: () => { calls.push(['elements']); return 'elements'; },
    textViewFlat: () => { calls.push(['flat']); return 'flat'; },
  };
  vm.createContext(C);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/viewer/text-view.js'), 'utf8'), C);
  return {C, calls};
}

test('each tab uses its renderer and the Queries switch reaches the Steps tab only', () => {
  const {C, calls} = stubbed(), model = {};
  assert.ok(C.textViewReaderText(model, {tab: 'steps', queries: 'names', pathId: 'happy'}, false) === 'steps names happy');
  assert.ok(C.textViewReaderText(model, {tab: 'steps', queries: 'full', pathId: 'refused'}, false) === 'steps full refused');
  assert.ok(C.textViewReaderText(model, {tab: 'elements', queries: 'names'}, false) === 'elements');
  assert.ok(C.textViewReaderText(model, {tab: 'flat', queries: 'names'}, false) === 'flat');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['steps', 'names', 'happy'], ['steps', 'full', 'refused'], ['elements'], ['flat']]);
});

test('copied text always uses full queries, whatever the switch shows', () => {
  const {C} = stubbed(), model = {};
  assert.ok(C.textViewReaderText(model, {tab: 'steps', queries: 'names', pathId: 'happy'}, true) === 'steps full happy');
  assert.ok(C.textViewReaderText(model, {tab: 'elements', queries: 'names'}, true) === 'elements');
  assert.ok(C.textViewReaderText(model, {tab: 'flat', queries: 'names'}, true) === 'flat');
});

test('an unknown tab falls back to Steps', () => {
  const {C} = stubbed();
  assert.ok(C.textViewReaderText({}, {tab: 'grid', queries: 'names', pathId: null}, false) === 'steps names null');
});

test('the path chooser lists each path id once, in document order, and defaults to the reader path', () => {
  const {C} = stubbed();
  const model = {sections: [
    {diagrams: [{paths: [{id: 'happy', label: 'Connected'}, {id: 'refused', label: 'Refused publish'}]}]},
    {diagrams: [{paths: [{id: 'happy', label: 'Main'}, {id: 'retry', label: ''}]}]},
  ]};
  const paths = JSON.parse(JSON.stringify(C.textViewReaderPaths(model)));
  assert.deepEqual(paths, [{id: 'happy', label: 'Connected'}, {id: 'refused', label: 'Refused publish'}, {id: 'retry', label: 'retry'}]);
  assert.ok(C.textViewReaderPath(paths, 'refused', null) === 'refused', 'reader path wins when nothing was chosen');
  assert.ok(C.textViewReaderPath(paths, 'refused', 'retry') === 'retry', 'a chosen path wins');
  assert.ok(C.textViewReaderPath(paths, 'gone', 'missing') === 'happy', 'unknown ids fall back to the first path');
  assert.ok(C.textViewReaderPath([], 'happy', null) === null);
});

test('on the real fixture the Steps copy carries full queries while names hides them', () => {
  const C = {URL, TextEncoder};
  vm.createContext(C);
  vm.runInContext(composeSources(['canon.js', 'validator.js', 'core/text-view.js', 'viewer/text-view.js']), C);
  const page = C.normalize(C.FlowTopology.materialize([read('board.json'), read('platform.json')])[0]);
  const model = C.textViewModel(page), query = 'sum(rate(http_server_requests_total';
  const names = C.textViewReaderText(model, {tab: 'steps', queries: 'names', pathId: 'happy'}, false);
  const copied = C.textViewReaderText(model, {tab: 'steps', queries: 'names', pathId: 'happy'}, true);
  assert.ok(!names.includes(query), 'names view hides query text');
  assert.ok(copied.includes(query), 'copy carries the full query');
  assert.ok(copied === C.textViewSteps(model, {queries: 'full', pathId: 'happy'}));
  const refused = C.textViewReaderText(model, {tab: 'steps', queries: 'names', pathId: 'refused'}, false);
  assert.match(refused, /Path: Refused publish/);
  assert.ok(C.textViewReaderText(model, {tab: 'flat'}, true) === C.textViewFlat(model));
  assert.ok(C.textViewReaderText(model, {tab: 'elements'}, true) === C.textViewElements(model));
});
