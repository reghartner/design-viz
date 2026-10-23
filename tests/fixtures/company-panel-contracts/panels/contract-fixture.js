/* Real trusted panel definitions for scratch forks only. Broken styles are
   deliberate: the normal browser assertions must reject their rendered output. */
function contractFixture(type, variant) {
  var sizing=variant==='aspect'?{mode:'fixed-aspect',aspect:2,resizeAxis:'width'}:
    variant==='fit'?{mode:'content-fit',maxHeight:180,resizeAxis:'width'}:undefined;
  var content=variant==='aspect'?'<svg viewBox="0 0 400 200" role="img" aria-label="Responsive artwork"><rect width="400" height="200" fill="#789"/><circle cx="200" cy="100" r="65" fill="#acf"/></svg>':
    Array.from({length:variant==='scroll'||variant==='fit'||variant==='clipped'?24:3},function(_,i){return '<div class="contract-row">Contract evidence '+(i+1)+'</div>';}).join('');
  PanelRegistry.define(type,{
    label:type,since:'0.2.0',authoring:{template:{title:type,initial:{note:'Ready'}}},
    layout:{height:10,canvasSizing:sizing},
    render:function(){return {html:'<div class="contract-content '+type+'">'+(variant==='responsive'||variant==='clipped'?'<span class="contract-sr">Accessible caption describing this panel</span><div class="contract-decoration" aria-hidden="true">Decorative masked content</div><div class="contract-ellipsis">A long title deliberately truncated with an ellipsis for compact presentation</div>':'')+content+'</div>'};},
    styles:'.contract-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.contract-decoration{position:absolute;width:3000px;height:3000px;left:0;top:0;overflow:hidden;pointer-events:none}.contract-ellipsis{width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.'+type+'{box-sizing:border-box;width:100%;min-width:0;min-height:0}.contract-row{padding:8px;border-bottom:1px solid #789}'+
      (variant==='responsive'||variant==='clipped'?'.'+type+'{position:relative;overflow:hidden}':'')+
      (variant==='frozen-height'?'.section-layout-tile:has(.'+type+'){height:200px!important}':'')+
      (variant==='frozen-card-height'?'.section-layout-tile>.pwidget:has(.'+type+'){height:200px!important}':'')+
      (variant==='aspect'?'.'+type+' svg{display:block;width:100%;height:auto}':'')+
      (variant==='scroll'?'.'+type+'{height:100%;overflow:auto}':'')+
      (variant==='frozen'?'.'+type+'{width:180px;height:150px}':'')+
      (variant==='clipped'?'.'+type+'{height:70px;overflow:hidden}':'')+
      (variant==='horizontal'?'.explore-window:has(.'+type+'){--float-y:100px!important}':'')
  });
}
