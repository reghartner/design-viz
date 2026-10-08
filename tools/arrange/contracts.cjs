'use strict';
// Panel-owned contracts; spec-derived estimates override the conservative fallback.
function contract(panel,registry){
 const layout=registry.get(panel.type)?.layout||{},declared=layout.sectionSizing;
 const typed={table:{minWidth:360,preferredWidth:520,maxWidth:1000},'data-contract':{minWidth:420,preferredWidth:650,maxWidth:1200},trace:{minWidth:380,preferredWidth:560,maxWidth:1000},log:{minWidth:240,preferredWidth:400,maxWidth:850},waterfall:{minWidth:320,preferredWidth:480,maxWidth:900}}[panel.type]||{};
 const result={minWidth:190,preferredWidth:layout.large?480:280,maxWidth:layout.large?1000:600,aspectPolicy:layout.canvasSizing?.mode==='fixed-aspect'?'fixed':'content',bodyAspect:layout.canvasSizing?.aspect,grow:layout.canvasSizing?.mode==='fixed-aspect'?0:1,...typed,...declared};
 const rows=Math.max(panel.fields?.length||0,panel.checks?.length||0,panel.tiles?.length||0,panel.initial?.rows?.length||0,panel.initial?.log?.length||0);
 if(result.aspectPolicy==='content'&&rows>4){result.preferredWidth=Math.max(result.preferredWidth,360);result.minWidth=Math.max(result.minWidth,250);result.maxWidth=Math.max(result.maxWidth,result.preferredWidth);}
 return {...result,composition:layout.composition,rows,fallback:!declared};
}
// Internal panel-owned hint, independent of the manual tile minimum. The floor
// includes estimated horizontal chrome so a native frame is not scaled down
// merely because the packing score favors compact outer rectangles.
function compositionWidth(c,measurement={}){
 const target=c.composition?.minContentWidth;
 return target>0?target+(measurement.paddingX||24)+(c.bodyInset||0):0;
}
function dimensions(c,w,pitch,measurement={},minimum={}){
 measurement=measurement.byWidth?.[w]||measurement;
 const nativeWidth=w*pitch-8,chrome=measurement.chrome||42,padding=measurement.paddingX||24;
 const available=Math.min(measurement.bodyWidthCap||Infinity,Math.max(1,nativeWidth-padding-(c.bodyInset||0)));
 let bodyHeight=c.aspectPolicy==='fixed'&&c.bodyAspect?available/c.bodyAspect+Math.max(c.bodyInset||0,measurement.extraHeight||0):measurement.intrinsicHeight||Math.max(58,c.rows*24);
 if(c.aspectPolicy==='intrinsic'&&measurement.nativeContent)bodyHeight=measurement.intrinsicHeight||measurement.nativeContent.height;
 return {w,h:Math.max(3,Math.ceil((bodyHeight+chrome+8)/40),minimum.h||0),nativeWidth,bodyWidth:available,bodyHeight,chrome};
}
function rowFill(entries,width,pitch){
 let left=width-entries.reduce((n,e)=>n+e.w,0);
 while(left>0){const e=entries.filter(e=>e.c.grow>0&&(e.w+1)*pitch-8<=e.c.maxWidth).sort((a,b)=>a.w/a.c.grow-b.w/b.c.grow||a.order-b.order)[0];if(!e)break;e.w++;left--;}
 return entries;
}
function nativeContentEstimate(c,size,tileHeight,measurement,hostScale){
 const hint=c.composition;if(!(hint?.minContentWidth>0))return null;
 const availableHeight=Math.max(0,tileHeight-size.chrome-Math.max(c.bodyInset||0,measurement.extraHeight||0));
 const logicalWidth=Math.min(size.bodyWidth,c.bodyAspect?availableHeight*c.bodyAspect:Infinity),scale=logicalWidth/hint.minContentWidth*hostScale;
 return {targetWidth:hint.minContentWidth,estimatedLogicalWidth:logicalWidth,estimatedRenderedWidth:logicalWidth*hostScale,estimatedScale:scale,hostScale,
  estimatedFontPx:Object.fromEntries(Object.entries(hint.nominalFontPx||{}).map(([name,font])=>[name,font*scale])),
  scope:'Spec-derived frame and font estimates with 80px host inset; document padding and embeds may differ. Narrow hosts scale the entire design grid. Native scrolling and truncation remain unchanged.'};
}
module.exports={contract,compositionWidth,dimensions,rowFill,nativeContentEstimate};
