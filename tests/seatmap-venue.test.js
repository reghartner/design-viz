'use strict';
process.env.FLOWVIEW_PACKAGES = [...new Set([...(process.env.FLOWVIEW_PACKAGES || '').split(',').filter(Boolean), 'sports'])].join(',');
/* Seatmap venue library: registry lookup, declaration precedence, unknown ids,
   fork-added venues, the importer's venue output, the paths rink outline and
   proof that existing inline declarations render byte-identically. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const {readSource, sourceFiles} = require('../tools/source-loader.cjs');
const {seatmapRenders} = require('./helpers/seatmap-renders.js');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools/seatmap-import.mjs');
const VENUE_FILE = path.join(ROOT, 'packages/sports/panels/venues/ubs-arena.js');
const ARENA_SVG = path.join(ROOT, 'packages/sports/examples/ubs-arena/arena.svg');
const EXAMPLE = path.join(ROOT, 'packages/sports/examples/venue-map.spec.json');
/* The exact command that produced packages/sports/panels/venues/ubs-arena.js. */
const SEED_ARGS = [ARENA_SVG, '--level-map', '100-level:100 level,200-level:200 level,300-level:300 level', '--capacity-total', '17250',
  '--venue', 'ubs-arena', '--venue-name', 'UBS Arena', '--venue-location', 'Elmont, NY',
  '--venue-note', 'Section numbering and positions from public seating guides, drawn as original polygons by packages/sports/examples/ubs-arena/trace.py. Capacities are an illustrative even split of 17,250 seats, not venue data.',
  '--landmark', 'home-bench:home bench:428:302', '--landmark', 'away-bench:visitors:556:302', '--landmark', 'ice:ice:489:404'];

function core(extra = '') {
  const C = {URL, TextEncoder, console};
  vm.createContext(C);
  vm.runInContext(readSource('validator.js') + '\n' + extra, C);
  vm.runInContext(readSource('engine.js'), C);
  return C;
}
const C = core();
const plain = value => JSON.parse(JSON.stringify(value));
const validate = d => plain(C.validate(C.normalize(d)));
const diagram = panel => ({nodes: {n: {}}, rows: [['n']], panels: [panel]});
const examplePanel = spec => spec.page.blocks[0].diagram.panels[0];
/* A fork's company/panels/venues may add ids after the upstream ones (the
   overlay acceptance test reruns this file with a fixture venue). */
const IDS = Array.from(C.SeatmapVenues.ids());
const AVAILABLE = IDS.join(', ');

test('the sports package ships exactly one venue, UBS Arena in Elmont', () => {
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'packages/sports/panels/venues')), ['ubs-arena.js']);
  assert.equal(IDS[0], 'ubs-arena');
  const [row] = plain(C.SeatmapVenues.list());
  assert.deepEqual({id: row.id, name: row.name, location: row.location, sections: row.sections, capacityNote: row.capacityNote},
    {id: 'ubs-arena', name: 'UBS Arena', location: 'Elmont, NY', sections: 80, capacityNote: 'illustrative even split'});
  assert.match(row.note, /public seating guides/);
  assert.match(row.note, /illustrative even split/);
  const venue = C.SeatmapVenues.get('ubs-arena');
  assert.equal(venue.seatmap.geometry, 'paths');
  assert.deepEqual(plain(venue.seatmap.field), {shape: 'rink', x: 312, y: 326.6, width: 353.9, height: 150.4});
  assert.equal(venue.seatmap.sections.reduce((sum, s) => sum + s.capacity, 0), 17250);
  assert.ok(Object.isFrozen(venue.seatmap.sections[0]), 'venue data is immutable');
  assert.equal(C.SeatmapVenues.get('constructor'), null);
  assert.equal(C.SeatmapVenues.get(7), null);
  // Venue files load after the library and before every panel type.
  const files = sourceFiles('validator.js');
  assert.ok(files.indexOf('@package/sports/panels/venue-library.js') < files.indexOf('@package/sports/panels/venues/ubs-arena.js'));
  assert.ok(files.indexOf('@package/sports/panels/venues/ubs-arena.js') < files.findIndex(f => f.startsWith('panels/types/')));
  // A venue file is a single define call with a JSON literal: data only.
  const text = fs.readFileSync(VENUE_FILE, 'utf8');
  const literal = text.slice(text.indexOf('SeatmapVenues.define(') + 'SeatmapVenues.define('.length, text.lastIndexOf(');'));
  assert.deepEqual(JSON.parse(literal), plain(venue));
  assert.equal(text.match(/SeatmapVenues\.define\(/g).length, 1);
});

test('every library venue validates clean as a bare reference, and malformed or duplicate venue files fail loudly', () => {
  for (const id of C.SeatmapVenues.ids())
    assert.deepEqual(validate(diagram({id: 'map', type: 'seatmap', venue: id})), {errors: [], warnings: []}, id);
  assert.throws(() => C.SeatmapVenues.define({id: 'ubs-arena', name: 'Again', seatmap: {rings: [], sections: []}}), /already defined/);
  assert.throws(() => C.SeatmapVenues.define({id: '__proto__', name: 'X', seatmap: {rings: [], sections: []}}), /id must be/);
  assert.throws(() => C.SeatmapVenues.define({id: 'x1', name: 'X', team: 'Y', seatmap: {rings: [], sections: []}}), /unknown field "team"/);
  assert.throws(() => C.SeatmapVenues.define({id: 'x2', name: 'X', seatmap: {tiers: [], rings: [], sections: []}}), /seatmap\.tiers is not a venue field/);
  assert.throws(() => C.SeatmapVenues.define({id: 'x3', name: '<b>X</b>', seatmap: {rings: [], sections: []}}), /name must be/);
  assert.throws(() => C.SeatmapVenues.define({id: 'x4', name: 'X', seatmap: {rings: []}}), /rings and sections arrays/);
  assert.deepEqual(Array.from(C.SeatmapVenues.ids()), IDS, 'failed definitions register nothing');
});

test('a venue supplies every field the panel does not write; a written field replaces the venue value wholesale', () => {
  const venue = C.SeatmapVenues.get('ubs-arena').seatmap;
  const bare = {id: 'map', type: 'seatmap', venue: 'ubs-arena', currency: 'USD'};
  const resolved = C.SeatmapVenues.resolve(bare);
  for (const key of C.SeatmapVenues.fields) if (key in venue) assert.equal(resolved[key], venue[key], key);
  assert.equal(resolved.currency, 'USD');
  assert.equal(bare.sections, undefined, 'resolution never mutates the declaration');
  const landmarks = [{id: 'stage', label: 'stage', x: 500, y: 100}];
  const over = C.SeatmapVenues.resolve({...bare, landmarks});
  assert.equal(over.landmarks, landmarks, 'landmarks are replaced, not merged');
  assert.equal(over.sections, venue.sections);
  const empty = C.SeatmapVenues.resolve({...bare, landmarks: []});
  assert.deepEqual(plain(empty.landmarks), []);
  const model = C.seatmapModel({...bare, landmarks}, {});
  assert.deepEqual(plain(model.landmarks).map(m => m.id), ['stage']);
  assert.equal(model.sections.length, 80);
  // Overriding sections keeps the venue's rings and geometry.
  const few = venue.sections.slice(0, 4).map(s => ({...s}));
  const small = C.seatmapModel({...bare, sections: few}, {});
  assert.deepEqual(small.sections.map(s => s.id), few.map(s => s.id));
  assert.equal(small.geometry, 'paths');
  // Without venue, or with an unknown one, the declaration is returned as is.
  const inline = {id: 'map', type: 'seatmap', rings: [], sections: []};
  assert.equal(C.SeatmapVenues.resolve(inline), inline);
  const unknown = {...inline, venue: 'nowhere'};
  assert.equal(C.SeatmapVenues.resolve(unknown), unknown);
});

test('an unknown venue warns with the available ids and draws the inline fields or an empty map without throwing', () => {
  const result = validate(diagram({id: 'map', type: 'seatmap', venue: 'madison-square'}));
  assert.ok(result.warnings.some(w => /panels\[0\]\.venue: unknown venue "madison-square" — available: /.test(w) && w.includes('available: ' + AVAILABLE + '; drawing the panel’s own sections')), result.warnings.join('\n'));
  assert.ok(validate(diagram({id: 'map', type: 'seatmap', venue: 5})).warnings.some(w => w.includes('venue: expected a venue id — available: ' + AVAILABLE)));
  const empty = C.seatmapHTML({id: 'map', type: 'seatmap', venue: 'madison-square'}, {});
  assert.match(empty, /Declare 4–160 sections to draw the map/);
  const inline = {id: 'map', type: 'seatmap', venue: 'madison-square', rings: [{id: 'r', label: 'Ring'}],
    sections: ['1', '2', '3', '4'].map(id => ({id, ring: 'r', capacity: 10, zone: 'end'}))};
  const html = C.seatmapHTML(inline, {});
  assert.equal((html.match(/data-sec="/g) || []).length, 4);
  const host = {querySelector() { return null; }, querySelectorAll() { return []; }};
  assert.doesNotThrow(() => C.renderPanelBody(host, {id: 'map', type: 'seatmap', venue: {}}, {}, 'aurora', [], 0, false));
});

test('step patches are checked against the venue’s sections', () => {
  const d = diagram({id: 'map', type: 'seatmap', venue: 'ubs-arena', initial: {sold: {101: 100, 999: 3}}});
  d.steps = [{panels: {map: {sold: {329: 215, 229: 1}}}}];
  const warnings = validate(d).warnings;
  assert.ok(warnings.some(w => /initial\.sold\.999: unknown section id/.test(w)));
  assert.ok(warnings.some(w => /sold\.229: unknown section id/.test(w)));
  assert.ok(!warnings.some(w => /\.329:|\.101:/.test(w)), warnings.join('\n'));
});

test('a fork adds a venue with one file in company/panels/venues; the bundle discovers it and panels can use it', () => {
  assert.ok(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/source-bundles.json'), 'utf8'))['validator.js'].includes('@company/panels/venues/*.js'));
  const fork = fs.readFileSync(path.join(__dirname, 'fixtures/company-overlay/panels/venues/fixture-hall.js'), 'utf8');
  const overlaid = !!C.SeatmapVenues.get('fixture-hall');
  const F = overlaid ? C : core(fork);
  assert.deepEqual(Array.from(F.SeatmapVenues.ids()).slice(0, 1), ['ubs-arena']);
  assert.ok(F.SeatmapVenues.ids().includes('fixture-hall'));
  assert.deepEqual(plain(F.validate(F.normalize(diagram({id: 'map', type: 'seatmap', venue: 'fixture-hall'})))), {errors: [], warnings: []});
  assert.equal(F.seatmapModel({id: 'map', type: 'seatmap', venue: 'fixture-hall'}, {}).sections.length, 8);
  if (!overlaid) {
    const warn = plain(C.validate(C.normalize(diagram({id: 'map', type: 'seatmap', venue: 'fixture-hall'})))).warnings;
    assert.ok(warn.some(w => /unknown venue "fixture-hall" — available: ubs-arena/.test(w)), 'without the fork file the id is unknown');
  }
});

test('the importer writes a venue entry file; the committed UBS Arena file is exactly its output', () => {
  const run = spawnSync(process.execPath, [TOOL, ...SEED_ARGS], {cwd: ROOT, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, fs.readFileSync(VENUE_FILE, 'utf8'), 'regenerate packages/sports/panels/venues/ubs-arena.js with the seed command');
  assert.match(run.stderr, /field: rink outline 353\.9×150\.4 at 312,326\.6/);
  assert.match(run.stderr, /rings: 100-level "100 level": 21, 200-level "200 level": 33, 300-level "300 level": 26/);
  // The SVG itself is reproducible from trace.py and the CSV.
  const out = path.join(require('node:os').tmpdir(), 'seatmap-trace-' + process.pid + '.svg');
  try {
    const traced = spawnSync('python3', [path.join(ROOT, 'packages/sports/examples/ubs-arena/trace.py'), out], {encoding: 'utf8'});
    assert.equal(traced.status, 0, traced.stderr);
    assert.equal(fs.readFileSync(out, 'utf8'), fs.readFileSync(ARENA_SVG, 'utf8'));
  } finally { fs.rmSync(out, {force: true}); }
  // Capacities, zones and rings match the CSV import (section 329, not 229).
  const csv = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/sports/examples/arena-sections.sections.json'), 'utf8'));
  const venue = C.SeatmapVenues.get('ubs-arena').seatmap;
  assert.deepEqual(plain(venue.sections.map(s => [s.id, s.ring, s.capacity, s.zone])), csv.sections.map(s => [s.id, s.ring, s.capacity, s.zone]));
  assert.ok(venue.sections.some(s => s.id === '329' && s.ring === '200-level'));
  assert.ok(!venue.sections.some(s => s.id === '229'));
});

test('venue CLI options are checked: ids, names, landmarks and venue-only flags without --venue', () => {
  const cli = args => spawnSync(process.execPath, [TOOL, ...args], {cwd: ROOT, encoding: 'utf8'});
  const csv = path.join(ROOT, 'packages/sports/examples/arena-sections.csv');
  let run = cli([csv, '--venue-name', 'X']);
  assert.equal(run.status, 2); assert.match(run.stderr, /need --venue ID/);
  run = cli([csv, '--venue', 'bad id', '--venue-name', 'X']);
  assert.equal(run.status, 1); assert.match(run.stderr, /--venue needs a letter-or-digit-led id/);
  run = cli([csv, '--venue', 'x', '--venue-name', 'A <b>']);
  assert.equal(run.status, 1); assert.match(run.stderr, /name must be/);
  run = cli([csv, '--venue', 'x', '--venue-name', 'X', '--landmark', 'nope']);
  assert.equal(run.status, 2); assert.match(run.stderr, /--landmark is id:label:x:y/);
  // A venue is written only when the panel validator accepts it without a warning.
  run = cli([csv, '--venue', 'x', '--venue-name', 'X', '--landmark', 'b:bench:5000:1', '--out', path.join(require('node:os').tmpdir(), 'never-' + process.pid + '.js')]);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /venue "x" would not draw cleanly; nothing written:\n  - seatmap\.landmarks\[0\]: x and y must lie inside the 1000×770 viewBox/);
  assert.equal(fs.existsSync(path.join(require('node:os').tmpdir(), 'never-' + process.pid + '.js')), false);
  run = cli([csv, '--capacity-total', '17250', '--venue', 'csv-hall', '--venue-name', 'CSV Hall', '--landmark', 'b:home: bench:400:322']);
  assert.equal(run.status, 0, run.stderr);
  // Nothing from the file name or the data can close the comment or an inline <script>.
  const hostile = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'seatmap-venue-'));
  const hostileFile = path.join(hostile, 'a<img src=x onerror=alert(1)>*.csv');
  try {
    fs.writeFileSync(hostileFile, 'id,level,zone,capacity,label\n1,L,end,1,</script><b>\n2,L,end,1,\n3,L,end,1,\n4,L,end,1,\n');
    const evil = cli([hostileFile, '--venue', 'evil', '--venue-name', 'Evil <Hall>']);
    assert.equal(evil.status, 1, 'a name with markup is refused');
    const safe = cli([hostileFile, '--venue', 'evil', '--venue-name', 'Evil */ Hall']);
    assert.equal(safe.status, 0, safe.stderr);
    assert.doesNotMatch(safe.stdout, /<\/|<b>|<img/);
    assert.equal(safe.stdout.indexOf('*/'), safe.stdout.indexOf(' */\nSeatmapVenues.define(') + 1, 'the only comment end is the header’s own');
    assert.equal(core(safe.stdout).SeatmapVenues.get('evil').seatmap.sections[0].label, '</script><b>');
  } finally { fs.rmSync(hostile, {recursive: true, force: true}); }
  const F = core(run.stdout);
  assert.deepEqual(plain(F.SeatmapVenues.get('csv-hall').seatmap.landmarks), [{id: 'b', label: 'home: bench', x: 400, y: 322}]);
  assert.equal(F.SeatmapVenues.get('csv-hall').seatmap.geometry, 'bowl');
  assert.deepEqual(plain(F.validate(F.normalize(diagram({id: 'map', type: 'seatmap', venue: 'csv-hall'})))), {errors: [], warnings: []});
});

test('paths geometry draws an optional rink outline with centre and blue lines; bad or misplaced outlines warn', () => {
  const venue = C.SeatmapVenues.get('ubs-arena').seatmap;
  const html = C.seatmapHTML({id: 'map', type: 'seatmap', venue: 'ubs-arena'}, {});
  assert.match(html, /<path class="seatmap-field" d="M361\.5,326\.6L616\.4,326\.6A49\.5,49\.5 0 0 1 665\.9,376\.1L/);
  assert.equal((html.match(/class="seatmap-field-line" d="(M[\d.]+,326\.6L[\d.]+,477){3}"/g) || []).length, 1);
  const noField = C.seatmapHTML({id: 'map', type: 'seatmap', venue: 'ubs-arena', field: {shape: 'oval', x: 1, y: 1, width: 50, height: 50}}, {});
  assert.doesNotMatch(noField, /seatmap-field/);
  const warn = field => validate(diagram({id: 'map', type: 'seatmap', venue: 'ubs-arena', field})).warnings;
  assert.ok(warn({shape: 'rink', x: 900, y: 10, width: 200, height: 50}).some(w => /\.field: expected \{"shape":"rink"/.test(w)));
  assert.ok(warn({shape: 'rink', x: 'a', y: 10, width: 200, height: 50}).length === 1);
  assert.deepEqual(warn({shape: 'rink', x: 0, y: 0, width: 1000, height: 804}), []);
  const bowl = validate(diagram({id: 'map', type: 'seatmap', venue: 'ubs-arena', geometry: 'bowl', bowl: 'rink', sections: venue.sections.map(s => ({id: s.id, ring: s.ring, capacity: s.capacity, zone: s.zone}))})).warnings;
  assert.ok(bowl.some(w => /\.field: only used by geometry "paths" — ignored/.test(w)));
  // A changed outline forces a full re-render instead of an in-place patch.
  const a = C.seatmapModel({id: 'map', type: 'seatmap', venue: 'ubs-arena'}, {});
  const b = C.seatmapModel({id: 'map', type: 'seatmap', venue: 'ubs-arena', field: {...venue.field, x: 300}}, {});
  assert.notEqual(a.geometryKey, b.geometryKey);
});

test('existing inline declarations render byte-identically to main, and the venue example equals its inline expansion', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/seatmap-inline-example.spec.json'), 'utf8'));
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/seatmap-inline-example.renders.json'), 'utf8'));
  assert.deepEqual(seatmapRenders(C, fixture).map(r => r.sha256), golden, 'the pre-venue example (inline bowl) renders exactly as on main');
  const spec = JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'));
  const panel = examplePanel(spec);
  assert.equal(panel.venue, 'ubs-arena');
  for (const key of C.SeatmapVenues.fields) assert.equal(key in panel, false, key + ' comes from the venue');
  const expanded = JSON.parse(JSON.stringify(spec));
  Object.assign(examplePanel(expanded), plain(C.SeatmapVenues.get('ubs-arena').seatmap));
  delete examplePanel(expanded).venue;
  assert.deepEqual(seatmapRenders(C, spec), seatmapRenders(C, expanded));
  assert.equal(seatmapRenders(C, spec).length, 15);
  assert.deepEqual(validate(spec), {errors: [], warnings: []});
  const raw = fs.readFileSync(EXAMPLE, 'utf8');
  assert.doesNotMatch(raw, /"229"/);
  assert.match(raw, /UBS Arena, Elmont, NY/);
  assert.doesNotMatch(raw, /generic rink bowl/);
});

test('venue file comments reduce names and input file names to plain characters', async () => {
  const {venueSource} = await import(TOOL);
  const text = venueSource({id: 'x', name: 'A */ </script>', location: 'B\nC', seatmap: {rings: [], sections: [{label: '</script>'}]}}, 'in</script><img src=x>*/.svg');
  const header = text.slice(0, text.indexOf('SeatmapVenues.define('));
  assert.doesNotMatch(header, /[<>]/, header);
  assert.equal(header.match(/\*\//g).length, 1, header);
  assert.equal(header.split('\n').length, 4, header);
  assert.doesNotMatch(text, /<\/script/i);
});
