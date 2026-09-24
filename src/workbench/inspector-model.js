function builderPositionLine(raw, target){
  /* which slot the selected element occupies among its siblings — only
     the kinds with move buttons get one */
  if (!target) return null;
  if (target.kind === 'step'){
    var rec = specSectionPaths(raw)[target.section];
    if (!rec) return null;
    var d = specValueAt(raw, rec.diagram);
    if (!d || !Array.isArray(d.steps) || !d.steps[target.index]) return null;
    if (d.paths){
      var route = diagramPathList(d).find(function(p){return p.id === target.pathId && p.indices.indexOf(target.index) >= 0;}) ||
        diagramPathList(d).find(function(p){return p.indices.indexOf(target.index) >= 0;});
      if (route) return 'step ' + (route.indices.indexOf(target.index) + 1) + ' of ' + route.indices.length + ' · ' + route.label;
      return 'unused step · registry slot ' + (target.index + 1);
    }
    return 'step ' + (target.index + 1) + ' of ' + d.steps.length;
  }
  if(target.kind==='contract'){
    var cr=specSectionPaths(raw)[target.section],blocks=cr?sectionContracts(specValueAt(raw,cr.section)):[];
    var index=blocks.findIndex(function(c){return c.key===(target.card==null?'legacy':String(target.card));});
    return index<0?null:'block '+(index+1)+' of '+blocks.length;
  }
  if (target.kind === 'section'){
    var n = specSectionPaths(raw).length;
    if (typeof target.section !== 'number' || target.section < 0 || target.section >= n) return null;
    return 'section ' + (target.section + 1) + ' of ' + n;
  }
  if (target.kind === 'tab'){
    var page = raw && raw.page ? raw.page : raw;
    var key = page && page.blocks ? 'blocks' : 'sections';
    var block = page && Array.isArray(page[key]) ? page[key][target.block] : null;
    if (!block || !Array.isArray(block.tabs) || !block.tabs[target.tab]) return null;
    return 'tab ' + (target.tab + 1) + ' of ' + block.tabs.length;
  }
  return null;
}

/* Values always come from the engine's fold. Provenance describes authored
   assignments or operation inputs; it never implements a second reducer. */
function builderEffectivePanelStates(d, stepIndex, pathId){
  if(d && d.paths){
    var route=diagramPathList(d).find(function(p){return p.id===pathId && p.indices.indexOf(stepIndex)>=0;}) ||
      diagramPathList(d).find(function(p){return p.indices.indexOf(stepIndex)>=0;});
    if(!route) return {error:'This step is not part of a path.'};
    d=diagramForPath(d,route.id);stepIndex=route.indices.indexOf(stepIndex);
  }
  if (!d || !Array.isArray(d.steps) || !Number.isInteger(stepIndex) || stepIndex<0 || stepIndex>=d.steps.length)
    return {error:'Select an existing step to inspect its effective state.'};
  var panels=Array.isArray(d.panels)?d.panels:[], seen=new Set(), folded;
  if (panels.some(function(p){ if (!p || typeof p.id!=='string' || !p.id || seen.has(p.id)) return true; seen.add(p.id); return false; }))
    return {error:'Use unique non-empty string panel IDs; fix missing or duplicate IDs before inspecting effective state.'};
  try { folded=foldPanelStates(d); } catch(ex){ return {error:'Unable to fold panel state. Fix the diagram validation errors first.'}; }
  try {
    panels.forEach(function(p){ JSON.stringify((folded[p.id]||[])[stepIndex],function(key,value){
      if (typeof value==='number' && !Number.isFinite(value)) throw new Error('non-finite');
      return value;
    }); });
  } catch(ex){ return {error:'Effective state contains non-finite or unsupported values. Fix validation errors before inspecting its JSON.'}; }
  var own=function(o,k){ return o!=null && Object.prototype.hasOwnProperty.call(o,k); };
  return {panels:panels.map(function(p,pi){
    var snapshot=(folded[p.id]||[])[stepIndex]||{};
    function input(i,key,once){
      var patchKey=i==null?null:(d.steps[i].panels && typeof d.steps[i].panels==='object' && !Array.isArray(d.steps[i].panels)?'panels':'patch');
      var path=i==null?['panels',pi,'initial']:['steps',d._sourceIndices ? d._sourceIndices[i] : i,patchKey,p.id];
      if (once) path.push('enterOnce'); path.push(key);
      return {step:i,key:key,path:path,label:(i==null?'Initial':('Step '+(i+1)))+(once?' · enterOnce':'')+' · '+key};
    }
    function history(keys,includeInitial,label){
      var inputs=[];
      if (includeInitial) keys.forEach(function(key){ if (own(p.initial,key)) inputs.push(input(null,key,false)); });
      for (var i=0;i<=stepIndex;i++){
        var patch=(stepPanelPatch(d.steps[i])||{})[p.id];
        keys.forEach(function(key){ if (own(patch,key)) inputs.push(input(i,key,false)); });
      }
      return {kind:inputs.length?'history':'engine',label:inputs.length?label:'Engine default',inputs:inputs};
    }
    function assignment(key,accept,allowOnce,preserveInitial){
      var source=own(p.initial,key) && (preserveInitial||!accept||accept(p.initial[key]))?input(null,key,false):null;
      for(var i=0;i<=stepIndex;i++){
        var patch=(stepPanelPatch(d.steps[i])||{})[p.id];
        if (own(patch,key) && (!accept||accept(patch[key]))) source=input(i,key,false);
      }
      var current=(stepPanelPatch(d.steps[stepIndex])||{})[p.id];
      if (allowOnce && own(current && current.enterOnce,key))
        return {kind:'transient',label:'This step only · enterOnce',inputs:[input(stepIndex,key,true)]};
      return source?{kind:source.step==null?'initial':source.step===stepIndex?'step':'inherited',
        label:source.step==null?'Initial state':source.step===stepIndex?'Set at this step':'Inherited from step '+(source.step+1),inputs:[source]}:
        {kind:'engine',label:'Engine default',inputs:[]};
    }
    function origin(key){
      var authoring=panelAuthoring(p.type), current=(stepPanelPatch(d.steps[stepIndex])||{})[p.id];
      var custom=authoring.origin && authoring.origin(p,key,snapshot,{assignment:assignment,history:history,input:input,own:own,currentPatch:current,stepIndex:stepIndex});
      if(custom) return custom;
      if(key==='log')return history(['log'],true,'Accumulated log history');
      if(own(current && current.enterOnce,key))return assignment(key,null,true);
      if(key==='mark'||key==='cells')return history(['cells','mark'],true,'Computed cells/mark history');
      return assignment(key,null,true,true);
    }
    return {id:p.id,type:p.type,title:p.title||p.id,index:pi,state:snapshot,
      fields:Object.keys(snapshot).sort().map(function(key){ return {key:key,value:snapshot[key],origin:origin(key)}; })};
  })};
}

/* ---------------- per-element authoring guidance ---------------- */

var BUILDER_GUIDES = {
  group: {
    title: 'Group — a containment boundary',
    how: 'Select nodes and set their group to create a boundary. Select its boundary to edit or delete it.',
    fields: [
      ['key', 'rename the declaration and every member reference'],
      ['title', 'boundary label — empty falls back to the key'],
      ['icon', 'optional icon beside the boundary label — empty removes it'],
      ['members', 'remove individual nodes with ×; deleting the group keeps its nodes']
    ]
  },
  node: {
    title: 'Node — one service card',
    how: 'Edit the selected JSON, then click Render. A node renders only if its id appears in rows (or floats).',
    fields: [
      ['title', 'name on the card'],
      ['sub', 'one-line detail under the name'],
      ['icon', 'icon on the chip (see tokens below; default gear)'],
      ['tint', 'chip color (default cmd)'],
      ['group', 'containment-boundary id — members get a dashed box'],
      ['float', 'Free placement enables arbitrary dragging and Float X/Y; Auto above/below releases the pin; in rows restores row placement'],
      ['link', 'permalink URL — clickable ↗ on the card corner'],
      ['detail', 'inner flow: choose a section for a focused drilldown with an overview map; map parent beats or link an external destination in Domain detail']
    ],
    tokens: 'icons: terminal cloud shield gear db antenna thermo pump router package key server chip phone house camera doorbell lock bulb car · tints: cmd auth data mqtt dev'
  },
  edge: {
    title: 'Edge — one hop between nodes',
    how: 'Edit the selected JSON, then click Render. from/to are node ids; the arrow, packets, and legend all follow kind.',
    fields: [
      ['from, to', 'node ids the hop connects'],
      ['fromPort, toPort', 'Exit/Entry side and position (%) pin the arrow on each card; Auto restores routing'],
      ['kind', 'protocol: https | int | mqtt, or a key declared in page.protocols'],
      ['ret', 'true = response/ack, drawn as a fine dash'],
      ['label', 'short verb or topic on the arrow (POST /x, PUBLISH a/b/c)'],
      ['bend, labelDx, labelDy', 'manual geometry nudges for crowded corridors'],
      ['revealAt, hideAt', 'zero-based step indexes — draw the edge only inside that interval']
    ]
  },
  step: {
    title: 'Step — one numbered narrative beat',
    how: 'Edit the selected JSON, then click Render. The same steps array drives the ambient packet schedule, the numbered coins, and the click-through.',
    fields: [
      ['id', 'stable step identity used by paths and detail mappings; renaming updates those references'],
      ['edge', '"from->to" — the hop this step fires (or edges: [..] for hops that fire together)'],
      ['failures', 'edge outcomes: {"from->to":"dropped"}; use dropped for lost in transit or blocked for never sent'],
      ['text', 'caption shown in the step bar'],
      ['lane', 'lane pill on the caption line — declare colors in page.lanes'],
      ['nodes', 'node ids to light directly (allows an edgeless step)'],
      ['tone', 'node-color claims: {"gateway": "alert"} — alert warn ok dim; base (or null) clears; folds forward across steps'],
      ['panels', 'sparse widget patches: {"<panel id>": {..only what changed..}}'],
      ['link', 'permalink URL — source ↗ on the caption line']
    ]
  },
  panel: {
    title: 'Panel — one synchronized inspector widget',
    how: 'Edit the selected JSON, then click Render. Steps patch the panel by id; patches are sparse and folded, so jumping to any step is consistent.',
    fields: [
      ['id', 'the handle steps patch: "panels": {"<id>": {...}}'],
      ['type', 'widget kind: state leds gauge log screen queue inflight phone timeline … (full list in the authoring contract)'],
      ['title', 'card title above the widget'],
      ['initial', 'widget state before step 1']
    ]
  },
  bullet: {
    title: 'Bullet — one list point',
    how: 'Edit the text and Render. A bullet is a plain string, or an object when it needs nesting or step reveals.',
    fields: [
      ['text', 'the point itself (object form)'],
      ['sub', 'nested child bullets (object form)'],
      ['revealAt, hideAt', 'zero-based step indexes binding the bullet to the diagram click-through']
    ]
  },
  para: {
    title: 'Paragraph — section prose',
    how: 'Edit the text and Render. section.text is one string or a list of paragraph strings.',
    fields: [
      ['text', 'plain prose; `code` spans render in monospace']
    ]
  },
  contract: {
    title:'Contract block — size and content',
    how:'Choose half width for two blocks side by side, or full width to stack. Blocks fill in source order and stack automatically in narrow embeds. Click a field row to edit it.',
    fields:[['title','block heading'],['span','4 = third, 6 = half, 8 = two-thirds, 12 = full (default)'],['id','optional stable ID for links'],['source','source permalink'],['note','prose below the fields; supports code spans and fenced code'],['fields','k/v/g rows, each with optional step reveal timing']]
  },
  crow: {
    title: 'Contract field — one "on the wire" row',
    how: 'Edit the row and Render. Rows without a k key are skipped by the renderer.',
    fields: [
      ['k', 'field name (required)'],
      ['v', 'sample value'],
      ['g', 'gloss — what the field means'],
      ['hot', 'true highlights the row'],
      ['delta', 'added | removed | changed badge'],
      ['link', 'permalink URL — arrow beside the name'],
      ['revealAt, hideAt', 'zero-based step indexes binding the row to the diagram click-through']
    ]
  },
  tab: {
    title: 'Tab — one labeled group of sections',
    how: 'Clicking a tab shows it AND selects it here. Edit the label and Render; + tab adds a sibling after this one; the arrows reorder; delete removes the tab and every section inside it.',
    fields: [
      ['label', 'the tab button text — tab identity for deep links and re-renders'],
      ['highlight', 'true, an accent token, or "#RRGGBB" — emphasizes the tab button'],
      ['sections', 'the sections this tab shows']
    ]
  },
  section: {
    title: 'Section — one accent-colored box',
    how: 'Edit the selected JSON, then click Render. Everything inside is optional; a section is prose, optional contract blocks, and an optional diagram.',
    fields: [
      ['heading', 'section heading'],
      ['id', 'optional stable identity for links and node details; renaming updates local detail references'],
      ['detailOnly', 'hide this section until its detail is opened; it remains editable in the workbench'],
      ['accent', 'green blue violet amber pink cyan red slate, or "#RRGGBB"'],
      ['source', 'permalink URL — "source ↗" chip beside the heading'],
      ['text', 'paragraph or list of paragraphs above the diagram'],
      ['bullets', 'bullet list; entries may reveal/hide per step'],
      ['contract / contracts', 'legacy single card or an ordered array of sized contract blocks'],
      ['diagram', 'the board: nodes, rows, edges, panels, steps']
    ]
  }
};
