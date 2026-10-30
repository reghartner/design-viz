'use strict';
// Deterministic CSS-pixel estimates, not DOM measurements. Fixed constants are
// conservative typography/chrome priors; authored state uses the real folders.
const core=require('./core.cjs');
const R=core.viewerRouting();
// Visible text can itself be a URL or data string. Asset fields (image.src,
// appscreens.screens[].src) are selected separately by their panel models.
const S=core.containerSize,text=S.text,lines=S.textLines,inlineRows=S.inlineRows;
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
// screenAudioHTML / FlowAudio.render stack: direction, bordered header,
// wrapping channel badges, caption/source, optional detection and reason.
function screenAudioHeight(s,width){
 const a=s.audio;
 if(!a||!Object.keys(a).length||s.siren==='on'||a.output==='siren'||['smoke-alarm','co-alarm'].includes(a.detection))return 0;
 const content=Math.max(50,width-26),caption=Math.max(40,content-22);
 return 7+24+22+22+48+(a.text?24+lines(a.text,caption,11)*16+(a.source?lines(a.source,caption,9)*14+2:0):a.source?6+lines(a.source,content,10)*14:0)+
   (a.detection&&a.detection!=='none'?24:0)+(a.reason?6+lines(a.reason,content,10)*14:0);
}
// Step controls and the diagram size themselves in src/core/container-size.js.
function controlDepth(d,_all,width){return S.stepControls(d,width);}
function panelSize(p,s,width,layout={}){
 const inner=Math.max(70,width-32),row=(v,w=inner)=>Math.max(1,lines(v,w,13))*19+12,rows=list=>(Array.isArray(list)?list:[]).reduce((n,v)=>n+row(v),0);
 const note=lines(s.note||p.note,inner)*20;let foot=note+(s.audio?40+lines(s.audio.caption||s.audio.text,inner)*19:0);
 let h,extra=foot,model=p.type,scroll=false,nativeLimits=null,bodyWidthCap;
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
 case 'phone':{
  foot=0;extra=0;
  const cards=(s.notifications||[]).slice(0,3),audio=s.audio?180+Math.min(2,lines(s.audio.text,130,8))*12:0;
  // Refreshed frame: 210px notification well, 76px cards, 8px gaps and handset chrome.
  h=Math.max(300,65+Math.max(210,cards.length*76+Math.max(0,cards.length-1)*8)+audio)+(s.notifications?.length>3?14:0);
  nativeLimits={kind:'fixed-width',contentWidth:220,notificationLimit:3,notificationTextLines:2,nominalBodyFontPx:cards.length?10:8,warning:'Native notification titles and bodies are clamped; larger tiles do not reveal or enlarge them.'};break;}
 case 'deviceapp':h=80;bodyWidthCap=330;nativeLimits={kind:'capped-aspect',maxContentWidth:330,warning:'Native phone fits both body dimensions up to 330px; internal scrolling, truncation and compact text remain native limits.'};break;
 case 'screen':h=80;extra=screenAudioHeight(s,inner);break;
 case 'appscreens':{const selected=(p.screens||[]).find(x=>x.id===s.screen),first=(p.screens||[]).find(x=>x.width&&x.height);const aspect=first?first.width/first.height:p.frame==='none'?1.6:9/19.5;h=inner/aspect+rows(selected?[selected.label,selected.caption]:[]);break;}
 case 'image':h=p.src?inner/rasterAspect(p.src):160;extra+=lines(p.caption,inner)*20+(p.link?28:0);break;
 case 'security':h=520+lines(s.operator,inner)*20;break;
 case 'dispatch':h=360+rows(p.units||p.responders||p.teams)+lines(s.detail||s.status,inner)*20;break;
 case 'trace':h=390+rows(p.spans||p.operations||[])*.7;scroll=true;break;
 case 'cost':{
  // Expanded routes span five rows (six for comparisons) with new 10px gaps.
  // Compact/auto-narrow routes use their own existing 4px/5px spacing.
  const expanded=p.density==='expanded'||(p.density!=='compact'&&inner>510),routeGaps=Array.isArray(p.routes)&&p.routes.length===2?5:4;
  h=430+(expanded?routeGaps*10:0)+rows(p.components||p.items||p.metrics||p.options)+lines(p.assumptions,inner,12)*18;break;}
 // Each real metric owns a wrapping label/badge, large value, track and remaining-budget line.
 case 'budget':h=(p.metrics||p.items||[]).reduce((n,m)=>n+110+Math.max(1,lines(m.label||m.id,Math.max(50,inner-95),11))*17,0);break;
 case 'timeline':h=80+rows(p.events||s.events||p.items);break;
 case 'waterfall':h=70+rows(p.rows||p.spans||p.items||s.items);break;
 case 'replicas':h=85+Math.min(480,(p.replicas||[]).reduce((n,r)=>n+155+lines(s.replicas?.[r.id]?.series,inner,11)*17,0));break;
 case 'tiles':h=Math.ceil((p.tiles||p.items||[]).length/Math.max(1,Math.floor(inner/130)))*85;break;
 case 'xray':h=70+rows(p.layers||s.layers);break;
 case 'chime':h=190+lines(s.caption||s.text,inner)*20;break;
 case 'homemap':case 'orbit':case 'radar':case 'zoneframe':h=80;break; // body aspect owned by the panel contract
 default:h=Math.max(80,rows(p.fields||p.items||[])+row(s));model='conservative fallback';
 }
 if(['homemap','deviceapp'].includes(p.type))extra+=lines(s.caption||s.statusText,inner)*20;
 h=Math.max(48,h)+foot;
 // These native widgets already scroll bounded details. Do not pretend that
 // every row is visible: preserve a useful viewport and report the full estimate.
 const fullHeight=h;if(scroll)h=Math.min(h,600);
 const titleLines=lines(p.title,inner,13),chrome=64+Math.max(0,titleLines-1)*18;
 return {nativeLimits,bodyWidthCap,intrinsicHeight:Math.ceil(h*1.08+8),chrome,paddingX:32,extraHeight:extra,nativeContent:layout.sectionSizing?.aspectPolicy==='intrinsic'?{height:h,width:inner}:null,text:text([p.title,s,p.fields,p.checks,p.columns]),minimumWidth:p.type==='signal'?340:p.type==='replicas'?280:0,model,scroll,fullHeight};
}
function graphBounds(d){return S.diagramBounds(d);}
function inputs(source,width){
 const d=source.diagram,all=states(d),layouts=core.arrangementLayouts,registry={get:type=>Object.hasOwn(layouts,type)?{layout:layouts[type]}:undefined};
 const hostWidth=width-80,geometry={gridWidth:Math.max(1000,hostWidth),gridTop:160,scale:Math.min(1,hostWidth/1000),bounds:graphBounds(d)},pitch=(geometry.gridWidth+8)/24,measurements={},minimums={};
 for(const p of d.panels||[]){if(!registry.get(p.type))throw Error('Unsupported: unregistered panel type '+p.type);const byWidth={};for(let w=1;w<=24;w++){
  const samples=all.map(s=>panelSize(p,s.panels[p.id]||{},w*pitch-8,layouts[p.type]));byWidth[w]={...samples[0],intrinsicHeight:Math.max(...samples.map(s=>s.intrinsicHeight)),chrome:Math.max(...samples.map(s=>s.chrome)),extraHeight:Math.max(...samples.map(s=>s.extraHeight)),fullHeight:Math.max(...samples.map(s=>s.fullHeight)),text:samples.reduce((a,b)=>a.length>b.text.length?a:b.text,'')};
 }measurements[p.id]={...byWidth[24],byWidth};minimums[p.id]={w:Math.ceil(((byWidth[24].minimumWidth||0)+8)/pitch)};}
 const stepDepth={};for(let w=1;w<=24;w++)stepDepth[w]=controlDepth(d,all,w*pitch-8);
 return {registry,geometry,measurements,minimums,stepDepth,states:all};
}
module.exports={text,lines,states,rasterAspect,panelSize,screenAudioHeight,controlDepth,graphBounds,inputs};
