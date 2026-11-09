'use strict';
// #1216: lane routing is no longer offered. Checked-in specs that already use routing: "lanes"
// keep it and draw unchanged, and the validator adds one note per such diagram. Zero-warning
// checks on those specs ignore only that note; any other warning still fails them.
const LANES_NOTE = /\.routing: "lanes" is no longer recommended; omit routing to draw curves$/;
const plain = value => JSON.parse(JSON.stringify(value));
const withoutLanesNote = warnings => plain(warnings).filter(w => !LANES_NOTE.test(w));
const withoutLanesNoteResult = result => {
  const copy = plain(result);
  copy.warnings = withoutLanesNote(copy.warnings);
  return copy;
};
module.exports = {LANES_NOTE, withoutLanesNote, withoutLanesNoteResult};
