'use strict';
// Deterministic CSS-pixel estimates, not DOM measurements. Fixed constants are
// conservative typography/chrome priors; authored state uses the real folders.
const core=require('./core.cjs'),M=require('./model.cjs');
const R=core.viewerRouting();
// Visible text can itself be a URL or data string. Asset fields (image.src,
// appscreens.screens[].src) are selected separately by their panel models.
function text(value){if(value==null)return '';if(typeof value==='string')return value;return typeof value==='object'?Object.values(value).map(text).filter(Boolean).join(' '):String(value);}
function lines(value,width,font=14){
 const input=text(value);if(!input)return 0;const available=Math.max(font*3,width),advance=c=>/[\u2e80-\uffff]/u.test(c)?font:/[MW@#%]/.test(c)?font*.9:/[il.,' ]/.test(c)?font*.38:font*.62;
 return input.split('\n').reduce((n,line)=>{let used=0,count=1;for(const word of line.split(/(\s+)/)){const size=[...word].reduce((s,c)=>s+advance(c),0);if(used&&used+size>available){count++;used=0;}count+=Math.max(0,Math.ceil(size/available)-1);used=size>available?size%available:used+size;}return n+count;},0);
}
function states(d){
 const result=[{state:{mode:'ambient'},panels:R.foldPanelStates({...d,steps:[]})}];
 result[0].panels=Object.fromEntries(Object.entries(result[0].panels).map(([id,values])=>[id,values[0]||{}]));
 for(const p of R.diagramPathList(d)){const selected=R.diagramForPath(d,p.id),folded=R.foldPanelStates(selected);for(let i=0;i<selected.steps.length;i++)result.push({state:{mode:'step',path:p.id,index:p.indices[i]},step:selected.steps[i],panels:Object.fromEntries(Object.entries(folded).map(([id,values])=>[id,values[i]||{}]))});}
 if(result.length>200)throw Error('Unsupported: more than 200 path/step states; split independent stories before composing');
 return result;
}
function rasterAspect(src){
 if(!src)return null;const m=/^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=\s]+)$/i.exec(src);if(!m)throw Error('Unsupported: image dimensions require an embedded PNG, JPEG or WebP');const b=Buffer.from(m[2],'base64');let w,h;
 if(m[1]==='png'&&b.length>=24){w=b.readUInt32BE(16);h=b.readUInt32BE(20);}
 else if(m[1]==='jpeg'){for(let i=2;i+9<b.length;){if(b[i++]!==255)break;const marker=b[i++],len=b.readUInt16BE(i);if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){h=b.readUInt16BE(i+3);w=b.readUInt16BE(i+5);break;}if(len<2)break;i+=len;}}
 else if(b.length>=30&&b.toString('ascii',12,16)==='VP8X'){w=1+b.readUIntLE(24,3);h=1+b.readUIntLE(27,3);}
 else if(b.length>=30&&b.toString('ascii',12,16)==='VP8 '){w=b.readUInt16LE(26)&16383;h=b.readUInt16LE(28)&16383;}
 else if(b.length>=25&&b.toString('ascii',12,16)==='VP8L'){const bits=b.readUInt32LE(21);w=1+(bits&16383);h=1+((bits>>>14)&16383);}
 if(!(w>0&&h>0&&w<=16384&&h<=16384))throw Error('Unsupported: cannot estimate embedded raster dimensions');return w/h;
}
function panelSize(p,s,width,layout={}){
 const inner=Math.max(70,width-32),row=(v,w=inner)=>Math.max(1,lines(v,w,13))*19+12,rows=list=>(Array.isArray(list)?list:[]).reduce((n,v)=>n+row(v),0);
 const note=lines(s.note||p.note,inner)*20,foot=note+(s.audio?40+lines(s.audio.caption||s.audio.text,inner)*19:0);
 let h,extra=foot,model=p.type,scroll=false;
 switch(p.type){
 case 'state':h=Math.max(28,lines(s.state||'—',inner,20)*26)+Math.max(1,Math.ceil((p.states||[]).reduce((n,v)=>n+text(v).length*7+22,0)/inner))*28;break;
 case 'leds':h=rows(p.leds||p.items||p.labels||Object.keys(s).filter(k=>k!=='note'));break;
 case 'gauge':h=106+lines(s.label||p.label,inner)*20;break;
 case 'battery':h=125+((p.sparkline===false)?0:70)+lines(s.source||s.trend,inner)*18;break;
 case 'signal':h=Math.max(1,(p.links||[]).length)*32+24;break;
 case 'queue':case 'buffer':case 'inflight':h=90+rows(s.items||s.queue||p.items);break;
 case 'thermo':h=220;break;
 case 'log':h=rows(s.log);scroll=true;break;
 case 'table':case 'data-contract':{
  const columns=s.columns||p.columns||[],items=s.rows||s.fields||p.fields||[],cellWidth=Math.max(55,(inner-65)/Math.max(1,columns.length));
  h=55+items.slice(0,p.type==='table'?12:64).reduce((n,r)=>n+Math.max(1,...Object.values(r.cells||r).map(v=>lines(v,cellWidth,13)))*19+22,0);scroll=true;break;}
 case 'checks':h=42+(p.checks||[]).reduce((n,c)=>n+row(c.label||c.id)+lines(s.results?.[c.id]?.detail||c.detail,inner)*20,0);break;
 case 'phone':h=Math.max(252,85+rows(s.notifications||s.stack||[])+lines(s.title,150,16)*22+lines(s.text||s.body,150,12)*18+(s.call?150:0));break;
 case 'appscreens':{const selected=(p.screens||[]).find(x=>x.id===s.screen),first=(p.screens||[]).find(x=>x.width&&x.height);const aspect=first?first.width/first.height:p.frame==='none'?1.6:9/19.5;h=inner/aspect+rows(selected?[selected.label,selected.caption]:[]);break;}
 case 'image':h=p.src?inner/rasterAspect(p.src):160;extra+=lines(p.caption,inner)*20+(p.link?28:0);break;
 case 'security':h=520+lines(s.operator,inner)*20;break;
 case 'dispatch':h=360+rows(p.units||p.responders||p.teams)+lines(s.detail||s.status,inner)*20;break;
 case 'trace':h=390+rows(p.spans||p.operations||[])*.7;scroll=true;break;
 case 'cost':h=430+rows(p.components||p.items||p.metrics||p.options)+lines(p.assumptions,inner,12)*18;break;
 case 'budget':h=170+rows(p.categories||p.items||p.components);break;
 case 'timeline':h=80+rows(p.events||s.events||p.items);break;
 case 'waterfall':h=70+rows(p.rows||p.spans||p.items||s.items);break;
 case 'replicas':h=85+Math.min(480,(p.replicas||[]).reduce((n,r)=>n+155+lines(s.replicas?.[r.id]?.series,inner,11)*17,0));break;
 case 'tiles':h=Math.ceil((p.tiles||p.items||[]).length/Math.max(1,Math.floor(inner/130)))*85;break;
 case 'xray':h=70+rows(p.layers||s.layers);break;
 case 'chime':h=190+lines(s.caption||s.text,inner)*20;break;
 case 'deviceapp':case 'homemap':case 'screen':case 'orbit':case 'radar':case 'zoneframe':h=80;break; // body aspect owned by the panel contract
 default:h=Math.max(80,rows(p.fields||p.items||[])+row(s));model='conservative fallback';
 }
 if(['homemap','screen','deviceapp'].includes(p.type))extra+=lines(s.caption||s.statusText,inner)*20;
 h=Math.max(48,h)+foot;
 // These native widgets already scroll bounded details. Do not pretend that
 // every row is visible: preserve a useful viewport and report the full estimate.
 const fullHeight=h;if(scroll)h=Math.min(h,600);
 const titleLines=lines(p.title,inner,13),chrome=64+Math.max(0,titleLines-1)*18;
 return {intrinsicHeight:Math.ceil(h*1.08+8),chrome,paddingX:32,extraHeight:extra,nativeContent:layout.sectionSizing?.aspectPolicy==='intrinsic'?{height:h,width:inner}:null,text:text([p.title,s,p.fields,p.checks,p.columns]),minimumWidth:p.type==='signal'?340:p.type==='replicas'?280:0,model,scroll,fullHeight};
}
function graphBounds(d){
 if(!Object.keys(d.nodes||{}).length)return {x:0,y:0,w:1,h:1};
 const clean=M.clone(d);delete clean.graphFrame;const geometry=R.layout(clean),exported=core.exportAnonymousLayout({page:{title:'Composition',sections:[{diagram:clean}]}}).diagrams[0],boxes=[];
 const add=(x,y,w,h)=>boxes.push({x,y,w,h});
 for(const n of exported.nodes)add(n.x,n.y,n.width,n.height);
 for(const b of Object.values(geometry.groups||{}))add(b.x,b.y,b.w,b.h);
 exported.edges.forEach((edge,i)=>{const n=(edge.path.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi)||[]).map(Number),xs=n.filter((_,i)=>i%2===0),ys=n.filter((_,i)=>i%2===1);if(!xs.length)return;const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;add(x,y,w,h);
  const e=d.edges[i],count=(d.steps||[]).filter(s=>(s.edges||[s.edge]).includes(e.from+'->'+e.to)).length;
  // Labels and moving step markers may extend past the path. Use a conservative
  // envelope around the complete path hull, including authored label offsets.
  const pad=Math.max(16,Math.min(180,count*12)),label=text(e.label).length*3.6;
  add(x+Math.min(0,e.labelDx||0)-label-pad,y+Math.min(0,e.labelDy||0)-30,w+Math.abs(e.labelDx||0)+2*(label+pad),h+Math.abs(e.labelDy||0)+60);
 });
 const x=Math.floor(Math.min(...boxes.map(b=>b.x))-30),y=Math.floor(Math.min(...boxes.map(b=>b.y))-30),w=Math.ceil(Math.max(...boxes.map(b=>b.x+b.w))+30)-x,h=Math.ceil(Math.max(...boxes.map(b=>b.y+b.h))+30)-y;
 if(![x,y,w,h].every(Number.isFinite)||Math.max(Math.abs(x),Math.abs(y),w,h)>100000)throw Error('Unsupported: graph geometry exceeds bounded frame');return {x,y,w,h};
}
function inputs(source,width){
 const d=source.diagram,all=states(d),layouts=core.arrangementLayouts,registry={get:type=>Object.hasOwn(layouts,type)?{layout:layouts[type]}:undefined};
 const hostWidth=width-80,geometry={gridWidth:Math.max(1000,hostWidth),gridTop:160,scale:Math.min(1,hostWidth/1000),bounds:graphBounds(d)},pitch=(geometry.gridWidth+8)/24,measurements={},minimums={};
 for(const p of d.panels||[]){if(!registry.get(p.type))throw Error('Unsupported: unregistered panel type '+p.type);const byWidth={};for(let w=1;w<=24;w++){
  const samples=all.map(s=>panelSize(p,s.panels[p.id]||{},w*pitch-8,layouts[p.type]));byWidth[w]={...samples[0],intrinsicHeight:Math.max(...samples.map(s=>s.intrinsicHeight)),chrome:Math.max(...samples.map(s=>s.chrome)),extraHeight:Math.max(...samples.map(s=>s.extraHeight)),fullHeight:Math.max(...samples.map(s=>s.fullHeight)),text:samples.reduce((a,b)=>a.length>b.text.length?a:b.text,'')};
 }measurements[p.id]={...byWidth[24],byWidth};minimums[p.id]={w:Math.ceil(((byWidth[24].minimumWidth||0)+8)/pitch)};}
 const stepDepth={};for(let w=1;w<=24;w++){const captionWidth=w*pitch-8-180,maxLines=Math.max(0,...all.map(s=>lines(s.step?.text||'',captionWidth,14))),paths=R.diagramPathList(d).length;stepDepth[w]={neededHeight:70+maxLines*22+(paths>1?32:0),maxLines,unsupported:captionWidth<100};}
 return {registry,geometry,measurements,minimums,stepDepth,states:all};
}
module.exports={text,lines,states,rasterAspect,panelSize,graphBounds,inputs};
