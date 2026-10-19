/* Purpose-built, sequence-free lessons for the Bianco et al. NSP15 preprint.
   Motion interpolates authored explanations, never molecular dynamics. All
   final geometry exists without animation, including reduced-motion/print. */
var NSPSTORY_SCENES = ['reporter', 'dilution', 'origin', 'evidence'];
var NSPSTORY_FIELDS = ['phase', 'caption'];
var NSPSTORY_AMBIENT_INTENSITIES = ['quiet', 'medium', 'lively'];
var NSPSTORY_AMBIENT_TEMPOS = ['slow', 'normal', 'fast'];
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
  var h = '', phase = m.phase, crowdX = 122, crowdY = 214;
  h += '<g class="nspstory-crowd"><circle class="nspstory-crowd-halo" cx="' + crowdX + '" cy="' + crowdY + '" r="92"/><circle class="nspstory-culture nspstory-positive" cx="' + crowdX + '" cy="' + crowdY + '" r="72"/>';
  [[88,176,0],[115,169,1],[143,177,2],[166,196,0],[84,211,1],[115,205,2],[143,216,0],[166,231,1],[91,241,2],[119,244,0],[146,253,1],[105,276,2],[132,272,0],[69,229,0],[154,158,1],[73,191,2]].forEach(function (p) { h += nspstoryToken(p[0],p[1],p[2],'',0,0,6); });
  h += '</g>' + nspstoryText(crowdX, 319, 'MIXED CROWD', 'kicker', 'middle') + nspstoryText(crowdX, 339, 'shapes = symbolic lineages', 'small', 'middle');
  h += '<g class="nspstory-fan ' + (phase === 0 ? 'nspstory-faint' : '') + '"><path d="M212,182C268,154 294,132 329,124"/><path d="M218,214H329"/><path d="M212,246C268,274 294,296 329,304"/></g>';
  h += nspstoryText(514, 91, 'ILLUSTRATIVE OUTCOMES · NOT COUNTS', 'kicker', 'middle');
  var wells=[
    {x:366,y:132,state:'candidate',shape:[0]},{x:486,y:132,state:'empty',shape:[]},{x:606,y:132,state:'mixed',shape:[1,2]},
    {x:366,y:218,state:'mixed',shape:[0,1]},{x:486,y:218,state:'candidate',shape:[2]},{x:606,y:218,state:'empty',shape:[]},
    {x:366,y:304,state:'empty',shape:[]},{x:486,y:304,state:'mixed',shape:[2,0]},{x:606,y:304,state:'candidate',shape:[1]}
  ];
  h += '<g class="nspstory-well-field ' + (phase === 0 ? 'nspstory-preview' : '') + '">';
  wells.forEach(function (well,i) {
    var focus=(phase === 2 || m.print) && i === 4;
    h += '<g class="nspstory-well nspstory-well-' + well.state + (focus ? ' nspstory-candidate-focus' : '') + '" data-well="' + (i + 1) + '" data-state="' + well.state + '"><circle cx="' + well.x + '" cy="' + well.y + '" r="34"/>';
    if (!well.shape.length) h += nspstoryText(well.x,well.y-3,'—','wellmark','middle');
    well.shape.forEach(function (shape,j) {
      var x=well.x+(well.shape.length === 2 ? (j ? 10 : -10) : 0), y=well.y-7;
      var cls=phase === 1 && !m.print ? 'nspstory-disperse nspstory-spread-' + (i + j) : '';
      h += nspstoryToken(x,y,shape,cls,crowdX-x,crowdY-y,6);
    });
    h += nspstoryText(well.x,well.y+23,well.state,'welllabel','middle') + '</g>';
  });
  h += '</g>';
  if (phase === 2 || m.print) h += '<g class="nspstory-candidate-note ' + (phase === 2 && !m.print ? 'nspstory-reveal' : '') + '"><path class="nspstory-check" d="M455,217l12,12 22,-29"/>' + nspstoryText(656, 312, 'FOLLOW + SEQUENCE-CHECK', 'kicker', 'end') + '</g>';
  if (phase === 3 || m.print) h += '<rect class="nspstory-selection ' + (phase === 3 && !m.print ? 'nspstory-boundary' : '') + '" x="322" y="96" width="326" height="250" rx="22"/>';
  h += '<rect class="nspstory-band" x="20" y="354" width="720" height="38" rx="11"/>';
  h += nspstoryText(38, 379, m.print ? 'Candidate, not proof. Outcomes are illustrative; sequence-check the recovered lineage.' : phase === 3 ? 'Selection caveat · this screen misses changes that do not restore GFP.' : phase === 2 ? 'Single-looking is a candidate, not proof · follow + sequence-check.' : phase === 1 ? 'One dispersion · illustrative outcomes, not probabilities or a protocol.' : 'A green culture may contain several lineages. First, see the crowd.', 'small');
  return h;
}
function nspstoryOrigin(m) {
  var phase = m.phase, h = '';
  h += '<rect class="nspstory-origin-field" x="20" y="83" width="720" height="239" rx="25"/>';
  h += '<g class="nspstory-proposed ' + (phase === 3 && !m.print ? 'nspstory-proposal-beat' : '') + '"><rect x="526" y="16" width="207" height="29" rx="9"/>' + nspstoryText(542, 36, 'PROPOSED / NOT OBSERVED', 'kicker') + '</g>';
  h += nspstoryText(54, 119, 'MATCHING SOURCE', 'kicker') + nspstoryText(54, 143, 'solid mark = sequence match', 'small');
  h += nspstoryText(526, 119, 'RECIPIENT / INSERTION', 'kicker') + nspstoryText(526, 143, 'solid mark = unexpected patch', 'small');
  h += '<path class="nspstory-rna" d="M48,248C173,231 273,264 383,247S602,229 716,249"/>';
  h += '<path class="nspstory-source" d="M102,241C126,238 157,239 187,243"/><path class="nspstory-source-pattern" d="M119,230v20M144,229v20M169,232v20"/>';
  h += '<path class="nspstory-boundary-mark" d="M197,218v50"/>';
  h += '<path class="nspstory-insert" d="M582,244q29,-7 62,0"/><path class="nspstory-insert-pattern" d="M596,231v22M613,229v22M630,231v22"/>';
  h += '<path class="nspstory-match" d="M151,222C260,151 481,151 613,222"/>';
  h += nspstoryText(54, 299, 'inferred boundary / unexpected patch', 'small') + nspstoryText(706, 299, 'dashed = inferred source link', 'small', 'end');
  if (phase === 3 || m.print) h += '<g transform="translate(613,244)"><g class="nspstory-fragment"><path class="nspstory-fragment-line" d="M-28,0h56"/><path class="nspstory-fragment-pattern" d="M-17,-7v14M0,-7v14M17,-7v14"/></g></g>';
  h += '<rect class="nspstory-band" x="20" y="341" width="720" height="51" rx="12"/>';
  h += nspstoryText(38, 372, m.print ? 'Observed match + insertion; proposed transit; incorporation unresolved. Abstract and not to scale.' : phase === 0 ? 'Nearby match = tandem · separated matching source = distal.' : phase === 1 ? 'Published median source–recipient distance: ~10 kb · abstract, not to scale.' : phase === 2 ? '12,063 / 13,816 WT inserts ≥11 nt map to virus (87%) · origin inferred.' : 'One proposed transit · incorporation unresolved; no unique cleavage mechanism is shown.', 'small');
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
  return '<div class="nspstory' + (animate ? ' nspstory-motion' : '') + '" data-scene="' + m.scene + '" data-phase="' + m.phase + '" data-ambient="' + (m.ambient?'on':'off') + '" data-ambient-intensity="' + m.ambientIntensity + '" data-ambient-tempo="' + m.ambientTempo + '">' +
    '<svg class="nspstory-frame nspstory-screen-frame" viewBox="0 0 760 410" role="img" aria-label="' + esc(m.aria) + '"><title>' + esc(m.aria) + '</title><g aria-hidden="true">' +
    nspstoryText(24,28,m.scene==='evidence'?'EVIDENCE / PUBLISHED FIXED VALUES':'ILLUSTRATIVE / CONCEPTUAL · NO MOLECULAR TIMESCALE','kicker') +
    nspstoryText(24,61,m.heading,'heading') + nspstoryAmbient(m) + draw[m.scene](m) + '</g></svg>' + nspstoryPrintFrame(m) +
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
  render:function(host,panel,state,skin,states,step,animate) { return {html:nspstoryHTML(panel,state,animate)}; },
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
.nspstory{--ns-ink:#20354a;--ns-muted:#596b7a;--ns-line:#ccd9df;--ns-paper:#fffefa;--ns-zone:#f2f6f5;--ns-green:#19865b;--ns-violet:#7163a8;color:var(--ns-ink);min-width:0;min-height:0;flex:1;display:flex;flex-direction:column}
.nspstory[data-scene="reporter"],.nspstory[data-scene="dilution"],.nspstory[data-scene="origin"]{--ns-ink:#eefbff;--ns-muted:#a7bdc8;--ns-line:#2b4653;--ns-paper:#06131c;--ns-zone:#0b202a;--ns-green:#55e49c;--ns-violet:#a993ff}
.nspstory-frame{display:block;width:100%;min-height:0;flex:1 1 auto;background:var(--ns-paper);border:1px solid var(--ns-line);border-radius:15px;box-sizing:border-box;overflow:hidden}
.nspstory-print-frame{display:none}
.nspstory-caption{font:13px/1.45 'IBM Plex Sans',sans-serif;margin:9px 2px 0;color:var(--dtext);overflow-wrap:anywhere;flex:none}
.nspstory-heading{font:600 25px 'IBM Plex Sans',sans-serif;fill:var(--ns-ink);letter-spacing:-.02em}
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
.nspstory-faint{opacity:.3}.nspstory-culture{fill:#0c2430;stroke:var(--ns-line);stroke-width:2}.nspstory-positive{fill:#102d28;stroke:var(--ns-green)}.nspstory-crowd-halo{fill:none;stroke:#35b87c;stroke-opacity:.2;stroke-width:16}.nspstory-fan path{fill:none;stroke:#5d7b88;stroke-width:1.5;stroke-dasharray:4 7}.nspstory-preview{opacity:.28}
.nspstory-token{stroke-width:1.7}.nspstory-token-0{fill:#a993ff;stroke:#d3c9ff}.nspstory-token-1{fill:#efb65d;stroke:#ffe0a5}.nspstory-token-2{fill:#66b9d8;stroke:#b9eaff}
.nspstory-well>circle{fill:#0a1d27;stroke:#45616c;stroke-width:1.5}.nspstory-well-candidate>circle{fill:#0d2b25;stroke:#45c88b}.nspstory-well-mixed>circle{fill:#171d34;stroke:#9181cd}.nspstory-well-empty>circle{fill:#0b1921;stroke:#40545d}.nspstory-welllabel{font:600 10px 'IBM Plex Mono',monospace;letter-spacing:.04em;fill:#b9cad1}.nspstory-wellmark{font:20px 'IBM Plex Sans',sans-serif;fill:#61737b}.nspstory-candidate-focus>circle{stroke:#73f1b2;stroke-width:4}.nspstory-check{fill:none;stroke:#65e8a5;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.nspstory-candidate-note .nspstory-kicker{fill:#70e8ad}
.nspstory-selection{fill:none;stroke:#e6ad50;stroke-width:2;stroke-dasharray:7 5}
.nspstory-origin-field{fill:#071923;stroke:#274450;stroke-width:1.5}.nspstory-rna{stroke:#385965;stroke-width:12;fill:none;stroke-linecap:round}.nspstory-source{stroke:var(--ns-violet);stroke-width:14;stroke-linecap:round;fill:none}.nspstory-source-pattern,.nspstory-fragment-pattern{stroke:#eee9ff;stroke-width:2;stroke-linecap:round}.nspstory-boundary-mark{stroke:#e6ad50;stroke-width:2;stroke-dasharray:4 4}.nspstory-insert{stroke:var(--ns-green);stroke-width:13;fill:none;stroke-linecap:round}.nspstory-insert-pattern{stroke:#d7ffeb;stroke-width:2;stroke-linecap:round}
.nspstory-match{stroke:#e6ad50;stroke-width:2.5;stroke-dasharray:7 7;fill:none}.nspstory-proposed rect{fill:#332614;stroke:#e2a944}.nspstory-proposed text{fill:#ffd58b}
.nspstory-fragment-line{stroke:var(--ns-violet);stroke-width:10;stroke-linecap:round}.nspstory-fragment-pattern{stroke:#eee6ff;stroke-width:2;stroke-linecap:round}
.nspstory-gridline{stroke:#dfe5e9;stroke-width:1}.nspstory-row-focus{fill:#e7f2ec;fill-opacity:.65}.nspstory-wt{fill:#248a6a}.nspstory-inactive{fill:#9775b9}.nspstory-emphasis{fill:none;stroke:var(--ns-ink);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.nspstory-ambient{pointer-events:none;opacity:.16;--nsp-ambient-primary:14s;--nsp-ambient-secondary:18s}.nspstory-ambient-medium{opacity:.3}.nspstory-ambient-lively{opacity:.48}.nspstory-ambient-normal{--nsp-ambient-primary:10s;--nsp-ambient-secondary:13s}.nspstory-ambient-fast{--nsp-ambient-primary:6.5s;--nsp-ambient-secondary:8.5s}.nspstory-ambient-line,.nspstory-ambient-ring{fill:none;stroke:#66d6ad;stroke-width:1.4;stroke-linecap:round}.nspstory-ambient-ring{stroke:#718bb8;stroke-dasharray:3 9}.nspstory-ambient-dot{fill:#71e4b4}
.nspstory-motion .nspstory-screen-frame .nspstory-arrive{animation:nspArrive .75s cubic-bezier(.22,.7,.2,1) both}
.nspstory-motion .nspstory-screen-frame .nspstory-switch{animation:nspSwitch .6s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-descendant{animation:nspDescendant .8s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-descendant.nspstory-later{animation-delay:.14s}
.nspstory-motion .nspstory-screen-frame .nspstory-disperse{animation:nspDisperse .72s cubic-bezier(.2,.7,.2,1) both}.nspstory-motion .nspstory-screen-frame .nspstory-spread-1{animation-delay:.03s}.nspstory-motion .nspstory-screen-frame .nspstory-spread-2{animation-delay:.06s}.nspstory-motion .nspstory-screen-frame .nspstory-spread-3{animation-delay:.09s}.nspstory-motion .nspstory-screen-frame .nspstory-spread-4{animation-delay:.12s}.nspstory-motion .nspstory-screen-frame .nspstory-spread-5{animation-delay:.15s}.nspstory-motion .nspstory-screen-frame .nspstory-spread-6{animation-delay:.18s}.nspstory-motion .nspstory-screen-frame .nspstory-spread-7{animation-delay:.21s}.nspstory-motion .nspstory-screen-frame .nspstory-spread-8{animation-delay:.24s}
.nspstory-motion .nspstory-screen-frame .nspstory-reveal,.nspstory-motion .nspstory-screen-frame .nspstory-boundary{animation:nspReveal .4s ease both}
.nspstory-motion .nspstory-screen-frame .nspstory-proposal-beat{animation:nspProposal .3s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-fragment{animation:nspFragment 1.4s cubic-bezier(.25,.55,.35,1) .3s both}
.nspstory-motion .nspstory-screen-frame .nspstory-row-focus{animation:nspRowFocus .18s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-emphasis{animation:nspEmphasis .5s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-contrast{animation:nspReveal .2s ease .5s both}
.nspstory-screen-frame .nspstory-ambient-primary{animation:nspAmbientDrift var(--nsp-ambient-primary) ease-in-out infinite alternate}.nspstory-screen-frame .nspstory-ambient-secondary{animation:nspAmbientDrift var(--nsp-ambient-secondary) ease-in-out -3s infinite alternate}
@keyframes nspArrive{from{transform:translateX(-104px)}to{transform:translateX(0)}}
@keyframes nspSwitch{from{opacity:.35}to{opacity:1}}
@keyframes nspDescendant{from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:translateX(0)}}
@keyframes nspDisperse{from{transform:translate(var(--nsp-dx),var(--nsp-dy));opacity:.2}to{transform:translate(0,0);opacity:1}}
@keyframes nspReveal{from{opacity:0}to{opacity:1}}
@keyframes nspProposal{from{opacity:0}to{opacity:1}}
@keyframes nspFragment{from{transform:translateX(-462px)}to{transform:translateX(0)}}
@keyframes nspRowFocus{from{opacity:0}to{opacity:1}}
@keyframes nspEmphasis{from{stroke-dasharray:0 600}to{stroke-dasharray:600 0}}
@keyframes nspAmbientDrift{from{transform:translate(-3px,2px);opacity:.45}to{transform:translate(4px,-3px);opacity:1}}
@media(prefers-reduced-motion:reduce){.nspstory *{animation:none!important;transition:none!important}}
@media print{.nspstory,.nspstory[data-scene]{break-inside:avoid;--ns-ink:#111;--ns-muted:#444;--ns-line:#777;--ns-paper:#fff;--ns-zone:#f2f2f2;--ns-green:#444;--ns-violet:#777}.nspstory *{animation:none!important;transition:none!important;filter:none!important}.nspstory-screen-frame,.nspstory-caption{display:none!important}.nspstory-print-frame{display:block!important;background:#fff;print-color-adjust:exact}.nspstory-print-frame .nspstory-wt{fill:#222}.nspstory-print-frame .nspstory-inactive{fill:#999}.nspstory-print-frame .nspstory-row-focus{fill:#e5e5e5}.nspstory-print-frame .nspstory-culture{fill:#eee;stroke:#444}.nspstory-print-frame .nspstory-crowd-halo{stroke:#aaa}.nspstory-print-frame .nspstory-token{fill:#777;stroke:#222}.nspstory-print-frame .nspstory-well>circle{fill:#fff;stroke:#555}.nspstory-print-frame .nspstory-welllabel,.nspstory-print-frame .nspstory-wellmark{fill:#222}.nspstory-print-frame .nspstory-check{stroke:#222}.nspstory-print-frame .nspstory-origin-field{fill:#fff;stroke:#777}.nspstory-print-frame .nspstory-rna{stroke:#aaa}.nspstory-print-frame .nspstory-source{stroke:#555}.nspstory-print-frame .nspstory-source-pattern,.nspstory-print-frame .nspstory-fragment-pattern,.nspstory-print-frame .nspstory-insert-pattern{stroke:#fff}.nspstory-print-frame .nspstory-insert,.nspstory-print-frame .nspstory-fragment-line{stroke:#222}.nspstory-print-frame .nspstory-match,.nspstory-print-frame .nspstory-boundary-mark{stroke:#555}.nspstory-print-frame .nspstory-proposed rect{fill:#eee;stroke:#555}.nspstory-print-frame .nspstory-proposed text{fill:#222}}
`
});
