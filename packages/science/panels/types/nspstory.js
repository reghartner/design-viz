/* Purpose-built, sequence-free lessons for the Bianco et al. NSP15 preprint.
   Motion interpolates authored explanations, never molecular dynamics. All
   final geometry exists without animation, including reduced-motion/print. */
var NSPSTORY_SCENES = ['reporter', 'dilution', 'origin', 'evidence'];
var NSPSTORY_FIELDS = ['phase', 'caption'];
var NSPSTORY_AMBIENT_INTENSITIES = ['quiet', 'medium', 'lively'];
var NSPSTORY_AMBIENT_TEMPOS = ['slow', 'normal', 'fast'];
var NSPSTORY_ATMOSPHERE = /* @panel-asset:../assets/nspstory-atmosphere.jpg */ '';
function nspstoryClean(raw, path, warnings, allowOnce) {
  var out = {};
  function warn(key, text) { if (warnings) warnings.push(path + key + ': ' + text); }
  if (raw == null) return out;
  if (!panelObject(raw)) { warn('', 'expected a state object — ignored'); return out; }
  Object.keys(raw).forEach(function (key) {
    var value = raw[key];
    if (key === 'enterOnce' && allowOnce) out.enterOnce = nspstoryClean(value, path + '.enterOnce', warnings, false);
    else if (key === 'phase') {
      if (Number.isInteger(value) && value >= 0 && value <= 3) out.phase = value;
      else warn('.phase', 'expected a whole number 0–3 — ignored');
    } else if (key === 'caption') {
      if (value === null || typeof value === 'string') out.caption = value;
      else warn('.caption', 'expected text or null — ignored');
    } else warn('.' + key, 'unknown field — ignored');
  });
  return out;
}
function nspstoryModel(panel, state) {
  panel = panelObject(panel) ? panel : {};
  var s = Object.assign({phase:0, caption:''}, nspstoryClean(state, 'state', null, false));
  s.scene = NSPSTORY_SCENES.indexOf(panel.scene) >= 0 ? panel.scene : 'reporter';
  s.ambient = typeof panel.ambient === 'boolean' ? panel.ambient : s.scene !== 'evidence';
  s.ambientIntensity = NSPSTORY_AMBIENT_INTENSITIES.indexOf(panel.ambientIntensity) >= 0 ? panel.ambientIntensity : 'quiet';
  s.ambientTempo = NSPSTORY_AMBIENT_TEMPOS.indexOf(panel.ambientTempo) >= 0 ? panel.ambientTempo : 'slow';
  var lessons = {
    reporter:[['A particle arrives. The cell stays dark.', 'Incoming particle → infected cell; GFP reporter off.'],
      ['A rare change restores the green signal.', 'A frame-restoring change permits GFP in an infected cell; the particle is not green.'],
      ['The trait can travel with a virus lineage.', 'Newly infected cells can inherit the reporter phenotype through a virus lineage. A green culture can still be mixed.'],
      ['Green is a clue. Sequence is the check.', 'Both WT and inactive NSP15 yielded green isolates. Insertions were found in 8 of 18 examined WT isolates; no inserts greater than 2 nt in the inactive group.']],
    dilution:[['Make a crowd easier to follow.', 'A dense symbolic mixture can include several lineages. Green signal does not prove a single lineage.'],
      ['Spread the mixture into illustrative wells.', 'Nine example wells show empty, mixed, or single-looking candidate outcomes. They are not counts, probabilities, or a protocol.'],
      ['Follow a candidate, then sequence-check.', 'A single-looking well is a candidate, not proof. The recovered reporter region is sequence-checked.'],
      ['The green screen sees only a selected slice.', 'Reporter-restoring variants are selected. Other changes remain outside this screen.']],
    origin:[['Read the source and the unexpected patch.', 'Solid marks show a matching source and the observed recipient insertion. The apparent source boundary is only conceptual.'],
      ['A separated match defines the distal class.', 'The source and recipient are linked by sequence matching, not direct observation of fragment transfer.'],
      ['Matching supports an inferred origin.', '87 percent of WT inserts at least 11 nt map to the virus. A source match is inferred.'],
      ['Proposed transit, not an observed mechanism.', 'A dashed inference and moving fragment illustrate the proposed model. Incorporation remains unresolved.']],
    evidence:[['All insertions: fewer with inactive NSP15.', 'HCoV-OC43 all insertions at least 2 nt: WT 33.9 versus inactive NSP15 6.93 cpm.'],
      ['Distal insertions show the strongest loss.', 'HCoV-OC43 mapped distal inserts at least 11 nt: WT 16.7 versus inactive NSP15 0.2 cpm, reported 84-fold contrast.'],
      ['Nearby duplications do not show that loss.', 'HCoV-OC43 mapped tandem inserts at least 11 nt: WT 0.98 versus inactive NSP15 0.99 cpm.'],
      ['Frequency and size are different questions.', 'The overall median insertion length is 12 nt in WT and 3 nt with inactive NSP15.']]
  };
  s.heading = lessons[s.scene][s.phase][0];
  s.aria = lessons[s.scene][s.phase][1];
  return s;
}
function nspstoryText(x, y, text, cls, anchor) {
  return '<text x="' + x + '" y="' + y + '" class="nspstory-' + (cls || 'label') + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(text) + '</text>';
}
function nspstoryCell(x, y, green, size, cls) {
  return '<g transform="translate(' + x + ',' + y + ')"><g class="nspstory-cell ' + (green ? 'nspstory-green ' : '') + (cls || '') + '">' +
    '<ellipse rx="' + size + '" ry="' + size * .8 + '"/><circle cx="8" cy="-3" r="' + size * .23 + '"/>' +
    '<path d="M-22,12q14,-22 28,0t28,0"/></g></g>';
}
function nspstoryArrow(path, cls) { return '<path class="nspstory-arrow ' + (cls || '') + '" d="' + path + '"/>'; }
function nspstoryReporter(m) {
  var phase = m.phase, green = phase > 0, h = '';
  h += '<rect class="nspstory-zone" x="20" y="90" width="720" height="215" rx="22"/>';
  h += nspstoryText(44, 120, '01 / ARRIVAL', 'kicker') + nspstoryText(245, 120, '02 / REPORTER', 'kicker') + nspstoryText(520, 120, '03 / LINEAGE', 'kicker');
  h += nspstoryArrow('M88,203H199m-10,-7 10,7 -10,7');
  h += '<g transform="translate(226,203)"><g class="nspstory-particle ' + (phase === 0 && !m.print ? 'nspstory-arrive' : '') + '"><circle r="14"/><path d="M-21,0H21M0,-21V21M-15,-15L15,15M-15,15L15,-15"/></g></g>';
  h += nspstoryText(112, 257, 'Virus particle', 'label', 'middle') + nspstoryText(112, 278, 'never “green” itself', 'small', 'middle');
  h += nspstoryCell(315, 202, green, 71, phase === 1 && !m.print ? 'nspstory-switch' : '');
  h += nspstoryText(315, 207, green ? 'GFP ON' : 'GFP OFF', 'celltext', 'middle');
  h += nspstoryText(315, 278, green ? 'Cell makes fluorescent protein' : 'Reporter message out of frame', 'small', 'middle');
  h += nspstoryArrow('M400,203H478m-10,-7 10,7 -10,7', phase < 2 ? 'nspstory-faint' : '');
  if (phase >= 2) {
    h += nspstoryCell(561, 178, true, 39, phase === 2 && !m.print ? 'nspstory-descendant' : '') + nspstoryCell(653, 222, true, 39, phase === 2 && !m.print ? 'nspstory-descendant nspstory-later' : '');
    h += nspstoryText(605, 278, 'Newly infected cells', 'small', 'middle');
  } else {
    h += nspstoryCell(561, 178, false, 39, 'nspstory-faint') + nspstoryCell(653, 222, false, 39, 'nspstory-faint');
    h += nspstoryText(605, 278, 'A trait can be passed on', 'small', 'middle');
  }
  h += '<rect class="nspstory-band" x="20" y="324" width="720" height="53" rx="12"/>';
  var footer = phase === 0 ? 'A dark cell does not mean “no virus.” It means no working GFP signal.' : phase === 1 ? 'A rare frame-restoring insertion OR deletion can turn the reporter on.' : phase === 2 ? 'A green-positive culture can still contain other lineages. Next: separate them.' : 'WT: insertions in 8/18 green isolates. Inactive: no inserts >2 nt in 16 examined.';
  h += nspstoryText(38, 356, footer, 'small');
  return h;
}
function nspstoryToken(x, y, shape, cls, fromX, fromY, size) {
  size = size || 10;
  var glyph = shape === 0 ? '<circle r="' + size + '"/>' : shape === 1 ? '<rect x="-' + (size - 1) + '" y="-' + (size - 1) + '" width="' + (size - 1) * 2 + '" height="' + (size - 1) * 2 + '" rx="3"/>' : '<path d="M0,-' + (size + 1) + 'L' + (size + 1) + ',' + (size - 1) + 'H-' + (size + 1) + 'Z"/>';
  return '<g transform="translate(' + x + ',' + y + ')"><g class="nspstory-token nspstory-token-' + shape + ' ' + (cls || '') + '" style="--nsp-dx:' + (fromX || 0) + 'px;--nsp-dy:' + (fromY || 0) + 'px">' + glyph + '</g></g>';
}
function nspstoryDilution(m) {
  var h = '', phase = m.phase, crowdX = 176, crowdY = 183;
  h += '<g class="nspstory-crowd"><ellipse class="nspstory-crowd-aura" cx="' + crowdX + '" cy="' + crowdY + '" rx="126" ry="92"/><ellipse class="nspstory-crowd-halo" cx="' + crowdX + '" cy="' + crowdY + '" rx="101" ry="73"/><ellipse class="nspstory-culture nspstory-positive" cx="' + crowdX + '" cy="' + crowdY + '" rx="82" ry="57"/>';
  [[126,149,0],[154,140,1],[183,149,2],[216,145,0],[235,169,1],[122,177,2],[151,174,0],[184,180,1],[214,190,2],[134,204,1],[165,208,2],[198,211,0],[229,215,1],[116,222,0],[150,232,1],[184,229,0],[215,238,2],[104,194,0],[200,158,1],[244,198,2],[170,157,0],[136,161,1],[224,226,0],[196,196,2]].forEach(function (p) { h += nspstoryToken(p[0],p[1],p[2],'',0,0,6); });
  h += '</g>' + nspstoryText(crowdX, 278, 'A MIXED CROWD', 'kicker', 'middle') + nspstoryText(crowdX, 300, 'fixed symbols = illustrative lineages', 'small', 'middle');
  h += nspstoryText(548, 91, '3 × 3 ILLUSTRATIVE OUTCOMES · NOT COUNTS', 'kicker', 'middle');
  var wells=[
    {x:430,y:126,state:'candidate',shape:[0]},{x:548,y:126,state:'empty',shape:[]},{x:666,y:126,state:'mixed',shape:[1,2]},
    {x:430,y:205,state:'mixed',shape:[0,1]},{x:548,y:205,state:'candidate',shape:[2]},{x:666,y:205,state:'empty',shape:[]},
    {x:430,y:284,state:'empty',shape:[]},{x:548,y:284,state:'mixed',shape:[2,0]},{x:666,y:284,state:'candidate',shape:[1]}
  ];
  h += '<g class="nspstory-streams ' + (phase === 0 ? 'nspstory-streams-preview' : '') + '">';
  wells.forEach(function (well,i) {
    var fromY=154+(i%3)*29, bend=302+(i%3)*14;
    h += '<path class="nspstory-stream nspstory-stream-' + (i%3) + (phase === 1 && !m.print ? ' nspstory-stream-draw' : '') + ' nspstory-stream-delay-' + i + '" d="M252,' + fromY + 'C' + bend + ',' + fromY + ' 342,' + well.y + ' ' + (well.x-36) + ',' + well.y + '"/>';
  });
  h += '</g>';
  h += '<g class="nspstory-well-field ' + (phase === 0 ? 'nspstory-preview' : '') + '">';
  wells.forEach(function (well,i) {
    var focus=(phase === 2 || m.print) && i === 4;
    h += '<g class="nspstory-well nspstory-well-' + well.state + (focus ? ' nspstory-candidate-focus' : '') + '" data-well="' + (i + 1) + '" data-state="' + well.state + '"><circle class="nspstory-well-glow" cx="' + well.x + '" cy="' + well.y + '" r="36"/><circle class="nspstory-well-glass" cx="' + well.x + '" cy="' + well.y + '" r="29"/>';
    if (!well.shape.length) h += nspstoryText(well.x,well.y-3,'—','wellmark','middle');
    well.shape.forEach(function (shape,j) {
      var x=well.x+(well.shape.length === 2 ? (j ? 10 : -10) : 0), y=well.y-7;
      var cls=phase === 1 && !m.print ? 'nspstory-disperse nspstory-spread-' + (i + j) : '';
      h += nspstoryToken(x,y,shape,cls,crowdX-x,crowdY-y,6);
    });
    h += nspstoryText(well.x,well.y+23,well.state,'welllabel','middle') + '</g>';
  });
  h += '</g>';
  if (phase === 2 || m.print) h += '<g class="nspstory-candidate-note ' + (phase === 2 && !m.print ? 'nspstory-reveal' : '') + '"><path class="nspstory-check" d="M517,205l12,12 22,-29"/>' + nspstoryText(704, 329, 'FOLLOW + SEQUENCE-CHECK', 'kicker', 'end') + '</g>';
  if (phase === 3 || m.print) h += '<rect class="nspstory-selection ' + (phase === 3 && !m.print ? 'nspstory-boundary' : '') + '" x="389" y="91" width="318" height="229" rx="28"/>';
  h += nspstoryText(31, 338, m.print ? 'Candidate, not proof. Outcomes are illustrative; sequence-check the recovered lineage.' : phase === 3 ? 'SELECTED SLICE · this screen misses changes that do not restore GFP' : phase === 2 ? 'SINGLE-LOOKING = CANDIDATE, NOT PROOF' : phase === 1 ? 'ONE FINITE DISPERSION · OUTCOMES STAY FIXED' : 'ILLUSTRATIVE FIELD · NO COUNTS, PROBABILITIES, OR PROTOCOL', 'kicker');
  return h;
}
function nspstoryOrigin(m) {
  var phase = m.phase, h = '';
  h += '<rect class="nspstory-origin-field" x="20" y="86" width="720" height="252" rx="28"/><circle class="nspstory-origin-aura nspstory-origin-aura-source" cx="157" cy="235" r="92"/><circle class="nspstory-origin-aura nspstory-origin-aura-recipient" cx="612" cy="235" r="92"/>';
  h += '<g class="nspstory-proposed ' + (phase === 3 && !m.print ? 'nspstory-proposal-beat' : '') + '"><rect x="527" y="19" width="205" height="29" rx="14"/>' + nspstoryText(542, 39, 'PROPOSED / NOT OBSERVED', 'kicker') + '</g>';
  h += nspstoryText(53, 119, 'MATCHING SOURCE', 'kicker') + nspstoryText(53, 142, 'solid mark · sequence match', 'small');
  h += nspstoryText(520, 119, 'RECIPIENT / INSERTION', 'kicker') + nspstoryText(520, 142, 'solid mark · unexpected patch', 'small');
  h += '<path class="nspstory-rna" d="M48,252C166,230 274,270 383,251S601,229 716,252"/>';
  h += '<path class="nspstory-source" d="M102,244C126,240 158,241 188,246"/><path class="nspstory-source-pattern" d="M119,232v22M144,231v22M169,234v22"/>';
  h += '<path class="nspstory-boundary-mark" d="M199,218v54"/>';
  h += '<path class="nspstory-insert" d="M581,247q30,-8 64,0"/><path class="nspstory-insert-pattern" d="M596,233v24M613,231v24M630,233v24"/>';
  h += '<path class="nspstory-match" d="M151,220C263,151 480,151 613,220"/>';
  h += nspstoryText(53, 307, 'inferred boundary / unexpected patch', 'small') + nspstoryText(707, 307, 'dashed = inferred source link', 'small', 'end');
  if (phase === 3 || m.print) h += '<g transform="translate(613,247)"><g class="nspstory-fragment"><path class="nspstory-fragment-line" d="M-28,0h56"/><path class="nspstory-fragment-pattern" d="M-17,-7v14M0,-7v14M17,-7v14"/></g></g>';
  h += nspstoryText(31, 359, m.print ? 'Observed match + insertion · proposed transit · incorporation unresolved' : phase === 0 ? 'STATIC RELATIONSHIP · ABSTRACT AND NOT TO SCALE' : phase === 1 ? 'DISTAL = SEPARATED MATCH · TRANSFER NOT OBSERVED' : phase === 2 ? '12,063 / 13,816 LONG WT INSERTS MAP TO VIRUS · ORIGIN INFERRED' : 'One proposed transit · incorporation unresolved', 'kicker');
  return h;
}
function nspstoryEvidence(m) {
  var h = '', phase = m.phase;
  h += nspstoryText(24, 86, 'HCoV-OC43 / fsGFP · Fig. 2', 'kicker');
  h += '<rect class="nspstory-wt" x="470" y="74" width="16" height="10"/>' + nspstoryText(493, 85, 'WT', 'small') + '<rect class="nspstory-inactive" x="554" y="74" width="16" height="10"/>' + nspstoryText(577, 85, 'Inactive', 'small');
  [0,10,20,30,35].forEach(function (v) { var x=237+v*11.4; h += '<path class="nspstory-gridline" d="M'+x+',109V313"/>'+nspstoryText(x,333,String(v),'small','middle'); });
  [['All ≥2 nt',33.9,6.93],['Distal ≥11 nt',16.7,.2],['Tandem ≥11 nt',.98,.99]].forEach(function (row,i) {
    var y=127+i*67, active=phase===i;
    if(active)h += '<rect class="nspstory-row-focus" x="16" y="'+(y-17)+'" width="724" height="61" rx="9"/>';
    h += nspstoryText(29,y+6,row[0],'label');
    if(i>0)h+=nspstoryText(29,y+26,'mapped inserts','small');
    h += '<rect data-rate="wt-'+i+'" class="nspstory-wt" x="237" y="'+(y-9)+'" width="'+row[1]*11.4+'" height="14" rx="3"/>';
    h += '<rect data-rate="inactive-'+i+'" class="nspstory-inactive" x="237" y="'+(y+12)+'" width="'+row[2]*11.4+'" height="14" rx="1"/>';
    h += nspstoryText(658,y+3,String(row[1]),'value')+nspstoryText(658,y+25,String(row[2]),'value');
    if(active) {
      var end=237+Math.max(row[1],row[2])*11.4;
      h += '<path class="nspstory-emphasis" d="M237,'+(y+35)+'v5H'+end+'v-5"/>';
    }
  });
  if(phase===1)h+=nspstoryText(475,244,'84× reported','contrast');
  if(phase===2)h+=nspstoryText(475,302,'near-equal pair','contrast');
  h += nspstoryText(438,359,'cpm · events per million virus-derived reads','small','middle');
  h += nspstoryText(24,389,phase===3?'Median length: 12 nt → 3 nt. Size is separate from event frequency.':'One shared linear scale. The ≥11 nt classes do not partition the all-size row.','small');
  return h;
}
function nspstoryAmbient(m) {
  var scene=m.scene;
  if(!m.ambient)return '';
  var cls='nspstory-ambient nspstory-ambient-'+m.ambientIntensity+' nspstory-ambient-'+m.ambientTempo;
  if(scene==='origin')return '<g class="'+cls+'" aria-hidden="true"><circle class="nspstory-ambient-ring nspstory-ambient-primary" cx="292" cy="205" r="76"/><circle class="nspstory-ambient-ring nspstory-ambient-secondary" cx="478" cy="235" r="58"/><circle class="nspstory-ambient-dot nspstory-ambient-primary" cx="262" cy="112" r="3"/><circle class="nspstory-ambient-dot nspstory-ambient-secondary" cx="482" cy="309" r="4"/></g>';
  if(scene==='dilution')return '<g class="'+cls+'" aria-hidden="true"><path class="nspstory-ambient-line nspstory-ambient-primary" d="M227,109C357,82 527,92 706,111"/><circle class="nspstory-ambient-dot nspstory-ambient-secondary" cx="248" cy="154" r="4"/><circle class="nspstory-ambient-dot nspstory-ambient-primary" cx="284" cy="278" r="3"/><circle class="nspstory-ambient-dot nspstory-ambient-secondary" cx="692" cy="207" r="3"/><circle class="nspstory-ambient-dot nspstory-ambient-primary" cx="665" cy="326" r="2.5"/></g>';
  return '<g class="'+cls+'" aria-hidden="true"><circle class="nspstory-ambient-ring nspstory-ambient-secondary" cx="314" cy="202" r="102"/><circle class="nspstory-ambient-dot nspstory-ambient-primary" cx="457" cy="148" r="4"/><circle class="nspstory-ambient-dot nspstory-ambient-secondary" cx="711" cy="166" r="3"/><circle class="nspstory-ambient-dot nspstory-ambient-primary" cx="472" cy="290" r="3"/></g>';
}
var NSPSTORY_WELLS=[
  {state:'candidate',shapes:[0]},{state:'empty',shapes:[]},{state:'mixed',shapes:[1,2]},
  {state:'mixed',shapes:[0,1]},{state:'candidate',shapes:[2]},{state:'empty',shapes:[]},
  {state:'empty',shapes:[]},{state:'mixed',shapes:[2,0]},{state:'candidate',shapes:[1]}
];
function nspstoryCanvasFrame(m) {
  return '<div class="nspstory-frame nspstory-screen-frame nspstory-canvas-frame" role="img" aria-label="' + esc(m.aria) + '">' +
    '<canvas class="nspstory-canvas" aria-hidden="true"></canvas>' +
    '<span class="nspstory-a11y">' + esc(m.aria) + (m.scene==='dilution'?' Illustrative fixed 3 by 3 field: '+NSPSTORY_WELLS.map(function(w,i){return 'well '+(i+1)+' '+w.state;}).join('; ')+'.':'') + '</span>' +
    (m.scene==='dilution'?NSPSTORY_WELLS.map(function(w,i){return '<span class="nspstory-canvas-outcome" data-well="'+(i+1)+'" data-state="'+w.state+'">'+w.state+'</span>';}).join(''):'') + '</div>';
}
function nspstoryEase(value) { value=Math.max(0,Math.min(1,value));return value*value*(3-2*value); }
function nspstoryCurve(point,a,b,c,d) {
  var u=1-point;
  return {x:u*u*u*a.x+3*u*u*point*b.x+3*u*point*point*c.x+point*point*point*d.x,
    y:u*u*u*a.y+3*u*u*point*b.y+3*u*point*point*c.y+point*point*point*d.y};
}
function nspstoryRoundRect(ctx,x,y,w,h,r) {
  r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}
function nspstoryCanvasToken(ctx,x,y,shape,size,alpha,bloom) {
  var colors=['#b18aff','#ffc66d','#53e6cd'];ctx.save();ctx.translate(x,y);ctx.globalAlpha=alpha;
  if(bloom){ctx.shadowColor=colors[shape];ctx.shadowBlur=16+bloom*10;}
  ctx.fillStyle=colors[shape];ctx.strokeStyle='#effcff';ctx.lineWidth=1.2;
  ctx.beginPath();
  if(shape===0)ctx.arc(0,0,size,0,Math.PI*2);
  else if(shape===1)nspstoryRoundRect(ctx,-size,-size,size*2,size*2,size*.28);
  else {ctx.moveTo(0,-size*1.15);ctx.lineTo(size*1.08,size*.9);ctx.lineTo(-size*1.08,size*.9);ctx.closePath();}
  ctx.fill();ctx.globalAlpha=alpha*.74;ctx.stroke();ctx.restore();
}
function nspstoryDrawWell(ctx,x,y,rx,well,focus,arrival,bloom) {
  var ry=rx*.31, depth=rx*.48;
  ctx.save();ctx.globalAlpha=.42+.58*arrival;
  var aura=ctx.createRadialGradient(x,y,rx*.1,x,y,rx*1.25);aura.addColorStop(0,focus?'rgba(83,230,205,.24)':'rgba(88,164,203,.13)');aura.addColorStop(1,'rgba(4,16,29,0)');ctx.fillStyle=aura;ctx.beginPath();ctx.ellipse(x,y,rx*1.28,ry*2.2,0,0,Math.PI*2);ctx.fill();
  var glass=ctx.createLinearGradient(x,y-ry,x,y+depth);glass.addColorStop(0,'rgba(32,82,105,.32)');glass.addColorStop(.48,'rgba(6,22,38,.8)');glass.addColorStop(1,'rgba(43,116,137,.3)');ctx.fillStyle=glass;ctx.beginPath();ctx.moveTo(x-rx,y);ctx.quadraticCurveTo(x-rx*.96,y+depth*.88,x-rx*.7,y+depth);ctx.quadraticCurveTo(x,y+depth+ry*.68,x+rx*.7,y+depth);ctx.quadraticCurveTo(x+rx*.96,y+depth*.88,x+rx,y);ctx.closePath();ctx.fill();
  ctx.strokeStyle=focus?'rgba(83,230,205,.94)':'rgba(120,209,239,.62)';ctx.lineWidth=focus?2.4:1.4;ctx.shadowColor=focus?'#53e6cd':'#5bc5e4';ctx.shadowBlur=(focus?18:9)+(bloom*7);ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.stroke();
  ctx.shadowBlur=0;ctx.strokeStyle='rgba(188,237,250,.3)';ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(x,y+depth*.86,rx*.7,ry*.42,0,0,Math.PI);ctx.stroke();
  ctx.strokeStyle='rgba(220,250,255,.18)';ctx.beginPath();ctx.moveTo(x-rx*.86,y+2);ctx.quadraticCurveTo(x-rx*.78,y+depth*.76,x-rx*.52,y+depth*.9);ctx.moveTo(x+rx*.86,y+2);ctx.quadraticCurveTo(x+rx*.78,y+depth*.76,x+rx*.52,y+depth*.9);ctx.stroke();
  well.shapes.forEach(function(shape,index){nspstoryCanvasToken(ctx,x+(well.shapes.length>1?(index?rx*.2:-rx*.2):0),y+2,shape,Math.max(4.5,rx*.085),arrival,bloom);});
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 '+Math.max(10,rx*.21)+'px "IBM Plex Mono",monospace';ctx.fillStyle=focus?'#84f5d8':'#c2d5df';ctx.globalAlpha=.7+.3*arrival;ctx.fillText(well.state.toUpperCase(),x,y+depth*.68);ctx.restore();
}
function nspstoryDrawDilution(ctx,state,m,image) {
  var w=state.width,h=state.height,prefs=state.prefs,intensity=prefs.intensity || m.ambientIntensity;
  var duration={slow:5300,normal:4000,fast:3200}[prefs.tempo || m.ambientTempo] || 4000;
  var still=state.reduced || !m.ambient, authored=still || m.phase!==1?4000:Math.min(4000,state.elapsed);
  var bloom=intensity==='lively'?1:intensity==='medium'?.48:0, phase=m.phase;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#030d18';ctx.fillRect(0,0,w,h);
  if(image && image.complete && image.naturalWidth){
    var scale=Math.max(w/image.naturalWidth,h/image.naturalHeight),iw=image.naturalWidth*scale,ih=image.naturalHeight*scale;
    ctx.save();ctx.globalAlpha=intensity==='lively'?.66:intensity==='medium'?.5:.32;ctx.drawImage(image,(w-iw)/2,(h-ih)/2,iw,ih);ctx.restore();
  }
  var atmosphereTime=state.elapsed*({slow:.72,normal:1,fast:1.34}[prefs.tempo]||1);
  var drift=still?0:Math.sin(atmosphereTime/2100)*w*.012;
  [[.19,.18,'rgba(56,230,195,.18)'],[.78,.2,'rgba(168,118,255,.19)'],[.52,.05,'rgba(42,139,214,.12)']].forEach(function(g,i){var x=w*g[0]+drift*(i-1),y=h*g[1];var grad=ctx.createRadialGradient(x,y,0,x,y,w*.25);grad.addColorStop(0,g[2]);grad.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);});
  var particleAlpha=intensity==='quiet'?.18:intensity==='lively'?.58:.36;
  for(var p=0;p<32;p++){var seed=(p*47)%101/101,x=(seed*w+(!still?Math.sin(state.elapsed/1300+p)*12:0))%w,y=((p*83)%97)/97*h*.58;ctx.fillStyle=p%3===0?'#b18aff':p%3===1?'#53e6cd':'#8ccde8';ctx.globalAlpha=particleAlpha*(.3+(p%5)/7);ctx.beginPath();ctx.arc(x,y,1+(p%3)*.55,0,Math.PI*2);ctx.fill();}
  ctx.globalAlpha=1;
  var cloudY=h*.105,cloudWidth=Math.min(w*.74,860),cloudLeft=(w-cloudWidth)/2;
  for(var c=0;c<44;c++){var cx=cloudLeft+((c*73)%101)/101*cloudWidth,cy=cloudY+Math.sin(c*2.1)*h*.035+((c*31)%17)/17*h*.08;nspstoryCanvasToken(ctx,cx,cy,c%3,Math.max(3.5,Math.min(7,w/150)),.35+(c%7)/11,bloom);}
  var clearing=ctx.createRadialGradient(w/2,h*.3,0,w/2,h*.3,w*.4);clearing.addColorStop(0,'rgba(3,13,24,.99)');clearing.addColorStop(.55,'rgba(3,13,24,.9)');clearing.addColorStop(1,'rgba(3,13,24,0)');ctx.fillStyle=clearing;ctx.fillRect(0,h*.08,w,h*.42);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#bfd5df';ctx.font='600 '+Math.max(10,Math.min(12,w/92))+'px "IBM Plex Mono",monospace';ctx.letterSpacing='2px';ctx.globalAlpha=.84;ctx.fillText('ILLUSTRATIVE · FIXED IDENTITIES AND OUTCOMES',w/2,h*.155);
  var headline=Math.max(20,Math.min(44,w/21,h*.085));ctx.letterSpacing='0px';ctx.font='500 '+headline+'px Georgia,"Times New Roman",serif';ctx.fillStyle='#f4fbff';ctx.globalAlpha=1;ctx.fillText('Make a crowd',w/2,h*.245);ctx.fillText('easier to follow.',w/2,h*.335);
  ctx.font='500 '+Math.max(15,headline*.36)+'px Georgia,"Times New Roman",serif';ctx.fillStyle='#88eed4';ctx.fillText(phase<2?'One authored spread · nine fixed examples':phase===2?'Follow a candidate · then sequence-check':'The green screen selects only one slice',w/2,h*.415);
  var cols=[.27,.5,.73],rows=[.54,.68,.81],wellRx=Math.min(48,w*.09,h*.125),routeAlpha=nspstoryEase((authored-450)/750),travel=nspstoryEase((authored-900)/1800),arrival=nspstoryEase((authored-2400)/900);
  var pathColors=['#53e6cd','#b18aff','#ffc66d'];
  for(var i=0;i<9;i++){
    var col=i%3,row=Math.floor(i/3),end={x:w*cols[col],y:h*rows[row]},start={x:w*(col===0?.1:col===2?.9:row%2?.12:.88),y:h*.19};
    var side=col===0?-.04:col===2?.04:(start.x<w/2?.06:-.06),cp1={x:start.x+w*side,y:h*.42},cp2={x:end.x+(start.x<w/2?-w*.07:w*.07),y:end.y-h*.08};
    ctx.save();ctx.globalAlpha=.08+.36*routeAlpha;ctx.strokeStyle=pathColors[col];ctx.lineWidth=1.2+bloom*1.4;ctx.shadowColor=pathColors[col];ctx.shadowBlur=6+bloom*13;ctx.setLineDash([2,8]);ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.bezierCurveTo(cp1.x,cp1.y,cp2.x,cp2.y,end.x,end.y);ctx.stroke();ctx.restore();
    if(authored>=900 && authored<3000){var local=Math.max(0,Math.min(1,travel-(i%3)*.075));if(local>0&&local<1){var point=nspstoryCurve(local,start,cp1,cp2,end);nspstoryCanvasToken(ctx,point.x,point.y,i%3,Math.max(4,wellRx*.1),1,bloom+.35);}}
    nspstoryDrawWell(ctx,end.x,end.y,wellRx,NSPSTORY_WELLS[i],phase===2&&i===4,still?1:Math.max(.32,arrival),bloom);
  }
  ctx.globalAlpha=1;ctx.textAlign='left';ctx.textBaseline='bottom';ctx.font='500 '+Math.max(9,Math.min(12,w/96))+'px "IBM Plex Sans",sans-serif';ctx.fillStyle='#9fb6c1';ctx.fillText('Shapes = lineages · positions and counts are not data',Math.max(12,w*.025),h*.96,w*.7);
  ctx.textAlign='right';ctx.fillStyle=phase===3?'#ffc66d':'#91a8b2';ctx.fillText('candidate ≠ proof',w-Math.max(12,w*.025),h*.96,w*.23);
  state.canvasProgress=authored/4000;
}
function nspstoryCanvasBackdrop(ctx,state,image,intensity){
  var w=state.width,h=state.height,bloom=intensity==='lively'?1:intensity==='medium'?.5:.12;
  var atmosphereTime=state.elapsed*({slow:.72,normal:1,fast:1.34}[state.prefs.tempo]||1);
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#030d18';ctx.fillRect(0,0,w,h);
  if(image&&image.complete&&image.naturalWidth){var scale=Math.max(w/image.naturalWidth,h/image.naturalHeight),iw=image.naturalWidth*scale,ih=image.naturalHeight*scale;ctx.save();ctx.globalAlpha=.26+bloom*.3;ctx.drawImage(image,(w-iw)/2,(h-ih)/2,iw,ih);ctx.restore();}
  for(var i=0;i<24;i++){var x=((i*67)%101)/101*w+Math.sin(atmosphereTime/1900+i)*6*bloom,y=((i*37)%97)/97*h;ctx.fillStyle=i%2?'#53e6cd':'#b18aff';ctx.globalAlpha=.1+bloom*.22;ctx.beginPath();ctx.arc(x,y,1+(i%3)*.45,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;return bloom;
}
function nspstoryDrawReporterCanvas(ctx,state,m,image){
  var w=state.width,h=state.height,bloom=nspstoryCanvasBackdrop(ctx,state,image,state.prefs.intensity||m.ambientIntensity),phase=m.phase;
  var duration=4000,authored=state.reduced || !m.ambient || phase!==0?duration:Math.min(duration,state.elapsed);
  var clearing=ctx.createRadialGradient(w*.5,h*.28,0,w*.5,h*.28,w*.42);clearing.addColorStop(0,'rgba(3,13,24,.98)');clearing.addColorStop(1,'rgba(3,13,24,0)');ctx.fillStyle=clearing;ctx.fillRect(0,0,w,h*.55);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#bed3dc';ctx.font='600 11px "IBM Plex Mono",monospace';ctx.fillText('ILLUSTRATIVE · REPORTER SIGNAL IS NOT THE VIRUS',w/2,h*.13);
  var fs=Math.min(47,Math.max(32,w/20));ctx.font='500 '+fs+'px Georgia,serif';ctx.fillStyle='#f6fbff';ctx.fillText('A green cell is a clue.',w/2,h*.25);ctx.font='500 '+Math.max(16,fs*.38)+'px Georgia,serif';ctx.fillStyle='#8cebd1';ctx.fillText(phase===0?'Arrival can leave the reporter dark.':phase===1?'A rare frame-restoring change permits GFP.':phase===2?'The reporter phenotype can travel with a lineage.':'Sequence is the check.',w/2,h*.34);
  function cell(x,y,r,green,alpha){ctx.save();ctx.globalAlpha=alpha;var g=ctx.createRadialGradient(x-r*.2,y-r*.2,0,x,y,r*1.3);g.addColorStop(0,green?'rgba(87,244,180,.5)':'rgba(80,132,154,.4)');g.addColorStop(1,'rgba(5,18,29,.18)');ctx.fillStyle=g;ctx.strokeStyle=green?'#58e6a5':'#6f9baa';ctx.lineWidth=2.2;ctx.shadowColor=green?'#53e6a5':'#65bad0';ctx.shadowBlur=(10+bloom*18);ctx.beginPath();ctx.ellipse(x,y,r,r*.78,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=green?'#9bffd2':'#99aeb7';ctx.font='600 '+Math.max(10,r*.2)+'px "IBM Plex Mono",monospace';ctx.fillText(green?'GFP ON':'GFP OFF',x,y);ctx.restore();}
  var cy=h*.65;ctx.strokeStyle='rgba(138,210,218,.35)';ctx.setLineDash([4,8]);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(w*.2,cy);ctx.bezierCurveTo(w*.34,cy-h*.12,w*.42,cy,w*.48,cy);ctx.moveTo(w*.56,cy);ctx.bezierCurveTo(w*.67,cy-h*.1,w*.75,cy,w*.84,cy);ctx.stroke();ctx.setLineDash([]);
  var px=w*.18+Math.min(1,authored/(duration*.3))*w*.2;ctx.fillStyle='#b18aff';ctx.shadowColor='#b18aff';ctx.shadowBlur=14+bloom*10;ctx.beginPath();ctx.arc(px,cy,9,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  cell(w*.5,cy,Math.min(74,h*.17),phase>0,1);cell(w*.72,cy-h*.07,Math.min(42,h*.1),phase>=2,phase>=2?1:.24);cell(w*.84,cy+h*.07,Math.min(42,h*.1),phase>=2,phase>=2?1:.24);
  ctx.font='500 12px "IBM Plex Sans",sans-serif';ctx.textAlign='left';ctx.fillStyle='#a8bec8';ctx.fillText('Particle arrives',w*.08,h*.88);ctx.textAlign='center';ctx.fillText('cell makes fluorescent protein',w*.5,h*.88);ctx.textAlign='right';ctx.fillStyle=phase===3?'#ffc66d':'#a8bec8';ctx.fillText(phase===3?'green clue · sequence-check': 'lineage phenotype',w*.93,h*.88);state.canvasProgress=authored/duration;
}
function nspstoryDrawOriginCanvas(ctx,state,m,image){
  var w=state.width,h=state.height,bloom=nspstoryCanvasBackdrop(ctx,state,image,state.prefs.intensity||m.ambientIntensity),phase=m.phase;
  var clearing=ctx.createRadialGradient(w*.5,h*.25,0,w*.5,h*.25,w*.4);clearing.addColorStop(0,'rgba(3,13,24,.98)');clearing.addColorStop(1,'rgba(3,13,24,0)');ctx.fillStyle=clearing;ctx.fillRect(0,0,w,h*.5);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffc66d';ctx.font='600 11px "IBM Plex Mono",monospace';ctx.fillText('PROPOSED / NOT OBSERVED',w/2,h*.11);var fs=Math.min(45,Math.max(31,w/21));ctx.font='500 '+fs+'px Georgia,serif';ctx.fillStyle='#f6fbff';ctx.fillText('A match suggests an origin.',w/2,h*.24);ctx.font='500 '+Math.max(15,fs*.36)+'px Georgia,serif';ctx.fillStyle='#91e8d2';ctx.fillText('Observed endpoints · inferred relationship · unresolved incorporation',w/2,h*.34);
  var sy=h*.63,lx=w*.16,rx=w*.84;ctx.lineCap='round';ctx.strokeStyle='#526f83';ctx.lineWidth=17;ctx.beginPath();ctx.moveTo(w*.08,sy);ctx.bezierCurveTo(w*.32,sy-h*.05,w*.67,sy+h*.05,w*.92,sy);ctx.stroke();ctx.strokeStyle='#b18aff';ctx.lineWidth=15;ctx.beginPath();ctx.moveTo(lx-w*.055,sy);ctx.lineTo(lx+w*.055,sy);ctx.stroke();ctx.strokeStyle='#53e6cd';ctx.beginPath();ctx.moveTo(rx-w*.045,sy);ctx.lineTo(rx+w*.045,sy);ctx.stroke();
  ctx.setLineDash([8,9]);ctx.strokeStyle='#ffc66d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(lx,sy-h*.05);ctx.bezierCurveTo(w*.34,h*.42,w*.66,h*.42,rx,sy-h*.05);ctx.stroke();ctx.setLineDash([]);
  ctx.font='600 12px "IBM Plex Mono",monospace';ctx.fillStyle='#ddd4ff';ctx.textAlign='center';ctx.fillText('MATCHING SOURCE',lx,sy+h*.13);ctx.fillStyle='#b3f7df';ctx.fillText('RECIPIENT / INSERTION',rx,sy+h*.13);
  if(phase===3){var travel=nspstoryEase(state.reduced || !m.ambient?1:Math.min(1,state.elapsed/1500)),p=nspstoryCurve(travel,{x:lx,y:sy-h*.05},{x:w*.34,y:h*.42},{x:w*.66,y:h*.42},{x:rx,y:sy-h*.05});ctx.strokeStyle='#d8cbff';ctx.lineWidth=10;ctx.shadowColor='#b18aff';ctx.shadowBlur=12+bloom*12;ctx.beginPath();ctx.moveTo(p.x-22,p.y);ctx.lineTo(p.x+22,p.y);ctx.stroke();ctx.shadowBlur=0;}
  ctx.textAlign='left';ctx.fillStyle='#a8bec8';ctx.font='500 12px "IBM Plex Sans",sans-serif';ctx.fillText('Solid marks = observed sequence match and insertion',w*.05,h*.9);ctx.textAlign='right';ctx.fillStyle='#ffc66d';ctx.fillText('incorporation unresolved',w*.95,h*.9);state.canvasProgress=phase===3?Math.min(1,state.elapsed/1500):1;
}
function nspstoryMountCanvas(host,panel,m) {
  var canvas=host.querySelector('.nspstory-canvas');if(!canvas)return null;
  var view=canvas.ownerDocument && canvas.ownerDocument.defaultView,image=view && view.Image ? new view.Image() : null;
  var prefs=host._nspstoryPrefs;
  if(!prefs || prefs.scene!==m.scene)prefs=host._nspstoryPrefs={scene:m.scene,intensity:panel.ambientIntensity || 'quiet',tempo:panel.ambientTempo || 'slow',playing:true};
  if(host._nspstoryPhase!==m.phase){delete host._nspstoryCanvasMemory;host._nspstoryPhase=m.phase;}
  var renderScene=m.scene==='reporter'?nspstoryDrawReporterCanvas:m.scene==='origin'?nspstoryDrawOriginCanvas:nspstoryDrawDilution;
  var controller=scienceLazyCanvasScene(host,canvas,{memoryKey:'_nspstoryCanvasMemory',prefs:{intensity:prefs.intensity,tempo:prefs.tempo},shouldAnimate:function(){return m.ambient;},onStateChange:function(state){canvas.setAttribute('data-canvas-reduced',String(state.reduced));if(host._nspstoryRefreshControls)host._nspstoryRefreshControls(state.reduced);},render:function(ctx,state){renderScene(ctx,state,m,image);canvas.setAttribute('data-canvas-reduced',String(state.reduced));canvas.setAttribute('data-canvas-progress',(state.reduced?1:state.canvasProgress).toFixed(3));}});
  if(image){image.onload=function(){if(controller)controller.requestDraw();};image.src=NSPSTORY_ATMOSPHERE;}
  var cleanup=host._panelMotionCleanup;
  host._panelMotionCleanup=function(){if(image)image.onload=null;if(cleanup)cleanup();host._nspstoryRefreshControls=null;};
  host._nspstoryCanvas=controller;return controller;
}
function nspstoryControls(m) {
  if (m.scene === 'evidence') return '';
  function choices(kind, values, labels, selected) {
    return '<div class="nspstory-choice" role="group" aria-label="' + kind + '"><span>' + kind + '</span>' + values.map(function (value,i) {
      return '<button type="button" data-nsp-' + kind.toLowerCase() + '="' + value + '" aria-pressed="' + (value === selected) + '">' + labels[i] + '</button>';
    }).join('') + '</div>';
  }
  var limits=m.scene === 'dilution'
    ? '<strong>Scene limits</strong><span>Fixed illustrative outcomes—not well counts, probabilities, or a protocol. A single-looking well is a candidate, not proof.</span><span><b>Evidence:</b> 8/18 examined WT green isolates carried insertions; sequence checks the recovered reporter region.</span>'
    : m.scene === 'origin' ? '<strong>Scene limits</strong><span>Solid marks show the observed match and insertion. The dashed relationship and moving fragment are proposed, not observed.</span><span><b>Evidence:</b> 12,063 / 13,816 long WT inserts mapped to virus; incorporation remains unresolved.</span>'
    : '<strong>Scene limits</strong><span>The particle is not green. GFP is a reporter signal, and a green culture can still contain multiple lineages.</span><span><b>Evidence:</b> 8/18 examined WT green isolates carried insertions; sequence checks the recovered reporter region.</span>';
  return '<div class="nspstory-dock"><details class="nspstory-disclosure"><summary>Evidence + limits</summary><div>' + limits + '</div></details>' +
    '<div class="nspstory-controls" aria-label="Illustrative motion controls">' +
      choices('Light',['quiet','medium','lively'],['Quiet','Glow','Bloom'],m.ambientIntensity) +
      choices('Tempo',['slow','normal','fast'],['Gentle','Normal','Brisk'],m.ambientTempo) +
      '<div class="nspstory-choice nspstory-playback" role="group" aria-label="Playback"><span class="nspstory-playback-status">Motion</span><button type="button" data-nsp-action="play" aria-pressed="true">Play</button><button type="button" data-nsp-action="pause" aria-pressed="false">Pause</button><button type="button" data-nsp-action="replay">Replay</button></div>' +
    '</div></div>';
}
function nspstoryBindControls(host, panel) {
  if (!host || typeof host.querySelector !== 'function') return;
  var root=host.querySelector('.nspstory'), ambient=root && root.querySelector('.nspstory-ambient');
  if (!root || !root.querySelector('.nspstory-controls')) return;
  var scene=root.getAttribute('data-scene'), prefs=host._nspstoryPrefs, canvasController=host._nspstoryCanvas;
  if (!prefs || prefs.scene !== scene) prefs=host._nspstoryPrefs={scene:scene,intensity:panel.ambientIntensity || 'quiet',tempo:panel.ambientTempo || 'slow',playing:true};
  function animations() { return typeof root.getAnimations === 'function' ? root.getAnimations({subtree:true}) : []; }
  function finiteAnimations() { return animations().filter(function (animation) { return Number.isFinite(animation.effect.getComputedTiming().endTime); }); }
  function apply() {
    root.setAttribute('data-live-intensity',prefs.intensity); root.setAttribute('data-live-tempo',prefs.tempo);
    if (ambient) {
      NSPSTORY_AMBIENT_INTENSITIES.forEach(function (value) { ambient.classList.remove('nspstory-ambient-'+value); });
      NSPSTORY_AMBIENT_TEMPOS.forEach(function (value) { ambient.classList.remove('nspstory-ambient-'+value); });
      ambient.classList.add('nspstory-ambient-'+prefs.intensity,'nspstory-ambient-'+prefs.tempo);
    }
    root.setAttribute('data-playing',prefs.playing?'true':'false');
    Array.from(root.querySelectorAll('[data-nsp-light]')).forEach(function (button) { button.setAttribute('aria-pressed',String(button.getAttribute('data-nsp-light') === prefs.intensity)); });
    Array.from(root.querySelectorAll('[data-nsp-tempo]')).forEach(function (button) { button.setAttribute('aria-pressed',String(button.getAttribute('data-nsp-tempo') === prefs.tempo)); });
    Array.from(root.querySelectorAll('[data-nsp-action]')).forEach(function (button) {
      var action=button.getAttribute('data-nsp-action');
      if (action !== 'replay') button.setAttribute('aria-pressed',String(action === (prefs.playing ? 'play' : 'pause')));
    });
    animations().forEach(function (animation) {
      if (!prefs.playing && (animation.playState === 'running' || animation.playState === 'pending')) animation.pause();
      else if (prefs.playing && animation.playState === 'paused') animation.play();
    });
    if(canvasController){canvasController.setPrefs({intensity:prefs.intensity,tempo:prefs.tempo});if(prefs.playing)canvasController.play();else canvasController.pause();}
  }
  Array.from(root.querySelectorAll('[data-nsp-light]')).forEach(function (button) { button.onclick=function () { prefs.intensity=button.getAttribute('data-nsp-light');apply(); }; });
  Array.from(root.querySelectorAll('[data-nsp-tempo]')).forEach(function (button) { button.onclick=function () { prefs.tempo=button.getAttribute('data-nsp-tempo');apply(); }; });
  Array.from(root.querySelectorAll('[data-nsp-action]')).forEach(function (button) { button.onclick=function () {
    var action=button.getAttribute('data-nsp-action');
    if (action === 'replay') { prefs.playing=true;if(canvasController)canvasController.replay();finiteAnimations().forEach(function (animation) { animation.cancel();animation.play(); }); }
    else prefs.playing=action === 'play';
    apply();
  }; });
  host._nspstoryRefreshControls=function(reduced){
    var status=root.querySelector('.nspstory-playback-status');if(status)status.textContent=reduced?'Reduced motion · still':'Motion';
    Array.from(root.querySelectorAll('[data-nsp-action]')).forEach(function(button){button.disabled=reduced;});
  };
  host._nspstoryRefreshControls(!!(canvasController && !canvasController.canAnimate()));
  apply();
}
function nspstoryPrintFrame(m) {
  var phases={reporter:3,dilution:3,origin:3,evidence:1};
  var headings={reporter:'Reporter lineage + sequence check',dilution:'Dilution outcomes + selection boundary',origin:'Source → recipient · proposed, unresolved',evidence:'Published HCoV-OC43 comparison'};
  var copy=Object.assign({},m,{phase:phases[m.scene],heading:headings[m.scene],print:true});
  var draw={reporter:nspstoryReporter,dilution:nspstoryDilution,origin:nspstoryOrigin,evidence:nspstoryEvidence};
  return '<svg class="nspstory-frame nspstory-print-frame" viewBox="0 0 760 410" role="img" aria-label="Print summary: ' + esc(headings[m.scene]) + '"><title>Print summary: ' + esc(headings[m.scene]) + '</title><g aria-hidden="true">' +
    nspstoryText(24,28,m.scene==='evidence'?'EVIDENCE / PUBLISHED FIXED VALUES':'ILLUSTRATIVE / CONCEPTUAL · NOT TO SCALE','kicker') +
    nspstoryText(24,61,copy.heading,'heading') + draw[m.scene](copy) + '</g></svg>';
}
function nspstoryHTML(panel, state, animate) {
  var m = nspstoryModel(panel, state);
  var draw = {reporter:nspstoryReporter, dilution:nspstoryDilution, origin:nspstoryOrigin, evidence:nspstoryEvidence};
  var screen=m.scene!=='evidence' ? nspstoryCanvasFrame(m) : '<svg class="nspstory-frame nspstory-screen-frame" viewBox="0 0 760 410" role="img" aria-label="' + esc(m.aria) + '"><title>' + esc(m.aria) + '</title><g aria-hidden="true">' +
    nspstoryText(24,28,m.scene==='evidence'?'EVIDENCE / PUBLISHED FIXED VALUES':'ILLUSTRATIVE / CONCEPTUAL · NO MOLECULAR TIMESCALE','kicker') +
    nspstoryText(24,66,m.heading,m.scene === 'origin' ? 'editorial' : 'heading') + nspstoryAmbient(m) + draw[m.scene](m) + '</g></svg>';
  return '<div class="nspstory' + (animate ? ' nspstory-motion' : '') + '" data-scene="' + m.scene + '" data-phase="' + m.phase + '" data-ambient="' + (m.ambient?'on':'off') + '" data-ambient-intensity="' + m.ambientIntensity + '" data-ambient-tempo="' + m.ambientTempo + '">' +
    screen + nspstoryControls(m) + nspstoryPrintFrame(m) +
    '<p class="nspstory-caption">' + esc(m.caption || m.aria) + '</p></div>';
}
PanelRegistry.define('nspstory', {
  label:'NSP15 evidence story', since:'0.2.0', order:51,
  validateDeclaration:function(panel,path,warnings) {
    if (panel.scene !== undefined && NSPSTORY_SCENES.indexOf(panel.scene) < 0) warnings.push(path+'.scene: expected '+NSPSTORY_SCENES.join('|')+' — using reporter');
    if (panel.ambient !== undefined && typeof panel.ambient !== 'boolean') warnings.push(path+'.ambient: expected true or false — using scene default');
    if (panel.ambientIntensity !== undefined && NSPSTORY_AMBIENT_INTENSITIES.indexOf(panel.ambientIntensity) < 0) warnings.push(path+'.ambientIntensity: expected '+NSPSTORY_AMBIENT_INTENSITIES.join('|')+' — using quiet');
    if (panel.ambientTempo !== undefined && NSPSTORY_AMBIENT_TEMPOS.indexOf(panel.ambientTempo) < 0) warnings.push(path+'.ambientTempo: expected '+NSPSTORY_AMBIENT_TEMPOS.join('|')+' — using slow');
    nspstoryClean(panel.initial,path+'.initial',warnings,false);
  },
  validatePatch:function(patch,path,panel,warnings) { nspstoryClean(patch,path,warnings,true); },
  fold:function(panel,steps) { return foldSanitizedPanelStates(panel,steps,function(raw,once) { return nspstoryClean(raw,'state',null,once); }); },
  render:function(host,panel,state,skin,states,step,animate) { var model=nspstoryModel(panel,state);return {html:nspstoryHTML(panel,state,animate),remountAfterMotionCancel:model.scene!=='evidence',mounted:function () { if(model.scene!=='evidence')nspstoryMountCanvas(host,panel,model);nspstoryBindControls(host,panel); }}; },
  layout:{height:11,fallbackHeight:11,canvasSizing:{mode:'fixed-aspect',aspect:760/410,resizeAxis:'width'},sectionSizing:{minWidth:480,preferredWidth:760,maxWidth:1400,aspectPolicy:'fixed',bodyAspect:760/410,grow:1,contentSelector:'.nspstory-frame',ancillarySelector:'.nspstory-caption'}},
  authoring:{initialFields:true,transientFields:NSPSTORY_FIELDS.slice(),
    template:{title:'NSP15 evidence lesson',scene:'reporter',ambient:true,ambientIntensity:'quiet',ambientTempo:'slow',initial:{phase:0}},
    setupFields:[['scene','enum',NSPSTORY_SCENES],['ambient','bool'],['ambientIntensity','enum',NSPSTORY_AMBIENT_INTENSITIES],['ambientTempo','enum',NSPSTORY_AMBIENT_TEMPOS],['initial','json']],patchFields:[['phase','num'],['caption','text']],
    fieldMeta:{scene:{label:'Lesson'},ambient:{label:'Ambient atmosphere',help:'Decorative background motion only; it never changes evidence or teaches a biological timescale.'},ambientIntensity:{label:'Ambient intensity'},ambientTempo:{label:'Ambient tempo'},phase:{label:'Lesson phase (0–3)',help:'Four authored frames per lesson. Animation explains the frame; it does not simulate biology.'},caption:{label:'Evidence and limits'}},
    picker:{order:51,name:'NSP15 evidence story',category:'Science & sequencing',tagline:'Four animated preprint lessons',description:'Sequence-free reporter, dilution and source inference cartoons plus the published HCoV-OC43 comparison. Each lesson has four phases and a still state.'},
    example:function(sample) { sample.state={phase:2}; return sample; }
  },
  styles:String.raw`
.section-layout-tile>.pt-nspstory{display:flex;flex-direction:column;overflow:hidden}.section-layout-tile>.pt-nspstory>.ptitle{flex:none}.section-layout-tile>.pt-nspstory>.pbody{display:flex;flex:1;min-height:0;flex-direction:column}
.pt-nspstory:has(.nspstory[data-scene="reporter"]),.pt-nspstory:has(.nspstory[data-scene="dilution"]),.pt-nspstory:has(.nspstory[data-scene="origin"]){background:#050b13!important;border-color:#173344!important;box-shadow:0 18px 55px #02060db8!important}.pt-nspstory:has(.nspstory[data-scene="reporter"])>.ptitle,.pt-nspstory:has(.nspstory[data-scene="dilution"])>.ptitle,.pt-nspstory:has(.nspstory[data-scene="origin"])>.ptitle{background:#050b13!important;color:#8baab8!important;border-color:#173344!important;font:600 10px/1.4 'IBM Plex Mono',monospace;letter-spacing:.12em;text-transform:uppercase}
.nspstory{--ns-ink:#20354a;--ns-muted:#596b7a;--ns-line:#ccd9df;--ns-paper:#fffefa;--ns-zone:#f2f6f5;--ns-green:#19865b;--ns-violet:#7163a8;color:var(--ns-ink);min-width:0;min-height:0;flex:1;display:flex;flex-direction:column;position:relative;scroll-margin-top:112px}
.nspstory[data-scene="reporter"],.nspstory[data-scene="dilution"],.nspstory[data-scene="origin"]{--ns-ink:#eefbff;--ns-muted:#a7bdc8;--ns-line:#2b4653;--ns-paper:#06131c;--ns-zone:#0b202a;--ns-green:#55e49c;--ns-violet:#a993ff}
.nspstory-frame{display:block;width:100%;min-height:0;flex:1 1 auto;background:var(--ns-paper);border:1px solid var(--ns-line);border-radius:15px;box-sizing:border-box;overflow:hidden}.nspstory[data-scene="dilution"] .nspstory-screen-frame,.nspstory[data-scene="origin"] .nspstory-screen-frame{background:radial-gradient(circle at 23% 41%,#143d3b 0,#081c27 22%,transparent 45%),radial-gradient(circle at 78% 45%,#261b45 0,#10172d 24%,transparent 46%),linear-gradient(145deg,#030811,#071725 58%,#090c1b);border:0;border-radius:0}
.nspstory-canvas-frame{position:relative;background:#030d18!important}.nspstory-canvas{display:block;width:100%;height:100%}.nspstory-a11y,.nspstory-canvas-outcome{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
.nspstory-print-frame{display:none}
.docview:has(#section-green-reporter) .stepline.dv-caption-old{display:none}.docview:has(#section-green-reporter) .stepline.dv-caption-new{animation:none}
.docview:has(#section-green-reporter) .stepline .stepid{display:none}
@media screen{.docview:has(#section-green-reporter){padding-top:12px;padding-bottom:20px}.docview:has(#section-green-reporter) .doc-title{font:500 23px/1.2 Georgia,serif}.docview:has(#section-green-reporter) .doc-sec{margin-top:10px;padding:10px 12px 12px;background:#0b1923;border-color:#254350}.docview:has(#section-green-reporter) .sec-eyebrow{font-size:9px;margin:0}.docview:has(#section-green-reporter) .sec-h{font-size:16px;margin:0 0 3px}.docview:has(#section-green-reporter) .sec-teaser{margin-bottom:4px}.docview:has(#section-green-reporter) .section-layout-grid{margin-top:6px}}
.nspstory-dock{display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:8px 10px;background:#030b14;flex:none;border-top:1px solid #193b49}
.nspstory-dock .nspstory-controls{position:relative;right:auto;bottom:auto;flex:1;flex-wrap:wrap;justify-content:flex-end;border:0;box-shadow:none;padding:0;background:transparent;gap:5px}
.nspstory-dock .nspstory-disclosure{position:relative;left:auto;bottom:auto;width:auto;flex:none}
.nspstory-dock .nspstory-choice button{padding:7px 4px}.nspstory-dock .nspstory-choice>span{font-size:8px}
.nspstory[data-scene="evidence"]{--ns-ink:#e9f7fa;--ns-muted:#a2bac7;--ns-line:#274554;--ns-paper:#06131e;--ns-zone:#102737}
.nspstory[data-scene="evidence"] .nspstory-screen-frame{background:radial-gradient(ellipse at 10% 0,#153f43,#06131e 70%);border:0;border-radius:0}
.nspstory[data-scene="evidence"] .nspstory-gridline{stroke:#2a4655}.nspstory[data-scene="evidence"] .nspstory-row-focus{fill:#224d4c;fill-opacity:.5}
.nspstory[data-scene="evidence"] .nspstory-wt{fill:#6be2bb}.nspstory[data-scene="evidence"] .nspstory-inactive{fill:#bba1ed}
.nspstory[data-scene="evidence"] .nspstory-heading{font:500 25px Georgia,serif}.nspstory[data-scene="evidence"] .nspstory-value{fill:#effcff}
.doc-sec:is(#section-green-reporter,#section-limiting-dilution,#section-analysis-ladder,#section-class-signature,#section-origin-map,#section-second-virus,#section-assay-limits) .pwidget{--dink:#e3f4f6;--dtext:#b7cdd6;--dfaint:#839fab;--dline:#294553;background:linear-gradient(145deg,#0d2330,#06131d);border-color:#294957;box-shadow:0 12px 32px #03101a33}
.doc-sec:is(#section-green-reporter,#section-limiting-dilution,#section-analysis-ladder,#section-class-signature,#section-origin-map,#section-second-virus,#section-assay-limits) .pwidget>.ptitle{background:#081923;color:#b6cdd5;border-color:#294653;font:600 10px/1.4 'IBM Plex Mono',monospace;letter-spacing:.07em}
.doc-sec:is(#section-green-reporter,#section-limiting-dilution,#section-analysis-ladder,#section-class-signature,#section-origin-map,#section-second-virus,#section-assay-limits) .swtable{border-collapse:separate;border-spacing:0 9px;font:13px/1.6 'IBM Plex Sans',sans-serif}
.doc-sec:is(#section-green-reporter,#section-limiting-dilution,#section-analysis-ladder,#section-class-signature,#section-origin-map,#section-second-virus,#section-assay-limits) .swtable td{padding:12px 10px;background:#102936;border-top:1px solid #294958;border-bottom:1px solid #294958;color:#c5dce3;white-space:normal}
.doc-sec:is(#section-green-reporter,#section-limiting-dilution,#section-analysis-ladder,#section-class-signature,#section-origin-map,#section-second-virus,#section-assay-limits) .swtable td:first-child{color:#8ce8cd;border-left:2px solid #3a8b81;border-radius:7px 0 0 7px;font-weight:600}
.doc-sec:is(#section-green-reporter,#section-limiting-dilution,#section-analysis-ladder,#section-class-signature,#section-origin-map,#section-second-virus,#section-assay-limits) .swtable td:last-child{border-radius:0 7px 7px 0}
#section-analysis-ladder .pwidget[data-dv-panel="0"] .swtable tbody td:first-child{font:500 19px/1.5 Georgia,serif;min-width:120px;box-shadow:inset 3px 0 #3a8b81}
#section-analysis-ladder .pwidget[data-dv-panel="1"] .swtable tbody td:first-child{font-size:12px;white-space:nowrap}
#section-analysis-ladder .pwidget[data-dv-panel="0"] .swtable{display:block;border:0;background:transparent;overflow:visible}
#section-analysis-ladder .pwidget[data-dv-panel="0"] .swtable thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
#section-analysis-ladder .pwidget[data-dv-panel="0"] .swtable tbody{display:grid;gap:14px;padding:8px 4px}
#section-analysis-ladder .pwidget[data-dv-panel="0"] .swtable tr{position:relative;display:grid;grid-template-columns:42% 1fr;align-items:center;min-height:51px;padding:0 8px 0 32px;border:1px solid #315969;border-radius:12px;background:linear-gradient(110deg,#10323e,#0b1d2c);box-shadow:inset 0 1px #69bfbc18}
#section-analysis-ladder .pwidget[data-dv-panel="0"] .swtable tr:not(:last-child)::before{content:'';position:absolute;left:16px;top:100%;height:15px;border-left:1px dashed #65c5bc;opacity:.65}
#section-analysis-ladder .pwidget[data-dv-panel="0"] .swtable tr::after{content:'';position:absolute;left:11px;top:calc(50% - 5px);width:9px;height:9px;border-radius:50%;background:#4c8d97;border:1px solid #80c9cf;box-shadow:0 0 9px #74d8d74d}
#section-analysis-ladder .pwidget[data-dv-panel="0"] .swtable td{display:block;background:transparent!important;border:0!important;box-shadow:none!important;padding:8px 5px;min-width:0!important}
#section-analysis-ladder .pwidget[data-dv-panel="0"] .swtable td:first-child{font:500 18px/1.25 Georgia,serif}
#section-analysis-ladder .pwidget[data-dv-panel="0"] .swtable td:last-child{position:absolute;right:5px;top:0;padding:0;transform:translateY(-50%)}
#section-analysis-ladder .pwidget[data-dv-panel="0"] .swrow-neutral .swbadge{display:none}
#section-analysis-ladder .pwidget[data-dv-panel="0"] .swtable tr.swrow-changed{border-color:#68e8c4;background:linear-gradient(110deg,#1c504f,#133039);box-shadow:0 0 20px #43d9b21c,inset 0 0 20px #54c9ab12}
#section-analysis-ladder .pwidget[data-dv-panel="0"] .swtable tr.swrow-changed::after{background:#b0ffe0;border-color:#ddfff3;box-shadow:0 0 15px #5cfdc8}
#section-analysis-ladder .pwidget[data-dv-panel="0"] .swbadge{background:#123b38;color:#9efbd6;border-color:#66c8aa}
#section-analysis-ladder .swtable .swrow-changed td{background:#173f44;border-color:#65d6b1}
#section-analysis-ladder .pwidget:first-child .swtable tbody td:first-child{color:#a1ffe0}
#section-assay-limits .swtable tbody td{height:60px;box-sizing:border-box;padding:7px 8px;font-size:12px}
#section-assay-limits .swtable{border-spacing:0 6px}
#section-second-virus .swtable tbody td{padding:7px 8px;font-size:12px}
#section-assay-limits .pwidget[data-dv-panel="1"] .swtable td:first-child{color:#f3ca88;border-left-color:#ac814c}
#section-second-virus .pwidget[data-dv-panel="1"]{border-top:3px solid #b49be5}
#section-second-virus .pwidget[data-dv-panel="0"]{border-top:3px solid #69d9b6}
.doc-sec:is(#section-class-signature,#section-second-virus) .grid-value{font-size:25px;font-weight:500}
.doc-sec:is(#section-origin-map,#section-second-virus) .funnel-count{font-size:18px}.doc-sec:is(#section-origin-map,#section-second-virus) .funnel-label{font-size:12px}.doc-sec:is(#section-origin-map,#section-second-virus) .funnel-row{padding-top:12px;padding-bottom:12px}
.nspstory-caption{font:13px/1.45 'IBM Plex Sans',sans-serif;margin:9px 2px 0;color:var(--dtext);overflow-wrap:anywhere;flex:none}.nspstory[data-scene="reporter"] .nspstory-caption,.nspstory[data-scene="dilution"] .nspstory-caption,.nspstory[data-scene="origin"] .nspstory-caption{margin:0;padding:9px 14px 10px;color:#afc3cd;background:#050b13;border-top:1px solid #183241}
.doc-sec:is(#section-analysis-ladder,#section-class-signature,#section-second-virus,#section-assay-limits) .pwidget{background:#07131d;border-color:#254353;box-shadow:0 12px 32px #03101a33}.doc-sec:is(#section-analysis-ladder,#section-class-signature,#section-second-virus,#section-assay-limits) .pwidget>.ptitle{background:#0a1a25;color:#bcd2dc;border-color:#294653;font:600 10px/1.35 'IBM Plex Mono',monospace;letter-spacing:.08em}.doc-sec:is(#section-analysis-ladder,#section-class-signature,#section-second-virus,#section-assay-limits) .pbody{color:#e8f5f8}.doc-sec:is(#section-analysis-ladder,#section-class-signature,#section-second-virus,#section-assay-limits) :is(table,.ptable,.pgrid){color:#e8f5f8}.doc-sec:is(#section-analysis-ladder,#section-class-signature,#section-second-virus,#section-assay-limits) :is(th,.th){color:#79e6c4}.doc-sec:is(#section-analysis-ladder,#section-class-signature,#section-second-virus,#section-assay-limits) :is(td,.td){border-color:#294653}
.nspstory-heading{font:600 25px 'IBM Plex Sans',sans-serif;fill:var(--ns-ink);letter-spacing:-.02em}
.nspstory-editorial{font:500 34px/1 Georgia,'Times New Roman',serif;fill:#f5fbff;letter-spacing:-.035em}
.nspstory-kicker{font:600 11px 'IBM Plex Mono',monospace;letter-spacing:.08em;fill:var(--ns-muted)}
.nspstory-label{font:600 16px 'IBM Plex Sans',sans-serif;fill:var(--ns-ink)}
.nspstory-small{font:14px 'IBM Plex Sans',sans-serif;fill:var(--ns-muted)}
.nspstory-value{font:600 16px 'IBM Plex Mono',monospace;fill:var(--ns-ink)}
.nspstory-contrast{font:600 14px 'IBM Plex Mono',monospace;fill:var(--ns-ink)}
.nspstory-zone,.nspstory-band{fill:var(--ns-zone)}
.nspstory-arrow{stroke:var(--ns-muted);stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.nspstory-particle{fill:#ebe7f6;stroke:var(--ns-violet);stroke-width:2}.nspstory-particle path{fill:none}
.nspstory-cell ellipse{fill:#e4e9eb;stroke:#94a5ae;stroke-width:2}.nspstory-cell circle{fill:#cbd6da}.nspstory-cell path{fill:none;stroke:#abbac0;stroke-width:2}
.nspstory-green ellipse{fill:#b6edc8;stroke:var(--ns-green);stroke-width:2.5}.nspstory-green circle{fill:#70c994}.nspstory-green path{stroke:#44a974}
.nspstory[data-scene="reporter"] .nspstory-screen-frame .nspstory-particle{fill:#1d1a34;stroke:#b5a3ff}.nspstory[data-scene="reporter"] .nspstory-screen-frame .nspstory-cell ellipse{fill:#102833;stroke:#587482}.nspstory[data-scene="reporter"] .nspstory-screen-frame .nspstory-cell circle{fill:#294451}.nspstory[data-scene="reporter"] .nspstory-screen-frame .nspstory-cell path{stroke:#66818c}.nspstory[data-scene="reporter"] .nspstory-screen-frame .nspstory-green ellipse{fill:#10372c;stroke:#5ce7a1}.nspstory[data-scene="reporter"] .nspstory-screen-frame .nspstory-green circle{fill:#2e9366}.nspstory[data-scene="reporter"] .nspstory-screen-frame .nspstory-green path{stroke:#62dca1}
.nspstory-celltext{font:600 18px 'IBM Plex Mono',monospace;fill:var(--ns-ink)}
.nspstory-faint{opacity:.3}.nspstory-culture{fill:#071d27;fill-opacity:.82;stroke:var(--ns-line);stroke-width:2}.nspstory-positive{stroke:#56e4ad}.nspstory-crowd-aura{fill:#36dca0;fill-opacity:.055;stroke:#68e5bd;stroke-opacity:.12;stroke-width:22}.nspstory-crowd-halo{fill:#0a292d;fill-opacity:.76;stroke:#58e1b0;stroke-opacity:.28;stroke-width:9}.nspstory-preview{opacity:.34}
.nspstory-token{stroke-width:1.7}.nspstory-token-0{fill:#a993ff;stroke:#d3c9ff}.nspstory-token-1{fill:#efb65d;stroke:#ffe0a5}.nspstory-token-2{fill:#66b9d8;stroke:#b9eaff}
.nspstory-stream{fill:none;stroke-width:1.5;stroke-opacity:.46}.nspstory-stream-0{stroke:#65e5b0}.nspstory-stream-1{stroke:#b2a0ff}.nspstory-stream-2{stroke:#f2bc69}.nspstory-streams-preview{opacity:.22}.nspstory-well-glow{fill:none;stroke:#8bb7ca;stroke-opacity:.13;stroke-width:10}.nspstory-well-glass{fill:#071824;fill-opacity:.76;stroke:#57717e;stroke-width:1.5}.nspstory-well-candidate .nspstory-well-glass{fill:#0b2925;stroke:#4ee0a0}.nspstory-well-mixed .nspstory-well-glass{fill:#17172e;stroke:#a28de4}.nspstory-well-empty .nspstory-well-glass{fill:#07131c;stroke:#40545d}.nspstory-welllabel{font:600 9.5px 'IBM Plex Mono',monospace;letter-spacing:.04em;fill:#c3d3da}.nspstory-wellmark{font:19px 'IBM Plex Sans',sans-serif;fill:#637985}.nspstory-candidate-focus .nspstory-well-glow{stroke:#62efad;stroke-opacity:.4;stroke-width:13}.nspstory-candidate-focus .nspstory-well-glass{stroke:#75f7ba;stroke-width:3}.nspstory-check{fill:none;stroke:#74f2b3;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.nspstory-candidate-note .nspstory-kicker{fill:#79efb7}
.nspstory-selection{fill:none;stroke:#e6ad50;stroke-width:2;stroke-dasharray:7 5}
.nspstory-origin-field{fill:#061823;fill-opacity:.7;stroke:#234654;stroke-width:1.5}.nspstory-origin-aura{stroke-width:18}.nspstory-origin-aura-source{fill:#9c83ec;fill-opacity:.035;stroke:#a993ff;stroke-opacity:.09}.nspstory-origin-aura-recipient{fill:#52dfa1;fill-opacity:.035;stroke:#55e49c;stroke-opacity:.09}.nspstory-rna{stroke:#416674;stroke-width:12;fill:none;stroke-linecap:round}.nspstory-source{stroke:var(--ns-violet);stroke-width:14;stroke-linecap:round;fill:none}.nspstory-source-pattern,.nspstory-fragment-pattern{stroke:#eee9ff;stroke-width:2;stroke-linecap:round}.nspstory-boundary-mark{stroke:#e6ad50;stroke-width:2;stroke-dasharray:4 4}.nspstory-insert{stroke:var(--ns-green);stroke-width:13;fill:none;stroke-linecap:round}.nspstory-insert-pattern{stroke:#d7ffeb;stroke-width:2;stroke-linecap:round}
.nspstory-match{stroke:#e6ad50;stroke-width:2.5;stroke-dasharray:7 7;fill:none}.nspstory-proposed rect{fill:#332614;stroke:#e2a944}.nspstory-proposed text{fill:#ffd58b}
.nspstory-fragment-line{stroke:var(--ns-violet);stroke-width:10;stroke-linecap:round}.nspstory-fragment-pattern{stroke:#eee6ff;stroke-width:2;stroke-linecap:round}
.nspstory-gridline{stroke:#dfe5e9;stroke-width:1}.nspstory-row-focus{fill:#e7f2ec;fill-opacity:.65}.nspstory-wt{fill:#248a6a}.nspstory-inactive{fill:#9775b9}.nspstory-emphasis{fill:none;stroke:var(--ns-ink);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.nspstory-ambient{pointer-events:none;opacity:.16;--nsp-ambient-primary:14s;--nsp-ambient-secondary:18s}.nspstory-ambient-medium{opacity:.3}.nspstory-ambient-lively{opacity:.48}.nspstory-ambient-normal{--nsp-ambient-primary:10s;--nsp-ambient-secondary:13s}.nspstory-ambient-fast{--nsp-ambient-primary:6.5s;--nsp-ambient-secondary:8.5s}.nspstory-ambient-line,.nspstory-ambient-ring{fill:none;stroke:#66d6ad;stroke-width:1.4;stroke-linecap:round}.nspstory-ambient-ring{stroke:#718bb8;stroke-dasharray:3 9}.nspstory-ambient-dot{fill:#71e4b4}
.nspstory-controls{position:absolute;z-index:3;right:12px;bottom:48px;display:flex;align-items:center;gap:7px;padding:6px 7px;border:1px solid #5d839866;border-radius:13px;background:#030a12f2;color:#bad0d9;box-shadow:0 8px 28px #0008}.nspstory-choice{display:flex;align-items:center;gap:2px}.nspstory-choice>span{margin:0 3px 0 0;font:600 9px/1 'IBM Plex Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:#7895a4}.nspstory-choice button{appearance:none;border:1px solid transparent;border-radius:7px;padding:6px 4px;background:transparent;color:#b4c9d2;font:600 10px/1 'IBM Plex Mono',monospace;cursor:pointer}.nspstory-choice button:hover{border-color:#527182;color:#eefbff}.nspstory-choice button[aria-pressed="true"]{border-color:#61d9ae78;background:#173c38;color:#9bffda}.nspstory-choice button:disabled{cursor:default;opacity:.42}.nspstory-playback{padding-left:7px;border-left:1px solid #35515f}.nspstory-disclosure{position:absolute;z-index:4;left:12px;bottom:49px;width:165px;color:#a9c0ca;font:11px/1.4 'IBM Plex Sans',sans-serif}.nspstory-disclosure summary{display:inline-flex;align-items:center;min-height:31px;padding:0 10px;border:1px solid #50718466;border-radius:10px;background:#040c14f5;color:#d2e1e6;font:600 10px/1 'IBM Plex Mono',monospace;letter-spacing:.03em;cursor:pointer;list-style:none}.nspstory-disclosure summary::-webkit-details-marker{display:none}.nspstory-disclosure[open]>div{position:absolute;left:0;bottom:38px;width:265px;display:grid;gap:7px;padding:12px;border:1px solid #52728480;border-radius:12px;background:#04101bf8;box-shadow:0 14px 38px #000b}.nspstory-disclosure strong{color:#f0f8fb;font:600 15px/1.2 Georgia,'Times New Roman',serif}.nspstory-disclosure span{display:block}.nspstory-disclosure b{color:#70e6b1}
.nspstory-motion .nspstory-screen-frame .nspstory-arrive{animation:nspArrive .75s cubic-bezier(.22,.7,.2,1) both}
.nspstory-motion .nspstory-screen-frame .nspstory-switch{animation:nspSwitch .6s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-descendant{animation:nspDescendant .8s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-descendant.nspstory-later{animation-delay:.14s}
.nspstory-motion .nspstory-screen-frame .nspstory-disperse{animation:nspDisperse .72s cubic-bezier(.2,.7,.2,1) both}.nspstory-motion .nspstory-screen-frame .nspstory-spread-1{animation-delay:.03s}.nspstory-motion .nspstory-screen-frame .nspstory-spread-2{animation-delay:.06s}.nspstory-motion .nspstory-screen-frame .nspstory-spread-3{animation-delay:.09s}.nspstory-motion .nspstory-screen-frame .nspstory-spread-4{animation-delay:.12s}.nspstory-motion .nspstory-screen-frame .nspstory-spread-5{animation-delay:.15s}.nspstory-motion .nspstory-screen-frame .nspstory-spread-6{animation-delay:.18s}.nspstory-motion .nspstory-screen-frame .nspstory-spread-7{animation-delay:.21s}.nspstory-motion .nspstory-screen-frame .nspstory-spread-8{animation-delay:.24s}
.nspstory-motion .nspstory-screen-frame .nspstory-stream-draw{animation:nspStream .82s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-stream-delay-1,.nspstory-motion .nspstory-screen-frame .nspstory-stream-delay-4,.nspstory-motion .nspstory-screen-frame .nspstory-stream-delay-7{animation-delay:.08s}.nspstory-motion .nspstory-screen-frame .nspstory-stream-delay-2,.nspstory-motion .nspstory-screen-frame .nspstory-stream-delay-5,.nspstory-motion .nspstory-screen-frame .nspstory-stream-delay-8{animation-delay:.16s}
.nspstory-motion .nspstory-screen-frame .nspstory-reveal,.nspstory-motion .nspstory-screen-frame .nspstory-boundary{animation:nspReveal .4s ease both}
.nspstory-motion .nspstory-screen-frame .nspstory-proposal-beat{animation:nspProposal .3s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-fragment{animation:nspFragment 1.4s cubic-bezier(.25,.55,.35,1) .3s both}
.nspstory-motion .nspstory-screen-frame .nspstory-row-focus{animation:nspRowFocus .18s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-emphasis{animation:nspEmphasis .5s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-contrast{animation:nspReveal .2s ease .5s both}
.nspstory-screen-frame .nspstory-ambient-primary{animation:nspAmbientDrift var(--nsp-ambient-primary) ease-in-out infinite alternate}.nspstory-screen-frame .nspstory-ambient-secondary{animation:nspAmbientDrift var(--nsp-ambient-secondary) ease-in-out -3s infinite alternate}
@keyframes nspArrive{from{transform:translateX(-104px)}to{transform:translateX(0)}}
@keyframes nspSwitch{from{opacity:.35}to{opacity:1}}
@keyframes nspDescendant{from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:translateX(0)}}
@keyframes nspDisperse{from{transform:translate(var(--nsp-dx),var(--nsp-dy));opacity:.2}to{transform:translate(0,0);opacity:1}}
@keyframes nspStream{from{stroke-dasharray:0 500;stroke-opacity:.1}to{stroke-dasharray:500 0;stroke-opacity:.72}}
@keyframes nspReveal{from{opacity:0}to{opacity:1}}
@keyframes nspProposal{from{opacity:0}to{opacity:1}}
@keyframes nspFragment{from{transform:translateX(-462px)}to{transform:translateX(0)}}
@keyframes nspRowFocus{from{opacity:0}to{opacity:1}}
@keyframes nspEmphasis{from{stroke-dasharray:0 600}to{stroke-dasharray:600 0}}
@keyframes nspAmbientDrift{from{transform:translate(-3px,2px);opacity:.45}to{transform:translate(4px,-3px);opacity:1}}
@media(prefers-reduced-motion:reduce){.nspstory *{animation:none!important;transition:none!important}.nspstory-playback{opacity:.58}}
@media print{#section-analysis-ladder .pwidget[data-dv-panel="0"] .swtable tr{background:#fff!important;box-shadow:none!important;border-color:#777!important}}
@media print{.docview:has(#section-green-reporter) .pwidget{--dink:#111;--dtext:#333;--dfaint:#555;background:#fff!important;color:#111!important;border-color:#777!important;box-shadow:none!important}.docview:has(#section-green-reporter) .pwidget>.ptitle,.docview:has(#section-green-reporter) .swtable td,.docview:has(#section-green-reporter) .swtable th{background:#fff!important;color:#111!important;border-color:#777!important;box-shadow:none!important}.nspstory-dock{display:none!important}}
@media print{.pt-nspstory:has(.nspstory){background:#fff!important;border-color:#bbb!important;box-shadow:none!important}.pt-nspstory:has(.nspstory)>.ptitle{background:#fff!important;color:#222!important}}
@media print{.nspstory,.nspstory[data-scene]{break-inside:avoid;--ns-ink:#111;--ns-muted:#444;--ns-line:#777;--ns-paper:#fff;--ns-zone:#f2f2f2;--ns-green:#444;--ns-violet:#777}.nspstory *{animation:none!important;transition:none!important;filter:none!important}.nspstory-screen-frame,.nspstory-caption,.nspstory-controls,.nspstory-disclosure{display:none!important}.nspstory-print-frame{display:block!important;background:#fff;print-color-adjust:exact}.nspstory-print-frame .nspstory-wt{fill:#222}.nspstory-print-frame .nspstory-inactive{fill:#999}.nspstory-print-frame .nspstory-row-focus{fill:#e5e5e5}.nspstory-print-frame .nspstory-culture{fill:#eee;stroke:#444}.nspstory-print-frame .nspstory-crowd-aura{fill:none;stroke:#bbb}.nspstory-print-frame .nspstory-crowd-halo{fill:#f6f6f6;stroke:#aaa}.nspstory-print-frame .nspstory-token{fill:#777;stroke:#222}.nspstory-print-frame .nspstory-stream{stroke:#888}.nspstory-print-frame .nspstory-well-glow{fill:none;stroke:#bbb}.nspstory-print-frame .nspstory-well-glass{fill:#fff;stroke:#555}.nspstory-print-frame .nspstory-welllabel,.nspstory-print-frame .nspstory-wellmark{fill:#222}.nspstory-print-frame .nspstory-check{stroke:#222}.nspstory-print-frame .nspstory-origin-field{fill:#fff;stroke:#777}.nspstory-print-frame .nspstory-origin-aura{fill:none;stroke:#ddd}.nspstory-print-frame .nspstory-rna{stroke:#aaa}.nspstory-print-frame .nspstory-source{stroke:#555}.nspstory-print-frame .nspstory-source-pattern,.nspstory-print-frame .nspstory-fragment-pattern,.nspstory-print-frame .nspstory-insert-pattern{stroke:#fff}.nspstory-print-frame .nspstory-insert,.nspstory-print-frame .nspstory-fragment-line{stroke:#222}.nspstory-print-frame .nspstory-match,.nspstory-print-frame .nspstory-boundary-mark{stroke:#555}.nspstory-print-frame .nspstory-proposed rect{fill:#eee;stroke:#555}.nspstory-print-frame .nspstory-proposed text{fill:#222}.nspstory-print-frame .nspstory-editorial{fill:#111}}
`
});
