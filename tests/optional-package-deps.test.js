'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const probe = String.raw`
const fs = require('node:fs'), vm = require('node:vm');
const loader = require('./tools/source-loader.cjs');
const C = {URL, TextEncoder, console};
vm.createContext(C);
vm.runInContext(loader.readSource('validator.js'), C);
const types = ['grid', 'funnel', 'seatmap', 'sequence'].filter(type => C.PanelRegistry.get(type));
const files = process.argv.slice(1);
const reports = files.map(file => {
  const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = C.validate(C.normalize(spec));
  return {file, errors:result.errors, warnings:result.warnings};
});
process.stdout.write(JSON.stringify({packages:loader.enabledPackages(), types, reports}));
`;

function run(selection, files = []) {
  const result = spawnSync(process.execPath, ['-e', probe, ...files], {
    cwd: root, encoding:'utf8', maxBuffer:16*1024*1024,
    env:{...process.env, FLOWVIEW_COMPANY_IDENTITY:'off', FLOWVIEW_PACKAGES:selection},
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test('default core retains generic panels and excludes domain panels', () => {
  const result = run('');
  assert.deepEqual(result.packages, []);
  assert.deepEqual(result.types, ['grid','funnel']);
});

test('sports alone validates the full season story without science sources or unknown panel types', () => {
  const story = 'packages/sports/diagrams/season-of-seats/season-of-seats.spec.json';
  assert.ok(fs.existsSync(path.join(root, story)));
  const result = run('sports', [story]);
  assert.deepEqual(result.packages, ['sports']);
  assert.deepEqual(result.types, ['grid','funnel','seatmap']);
  assert.deepEqual(result.reports[0].errors, []);
  assert.deepEqual(result.reports[0].warnings, []);
});

test('science alone uses core generic panels and validates the sequencing starter', () => {
  const result = run('science', ['packages/science/starters/sequencing-walkthrough.json']);
  assert.deepEqual(result.packages, ['science']);
  assert.deepEqual(result.types, ['grid','funnel','sequence']);
  assert.deepEqual(result.reports[0].errors, []);
  assert.deepEqual(result.reports[0].warnings, []);
});

test('combined selection retains one core definition of each generic panel and validates both domain stories', () => {
  const result = run('science,sports', [
    'packages/science/starters/sequencing-walkthrough.json',
    'packages/sports/diagrams/season-of-seats/season-of-seats.spec.json',
  ]);
  assert.deepEqual(result.packages, ['science','sports']);
  assert.deepEqual(result.types, ['grid','funnel','seatmap','sequence']);
  for (const report of result.reports) {
    assert.deepEqual(report.errors, [], report.file);
    assert.deepEqual(report.warnings, [], report.file);
  }
});

test('published standalone stories contain only their selected package runtime', () => {
  const exports = [
    ['packages/science/diagrams/biology/cell-journey/biology-teaching.html', 'science', 'sports'],
    ['packages/science/diagrams/biology/copy-gate/copy-gate.html', 'science', 'sports'],
    ['packages/science/diagrams/physics/waves-and-forces/waves-and-forces.html', 'science', 'sports'],
    ['packages/science/examples/membrane-signal/membrane-signal.html', 'science', 'sports'],
    ['packages/science/examples/strand-cut/strand-cut.html', 'science', 'sports'],
    ['packages/sports/diagrams/season-of-seats/season-of-seats.html', 'sports', 'science'],
    ['packages/sports/examples/venue-map.html', 'sports', 'science'],
  ];
  for (const [file, selected, excluded] of exports) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(html.includes(`/* ---- packages/${selected}/panels/`), `${file} lacks ${selected} runtime`);
    assert.ok(!html.includes(`/* ---- packages/${excluded}/panels/`), `${file} embeds ${excluded} runtime`);
    const embedded = html.match(/<script type="application\/json" id="flowspec">\s*([\s\S]*?)<\/script>/);
    assert.ok(embedded, `${file} lacks an embedded spec`);
    const specFile = file.replace(/\.html$/, '.spec.json');
    assert.deepEqual(JSON.parse(embedded[1]), JSON.parse(fs.readFileSync(path.join(root, specFile), 'utf8')),
      `${file} has a stale embedded spec`);
  }
});

test('validator CLI follows the current selection even after a different generated build', () => {
  const story = 'packages/science/starters/sequencing-walkthrough.json';
  const invoke = selection => spawnSync(process.execPath, ['tools/validate.js', story], {
    cwd:root, encoding:'utf8', env:{...process.env, FLOWVIEW_COMPANY_IDENTITY:'off', FLOWVIEW_PACKAGE_BASE:'', FLOWVIEW_PACKAGES:selection},
  });
  const core = invoke('');
  assert.equal(core.status, 0, core.stderr);
  assert.match(core.stdout, /unknown panel type "sequence"/);
  const science = invoke('science');
  assert.equal(science.status, 0, science.stderr);
  assert.doesNotMatch(science.stdout, /unknown panel type/);
  assert.match(science.stdout, /0 errors, 0 warnings/);
});

test('repository validator and authoring packet accept an external site config', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowview-site-config-'));
  const config = path.join(dir, 'science.json');
  const story = 'packages/science/starters/sequencing-walkthrough.json';
  try {
    fs.writeFileSync(config, JSON.stringify({packages:['science']}));
    const env = {...process.env, FLOWVIEW_COMPANY_IDENTITY:'off', FLOWVIEW_PACKAGE_BASE:'sports'};
    delete env.FLOWVIEW_PACKAGES;
    const validate = spawnSync(process.execPath, ['tools/validate.js', '--config', config, story], {
      cwd:root, encoding:'utf8', env,
    });
    assert.equal(validate.status, 0, validate.stderr || validate.stdout);
    assert.match(validate.stdout, /0 errors, 0 warnings/);
    const packet = spawnSync('python3', ['tools/authoring-packet.py', '--config', config, '--panel', 'cellscene'], {
      cwd:root, encoding:'utf8', env,
    });
    assert.equal(packet.status, 0, packet.stderr);
    assert.match(packet.stdout, /packages\/science\/cookbook\/cell-scenes\.md/);
    const widget = spawnSync('python3', ['tools/widget_doc.py', '--config', config, 'cellscene'], {
      cwd:root, encoding:'utf8', env,
    });
    assert.equal(widget.status, 0, widget.stderr);
    assert.match(widget.stdout, /`cellscene`/);
  } finally {
    fs.rmSync(dir, {recursive:true, force:true});
  }
});
