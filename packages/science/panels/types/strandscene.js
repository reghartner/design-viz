/* Strand scene: one or two lettered (or beaded) nucleotide strands with named
   sites and actors that scan, bind, cut, join, extend, pair and unwind them,
   step by step. A teaching cartoon: every position, actor, event and label
   is authored; nothing is simulated and no real organism, protein or virus
   is named by the panel. Shared palette, shapes and markup live in
   ../mech.js; this file owns the shared `.mech-*` CSS that cellscene reuses.
   Markup is always the settled end state of a step; motion is a description
   of how the DOM gets there (glide, transient, pulse, settle, patch). */
var SS_MIN_LETTERS = 6, SS_MAX_LETTERS = 60, SS_MAX_SITES = 8, SS_MAX_ACTORS = 6, SS_MAX_EVENTS = 4,
  SS_MAX_LABELS = 4, SS_MAX_EXTEND = 12, SS_MAX_EXTENDED = 24, SS_MAX_LABEL = 16, SS_MAX_CAPTION = 90,
  SS_STATES = ['free', 'scanning', 'binding', 'bound', 'active', 'released'],
  SS_EVENT_KINDS = ['cut', 'join', 'extend', 'pair', 'unwind', 'flash'],
  SS_STRANDS = ['upper', 'lower'],
  SS_STATE_KEYS = ['actors', 'events', 'camera', 'highlight', 'labels', 'caption', 'note', 'paired', 'enterOnce'],
  SS_FREE = { x: 470, y: 60 }, SS_UPPER_Y = 150, SS_LOWER_Y = 190, SS_SINGLE_Y = 170, SS_SPAN = 480, SS_PITCH = 19;
/* Declaration fields (sequence, strands, sites, actors, label, …) are read
   from the `panel` argument on every call; the model, renderer and fold
   cache nothing derived from them, so an engine-supplied declaration change
   at a step takes effect by itself. */
function ssBeads(panel) { return panel.beads === true; }
function ssAlphabet(panel) {
  var alphabet = bioAlphabet(panel.alphabet);
  return alphabet === 'protein' && !ssBeads(panel) ? 'dna' : alphabet;
}
function ssStrands(panel) { return panel.strands === 2 ? 2 : 1; }
function ssText(panel) { return seqText(panel, ssAlphabet(panel), SS_MAX_LETTERS); }
function ssSpan(panel) { return seqSpan(panel, ssAlphabet(panel), SS_MAX_LETTERS); }
/* Lower strand letters: explicit `lower` of the same length, else the
   reverse complement (beads: a numbered copy). */
function ssLowerText(panel, text) {
  var alphabet = ssAlphabet(panel);
  if (typeof panel.lower === 'string') {
    var lower = bioNormalizeSequence(panel.lower, alphabet).text;
    if (lower.length === text.length) return lower;
  }
  return alphabet === 'protein' ? text : bioReverseComplement(text, alphabet);
}
function ssCutPosition(value, span) {
  return bioPosition(value) && span.length > 1 && value >= span.first && value < span.last;
}
/* Clean sites within the span, in authored order; `cutAfter` defaults to a
   blunt cut after the site's middle letter. Mirrors ssSiteWarnings. */
function ssSites(panel, span) {
  var seen = Object.create(null), out = [];
  if (!Array.isArray(panel.sites) || !span.length) return out;
  panel.sites.slice(0, SS_MAX_SITES).forEach(function (site) {
    if (!panelObject(site) || typeof site.id !== 'string' || !site.id || seen[site.id]) return;
    var range = bioRange(site, '', null, span.first, span.last);
    if (!range) return;
    seen[site.id] = true;
    range = { from: Math.max(range.from, span.first), to: Math.min(range.to, span.last) };
    var mid = Math.max(span.first, Math.min(range.from + Math.floor((range.to - range.from) / 2), span.last - 1)), cut = panelObject(site.cutAfter) ? site.cutAfter : {};
    var upper = ssCutPosition(cut.upper, span) ? cut.upper : mid, lower = ssCutPosition(cut.lower, span) ? cut.lower : upper;
    out.push({ id: site.id, from: range.from, to: range.to, label: mechText(site.label, 40), tone: bioTone(site.tone, 'accent'), cutAfter: { upper: upper, lower: lower } });
  });
  return out;
}
/* Clean actors: unique letter-led ids, role via mechRole, start position. */
function ssActors(panel) {
  var seen = Object.create(null), out = [];
  if (!Array.isArray(panel.actors)) return out;
  panel.actors.slice(0, SS_MAX_ACTORS).forEach(function (actor) {
    if (!panelObject(actor) || !mechId(actor.id) || seen[actor.id]) return;
    seen[actor.id] = true;
    var role = mechRole(actor.role, 'protein'), start = panelObject(actor.start) ? actor.start : {};
    out.push({
      id: actor.id, role: role, shape: mechShape(actor.shape, role), size: mechSize(actor.size),
      label: typeof actor.label === 'string' ? actor.label.slice(0, SS_MAX_LABEL) : role,
      start: { at: ssCleanAt(start.at, ssSpan(panel)), state: SS_STATES.indexOf(start.state) >= 0 ? start.state : 'free' },
    });
  });
  return out;
}
/* An `at` is a strand coordinate within the span or a free {x, y}. */
function ssCleanAt(value, span) {
  if (bioPosition(value)) return span.length && value >= span.first && value <= span.last + SS_MAX_EXTENDED ? value : null;
  return mechXY(value, '', null);
}
function ssAtWarnings(value, at, warnings, span) {
  if (value === null) return;
  if (bioPosition(value)) {
    if (!(span.length && value >= span.first && value <= span.last + SS_MAX_EXTENDED))
      warnings.push(at + ': coordinate ' + value + ' lies outside ' + span.first + '–' + span.last + ' — ignored');
    return;
  }
  if (panelObject(value)) { mechXY(value, at, warnings); return; }
  warnings.push(at + ': expected a strand coordinate or {x, y} — ignored');
}
function ssSiteWarnings(panel, path, warnings, span) {
  if (panel.sites === undefined) return;
  if (!Array.isArray(panel.sites)) { warnings.push(path + '.sites: expected an array of {id,from,to,label?,tone?,cutAfter?} — ignored'); return; }
  if (panel.sites.length > SS_MAX_SITES) warnings.push(path + '.sites: only the first ' + SS_MAX_SITES + ' sites render');
  var seen = Object.create(null);
  panel.sites.slice(0, SS_MAX_SITES).forEach(function (site, i) {
    var at = path + '.sites[' + i + ']';
    if (!panelObject(site) || typeof site.id !== 'string' || !site.id) { warnings.push(at + '.id: needs a non-empty string — site skipped'); return; }
    if (seen[site.id]) warnings.push(at + '.id: duplicate id "' + site.id + '" — later site skipped');
    seen[site.id] = true;
    seqRangeWarnings(site, at, warnings, span);
    if (site.label != null && typeof site.label !== 'string') warnings.push(at + '.label: expected text — ignored');
    if (site.tone != null && BIO_TONES.indexOf(site.tone) < 0) warnings.push(at + '.tone: expected one of ' + BIO_TONES.join(' ') + ' — using accent');
    if (site.cutAfter !== undefined) {
      if (!panelObject(site.cutAfter)) warnings.push(at + '.cutAfter: expected {upper, lower?} — using a blunt cut after the middle letter');
      else ['upper', 'lower'].forEach(function (strand) {
        if (site.cutAfter[strand] !== undefined && !ssCutPosition(site.cutAfter[strand], span))
          warnings.push(at + '.cutAfter.' + strand + ': expected a coordinate between ' + span.first + ' and ' + (span.last - 1) + ' (the cut falls after that letter) — using the default');
      });
    }
  });
}
function ssActorWarnings(panel, path, warnings, span) {
  if (!Array.isArray(panel.actors)) { warnings.push(path + '.actors: needs 1–' + SS_MAX_ACTORS + ' entries with unique letter-led ids'); return; }
  if (panel.actors.length > SS_MAX_ACTORS) warnings.push(path + '.actors: only the first ' + SS_MAX_ACTORS + ' actors render');
  var seen = Object.create(null);
  panel.actors.slice(0, SS_MAX_ACTORS).forEach(function (actor, i) {
    var at = path + '.actors[' + i + ']';
    if (!panelObject(actor) || !mechId(actor.id)) { warnings.push(at + '.id: needs a letter-led id (letters, digits, _ or -) — actor skipped'); return; }
    if (seen[actor.id]) warnings.push(at + '.id: duplicate id "' + actor.id + '" — later actor skipped');
    seen[actor.id] = true;
    if (actor.role !== undefined && MECH_ROLE_NAMES.indexOf(actor.role) < 0) warnings.push(at + '.role: expected one of ' + MECH_ROLE_NAMES.join(' ') + ' — using protein');
    if (actor.shape !== undefined && MECH_SHAPE_NAMES.indexOf(actor.shape) < 0) warnings.push(at + '.shape: expected one of ' + MECH_SHAPE_NAMES.join(' ') + ' — using the role\'s shape');
    if (actor.size !== undefined && mechSize(actor.size) !== actor.size) warnings.push(at + '.size: expected s, m or l — using m');
    if (actor.label !== undefined && typeof actor.label !== 'string') warnings.push(at + '.label: expected text — using the role name');
    if (actor.start !== undefined) {
      if (!panelObject(actor.start)) warnings.push(at + '.start: expected {at?, state?} — ignored');
      else {
        if (actor.start.at !== undefined) ssAtWarnings(actor.start.at, at + '.start.at', warnings, span);
        if (actor.start.state !== undefined && SS_STATES.indexOf(actor.start.state) < 0) warnings.push(at + '.start.state: expected one of ' + SS_STATES.join(' ') + ' — using free');
      }
    }
  });
}
function ssSequenceWarnings(panel, path, warnings, alphabet) {
  var at = path + '.sequence';
  if (typeof panel.sequence !== 'string') { warnings.push(at + ': expected a string of ' + SS_MIN_LETTERS + '–' + SS_MAX_LETTERS + ' letters — panel renders empty'); return; }
  var normalized = bioNormalizeSequence(panel.sequence, alphabet);
  if (normalized.text.length < SS_MIN_LETTERS) warnings.push(at + ': expected ' + SS_MIN_LETTERS + '–' + SS_MAX_LETTERS + ' letters — ' + (normalized.text.length ? 'the short strand still renders' : 'panel renders empty'));
  else if (normalized.text.length > SS_MAX_LETTERS) warnings.push(at + ': only the first ' + SS_MAX_LETTERS + ' of ' + normalized.text.length + ' letters render');
  var invalid = normalized.invalid.filter(function (index) { return index < SS_MAX_LETTERS; });
  if (invalid.length) warnings.push(at + ': ' + invalid.length + (invalid.length === 1 ? ' letter is' : ' letters are') + ' not in the ' + alphabet + ' alphabet (letter ' +
    invalid.slice(0, 6).map(function (index) { return index + 1; }).join(', ') + (invalid.length > 6 ? ', …' : '') + ') — shown as unknown');
}
function strandsceneDeclarationWarnings(panel, path, warnings) {
  var alphabet = ssAlphabet(panel), span = ssSpan(panel);
  if (panel.beads !== undefined && typeof panel.beads !== 'boolean') warnings.push(path + '.beads: expected true or false — drawing letters');
  if (panel.alphabet !== undefined && BIO_ALPHABET_NAMES.indexOf(panel.alphabet) < 0) warnings.push(path + '.alphabet: expected dna, rna or protein — using dna');
  else if (panel.alphabet === 'protein' && !ssBeads(panel)) warnings.push(path + '.alphabet: protein needs beads:true — using dna');
  ssSequenceWarnings(panel, path, warnings, alphabet);
  if (panel.strands !== undefined && panel.strands !== 1 && panel.strands !== 2) warnings.push(path + '.strands: expected 1 or 2 — using 1');
  if (panel.lower !== undefined) {
    if (typeof panel.lower !== 'string') warnings.push(path + '.lower: expected letters for the lower strand — using the reverse complement');
    else {
      var lower = bioNormalizeSequence(panel.lower, alphabet);
      if (lower.text.length !== span.length) warnings.push(path + '.lower: expected ' + span.length + ' letters to match the sequence — using the reverse complement');
      else if (lower.invalid.length) warnings.push(path + '.lower: ' + lower.invalid.length + (lower.invalid.length === 1 ? ' letter is' : ' letters are') + ' not in the ' + alphabet + ' alphabet — shown as unknown');
    }
  }
  if (panel.start !== undefined && !seqValidStart(panel.start)) warnings.push(path + '.start: expected a safe integer ≥ 1 — using 1');
  if (panel.label !== undefined && typeof panel.label !== 'string') warnings.push(path + '.label: expected text — ignored');
  ssSiteWarnings(panel, path, warnings, span);
  ssActorWarnings(panel, path, warnings, span);
  strandscenePatchWarnings(panel.initial, path + '.initial', panel, warnings);
}
function ssEventWarnings(events, path, warnings, panel, span, sites) {
  if (events === null) return;
  if (!Array.isArray(events)) { warnings.push(path + ': expected an array of {kind, …} events — ignored'); return; }
  if (events.length > SS_MAX_EVENTS) warnings.push(path + ': only the first ' + SS_MAX_EVENTS + ' events play');
  var siteIds = sites.map(function (site) { return site.id; }), strands = ssStrands(panel), alphabet = ssAlphabet(panel);
  events.slice(0, SS_MAX_EVENTS).forEach(function (event, i) {
    var at = path + '[' + i + ']';
    if (!panelObject(event) || SS_EVENT_KINDS.indexOf(event.kind) < 0) { warnings.push(at + '.kind: expected one of ' + SS_EVENT_KINDS.join(' ') + ' — event ignored'); return; }
    if (event.kind === 'cut' || event.kind === 'join') {
      if (siteIds.indexOf(event.site) < 0) warnings.push(at + '.site: unknown site id — event ignored');
    } else if (event.kind === 'extend') {
      if (SS_STRANDS.indexOf(event.strand) < 0) warnings.push(at + '.strand: expected upper or lower — event ignored');
      else if (event.strand === 'lower' && strands !== 2) warnings.push(at + '.strand: lower needs strands:2 — event ignored');
      var letters = typeof event.letters === 'string' ? bioNormalizeSequence(event.letters, alphabet) : null;
      if (!letters || !letters.text.length || letters.text.length > SS_MAX_EXTEND) warnings.push(at + '.letters: expected 1–' + SS_MAX_EXTEND + ' letters — event ignored');
      else if (letters.invalid.length) warnings.push(at + '.letters: ' + letters.invalid.length + ' not in the ' + alphabet + ' alphabet — shown as unknown');
    } else if (event.kind === 'pair') {
      if (strands !== 2) warnings.push(at + ': pair needs strands:2 — event ignored');
    } else if (event.kind === 'unwind') {
      if (strands !== 2) warnings.push(at + ': unwind needs strands:2 — event ignored');
      else seqRangeWarnings(event, at, warnings, span);
    } else if (event.kind === 'flash') ssAtWarnings(event.at === undefined ? null : event.at, at + '.at', warnings, span);
  });
}
function ssLabelWarnings(labels, path, warnings, span) {
  if (labels === null) return;
  if (!Array.isArray(labels)) { warnings.push(path + ': expected an array of {at, text} callouts — ignored'); return; }
  if (labels.length > SS_MAX_LABELS) warnings.push(path + ': only the first ' + SS_MAX_LABELS + ' labels render');
  labels.slice(0, SS_MAX_LABELS).forEach(function (label, i) {
    var at = path + '[' + i + ']';
    if (!panelObject(label)) { warnings.push(at + ': expected {at, text} — label skipped'); return; }
    ssAtWarnings(label.at === undefined ? null : label.at, at + '.at', warnings, span);
    if (typeof label.text !== 'string' || !label.text) warnings.push(at + '.text: expected text — label skipped');
  });
}
/* Per-id actor patches and events are checked against the declared actors
   and sites of `panel`. */
function strandsceneStateWarnings(state, path, panel, warnings) {
  var effective = panel, span = ssSpan(effective), sites = ssSites(effective, span), actors = ssActors(effective);
  Object.keys(state).forEach(function (key) {
    if (SS_STATE_KEYS.indexOf(key) < 0) warnings.push(path + '.' + key + ': unknown field — ignored');
  });
  if (panelOwn(state, 'actors') && state.actors !== null) {
    if (!panelObject(state.actors)) warnings.push(path + '.actors: expected an object keyed by actor id — ignored');
    else Object.keys(state.actors).forEach(function (id) {
      var at = path + '.actors.' + id, value = state.actors[id];
      if (!actors.some(function (actor) { return actor.id === id; })) { warnings.push(at + ': unknown declared id — ignored'); return; }
      if (value === null) return;
      if (!panelObject(value)) { warnings.push(at + ': expected {at?, state?, label?} or null — ignored'); return; }
      Object.keys(value).forEach(function (key) {
        if (key === 'at') ssAtWarnings(value.at, at + '.at', warnings, span);
        else if (key === 'state') { if (value.state !== null && SS_STATES.indexOf(value.state) < 0) warnings.push(at + '.state: expected one of ' + SS_STATES.join(' ') + ' — ignored'); }
        else if (key === 'label') { if (value.label !== null && typeof value.label !== 'string') warnings.push(at + '.label: expected text — ignored'); }
        else warnings.push(at + '.' + key + ': unknown actor property — ignored');
      });
    });
  }
  if (panelOwn(state, 'events')) ssEventWarnings(state.events, path + '.events', warnings, effective, span, sites);
  if (panelOwn(state, 'camera') && state.camera !== null) seqRangeWarnings(state.camera, path + '.camera', warnings, span);
  if (panelOwn(state, 'highlight') && state.highlight !== null && !sites.some(function (site) { return site.id === state.highlight; }))
    warnings.push(path + '.highlight: unknown site id or null — ignored');
  if (panelOwn(state, 'labels')) ssLabelWarnings(state.labels, path + '.labels', warnings, span);
  if (panelOwn(state, 'caption') && state.caption !== null && typeof state.caption !== 'string') warnings.push(path + '.caption: expected text — ignored');
  if (panelOwn(state, 'note') && state.note !== null && typeof state.note !== 'string') warnings.push(path + '.note: expected text — ignored');
  if (panelOwn(state, 'paired') && state.paired !== null && typeof state.paired !== 'boolean') warnings.push(path + '.paired: expected true or false — ignored');
}
function strandscenePatchWarnings(state, path, panel, warnings) {
  softwarePanelPatchWarnings(state, path, panel, warnings, strandsceneStateWarnings);
}

/* ---------------- fold ----------------
   A pre-pass walks the path's steps with a running copy of the carried
   state, merging per-id actor patches, keeping `events` step-local and
   writing their lasting consequences (`cuts`, `extended`, `paired`,
   `unwound`) as full values; the cleaned steps then go through the shared
   folder, which carries scalars, overrides and `enterOnce` as usual. */
function ssCleanEvents(raw, panel, span, sites) {
  var out = [];
  if (!Array.isArray(raw)) return out;
  var siteIds = sites.map(function (site) { return site.id; }), strands = ssStrands(panel), alphabet = ssAlphabet(panel);
  raw.slice(0, SS_MAX_EVENTS).forEach(function (event) {
    if (!panelObject(event) || SS_EVENT_KINDS.indexOf(event.kind) < 0) return;
    if (event.kind === 'cut' || event.kind === 'join') { if (siteIds.indexOf(event.site) >= 0) out.push({ kind: event.kind, site: event.site }); }
    else if (event.kind === 'extend') {
      if (SS_STRANDS.indexOf(event.strand) < 0 || (event.strand === 'lower' && strands !== 2) || typeof event.letters !== 'string') return;
      var letters = bioNormalizeSequence(event.letters, alphabet).text;
      if (letters.length && letters.length <= SS_MAX_EXTEND) out.push({ kind: 'extend', strand: event.strand, letters: letters });
    } else if (event.kind === 'pair') { if (strands === 2) out.push({ kind: 'pair' }); }
    else if (event.kind === 'unwind') { var range = strands === 2 ? bioRange(event, '', null, span.first, span.last) : null; if (range) out.push({ kind: 'unwind', from: range.from, to: range.to }); }
    else if (event.kind === 'flash') { var at = ssCleanAt(event.at, span); if (at !== null) out.push({ kind: 'flash', at: at }); }
  });
  return out;
}
function ssCleanLabels(raw, span) {
  var out = [];
  if (!Array.isArray(raw)) return out;
  raw.slice(0, SS_MAX_LABELS).forEach(function (label) {
    if (!panelObject(label) || typeof label.text !== 'string' || !label.text) return;
    var at = ssCleanAt(label.at, span);
    if (at !== null) out.push({ at: at, text: label.text.slice(0, 40) });
  });
  return out;
}
function ssCloneRunning(running) {
  var actors = {};
  Object.keys(running.actors).forEach(function (id) { actors[id] = Object.assign({}, running.actors[id]); });
  return { actors: actors, cuts: running.cuts.slice(),
    extended: { upper: running.extended.upper, lower: running.extended.lower }, paired: running.paired, unwound: running.unwound };
}
/* Applies one raw patch to `running` and writes the resulting full values
   into `out`. `once` patches write only the keys they touch. */
function ssApply(panel, running, raw, out, once) {
  if (!panelObject(raw)) { if (!once) out.events = []; return; }
  var touchedActors = false;
  var effective = panel, span = ssSpan(effective), sites = ssSites(effective, span), actors = ssActors(effective);
  var declared = actors.map(function (actor) { return actor.id; });
  if (panelOwn(raw, 'actors') && raw.actors === null) { running.actors = {}; touchedActors = true; }
  if (panelOwn(raw, 'actors') && panelObject(raw.actors)) {
    Object.keys(raw.actors).forEach(function (id) {
      if (declared.indexOf(id) < 0) return;
      var value = raw.actors[id];
      if (value === null) { delete running.actors[id]; touchedActors = true; return; }
      if (!panelObject(value)) return;
      var patch = {}, keys = 0;
      if (panelOwn(value, 'at')) { var at = value.at === null ? null : ssCleanAt(value.at, span); if (value.at === null || at !== null) { patch.at = at; keys++; } }
      if (panelOwn(value, 'state') && (value.state === null || SS_STATES.indexOf(value.state) >= 0)) { patch.state = value.state; keys++; }
      if (panelOwn(value, 'label') && (value.label === null || typeof value.label === 'string')) { patch.label = value.label === null ? null : value.label.slice(0, SS_MAX_LABEL); keys++; }
      if (!keys) return;
      running.actors[id] = Object.assign({}, running.actors[id] || {}, patch);
      touchedActors = true;
    });
  }
  if (touchedActors || (panelOwn(raw, 'actors') && !once)) {
    var map = {};
    Object.keys(running.actors).forEach(function (id) { map[id] = Object.assign({}, running.actors[id]); });
    out.actors = map;
  }
  var events = panelOwn(raw, 'events') ? ssCleanEvents(raw.events, effective, span, sites) : [];
  if (!once || panelOwn(raw, 'events')) out.events = events;
  var consequence = false;
  events.forEach(function (event) {
    if (event.kind === 'cut') {
      var site = sites.filter(function (s) { return s.id === event.site; })[0];
      if (site && !running.cuts.some(function (cut) { return cut.site === site.id; })) { running.cuts.push({ site: site.id, upper: site.cutAfter.upper, lower: site.cutAfter.lower }); consequence = true; }
    } else if (event.kind === 'join') {
      var before = running.cuts.length;
      running.cuts = running.cuts.filter(function (cut) { return cut.site !== event.site; });
      consequence = consequence || running.cuts.length !== before;
    } else if (event.kind === 'extend') {
      running.extended[event.strand] = (running.extended[event.strand] + event.letters).slice(0, SS_MAX_EXTENDED);
      consequence = true;
    } else if (event.kind === 'pair') { running.paired = true; consequence = true; }
    else if (event.kind === 'unwind') { running.unwound = { from: event.from, to: event.to }; consequence = true; }
  });
  if (panelOwn(raw, 'paired') && (raw.paired === null || typeof raw.paired === 'boolean')) { running.paired = raw.paired; consequence = true; }
  if (consequence || !once) {
    out.cuts = running.cuts.slice();
    out.extended = { upper: running.extended.upper, lower: running.extended.lower };
    out.paired = running.paired;
    out.unwound = running.unwound ? { from: running.unwound.from, to: running.unwound.to } : null;
  }
  if (panelOwn(raw, 'camera') && (raw.camera === null || bioRange(raw.camera, '', null, span.first, span.last)))
    out.camera = raw.camera === null ? null : { from: raw.camera.from, to: raw.camera.to };
  if (panelOwn(raw, 'highlight') && (raw.highlight === null || sites.some(function (site) { return site.id === raw.highlight; }))) out.highlight = raw.highlight;
  if (panelOwn(raw, 'labels') && (raw.labels === null || Array.isArray(raw.labels))) out.labels = raw.labels === null ? null : ssCleanLabels(raw.labels, span);
  if (panelOwn(raw, 'caption') && (raw.caption === null || typeof raw.caption === 'string')) out.caption = raw.caption;
  if (panelOwn(raw, 'note') && (raw.note === null || typeof raw.note === 'string')) out.note = raw.note;
}
function strandsceneFold(panel, steps) {
  var running = { actors: {}, cuts: [], extended: { upper: '', lower: '' }, paired: null, unwound: null };
  var initial = {};
  ssApply(panel, running, panel.initial, initial, false);
  if (!initial.actors) initial.actors = {};
  var cleanSteps = steps.map(function (step) {
    var source = stepPanelPatch(step), raw = source && panelOwn(source, panel.id) ? source[panel.id] : null, out = {}, patches = Object.create(null);
    ssApply(panel, running, raw, out, false);
    if (panelObject(raw) && panelObject(raw.enterOnce)) {
      var temp = ssCloneRunning(running), once = {};
      ssApply(panel, temp, raw.enterOnce, once, true);
      out.enterOnce = once;
    }
    patches[panel.id] = out;
    return { panels: patches };
  });
  return foldCommonPanelStates({ id: panel.id, initial: initial }, cleanSteps);
}

/* ---------------- model ----------------
   Resolves a folded snapshot to absolute scene geometry (560×315 units). */
function ssLayout(span, lastMax, camera) {
  var from = camera ? Math.max(camera.from, span.first) : span.first, to = camera ? Math.min(camera.to, lastMax) : lastMax;
  if (to < from) { from = span.first; to = lastMax; }
  var n = Math.max(1, to - from + 1), pitch = Math.min(SS_PITCH, SS_SPAN / n);
  var x0 = MECH_SCENE.w / 2 - ((from + to) / 2 - span.first) * pitch;
  return { from: from, to: to, pitch: mechNum(pitch), x0: mechNum(x0), xOf: function (coord) { return mechNum(x0 + (coord - span.first) * pitch); } };
}
function strandsceneModel(panel, state) {
  state = panelObject(state) ? state : {};
  var eff = panelObject(panel) ? panel : {}, alphabet = ssAlphabet(eff), beads = ssBeads(eff), strands = ssStrands(eff), seq = ssText(eff), text = seq.text,
    span = ssSpan(eff), sites = ssSites(eff, span), declared = ssActors(eff), lowerText = strands === 2 ? ssLowerText(eff, text) : '';
  var extended = panelObject(state.extended) ? { upper: mechText(state.extended.upper, SS_MAX_EXTENDED), lower: mechText(state.extended.lower, SS_MAX_EXTENDED) } : { upper: '', lower: '' };
  if (strands !== 2) extended.lower = '';
  var upperText = text + extended.upper, lowerAll = lowerText + extended.lower;
  var lastUpper = span.first + upperText.length - 1, lastLower = span.first + lowerAll.length - 1, lastMax = Math.max(lastUpper, lastLower);
  var paired = strands === 2 && state.paired !== false, unwound = strands === 2 && panelObject(state.unwound) ? bioRange(state.unwound, '', null, span.first, span.last) : null;
  var camera = span.length ? bioRange(state.camera, '', null, span.first, lastMax) : null, layout = ssLayout(span, lastMax, camera);
  var yU = strands === 2 ? SS_UPPER_Y : SS_SINGLE_Y, yL = SS_LOWER_Y, midY = strands === 2 ? (yU + yL) / 2 + 5 : yU;
  /* Cuts with both positions still inside the strand, ordered along it. */
  var cuts = (Array.isArray(state.cuts) ? state.cuts : []).filter(function (cut) {
    return panelObject(cut) && typeof cut.site === 'string' && bioPosition(cut.upper) && bioPosition(cut.lower) &&
      cut.upper >= span.first && cut.upper < lastUpper && cut.lower >= span.first && cut.lower < lastMax;
  }).map(function (cut) { return { site: cut.site, upper: cut.upper, lower: cut.lower }; }).sort(function (a, b) { return a.upper - b.upper; });
  var m = cuts.length + 1, pieces = [];
  for (var p = 0; p < m; p++) {
    var upperFrom = p === 0 ? span.first : cuts[p - 1].upper + 1, upperTo = p === m - 1 ? lastUpper : cuts[p].upper;
    var lowerFrom = p === 0 ? span.first : cuts[p - 1].lower + 1, lowerTo = p === m - 1 ? lastLower : cuts[p].lower;
    pieces.push({ index: p, upperFrom: upperFrom, upperTo: upperTo, lowerFrom: lowerFrom, lowerTo: Math.max(lowerFrom - 1, lowerTo),
      dx: m === 1 ? 0 : mechNum((p - (m - 1) / 2) * 56), dy: m === 1 ? 0 : (p % 2 === 0 ? 22 : -22) });
  }
  function pieceOfUpper(coord) { for (var i = 0; i < pieces.length; i++) if (coord >= pieces[i].upperFrom && coord <= pieces[i].upperTo) return pieces[i]; return pieces[pieces.length - 1]; }
  function pieceOfLower(coord) { for (var i = 0; i < pieces.length; i++) if (coord >= pieces[i].lowerFrom && coord <= pieces[i].lowerTo) return pieces[i]; return pieces[pieces.length - 1]; }
  /* Actors: declared start merged with the carried per-id state. */
  var patches = panelObject(state.actors) && !Array.isArray(state.actors) ? state.actors : {};
  var actors = declared.map(function (actor) {
    var own = panelObject(patches[actor.id]) ? patches[actor.id] : {};
    var at = panelOwn(own, 'at') ? (own.at === null ? null : ssCleanAt(own.at, span)) : actor.start.at;
    var st = panelOwn(own, 'state') && own.state !== null && SS_STATES.indexOf(own.state) >= 0 ? own.state : actor.start.state;
    var label = panelOwn(own, 'label') && typeof own.label === 'string' ? own.label.slice(0, SS_MAX_LABEL) : actor.label;
    var box = mechShapeBox(actor.shape, actor.size), x, y, coord = null, piece = null;
    if (bioPosition(at) && at <= lastUpper) {
      coord = at; piece = pieceOfUpper(at);
      var grip = yU + piece.dy - 5 - box.h / 2;
      x = mechNum(layout.xOf(at) + piece.dx);
      /* grip on the letters when bound or active; hover above when scanning,
         higher still while binding (room for a cap on the same letters) and
         lifted away when released. */
      y = mechNum(st === 'bound' || st === 'active' ? grip : st === 'released' ? grip - 60 : st === 'binding' ? grip - 40 : grip - 20);
    } else if (panelObject(at)) { x = at.x; y = at.y; }
    else { x = SS_FREE.x; y = SS_FREE.y; }
    return { id: actor.id, role: actor.role, shape: actor.shape, size: actor.size, label: label, state: st, x: x, y: y, w: box.w, h: box.h,
      at: coord, piece: piece ? piece.index : null, hidden: coord !== null && (coord < layout.from || coord > layout.to) };
  });
  var hotSites = {};
  actors.forEach(function (actor) {
    if (actor.at === null || ['binding', 'bound', 'active'].indexOf(actor.state) < 0) return;
    sites.forEach(function (site) { if (actor.at >= site.from && actor.at <= site.to) hotSites[site.id] = true; });
  });
  var scanTo = null;
  actors.forEach(function (actor) { if (actor.state === 'scanning' && actor.at !== null) scanTo = scanTo === null ? actor.at : Math.max(scanTo, actor.at); });
  function hot(coord) { for (var i = 0; i < sites.length; i++) if (hotSites[sites[i].id] && coord >= sites[i].from && coord <= sites[i].to) return true; return false; }
  function inSite(coord) { for (var i = 0; i < sites.length; i++) if (coord >= sites[i].from && coord <= sites[i].to) return true; return false; }
  var letters = [];
  for (var i = 0; i < upperText.length; i++) {
    var coord = span.first + i, piece = pieceOfUpper(coord), ch = upperText.charAt(i), unknown = i < text.length && seq.invalid.indexOf(i) >= 0;
    letters.push({ coord: coord, ch: ch, strand: 'upper', cls: unknown ? 'bio-b-x' : bioLetterClass(ch).replace('bio-b ', ''), piece: piece.index,
      x: layout.xOf(coord), y: yU, hidden: coord < layout.from || coord > layout.to, extended: i >= text.length, hot: hot(coord),
      passed: scanTo !== null && coord < scanTo && !inSite(coord), tick: coord === span.first || coord % 5 === 0 });
  }
  var lowerLetters = [], rungs = [];
  if (strands === 2 && paired) {
    var lowerInvalid = typeof eff.lower === 'string' ? bioNormalizeSequence(eff.lower, alphabet).invalid : [];
    for (var j = 0; j < lowerAll.length; j++) {
      var lc = span.first + j, lp = pieceOfLower(lc), lch = lowerAll.charAt(j), lunknown = lowerAll.length === text.length + extended.lower.length && lowerInvalid.indexOf(j) >= 0;
      var open = !!(unwound && lc >= unwound.from && lc <= unwound.to);
      lowerLetters.push({ coord: lc, ch: lch, strand: 'lower', cls: lunknown ? 'bio-b-x' : bioLetterClass(lch).replace('bio-b ', ''), piece: lp.index,
        x: layout.xOf(lc), y: yL + (open ? 14 : 0), hidden: lc < layout.from || lc > layout.to, extended: j >= lowerText.length, hot: hot(lc), passed: false, open: open });
      var up = letters[j];
      if (up && up.piece === lp.index && !open) rungs.push({ coord: lc, piece: lp.index, x: layout.xOf(lc) });
    }
  }
  var siteViews = sites.map(function (site) {
    var cutInside = cuts.some(function (cut) { return (cut.upper >= site.from - 1 && cut.upper < site.to) || (cut.lower >= site.from - 1 && cut.lower < site.to); });
    return { id: site.id, from: site.from, to: site.to, label: site.label || site.id, tone: site.tone, cutAfter: site.cutAfter, cut: cutInside,
      hot: state.highlight === site.id,
      x1: mechNum(layout.xOf(Math.max(site.from, layout.from)) - layout.pitch / 2), x2: mechNum(layout.xOf(Math.min(site.to, layout.to)) + layout.pitch / 2),
      hidden: cutInside || site.to < layout.from || site.from > layout.to };
  });
  var labels = ssCleanLabels(state.labels, span).map(function (label) {
    if (bioPosition(label.at)) {
      var lp = pieceOfUpper(label.at), base = strands === 2 ? yL : yU;
      return { text: label.text, x: mechNum(layout.xOf(label.at) + lp.dx), y: mechNum(lp.dy < 0 ? yU - 36 + lp.dy : base + 46 + lp.dy), at: label.at, hidden: label.at < layout.from || label.at > layout.to };
    }
    return { text: label.text, x: label.at.x, y: label.at.y, at: null, hidden: false };
  });
  var events = (Array.isArray(state.events) ? state.events : []).filter(panelObject);
  var legend = actors.map(function (actor) { return { id: actor.id, role: actor.role, name: actor.label, state: actor.state, hot: actor.state !== 'free' }; })
    .concat(sites.map(function (site) {
      var view = siteViews.filter(function (v) { return v.id === site.id; })[0];
      return { id: 'site:' + site.id, role: 'particle', tone: site.tone, dashed: true, name: site.label || site.id, state: view.cut ? 'cut' : bioFormatCoord(site.from) + '–' + bioFormatCoord(site.to), hot: view.hot };
    }));
  var title = (mechText(eff.label, 40) || 'strand scene') + (span.length ? ' · ' + bioFormatCoord(span.first) + '–' + bioFormatCoord(lastMax) : '') + (alphabet === 'protein' ? '' : ' · 5′→3′');
  var aria = [];
  aria.push(!span.length ? 'No strand declared' : (strands === 2 ? 'Double' : 'Single') + ' strand ' + bioFormatCoord(span.first) + ' to ' + bioFormatCoord(lastMax) + (strands === 2 && !paired ? ', second strand not yet paired' : ''));
  sites.forEach(function (site) { aria.push((site.label || site.id) + ' ' + site.from + ' to ' + site.to); });
  actors.forEach(function (actor) { aria.push(actor.label + ' ' + actor.state + (actor.at !== null ? ' at ' + actor.at : actor.state === 'free' ? '' : ' in free space')); });
  cuts.forEach(function (cut) { aria.push('cut after ' + cut.upper + (strands === 2 ? ' and ' + cut.lower : '')); });
  if (extended.upper) aria.push('upper strand extended by ' + extended.upper.length);
  if (extended.lower) aria.push('lower strand extended by ' + extended.lower.length);
  if (unwound) aria.push('unwound ' + unwound.from + ' to ' + unwound.to);
  labels.forEach(function (label) { aria.push(label.text); });
  if (camera) aria.push('showing ' + layout.from + ' to ' + layout.to);
  return {
    alphabet: alphabet, beads: beads, strands: strands, first: span.first, last: span.last, length: span.length, lastUpper: lastUpper, lastLower: lastLower, lastMax: lastMax,
    text: upperText, lowerText: lowerAll, paired: paired, unwound: unwound, extended: extended, cuts: cuts, pieces: pieces, layout: layout,
    yUpper: yU, yLower: yL, midY: midY, letters: letters, lowerLetters: lowerLetters, rungs: rungs, sites: siteViews, actors: actors, labels: labels,
    events: events, camera: camera, highlight: typeof state.highlight === 'string' ? state.highlight : null, legend: legend, title: title,
    caption: mechText(state.caption, SS_MAX_CAPTION), note: typeof state.note === 'string' ? state.note : '', aria: aria.join('; ') + '.',
    fontSize: mechNum(Math.min(13, layout.pitch * 0.7)), uid: mechUid(eff),
  };
}

/* ---------------- render ---------------- */
function ssLetterMarkup(letter, model, delay) {
  var cls = 'mech-nt ' + letter.cls + (letter.hot ? ' mech-hot' : '') + (letter.passed ? ' mech-passed' : '') + (delay != null ? ' mech-appear' : '');
  var style = delay != null ? ' style="animation-delay:' + delay + 'ms"' : '';
  if (model.beads) return '<circle class="' + cls + ' mech-bead" cx="' + letter.x + '" cy="' + letter.y + '" r="5.5"' + style + '/>' +
    '<circle class="mech-bead-hi' + (letter.passed ? ' mech-passed' : '') + (delay != null ? ' mech-appear' : '') + '" cx="' + mechNum(letter.x - 1.7) + '" cy="' + mechNum(letter.y - 1.9) + '" r="1.7"' + style + '/>';
  /* A base block: a soft tile in the letter's tone that hangs off the
     backbone (above the letter on the upper strand, below on the lower);
     an unwound lower letter's tile is centred on the letter. */
  var tw = mechNum(Math.max(4, model.layout.pitch * 0.82)), up = letter.strand === 'upper', ly = letter.y, ty = mechNum(up ? ly - 11 : letter.open ? ly - 10 : ly - 9);
  return '<rect class="mech-ntbg ' + cls.replace('mech-nt ', '') + '" x="' + mechNum(letter.x - tw / 2) + '" y="' + ty + '" width="' + tw + '" height="20" rx="' + mechNum(Math.min(4, tw / 3)) + '"' + style + '/>' +
    '<text class="mech-t-nt ' + cls + '" x="' + letter.x + '" y="' + mechNum(ly + 5) + '"' + style + '>' + esc(letter.ch) + '</text>';
}
function ssPieceMarkup(model, piece, motion) {
  var upper = model.letters.filter(function (l) { return l.piece === piece.index; }), lower = model.lowerLetters.filter(function (l) { return l.piece === piece.index; });
  var rungs = model.rungs.filter(function (r) { return r.piece === piece.index; }), yU = model.yUpper, yL = model.yLower, h = '';
  var appear = motion && motion.appear, half = model.layout.pitch / 2;
  /* Rails span the piece's visible letters; a true piece end gets the
     rounded 12-unit tail, a camera edge only half a letter pitch. The rail
     is a sugar-phosphate ribbon: a lit tube with a phosphate bead between
     neighbouring bases and, at its 3′ side, a small arrowhead that shows
     the strand's 5′→3′ direction (rightward above, leftward below). */
  function rail(all, y, threeOnLeft) {
    var shown = all.filter(function (l) { return !l.hidden; });
    if (!shown.length) return '';
    var leftEnd = shown[0] === all[0], rightEnd = shown[shown.length - 1] === all[all.length - 1];
    var x1 = shown[0].x - (leftEnd ? 12 : half), x2 = shown[shown.length - 1].x + (rightEnd ? 12 : half);
    var out = '<line class="mech-rail" x1="' + mechNum(x1) + '" y1="' + y + '" x2="' + mechNum(x2) + '" y2="' + y + '"/>' +
      '<line class="mech-rail-hi" x1="' + mechNum(x1 + 2) + '" y1="' + mechNum(y - 1.2) + '" x2="' + mechNum(x2 - 2) + '" y2="' + mechNum(y - 1.2) + '"/>';
    if (half >= 5) {
      var beads = '', r = mechNum(Math.min(1.7, half * 0.18));
      for (var i = 0; i < shown.length - 1; i++) if (shown[i + 1].coord === shown[i].coord + 1) beads += 'M' + mechNum(shown[i].x + half) + ',' + y + 'h0';
      if (beads) out += '<path class="mech-phos" d="' + beads + '" stroke-width="' + mechNum(r * 2) + '"/>';
    }
    if (!model.beads && model.alphabet !== 'protein') {
      var tip = threeOnLeft ? x1 - 5 : x2 + 5, base = threeOnLeft ? x1 + 1.5 : x2 - 1.5;
      out += '<path class="mech-rail-end" d="M' + mechNum(base) + ',' + mechNum(y - 4.6) + 'L' + mechNum(tip) + ',' + y + 'L' + mechNum(base) + ',' + mechNum(y + 4.6) + 'Z"/>';
    }
    return out;
  }
  if (upper.length) {
    h += rail(upper, yU - 12);
    upper.forEach(function (letter) {
      if (letter.hidden) return;
      var delay = appear && letter.extended && appear.upper && letter.coord > appear.upper ? (letter.coord - appear.upper - 1) * 120 : null;
      h += ssLetterMarkup(letter, model, delay);
    });
  }
  if (lower.length) {
    var pairIn = appear && appear.pair;
    h += '<g class="mech-lower' + (pairIn ? ' mech-appear' : '') + '">';
    h += rail(lower, yL + 12, true);
    lower.forEach(function (letter) {
      if (letter.hidden) return;
      var delay = appear && letter.extended && appear.lower && letter.coord > appear.lower ? (letter.coord - appear.lower - 1) * 120 : null;
      h += ssLetterMarkup(letter, model, delay);
    });
    /* Each half-rung takes the tone of the base it grows from; between the
       two halves the hydrogen bonds are drawn as fine ticks, two for A·T
       (A·U) and three for G·C, so the pairing rule is visible. */
    var letterAt = function (list, coord) { var hit = null; list.forEach(function (l) { if (l.coord === coord) hit = l; }); return hit; };
    var toneOf = function (list, coord) { var hit = letterAt(list, coord); return hit ? hit.cls + ' ' : ''; };
    var gap = mechNum(Math.min(2.6, model.layout.pitch * 0.15)), hbTop = yU + 15.5, hbBottom = (yL - 13) - 0.5;
    rungs.forEach(function (rung, i) {
      if (rung.x < model.layout.xOf(model.layout.from) - 1 || rung.x > model.layout.xOf(model.layout.to) + 1) return;
      var style = pairIn ? ' style="animation-delay:' + Math.min(i * 40, 600) + 'ms"' : '';
      var a = letterAt(upper, rung.coord), b = letterAt(lower, rung.coord), pair = a && b ? (a.ch + b.ch).toUpperCase() : '';
      var bonds = pair === 'GC' || pair === 'CG' ? 3 : 2, hb = '';
      for (var k = 0; k < bonds; k++) { var bx = mechNum(rung.x + (k - (bonds - 1) / 2) * gap); hb += 'M' + bx + ',' + hbTop + 'V' + hbBottom; }
      h += '<line class="' + toneOf(upper, rung.coord) + 'mech-rung' + (pairIn ? ' mech-appear' : '') + '" x1="' + rung.x + '" y1="' + (yU + 10) + '" x2="' + rung.x + '" y2="' + (yU + 15) + '"' + style + '/>' +
        '<path class="mech-hb' + (pairIn ? ' mech-appear' : '') + '" d="' + hb + '"' + style + '/>' +
        '<line class="' + toneOf(lower, rung.coord) + 'mech-rung' + (pairIn ? ' mech-appear' : '') + '" x1="' + rung.x + '" y1="' + (yL - 13) + '" x2="' + rung.x + '" y2="' + (yL - 8) + '"' + style + '/>';
    });
    h += '</g>';
  }
  var glide = motion && motion.pieces[piece.index] ? mechGlideStyle(motion.pieces[piece.index], { x: piece.dx, y: piece.dy }) : '';
  return '<g class="mech-move mech-piece"' + glide + '><g transform="translate(' + piece.dx + ' ' + piece.dy + ')">' + h + '</g></g>';
}
function ssSceneMarkup(model, motion) {
  var h = '', layout = model.layout;
  if (!model.cuts.length && model.length) {
    h += '<g class="mech-ruler">';
    model.letters.forEach(function (letter) {
      if (letter.tick && !letter.hidden && !letter.extended) h += '<text class="mech-t-label" x="' + letter.x + '" y="' + (model.yUpper - 22) + '" text-anchor="middle">' + bioFormatCoord(letter.coord) + '</text>';
    });
    h += '</g>';
  }
  model.pieces.forEach(function (piece) { h += ssPieceMarkup(model, piece, motion); });
  model.actors.forEach(function (actor) {
    if (actor.hidden || actor.at === null) return;
    h += ssActorMarkup(actor, motion);
  });
  if (motion) h += motion.transients;
  var pan = motion && motion.viewport ? mechGlideStyle(motion.viewport, { x: layout.x0, y: 0 }) : '', free = '';
  model.actors.forEach(function (actor) { if (actor.at === null) free += ssActorMarkup(actor, motion); });
  return '<g class="mech-move mech-viewport"' + pan + '>' + h + '</g>' + free;
}
function ssActorMarkup(actor, motion) {
  var glide = motion && motion.actors[actor.id] ? mechGlideStyle(motion.actors[actor.id], actor) : '';
  /* The active actor stands in a soft accent halo that ends at its own
     base, so it never washes over the letters it grips; bound and binding
     actors glow, the rest cast a contact shadow. */
  var pool = actor.state === 'active' ?
    '<ellipse class="mech-pool" cy="-4" rx="' + mechNum(actor.w / 2 + 9) + '" ry="' + mechNum(actor.h / 2 + 4) + '" aria-hidden="true"/>' : '';
  var h = '<g class="mech-move mech-actor-move"' + glide + '><g transform="translate(' + actor.x + ' ' + actor.y + ')">' + pool +
    mechActorMarkup(actor, ' mech-st-' + actor.state);
  if (actor.state === 'scanning') h += '<text class="mech-t-label mech-scan" y="' + mechNum(-actor.h / 2 - 8) + '" text-anchor="middle">scanning →</text>';
  return h + '</g></g>';
}
function ssOverlayMarkup(model, motion) {
  var h = '<text class="mech-t-label" x="14" y="20">' + esc(model.title) + '</text>';
  if (model.caption) h += '<text class="mech-t-caption" x="14" y="38">' + esc(model.caption) + '</text>';
  model.sites.forEach(function (site) {
    if (site.hidden) return;
    var y1 = model.yUpper - 18, y2 = (model.strands === 2 ? model.yLower : model.yUpper) + 18;
    h += '<rect class="mech-site bio-tone-' + site.tone + (site.hot ? ' hot' : '') + '" x="' + site.x1 + '" y="' + y1 + '" width="' + mechNum(site.x2 - site.x1) + '" height="' + (y2 - y1) + '" rx="6"/>';
    h += mechTagMarkup((site.x1 + site.x2) / 2, y2 + 22, site.label + ' · ' + bioFormatCoord(site.from) + '–' + bioFormatCoord(site.to), 'mech-site-tag bio-tone-' + site.tone + (site.hot ? ' hot' : ''));
  });
  model.labels.forEach(function (label, i) {
    if (label.hidden) return;
    var fresh = motion && motion.labels && motion.labels.indexOf(label.text) < 0, end = ssEndCap(model, label);
    h += '<g' + (fresh ? ' class="mech-appear" style="animation-delay:' + (500 + i * 120) + 'ms"' : '') + '>' +
      (end ? mechTagMarkup(end.x, label.y, label.text, 'mech-callout mech-endcap') : mechTagMarkup(label.x, label.y, label.text, 'mech-callout')) + '</g>';
  });
  return h;
}
/* A short free tag (a 5′ or 3′ end mark) placed on a strand row beside its
   end: it keeps its authored row but steps outward, if needed, so it clears
   the end base tile and the rail's direction arrow. Null for any other tag. */
function ssEndCap(model, label) {
  if (label.at !== null || label.text.length > 3) return null;
  var row = model.letters.concat(model.lowerLetters).filter(function (l) {
    var p = model.pieces[l.piece] || { dx: 0, dy: 0 };
    return !l.hidden && Math.abs(l.y + p.dy - label.y) <= 14;
  });
  if (!row.length) return null;
  var xs = row.map(function (l) { return l.x + (model.pieces[l.piece] || { dx: 0 }).dx; });
  var lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs), w = label.text.length * 6.4 + 14;
  var clear = 20; /* the 12-unit rail tail, the 5-unit arrow and a gap */
  if (label.x < lo) return { x: mechNum(Math.min(label.x, lo - clear - w / 2)) };
  if (label.x > hi) return { x: mechNum(Math.max(label.x, hi + clear + w / 2)) };
  return null;
}
function ssAsideMarkup(model) {
  return mechLegendHTML(model.legend) + (model.note ? '<div class="swnote">' + esc(model.note) + '</div>' : '');
}
function ssFrameHTML(model, motion) {
  return '<div class="swpanel mech-box"><svg class="mech-frame" viewBox="0 0 ' + MECH_SCENE.w + ' ' + MECH_SCENE.h + '" role="img" aria-label="' + esc(model.aria) + '" style="--mk-nt:' + model.fontSize + 'px;' + mechDefsStyle(model.uid) + '">' +
    mechDefsMarkup(model.uid) + '<g class="mech-scene">' + ssSceneMarkup(model, motion) + '</g><g class="mech-overlay">' + ssOverlayMarkup(model, motion) + '</g></svg>' +
    '<div class="mech-aside">' + ssAsideMarkup(model) + '</div></div>';
}
/* Settled markup with no motion, for tests and tooling. */
function strandsceneHTML(panel, state) {
  return ssFrameHTML(strandsceneModel(panel, state), null);
}
/* Presentation history: positions and states after this render. Never read
   by the fold; alternate paths simply glide from whatever was on screen. */
function ssPresentation(model) {
  var actors = {};
  model.actors.forEach(function (actor) { actors[actor.id] = { x: actor.x, y: actor.y, state: actor.state }; });
  return { actors: actors, pieces: model.pieces.map(function (piece) { return { from: piece.upperFrom, to: piece.upperTo, x: piece.dx, y: piece.dy }; }),
    viewport: { x0: model.layout.x0, pitch: model.layout.pitch }, labels: model.labels.map(function (label) { return label.text; }),
    extended: { upper: model.extended.upper, lower: model.extended.lower }, paired: model.paired };
}
/* What moves this step, from the previous presentation: actor and piece
   glides, the viewport pan, one-shot transients and entrance classes. */
function ssMotion(model, prev) {
  var motion = { actors: {}, pieces: {}, viewport: null, transients: '', pulse: null, appear: null, labels: prev ? prev.labels : null, any: false };
  var delay = 0;
  if (prev) {
    model.actors.forEach(function (actor) {
      var was = prev.actors[actor.id];
      if (!was) return;
      if (Math.abs(was.x - actor.x) > 0.5 || Math.abs(was.y - actor.y) > 0.5) { motion.actors[actor.id] = { x: was.x, y: was.y }; motion.any = true; }
      if (was.state !== actor.state) {
        if (!motion.pulse) motion.pulse = actor.id;
        if ((actor.state === 'bound' || actor.state === 'binding') && actor.at !== null) { motion.transients += mechRipple(actor.x, model.midY, 'bind', delay); delay += 250; }
        motion.any = true;
      }
    });
    model.pieces.forEach(function (piece) {
      var was = null;
      prev.pieces.forEach(function (old) { if (old.from <= piece.upperFrom && old.to >= piece.upperFrom) was = old; });
      if (!was) prev.pieces.forEach(function (old) { if (old.from <= piece.upperTo && old.to >= piece.upperFrom && !was) was = old; });
      if (was && (Math.abs(was.x - piece.dx) > 0.5 || Math.abs(was.y - piece.dy) > 0.5)) { motion.pieces[piece.index] = { x: was.x, y: was.y }; motion.any = true; }
    });
    if (prev.viewport.pitch === model.layout.pitch && Math.abs(prev.viewport.x0 - model.layout.x0) > 0.5) { motion.viewport = { x: prev.viewport.x0, y: 0 }; motion.any = true; }
    if (model.labels.some(function (label) { return prev.labels.indexOf(label.text) < 0; })) motion.any = true;
  }
  model.events.forEach(function (event) {
    if (event.kind === 'cut') {
      var cut = model.cuts.filter(function (c) { return c.site === event.site; })[0];
      if (!cut) return;
      var xu = mechNum(model.layout.xOf(cut.upper) + model.layout.pitch / 2), xl = mechNum(model.layout.xOf(cut.lower) + model.layout.pitch / 2), yU = model.yUpper, yL = model.yLower;
      motion.transients += '<g class="mech-transient mech-cutmark" style="animation-delay:' + delay + 'ms" aria-hidden="true">' +
        '<line x1="' + xu + '" y1="' + (yU - 20) + '" x2="' + xu + '" y2="' + (yU + 24) + '"/>' +
        (model.strands === 2 ? '<line x1="' + xl + '" y1="' + (yL - 24) + '" x2="' + xl + '" y2="' + (yL + 20) + '"/>' : '') + '</g>' +
        mechRipple((xu + xl) / 2, model.midY, 'cut', delay);
      delay += 250; motion.any = true;
    } else if (event.kind === 'flash') {
      var at = event.at, x = bioPosition(at) ? model.layout.xOf(at) : panelObject(at) ? at.x : null, y = bioPosition(at) ? model.midY : panelObject(at) ? at.y : null;
      if (x !== null) { motion.transients += mechRipple(x, y, 'flash', delay); delay += 250; motion.any = true; }
    } else if (event.kind === 'extend') {
      motion.appear = motion.appear || {};
      var before = model.extended[event.strand].length - event.letters.length, baseLast = event.strand === 'upper' ? model.last : model.first + model.lowerText.length - model.extended.lower.length - 1;
      motion.appear[event.strand] = baseLast + Math.max(0, before);
      motion.any = true;
    } else if (event.kind === 'pair') {
      if (!prev || !prev.paired) { motion.appear = motion.appear || {}; motion.appear.pair = true; motion.any = true; }
    }
  });
  return motion;
}
function strandsceneRender(host, panel, state, skin, states, stepIdx, animate) {
  var model = strandsceneModel(panel, state), prev = host._mechPrev || null;
  var motion = animate ? ssMotion(model, prev) : null;
  if (motion && !motion.any) motion = null;
  host._mechPrev = ssPresentation(model);
  var html = ssFrameHTML(model, motion), baseline = motion ? ssFrameHTML(model, null) : null;
  var scene = ssSceneMarkup(model, null), lastScene = host._mechScene;
  host._mechScene = scene;
  return {
    html: html,
    baseline: baseline,
    glide: { selector: '.mech-move[style]', multiple: true },
    transient: '.mech-transient',
    pulse: motion && motion.pulse ? { selector: '.mech-chip[data-id="' + motion.pulse + '"]', changed: true } : null,
    settle: function () {
      if (typeof host.querySelectorAll !== 'function') return;
      var entering = host.querySelectorAll('.mech-appear');
      for (var i = 0; i < entering.length; i++) { entering[i].classList.remove('mech-appear'); entering[i].style.animationDelay = ''; }
    },
    /* Overlay-only change (caption, highlight, labels, legend states, note)
       with an identical scene subtree: swap only the overlay, the aside and
       the aria-label, keeping the strand pieces and actors in place. */
    patch: function () {
      if (motion || lastScene !== scene || host._lastHTML == null || typeof host.querySelector !== 'function') return false;
      var frame = host.querySelector('.mech-frame'), overlay = host.querySelector('.mech-overlay'), aside = host.querySelector('.mech-aside');
      if (!frame || !overlay || !aside) return false;
      overlay.innerHTML = ssOverlayMarkup(model, null);
      aside.innerHTML = ssAsideMarkup(model);
      frame.setAttribute('aria-label', model.aria);
      return true;
    },
  };
}

PanelRegistry.define('strandscene', {
  label: 'Strand scene',
  since: '0.2.0',
  order: 46,
  validateDeclaration: strandsceneDeclarationWarnings,
  validatePatch: strandscenePatchWarnings,
  fold: strandsceneFold,
  render: strandsceneRender,
  presentation: { ambientInitial: true },
  layout: {
    canvasSizing: { mode: 'fixed-aspect', aspect: 560 / 315, resizeAxis: 'width' },
    sectionSizing: { minWidth: 320, preferredWidth: 560, maxWidth: 900, aspectPolicy: 'fixed', bodyAspect: 16 / 9, grow: 1, contentSelector: '.mech-frame', ancillarySelector: '.mech-legend,.swnote' },
    height: 9, fallbackHeight: 9,
  },
  /* Shared `.mech-*` rules for the mechanism-scene family (strandscene owns
     them; cellscene reuses the class names and must not redefine them).
     Frame-local custom properties flip for the light skins in one block;
     actor edges darken there with color-mix. Letters reuse `.bio-b-*`. */
  styles: String.raw`
.mech-box{min-width:0}
.mech-frame{display:block;width:100%;height:auto;border-radius:10px;background:radial-gradient(circle,var(--mk-grid) 1px,transparent 1.35px) 0 0/24px 24px,radial-gradient(120% 90% at 50% 38%,#0E1A2E 0%,#0A1424 42%,#070E19 78%,#060B13 100%);box-shadow:inset 0 0 0 1px #1D2A40,inset 0 1px 0 rgba(255,255,255,.04);--mk-ink:#EAF2FF;--mk-mute:#8DA2C6;--mk-line:#4A6188;--mk-rung:#2E4466;--mk-tagbg:#101A2C;--mk-tagline:#2E4466;--mk-grid:rgba(141,162,198,.11);--mk-halo:#08111F;--mk-acc:#38E1FF;--mk-bad:#F87171;--mk-warn:#FFB454;--mk-sheen:.42;--mk-contact:drop-shadow(0 1.5px 1.5px rgba(0,0,0,.55));--mk-glow:drop-shadow(0 0 1px rgba(56,225,255,.9)) drop-shadow(0 0 7px rgba(56,225,255,.5));--mk-glow-hot:drop-shadow(0 0 1px rgba(56,225,255,1)) drop-shadow(0 0 10px rgba(56,225,255,.62));--mk-lift:drop-shadow(0 3px 6px rgba(0,0,0,.45));--mk-pool:rgba(56,225,255,.08);--mk-pool-line:rgba(56,225,255,.38);--mk-phos:#8DA2C6;--mk-hb:#5E7396;--mk-tile:#08111F;--mk-clay-top:.28;--mk-clay-low:#000;--mk-clay-low-a:.34;--mk-spec:.55}
.sk-daylight .mech-frame,body.sk-editorial .mech-frame{background:radial-gradient(circle,var(--mk-grid) 1px,transparent 1.35px) 0 0/24px 24px,#F4F6FA;box-shadow:inset 0 0 0 1px #E3E9F2;--mk-ink:#0B1220;--mk-mute:#5E6B82;--mk-line:#7B8CA6;--mk-rung:#B8C2D4;--mk-tagbg:#FFFFFF;--mk-tagline:#C8D0DD;--mk-grid:rgba(11,18,32,.07);--mk-halo:#F4F6FA;--mk-acc:#3D4C9E;--mk-bad:#C93C4E;--mk-warn:#B07A12;--mk-sheen:.55;--mk-contact:drop-shadow(0 1.5px 1.5px rgba(36,50,74,.18));--mk-glow:drop-shadow(0 0 .5px #3D4C9E) drop-shadow(0 0 6px rgba(61,76,158,.4));--mk-glow-hot:drop-shadow(0 0 .5px #3D4C9E) drop-shadow(0 0 8px rgba(61,76,158,.5));--mk-lift:drop-shadow(0 3px 5px rgba(36,50,74,.12));--mk-pool:rgba(61,76,158,.07);--mk-pool-line:#C9CFF0;--mk-phos:#E3E9F2;--mk-hb:#8C9BB5;--mk-tile:#F4F6FA;--mk-clay-top:.6;--mk-clay-low:#24324A;--mk-clay-low-a:.16;--mk-spec:.85}
@media screen{
body.sk-pastel .mech-frame{border-radius:12px;background:radial-gradient(circle,var(--mk-grid) 1px,transparent 1.35px) 12px 12px/24px 24px,radial-gradient(120% 90% at 50% 40%,#F9FAFE 0%,#F3F6FB 40%,#EEF2F9 70%,#E6ECF5 100%);box-shadow:inset 0 0 0 1px #E3E9F2,inset 0 1px 0 #fff,inset 0 -24px 40px -30px rgba(82,99,185,.10);--mk-ink:#24324A;--mk-mute:#5F6C84;--mk-line:#8C9BB5;--mk-rung:#C9D2E1;--mk-tagbg:#FFFFFF;--mk-tagline:#C9D2E1;--mk-grid:rgba(36,50,74,.085);--mk-halo:#F2F5FA;--mk-acc:#5263B9;--mk-bad:#D36370;--mk-warn:#D19A4D;--mk-sheen:.62;--mk-contact:drop-shadow(0 1.5px 1.5px rgba(36,50,74,.2));--mk-glow:drop-shadow(0 0 .6px #5263B9) drop-shadow(0 0 6px rgba(82,99,185,.42));--mk-glow-hot:drop-shadow(0 0 .8px #5263B9) drop-shadow(0 0 9px rgba(82,99,185,.5));--mk-lift:drop-shadow(0 4px 6px rgba(36,50,74,.10));--mk-pool:rgba(82,99,185,.09);--mk-pool-line:#C9CFF0;--mk-phos:#E3E9F2;--mk-hb:#8C9BB5;--mk-tile:#F3F6FB;--mk-clay-top:.62;--mk-clay-low:#24324A;--mk-clay-low-a:.17;--mk-spec:.88}
body.sk-blueprint .mech-frame{border-radius:0;background:linear-gradient(rgba(127,227,255,.08) 1px,transparent 1px) 0 0/24px 24px,linear-gradient(90deg,rgba(127,227,255,.08) 1px,transparent 1px) 0 0/24px 24px,#04234A;box-shadow:inset 0 0 0 1px rgba(127,227,255,.35);--mk-ink:#F7FCFF;--mk-mute:#94BCD5;--mk-line:#7FE3FF;--mk-rung:#4FA9C3;--mk-tagbg:#052956;--mk-tagline:#4FA9C3;--mk-halo:#04234A;--mk-acc:#7FE3FF;--mk-bad:#FF8A93;--mk-warn:#FFD166;--mk-sheen:0;--mk-contact:none;--mk-glow:drop-shadow(0 0 4px rgba(127,227,255,.7));--mk-glow-hot:drop-shadow(0 0 6px rgba(127,227,255,.85));--mk-lift:none;--mk-pool:rgba(127,227,255,.07);--mk-pool-line:rgba(127,227,255,.7);--mk-phos:#04234A;--mk-hb:#4FA9C3;--mk-tile:#04234A;--mk-clay-top:0;--mk-clay-low-a:0;--mk-spec:0}
}
.mech-move{transition:transform .7s cubic-bezier(.2,.7,.2,1)}
.mech-move.mech-piece{transition-timing-function:cubic-bezier(.22,1.18,.36,1)}
.mech-gs-top{stop-color:#fff;stop-opacity:var(--mk-clay-top,.3)}
.mech-gs-mid{stop-color:#fff;stop-opacity:0}
.mech-gs-low{stop-color:var(--mk-clay-low,#000);stop-opacity:var(--mk-clay-low-a,.3)}
.mech-gs-spec{stop-color:#fff;stop-opacity:var(--mk-spec,.5)}
.mech-clay{fill:var(--mk-clay,none);stroke:none;pointer-events:none}
.mech-clay.mech-ball{fill:var(--mk-ball,none)}
.mech-pool{fill:color-mix(in srgb,var(--mk-acc) 12%,transparent);stroke:var(--mk-pool-line);stroke-width:1;stroke-opacity:.7}
.mech-t-label{font:700 10px 'IBM Plex Sans',sans-serif;letter-spacing:.07em;fill:var(--mk-mute);text-transform:uppercase;font-variant-numeric:tabular-nums lining-nums;paint-order:stroke;stroke:var(--mk-halo);stroke-width:3px;stroke-linejoin:round}
.mech-t-caption{font:600 12px 'IBM Plex Sans',sans-serif;fill:var(--mk-ink);paint-order:stroke;stroke:var(--mk-halo);stroke-width:3.5px;stroke-linejoin:round}
.mech-t-tag{font:600 10.5px 'IBM Plex Sans',sans-serif;fill:var(--mk-ink)}
.mech-tag rect{fill:var(--mk-tagbg);stroke:var(--mk-tagline);stroke-width:1;filter:var(--mk-lift)}
.mech-tag.mech-site-tag rect,.mech-tag.mech-callout rect{fill:color-mix(in srgb,var(--bio-tone,var(--mk-acc)) 12%,var(--mk-tagbg));stroke:color-mix(in srgb,var(--bio-tone,var(--mk-acc)) 75%,var(--mk-tagbg))}
.mech-tag.hot rect{stroke-width:1.8;stroke:var(--bio-tone,var(--mk-acc))}
.mech-tag.mech-endcap rect{fill:var(--mk-tagbg);stroke:var(--mk-line);stroke-width:1.25}
.mech-tag.mech-endcap .mech-t-tag{font-family:'IBM Plex Mono',monospace;font-weight:600}
.mech-t-actor{font:700 10px 'IBM Plex Sans',sans-serif;letter-spacing:.06em;fill:var(--mk-ink);text-anchor:middle;text-transform:uppercase;paint-order:stroke;stroke:var(--mk-halo);stroke-width:3px;stroke-linejoin:round}
.mech-t-actor.mech-t-inside{fill:var(--mi);stroke:var(--mf);stroke-width:2.5px}
.mech-actor>path:first-child{fill:var(--mf);stroke:color-mix(in srgb,var(--me) 55%,var(--mf));stroke-width:1.25;stroke-linejoin:round;filter:var(--mk-contact);transition:filter .24s ease}
.mech-t-actor.mech-t-side{text-anchor:start}
.sk-daylight .mech-actor>path:first-child,body.sk-editorial .mech-actor>path:first-child{stroke:color-mix(in srgb,var(--mf) 62%,#24324A)}
@media screen{
body.sk-pastel .mech-actor>path:first-child{fill:color-mix(in srgb,var(--mf) 88%,#fff);stroke:color-mix(in srgb,var(--mf) 62%,#24324A)}
body.sk-blueprint .mech-actor>path:first-child{fill:color-mix(in srgb,var(--mf) 14%,transparent);stroke:var(--mf);stroke-width:1.5}
body.sk-blueprint .mech-clay{display:none}
body.sk-blueprint .mech-pool{fill:none;stroke-dasharray:3 3}
body.sk-blueprint .mech-t-label,body.sk-blueprint .mech-t-actor{font-family:'Barlow Condensed','IBM Plex Sans',sans-serif;font-size:11px;letter-spacing:.1em}
body.sk-blueprint .mech-t-actor.mech-t-inside{fill:var(--mk-ink);stroke:var(--mk-halo)}
body.sk-pastel .mech-t-actor.mech-t-inside{stroke:color-mix(in srgb,var(--mf) 88%,#fff)}
body.sk-blueprint .mech-tag rect{rx:1px}
}
.mech-st-binding>path:first-child,.mech-st-bound>path:first-child{filter:var(--mk-glow)}
.mech-st-active>path:first-child{filter:var(--mk-glow-hot)}
.mech-st-released{opacity:.8}
.mech-scan{opacity:.85}
.mech-t-nt{font:600 var(--mk-nt,13px) 'IBM Plex Mono',monospace;text-anchor:middle;fill:color-mix(in srgb,var(--bio-letter,var(--dfaint)) 82%,var(--dtext))}
.mech-ntbg{fill:color-mix(in srgb,var(--bio-letter,var(--mk-mute)) 15%,var(--mk-tile,#08111F));stroke:color-mix(in srgb,var(--bio-letter,var(--mk-mute)) 34%,transparent);stroke-width:.75;transition:opacity .4s ease,fill .4s ease}
.mech-ntbg.mech-hot{fill:color-mix(in srgb,var(--bio-letter,var(--mk-mute)) 26%,var(--mk-tile,#08111F));stroke:color-mix(in srgb,var(--bio-letter,var(--mk-mute)) 70%,transparent);stroke-width:1}
.mech-bead{fill:color-mix(in srgb,var(--bio-letter,var(--dfaint)) 82%,var(--dtext));stroke:color-mix(in srgb,var(--bio-letter,var(--dfaint)) 55%,var(--mk-ink));stroke-width:1;filter:var(--mk-contact)}
.mech-bead-hi{fill:var(--mk-ball,none);pointer-events:none}
.mech-nt.mech-hot{filter:var(--mk-glow)}
.mech-bead.mech-hot{filter:var(--mk-glow)}
.mech-passed{opacity:.7}
.mech-nt{transition:opacity .4s ease}
.mech-rail{stroke:var(--mk-line);stroke-width:5;stroke-linecap:round}
.mech-rail-hi{stroke:#fff;stroke-opacity:calc(var(--mk-sheen,.45) * .7);stroke-width:1.3;stroke-linecap:round}
.mech-phos{fill:none;stroke:var(--mk-phos);stroke-linecap:round}
.mech-rail-end{fill:var(--mk-line);stroke:var(--mk-line);stroke-width:1;stroke-linejoin:round}
.mech-rung{stroke:color-mix(in srgb,var(--bio-letter,var(--mk-rung)) 42%,var(--mk-rung));stroke-width:2;stroke-linecap:round}
.mech-hb{fill:none;stroke:var(--mk-hb);stroke-width:1;stroke-linecap:round;opacity:.9}
@media screen{
body.sk-pastel .mech-t-nt{fill:color-mix(in srgb,var(--bio-letter,var(--dfaint)) 50%,#24324A)}
body.sk-pastel .mech-ntbg{fill:color-mix(in srgb,var(--bio-letter,var(--mk-mute)) 11%,#fff);stroke:color-mix(in srgb,var(--bio-letter,var(--mk-mute)) 30%,#fff)}
body.sk-pastel .mech-ntbg.mech-hot{fill:color-mix(in srgb,var(--bio-letter,var(--mk-mute)) 20%,#fff);stroke:color-mix(in srgb,#5263B9 72%,#fff);stroke-width:1.25}
body.sk-pastel .mech-t-nt.mech-hot{filter:none}
body.sk-pastel .mech-passed{opacity:.72}
body.sk-pastel .mech-t-nt.mech-passed{fill:#526077}
body.sk-pastel .mech-rung{stroke:color-mix(in srgb,var(--bio-letter,var(--mk-rung)) 40%,#C9D2E1)}
body.sk-blueprint .mech-rail{stroke-width:1.5;stroke-linecap:square}
body.sk-blueprint .mech-rail-hi{display:none}
body.sk-blueprint .mech-ntbg{fill:var(--mk-tile,#04234A);stroke:color-mix(in srgb,var(--bio-letter,#7FE3FF) 55%,transparent);rx:0}
body.sk-blueprint .mech-ntbg.mech-hot{fill:color-mix(in srgb,var(--bio-letter,#7FE3FF) 24%,var(--mk-tile,#04234A));stroke:var(--bio-letter,#7FE3FF);stroke-width:1.5}
body.sk-blueprint .mech-phos{display:none}
body.sk-blueprint .mech-rail-end{fill:none;stroke-width:1.5;stroke-linejoin:miter}
}
.mech-site{fill:color-mix(in srgb,var(--bio-tone,var(--mk-acc)) 7%,transparent);stroke:color-mix(in srgb,var(--bio-tone,var(--mk-acc)) 80%,transparent);stroke-width:1.25;stroke-dasharray:4 3;stroke-linecap:round;transition:fill .4s ease}
.mech-site.hot{fill:color-mix(in srgb,var(--bio-tone,var(--mk-acc)) 15%,transparent);stroke:var(--bio-tone,var(--mk-acc));stroke-width:2;stroke-dasharray:none;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--bio-tone,var(--mk-acc)) 35%,transparent))}
.mech-ripple circle{transform-box:view-box;transform-origin:var(--mx) var(--my);fill:none;stroke:var(--mk-acc);stroke-width:2;animation:mechRipple .9s cubic-bezier(.16,1,.3,1) both;animation-delay:inherit}
.mech-ripple .mech-rip-b{stroke-width:1.5;animation-duration:.7s}
.mech-ripple.k-cut circle,.mech-ripple.k-flash circle{stroke:var(--mk-bad)}
.mech-ripple.k-signal circle{stroke:var(--mk-warn)}
.mech-ripple .mech-rip-fill{fill:color-mix(in srgb,var(--mk-bad) 32%,transparent);stroke:none;animation:mechFlash .42s ease-out both}
.mech-spark{fill:none;stroke:var(--mk-bad);stroke-width:1.75;stroke-linecap:round;transform-box:view-box;transform-origin:var(--mx) var(--my);animation:mechSpark .65s cubic-bezier(.16,1,.3,1) both;animation-delay:inherit}
.mech-cutmark line{stroke:var(--mk-bad);stroke-width:2.5;stroke-linecap:round;stroke-dasharray:3 3;animation:mechFlash 1.2s ease-out both;animation-delay:inherit}
.mech-appear{animation:mechAppear .5s cubic-bezier(.16,1,.3,1) both}
@keyframes mechRipple{0%{transform:scale(1);opacity:1}100%{transform:scale(5);opacity:0}}
@keyframes mechFlash{0%{opacity:0}20%{opacity:1}100%{opacity:0}}
@keyframes mechAppear{0%{opacity:0}100%{opacity:1}}
@keyframes mechSpark{0%{transform:scale(.45);opacity:0}22%{opacity:1}100%{transform:scale(1.45);opacity:0}}
.mech-aside{min-width:0}
.mech-legend{list-style:none;display:flex;flex-wrap:wrap;gap:4px 14px;margin:10px 0 0;padding:0;font-size:12px;color:var(--dtext)}
.mech-chip{display:inline-flex;align-items:center;gap:6px;min-height:20px}
.mech-chip.dv-chip-pulse{animation:dvchippulse .58s ease-out}
.mech-sw{display:inline-block;flex:none;width:10px;height:10px;border-radius:3px;background:linear-gradient(180deg,color-mix(in srgb,var(--mf) 72%,#fff),var(--mf) 70%);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--me) 75%,var(--mf))}
.mech-legend .mech-sw.mech-sw-dashed{width:12px;height:10px;border-radius:1px;box-shadow:none;background:linear-gradient(90deg,var(--me) 0 3.5px,transparent 3.5px 4.75px,var(--me) 4.75px 7.25px,transparent 7.25px 8.5px,var(--me) 8.5px) top/100% 1.5px no-repeat,linear-gradient(90deg,var(--me) 0 3.5px,transparent 3.5px 4.75px,var(--me) 4.75px 7.25px,transparent 7.25px 8.5px,var(--me) 8.5px) bottom/100% 1.5px no-repeat,linear-gradient(180deg,var(--me) 0 3.5px,transparent 3.5px 6.5px,var(--me) 6.5px) left/1.5px 100% no-repeat,linear-gradient(180deg,var(--me) 0 3.5px,transparent 3.5px 6.5px,var(--me) 6.5px) right/1.5px 100% no-repeat,color-mix(in srgb,var(--me) 12%,transparent)}
.mech-st{font:500 11px 'IBM Plex Sans',sans-serif;color:#8DA2C6;font-variant-numeric:tabular-nums}
.mech-st.hot{color:#8AE8FF;font-weight:600;display:inline-flex;align-items:center;gap:4px}
.mech-st.hot::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}
@media screen{
body.sk-pastel .mech-sw{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--mf) 70%,#24324A)}
body.sk-pastel .mech-st,.sk-daylight .mech-st,body.sk-editorial .mech-st{color:#5F6C84}
body.sk-pastel .mech-st.hot,.sk-daylight .mech-st.hot,body.sk-editorial .mech-st.hot{color:#3D4C9E}
body.sk-blueprint .mech-sw{border-radius:0;background:color-mix(in srgb,var(--mf) 28%,transparent);box-shadow:inset 0 0 0 1.5px var(--mf)}
body.sk-blueprint .mech-st{color:#94BCD5}
body.sk-blueprint .mech-st.hot{color:#7FE3FF}
}
.mech-box .swnote{margin-top:8px}
@media (prefers-reduced-motion: reduce){.mech-move,.mech-nt,.mech-ntbg,.mech-site,.mech-actor>path{transition:none}.mech-transient{display:none}.mech-appear{animation:none}}
@media print{.mech-transient{display:none}.mech-frame,.mech-sw,.mech-site,.mech-ntbg{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`,
  authoring: {
    initialFields: true,
    transientFields: ['caption', 'highlight', 'camera', 'labels', 'events'],
    template: {
      title: 'Strand scene', label: 'restriction cut', sequence: 'ACGTTGCAGAATTCTAGGCATCGA', strands: 2,
      sites: [{ id: 's1', from: 9, to: 14, label: 'cleavage site', cutAfter: { upper: 9, lower: 13 } }],
      actors: [{ id: 'enz', role: 'enzyme', label: 'enzyme', start: { at: { x: 470, y: 60 }, state: 'free' } }],
      initial: { caption: 'Recognition site marked.' },
    },
    setupFields: [
      ['label', 'text'], ['sequence', 'text'], ['alphabet', 'text'], ['strands', 'num'], ['lower', 'text'], ['start', 'num'], ['beads', 'jsonAny'],
      ['sites', 'jsonArr'], ['actors', 'jsonArr'], ['initial', 'json'],
    ],
    patchFields: [
      ['actors', 'json'], ['events', 'jsonArr'], ['caption', 'text'], ['highlight', 'text'], ['labels', 'jsonArr'], ['camera', 'json'], ['paired', 'bool'], ['note', 'text'],
    ],
    fieldMeta: {
      label: { label: 'Scene title', help: 'Short title drawn inside the frame.' },
      sequence: { label: 'Upper strand', help: '6–60 letters (whitespace ignored); letters outside the alphabet render as unknown.' },
      alphabet: { label: 'Alphabet', help: 'dna (default) or rna; protein only with beads.' },
      strands: { label: 'Strands', help: '1 (default) or 2. With 2 the lower strand is the reverse complement unless Lower strand gives letters.' },
      lower: { label: 'Lower strand', help: 'Explicit lower-strand letters of the same length as the upper strand (optional).' },
      start: { label: 'First coordinate', help: '1-based coordinate of letter 1; default 1.' },
      beads: { label: 'Beads', help: 'true draws numbered beads instead of letters for protein-level cartoons.' },
      sites: { label: 'Sites', help: 'Up to 8 {id,from,to,label?,tone?,cutAfter?:{upper,lower?}} ranges; cutAfter names the letter after which each strand is cut.' },
      actors: { label: 'Actors', help: 'Setup: 1–6 {id,role,shape?,label?,size?,start?:{at?,state?}}. In a step an object keyed by actor id patches at/state/label per actor; null for an id resets that actor to its declared start.', nullLabel: 'Declared starts' },
      events: { label: 'Events', help: 'Up to 4 one-shot events for this step only: {kind:"cut",site}, {kind:"join",site}, {kind:"extend",strand,letters}, {kind:"pair"}, {kind:"unwind",from,to}, {kind:"flash",at}. Their consequences (cuts, extended letters, pairing) carry.' },
      caption: { label: 'Caption', help: 'One line under the title inside the frame.', nullLabel: 'No caption' },
      highlight: { label: 'Highlighted site', help: 'Site id drawn brighter.', nullLabel: 'None' },
      labels: { label: 'Callouts', help: 'Full snapshot of up to 4 {at: coordinate | {x,y}, text} tags, e.g. product names.', nullLabel: 'No callouts' },
      camera: { label: 'Camera window', help: '{from,to}: only these coordinates render and the strand re-centres on them.', nullLabel: 'Whole strand' },
      paired: { label: 'Second strand paired', help: 'false hides the lower strand until a pair event (two-strand scenes only).', nullLabel: 'Default' },
      note: { label: 'Explanation' },
    },
    picker: {
      order: 46, name: 'Strand scene', category: 'Science & sequencing',
      tagline: 'Molecules act on a strand',
      description: 'Animate one or two lettered strands with named sites and actors that scan, bind, cut, join, extend, pair and unwind them, one beat per step.',
    },
    example: function (sample) {
      var panel = sample.panel, state = sample.state;
      state.actors = { enz: { at: 11, state: 'bound' } };
      state.highlight = 's1';
      state.caption = 'The enzyme binds at the site.';
      panel.initial = builderClone(state);
      return sample;
    },
  },
});
