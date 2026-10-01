'use strict';
const {readSource} = require('../tools/source-loader.cjs');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const C = {};
vm.runInNewContext(['validator.js', 'engine.js', 'builder.workbench.js'].map(f => readSource(f)).join('\n'), C);
const DIR = path.join(ROOT, 'examples/kestrel-overnight');
const raw = JSON.parse(fs.readFileSync(path.join(DIR, 'story.spec.json'), 'utf8'));
const d = raw.page.blocks[0].diagram;
const screen = d.panels.find(p => p.id === 'pkgclip');
const plain = v => JSON.parse(JSON.stringify(v));
function host(){
  const box = {className:'', querySelectorAll(){return [];}, insertAdjacentHTML(){}};
  return {html:'', set innerHTML(v){this.html = v;}, get innerHTML(){return this.html;},
    querySelector(s){return s === '.screenbox' ? box : null;}};
}
function html(state){ const h = host(); C.renderPanelBody(h, screen, state, 'aurora'); return h.innerHTML; }

const NORMAL = ['bedtime','raccoon','raccoon-saved','lowbatt','sunrise','charging','a-courier','a-upload','a-alert','a-open'];
const WIFI = ['bedtime','raccoon','raccoon-saved','lowbatt','sunrise','charging','b-wifi-down','b-courier','b-retry','b-reconnect','b-late-alert'];
/* [mode, effective scene] per step; scene matters only while a clip is shown. */
const EXPECTED = {
  normal:[['off'],['rec','raccoon-at-night'],['save','raccoon-at-night'],['off'],['off'],['off'],
    ['rec','package-drop'],['save','package-drop'],['off'],['playing','package-drop']],
  'wifi-down':[['off'],['rec','raccoon-at-night'],['save','raccoon-at-night'],['off'],['off'],['off'],
    ['off'],['rec','package-drop'],['save','package-drop'],['save','package-drop'],['off']]
};

test('Kestrel demo validates and keeps one persistent camera screen', () => {
  const result = C.validate(C.normalize(plain(raw)));
  assert.equal(result.errors.length, 0, result.errors.join('; '));
  assert.deepEqual(Array.from(result.warnings).filter(w => /pkgclip|scene|mode/.test(w)), []);
  assert.equal(d.panels.filter(p => p.type === 'screen').length, 1, 'one screen tile, not several');
  assert.equal(screen.visible, undefined);
  assert.ok(d.steps.every(s => !s.panelVisibility), 'no step hides or reveals panels');
  for (const id of ['normal','wifi-down']){
    const visible = C.foldPanelVisibility(C.diagramForPath(d, id)).pkgclip;
    assert.equal(visible.length, id === 'normal' ? NORMAL.length : WIFI.length);
    assert.ok(visible.every(Boolean), id + ': screen visible on every step');
  }
});

test('screen lifecycle is honest on both paths: REC, saves, STANDBY and real playback only at a-open', () => {
  for (const [id, steps] of [['normal', NORMAL], ['wifi-down', WIFI]]){
    const states = C.foldPanelStates(C.diagramForPath(d, id)).pkgclip;
    assert.equal(states.length, steps.length);
    states.forEach((state, i) => {
      const [mode, scene] = EXPECTED[id][i], at = id + '/' + steps[i];
      assert.equal(state.mode, mode, at);
      assert.notEqual(state.scenePlayback, 'waiting', at);
      const out = html(state);
      assert.match(out, new RegExp('screenbox m-' + mode + '(?: |")'), at);
      if (mode === 'off'){
        assert.match(out, /STANDBY/, at);
        assert.doesNotMatch(out, /class="scene/, at + ': no continuous live view');
      } else assert.ok(out.includes(C.SCENES[scene]), at + ' shows ' + scene);
      assert.equal(/class="ovl recchip"/.test(out), mode === 'rec', at);
      assert.equal(/PLAYING<\/span>/.test(out), mode === 'playing', at);
      assert.doesNotMatch(out, /livechip|activechip/, at);
    });
  }
  const open = C.foldPanelStates(C.diagramForPath(d, 'normal')).pkgclip.at(-1);
  assert.match(html(open), /<span class="ovl cliptitle">Package clip, 8:12 AM<\/span>/);
  assert.deepEqual(plain(d.steps.find(s => s.id === 'a-courier').panels.pkgclip), {mode:'rec', scene:null},
    'null returns to the declared package scene');
});

test('source facts, graph, battery/report values and notifications are unchanged', () => {
  assert.deepEqual(plain(d.paths.map(p => [p.id, p.steps])), [['normal', NORMAL], ['wifi-down', WIFI]]);
  assert.deepEqual(plain(d.steps.map(s => [s.id, s.time || null])), [
    ['bedtime','2026-10-01T22:30'],['raccoon','2026-10-02T01:04'],['raccoon-saved','+1m'],['lowbatt','2026-10-02T04:00'],
    ['sunrise','2026-10-02T06:50'],['charging','2026-10-02T07:00'],['a-courier','2026-10-02T08:12'],['a-upload',null],
    ['a-alert',null],['a-open','08:13'],['b-wifi-down','2026-10-02T08:08'],['b-courier','08:12'],['b-retry','08:20'],
    ['b-reconnect','08:22'],['b-late-alert',null]]);
  assert.deepEqual(Object.keys(d.nodes), ['cam','router','ingest','clips','classifier','shadow','notify','push','phone']);
  assert.equal(d.edges.length, 12);
  assert.deepEqual(plain(d.panels.map(p => [p.id, p.type])), [['home','homemap'],['batt','battery'],['app','deviceapp'],['pkgclip','screen']]);
  const otherPanels = Object.fromEntries(d.steps.map(s => [s.id, Object.keys(s.panels || {}).filter(k => k !== 'pkgclip')]));
  assert.deepEqual(otherPanels, {
    bedtime:['home','app'], raccoon:['home','batt','app'], 'raccoon-saved':['home'], lowbatt:['home','batt','app'],
    sunrise:['home','batt','app'], charging:['home','app'], 'a-courier':['home','batt','app'], 'a-upload':['home'],
    'a-alert':['home','app'], 'a-open':['home','app'], 'b-wifi-down':['home','app'], 'b-courier':['home','batt'],
    'b-retry':['home'], 'b-reconnect':['home','app'], 'b-late-alert':['home','app']});
  const cam = Object.fromEntries(d.steps.filter(s => s.panels.home.cam).map(s => [s.id, s.panels.home.cam]));
  assert.deepEqual(cam, {raccoon:'rec','raccoon-saved':'scan',lowbatt:'sleep','a-courier':'rec','a-upload':'scan',
    'a-alert':'sleep','b-courier':'rec','b-retry':'scan','b-late-alert':'sleep'});
  const notes = d.steps.filter(s => s.panels.app && s.panels.app.notify).map(s => [s.id, s.panels.app.notify.title]);
  assert.deepEqual(notes, [['lowbatt','Porch Cam battery low'],['a-alert','Package delivered at front door'],['b-late-alert','Package delivered at front door']]);
  const battery = d.panels.find(p => p.id === 'batt');
  assert.equal(battery.initial.charge, 25);assert.equal(battery.drainPerHour, 1);assert.equal(battery.chargePerHour, 3);
  assert.equal(d.steps.find(s => s.id === 'lowbatt').panels.batt.charge, 20);
  assert.equal(d.steps.find(s => s.id === 'raccoon').panels.batt.charge, null);
  const reports = d.steps.filter(s => s.panels.app && s.panels.app.battery).map(s => [s.id, s.panels.app.battery.value, s.panels.app.battery.reportedAt]);
  assert.deepEqual(reports, [['bedtime',25,'now'],['raccoon',null,'01:00'],['lowbatt',20,'now'],['sunrise',18,'06:30'],
    ['charging',18,'now'],['a-courier',21,'08:00'],['b-wifi-down',21,'08:00'],['b-reconnect',21,'now']]);
  const open = d.steps.find(s => s.id === 'a-open').panels.app;
  assert.equal(open.clip.value, 'Package clip, 8:12 AM');assert.equal(open.timeline.value, '8:12 AM Package · 1:04 AM Animal');
});

test('ledger current sections carry no stale hidden-screen or save-as-playback claims', () => {
  const ledger = fs.readFileSync(path.join(DIR, 'story.ledger.md'), 'utf8');
  const current = ledger.split('## History (superseded)')[0];
  assert.ok(ledger.includes('## History (superseded)'), 'historical notes are marked as superseded');
  for (const stale of [/shown only at a-open/, /visible:\s*false/, /pkgclip\.mode\s*=\s*save/, /panelVisibility pkgclip/,
    /hidden; shown only/, /no recorded-media mode/])
    assert.doesNotMatch(current, stale);
  assert.match(current, /mode playing/);
  assert.match(current, /raccoon-at-night/);
  assert.ok(fs.existsSync(path.join(DIR, 'README.md')));
});
