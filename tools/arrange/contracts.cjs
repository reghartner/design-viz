'use strict';
// Panel-owned contracts; native measurements override the conservative fallback.
function contract(panel,registry){
 const layout=registry.get(panel.type)?.layout||{},declared=layout.sectionSizing;
 const result={minWidth:190,preferredWidth:layout.large?480:280,maxWidth:layout.large?1000:600,aspectPolicy:layout.canvasSizing?.mode==='fixed-aspect'?'fixed':'content',bodyAspect:layout.canvasSizing?.aspect,grow:layout.canvasSizing?.mode==='fixed-aspect'?0:1,...declared};
 const rows=Math.max(panel.fields?.length||0,panel.checks?.length||0,panel.tiles?.length||0,panel.initial?.rows?.length||0,panel.initial?.log?.length||0);
 if(result.aspectPolicy==='content'&&rows>4){result.preferredWidth=Math.max(result.preferredWidth,360);result.minWidth=Math.max(result.minWidth,250);result.maxWidth=Math.max(result.maxWidth,result.preferredWidth);}
 return {...result,rows,fallback:!declared};
}
function dimensions(c,w,pitch,measurement={},minimum={}){
 measurement=measurement.byWidth?.[w]||measurement;
 const nativeWidth=w*pitch-8,chrome=measurement.chrome||42,padding=measurement.paddingX||24;
 const available=Math.max(1,nativeWidth-padding-(c.bodyInset||0));
 let bodyHeight=c.aspectPolicy==='fixed'&&c.bodyAspect?available/c.bodyAspect+Math.max(c.bodyInset||0,measurement.extraHeight||0):measurement.intrinsicHeight||Math.max(58,c.rows*24);
 if(c.aspectPolicy==='intrinsic'&&measurement.nativeContent)bodyHeight=measurement.intrinsicHeight||measurement.nativeContent.height;
 return {w,h:Math.max(3,Math.ceil((bodyHeight+chrome+8)/40),minimum.h||0),nativeWidth,bodyHeight,chrome};
}
function rowFill(entries,width,pitch){
 let left=width-entries.reduce((n,e)=>n+e.w,0);
 while(left>0){const e=entries.filter(e=>e.c.grow>0&&(e.w+1)*pitch-8<=e.c.maxWidth).sort((a,b)=>a.w/a.c.grow-b.w/b.c.grow||a.order-b.order)[0];if(!e)break;e.w++;left--;}
 return entries;
}
module.exports={contract,dimensions,rowFill};
