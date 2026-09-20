'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const V={};vm.runInNewContext(readSource('validator.js'),V);
function loadFields(extra={}){
  const context={};
  for(const key of ['document','window'])Object.defineProperty(context,key,{get(){throw new Error('Field values accessed '+key);}});
  vm.createContext(context);
  for(const name of ['validator','workbench/commands/common'])vm.runInContext(readSource(name+'.js'),context);
  context.parseClock=undefined;Object.assign(context,extra);
  vm.runInContext(readSource('workbench/field-values.js'),context);
  return context;
}
const B=loadFields();

test('patchSummaryLine caps summaries at two pairs and handles empty patches', () => {
  assert.strictEqual(B.patchSummaryLine({}), 'empty patch');
  assert.strictEqual(B.patchSummaryLine({state: 'held', label: 'hello', reason: 'hidden'}),
    'state → held · label → hello');
});

test('patchSummaryLine compacts arrays and objects and prints scalar values bare', () => {
  assert.strictEqual(B.patchSummaryLine({events: [{at: '1m'}, {}], subject: {x: 2}}),
    'events → [2 items] · subject → {…}');
  assert.strictEqual(B.patchSummaryLine({value: 12.5, cold: false}), 'value → 12.5 · cold → false');
  assert.strictEqual(B.patchSummaryLine({label: 'bare string', alert: true}), 'label → bare string · alert → true');
  assert.strictEqual(B.patchSummaryLine({cells: [], notify: null}), 'cells → [0 items] · notify → null');
});

test('panelPatchFields uses declaration vocabularies only when nonempty and falls back for unknown types', () => {
  for (const type of ['state', 'orbit']){
    assert.deepStrictEqual(plain(B.panelPatchFields({type, states: ['idle', 'busy']})[0]),
      ['state', 'enum', ['idle', 'busy']]);
    for (const states of [[], undefined, 'invalid'])
      assert.deepStrictEqual(plain(B.panelPatchFields({type, states})[0]), ['state', 'text']);
  }
  assert.deepStrictEqual(plain(B.panelPatchFields({type: 'gauge'})), [['value', 'num']]);
  for (const decl of [null, {}, {type: 'future-widget'}, {type: 'toString'}])
    assert.strictEqual(B.panelPatchFields(decl), null);
  assert.strictEqual(B.PANEL_PATCH_FIELDS.state[0][1], 'text', 'table stays unchanged');
});

test('panelPatchFields expands declared led tile and signal ids with the correct nested fields', () => {
  assert.deepStrictEqual(plain(B.panelPatchFields({type: 'leds', leds: [{id: 'power'}, null, {}, {id: ''}]})),
    [['power', 'enum', ['on', 'off', 'tx', 'rx']]]);
  const tile = {type: 'tiles', tiles: [{id: 'front'}], states: ['ready']};
  assert.deepStrictEqual(plain(B.panelPatchFields(tile)),
    [['front', 'objf', [['state', 'enum', ['ready']], ['sub', 'text']]]]);
  tile.states = [];
  assert.deepStrictEqual(plain(B.panelPatchFields(tile)[0][2][0]), ['state', 'text']);
  assert.deepStrictEqual(plain(B.panelPatchFields({type: 'signal', links: [{id: 'uplink'}]})),
    [['uplink', 'objf', [['state', 'enum', ['ok', 'weak', 'retrying', 'lost', 'jammed']],
      ['bars', 'num', {min: 0, max: 4}], ['note', 'text']]]]);
  for (const type of ['leds', 'tiles', 'signal']) assert.deepStrictEqual(plain(B.panelPatchFields({type})), []);
});

test('patchFieldsCollect omits blank fields and preserves false zero and unknown enum tokens', () => {
  const fields = [['state', 'enum', ['ok']], ['note', 'text'], ['bars', 'num'], ['cold', 'bool']];
  assert.deepStrictEqual(plain(B.patchFieldsCollect(fields,
    {state: 'future state ', note: '  ', bars: '0', cold: 'false'}).item),
    {state: 'future state ', bars: 0, cold: false});
  assert.deepStrictEqual(plain(B.patchFieldsCollect(fields, {}).item), {});
  assert.deepStrictEqual(plain(B.patchFieldsCollect([['label', 'text']], {label: ' hello ', unknown: 'ignored'}).item),
    {label: 'hello'});
  assert.strictEqual(B.patchFieldsCollect([['cold', 'bool']], {cold: 'true'}).item.cold, true);
  assert.match(B.patchFieldsCollect([['cold', 'bool']], {cold: 'yes'}).error, /true or false/);
});

test('patchFieldsCollect rejects invalid numbers and enforces signal bars bounds', () => {
  const fields = [['bars', 'num', {min: 0, max: 4}]];
  for (const value of ['oops', '2x', 'Infinity', '1e400'])
    assert.match(B.patchFieldsCollect(fields, {bars: value}).error, /not a number/);
  for (const value of ['-1', '5'])
    assert.match(B.patchFieldsCollect(fields, {bars: value}).error, /from 0 to 4/);
  for (const value of ['0', '2.5', '4'])
    assert.strictEqual(B.patchFieldsCollect(fields, {bars: value}).item.bars, Number(value));
  assert.strictEqual(B.patchFieldsCollect([['value', 'num']], {value: '-1.5e2'}).item.value, -150);
});

test('patchFieldsCollect validates complex JSON shapes and distinguishes null from deletion', () => {
  const fields = [['subject', 'json'], ['events', 'jsonArr'], ['notify', 'jsonAny']];
  assert.deepStrictEqual(plain(B.patchFieldsCollect(fields,
    {subject: '{"x":2}', events: '[{"at":"1m"}]', notify: 'null'}).item),
    {subject: {x: 2}, events: [{at: '1m'}], notify: null});
  for (const raw of ['null', '[]', 'false', '2'])
    assert.match(B.patchFieldsCollect([fields[0]], {subject: raw}).error, /JSON object/);
  assert.match(B.patchFieldsCollect([fields[1]], {events: '{}'}).error, /JSON array/);
  assert.match(B.patchFieldsCollect([fields[2]], {notify: '{bad'}).error, /not valid JSON/);
  assert.deepStrictEqual(plain(B.patchFieldsCollect(fields, {notify: ' '}).item), {});
  assert.deepStrictEqual(plain(B.patchFieldsCollect([fields[2]], {notify: '[1]'}).item), {notify: [1]});
});

test('patchFieldsCollect validates clocks when parseClock is available', () => {
  const clocks = loadFields({parseClock: V.parseClock});
  const fields = [['now', 'clock']];
  assert.strictEqual(clocks.patchFieldsCollect(fields, {now: '1h 30m'}).item.now, '1h 30m');
  assert.strictEqual(clocks.patchFieldsCollect(fields, {now: '0'}).item.now, '0');
  assert.match(clocks.patchFieldsCollect(fields, {now: 'yesterday'}).error, /duration/);
  assert.deepStrictEqual(plain(clocks.patchFieldsCollect(fields, {now: '  '}).item), {});
  assert.strictEqual(B.patchFieldsCollect(fields, {now: 'unvalidated'}).item.now, 'unvalidated');
});

test('patchFieldsCollect builds whole tile and link replacements and omits all-empty entries', () => {
  const tileFields = B.panelPatchFields({type: 'tiles', tiles: [{id: 't'}], states: []})[0][2];
  assert.deepStrictEqual(plain(B.patchFieldsCollect(tileFields, {state: 'anything', sub: 'caption'}).item),
    {state: 'anything', sub: 'caption'});
  assert.deepStrictEqual(plain(B.patchFieldsCollect(tileFields, {state: '', sub: 'caption'}).item), {sub: 'caption'});
  assert.deepStrictEqual(plain(B.patchFieldsCollect(tileFields, {state: '', sub: ' '}).item), {});
  const linkFields = B.panelPatchFields({type: 'signal', links: [{id: 'l'}]})[0][2];
  assert.deepStrictEqual(plain(B.patchFieldsCollect(linkFields, {state: 'future', bars: '0', note: ''}).item),
    {state: 'future', bars: 0});
  assert.deepStrictEqual(plain(B.patchFieldsCollect(linkFields, {state: '', bars: '', note: ''}).item), {});
});

test('rowsEditorCollect merges edits, keeps unknown keys, drops blank new rows, enforces req/num/max', () => {
  const shape = {cols: [{k: 'id', req: true}, {k: 'label'}, {k: 'ms', kind: 'num', req: true}], max: 3};
  const out = B.rowsEditorCollect(shape, [
    {base: {id: 'dns', label: 'DNS', ms: 40, weird: 7}, values: {id: 'dns', label: 'lookup', ms: '55'}},
    {base: null, values: {id: '', label: '', ms: ''}},           /* blank new row: dropped */
    {base: null, values: {id: 'tls', label: '', ms: '120'}}
  ]);
  assert.deepStrictEqual(plain(out.items), [
    {id: 'dns', label: 'lookup', ms: 55, weird: 7},               /* unknown key survives */
    {id: 'tls', ms: 120}                                          /* empty optional col omitted */
  ]);
  assert.match(B.rowsEditorCollect(shape, [
    {base: null, values: {id: '', label: 'x', ms: '9'}}
  ]).error, /item 1: id is required/);
  assert.match(B.rowsEditorCollect(shape, [
    {base: null, values: {id: 'a', label: '', ms: 'fast'}}
  ]).error, /ms: "fast" is not a number/);
  assert.match(B.rowsEditorCollect(shape, [1, 2, 3, 4].map(n => (
    {base: null, values: {id: 'i' + n, label: '', ms: String(n)}}
  ))).error, /at most 3 items/);
  /* blanking an EXISTING row fails required cols instead of silently dropping */
  assert.match(B.rowsEditorCollect(shape, [
    {base: {id: 'keep', ms: 4}, values: {id: '', label: '', ms: ''}}
  ]).error, /item 1: id is required/);
});

test('rowsEditorCollect validates clock and enum columns when the parser is present', () => {
  const withClock = loadFields({parseClock: t => (/^\d+m$/.test(t) ? Number(t.slice(0, -1)) * 60 : null)});
  const shape = {cols: [{k: 'id', req: true}, {k: 'every', kind: 'clock', req: true},
                        {k: 'kind', kind: 'enum', options: ['ok', 'alert']}]};
  const good = withClock.rowsEditorCollect(shape, [
    {base: null, values: {id: 'hb', every: '5m', kind: 'alert'}}
  ]);
  assert.deepStrictEqual(plain(good.items), [{id: 'hb', every: '5m', kind: 'alert'}]);
  assert.match(withClock.rowsEditorCollect(shape, [
    {base: null, values: {id: 'hb', every: 'soonish', kind: ''}}
  ]).error, /every: "soonish" is not a duration/);
  assert.match(withClock.rowsEditorCollect(shape, [
    {base: null, values: {id: 'hb', every: '5m', kind: 'loud'}}
  ]).error, /kind: "loud" is not one of ok \| alert/);
  /* an unknown enum value ALREADY on the item passes through: editing a
     sibling column must neither reject nor delete it */
  const kept = withClock.rowsEditorCollect(shape, [
    {base: {id: 'hb', every: '5m', kind: 'loud'}, values: {id: 'hb2', every: '5m', kind: 'loud'}}
  ]);
  assert.deepStrictEqual(plain(kept.items), [{id: 'hb2', every: '5m', kind: 'loud'}]);
  /* without a parser (this vm copy), clock text passes through unvalidated */
  const noParser = B.rowsEditorCollect(shape, [
    {base: null, values: {id: 'hb', every: 'soonish', kind: ''}}
  ]);
  assert.deepStrictEqual(plain(noParser.items), [{id: 'hb', every: 'soonish'}]);
});

test('mapEditorCollect drops blank pairs, rejects duplicates, and empties to null', () => {
  assert.deepStrictEqual(plain(B.mapEditorCollect([
    {key: 'OK', value: '#34D399'},
    {key: '', value: '#111111'},          /* blank key: dropped */
    {key: 'BAD', value: ''},              /* blank value: dropped */
    {key: 'ERR', value: '#F87171'}
  ]).obj), {OK: '#34D399', ERR: '#F87171'});
  assert.match(B.mapEditorCollect([
    {key: 'A', value: '1'}, {key: 'A', value: '2'}
  ]).error, /duplicate key "A"/);
  assert.strictEqual(B.mapEditorCollect([{key: '', value: ''}]).obj, null);
});

test('phone setup exposes brand fields and drops cleared values like timeline cadence', () => {
  const expected = ['brand', 'objf', {cols: [{k: 'app'}, {k: 'logo'}, {k: 'accent'}, {k: 'bg'}, {k: 'fg'}]}];
  assert.deepStrictEqual(plain(B.PANEL_SETUP_FIELDS.phone), [expected, ['initial', 'json']]);
  const shape = B.PANEL_SETUP_FIELDS.phone[0][2];
  const base = {app: 'Ring', logo: 'R', accent: '#1D6EF2'};
  assert.deepStrictEqual(plain(B.objFieldsCollect(shape, base, {app: 'Ring', logo: '', accent: '', bg: '#abc', fg: ''})),
    {obj: {app: 'Ring', bg: '#abc'}});
  assert.strictEqual(B.objFieldsCollect(shape, base, {app: '', logo: '', accent: '', bg: '', fg: '  '}).obj, null);
});

test('objFieldsCollect keeps unknown keys, removes on all-empty, and validates like a row', () => {
  const shape = {cols: [{k: 'every', req: true}, {k: 'label'}]};
  const out = B.objFieldsCollect(shape, {every: '30m', label: 'heartbeat', extra: true},
                                 {every: '1h', label: ''});
  assert.deepStrictEqual(plain(out.obj), {every: '1h', extra: true});
  assert.strictEqual(B.objFieldsCollect(shape, {every: '30m'}, {every: '', label: ''}).obj, null);
  assert.match(B.objFieldsCollect(shape, {}, {every: '', label: 'x'}).error, /every is required/);
});

test('patchFieldsCollect: a trueOnly bool refuses false (phone clear)', () => {
  const clear = [['clear', 'bool', {trueOnly: true}]];
  assert.strictEqual(B.patchFieldsCollect(clear, {clear: 'true'}).item.clear, true);
  assert.match(B.patchFieldsCollect(clear, {clear: 'false'}).error, /only true/);
  assert.deepStrictEqual(Object.keys(B.patchFieldsCollect(clear, {clear: ''}).item), []);
  assert.deepStrictEqual(plain(B.PANEL_PATCH_FIELDS.phone[2]), ['clear', 'bool', {trueOnly: true}]);
});

test('Home icon edits validate choices, preserve future icons and clear defaults without losing row fields', () => {
  for (const key of ['devices', 'subjects']) {
    const shape = B.PANEL_SETUP_FIELDS.homemap.find(field => field[0] === key)[2];
    const base = {id: 'cloud-service', x: 25, y: 45, icon: 'future-icon', extension: {keep: true}};
    if (key === 'devices') base.kind = 'sensor';
    const values = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, String(v)]));
    const preserved = B.builderRowMerge(shape, base, {...values, x: '26'});
    assert.deepStrictEqual(plain(preserved.item), {...base, x: 26});
    const selected = B.builderRowMerge(shape, base, {...values, icon: 'cloud'});
    assert.deepStrictEqual(plain(selected.item), {...base, icon: 'cloud'});
    assert.match(B.builderRowMerge(shape, base, {...values, icon: 'made-up'}).error, /not one of/);
    const cleared = B.builderRowMerge(shape, base, {...values, icon: ''});
    const expected = {...base}; delete expected.icon;
    assert.deepStrictEqual(plain(cleared.item), expected);
  }
});

test('homemap subject patch fields accept positions and explicit null', () => {
  const subjects = [{id: 'walker', x: 20, y: 150}, {id: '__proto__', x: 5, y: 6}];
  const decl = {type: 'homemap', devices: [{id: 'cam', kind: 'camera', x: 1, y: 2}], subjects};
  const fields = B.panelPatchFields(decl);
  assert.deepStrictEqual(plain(fields.slice(1)), [
    ['walker', 'json', {nullable: true}], ['__proto__', 'json', {nullable: true}], ['signals', 'jsonArr']
  ]);
  for (const raw of ['{"x":120,"y":60}', 'null'])
    assert.deepStrictEqual(plain(B.patchFieldsCollect(fields, {walker: raw}).item), {walker: JSON.parse(raw)});
  for (const raw of ['[]', 'false', '2', '"scan"'])
    assert.ok(B.patchFieldsCollect(fields, {walker: raw}).error);
  assert.ok(B.patchFieldsCollect([['normal', 'json']], {normal: 'null'}).error);
  subjects.push(null, {}, {id: 5, x: 1, y: 2}, {...subjects[0]}, {id: 'cam', x: 1, y: 2},
    {id: 'signals', x: 1, y: 2}, {id: 'bad', x: Infinity, y: 2});
  assert.deepStrictEqual(plain(B.panelPatchFields(decl)), plain(fields));
});
