'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const A=require('../tools/compose-page-layout.cjs'),M=require('../tools/arrange/model.cjs'),S=require('../tools/arrange/solver.cjs');
const diagram=()=>({nodes:{a:{title:'A'}},rows:[[]],floats:[{id:'a',side:'below'}],edges:[],steps:[],panels:[]});
const defaults={width:1200,profile:'default',rearrange:false};
test('complete CLI selects explicitly and protects authored geometry and profile boundaries',()=>{
 assert.equal(A.parseArgs(['--section','2','--width','1000','--profile','confluence','in','out']).width,1000);
 assert.throws(()=>A.parseArgs(['--width','640','in','out']),/800 to 1920/);
 const d=diagram();A.preflight(d,defaults);d.rows=[['a']];assert.throws(()=>A.preflight(d,defaults),/already has geometry/);A.preflight(d,{...defaults,rearrange:true});
 d.layouts=[{id:'main'}];assert.throws(()=>A.preflight(d,{...defaults,rearrange:true}),/named views/);delete d.layouts;
 d.sectionLayout={backstage:[{x:0,y:0,w:12,h:8}]};assert.throws(()=>A.preflight(d,{...defaults,rearrange:true}),/legacy 12-column sibling/);
 d.sectionLayout.columns=24;A.preflight(d,{...defaults,rearrange:true});
 assert.throws(()=>A.select({page:{sections:[{diagram:d},{diagram:diagram()}]}},[]),/Multiple diagrams/);
});
test('adapter creates rectangles without author input and preserves hidden tile geometry',()=>{
 const d=diagram();d.panels=[{id:'steps',type:'battery'},{id:'diagram',type:'battery'}];const hidden={panel:'steps',hidden:true,x:19,y:20,w:5,h:4};
 const seeded=A.seed(d,[hidden]);assert.deepEqual(seeded.sectionLayout.default.find(t=>t.panel==='steps'),hidden);assert.equal(seeded.sectionLayout.columns,24);assert.equal(d.sectionLayout,undefined);
});
test('every graph-arranger-owned marker requires explicit rearrangement',async t=>{
 const fields={diagram:['routing','graphFrame','sectionLayout'],float:['x','y','dx','dy','noSpread'],edge:['bend','curvePoints','curveControls','fromPort','toPort','fromDx','fromDy','toDx','toDy','labelDx','labelDy','labelAt']};
 for(const [kind,keys] of Object.entries(fields))for(const key of keys)await t.test(kind+'.'+key,()=>{
  const d=diagram();d.edges=[{from:'a',to:'a'}];const target=kind==='diagram'?d:kind==='float'?d.floats[0]:d.edges[0];
  target[key]=key==='routing'?'curves':key==='graphFrame'?{x:0,y:0,w:100,h:100}:key==='sectionLayout'?{}:key==='noSpread'?false:key==='fromPort'||key==='toPort'?{side:'right'}:key==='curvePoints'||key==='curveControls'?[]:0;
  const before=JSON.stringify(d);assert.throws(()=>A.preflight(d,defaults),/already has geometry/);A.preflight(d,{...defaults,rearrange:true});assert.equal(JSON.stringify(d),before);
 });
 const d=diagram();d.edges=[{from:'a',to:'a',id:'request',label:'Read state',color:'blue',dashed:true,delta:true}];d.nodes.a.subtitle='Semantic detail';A.preflight(d,defaults);
});
test('composition solver handles panel IDs colliding with graph/controls, determinism and zero steps',()=>{
 const d=diagram();d.panels=[{id:'diagram',type:'battery'},{id:'steps',type:'battery'}];
 const source={diagram:A.seed(d,[])},options={registry:{get:()=>({layout:{sectionSizing:{minWidth:180,preferredWidth:210,maxWidth:300,aspectPolicy:'content',grow:1}}})},geometry:{gridWidth:1150,gridTop:100,scale:1,bounds:{x:0,y:0,w:180,h:80}}};
 const first=S.solve(source,options),second=S.solve(source,options);assert.deepEqual(first,second);M.check(first.spec);assert.equal(M.layout(first.spec).filter(t=>t.controls).length,0);assert.equal(M.layout(first.spec).filter(t=>t.panel).length,2);assert.deepEqual(first.spec.diagram.panels,d.panels);
});
test('failures are dependency-free and preserve source and existing destination',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arrange-atomic-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const input=path.join(dir,'in.json'),output=path.join(dir,'out.json');
 const d=diagram();d.rows=[['a']];fs.writeFileSync(input,JSON.stringify({page:{title:'Test',sections:[{diagram:d}]}}));fs.writeFileSync(output,'retained');const before=fs.readFileSync(input,'utf8');
 const result=spawnSync(process.execPath,[path.resolve(__dirname,'../tools/compose-page-layout.cjs'),input,output],{encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/already has geometry/);assert.equal(fs.readFileSync(output,'utf8'),'retained');assert.equal(fs.readFileSync(input,'utf8'),before);
 const same=spawnSync(process.execPath,[path.resolve(__dirname,'../tools/compose-page-layout.cjs'),input,input],{encoding:'utf8'});assert.notEqual(same.status,0);assert.match(same.stderr,/different|distinct/i);
 for(const marker of ['edge','float']){
  const routed=diagram();if(marker==='edge')routed.edges=[{from:'a',to:'a',fromPort:{side:'right'},curveControls:[{t:0,dx:0,dy:0},{t:1,dx:0,dy:0}]}];else routed.floats[0].dx=0;
  const bytes=JSON.stringify({page:{title:'Preserved',flowview:{authoredWith:'0.1.0',minVersion:'0.1.0',features:[]},sections:[{diagram:routed}]}});fs.writeFileSync(input,bytes);
  const rejected=spawnSync(process.execPath,[path.resolve(__dirname,'../tools/compose-page-layout.cjs'),input,output],{encoding:'utf8'});assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/already has geometry/);assert.equal(fs.readFileSync(input,'utf8'),bytes);assert.equal(fs.readFileSync(output,'utf8'),'retained');
 }
});
const E=require('../tools/arrange/estimate.cjs');
test('estimates account for wrapping, distinct content models and inherited path state',()=>{
 assert.ok(E.lines('wide narrative '.repeat(20),150)>E.lines('wide narrative '.repeat(20),600));
 const p={id:'s',type:'state',states:['ready','done'],title:'State'},small=E.panelSize(p,{state:'ready'},250),dense=E.panelSize({...p,states:Array.from({length:18},(_,i)=>'Detailed state '+i)},{state:'An unusually verbose operational state requiring attention'},250);assert.ok(dense.intrinsicHeight>small.intrinsicHeight*2);
 const table={id:'table',type:'table',columns:[{id:'a'},{id:'b'}]};const row={id:'a',cells:{a:'Long code block\nconst first = require("example");\nreturn importantData;',b:'context '.repeat(25)}};
 assert.ok(E.panelSize(table,{rows:[row]},300).intrinsicHeight>E.panelSize(table,{rows:[row]},800).intrinsicHeight);
 const d=diagram();d.panels=[{id:'log',type:'log',initial:{log:[{text:'Initial'}]}}];d.steps=[{id:'a',text:'Start',panels:{log:{log:[{text:'First'}]}}},{id:'b',text:'Continue',panels:{log:{log:[{text:'Second'}]}}},{id:'c',text:'Alternative',panels:{log:{log:[{text:'Other'}]}}}];d.paths=[{id:'normal',steps:['a','b']},{id:'other',steps:['a','c']}];
 const all=E.states(d);assert.equal(all.length,5);assert.deepEqual(all[2].panels.log.log.map(x=>x.text),['Initial','First','Second']);assert.deepEqual(all[4].panels.log.log.map(x=>x.text),['Initial','First','Other']);
 d.steps[1].text='Detailed instruction and evidence. '.repeat(50);const input=E.inputs({diagram:A.seed(d,[])},1000);assert.ok(input.stepDepth[12].neededHeight>input.stepDepth[24].neededHeight);assert.ok(input.stepDepth[24].maxLines>10);
});
test('complete composition is deterministic and preserves profile/state semantics',async()=>{
 const d=diagram();d.nodes.b={title:'B'};d.floats.push({id:'b',side:'below'});d.edges=[{from:'a',to:'b',label:'Request'}];d.panels=[{id:'state',type:'state',states:['ready','done'],initial:{state:'ready'}}];d.steps=[{id:'a',text:'Review the state.',panels:{state:{state:'done'}}}];d.sectionLayout={columns:24,backstage:[{x:0,y:0,w:24,h:10}]};
 const raw={page:{title:'Pure composition',flowview:{authoredWith:'0.1.0',minVersion:'0.1.0',features:['flow.failures']},sections:[{diagram:d},{heading:'Untouched',text:'Keep this exact.'}]}},options={...defaults,width:800,sections:[0],profile:'confluence',rearrange:true},before=JSON.stringify(raw);
 const a=await A.arrange(raw,options),b=await A.arrange(raw,options);assert.deepEqual(a,b);assert.equal(JSON.stringify(raw),before);const output=a.raw.page.sections[0].diagram;assert.deepEqual(output.steps,d.steps);assert.deepEqual(output.panels,d.panels);assert.deepEqual(output.sectionLayout.backstage,d.sectionLayout.backstage);assert.deepEqual(a.raw.page.sections[1],raw.page.sections[1]);assert.ok(a.raw.page.flowview.features.includes('flow.failures'));M.check({diagram:{...output,sectionLayout:{columns:24,default:output.sectionLayout.confluence}}});assert.match(a.diagnostics[0].measurement,/estimates/);
});
test('direct CLI works in a clean checkout and source-free kit with subprocesses, network and browser packages forbidden',t=>{
 const root=path.resolve(__dirname,'..'),base=fs.mkdtempSync(path.join(os.tmpdir(),'compose-portable-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const checkout=path.join(base,'checkout');fs.mkdirSync(checkout);fs.cpSync(path.join(root,'src'),path.join(checkout,'src'),{recursive:true});fs.mkdirSync(path.join(checkout,'tools/canon'),{recursive:true});
 for(const file of ['compose-page-layout.cjs','auto-arrange-spec.cjs','source-loader.cjs','canon/core.cjs'])fs.copyFileSync(path.join(root,'tools',file),path.join(checkout,'tools',file));fs.cpSync(path.join(root,'tools/arrange'),path.join(checkout,'tools/arrange'),{recursive:true});
 assert.equal(fs.existsSync(path.join(checkout,'tools/canon/generated-runtime.cjs')),false);
 const kit=path.join(base,'kit');fs.mkdirSync(kit);
 const built=spawnSync('python3',['-c',"import sys,json,base64,gzip,pathlib;sys.path.insert(0,'tools');from folder_agent_kit import folder_agent_kit;from build import canon_runtime;files=json.loads(gzip.decompress(base64.b64decode(json.loads(folder_agent_kit('.',canon_runtime()))['gzip'])))['files'];root=pathlib.Path(sys.argv[1]);[(root.joinpath(k).parent.mkdir(parents=True,exist_ok=True),root.joinpath(k).write_text(v)) for k,v in files.items()]",kit],{cwd:root,encoding:'utf8'});assert.equal(built.status,0,built.stderr);
 const guard=path.join(base,'guard.cjs');fs.writeFileSync(guard,"const M=require('node:module'),load=M._load;M._load=function(id,...args){if(/playwright|puppeteer|child_process/.test(id))throw Error('Forbidden runtime dependency '+id);return load.call(this,id,...args)};global.fetch=()=>{throw Error('Forbidden network')};");
 for(const directory of [checkout,kit]){
  assert.equal(fs.existsSync(path.join(directory,'tools/arrange/node_modules')),false);assert.equal(fs.existsSync(path.join(directory,'tools/arrange/setup.cjs')),false);assert.equal(fs.existsSync(path.join(directory,'tools/arrange/generated-native.html')),false);
  const raw=diagram();raw.panels=[{id:'charge',type:'battery',initial:{charge:80}},{id:'app',type:'deviceapp',fields:[{id:'reading',label:'Reading'}],initial:{phoneScreen:'app',reading:{value:'Recorded',status:'ready'}}}];raw.steps=[{id:'start',text:'Review the charge.',codeRefs:[{id:'evidence',label:'Processing evidence',repository:'https://example.com/processor',revision:'a'.repeat(40),path:'src/process.js',anchor:{start:'begin',end:'end'}}],conditions:[{kind:'slow',label:'Evidence pending'}]},{id:'normal',text:'Normal outcome.'},{id:'alternative',text:'Alternative outcome.'}];raw.paths=[{id:'normal',steps:['start','normal']},{id:'alternative',steps:['start','alternative']}];const input=path.join(directory,'in.json'),output=path.join(directory,'out.json'),bytes=JSON.stringify(raw);fs.writeFileSync(input,bytes);
  const result=spawnSync(process.execPath,['--require',guard,'tools/compose-page-layout.cjs','--width','800','in.json','out.json'],{cwd:directory,encoding:'utf8',env:{...process.env,PATH:'',PLAYWRIGHT_BROWSERS_PATH:path.join(base,'no-browser'),NODE_PATH:''}});assert.equal(result.status,0,result.stderr);assert.equal(fs.readFileSync(input,'utf8'),bytes);assert.equal(JSON.parse(fs.readFileSync(output)).page.sections[0].diagram.sectionLayout.columns,24);assert.match(result.stdout,/estimates/);const content=JSON.parse(result.stdout).diagrams[0].panels.find(p=>p.id==='app').estimatedNativeContent;assert.equal(content.estimatedLogicalWidth,330);assert.ok(content.estimatedRenderedWidth<330);assert.ok(content.estimatedFontPx.metadata<9);assert.deepEqual(JSON.parse(fs.readFileSync(output)).page.sections[0].diagram.panels,raw.panels);assert.ok(JSON.parse(result.stdout).diagrams[0].controls.estimatedTrackHeight>40,'source-free backend exports shared track geometry');
 }
 assert.equal(fs.existsSync(path.join(kit,'src/source-bundles.json')),false);assert.equal(fs.existsSync(path.join(checkout,'tools/canon/generated-runtime.cjs')),false);
});

test('type models reserve native structure and grow for detailed report content',()=>{
 const tiny=E.panelSize({id:'s',type:'state',states:['ready']},{state:'ready'},340);
 const title=E.panelSize({id:'s',type:'state',states:['ready'],title:'A long wrapping operational status title '.repeat(4)},{state:'ready'},180);
 assert.ok(title.chrome>tiny.chrome,'wrapped title must reserve more than one-line chrome');
 const signal=E.panelSize({id:'links',type:'signal',links:[{id:'uplink',type:'wifi'}]}, {},340),many=E.panelSize({id:'links',type:'signal',links:[{id:'uplink'},{id:'backup'},{id:'mesh'}]}, {},340);
 assert.ok(signal.minimumWidth>=320,'native link row has several minimum-width columns');assert.ok(many.intrinsicHeight>signal.intrinsicHeight);
 const replica=E.panelSize({id:'r',type:'replicas',replicas:[{id:'a'},{id:'b'}]},{replicas:{a:{series:['history '.repeat(20)]}}},300);
 assert.ok(replica.intrinsicHeight>tiny.intrinsicHeight*3,'replica detail includes per-replica status and history');
 const cost={id:'c',type:'cost',items:[{id:'storage',label:'Storage',value:15}]},sparse=E.panelSize(cost,{},500),dense=E.panelSize({...cost,items:Array.from({length:12},(_,i)=>({id:'item'+i,label:'Detailed infrastructure cost '+i})),assumptions:'Operational assumptions '.repeat(30)},{},500);
 assert.ok(sparse.intrinsicHeight>tiny.intrinsicHeight*3,'cost report has a substantial fixed body');assert.ok(dense.intrinsicHeight>sparse.intrinsicHeight*1.5,'authored report detail grows the estimate');
});
test('late unsupported estimates preserve both input and an existing output atomically',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'compose-estimate-failure-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const d=diagram();d.steps=[{text:'Verbose narrative. '.repeat(5000)}];const input=path.join(dir,'in.json'),output=path.join(dir,'out.json'),bytes=JSON.stringify(d);fs.writeFileSync(input,bytes);fs.writeFileSync(output,'retained');
 const result=spawnSync(process.execPath,[path.resolve(__dirname,'../tools/compose-page-layout.cjs'),'--width','800',input,output],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Unsupported: no bounded/);assert.equal(fs.readFileSync(input,'utf8'),bytes);assert.equal(fs.readFileSync(output,'utf8'),'retained');
});

test('URL-like visible content is sized as text while image assets stay outside text estimates',()=>{
 const panel={id:'table',type:'table',columns:[{id:'value',label:'Value'}]};
 const short=E.panelSize(panel,{rows:[{id:'row',cells:{value:'Short'}}]},650);
 for(const prefix of ['https://example.com/','http://example.com/','data:text/plain,']){
  const value=prefix+'very-long-visible-path/'.repeat(80);
  assert.equal(E.text(value),value);assert.ok(E.lines(value,300)>20);
  const sized=E.panelSize(panel,{rows:[{id:'row',cells:{value}}]},650);assert.ok(sized.intrinsicHeight>short.intrinsicHeight*2);assert.ok(sized.fullHeight>short.fullHeight*2);
 }
 const src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4m8AAAAASUVORK5CYII=';
 const image=E.panelSize({id:'image',type:'image',src,caption:'Reference'}, {},300);
 assert.ok(image.intrinsicHeight>200);assert.equal(image.text.includes(src),false,'encoded pixels are not visible prose');
});


test('graph tile height follows native width scaling and rejects only oversized candidates',()=>{
 const P=require('../tools/arrange/packing.cjs'),bounds={x:0,y:0,w:210,h:300},pitch=77;
 assert.ok(P.graphHeight(bounds,12,pitch)>P.graphHeight(bounds,6,pitch));
 assert.ok(P.graphHeight(bounds,24,pitch)>40,'full width exceeds the bounded grid');
 const source={diagram:A.seed(diagram(),[])},options=E.inputs(source,1920);options.geometry.bounds=bounds;
 const result=S.solve(source,options),graph=M.layout(result.spec).find(t=>!t.panel&&!t.controls);
 assert.ok(graph.w<24,'one oversized candidate must not discard a narrower fit');
 assert.ok(graph.h<=40);assert.ok(graph.h*40-133>=(graph.w*((options.geometry.gridWidth+8)/24)-8)*bounds.h/bounds.w);
 const short=P.graphWaste(bounds,graph.w,3,pitch,1),tall=P.graphWaste(bounds,graph.w,30,pitch,1);
 assert.equal(short.labelEstimate,tall.labelEstimate,'tile height does not scale a width-sized SVG');
});

test('controls reserve native shared-track rows and wrapped single-path chips',()=>{
 const d=diagram();d.steps=Array.from({length:12},(_,i)=>({id:'s'+i,text:'Inspect the evidence. '.repeat(8)}));
 d.paths=Array.from({length:4},(_,i)=>({id:'p'+i,label:'Outcome '+i,steps:['s0','s1','s'+(i+2)]}));
 const all=E.states(d),depth=E.controlDepth(d,all,1000),R=require('../tools/arrange/core.cjs').viewerRouting(),paths=R.diagramPathList(d),rows=R.pathTimelineRows(paths,R.pathTimelineGraph(paths));
 assert.equal(depth.trackHeight,44+32*Math.max(...rows.lanes.values(),...rows.shared.values()));
 const fewer={...d,paths:d.paths.slice(0,2)};assert.ok(depth.neededHeight>E.controlDepth(fewer,E.states(fewer),1000).neededHeight);
 delete d.paths;const narrow=E.controlDepth(d,E.states(d),420),wide=E.controlDepth(d,E.states(d),1200);
 assert.ok(narrow.neededHeight>wide.neededHeight);
});

test('screen footers wrap independently and capped phone content stays bounded',()=>{
 const screen={id:'camera',type:'screen'},short={audio:{connection:'connected',text:'Confirmed.'}},long={audio:{...short.audio,text:'Long visitor instructions. '.repeat(30),source:'Visitor at entrance',reason:'Reason for maintaining the connection. '.repeat(8)}};
 assert.ok(E.panelSize(screen,long,310).extraHeight>E.panelSize(screen,short,310).extraHeight);
 assert.ok(E.panelSize(screen,long,310).extraHeight>E.panelSize(screen,long,600).extraHeight);
 assert.equal(E.screenAudioHeight({...long,siren:'on'},300),0,'native alarm suppresses the audio strip');
 const phone={id:'phone',type:'phone'},many={notifications:Array.from({length:20},()=>({app:'Dispatch',title:'Important notification '.repeat(100),text:'Detailed evidence '.repeat(500)}))};
 const small=E.panelSize(phone,many,220),large=E.panelSize(phone,many,900);
 assert.equal(small.intrinsicHeight,large.intrinsicHeight);assert.ok(small.intrinsicHeight<400,'clamped native cards must not create giant empty outer tiles');
 assert.equal(small.nativeLimits.contentWidth,178);assert.equal(small.nativeLimits.notificationLimit,3);
 const V=require('../tools/arrange/contracts.cjs'),c=V.contract({id:'app',type:'deviceapp'},E.inputs({diagram:A.seed(diagram(),[])},1200).registry);
 const a=V.dimensions(c,12,50,E.panelSize({type:'deviceapp'}, {},592)),b=V.dimensions(c,20,50,E.panelSize({type:'deviceapp'}, {},992));
 assert.equal(a.bodyHeight,b.bodyHeight,'330px portrait cap bounds height as outer tile grows');
});


test('controls reserve independent canon link and runtime rows across path states',()=>{
 const d=diagram();d.steps=[{id:'begin',text:'Begin review.'},{id:'detail',text:'Confirm the evidence.',codeRefs:[{id:'evidence',label:'Processing service evidence '.repeat(12),repository:'https://example.com/processor',revision:'a'.repeat(40),path:'src/process.js',anchor:{start:'begin',end:'end'}}],conditions:[{kind:'slow',label:'Processing is delayed '.repeat(8)}]},{id:'other',text:'Other outcome.'}];
 d.paths=[{id:'normal',steps:['begin','detail']},{id:'other',steps:['begin','other']}];
 const detailed=E.controlDepth(d,E.states(d),420),wide=E.controlDepth(d,E.states(d),1200);
 assert.ok(detailed.evidenceHeight>wide.evidenceHeight);assert.ok(detailed.runtimeHeight>wide.runtimeHeight);
 const plain=structuredClone(d);delete plain.steps[1].codeRefs;delete plain.steps[1].conditions;
 const base=E.controlDepth(plain,E.states(plain),420);
 assert.equal(detailed.neededHeight-base.neededHeight,detailed.evidenceHeight+detailed.runtimeHeight);
 d.steps[1].codeRefs[0].repository='javascript:alert(1)';
 assert.equal(E.controlDepth(d,E.states(d),420).evidenceHeight,0,'only actual sanitized links consume rows');
});


test('composition native-width hint is generic and does not alter manual panel limits',()=>{
 const V=require('../tools/arrange/contracts.cjs'),core=require('../tools/arrange/core.cjs'),registry={get:type=>({layout:core.arrangementLayouts[type]})};
 const contract=V.contract({type:'deviceapp'},registry);
 assert.equal(contract.minWidth,230);assert.equal(contract.preferredWidth,290,'manual preferences are unchanged');
 const raw=diagram();raw.panels=[{id:'report',type:'generic-report'}];
 const layout={sectionSizing:{minWidth:190,preferredWidth:210,maxWidth:250,aspectPolicy:'fixed',bodyAspect:1,grow:0},composition:{minContentWidth:330,nominalFontPx:{detail:11}}};
 const source={diagram:A.seed(raw,[])},options={registry:{get:()=>({layout})},geometry:{gridWidth:1120,gridTop:160,scale:1,bounds:{x:0,y:0,w:150,h:90}},measurements:{report:{paddingX:32}}};
 const first=S.solve(source,options),second=S.solve(source,options);assert.deepEqual(first,second);
 const tile=M.layout(first.spec).find(t=>t.panel==='report');
 assert.ok(tile.w*((1120+8)/24)-8-32>=330,'an arbitrary panel can request native content space');
 assert.equal(layout.sectionSizing.minWidth,190);assert.deepEqual(first.spec.diagram.panels,raw.panels);
 const impossible={...options,registry:{get:()=>({layout:{...layout,composition:{minContentWidth:4000}}})}};
 assert.throws(()=>S.solve(source,impossible),/Unsupported: panel dimensions exceed grid/);
});

test('device-app composition preserves all cards, sibling layouts, hidden tiles and explicit geometry',async()=>{
 const d=diagram();d.panels=[{id:'app',type:'deviceapp',fields:['one','two','three','four'].map(id=>({id,label:id})),initial:{phoneScreen:'app',one:{value:'Original report'}}},{id:'hidden',type:'deviceapp'},{id:'phone',type:'phone'}];
 d.steps=[{id:'first',text:'Inspect values.',panels:{app:{four:{value:'Fourth report',status:'ready'}}}}];
 const hidden={panel:'hidden',hidden:true,x:21,y:21,w:3,h:4};
 d.sectionLayout={columns:24,default:[{x:0,y:0,w:12,h:8},{panel:'app',x:12,y:0,w:5,h:12},hidden],backstage:[{panel:'app',x:0,y:0,w:5,h:10}]};
 const before=JSON.stringify(d);await assert.rejects(A.arrange(d,defaults),/already has geometry/);
 const result=await A.arrange(d,{...defaults,rearrange:true}),out=result.raw.page.sections[0].diagram;
 assert.equal(JSON.stringify(d),before);assert.deepEqual(out.panels,d.panels);assert.deepEqual(out.steps,d.steps);assert.deepEqual(out.sectionLayout.backstage,d.sectionLayout.backstage);assert.deepEqual(out.sectionLayout.default.find(t=>t.hidden),hidden);
 const phoneOnly=diagram();phoneOnly.panels=[{id:'phone',type:'phone'}];const baseline=await A.arrange(phoneOnly,defaults);
 const phone=out.sectionLayout.default.find(t=>t.panel==='phone'),old=baseline.raw.page.sections[0].diagram.sectionLayout.default.find(t=>t.panel==='phone');assert.equal(phone.w,old.w);assert.equal(phone.h,old.h);
 const limits=result.diagnostics[0].panels.find(p=>p.id==='phone');assert.equal(limits.estimatedNativeContent,null);assert.equal(limits.nativeLimits.contentWidth,178);assert.equal(limits.nativeLimits.estimatedBodyFontPx,8);
});
