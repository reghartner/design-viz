/* Reading frames: a nucleotide sequence with its three forward frames
   translated to one-letter amino acids, stop codons marked and a chosen
   protein motif highlighted. Teaching display only: translation uses the
   standard genetic code in ../bio.js and every value is authored. Range and
   mark helpers (seqRangeWarnings, seqMarkWarnings, seqCleanMarks, seqLetters,
   bioLegendHTML) come from sequence.js and are called lazily, never at
   registration time. */
var FRAMES_MAX_SEQUENCE = 120,
  FRAMES_MIN_SEQUENCE = 3,
  FRAMES_MAX_MOTIF = 12,
  FRAMES_STATE_KEYS = ['frame', 'marks', 'motif', 'showStops', 'note', 'enterOnce'];

function framesAlphabet(panel) {
  return panel.alphabet === 'rna' ? 'rna' : 'dna';
}
/* 1, 2, 3 (numbers or numeric strings from the editor's select) or "all". */
function framesFrame(value) {
  if (value === 1 || value === 2 || value === 3) return value;
  if (value === '1' || value === '2' || value === '3') return Number(value);
  return 'all';
}
function framesFrameValid(value) {
  return value == null || value === 'all' || framesFrame(value) !== 'all';
}
/* Upper-cased motif of 1–12 amino-acid letters (X = any residue), or null. */
function framesMotif(value) {
  if (typeof value !== 'string') return null;
  var motif = value.replace(/\s+/g, '').toUpperCase();
  if (!motif.length || motif.length > FRAMES_MAX_MOTIF) return null;
  for (var i = 0; i < motif.length; i++) if (BIO_ALPHABETS.protein.indexOf(motif.charAt(i)) < 0) return null;
  return motif;
}
function framesMotifAt(aminoAcids, motif, index) {
  for (var i = 0; i < motif.length; i++) {
    var want = motif.charAt(i), have = aminoAcids.charAt(index + i);
    if (want === 'X' ? have === '*' : have !== want) return false;
  }
  return true;
}
function framesStateWarnings(state, path, panel, warnings) {
  var span = seqSpan(panel, framesAlphabet(panel), FRAMES_MAX_SEQUENCE);
  Object.keys(state).forEach(function (key) {
    if (FRAMES_STATE_KEYS.indexOf(key) < 0) warnings.push(path + '.' + key + ': unknown field — ignored');
  });
  if (panelOwn(state, 'frame') && !framesFrameValid(state.frame))
    warnings.push(path + '.frame: expected 1, 2, 3 or "all" — all frames emphasised');
  if (panelOwn(state, 'marks')) seqMarkWarnings(state.marks, path + '.marks', warnings, span);
  if (panelOwn(state, 'motif') && state.motif !== null && framesMotif(state.motif) === null)
    warnings.push(path + '.motif: expected 1–' + FRAMES_MAX_MOTIF + ' one-letter amino acids (X = any) — ignored');
  if (panelOwn(state, 'showStops') && state.showStops !== null && typeof state.showStops !== 'boolean')
    warnings.push(path + '.showStops: expected true or false — stops shown');
  if (panelOwn(state, 'note') && state.note !== null && typeof state.note !== 'string')
    warnings.push(path + '.note: expected text — ignored');
}
function framesPatchWarnings(state, path, panel, warnings) {
  softwarePanelPatchWarnings(state, path, panel, warnings, framesStateWarnings);
}
function framesDeclarationWarnings(panel, path, warnings) {
  if (panel.alphabet !== undefined && panel.alphabet !== 'dna' && panel.alphabet !== 'rna')
    warnings.push(path + '.alphabet: expected dna or rna — using dna');
  seqSequenceWarnings(panel, path, warnings, framesAlphabet(panel), FRAMES_MIN_SEQUENCE, FRAMES_MAX_SEQUENCE);
  if (panel.start !== undefined && !seqValidStart(panel.start))
    warnings.push(path + '.start: expected a safe integer ≥ 1 — using 1');
  if (panel.label !== undefined && typeof panel.label !== 'string')
    warnings.push(path + '.label: expected text — ignored');
  framesPatchWarnings(panel.initial, path + '.initial', panel, warnings);
}

/* Pure display model. `letters` are nucleotides with coordinates and the
   topmost mark tone; each frame lists whole codons (`at` is the zero-based
   index of the codon's first letter, `coord` its 1-based coordinate); a
   trailing partial codon is omitted. `motifMatches[].at` is the `at` of the
   match's first codon and `length` counts codons. */
function framesModel(panel, state) {
  state = panelObject(state) ? state : {};
  var alphabet = framesAlphabet(panel),
    seq = seqText(panel, alphabet, FRAMES_MAX_SEQUENCE),
    text = seq.text,
    start = seqStart(panel),
    span = { first: start, last: start + text.length - 1, length: text.length },
    marks = seqCleanMarks(state.marks, span),
    frame = framesFrame(state.frame),
    showStops = state.showStops !== false,
    motif = framesMotif(state.motif),
    letters = seqLetters(text, seq.invalid, span.first, marks),
    motifMatches = [],
    stops = 0;
  var frames = [1, 2, 3].map(function (index) {
    var codons = bioTranslate(text, index - 1).map(function (codon) {
      if (codon.stop) stops++;
      return { at: codon.at, coord: span.first + codon.at, codon: codon.codon, aa: codon.aa, stop: codon.stop, motif: false };
    });
    return { index: index, offset: index - 1, codons: codons, active: frame === 'all' || frame === index,
      trailing: Math.max(0, text.length - (index - 1) - codons.length * 3) };
  });
  if (motif) frames.forEach(function (row) {
    var aminoAcids = row.codons.map(function (codon) { return codon.aa; }).join('');
    for (var i = 0; i + motif.length <= aminoAcids.length; i++) {
      if (!framesMotifAt(aminoAcids, motif, i)) continue;
      motifMatches.push({ frame: row.index, at: row.codons[i].at, length: motif.length });
      for (var j = i; j < i + motif.length; j++) row.codons[j].motif = true;
    }
  });
  return {
    alphabet: alphabet,
    label: typeof panel.label === 'string' ? panel.label : '',
    start: start, length: span.length, first: span.first, last: span.last, text: text,
    frame: frame, showStops: showStops, motif: motif, stops: stops,
    letters: letters, frames: frames, marks: marks, legend: seqLegend(marks), motifMatches: motifMatches,
    invalid: seq.invalid.length,
    note: typeof state.note === 'string' ? state.note : '',
  };
}
function framesSummary(model) {
  var parts = [(model.label || 'Reading frames') + ': ' + model.alphabet.toUpperCase()];
  if (!model.length) parts.push('no letters');
  else {
    parts.push('positions ' + bioFormatCoord(model.first) + '–' + bioFormatCoord(model.last));
    parts.push(model.frame === 'all' ? 'all three frames' : 'frame ' + model.frame + ' emphasised');
    if (model.showStops) parts.push(model.stops + (model.stops === 1 ? ' stop codon' : ' stop codons'));
    if (model.motif) parts.push('motif ' + model.motif + ' matches ' + model.motifMatches.length + (model.motifMatches.length === 1 ? ' time' : ' times'));
    if (model.marks.length) parts.push(model.marks.length + (model.marks.length === 1 ? ' mark' : ' marks'));
  }
  return parts.join(', ');
}
function framesHTML(panel, state) {
  var model = framesModel(panel, state);
  var h = '<div class="frm-panel" role="group" aria-label="' + esc(framesSummary(model)) + '">';
  h += '<div class="frm-head">' + (model.label ? '<span class="frm-label">' + esc(model.label) + '</span>' : '') +
    '<span class="frm-meta">' + model.alphabet.toUpperCase() +
    (model.length ? ' · ' + bioFormatCoord(model.first) + '–' + bioFormatCoord(model.last) : '') +
    (model.frame === 'all' ? '' : ' · frame ' + model.frame) +
    (model.motif ? ' · motif ' + esc(model.motif) + ' ×' + model.motifMatches.length : '') + '</span></div>';
  if (!model.length) return h + '<div class="frm-empty">No sequence declared.</div></div>';
  var blank = '<span class="frm-blank"></span>';
  h += '<div class="frm-scroll"><div class="frm-grid" style="--frm-cols:' + model.length + '">';
  h += '<span class="frm-gutter frm-gutter-ruler">' + bioFormatCoord(model.first) + '</span>' + seqRulerHTML(model.letters, 'frm-tick');
  h += '<span class="frm-gutter">nt</span>' + model.letters.map(function (letter) {
    return '<span class="' + letter.cls + ' frm-nt"' + (letter.unknown ? ' title="Not in the ' + model.alphabet + ' alphabet"' : '') + '>' + esc(letter.ch) + '</span>';
  }).join('');
  if (model.marks.length)
    h += '<span class="frm-gutter" aria-hidden="true"></span>' + model.letters.map(function (letter) {
      return '<span class="frm-bandcell' + (letter.tone ? ' bio-tone-' + letter.tone : '') + '"></span>';
    }).join('');
  model.frames.forEach(function (row) {
    var dim = row.active ? '' : ' frm-dim';
    h += '<span class="frm-gutter frm-gutter-frame' + dim + '" title="Frame ' + row.index + '">F' + row.index + '</span>';
    for (var i = 0; i < row.offset; i++) h += blank;
    row.codons.forEach(function (codon) {
      var quiet = codon.stop && !model.showStops;
      h += '<span class="frm-codon bio-protein' + dim + (codon.stop && model.showStops ? ' bio-tone-bad frm-stop' : '') +
        (codon.motif ? ' bio-tone-motif frm-motif' : '') + '" title="' + esc(codon.codon + ' → ' + (codon.stop ? 'stop' : codon.aa) + ' at ' + bioFormatCoord(codon.coord)) + '">' +
        (quiet ? '<span class="frm-quiet">·</span>' : '<span class="' + bioLetterClass(codon.aa) + '">' + esc(codon.aa) + '</span>') + '</span>';
    });
    for (var t = 0; t < row.trailing; t++) h += blank;
  });
  h += '</div></div>';
  h += bioLegendHTML(model.legend);
  if (model.motif || (model.showStops && model.stops))
    h += '<div class="frm-key">' + (model.showStops && model.stops ? '<span class="bio-key"><i class="bio-tone-bad" aria-hidden="true"></i>stop codon</span>' : '') +
      (model.motif ? '<span class="bio-key"><i class="bio-tone-motif" aria-hidden="true"></i>motif ' + esc(model.motif) + ' <small>' + model.motifMatches.length + (model.motifMatches.length === 1 ? ' match' : ' matches') + '</small></span>' : '') + '</div>';
  return softwarePanelShell(h + '</div>', { note: model.note });
}

PanelRegistry.define('frames', {
  label: 'Reading frames',
  since: '0.2.0',
  order: 42,
  validateDeclaration: framesDeclarationWarnings,
  validatePatch: framesPatchWarnings,
  fold: function (panel, steps) {
    return foldCommonPanelStates(panel, steps, {
      accept: {
        frame: function (value) { return value === null || framesFrameValid(value); },
        marks: function (value) { return value === null || Array.isArray(value); },
        motif: function (value) { return value === null || typeof value === 'string'; },
        showStops: function (value) { return value === null || typeof value === 'boolean'; },
        note: function (value) { return value === null || typeof value === 'string'; },
      },
    });
  },
  render: function (host, panel, state) { return { html: framesHTML(panel, state) }; },
  presentation: { ambientInitial: true },
  layout: {
    sectionSizing: { minWidth: 320, preferredWidth: 520, maxWidth: 1000, aspectPolicy: 'content', grow: 1 },
    height: 9, fallbackHeight: 9,
  },
  styles: String.raw`
.frm-panel{color:var(--dtext);min-width:0}
.frm-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin-bottom:6px}
.frm-label{font-weight:600;color:var(--dink)}
.frm-meta{font-size:10px;letter-spacing:.4px;color:var(--dfaint)}
.frm-empty{font-size:10.5px;color:var(--dfaint)}
.frm-scroll{overflow-x:auto;padding-bottom:2px}
.frm-grid{display:grid;grid-template-columns:auto repeat(var(--frm-cols),minmax(11px,1fr));align-items:end;column-gap:0;row-gap:3px;min-width:0}
.frm-gutter{padding-right:8px;text-align:right;font:500 10px/1.4 'IBM Plex Mono',monospace;color:var(--dfaint);font-variant-numeric:tabular-nums;white-space:nowrap;align-self:center}
.frm-gutter-ruler{align-self:end}
.frm-gutter-frame{font-weight:700;color:var(--dink)}
.frm-tick{position:relative;height:4px;border-left:1px solid color-mix(in srgb,var(--dtext) 18%,transparent);margin-top:12px}
.frm-tick.seq-tick-n{height:7px;border-left-color:color-mix(in srgb,var(--dtext) 45%,transparent)}
.frm-tick.seq-tick-n i{position:absolute;left:0;bottom:7px;transform:translateX(-50%);font:500 9px/1 'IBM Plex Mono',monospace;font-style:normal;color:var(--dfaint);white-space:nowrap}
.frm-nt{display:block;overflow:hidden}
.frm-bandcell{display:block;height:5px;border-top:1px solid transparent}
.frm-blank{display:block;height:20px}
.frm-codon{grid-column:span 3;display:flex;align-items:center;justify-content:center;height:20px;border-radius:3px;border:1px solid transparent;background:color-mix(in srgb,var(--dtext) 6%,transparent);transition:opacity .3s ease,background-color .3s ease;overflow:hidden}
.frm-codon .bio-b{display:block;overflow:hidden}
.frm-stop{border-style:solid}
.frm-motif{border-style:solid}
.frm-quiet{color:var(--dfaint);font:600 13px/1 'IBM Plex Mono',monospace}
.frm-dim{opacity:.3}
.frm-key{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:6px;font-size:10.5px}
@media (prefers-reduced-motion: reduce){.frm-codon{transition:none}}
@media print{.frm-scroll{overflow:visible}.frm-codon{-webkit-print-color-adjust:exact;print-color-adjust:exact}}

/* Content hierarchy and intrinsic fit; authored state and saved geometry stay authoritative. */
.frm-head{padding-bottom:9px;margin-bottom:9px;border-bottom:1px solid color-mix(in srgb,var(--dtext) 15%,transparent)}.frm-grid{row-gap:6px}.frm-gutter{color:var(--dtext)}.frm-scroll{scrollbar-width:thin}
`,
  authoring: {
    initialFields: true,
    transientFields: ['frame', 'marks', 'motif', 'showStops'],
    template: {
      title: 'Reading frames', label: 'ORF candidate', alphabet: 'dna', start: 1,
      sequence: 'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG',
      initial: { frame: 'all', showStops: true },
    },
    setupFields: [['label', 'text'], ['sequence', 'text'], ['alphabet', 'text'], ['start', 'num'], ['initial', 'json']],
    patchFields: [['frame', 'enum', ['all', '1', '2', '3']], ['motif', 'text'], ['showStops', 'bool'], ['marks', 'json'], ['note', 'text']],
    fieldMeta: {
      label: { label: 'Track label', help: 'Short name shown before the ruler, e.g. ORF candidate.' },
      sequence: { label: 'Sequence', help: '3–120 nucleotides (whitespace ignored). Letters outside the alphabet translate to X.' },
      alphabet: { label: 'Alphabet', help: 'dna (ACGTN, default) or rna (ACGUN).' },
      start: { label: 'First coordinate', help: '1-based coordinate of the first nucleotide; default 1.' },
      frame: { label: 'Emphasised frame', help: 'Dim the other two frames to focus on one; all keeps every frame bright.', nullLabel: 'All frames' },
      motif: { label: 'Protein motif', help: 'Up to 12 one-letter amino acids; X matches any residue (e.g. RXXR). Every match in every frame is highlighted.', nullLabel: 'No motif' },
      showStops: { label: 'Mark stop codons', help: 'Default true: stop codons show * on a red cell. False shows a quiet dot instead.', nullLabel: 'Default (shown)' },
      marks: { label: 'Highlighted ranges', help: 'Full snapshot of up to 24 nucleotide ranges {id,from,to,tone?,label?}, e.g. an inserted stretch.', nullLabel: 'No marks' },
      note: { label: 'Explanation' },
    },
    picker: {
      order: 42, name: 'Reading frames', category: 'Science & sequencing',
      tagline: 'Three frames, stops and a motif',
      description: 'Translate a short nucleotide sequence in all three forward reading frames, emphasise one frame, mark stop codons and highlight a protein motif to teach frameshifts.',
    },
    example: function (sample) {
      var panel = sample.panel, state = sample.state;
      panel.label = 'ORF candidate';
      state.frame = '1';
      state.motif = 'MXXV';
      state.marks = [{ id: 'insert', from: 13, to: 15, tone: 'insert', label: 'Second ATG' }];
      panel.initial = builderClone(state);
      return sample;
    },
  },
});
