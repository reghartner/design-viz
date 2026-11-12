'use strict';
/* #1304 section contract blocks as grid tables (`columns` plus per-row `cells`), sharing the
   data-contract panel's column and cell code.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| R3 | Guard: the data-contract panel renders byte-identical HTML after its column/cell code moves to shared helpers. | three panels: full (bad widths, duplicate ids, non-object cells, highlights), empty, bare | sha256 of render HTML equals main 18c39baa | a refactor that changes panel output |
| R0 | Guard: a classic block (no `columns`) renders byte-identical HTML. | legacy + block with hot, link, delta, reveal, skipped rows | sha256 equals main 18c39baa | grid code leaking into classic blocks |
| V1 | Grid validation: duplicate column ids, more than 12 columns, column width under 40, undeclared cell key, non-scalar cell, a cell over 120 characters (soft), cells without columns, v/g beside columns and a non-text fieldLabel warn with their paths; a valid grid has no warnings. | grid blocks | warnings by path; valid grid warnings deepEqual [] | grids that fail silently or warn on valid input |
| R1 | A grid renders a real table named by the block title: caption, column headers (fieldLabel + labels), row headers (k, th scope=row with the classic .ctk class), a dash plus hidden "No value" text for a missing cell, widths, inside a keyboard-focusable scroll region. | grid with 3 columns, 3 rows | caption text; th scope=col list; th scope=row list; dash count; colgroup widths; table width; region role/label/tabindex | v/g columns for a grid; an unnamed table; page-wide overflow |
| R2 | Grid rows keep hot, delta badge, link, revealAt/hideAt and the row identity used by the Workbench. | grid rows with each flag | class, badge, link, data-dv-reveal-at/hide-at, data-dv-crow | grid rows that drop row behaviour |
| C1 | Compatibility reports content.contract-grids only when a block has columns. | grid page; classic page | feature lists | grids invisible to older-viewer checks |
| W1 | Planners: Add grid table; columns add/rename/reorder/remove (remove prunes cells and says how many); rows add/edit (numbers stay numbers only when they were); single cell edit; fieldLabel; classic → grid conversion (v → Value, g → Notes, only used columns) is lossless. | section with a classic block | resulting JSON; removal message; conversion result | lossy conversion; orphan cells; silent removal |
| W2 | Inspector: a classic block offers "Use columns (grid)" (one Undo step); a grid block shows First column name, Columns and Rows editors with no raw JSON box (their rows are projections) and no second "+ Add field"; a grid row shows one cell input per column; a cell edit is one Undo step. | section with a classic block | buttons/rows present; no .rawjson in either editor; exact text after Undo; cells written | no conversion path; a raw box that writes _sourceIndex/cell0 into the block; edits that take several Undo steps |
| S1 | Library search text includes grid column labels, fieldLabel and cell values. | grid section | contentSearchText includes them | grids invisible to library search |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {entrypoint}=require('../tools/source-loader.cjs');
const {inspectorEnvironment}=require('./helpers/inspector-dom.js');
const repo=path.join(__dirname,'..');
const C={console,URL};vm.runInNewContext(entrypoint('workbench').body,C);
const plain=v=>JSON.parse(JSON.stringify(v));
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
const doc=sec=>({page:{title:'Grid',sections:[sec]}});
const grid=()=>({id:'calls',title:'Calls per location load',span:12,fieldLabel:'Scenario',
  columns:[{id:'yoda',label:'Yoda',width:70},{id:'jyn',label:'Jyn'},{id:'han',label:'Han'}],
  fields:[{k:'SS3 location',cells:{yoda:2,jyn:7,han:'1'},hot:true},{k:'SS2 location',cells:{yoda:3}},{k:'Camera only',cells:{jyn:'4',han:0}}]});
const warningsOf=sec=>plain(C.validate(C.normalize(doc(sec))).warnings);

test('R3 the data-contract panel renders byte-identical HTML (guard for the shared column and cell code)',()=>{
  const dc=C.PanelRegistry.get('data-contract');
  const panels=[
    {id:'a',type:'data-contract',title:'Order <b>',fieldWidth:200,fieldLabel:'Name',columns:[{id:'type',label:'Type',width:110},{id:'req'},{id:'bad',width:10},{id:'type',label:'dup'}],
      fields:[{id:'f1',label:'order_id',cells:{type:'string',req:true,bad:{x:1}}},{id:'f2',cells:{type:null}},{id:'f3',label:'x',cells:'nope'},{id:'f1'}]},
    {id:'b',type:'data-contract',columns:[],fields:[]},
    {id:'c',type:'data-contract'}];
  const states=[{highlights:{f1:{color:'amber',label:'Key <i>'},f2:{color:'#123456'}},note:'hi'},{},undefined];
  const expected=['e1b8cc2de4363827b2e120636ad9fc87d73ba255c86492ec1caf74e4964080db','9a72f13f1da105a69e132b7402c4f72305f9b0ccb10e4fb78eb2a7b87f691b85','9a72f13f1da105a69e132b7402c4f72305f9b0ccb10e4fb78eb2a7b87f691b85'];
  panels.forEach((p,i)=>assert.equal(sha(dc.render({},p,states[i]).html),expected[i],'panel '+p.id));
});

test('R0 a classic contract block renders byte-identical HTML',()=>{
  const classic={contract:{title:'Legacy',fields:[{k:'a',v:'1',g:'`code` here'}]},contracts:[{id:'req',title:'Request',span:6,source:'https://x.test/s',note:'A *note*',
    fields:[{k:'event',v:'press',g:'Meaning',hot:true,link:'https://x.test/l'},{k:'old',v:'2',delta:'removed',revealAt:2},null,{v:'no k'},{k:'gone',g:'x',hideAt:3,delta:'added'}]}]};
  assert.equal(sha(C.contractBlocksHTML(classic,'wire')),'ccc569aef6dc3ce481bf3f9f33cab5a698b6c4f215b0c24088541f0727156d49');
});

test('V1 grid blocks validate columns, cells and their neighbours',()=>{
  assert.deepEqual(warningsOf({heading:'Calls',contracts:[grid()]}),[],'a valid grid has no warnings');
  const bad=grid();bad.fieldLabel=5;
  bad.columns.push({id:'yoda',label:'Again'},{id:'thin',width:12});
  for(let i=0;i<10;i++)bad.columns.push({id:'c'+i});
  bad.fields[0].cells.ghost=1;bad.fields[1].cells.jyn={n:1};bad.fields[2].v='old value';bad.fields[2].g='old meaning';
  const warnings=warningsOf({heading:'Calls',contracts:[bad]}),at='sections[0].contracts[0]';
  for(const [needle,why] of [[at+'.fieldLabel','fieldLabel text'],[at+'.columns[3].id','duplicate column id'],[at+'.columns[4].width','width under 40'],[at+'.columns:','more than 12 columns'],
    [at+'.fields[0].cells.ghost','undeclared cell key'],[at+'.fields[1].cells.jyn','non-scalar cell'],[at+'.fields[2].v','v beside columns'],[at+'.fields[2].g','g beside columns']])
    assert.ok(warnings.some(w=>w.startsWith(needle)),why+': '+warnings.join(' | '));
  const long=grid();long.fields[1].cells.jyn='x'.repeat(121);
  assert.ok(warningsOf({heading:'Calls',contracts:[long]}).some(w=>w.startsWith('sections[0].contracts[0].fields[1].cells.jyn: grid cells are for short values')),'a long cell warns softly');
  const orphan=warningsOf({heading:'Calls',contracts:[{title:'Classic',fields:[{k:'a',v:'1',cells:{x:1}}]}]});
  assert.ok(orphan.some(w=>w.startsWith('sections[0].contracts[0].fields[0].cells')),'cells without columns: '+orphan.join(' | '));
});

test('R1 a grid block renders a real table named by its title, with a dash for a missing cell, in a scroll region',()=>{
  const html=C.contractBlocksHTML({contracts:[grid()]},'s');
  assert.doesNotMatch(html,/class="ctv"|class="ctg"/,'no classic value/meaning columns (grid cells are ctv ctcell)');
  assert.match(html,/<caption[^>]*>Calls per location load<\/caption>/,'the table is named by the block title');
  const cols=[...html.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(m=>m[1]);
  assert.deepEqual(cols,['Scenario','Yoda','Jyn','Han']);
  const rows=[...html.matchAll(/<th scope="row" class="ctk"><span class="ctkey">([^<]*)<\/span>/g)].map(m=>m[1]);
  assert.deepEqual(rows,['SS3 location','SS2 location','Camera only']);
  assert.equal((html.match(/—/g)||[]).length,3,'three missing cells show a dash');
  assert.equal((html.match(/<span class="ctmissing" aria-hidden="true">—<\/span><span class="ctgrid-sr">No value<\/span>/g)||[]).length,3,'a missing cell is a hidden dash plus visually hidden "No value" text');
  assert.match(html,/<td[^>]*data-contract-cell="han"[^>]*>0<\/td>/,'zero is a value, not a missing cell');
  assert.match(html,/<col style="width:70px">/);
  assert.match(html,/class="ctgrid-scroll" tabindex="0" role="region" aria-label="Calls per location load"/,'a keyboard-focusable scroll region named by the title');
  assert.match(html,/<table class="cttable ctgrid" style="width:(\d+)px">/);
  const width=+html.match(/<table class="cttable ctgrid" style="width:(\d+)px">/)[1];
  assert.equal(width,180+70+160+160,'first column 180px, unset columns 160px');
});

test('R2 grid rows keep hot, delta, link, reveal and row identity',()=>{
  const g=grid();Object.assign(g.fields[1],{delta:'changed',link:'https://x.test/l',revealAt:2,hideAt:4});
  const html=C.contractBlocksHTML({contracts:[g]},'s');
  const row=i=>html.match(new RegExp('<tr[^>]*data-dv-crow="'+i+'"[^>]*>[\\s\\S]*?</tr>'))[0];
  for(const i of [0,1,2])assert.match(row(i),/<th scope="row" class="ctk">[\s\S]*<td class="ctv ctcell" data-contract-cell=/,'grid row '+i+' has a row header and cells');
  assert.match(row(0),/class="ctrow hot"/);
  assert.match(row(1),/class="ctrow delta-changed"/);assert.match(row(1),/class="ctdelta"[^>]*>changed</);
  assert.match(row(1),/class="ctlink" href="https:\/\/x.test\/l"/);
  assert.match(row(1),/data-dv-reveal-at="2"/);assert.match(row(1),/data-dv-hide-at="4"/);
});

test('S1 library search indexes grid column labels, the first column name and cell values',()=>{
  const text=C.FlowCanon.contentSearchText(doc({heading:'Calls',contracts:[grid()]}));
  for(const needle of ['Scenario','Yoda','Jyn','Han','SS3 location','7','1'])assert.ok(text.includes(needle),needle);
});

test('C1 compatibility reports content.contract-grids only for blocks with columns',()=>{
  assert.ok(C.FlowviewCompatibility.detect(doc({heading:'G',contracts:[grid()]})).includes('content.contract-grids'));
  assert.ok(!C.FlowviewCompatibility.detect(doc({heading:'C',contracts:[{title:'C',fields:[{k:'a',v:'1'}]}]})).includes('content.contract-grids'));
});

const classicSection=()=>({heading:'Calls',contracts:[{id:'req',title:'Request',fields:[{k:'event',v:'press',g:'Meaning',hot:true},{k:'id',v:'7'},{k:'note only',g:'Just a note'}]}]});
const block=raw=>raw.page.sections[0].contracts[0];
function apply(raw,plan){assert.equal(plan.error,undefined,plan.error);return JSON.parse(plan.text);}

test('W1 grid planners: add grid table, columns, rows, cells, first column name and lossless conversion',()=>{
  let raw=doc({heading:'Calls'}),text=JSON.stringify(raw,null,2);
  let next=apply(raw,C.planAddContract(text,raw,0,null,{grid:true}));
  const added=block(next);
  assert.ok(Array.isArray(added.columns) && added.columns.length>=2 && added.fields.every(f=>!('v' in f) && !('g' in f)),'Add grid table makes a grid block');
  assert.deepEqual(warningsOf(next.page.sections[0]),[],'the new grid table is valid');

  raw=doc({heading:'Calls',contracts:[grid()]});text=JSON.stringify(raw,null,2);
  const T={kind:'contract',section:0,card:'0'};
  // Columns: shared collect keeps ids on rename and mints ids for new columns.
  const items=[{_sourceIndex:1,label:'Jyn Erso'},{_sourceIndex:0,label:'Yoda',width:70},{label:'Leia'}];
  const collected=C.contractGridCollectColumns(grid().columns,items);
  assert.deepEqual(plain(collected.value),[{id:'jyn',label:'Jyn Erso'},{id:'yoda',label:'Yoda',width:70},{id:'leia',label:'Leia'}]);
  next=apply(raw,C.planContractGrid(text,raw,T,{op:'columns',columns:collected.value}));
  assert.deepEqual(block(next).columns.map(c=>c.id),['jyn','yoda','leia'],'reordered, renamed, added; han removed');
  assert.deepEqual(block(next).fields.map(f=>f.cells),[{yoda:2,jyn:7},{yoda:3},{jyn:'4'}],'removing Han pruned its cells');
  const removal=C.planContractGrid(text,raw,T,{op:'columns',columns:collected.value});
  assert.equal(removal.message,'Removes the Han column and 2 cells.','the author is told what the removal drops');
  // Rows: k plus cells; a number stays a number only when it was one.
  const rows=C.contractGridCollectRows(grid().fields,grid().columns,[{_sourceIndex:0,k:'SS3 location',cell0:'5',cell1:'8',cell2:'x'},{k:'New row',cell0:'9'}]);
  assert.deepEqual(plain(rows.value),[{k:'SS3 location',cells:{yoda:5,jyn:8,han:'x'},hot:true},{k:'New row',cells:{yoda:'9'}}]);
  next=apply(raw,C.planContractGrid(text,raw,T,{op:'rows',rows:rows.value}));
  assert.equal(block(next).fields.length,2);
  next=apply(raw,C.planContractGrid(text,raw,{kind:'crow',section:0,card:'0',index:1},{op:'cell',column:'jyn',value:'6'}));
  assert.deepEqual(block(next).fields[1].cells,{yoda:3,jyn:'6'});
  next=apply(raw,C.planContractGrid(text,raw,{kind:'crow',section:0,card:'0',index:0},{op:'cell',column:'yoda',value:null}));
  assert.deepEqual(block(next).fields[0].cells,{jyn:7,han:'1'},'clearing a cell removes it');
  next=apply(raw,C.planContractGrid(text,raw,T,{op:'fieldLabel',value:'Load'}));assert.equal(block(next).fieldLabel,'Load');

  raw=doc(classicSection());text=JSON.stringify(raw,null,2);
  next=apply(raw,C.planContractGrid(text,raw,T,{op:'convert'}));
  assert.deepEqual(plain(block(next)),{id:'req',title:'Request',columns:[{id:'value',label:'Value'},{id:'notes',label:'Notes'}],
    fields:[{k:'event',hot:true,cells:{value:'press',notes:'Meaning'}},{k:'id',cells:{value:'7'}},{k:'note only',cells:{notes:'Just a note'}}]},'v and g become cells; nothing is lost');
  assert.deepEqual(warningsOf(next.page.sections[0]),[]);
  const onlyV=doc({heading:'C',contracts:[{fields:[{k:'a',v:'1'}]}]});
  assert.deepEqual(plain(block(apply(onlyV,C.planContractGrid(JSON.stringify(onlyV),onlyV,T,{op:'convert'})))).columns,[{id:'value',label:'Value'}],'only the columns in use');
});

const names=['canon','validator','compatibility','workbench/source-edit','workbench/targets','workbench/commands/common','workbench/commands/topology','workbench/commands/telemetry',
  'workbench/commands/vocabulary','workbench/commands/visibility','workbench/commands/prose','workbench/commands/detail-mapping','workbench/commands/panel-duration','workbench/commands/panel-visibility','workbench/commands/graph','workbench/commands/document','workbench/commands/narrative','workbench/commands/layout','workbench/commands/contracts',
  'workbench/persistence','workbench/session','workbench/field-values','workbench/panel-collections','workbench/inspector-model','workbench/controls','workbench/lifetime','workbench/vocabulary','workbench/visibility','workbench/panel-visibility','workbench/detail-mapping','workbench/notifications','workbench/icon-picker','workbench/brand','workbench/metrics-editor','workbench/log-searches-editor','workbench/trace-connections-editor','workbench/inspector']
  .filter(name=>['canon','validator'].includes(name) || fs.existsSync(path.join(repo,'src',name+'.js')));

test('W2 the Inspector converts a classic block and edits grid columns, rows and cells in one Undo step each',()=>{
  const e=inspectorEnvironment(names),h=e.mount(doc(classicSection()));
  const T={kind:'contract',section:0,card:'0'};
  const select=t=>{h.session.target=t;h.inspector.render();};
  const button=label=>h.guide.querySelectorAll('button').find(b=>b.textContent===label);
  const rowControl=label=>{const row=h.guide.querySelectorAll('.frow').find(r=>r.querySelector('.flab')?.textContent===label);return row?row.children[1]:null;};
  select(T);const original=h.text;
  const convert=button('Use columns (grid)');assert.ok(convert,'a classic block offers the conversion');
  convert.fire('click');h.flush();
  assert.ok(Array.isArray(JSON.parse(h.text).page.sections[0].contracts[0].columns),'converted');
  assert.equal(h.session.undo(),true);assert.equal(h.text,original,'one Undo restores the classic block');assert.equal(h.session.canUndo(),false);
  assert.equal(h.session.redo(),true);select(T);
  assert.ok(rowControl('First column name'),'a grid block names its first column');
  assert.ok(h.guide.querySelector('[data-contract-editor="columns"]'),'Columns editor');
  assert.ok(h.guide.querySelector('[data-contract-editor="rows"]'),'Rows editor');
  assert.equal(button('Use columns (grid)'),undefined,'no conversion on a grid');
  assert.equal(button('+ Add field'),undefined,'a grid adds rows only through the Rows editor');assert.ok(button('+ Add row'));
  for(const key of ['columns','rows']){
    const editor=h.guide.querySelector('[data-contract-editor="'+key+'"]');
    assert.equal(editor.querySelector('.rawjson'),null,key+' has no raw JSON box: its rows are projections, not source');
  }
  select({kind:'crow',section:0,card:'0',index:1});
  assert.equal(rowControl('v'),null,'a grid row has no v field');
  const value=rowControl('Value');assert.ok(value,'one cell input per column');assert.ok(rowControl('Notes'));
  const before=h.text;value.value='8';value.fire('change');h.flush();
  assert.deepEqual(JSON.parse(h.text).page.sections[0].contracts[0].fields[1].cells,{value:'8'});
  assert.equal(h.session.undo(),true);assert.equal(h.text,before,'a cell edit is one Undo step');
});
