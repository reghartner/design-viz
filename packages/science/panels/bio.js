/* Shared pure helpers for the sequence-teaching panels (sequence, reads,
   frames, locus). Alphabets, coordinates, ranges, tones and the
   standard genetic code live here once; each panel owns its own rendering,
   state rules and styles. Nothing here touches the DOM or mutates its input. */

/* Letters each alphabet accepts. Lower-case input is upper-cased; anything
   else is reported to the caller, which decides whether to warn or skip. */
var BIO_ALPHABETS = {
  dna: 'ACGTN',
  rna: 'ACGUN',
  protein: 'ACDEFGHIKLMNPQRSTVWYX*',
};
var BIO_ALPHABET_NAMES = ['dna', 'rna', 'protein'];
/* Named emphasis tones shared by every range, marker, feature and arc. The
   colours live in the sequence panel's shared `.bio-tone-*` styles. */
var BIO_TONES = ['neutral', 'accent', 'insert', 'mismatch', 'motif', 'primer', 'cut', 'feature', 'good', 'bad'];
var BIO_MAX_SEQUENCE = 240;

function bioAlphabet(name) {
  return BIO_ALPHABET_NAMES.indexOf(name) >= 0 ? name : 'dna';
}
/* Returns {text, invalid:[index…]} where `text` is the upper-cased input and
   `invalid` lists zero-based positions whose letter the alphabet rejects.
   Non-string input yields an empty sequence. */
function bioNormalizeSequence(value, alphabet) {
  var letters = BIO_ALPHABETS[bioAlphabet(alphabet)];
  if (typeof value !== 'string') return { text: '', invalid: [] };
  var text = value.toUpperCase().replace(/\s+/g, ''),
    invalid = [];
  for (var i = 0; i < text.length; i++) if (letters.indexOf(text.charAt(i)) < 0) invalid.push(i);
  return { text: text, invalid: invalid };
}
function bioTone(value, fallback) {
  return BIO_TONES.indexOf(value) >= 0 ? value : fallback || 'neutral';
}
/* CSS class for one residue letter: `bio-b bio-b-a` … unknown letters get
   `bio-b-x`. Letters are escaped by the caller when rendered. */
function bioLetterClass(letter) {
  var ch = String(letter || '').toUpperCase();
  return 'bio-b bio-b-' + (/^[A-Z*]$/.test(ch) ? (ch === '*' ? 'stop' : ch.toLowerCase()) : 'x');
}
/* 1-based inclusive coordinates. `bioPosition` accepts safe positive integers. */
function bioPosition(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}
function bioCount(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function bioFormatCoord(value) {
  return isFiniteNum(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
}
/* Validates an authored range object {from,to} (1-based, inclusive, from ≤ to)
   against an optional [min,max] span. Returns the clean range or null after
   pushing one warning at `path`. */
function bioRange(value, path, warnings, min, max) {
  if (!panelObject(value) || !bioPosition(value.from) || !bioPosition(value.to) || value.from > value.to) {
    if (warnings) warnings.push(path + ': expected {from,to} as 1-based inclusive positions with from ≤ to — ignored');
    return null;
  }
  if (bioPosition(min) && bioPosition(max) && (value.to < min || value.from > max)) {
    if (warnings) warnings.push(path + ': range ' + value.from + '–' + value.to + ' lies outside ' + min + '–' + max + ' — ignored');
    return null;
  }
  return { from: value.from, to: value.to };
}
/* Standard genetic code keyed by DNA codon (RNA codons convert U→T first).
   `*` marks a stop. Used only to label frames in a teaching display. */
var BIO_CODONS = (function () {
  var bases = 'TCAG',
    aminoAcids = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
    table = Object.create(null),
    n = 0;
  for (var a = 0; a < 4; a++)
    for (var b = 0; b < 4; b++)
      for (var c = 0; c < 4; c++) table[bases[a] + bases[b] + bases[c]] = aminoAcids.charAt(n++);
  return table;
})();
/* Translates `text` (upper-case DNA/RNA) from zero-based `offset` in steps of
   three. Codons containing N or a non-base letter translate to `X`. Returns
   [{at, codon, aa, stop}] where `at` is the zero-based index of the codon's
   first letter. A trailing partial codon is omitted. */
function bioTranslate(text, offset) {
  var out = [];
  if (typeof text !== 'string') return out;
  var dna = text.toUpperCase().replace(/U/g, 'T');
  for (var i = offset || 0; i + 3 <= dna.length; i += 3) {
    var codon = dna.substr(i, 3),
      aa = BIO_CODONS[codon] || 'X';
    out.push({ at: i, codon: text.substr(i, 3), aa: aa, stop: aa === '*' });
  }
  return out;
}
/* Reverse complement for DNA or RNA text; unknown letters pass through. */
function bioReverseComplement(text, alphabet) {
  var pairs = bioAlphabet(alphabet) === 'rna'
    ? { A: 'U', U: 'A', G: 'C', C: 'G', N: 'N' }
    : { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
  var out = '';
  for (var i = String(text || '').length - 1; i >= 0; i--) {
    var ch = String(text).charAt(i).toUpperCase();
    out += pairs[ch] || ch;
  }
  return out;
}
/* Shared state field rules every sequence-teaching panel accepts: `note`
   (text) and `enterOnce` (object). Returns true when `key` is one of them. */
function bioCommonStateKey(key) {
  return key === 'note' || key === 'enterOnce';
}
