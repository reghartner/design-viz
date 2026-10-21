#!/usr/bin/env node
/* seatmap-import.mjs — turn a seating chart into a `seatmap` panel declaration
   fragment ({geometry, rings, sections, …}) that an author pastes into a spec,
   or into a venue library entry file that seatmap panels reference by id.

   Usage:
     node tools/seatmap-import.mjs <input.csv|input.svg> [--out file]
          [--capacity-total N] [--level-map "1:100 level,2:200 level"]
          [--venue ID --venue-name NAME [--venue-location TEXT]
           [--venue-note TEXT] [--landmark id:label:x:y]…]

   CSV (header id,level,zone,capacity[,label]) produces a generic rink bowl:
   one ring per distinct level in file order, sections kept in file order and
   placed by the panel from their zone (sideline, corner, end, club). Blank
   capacities are an illustrative even split of --capacity-total (or 1 each
   without it) and the output says so.

   SVG produces geometry "paths": every <path>, <polygon>, <rect> or <circle>
   whose id or data-section looks like a section id becomes a section with a
   path normalised so the chart's longer side is 1000 units (aspect
   preserved). translate/scale/matrix transforms (own and inherited) are
   applied; any other transform fails loudly for that element. A
   <rect id="rink-outline"> becomes the panel's `field` outline. <style> and
   <script> are ignored, nothing external is read, and no script runs. Rings
   come from --level-map group ids or from the leading digits of each section
   id (101 → 1, 201A → 2).

   --venue writes a venue library entry instead of a fragment: one
   SeatmapVenues.define({...}) call for packages/sports/panels/venues/<id>.js (upstream)
   or company/panels/venues/<id>.js (a fork). See packages/sports/cookbook/venue-map.md.

   No npm dependencies. The parsing lives in packages/sports/panels/seatmap-import.js and
   is shared with the workbench's Import seating chart… action; the strict
   path tokenizer and normaliser are the panel's own (packages/sports/panels/sports.js). */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_LIMIT = 512 * 1024;
const SOURCES = ['sports.js', 'venue-library.js', 'seatmap-import.js'].map(file => path.join(HERE, '../packages/sports/panels', file));

let shared = null;
/* Evaluate the panel's own helpers, the venue library and the shared
   importer in this realm, inside one function scope so nothing leaks onto
   globalThis. */
function lib() {
  if (!shared) {
    const body = SOURCES.map(file => fs.readFileSync(file, 'utf8')).join('\n');
    shared = new Function(body + '\nreturn {SeatmapImport: SeatmapImport, SeatmapVenues: SeatmapVenues};')();
  }
  return shared;
}
export const evenSplit = (...args) => lib().SeatmapImport.evenSplit(...args);
export const importCsv = (...args) => lib().SeatmapImport.importCsv(...args);
export const importSvg = (...args) => lib().SeatmapImport.importSvg(...args);
export const parseTransform = (...args) => lib().SeatmapImport.parseTransform(...args);
export const parseLevelMap = (...args) => lib().SeatmapImport.parseLevelMap(...args);
export const fitPolyline = (...args) => lib().SeatmapImport.fitPolyline(...args);
export const formatReport = (...args) => lib().SeatmapImport.formatReport(...args);
export const venueEntry = (...args) => lib().SeatmapImport.venueEntry(...args);
export const venueSource = (...args) => lib().SeatmapImport.venueSource(...args);

/* Everything the panel validator says about a venue's seatmap fields, as a
   panel would draw them: a venue file is written only when this is empty. */
export function venueProblems(entry) {
  const { readSource } = createRequire(import.meta.url)('./source-loader.cjs');
  const context = { URL, TextEncoder };
  vm.createContext(context);
  const selected = process.env.FLOWVIEW_PACKAGES;
  process.env.FLOWVIEW_PACKAGES = [...new Set([...(selected ? selected.split(',') : []), 'sports'])].join(',');
  try { vm.runInContext(readSource('validator.js'), context); }
  finally {
    if (selected === undefined) delete process.env.FLOWVIEW_PACKAGES;
    else process.env.FLOWVIEW_PACKAGES = selected;
  }
  const panel = Object.assign({ id: 'map', type: 'seatmap' }, entry.seatmap);
  const result = context.validate(context.normalize({ nodes: { n: {} }, rows: [['n']], panels: [panel] }));
  return [...result.errors, ...result.warnings].map(text => String(text).replace(/^.*?panels\[0\]\.?/, 'seatmap.'));
}

/* "id:label:x:y"; the label may itself contain colons. */
export function parseLandmark(text) {
  const parts = String(text).split(':');
  const x = Number(parts[parts.length - 2]), y = Number(parts[parts.length - 1]);
  const label = parts.slice(1, -2).join(':').trim();
  if (parts.length < 4 || !parts[0] || !label || !Number.isFinite(x) || !Number.isFinite(y))
    throw new Error('--landmark is id:label:x:y, got "' + text + '"');
  return { id: parts[0], label, x, y };
}

/* ---------- CLI ---------- */
const USAGE = 'usage: node tools/seatmap-import.mjs <input.csv|input.svg> [--out file] [--capacity-total N] [--level-map "1:100 level,…"] ' +
  '[--venue ID --venue-name NAME [--venue-location TEXT] [--venue-note TEXT] [--landmark id:label:x:y]…]';
export function parseArgs(argv) {
  const options = { input: null, out: null, capacityTotal: null, levelMap: null, venue: null, venueName: null, venueLocation: null, venueNote: null, landmarks: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') options.out = argv[++i];
    else if (arg === '--capacity-total') {
      const n = Number(argv[++i]);
      if (!Number.isSafeInteger(n) || n < 1) throw new Error('--capacity-total needs a whole number ≥ 1');
      options.capacityTotal = n;
    } else if (arg === '--level-map') options.levelMap = argv[++i];
    else if (arg === '--venue') options.venue = argv[++i];
    else if (arg === '--venue-name') options.venueName = argv[++i];
    else if (arg === '--venue-location') options.venueLocation = argv[++i];
    else if (arg === '--venue-note') options.venueNote = argv[++i];
    else if (arg === '--landmark') options.landmarks.push(parseLandmark(argv[++i]));
    else if (arg.startsWith('--')) throw new Error('unknown option ' + arg);
    else if (options.input) throw new Error('only one input file');
    else options.input = arg;
  }
  if (!options.input) throw new Error(USAGE);
  const venueOnly = options.venueName || options.venueLocation || options.venueNote || options.landmarks.length;
  if (venueOnly && !options.venue) throw new Error('--venue-name, --venue-location, --venue-note and --landmark need --venue ID');
  return options;
}
export function run(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  let options;
  try { options = parseArgs(argv); } catch (error) { io.stderr.write(error.message + '\n'); return 2; }
  let text;
  try { text = fs.readFileSync(options.input, 'utf8'); } catch (error) { io.stderr.write('cannot read ' + options.input + ': ' + error.message + '\n'); return 2; }
  const { SeatmapImport, SeatmapVenues } = lib();
  let result, output;
  try {
    result = SeatmapImport.importText(text, options.input, options);
    if (options.venue) {
      const entry = SeatmapImport.venueEntry(result.fragment, {
        id: options.venue, name: options.venueName, location: options.venueLocation, note: options.venueNote, landmarks: options.landmarks,
      });
      SeatmapVenues.define(entry); // the same checks the build applies to a venue file
      const problems = venueProblems(entry);
      if (problems.length) throw new Error('venue "' + entry.id + '" would not draw cleanly; nothing written:\n  - ' + problems.join('\n  - '));
      output = SeatmapImport.venueSource(entry, path.basename(options.input));
    } else output = JSON.stringify(result.fragment, null, 2) + '\n';
  } catch (error) {
    io.stderr.write('seatmap-import: ' + error.message + '\n');
    return 1;
  }
  io.stderr.write(SeatmapImport.formatReport(result.report, options.input) + '\n');
  if (Buffer.byteLength(output) > OUTPUT_LIMIT) {
    io.stderr.write('seatmap-import: refusing to write ' + Math.round(Buffer.byteLength(output) / 1024) + ' KiB; the limit is 512 KiB. Simplify the chart paths or import fewer sections.\n');
    return 1;
  }
  if (options.out) {
    fs.writeFileSync(options.out, output);
    io.stderr.write('  output: ' + options.out + ' (' + (Buffer.byteLength(output) / 1024).toFixed(1) + ' KiB)' + (options.venue ? ' · venue "' + options.venue + '"' : '') + '\n');
  } else io.stdout.write(output);
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(run(process.argv.slice(2)));
