'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync, spawnSync} = require('node:child_process');
const {readSource} = require('../tools/source-loader.cjs');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools/seatmap-import.mjs');
const CSV = path.join(ROOT, 'examples/sports/arena-sections.csv');
const SVG = path.join(__dirname, 'fixtures/seatmap-chart.svg');
const SEED = path.join(ROOT, 'examples/sports/arena-sections.sections.json');
const importer = () => import(TOOL);
const C = {URL, TextEncoder, console};
vm.createContext(C);
vm.runInContext(readSource('validator.js'), C);
const plain = value => JSON.parse(JSON.stringify(value));

function cli(args) {
  const run = spawnSync(process.execPath, [TOOL, ...args], {cwd: ROOT, encoding: 'utf8'});
  return {code: run.status, stdout: run.stdout, stderr: run.stderr};
}
function validates(fragment, initial) {
  const d = {nodes:{n:{}}, rows:[['n']], panels:[Object.assign({id:'map', type:'seatmap'}, fragment, {capacityNote: undefined}, initial ? {initial} : {})]};
  delete d.panels[0].capacityNote;
  return plain(C.validate(C.normalize(d)));
}

test('the seed CSV imports to a rink bowl with one ring per level, zoned sections in file order, an illustrative capacity split and a note', () => {
  const run = cli([CSV, '--capacity-total', '17250']);
  assert.equal(run.code, 0, run.stderr);
  const fragment = JSON.parse(run.stdout);
  assert.equal(fragment.geometry, 'bowl');
  assert.equal(fragment.bowl, 'rink');
  assert.equal(fragment.ringSlots, undefined);
  assert.deepEqual(fragment.rings, [{id:'100-level',label:'100 level'},{id:'200-level',label:'200 level'},{id:'300-level',label:'300 level'}]);
  assert.equal(fragment.sections.length, 80);
  assert.equal(fragment.sections.reduce((sum, s) => sum + s.capacity, 0), 17250);
  assert.equal(fragment.capacityNote, 'illustrative even split');
  assert.deepEqual(fragment.sections[0], {id:'101', ring:'100-level', capacity:216, zone:'end'});
  assert.ok(fragment.sections.every(s => s.slot === undefined && s.span === undefined), 'zones, not slots, place the sections');
  assert.deepEqual(fragment.sections.filter(s => s.ring === '100-level').map(s => s.id), ['101','102','103','104','105','106','107','108','109','110','111','112','113','114','115','116','117','118','119','120','121']);
  assert.equal(fragment.sections.filter(s => s.ring === '200-level').length, 33);
  assert.equal(fragment.sections.find(s => s.id === '113').zone, 'club');
  assert.match(run.stderr, /rings: 3 \(100 level: 21, 200 level: 33, 300 level: 26\)/);
  assert.match(run.stderr, /sections: 80 of 80 rows · placed by zone\n/);
  assert.match(run.stderr, /capacities: 0 given, 80 filled as an illustrative even split of 17250/);
  assert.match(run.stderr, /skipped: none/);
  assert.deepEqual(validates(fragment), {errors:[], warnings:[]});
  assert.deepEqual(JSON.parse(fs.readFileSync(SEED, 'utf8')), fragment, 'the committed seed declaration is the importer output');
  const model = C.seatmapModel(Object.assign({id:'map', type:'seatmap'}, fragment), {});
  const by = Object.fromEntries(model.sections.map(s => [s.id, s]));
  assert.ok(by['103'].x < by['104'].x && by['104'].x < by['105'].x && by['104'].y < 385, '103–105 run left to right along the top sideline');
  assert.ok(by['109'].x > 650 && Math.abs(by['109'].y - 385) < 40 && by['107'].y < by['109'].y && by['109'].y < by['111'].y, '107–111 run down the right end');
  assert.ok(by['101'].x < 330 && by['120'].x < 330 && by['101'].y < by['120'].y, '101 and 118–121 share the left end, 101 nearer the top');
  assert.ok(by['114'].y > 385 && by['115'].y > 385, 'club sections 113–116 take the bottom sideline');
});

test('without --capacity-total blank capacities become 1 and the note says so; --out writes the file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seatmap-import-'));
  try {
    const out = path.join(dir, 'out.json');
    const run = cli([CSV, '--out', out]);
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.stdout, '');
    const fragment = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.ok(fragment.sections.every(s => s.capacity === 1));
    assert.equal(fragment.capacityNote, 'capacities defaulted to 1 (no --capacity-total given)');
    assert.match(run.stderr, /80 defaulted to 1 \(no --capacity-total\)/);
    assert.match(run.stderr, /output: .*out\.json/);
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
  const {evenSplit} = await importer();
  assert.deepEqual(evenSplit(10, 4), [3,3,2,2]);
  const split = evenSplit(17250, 80);
  assert.equal(split.length, 80); assert.equal(split[49], 216); assert.equal(split[50], 215); assert.equal(split.reduce((a, b) => a + b, 0), 17250);
  assert.throws(() => evenSplit(3, 4), /at least 4/);
});

test('CSV rows with bad ids, duplicate ids, bad capacities or missing columns are reported, never guessed', async () => {
  const {importCsv, formatReport} = await importer();
  const {fragment, report} = importCsv('id,level,zone,capacity,label,extra\n101,Lower,end,,Row A,x\n101,Lower,end,10,,\n1 02,Lower,end,,,\n103,Lower,"end, far",abc,,\n104,Upper,' + 'z'.repeat(30) + ',12,,\n\n', {capacityTotal: 100});
  assert.deepEqual(fragment.sections.map(s => s.id), ['101','104']);
  assert.equal(fragment.sections[0].capacity, 100);
  assert.equal(fragment.sections[0].label, 'Row A');
  assert.equal(fragment.sections[1].zone.length, 24);
  assert.equal(fragment.bowl, 'rink');
  assert.deepEqual(report.skipped.map(s => [s.line, s.id, s.reason]), [
    [3, '101', 'duplicate id'],
    [4, '1 02', 'id must be letters/digits/-/_ starting with a letter or digit'],
    [5, '103', 'capacity must be a whole number ≥ 1 or blank'],
    [6, '104', 'zone longer than 24 characters — truncated'],
  ]);
  assert.deepEqual(report.extraColumns, ['extra']);
  assert.throws(() => importCsv('id,level,capacity\n1,a,1'), /missing "zone"/);
  assert.throws(() => importCsv('id,level,zone,capacity\n' + ['a','b','c','d','e'].map((l, i) => `${i + 1},${l},end,1`).join('\n')), /more than 4 distinct levels/);
  assert.throws(() => importCsv('id,level,zone,capacity\n'), /no usable rows/);
  const zoneless = importCsv('id,level,zone,capacity\n1,Lower,,10\n2,Lower,,10\n3,Lower,,10\n4,Lower,mezzanine,10\n', {});
  assert.deepEqual(zoneless.report.zoneless, ['1','2','3','4']);
  assert.ok(zoneless.fragment.sections.every(s => s.zone === undefined || s.zone === 'mezzanine'));
  assert.deepEqual(validates(zoneless.fragment).errors, []);
  assert.match(formatReport(zoneless.report, 'x.csv'), /4 without a recognised zone \(sideline\/corner\/end\/club\): 1, 2, 3, 4/);
  const run = cli([CSV, '--capacity-total', '5']);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /--capacity-total must be a whole number of at least 80/);
});

test('the SVG fixture imports shapes and transforms, skips what it cannot prove, and never passes markup through', () => {
  const run = cli([SVG, '--level-map', '1:100 level,2:200 level']);
  assert.equal(run.code, 0, run.stderr);
  const fragment = JSON.parse(run.stdout);
  assert.equal(fragment.geometry, 'paths');
  assert.deepEqual(fragment.viewBox, {width:1000, height:556});
  assert.deepEqual(fragment.rings, [{id:'1',label:'100 level'},{id:'2',label:'200 level'}]);
  assert.deepEqual(fragment.sections.map(s => s.id), ['101','102','103','201A','202','204','205','207']);
  const by = Object.fromEntries(fragment.sections.map(s => [s.id, s]));
  assert.equal(by['101'].path, 'M0 0L222.2 0L222.2 111.1L0 111.1Z', 'relative path under translate+scale');
  assert.equal(by['101'].capacity, 480); assert.equal(by['101'].zone, 'end');
  assert.equal(by['102'].path, 'M277.8 0L500 0L500 111.1L277.8 111.1Z', 'polygon');
  assert.equal(by['103'].path, 'M555.6 0L777.8 0L777.8 111.1L555.6 111.1Z', 'rect via data-section');
  assert.match(by['201A'].path, /^M13\.9 333\.3A69\.4 69\.4 0 1 0 152\.8 333\.3A69\.4 69\.4 0 1 0 13\.9 333\.3Z$/, 'circle under a matrix');
  assert.match(by['204'].path, /^M666\.7 277\.8C/, 'cubic path');
  assert.match(by['207'].path, /Q/, 'quadratic path under a skewing matrix is fine without arcs');
  assert.equal(by['201A'].capacity, 1); assert.equal(by['205'].capacity, 1);
  assert.equal(fragment.capacityNote, 'capacities defaulted to 1 (no --capacity-total given)');
  assert.doesNotMatch(run.stdout, /<|script|alert|onclick|javascript/);
  for (const s of fragment.sections) assert.ok(!C.spmParsePath(s.path, {range:[0,1000]}).error, s.id);
  assert.deepEqual(validates(fragment), {errors:[], warnings:[]});
  const report = run.stderr;
  assert.match(report, /sections found: 8 \(path 4, polygon 1, rect 2, circle 1\)/);
  assert.match(report, /rings: 1 "100 level": 3, 2 "200 level": 5 · from level-map groups, else leading digits/);
  assert.match(report, /capacities: 4 from data-capacity, 4 defaulted to 1/);
  assert.match(report, /ignored: <style>, <script>/);
  assert.match(report, /skipped: 9 elements/);
  for (const line of [
    '<path> "105" — inside <defs>; templates are never placed',
    '<rect> "ice" — id does not look like a section id',
    '<path> "203" — unsupported transform skewX(20) on <g>',
    '<path> "205" — data-capacity "12abc" is not a whole number ≥ 1 — capacity defaulted',
    '<path> "206" — unsupported transform rotate(10) on <path id="206">',
    '<path> "208" — non-finite number in transform translate on <path id="208">',
    '<path> "209" — path unsupported path command "o"',
  ]) assert.ok(report.includes(line), line + '\n' + report);
});

test('rings are inferred from leading digits without a level map; a level map names them; parseTransform composes only translate, scale and matrix', async () => {
  const {importSvg, parseTransform, parseLevelMap} = await importer();
  const inferred = importSvg(fs.readFileSync(SVG, 'utf8'));
  assert.deepEqual(inferred.fragment.rings, [{id:'1',label:'Level 1'},{id:'2',label:'Level 2'}]);
  assert.equal(inferred.report.ringSource, 'leading digits of each section id');
  const grouped = importSvg('<svg><g id="club"><rect id="7" x="0" y="0" width="10" height="10"/></g><rect id="1203" x="20" y="0" width="10" height="10"/></svg>', {levelMap: 'club:Club level,12:Twelve'});
  assert.deepEqual(grouped.fragment.rings, [{id:'12',label:'Twelve'},{id:'club',label:'Club level'}]);
  assert.deepEqual(grouped.fragment.sections.map(s => [s.id, s.ring]), [['7','club'],['1203','12']]);
  assert.throws(() => parseLevelMap('nolabel'), /key:label/);
  assert.deepEqual(parseTransform('translate(10 20) scale(2)').matrix, [2,0,0,2,10,20]);
  assert.deepEqual(parseTransform('matrix(1 0 0 1 5 6), translate(1,1)').matrix, [1,0,0,1,6,7]);
  assert.match(parseTransform('rotate(45)').error, /unsupported transform rotate/);
  assert.match(parseTransform('skewY(3)').error, /unsupported transform skewY/);
  assert.match(parseTransform('scale(1 2 3)').error, /unsupported transform scale/);
  assert.match(parseTransform('translate(1) junk').error, /unreadable transform/);
  assert.throws(() => importSvg('<svg><path id="deco" d="M0 0 L1 1"/></svg>'), /no section elements found/);
  const sized = importSvg('<svg><rect id="101" width="4" height="2"/><rect id="102" x="4" width="4" height="2"/></svg>', {capacityTotal: 7});
  assert.deepEqual(sized.fragment.viewBox, {width:1000, height:250});
  assert.deepEqual(sized.fragment.sections.map(s => s.capacity), [4,3]);
  assert.equal(sized.fragment.capacityNote, 'illustrative even split');
});

test('oversized output is refused and unknown options fail with usage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seatmap-import-'));
  try {
    let svg = '<svg>';
    for (let i = 0; i < 160; i++) {
      let d = 'M' + (i * 10) + ' 0';
      for (let k = 0; k < 400; k++) d += ' L' + (i * 10 + (k % 10)) + ' ' + (k % 7) + '.123456';
      svg += '<path id="' + (100 + i) + '" d="' + d + ' Z"/>';
    }
    const big = path.join(dir, 'big.svg');
    fs.writeFileSync(big, svg + '</svg>');
    const run = cli([big, '--out', path.join(dir, 'big.json')]);
    assert.equal(run.code, 1);
    assert.match(run.stderr, /refusing to write \d+ KiB; the limit is 512 KiB/);
    assert.ok(!fs.existsSync(path.join(dir, 'big.json')));
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
  const usage = cli([]);
  assert.equal(usage.code, 2); assert.match(usage.stderr, /usage: node tools\/seatmap-import\.mjs/);
  const unknown = cli([CSV, '--bogus']);
  assert.equal(unknown.code, 2); assert.match(unknown.stderr, /unknown option --bogus/);
  const missing = cli([path.join(ROOT, 'nope.csv')]);
  assert.equal(missing.code, 2); assert.match(missing.stderr, /cannot read/);
});
