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
    dilution:[['One glowing culture can hide a mixture.', 'Several symbolic lineages occupy one culture. Green signal does not prove a single lineage.'],
      ['Fewer founders make lineages separable.', 'Illustrative cultures receive one, several or zero founders. Occupancy remains uncertain.'],
      ['Follow the trait, then read the change.', 'A separated positive lineage is followed and its reporter sequence checked.'],
      ['The green screen sees only a selected slice.', 'Reporter-restoring variants are selected. Other changes remain outside this screen.']],
    origin:[['Nearby copy or distant match?', 'Tandem means a neighboring duplication; distal means a matching source elsewhere.'],
      ['The matching source is far away.', 'A distant source and an insertion site are linked by a sequence match, not direct observation of transfer.'],
      ['Matching is evidence of origin.', '87 percent of WT inserts at least 11 nt map to the virus. A source match is inferred.'],
      ['Proposed: a fragment becomes an insertion.', 'Proposed fragment generation and insertion elsewhere. The incorporation mechanism is unresolved.']],
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
function nspstoryToken(x, y, shape, cls, fromX, fromY) {
  var glyph = shape === 0 ? '<circle r="10"/>' : shape === 1 ? '<rect x="-9" y="-9" width="18" height="18" rx="3"/>' : '<path d="M0,-11L11,9H-11Z"/>';
  return '<g transform="translate(' + x + ',' + y + ')"><g class="nspstory-token nspstory-token-' + shape + ' ' + (cls || '') + '" style="--nsp-dx:' + (fromX || 0) + 'px;--nsp-dy:' + (fromY || 0) + 'px">' + glyph + '</g></g>';
}
function nspstoryDilution(m) {
  var h = '', phase = m.phase;
  h += '<circle class="nspstory-culture nspstory-positive" cx="118" cy="199" r="70"/>';
  [[94,179,0],[127,174,1],[100,217,2],[140,210,0]].forEach(function (p) { h += nspstoryToken(p[0],p[1],p[2]); });
  h += nspstoryText(118, 299, 'Mixed + green-positive', 'label', 'middle');
  h += nspstoryText(118, 322, 'Shapes = lineages', 'small', 'middle');
  h += nspstoryArrow('M209,199H270m-10,-7 10,7 -10,7', phase === 0 ? 'nspstory-faint' : '');
  [[350,'One founder'],[501,'Still mixed'],[652,'No founder']].forEach(function (p,i) {
    h += '<circle class="nspstory-culture ' + (phase > 0 && i < 2 ? 'nspstory-positive' : '') + '" cx="' + p[0] + '" cy="199" r="57"/>';
    h += nspstoryText(p[0], 289, phase === 0 ? 'Possible culture' : p[1], 'label', 'middle');
    if (phase > 0 && i < 2) h += nspstoryToken(p[0],199,0,phase === 1 && !m.print ? 'nspstory-separate' : '',118-p[0],0);
    if (phase > 0 && i === 1) h += nspstoryToken(p[0]+24,218,1,phase === 1 && !m.print ? 'nspstory-separate nspstory-later' : '',118-p[0]-24,-19);
    if (phase > 0 && i === 2) h += nspstoryText(p[0], 205, '∅', 'empty', 'middle');
  });
  if (phase === 2 || m.print) h += '<g class="' + (phase === 2 && !m.print ? 'nspstory-reveal' : '') + '"><path class="nspstory-check" d="M326,208l17,17 32,-43"/>' + nspstoryText(350, 321, 'Follow + sequence-check', 'small', 'middle') + '</g>';
  if (phase === 3 || m.print) h += '<rect class="nspstory-selection ' + (phase === 3 && !m.print ? 'nspstory-boundary' : '') + '" x="284" y="132" width="133" height="137" rx="14"/>';
  h += nspstoryText(26, 365, m.print ? 'Outcomes are illustrative; dilution does not prove one founder. Sequence confirms the selected lineage.' : phase === 3 ? 'Selection boundary: this screen misses changes that do not restore GFP.' : phase === 0 ? 'Green signal says “a reporter-restoring variant is present,” not “all are the same.”' : 'Illustrative possibilities, not probabilities. Dilution never guarantees one founder.', 'small');
  return h;
}
function nspstoryOrigin(m) {
  var phase = m.phase, h = '', distal = phase > 0;
  h += nspstoryText(distal ? 28 : 342, 122, distal ? 'Matching source' : 'Neighboring source', 'label');
  h += nspstoryText(528, 122, 'Recipient / insertion', 'label');
  h += '<path class="nspstory-rna" d="M36,253H724"/>';
  h += '<path class="nspstory-source" d="M' + (distal ? '92' : '478') + ',253h62"/>';
  h += '<path class="nspstory-insert" d="M582,253v-24h62v24"/>';
  h += '<path class="nspstory-match" d="M' + (distal ? '123' : '509') + ',238Q' + (distal ? '365,4' : '558,126') + ' 613,222"/>';
  h += nspstoryText(distal ? 28 : 452, distal ? 154 : 173, distal ? 'Distal · separated' : 'Tandem · nearby', 'label');
  if (phase === 3) {
    h += '<g class="nspstory-proposed"><rect x="526" y="73" width="201" height="30" rx="8"/>' + nspstoryText(540, 93, 'PROPOSED / NOT OBSERVED', 'kicker') + '</g>';
    h += '<g transform="translate(613,229)"><g class="nspstory-fragment"><path class="nspstory-fragment-line" d="M-30,0h60"/><path class="nspstory-fragment-pattern" d="M-18,-6v12M0,-6v12M18,-6v12"/></g></g>';
  }
  h += nspstoryText(32, 292, 'Abstract RNA · no sequence or site coordinates', 'small');
  h += '<rect class="nspstory-band" x="20" y="324" width="720" height="53" rx="12"/>';
  h += nspstoryText(38, 356, phase === 0 ? 'A nearby duplication and a distant match describe different insertion classes.' : phase === 1 ? 'Published median donor–recipient distance: ~10 kb. This drawing is not to scale.' : phase === 2 ? '12,063 / 13,816 WT inserts ≥11 nt map to the virus (87%). Origin is inferred.' : 'The motion illustrates the authors’ model. How incorporation happens is unresolved.', 'small');
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
  if(scene==='origin')return '<g class="'+cls+'" aria-hidden="true"><path class="nspstory-ambient-line nspstory-ambient-primary" d="M184,193C292,177 430,195 548,177"/><path class="nspstory-ambient-line nspstory-ambient-secondary" d="M196,279C322,267 449,281 548,270"/></g>';
  if(scene==='dilution')return '<g class="'+cls+'" aria-hidden="true"><path class="nspstory-ambient-line nspstory-ambient-primary" d="M225,112C355,94 518,105 706,121"/><circle class="nspstory-ambient-dot nspstory-ambient-secondary" cx="244" cy="151" r="4"/><circle class="nspstory-ambient-dot nspstory-ambient-primary" cx="258" cy="244" r="3"/></g>';
  return '<g class="'+cls+'" aria-hidden="true"><circle class="nspstory-ambient-dot nspstory-ambient-primary" cx="457" cy="148" r="4"/><circle class="nspstory-ambient-dot nspstory-ambient-secondary" cx="711" cy="166" r="3"/><circle class="nspstory-ambient-dot nspstory-ambient-primary" cx="472" cy="290" r="3"/></g>';
}
function nspstoryPrintFrame(m) {
  var phases={reporter:3,dilution:3,origin:3,evidence:1};
  var headings={reporter:'Reporter lineage + sequence check',dilution:'Dilution outcomes + selection boundary',origin:'Source → recipient · proposed, unresolved',evidence:'Published HCoV-OC43 comparison'};
  var copy=Object.assign({},m,{phase:phases[m.scene],heading:headings[m.scene],print:true});
  var draw={reporter:nspstoryReporter,dilution:nspstoryDilution,origin:nspstoryOrigin,evidence:nspstoryEvidence};
  return '<svg class="nspstory-frame nspstory-print-frame" viewBox="0 0 760 410" role="img" aria-label="Print summary: ' + esc(headings[m.scene]) + '"><title>Print summary: ' + esc(headings[m.scene]) + '</title><g aria-hidden="true">' +
    nspstoryText(24,28,m.scene==='evidence'?'PUBLISHED COMPARISON / FIXED VALUES':'CONCEPTUAL SUMMARY / NOT TO SCALE','kicker') +
    nspstoryText(24,61,copy.heading,'heading') + draw[m.scene](copy) + '</g></svg>';
}
function nspstoryHTML(panel, state, animate) {
  var m = nspstoryModel(panel, state);
  var draw = {reporter:nspstoryReporter, dilution:nspstoryDilution, origin:nspstoryOrigin, evidence:nspstoryEvidence};
  return '<div class="nspstory' + (animate ? ' nspstory-motion' : '') + '" data-scene="' + m.scene + '" data-phase="' + m.phase + '" data-ambient="' + (m.ambient?'on':'off') + '" data-ambient-intensity="' + m.ambientIntensity + '" data-ambient-tempo="' + m.ambientTempo + '">' +
    '<svg class="nspstory-frame nspstory-screen-frame" viewBox="0 0 760 410" role="img" aria-label="' + esc(m.aria) + '"><title>' + esc(m.aria) + '</title><g aria-hidden="true">' +
    nspstoryText(24,28,m.scene==='evidence'?'PUBLISHED COMPARISON / ANIMATED READING':'CONCEPTUAL STORY / NO MOLECULAR TIMESCALE','kicker') +
    nspstoryText(24,61,m.heading,'heading') + draw[m.scene](m) + nspstoryAmbient(m) + '</g></svg>' + nspstoryPrintFrame(m) +
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
.nspstory-celltext{font:600 18px 'IBM Plex Mono',monospace;fill:var(--ns-ink)}
.nspstory-faint{opacity:.3}.nspstory-culture{fill:#f5f6f8;stroke:var(--ns-line);stroke-width:3}.nspstory-positive{fill:#e4f5e8;stroke:var(--ns-green)}
.nspstory-token{stroke-width:2}.nspstory-token-0{fill:#7364aa;stroke:#504274}.nspstory-token-1{fill:#e6b365;stroke:#a57739}.nspstory-token-2{fill:#83b1c9;stroke:#446f88}
.nspstory-empty{font:30px 'IBM Plex Sans',sans-serif;fill:#81919b}.nspstory-check{fill:none;stroke:#13734e;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
.nspstory-selection{fill:none;stroke:#b47829;stroke-width:2;stroke-dasharray:7 5}
.nspstory-rna{stroke:#8fa8b7;stroke-width:9;fill:none;stroke-linecap:round}.nspstory-source{stroke:var(--ns-violet);stroke-width:12;stroke-linecap:round;fill:none}.nspstory-insert{stroke:var(--ns-green);stroke-width:9;fill:none;stroke-linejoin:round}
.nspstory-match{stroke:#8c7ab8;stroke-width:2.5;stroke-dasharray:6 6;fill:none}.nspstory-proposed rect{fill:#fff1d9;stroke:#c99b51}.nspstory-proposed text{fill:#815716}
.nspstory-fragment-line{stroke:var(--ns-violet);stroke-width:10;stroke-linecap:round}.nspstory-fragment-pattern{stroke:#eee6ff;stroke-width:2;stroke-linecap:round}
.nspstory-gridline{stroke:#dfe5e9;stroke-width:1}.nspstory-row-focus{fill:#e7f2ec;fill-opacity:.65}.nspstory-wt{fill:#248a6a}.nspstory-inactive{fill:#9775b9}.nspstory-emphasis{fill:none;stroke:var(--ns-ink);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.nspstory-ambient{pointer-events:none;opacity:.18;--nsp-ambient-primary:12s;--nsp-ambient-secondary:16s}.nspstory-ambient-medium{opacity:.28}.nspstory-ambient-lively{opacity:.4}.nspstory-ambient-normal{--nsp-ambient-primary:9s;--nsp-ambient-secondary:12s}.nspstory-ambient-fast{--nsp-ambient-primary:6s;--nsp-ambient-secondary:8s}.nspstory-ambient-line{fill:none;stroke:#8eb9b0;stroke-width:1.5;stroke-linecap:round}.nspstory-ambient-dot{fill:#62b88e}
.nspstory-motion .nspstory-screen-frame .nspstory-arrive{animation:nspArrive .75s cubic-bezier(.22,.7,.2,1) both}
.nspstory-motion .nspstory-screen-frame .nspstory-switch{animation:nspSwitch .6s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-descendant{animation:nspDescendant .8s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-descendant.nspstory-later{animation-delay:.14s}
.nspstory-motion .nspstory-screen-frame .nspstory-separate{animation:nspSeparate .9s cubic-bezier(.2,.7,.2,1) both}.nspstory-motion .nspstory-screen-frame .nspstory-separate.nspstory-later{animation-delay:.12s}
.nspstory-motion .nspstory-screen-frame .nspstory-reveal,.nspstory-motion .nspstory-screen-frame .nspstory-boundary{animation:nspReveal .4s ease both}
.nspstory-motion .nspstory-screen-frame .nspstory-proposed{animation:nspProposal .3s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-fragment{animation:nspFragment 1.4s cubic-bezier(.25,.55,.35,1) .3s both}
.nspstory-motion .nspstory-screen-frame .nspstory-row-focus{animation:nspRowFocus .18s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-emphasis{animation:nspEmphasis .5s ease both}.nspstory-motion .nspstory-screen-frame .nspstory-contrast{animation:nspReveal .2s ease .5s both}
.nspstory-screen-frame .nspstory-ambient-primary{animation:nspAmbientDrift var(--nsp-ambient-primary) ease-in-out infinite alternate}.nspstory-screen-frame .nspstory-ambient-secondary{animation:nspAmbientDrift var(--nsp-ambient-secondary) ease-in-out -3s infinite alternate}
@keyframes nspArrive{from{transform:translateX(-104px)}to{transform:translateX(0)}}
@keyframes nspSwitch{from{opacity:.35}to{opacity:1}}
@keyframes nspDescendant{from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:translateX(0)}}
@keyframes nspSeparate{from{transform:translate(var(--nsp-dx),var(--nsp-dy));opacity:.4}to{transform:translate(0,0);opacity:1}}
@keyframes nspReveal{from{opacity:0}to{opacity:1}}
@keyframes nspProposal{from{opacity:0}to{opacity:1}}
@keyframes nspFragment{from{transform:translateX(-490px)}to{transform:translateX(0)}}
@keyframes nspRowFocus{from{opacity:0}to{opacity:1}}
@keyframes nspEmphasis{from{stroke-dasharray:0 600}to{stroke-dasharray:600 0}}
@keyframes nspAmbientDrift{from{transform:translate(-3px,2px);opacity:.45}to{transform:translate(4px,-3px);opacity:1}}
@media(prefers-reduced-motion:reduce){.nspstory *{animation:none!important;transition:none!important}}
@media print{.nspstory{break-inside:avoid;--ns-ink:#111;--ns-muted:#444;--ns-line:#777;--ns-paper:#fff;--ns-zone:#f2f2f2;--ns-green:#444;--ns-violet:#777}.nspstory *{animation:none!important;transition:none!important;filter:none!important}.nspstory-screen-frame,.nspstory-caption{display:none!important}.nspstory-print-frame{display:block!important;background:#fff;print-color-adjust:exact}.nspstory-print-frame .nspstory-wt{fill:#222}.nspstory-print-frame .nspstory-inactive{fill:#999}.nspstory-print-frame .nspstory-row-focus{fill:#e5e5e5}.nspstory-print-frame .nspstory-proposed rect{fill:#eee;stroke:#555}.nspstory-print-frame .nspstory-proposed text{fill:#222}}
`
});
