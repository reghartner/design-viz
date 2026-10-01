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

const NORMAL = ['bedtime','raccoon-detected','raccoon','raccoon-saved','lowbatt','sunrise','charging','a-motion-detected','a-courier','a-upload','a-alert','a-open'];
const WIFI = ['bedtime','raccoon-detected','raccoon','raccoon-saved','lowbatt','sunrise','charging','b-wifi-down','b-motion-detected','b-courier','b-retry','b-reconnect','b-late-alert'];
/* [mode, effective scene] per step; scene matters only while a clip is shown. */
const EXPECTED = {
  normal:[['off'],['off'],['rec','raccoon-at-night'],['save','raccoon-at-night'],['off'],['off'],['off'],
    ['off'],['rec','package-drop'],['save','package-drop'],['off'],['playing','package-drop']],
  'wifi-down':[['off'],['off'],['rec','raccoon-at-night'],['save','raccoon-at-night'],['off'],['off'],['off'],
    ['off'],['off'],['rec','package-drop'],['save','package-drop'],['save','package-drop'],['off']]
};
/* Home camera = the independent motion sensor: always sensing, detect before each recording. */
const SENSOR = {
  normal:['scan','detect','rec','scan','scan','scan','scan','detect','rec','scan','scan','scan'],
  'wifi-down':['scan','detect','rec','scan','scan','scan','scan','scan','detect','rec','scan','scan','scan']
};
const DETECT_THEN_RECORD = [['raccoon-detected','raccoon','raccoon'],['a-motion-detected','a-courier','courier'],['b-motion-detected','b-courier','courier']];
const camState = v => typeof v === 'string' ? v : v && v.state;
const step = id => d.steps.find(s => s.id === id);

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
  // Each detection shares its recording beat's minute; every other anchor is unchanged.
  assert.deepEqual(plain(d.steps.map(s => [s.id, s.time || null])), [
    ['bedtime','2026-10-01T22:30'],['raccoon-detected','2026-10-02T01:04'],['raccoon','2026-10-02T01:04'],['raccoon-saved','+1m'],
    ['lowbatt','2026-10-02T04:00'],['sunrise','2026-10-02T06:50'],['charging','2026-10-02T07:00'],
    ['a-motion-detected','2026-10-02T08:12'],['a-courier','2026-10-02T08:12'],['a-upload',null],
    ['a-alert',null],['a-open','08:13'],['b-wifi-down','2026-10-02T08:08'],['b-motion-detected','08:12'],['b-courier','08:12'],['b-retry','08:20'],
    ['b-reconnect','08:22'],['b-late-alert',null]]);
  assert.deepEqual(Object.keys(d.nodes), ['cam','router','ingest','clips','classifier','shadow','notify','push','phone']);
  assert.equal(d.edges.length, 12);
  assert.deepEqual(plain(d.panels.map(p => [p.id, p.type])), [['home','homemap'],['batt','battery'],['app','deviceapp'],['pkgclip','screen']]);
  const otherPanels = Object.fromEntries(d.steps.map(s => [s.id, Object.keys(s.panels || {}).filter(k => k !== 'pkgclip')]));
  assert.deepEqual(otherPanels, {
    bedtime:['home','app'], 'raccoon-detected':['home','batt','app'], raccoon:['home'], 'raccoon-saved':['home'], lowbatt:['home','batt','app'],
    sunrise:['home','batt','app'], charging:['home','app'], 'a-motion-detected':['home','app'], 'a-courier':['home','batt'], 'a-upload':['home'],
    'a-alert':['home','app'], 'a-open':['home','app'], 'b-wifi-down':['home','app'], 'b-motion-detected':['home'], 'b-courier':['home','batt'],
    'b-retry':['home'], 'b-reconnect':['home','app'], 'b-late-alert':['home','app']});
  const cam = Object.fromEntries(d.steps.filter(s => s.panels.home.cam).map(s => [s.id, s.panels.home.cam]));
  assert.deepEqual(cam, {'raccoon-detected':'detect',raccoon:'rec','raccoon-saved':'scan',lowbatt:'scan','a-motion-detected':'detect',
    'a-courier':'rec','a-upload':'scan','a-alert':'scan','b-motion-detected':'detect','b-courier':'rec','b-retry':'scan','b-late-alert':'scan'});
  assert.equal(d.panels[0].initial.cam, 'scan');
  const notes = d.steps.filter(s => s.panels.app && s.panels.app.notify).map(s => [s.id, s.panels.app.notify.title]);
  assert.deepEqual(notes, [['lowbatt','Porch Cam battery low'],['a-alert','Package delivered at front door'],['b-late-alert','Package delivered at front door']]);
  const battery = d.panels.find(p => p.id === 'batt');
  assert.equal(battery.initial.charge, 25);assert.equal(battery.drainPerHour, 1);assert.equal(battery.chargePerHour, 3);
  assert.equal(step('lowbatt').panels.batt.charge, 20);
  // The unknown overnight level starts at the first 1:04 beat, so no computed charge is ever shown.
  assert.deepEqual(plain(step('raccoon-detected').panels.batt), {charge:null, note:'Level not specified until 4:00 AM'});
  const drains = d.steps.filter(s => s.panels.batt && 'drain' in s.panels.batt).map(s => [s.id, s.panels.batt.drain]);
  assert.deepEqual(drains, [['a-courier',1],['b-courier',1]], 'one clip debit per package recording, none on detection');
  const reports = d.steps.filter(s => s.panels.app && s.panels.app.battery).map(s => [s.id, s.panels.app.battery.value, s.panels.app.battery.reportedAt]);
  assert.deepEqual(reports, [['bedtime',25,'now'],['raccoon-detected',null,'01:00'],['lowbatt',20,'now'],['sunrise',18,'06:30'],
    ['charging',18,'now'],['a-motion-detected',21,'08:00'],['b-wifi-down',21,'08:00'],['b-reconnect',21,'now']]);
  const open = step('a-open').panels.app;
  assert.equal(open.clip.value, 'Package clip, 8:12 AM');assert.equal(open.timeline.value, '8:12 AM Package · 1:04 AM Animal');
});

test('motion sensing never stops, and each detection is its own local beat right before recording', () => {
  for (const [id, steps] of [['normal', NORMAL], ['wifi-down', WIFI]]){
    const path = C.diagramForPath(d, id), folded = C.foldPanelStates(path);
    assert.deepEqual(Array.from(folded.home, s => camState(s.cam)), SENSOR[id], id + ' sensor states');
    assert.ok(Array.from(folded.home).every(s => ['scan','detect','rec'].includes(camState(s.cam))), id + ': cone shown on every step');
    for (const [detected, recording, subject] of DETECT_THEN_RECORD){
      const i = steps.indexOf(detected);
      if (i < 0) continue;
      assert.equal(steps[i + 1], recording, id + ': ' + detected + ' immediately precedes ' + recording);
      const [seen, rec] = [folded.pkgclip[i], folded.pkgclip[i + 1]];
      assert.equal(seen.mode, 'off', detected + ': recorder still in STANDBY');
      assert.doesNotMatch(html(seen), /recchip|class="scene/, detected + ': no REC and no clip');
      assert.equal(rec.mode, 'rec', recording + ': recording starts');
      assert.ok(html(rec).includes(C.SCENES[subject === 'raccoon' ? 'raccoon-at-night' : 'package-drop']), recording + ' clip');
      assert.ok(folded.home[i][subject] && folded.home[i + 1][subject], subject + ' visible on both beats');
      assert.equal(folded.home[i].package || null, null, detected + ': package appears only on delivery');
      const beat = step(detected);
      assert.deepEqual(plain(beat.nodes), ['cam']);
      for (const key of ['edge','edges','failures','tone']) assert.equal(beat[key], undefined, detected + ' is local: no ' + key);
      assert.ok(!beat.panels.batt || !('drain' in beat.panels.batt), detected + ': no clip debit');
      assert.ok(!beat.panels.app || !beat.panels.app.notify, detected + ': no alert');
      assert.equal(beat.panels.pkgclip, undefined, detected + ': screen carries STANDBY');
      assert.equal(beat.time, step(recording).time, detected + ' keeps the event minute');
    }
    // After each recording the sensor goes back to scanning, not sleep or off.
    for (const recording of ['raccoon','a-courier','b-courier']){
      const i = steps.indexOf(recording);
      if (i >= 0) assert.equal(camState(folded.home[i + 1].cam), 'scan', id + ': after ' + recording);
    }
  }
  // The shared raccoon detection and recording sequence appears on both paths.
  for (const path of d.paths) assert.deepEqual(plain(path.steps.slice(1, 4)), ['raccoon-detected','raccoon','raccoon-saved']);
});

test('ledger current sections carry no stale hidden-screen or save-as-playback claims', () => {
  const ledger = fs.readFileSync(path.join(DIR, 'story.ledger.md'), 'utf8');
  const current = ledger.split('## History (superseded)')[0];
  assert.ok(ledger.includes('## History (superseded)'), 'historical notes are marked as superseded');
  for (const stale of [/shown only at a-open/, /visible:\s*false/, /pkgclip\.mode\s*=\s*save/, /panelVisibility pkgclip/,
    /hidden; shown only/, /no recorded-media mode/, /cam sleep/, /camera asleep/])
    assert.doesNotMatch(current, stale);
  assert.match(current, /mode playing/);
  assert.match(current, /raccoon-at-night/);
  for (const id of ['raccoon-detected','a-motion-detected','b-motion-detected']) assert.match(current, new RegExp('### ' + id + ' '));
  assert.match(current, /continuous motion sensing/i);
  assert.ok(fs.existsSync(path.join(DIR, 'README.md')));
});
