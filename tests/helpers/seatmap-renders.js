'use strict';
/* Every seatmap panel of a spec, folded along each authored path and rendered
   at every step: [{path, step, panel, sha256}]. Used to prove a declaration
   change leaves the drawn output byte-identical. */
const crypto = require('node:crypto');
function seatmapRenders(C, spec) {
  const out = [];
  const d = C.normalize(JSON.parse(JSON.stringify(spec)));
  const diagrams = [];
  (function walk(node) {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      if (Array.isArray(node.panels) && Array.isArray(node.steps)) diagrams.push(node);
      Object.values(node).forEach(walk);
    }
  })(d);
  diagrams.forEach(diagram => {
    const paths = Array.isArray(diagram.paths) && diagram.paths.length ? diagram.paths : [{id: 'all', steps: diagram.steps.map(s => s.id)}];
    paths.forEach(p => {
      const steps = p.steps.map(id => diagram.steps.find(s => s.id === id)).filter(Boolean);
      const states = C.foldPanelStates(Object.assign({}, diagram, {steps}));
      diagram.panels.filter(panel => panel.type === 'seatmap').forEach(panel => {
        states[panel.id].forEach((state, i) => {
          const html = C.seatmapHTML(panel, state, null, 'golden', false);
          out.push({path: p.id, step: i, panel: panel.id, sha256: crypto.createHash('sha256').update(html).digest('hex')});
        });
      });
    });
  });
  return out;
}
module.exports = {seatmapRenders};
