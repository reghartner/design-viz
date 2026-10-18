/* Sequence track: one short nucleotide or protein sequence as monospace
   letters with a coordinate ruler, highlighted ranges, a cursor, a zoom window
   and a reveal boundary. Every value is authored in the spec; nothing is
   computed from data files. Shared alphabet, range and tone rules live in
   ../bio.js. The mark/range helpers below (seqRangeWarnings, seqMarkWarnings,
   seqCleanMarks, seqLetters) are reused by the frames panel. */
var SEQ_MAX_MARKS = 24,
  SEQ_WRAP_MIN = 20,
  SEQ_WRAP_MAX = 120,
  SEQ_WRAP_DEFAULT = 60,
  SEQ_STATE_KEYS = ['marks', 'cursor', 'window', 'reveal', 'note', 'enterOnce'];

/* `start` must leave room for the longest sequence without leaving the safe
   integer range, so every printed coordinate is exact. */
function seqValidStart(value) {
  return bioPosition(value) && value <= Number.MAX_SAFE_INTEGER - BIO_MAX_SEQUENCE;
}
function seqStart(panel) {
  return seqValidStart(panel.start) ? panel.start : 1;
}
/* Clean letters capped at `max`, with zero-based positions of letters the
   alphabet rejects (those render as unknown). */
function seqText(panel, alphabet, max) {
  var normalized = bioNormalizeSequence(panel.sequence, alphabet);
  return {
    text: normalized.text.slice(0, max),
    invalid: normalized.invalid.filter(function (index) { return index < max; }),
  };
}
/* The coordinate span of the declared letters: {first, last, length}. */
function seqSpan(panel, alphabet, max) {
  var text = seqText(panel, alphabet, max).text, start = seqStart(panel);
  return { first: start, last: start + text.length - 1, length: text.length };
}
function seqWithin(value, span) {
  return !span.length || (value >= span.first && value <= span.last);
}
function seqSequenceWarnings(panel, path, warnings, alphabet, min, max) {
  var at = path + '.sequence';
  if (typeof panel.sequence !== 'string') {
    warnings.push(at + ': expected a string of ' + min + '–' + max + ' letters — panel renders empty');
    return;
  }
  var normalized = bioNormalizeSequence(panel.sequence, alphabet);
  if (normalized.text.length < min)
    warnings.push(at + ': expected ' + min + '–' + max + ' letters — ' + (normalized.text.length ? 'nothing to translate' : 'panel renders empty'));
  else if (normalized.text.length > max)
    warnings.push(at + ': only the first ' + max + ' of ' + normalized.text.length + ' letters render');
  var invalid = normalized.invalid.filter(function (index) { return index < max; });
  if (invalid.length)
    warnings.push(at + ': ' + invalid.length + (invalid.length === 1 ? ' letter is' : ' letters are') + ' not in the ' + alphabet +
      ' alphabet (letter ' + invalid.slice(0, 6).map(function (index) { return index + 1; }).join(', ') + (invalid.length > 6 ? ', …' : '') + ') — shown as unknown');
}
/* One {from,to} range in sequence coordinates. Returns the clean range or
   null after naming the exact field that failed. */
function seqRangeWarnings(value, at, warnings, span) {
  if (!panelObject(value)) {
    warnings.push(at + ': expected {from,to} as 1-based inclusive positions — ignored');
    return null;
  }
  var ok = true;
  if (!bioPosition(value.from)) { warnings.push(at + '.from: expected a 1-based safe integer position — ignored'); ok = false; }
  if (!bioPosition(value.to)) { warnings.push(at + '.to: expected a 1-based safe integer position — ignored'); ok = false; }
  if (!ok) return null;
  if (value.from > value.to) {
    warnings.push(at + ': from ' + value.from + ' must be ≤ to ' + value.to + ' — ignored');
    return null;
  }
  if (span.length && (value.to < span.first || value.from > span.last)) {
    warnings.push(at + ': range ' + value.from + '–' + value.to + ' lies outside ' + span.first + '–' + span.last + ' — ignored');
    return null;
  }
  return { from: value.from, to: value.to };
}
function seqMarkWarnings(marks, path, warnings, span) {
  if (marks == null) return;
  if (!Array.isArray(marks)) {
    warnings.push(path + ': expected an array of {id,from,to,tone?,label?} — ignored');
    return;
  }
  if (marks.length > SEQ_MAX_MARKS) warnings.push(path + ': only the first ' + SEQ_MAX_MARKS + ' marks render');
  var seen = Object.create(null);
  marks.slice(0, SEQ_MAX_MARKS).forEach(function (mark, i) {
    var at = path + '[' + i + ']';
    if (!panelObject(mark) || typeof mark.id !== 'string' || !mark.id) {
      warnings.push(at + '.id: needs a non-empty string — mark skipped');
      return;
    }
    if (seen[mark.id]) warnings.push(at + '.id: duplicate id "' + mark.id + '" — later mark skipped');
    seen[mark.id] = true;
    seqRangeWarnings(mark, at, warnings, span);
    if (mark.tone != null && BIO_TONES.indexOf(mark.tone) < 0)
      warnings.push(at + '.tone: expected one of ' + BIO_TONES.join(' ') + ' — using neutral');
    if (mark.label != null && typeof mark.label !== 'string')
      warnings.push(at + '.label: expected text — ignored');
  });
}
/* Valid marks clipped to the span, in authored order (later marks draw on
   top). Mirrors seqMarkWarnings without reporting. */
function seqCleanMarks(marks, span) {
  var seen = Object.create(null), out = [];
  if (!Array.isArray(marks) || !span.length) return out;
  marks.slice(0, SEQ_MAX_MARKS).forEach(function (mark) {
    if (!panelObject(mark) || typeof mark.id !== 'string' || !mark.id || seen[mark.id]) return;
    seen[mark.id] = true;
    var range = bioRange(mark, '', null, span.first, span.last);
    if (!range) return;
    out.push({
      id: mark.id,
      from: Math.max(range.from, span.first),
      to: Math.min(range.to, span.last),
      tone: bioTone(mark.tone),
      label: typeof mark.label === 'string' ? mark.label : '',
    });
  });
  return out;
}
/* Per-letter display records. `tone` is the topmost mark covering the letter
   (null when none); `tick` marks a ruler number every ten coordinates. */
function seqLetters(text, invalid, first, marks) {
  var unknown = Object.create(null);
  invalid.forEach(function (index) { unknown[index] = true; });
  var letters = [];
  for (var i = 0; i < text.length; i++) {
    var coord = first + i, tone = null, markId = null;
    for (var m = 0; m < marks.length; m++)
      if (coord >= marks[m].from && coord <= marks[m].to) { tone = marks[m].tone; markId = marks[m].id; }
    letters.push({
      ch: text.charAt(i), coord: coord, index: i,
      cls: unknown[i] ? 'bio-b bio-b-x' : bioLetterClass(text.charAt(i)),
      unknown: !!unknown[i], tone: tone, markId: markId, tick: coord % 10 === 0,
    });
  }
  return letters;
}
function seqLegend(marks) {
  return marks.filter(function (mark) { return mark.label; });
}

function sequenceStateWarnings(state, path, panel, warnings) {
  var span = seqSpan(panel, bioAlphabet(panel.alphabet), BIO_MAX_SEQUENCE);
  Object.keys(state).forEach(function (key) {
    if (SEQ_STATE_KEYS.indexOf(key) < 0) warnings.push(path + '.' + key + ': unknown field — ignored');
  });
  if (panelOwn(state, 'marks')) seqMarkWarnings(state.marks, path + '.marks', warnings, span);
  if (panelOwn(state, 'cursor') && state.cursor !== null && !(bioPosition(state.cursor) && seqWithin(state.cursor, span)))
    warnings.push(path + '.cursor: expected a 1-based position' + (span.length ? ' between ' + span.first + ' and ' + span.last : '') + ' or null — cursor hidden');
  if (panelOwn(state, 'window') && state.window !== null) seqRangeWarnings(state.window, path + '.window', warnings, span);
  if (panelOwn(state, 'reveal') && state.reveal !== null && !(bioCount(state.reveal) && state.reveal <= span.length))
    warnings.push(path + '.reveal: expected an integer 0–' + span.length + ' or null — all letters shown');
  if (panelOwn(state, 'note') && state.note !== null && typeof state.note !== 'string')
    warnings.push(path + '.note: expected text — ignored');
}
function sequencePatchWarnings(state, path, panel, warnings) {
  softwarePanelPatchWarnings(state, path, panel, warnings, sequenceStateWarnings);
}
function sequenceDeclarationWarnings(panel, path, warnings) {
  var alphabet = bioAlphabet(panel.alphabet);
  if (panel.alphabet !== undefined && BIO_ALPHABET_NAMES.indexOf(panel.alphabet) < 0)
    warnings.push(path + '.alphabet: expected dna, rna or protein — using dna');
  seqSequenceWarnings(panel, path, warnings, alphabet, 1, BIO_MAX_SEQUENCE);
  if (panel.start !== undefined && !seqValidStart(panel.start))
    warnings.push(path + '.start: expected a safe integer ≥ 1 — using 1');
  if (panel.strand !== undefined && panel.strand !== '+' && panel.strand !== '-')
    warnings.push(path + '.strand: expected "+" or "-" — using +');
  if (panel.label !== undefined && typeof panel.label !== 'string')
    warnings.push(path + '.label: expected text — ignored');
  if (panel.wrap !== undefined && !(Number.isSafeInteger(panel.wrap) && panel.wrap >= SEQ_WRAP_MIN && panel.wrap <= SEQ_WRAP_MAX))
    warnings.push(path + '.wrap: expected an integer ' + SEQ_WRAP_MIN + '–' + SEQ_WRAP_MAX + ' — using ' + SEQ_WRAP_DEFAULT);
  sequencePatchWarnings(panel.initial, path + '.initial', panel, warnings);
}

/* Pure display model for one folded snapshot. Coordinates are 1-based and
   inclusive; `rows` chunk the visible letters by `wrap`. */
function sequenceModel(panel, state) {
  state = panelObject(state) ? state : {};
  var alphabet = bioAlphabet(panel.alphabet),
    seq = seqText(panel, alphabet, BIO_MAX_SEQUENCE),
    text = seq.text,
    start = seqStart(panel),
    span = { first: start, last: start + text.length - 1, length: text.length },
    wrap = Number.isSafeInteger(panel.wrap) && panel.wrap >= SEQ_WRAP_MIN && panel.wrap <= SEQ_WRAP_MAX ? panel.wrap : SEQ_WRAP_DEFAULT,
    marks = seqCleanMarks(state.marks, span),
    cursor = bioPosition(state.cursor) && span.length && seqWithin(state.cursor, span) ? state.cursor : null,
    window = span.length ? bioRange(state.window, '', null, span.first, span.last) : null,
    reveal = bioCount(state.reveal) && state.reveal <= span.length ? state.reveal : null;
  if (window) window = { from: Math.max(window.from, span.first), to: Math.min(window.to, span.last) };
  var from = window ? window.from : span.first,
    to = window ? window.to : span.last,
    letters = seqLetters(text, seq.invalid, span.first, marks).filter(function (letter) {
      return letter.coord >= from && letter.coord <= to;
    });
  letters.forEach(function (letter) {
    letter.revealed = reveal === null || letter.index < reveal;
    letter.cursor = letter.coord === cursor;
  });
  var rows = [];
  for (var i = 0; i < letters.length; i += wrap) {
    var chunk = letters.slice(i, i + wrap), cursorAt = -1;
    chunk.forEach(function (letter, index) { if (letter.cursor) cursorAt = index; });
    rows.push({ from: chunk[0].coord, to: chunk[chunk.length - 1].coord, letters: chunk, cursorAt: cursorAt });
  }
  return {
    alphabet: alphabet,
    strand: panel.strand === '-' ? '-' : '+',
    label: typeof panel.label === 'string' ? panel.label : '',
    start: start, length: span.length, first: span.first, last: span.last, text: text,
    wrap: wrap, window: window, from: from, to: to,
    hiddenBefore: span.length ? from - span.first : 0,
    hiddenAfter: span.length ? span.last - to : 0,
    reveal: reveal, cursor: cursor, marks: marks, legend: seqLegend(marks),
    rows: rows, invalid: seq.invalid.length,
    note: typeof state.note === 'string' ? state.note : '',
  };
}
function seqSummary(model) {
  var parts = [(model.label || 'Sequence') + ': ' + model.alphabet.toUpperCase() + ', ' + model.strand + ' strand'];
  if (!model.length) parts.push('no letters');
  else {
    parts.push('positions ' + bioFormatCoord(model.from) + '–' + bioFormatCoord(model.to) +
      (model.window ? ' of ' + bioFormatCoord(model.first) + '–' + bioFormatCoord(model.last) : ''));
    parts.push(model.marks.length + (model.marks.length === 1 ? ' mark' : ' marks'));
    if (model.cursor !== null) parts.push('cursor at ' + bioFormatCoord(model.cursor));
    if (model.reveal !== null) parts.push(model.reveal + ' of ' + model.length + ' letters revealed');
  }
  return parts.join(', ');
}
/* Legend markup shared by the sequence-teaching panels (`.bio-legend`). */
function bioLegendHTML(legend) {
  if (!legend.length) return '';
  return '<ul class="bio-legend" aria-label="Highlighted ranges">' + legend.map(function (mark) {
    return '<li class="bio-key"><i class="bio-tone-' + mark.tone + '" aria-hidden="true"></i>' + esc(mark.label) +
      ' <small>' + bioFormatCoord(mark.from) + '–' + bioFormatCoord(mark.to) + '</small></li>';
  }).join('') + '</ul>';
}
function seqRulerHTML(letters, cls) {
  return letters.map(function (letter) {
    return '<span class="' + cls + (letter.tick ? ' seq-tick-n' : '') + '">' +
      (letter.tick ? '<i>' + bioFormatCoord(letter.coord) + '</i>' : '') + '</span>';
  }).join('');
}
/* `dx` is the whole-cell offset from the previously rendered cursor in the
   same row; the shared glide lifecycle then transitions it to zero. */
function sequenceHTML(panel, state, dx) {
  var model = sequenceModel(panel, state);
  var h = '<div class="seq-track' + (model.alphabet === 'protein' ? ' bio-protein' : '') + '" role="group" aria-label="' + esc(seqSummary(model)) + '">';
  h += '<div class="seq-head">' + (model.label ? '<span class="seq-label">' + esc(model.label) + '</span>' : '') +
    '<span class="seq-meta">' + model.alphabet.toUpperCase() + ' · ' + model.strand + ' strand' +
    (model.length ? ' · ' + bioFormatCoord(model.first) + '–' + bioFormatCoord(model.last) : '') + '</span></div>';
  if (!model.length) return h + '<div class="seq-empty">No sequence declared.</div></div>';
  if (model.hiddenBefore) h += '<div class="seq-more">… ' + bioFormatCoord(model.hiddenBefore) + ' more before ' + bioFormatCoord(model.from) + '</div>';
  h += '<div class="seq-rows">';
  model.rows.forEach(function (row) {
    h += '<div class="seq-row" style="--seq-cols:' + row.letters.length + '"><span class="seq-gutter">' + bioFormatCoord(row.from) + '</span><div class="seq-cells">' +
      '<div class="seq-line seq-ruler" aria-hidden="true">' + seqRulerHTML(row.letters, 'seq-tick') + '</div>' +
      '<div class="seq-line seq-letters">' + row.letters.map(function (letter) {
        return '<span class="' + letter.cls + (letter.revealed ? '' : ' seq-dim') + (letter.cursor ? ' seq-at-cursor' : '') + '"' +
          (letter.unknown ? ' title="Not in the ' + model.alphabet + ' alphabet"' : '') + '>' + esc(letter.ch) + '</span>';
      }).join('') + '</div>' +
      '<div class="seq-line seq-band" aria-hidden="true">' + row.letters.map(function (letter, index) {
        var previous = row.letters[index - 1], next = row.letters[index + 1];
        return '<span class="seq-bandcell' + (letter.tone ? ' bio-tone-' + letter.tone : '') +
          (letter.tone && !(previous && previous.markId === letter.markId) ? ' seq-band-start' : '') +
          (letter.tone && !(next && next.markId === letter.markId) ? ' seq-band-end' : '') + '"></span>';
      }).join('') + '</div>';
    if (row.cursorAt >= 0)
      h += '<div class="seq-line seq-cursor-line"><span class="seq-cur" style="--seq-at:' + row.cursorAt +
        (dx ? ';transform:translateX(' + dx * 100 + '%)' : '') + '"><b></b><i>' + bioFormatCoord(model.cursor) + '</i></span></div>';
    h += '</div></div>';
  });
  h += '</div>';
  if (model.hiddenAfter) h += '<div class="seq-more">… ' + bioFormatCoord(model.hiddenAfter) + ' more after ' + bioFormatCoord(model.to) + '</div>';
  h += bioLegendHTML(model.legend) + '</div>';
  return softwarePanelShell(h, { note: model.note });
}

PanelRegistry.define('sequence', {
  label: 'Sequence track',
  since: '0.2.0', unified: true,
  order: 40,
  validateDeclaration: sequenceDeclarationWarnings,
  validatePatch: sequencePatchWarnings,
  fold: function (panel, steps) {
    return foldCommonPanelStates(panel, steps, {
      accept: {
        marks: function (value) { return value === null || Array.isArray(value); },
        cursor: function (value) { return value === null || bioPosition(value); },
        window: function (value) { return value === null || !!bioRange(value); },
        reveal: function (value) { return value === null || bioCount(value); },
        note: function (value) { return value === null || typeof value === 'string'; },
      },
    });
  },
  render: function (host, panel, state, skin, states, stepIdx, animate) {
    var model = sequenceModel(panel, state), previous = host._seqCursor || null, now = null, dx = 0;
    model.rows.forEach(function (row, index) { if (row.cursorAt >= 0) now = { row: index, at: row.cursorAt, from: row.from }; });
    host._seqCursor = now;
    if (animate && previous && now && previous.row === now.row && previous.from === now.from) dx = previous.at - now.at;
    var html = sequenceHTML(panel, state, dx);
    return { html: html, baseline: dx ? sequenceHTML(panel, state, 0) : null, glide: { selector: '.seq-cur', multiple: false } };
  },
  presentation: { ambientInitial: true },
  layout: {
    sectionSizing: { minWidth: 320, preferredWidth: 520, maxWidth: 1000, aspectPolicy: 'content', grow: 1 },
    height: 8, fallbackHeight: 8,
  },
  /* The first block is the shared residue and tone palette. The sequence
     panel owns these `.bio-*` rules; reads, frames, locus, funnel and grid
     reuse the class names and must not redefine them. Letters lean toward
     the skin's text colour through color-mix so one rule reads on light and
     dark skins. `.bio-protein` switches letters to chemistry groups. Each
     `.bio-tone-<tone>` sets `--bio-tone` plus a translucent background and a
     border colour; use `var(--bio-tone)` for solid fills such as SVG. */
  styles: String.raw`
.bio-b{display:inline-block;min-width:0;font:600 13px/1.4 'IBM Plex Mono',monospace;text-align:center;border-radius:2px;color:color-mix(in srgb,var(--bio-letter,var(--dfaint)) 72%,var(--dtext))}
.bio-b-a{--bio-letter:#22c55e}.bio-b-c{--bio-letter:#3b82f6}.bio-b-g{--bio-letter:#f59e0b}.bio-b-t,.bio-b-u{--bio-letter:#ef4444}
.bio-b-n{--bio-letter:#94a3b8}.bio-b-x{--bio-letter:#94a3b8;text-decoration:underline dotted;opacity:.75}
.bio-b-stop{--bio-letter:#ef4444;font-weight:800}
.bio-protein .bio-b-a,.bio-protein .bio-b-v,.bio-protein .bio-b-l,.bio-protein .bio-b-i,.bio-protein .bio-b-m,.bio-protein .bio-b-f,.bio-protein .bio-b-w{--bio-letter:#f59e0b}
.bio-protein .bio-b-s,.bio-protein .bio-b-t,.bio-protein .bio-b-n,.bio-protein .bio-b-q,.bio-protein .bio-b-y{--bio-letter:#22c55e}
.bio-protein .bio-b-k,.bio-protein .bio-b-r,.bio-protein .bio-b-h{--bio-letter:#3b82f6}
.bio-protein .bio-b-d,.bio-protein .bio-b-e{--bio-letter:#ef4444}
.bio-protein .bio-b-g,.bio-protein .bio-b-p,.bio-protein .bio-b-c{--bio-letter:#a855f7}
.bio-protein .bio-b-x{--bio-letter:#94a3b8}
.bio-tone-neutral{--bio-tone:#94a3b8}.bio-tone-accent{--bio-tone:#38bdf8}.bio-tone-insert{--bio-tone:#a78bfa}.bio-tone-mismatch{--bio-tone:#f43f5e}
.bio-tone-motif{--bio-tone:#facc15}.bio-tone-primer{--bio-tone:#2dd4bf}.bio-tone-cut{--bio-tone:#e879f9}.bio-tone-feature{--bio-tone:#3b82f6}
.bio-tone-good{--bio-tone:#22c55e}.bio-tone-bad{--bio-tone:#ef4444}
[class*="bio-tone-"]{background:color-mix(in srgb,var(--bio-tone) 30%,transparent);border-color:var(--bio-tone)}
.bio-legend{list-style:none;display:flex;flex-wrap:wrap;gap:4px 14px;margin:8px 0 0;padding:0;font-size:10.5px;color:var(--dtext)}
.bio-key{display:inline-flex;align-items:center;gap:5px}
.bio-key i{display:inline-block;width:12px;height:8px;border-radius:2px;border:1px solid var(--bio-tone)}
.bio-key small{color:var(--dfaint);font-variant-numeric:tabular-nums}
.seq-track{color:var(--dtext);min-width:0}
.seq-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin-bottom:6px}
.seq-label{font-weight:600;color:var(--dink)}
.seq-meta{font-size:10px;letter-spacing:.4px;color:var(--dfaint)}
.seq-empty,.seq-more{font-size:10.5px;color:var(--dfaint)}
.seq-more{padding:2px 0 2px 46px;font-style:italic}
.seq-rows{display:flex;flex-direction:column;gap:6px;overflow-x:auto;padding-bottom:2px}
.seq-row{display:flex;align-items:flex-start;gap:6px;min-width:0}
.seq-gutter{flex:none;width:40px;padding-top:14px;text-align:right;font:500 10px/1.4 'IBM Plex Mono',monospace;color:var(--dfaint);font-variant-numeric:tabular-nums}
.seq-cells{flex:1;min-width:0;display:flex;flex-direction:column}
.seq-line{display:grid;grid-template-columns:repeat(var(--seq-cols),minmax(9px,1fr));position:relative}
.seq-ruler{height:14px;align-items:end}
.seq-tick{position:relative;height:4px;border-left:1px solid color-mix(in srgb,var(--dtext) 18%,transparent)}
.seq-tick-n{height:7px;border-left-color:color-mix(in srgb,var(--dtext) 45%,transparent)}
.seq-tick-n i{position:absolute;left:0;bottom:7px;transform:translateX(-50%);font:500 9px/1 'IBM Plex Mono',monospace;font-style:normal;color:var(--dfaint);white-space:nowrap}
.seq-letters .bio-b{display:block;overflow:hidden;transition:opacity .3s ease}
.seq-dim{opacity:.25}
.seq-at-cursor{background:color-mix(in srgb,var(--dink) 14%,transparent)}
.seq-band{height:5px;margin-top:1px}
.seq-bandcell{display:block;height:5px;border-top:1px solid transparent}
.seq-band-start{border-radius:3px 0 0 3px}.seq-band-end{border-radius:0 3px 3px 0}.seq-band-start.seq-band-end{border-radius:3px}
.seq-cursor-line{height:18px;margin-top:2px}
.seq-cur{grid-column:calc(var(--seq-at) + 1);position:relative;display:block;height:100%;transition:transform .35s cubic-bezier(.4,0,.2,1)}
.seq-cur b{position:absolute;left:50%;top:0;width:0;height:0;transform:translateX(-50%);border:5px solid transparent;border-bottom:6px solid var(--dink);border-top:0}
.seq-cur i{position:absolute;left:50%;top:7px;transform:translateX(-50%);font:600 9.5px/1.2 'IBM Plex Mono',monospace;font-style:normal;color:var(--dink);background:color-mix(in srgb,var(--dink) 12%,transparent);border-radius:3px;padding:0 3px;white-space:nowrap}
@media (prefers-reduced-motion: reduce){.seq-cur,.seq-letters .bio-b{transition:none}}
@media print{.bio-b,[class*="bio-tone-"],.seq-cur i{-webkit-print-color-adjust:exact;print-color-adjust:exact}.seq-rows{overflow:visible}}
`,
  authoring: {
    initialFields: true,
    transientFields: ['marks', 'cursor', 'window', 'reveal'],
    template: {
      title: 'Sequence track', label: 'Reference', alphabet: 'dna', strand: '+', start: 1, wrap: 60,
      sequence: 'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG',
      initial: { marks: [{ id: 'start', from: 1, to: 3, tone: 'good', label: 'Start codon' }] },
    },
    setupFields: [
      ['label', 'text'], ['sequence', 'text'], ['alphabet', 'text'],
      ['start', 'num'], ['strand', 'text'], ['wrap', 'num'], ['initial', 'json'],
    ],
    patchFields: [['marks', 'json'], ['cursor', 'num'], ['window', 'json'], ['reveal', 'num'], ['note', 'text']],
    fieldMeta: {
      label: { label: 'Track label', help: 'Short name shown before the ruler, e.g. Reference.' },
      sequence: { label: 'Sequence', help: '1–240 letters (whitespace ignored). Letters outside the alphabet render as unknown.' },
      alphabet: { label: 'Alphabet', help: 'dna (ACGTN, default), rna (ACGUN) or protein (one-letter amino acids).' },
      start: { label: 'First coordinate', help: '1-based coordinate of the first letter; default 1. Marks, cursor and window use these coordinates.' },
      strand: { label: 'Strand', help: 'Shown as a label only; the sequence is never recomputed.' },
      wrap: { label: 'Letters per row', help: '20–120, default 60.' },
      marks: { label: 'Highlighted ranges', help: 'Full snapshot of up to 24 {id,from,to,tone?,label?} ranges. Later marks draw on top; labelled marks appear in the legend.', nullLabel: 'No marks' },
      cursor: { label: 'Cursor position', help: 'One coordinate drawn as a bracket under the letter.', nullLabel: 'Hide cursor' },
      window: { label: 'Zoom window', help: '{from,to}: only these coordinates render, with a “… n more” cue at each end.', nullLabel: 'Show all' },
      reveal: { label: 'Revealed letters', help: 'Letters beyond this count render dimmed, for “read this far” stories.', nullLabel: 'Reveal all' },
      note: { label: 'Explanation' },
    },
    picker: {
      order: 40, name: 'Sequence track', category: 'Science & sequencing',
      tagline: 'Letters, coordinates and highlighted ranges',
      description: 'Show a short DNA, RNA or protein sequence with a coordinate ruler, coloured range marks, a moving cursor, a zoom window and a reveal boundary that advance step by step.',
    },
    example: function (sample) {
      var panel = sample.panel, state = sample.state;
      panel.label = 'Reference';
      panel.sequence = 'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAGCCTTAGGCA';
      state.marks = [
        { id: 'start', from: 1, to: 3, tone: 'good', label: 'Start codon' },
        { id: 'primer', from: 20, to: 35, tone: 'primer', label: 'Forward primer' },
      ];
      state.cursor = 17;
      panel.initial = builderClone(state);
      return sample;
    },
  },
});
