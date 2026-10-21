import {expect,inspectPageElement,closeTools} from './test.mjs';

/* Color helpers for the contracts below: WCAG relative luminance on computed
   `rgb(r, g, b)` strings, and OKLab distance for "looks different". */
function rgbTriple(text){const m=/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(text||'');if(!m)throw new Error('not an rgb color: '+text);return [1,2,3].map(i=>Number(m[i]));}
function contrastRatio(a,b){
  const lum=rgb=>{const c=rgb.map(v=>v/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
  const [hi,lo]=[lum(rgbTriple(a)),lum(rgbTriple(b))].sort((x,y)=>y-x);return (hi+.05)/(lo+.05);
}
function oklab(text){
  const [r,g,b]=rgbTriple(text).map(v=>v/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.7936177850*m-.0040720468*s,1.9779984951*l-2.4285922050*m+.4505937099*s,.0259040371*l+.7827717662*m-.8086757660*s];
}
function labDistance(a,b){const p=oklab(a),q=oklab(b);return Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);}
/* The default card colors each skin shipped before #610, captured from the
   rendered viewer; a node without `style` must still paint exactly these. */
const LEGACY_CARD={
  daylight:{fill:'rgb(255, 255, 255)',stroke:'rgb(224, 220, 209)',t1:'rgb(35, 39, 46)',t2:'rgb(121, 128, 139)'},
  editorial:{fill:'rgb(255, 253, 248)',stroke:'rgb(200, 190, 174)',t1:'rgb(30, 41, 39)',t2:'rgb(104, 108, 103)'},
  pastel:{fill:'rgb(255, 255, 255)',stroke:'rgb(216, 224, 235)',t1:'rgb(39, 53, 77)',t2:'rgb(115, 128, 150)'},
  rose:{fill:'rgb(255, 255, 255)',stroke:'rgb(224, 195, 206)',t1:'rgb(74, 44, 58)',t2:'rgb(122, 95, 108)'},
  lavender:{fill:'rgb(255, 253, 248)',stroke:'rgb(205, 186, 219)',t1:'rgb(68, 50, 79)',t2:'rgb(114, 93, 123)'},
  lilac:{fill:'rgb(255, 255, 255)',stroke:'rgb(214, 198, 227)',t1:'rgb(58, 42, 72)',t2:'rgb(110, 92, 126)'},
  aurora:{fill:'rgb(16, 26, 44)',stroke:'rgb(37, 54, 79)',t1:'rgb(234, 242, 255)',t2:'rgb(126, 147, 184)'},
  terminal:{fill:'rgb(12, 20, 17)',stroke:'rgb(38, 53, 47)',t1:'rgb(228, 238, 233)',t2:'rgb(116, 135, 126)'},
  blueprint:{fill:'rgb(8, 54, 109)',stroke:'rgb(166, 231, 243)',t1:'rgb(255, 255, 255)',t2:'rgb(184, 215, 231)'}
};

/* #610 contract matrix (every preset × every skin, computed on the rendered card)
   row | fixture | assertion (scoped) | rejects
   K1 readable | one node per token plus a default node; the 7 editor skins chosen through the Workbench appearance buttons, plus Daylight and Editorial as standalone reader pages (the editor offers no button for them) — all 9 skins | for every token: computed .t1 fill and .t2 fill each contrast >= 4.5:1 against the computed .card fill | an unreadable preset in any skin
   K2 border | same | computed .card stroke differs from its fill, stroke-width >= 1, stroke-opacity 1, and contrasts with the fill at >= 1.3:1 | a border that vanishes into the card
   K3 distinct | same | every pair of presets differs by an OKLab distance >= 0.05 on the border OR >= 0.05 on the background; every preset differs from the default card on fill or stroke | two presets that look alike, or a preset equal to the skin card
   K4 legacy | the node without style, every skin | computed fill, stroke, .t1 and .t2 equal the LEGACY_CARD table captured before #610 | a change to older documents
   K5 lit | every preset, every skin (editor canvas and the Daylight/Editorial reader pages): a step that lights every node | each styled card's lit stroke differs from its resting stroke by an OKLab distance >= 0.05 or grows by >= 1px, and contrasts with its fill at >= 1.5:1; leaving step mode restores the resting fill and text (editor) and the resting stroke (reader; the editor keeps its dashed step-membership stroke on member cards) | an imperceptible or missing lit highlight on any preset
   K6 selected | every preset, every editor skin: all nodes selected with Enter / Shift+Enter | each styled card's stroke is the dashed ring (stroke-dasharray set, width >= 2, opacity >= .9) and contrasts with the card fill at >= 1.5:1; Escape clears it | a preset whose border hides the selection ring
   K7 export | Download SVG of the styled section (editor, current skin) | the file contains g.node.ns-<token> for every token; reopened, each styled card's computed fill and stroke equal the live card's; the default card keeps the skin card colors | an export that loses or flattens the preset paint
   K8 tone | every preset, every skin (editor canvas and the reader pages): a step whose `tone` marks every node `alert` | each styled card's computed fill, stroke, title color and subtitle color equal the plain card's under the same tone (the semantic tone replaces the preset) | a preset that hides or recolors a step tone, or leaves its own subtitle color on the tone fill
   K9 step member | every preset, every editor skin: the selected step's member cards (dv-instep) | each styled member card carries the plain member card's dash pattern and stroke width; where the plain card's membership stroke differs from its resting stroke (the editor accent shows), the styled card's stroke equals it — except Ink on the dark skins, whose light card takes a dark stroke contrasting >= 1.5:1; where the skin's own card rule already recolors the plain mark (Blueprint), the styled stroke must still contrast >= 1.5:1 | a preset that keeps its own border color under the membership dashes
   H1 Confluence | the Forge viewer page with a pasted styled spec (skin aurora) | rows K1–K4 hold on #docview | a host whose stylesheet lacks the presets
   H2 Backstage | the native host fixture (its camera node carries style rose, skin pastel) | the card has class ns-rose; its fill and title differ from the sibling default card; title contrast >= 4.5:1; the sibling keeps the pastel legacy colors | a scoped host stylesheet that drops or mangles the preset rules */
const STYLE_TOKENS=['slate','rose','ember','amber','moss','teal','sky','indigo','violet','magenta','sand','ink'];
function styledDiagram(){
  const diagram={autoplay:false,nodes:{plain:{title:'Default card',sub:'no style'}},rows:[],edges:[],steps:[]};
  STYLE_TOKENS.forEach(token=>{diagram.nodes[token]={title:token,sub:'subtitle',style:token};});
  const ids=Object.keys(diagram.nodes);for(let i=0;i<ids.length;i+=4)diagram.rows.push(ids.slice(i,i+4));
  diagram.edges=[{from:'plain',to:'rose'},{from:'rose',to:'teal'}];
  diagram.steps=[{id:'all',text:'every card lit',nodes:ids},{id:'first',text:'first',edge:'plain->rose'},{id:'second',text:'second',edge:'rose->teal'},
    {id:'tones',text:'every card alert',nodes:ids,tone:Object.fromEntries(ids.map(id=>[id,'alert']))}];
  return diagram;
}
/* Row K8: with every node toned `alert`, a styled card must paint exactly like the plain card. */
async function auditTone(page,scope,skin){
  const seen=await page.evaluate(scope=>{
    const out={};for(const g of document.querySelectorAll(scope+' [data-dv-node]')){
      const card=getComputedStyle(g.querySelector('.card'));
      out[g.dataset.dvNode]={fill:card.fill,stroke:card.stroke,t1:getComputedStyle(g.querySelector('.t1')).fill,t2:getComputedStyle(g.querySelector('.t2')).fill,classes:g.getAttribute('class')};
    }return out;},scope);
  expect(seen.plain.classes).toMatch(/\btone-alert\b/);
  for(const token of STYLE_TOKENS){
    expect(seen[token].classes,skin+' '+token+' toned').toMatch(/\btone-alert\b/);
    expect({fill:seen[token].fill,stroke:seen[token].stroke,t1:seen[token].t1,t2:seen[token].t2},skin+' '+token+' alert tone paint').toEqual({fill:seen.plain.fill,stroke:seen.plain.stroke,t1:seen.plain.t1,t2:seen.plain.t2});
  }
}
/* Rows K5/K6: compares the lit (or selected) stroke of every styled card with its resting stroke. */
async function auditState(page,scope,skin,resting,label){
  const seen=await page.evaluate(scope=>{
    const out={};for(const g of document.querySelectorAll(scope+' [data-dv-node]')){
      const card=getComputedStyle(g.querySelector('.card'));
      out[g.dataset.dvNode]={fill:card.fill,stroke:card.stroke,width:parseFloat(card.strokeWidth),opacity:parseFloat(card.strokeOpacity),dash:card.strokeDasharray,classes:g.getAttribute('class')};
    }return out;},scope);
  for(const token of STYLE_TOKENS){
    const now=seen[token],was=resting[token];
    expect(now.classes,skin+' '+token+' '+label).toMatch(label==='lit'?/\blit\b/:/\bdv-sel\b/);
    if(label==='lit')expect(labDistance(now.stroke,was.stroke)>=.05 || now.width>=was.width+1,skin+' '+token+' lit stroke change (color '+labDistance(now.stroke,was.stroke).toFixed(3)+', width '+was.width+'→'+now.width+')').toBe(true);
    else expect(labDistance(now.stroke,was.stroke),skin+' '+token+' '+label+' stroke change').toBeGreaterThanOrEqual(.05);
    expect(contrastRatio(now.stroke,now.fill),skin+' '+token+' '+label+' stroke contrast').toBeGreaterThanOrEqual(1.5);
    expect(now.opacity,skin+' '+token+' '+label+' opacity').toBeGreaterThanOrEqual(.9);
    if(label==='selected'){expect(now.dash,skin+' '+token+' selection dashes').not.toBe('none');expect(now.width).toBeGreaterThanOrEqual(2);}
  }
  return seen;
}
/* Reads every card in `scope` and checks rows K1–K4 for one skin. */
async function auditCards(page,scope,skin,defaultCard=LEGACY_CARD[skin]){
  const seen=await page.evaluate(scope=>{
    const out={};for(const g of document.querySelectorAll(scope+' [data-dv-node]')){
      const cs=el=>getComputedStyle(el),card=cs(g.querySelector('.card'));
      out[g.dataset.dvNode]={fill:card.fill,stroke:card.stroke,width:parseFloat(card.strokeWidth),opacity:parseFloat(card.strokeOpacity),t1:cs(g.querySelector('.t1')).fill,t2:cs(g.querySelector('.t2')).fill,style:g.dataset.dvStyle||null};
    }return out;},scope);
  // K4
  expect({skin,plain:seen.plain}).toEqual({skin,plain:{...defaultCard,width:expect.any(Number),opacity:expect.any(Number),style:null}});
  for(const token of STYLE_TOKENS){
    const c=seen[token];expect(c.style,skin+' '+token).toBe(token);
    // K1
    expect(contrastRatio(c.t1,c.fill),skin+' '+token+' title').toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.t2,c.fill),skin+' '+token+' subtitle').toBeGreaterThanOrEqual(4.5);
    // K2
    expect(c.stroke,skin+' '+token+' border').not.toBe(c.fill);expect(c.width).toBeGreaterThanOrEqual(1);expect(c.opacity).toBe(1);
    expect(contrastRatio(c.stroke,c.fill),skin+' '+token+' border contrast').toBeGreaterThanOrEqual(1.3);
    // K3 vs default
    expect(c.fill!==seen.plain.fill || c.stroke!==seen.plain.stroke,skin+' '+token+' differs from the skin card').toBe(true);
  }
  for(let i=0;i<STYLE_TOKENS.length;i++)for(let j=i+1;j<STYLE_TOKENS.length;j++){
    const a=seen[STYLE_TOKENS[i]],b=seen[STYLE_TOKENS[j]];
    const apart=Math.max(labDistance(a.stroke,b.stroke),labDistance(a.fill,b.fill));
    expect(apart,skin+': '+STYLE_TOKENS[i]+' vs '+STYLE_TOKENS[j]+' OKLab '+apart.toFixed(3)).toBeGreaterThanOrEqual(.05);
  }
  return seen;
}
const CORE_EDITOR_SKINS=['aurora','blueprint','lavender','lilac','pastel','rose','terminal'];

// Shared desktop K1–K9 contract; the caller selects its build, palette and baseline.
async function auditEditorStyle({page,server},editorSkin,{fixture,start,expectedSkins=CORE_EDITOR_SKINS,defaultCard=LEGACY_CARD[editorSkin]}){
  const raw=fixture();raw.page.sections[0].diagram=styledDiagram();
  await start(page,server,raw);
  // The hidden Node style select lists the field's tokens; this matrix must cover exactly those.
  await inspectPageElement(page,page.locator('#section-overview [data-dv-node="plain"] .t1'));
  const live=(await page.locator('#guide select[aria-label="Node style"] option').evaluateAll(options=>options.map(o=>o.value))).filter(Boolean);
  expect(live).toEqual(STYLE_TOKENS);await closeTools(page);
  // The audit reads unselected cards: Escape clears the selection ring left by inspecting the default node.
  await page.locator('#section-overview [data-dv-node="plain"]').focus();await page.keyboard.press('Escape');await expect(page.locator('.dv-sel')).toHaveCount(0);
  await page.locator('#workspace-appearance>summary').click();
  const editorSkins=await page.locator('#workspace-appearance-body button[id^="sk-"]').evaluateAll(buttons=>buttons.map(b=>b.id.slice(3)));
  expect(editorSkins.sort()).toEqual(expectedSkins.slice().sort());
  const section=page.locator('#section-overview'),ids=Object.keys(styledDiagram().nodes);let lastResting=null;
  for(const skin of [editorSkin]){
    await page.locator('#sk-'+skin).click();await expect(page.locator('body')).toHaveClass(new RegExp('\\bsk-'+skin+'\\b'));
    const resting=await auditCards(page,'#section-overview',skin,defaultCard);lastResting=resting;
    // K5: Step mode, then the first step lights every card.
    await section.getByRole('button',{name:'Step',exact:true}).click();await section.locator('button.schip').first().click();
    await expect(section.locator('[data-dv-node="rose"]')).toHaveClass(/\blit\b/);
    await auditState(page,'#section-overview',skin,resting,'lit');
    // K8: the last step tones every card alert.
    await section.locator('button.schip').last().click();await expect(section.locator('[data-dv-node="plain"]')).toHaveClass(/\btone-alert\b/);
    await auditTone(page,'#section-overview',skin);
    await section.getByRole('button',{name:'Ambient',exact:true}).click();await expect(section.locator('[data-dv-node="rose"]')).not.toHaveClass(/\blit\b/);
    // K9: the chosen step stays selected in the editor; every member card shows the same dashed membership stroke.
    await expect(section.locator('[data-dv-node="plain"]')).toHaveClass(/\bdv-instep\b/);
    const members=await page.evaluate(()=>{const out={};for(const g of document.querySelectorAll('#section-overview [data-dv-node]')){const c=getComputedStyle(g.querySelector('.card'));out[g.dataset.dvNode]={classes:g.getAttribute('class'),fill:c.fill,stroke:c.stroke,dash:c.strokeDasharray,width:c.strokeWidth};}return out;});
    expect(members.plain.dash).not.toBe('none');
    for(const token of STYLE_TOKENS){
      const m=members[token];expect(m.classes,skin+' '+token+' member').toMatch(/\bdv-instep\b/);
      expect({dash:m.dash,width:m.width},skin+' '+token+' membership dashes').toEqual({dash:members.plain.dash,width:members.plain.width});
      const plainMarked=members.plain.stroke!==resting.plain.stroke,dark=['aurora','blueprint','terminal'].includes(skin);
      if(plainMarked && !(token==='ink' && dark))expect(m.stroke,skin+' '+token+' membership stroke').toBe(members.plain.stroke);
      else expect(contrastRatio(m.stroke,m.fill),skin+' '+token+' membership stroke contrast').toBeGreaterThanOrEqual(1.5);
    }
    // Choosing a step chip also selects that step in the editor, whose member cards keep the editor's dashed
    // membership stroke; the fill and text return to rest here, and the reader page below checks the stroke.
    await page.keyboard.press('Escape');await expect(page.locator('.dv-sel')).toHaveCount(0);
    const afterStep=await page.evaluate(()=>{const g=document.querySelector('#section-overview [data-dv-node="rose"]');return {fill:getComputedStyle(g.querySelector('.card')).fill,t1:getComputedStyle(g.querySelector('.t1')).fill};});
    expect(afterStep).toEqual({fill:resting.rose.fill,t1:resting.rose.t1});
    // K6: select every node, then clear.
    await section.locator('[data-dv-node="'+ids[0]+'"]').focus();await page.keyboard.press('Enter');
    for(const id of ids.slice(1)){await section.locator('[data-dv-node="'+id+'"]').focus();await page.keyboard.press('Shift+Enter');}
    await expect(page.locator('.dv-sel[data-dv-node]')).toHaveCount(ids.length);
    await auditState(page,'#section-overview',skin,resting,'selected');
    await page.keyboard.press('Escape');await expect(page.locator('.dv-sel')).toHaveCount(0);
  }
  // K7: the SVG export of this section keeps the resting preset paint of the current skin (the export
  // strips editor state such as focus and selection, so it is compared with the resting audit).
  const liveCards=lastResting;
  await section.locator('[data-dv-node="plain"] .t1').click();await closeTools(page);
  const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-export-svg').click();
  const svg=await (await import('node:fs/promises')).readFile(await (await download).path(),'utf8');
  for(const token of STYLE_TOKENS)expect(svg,token+' class survives export').toMatch(new RegExp('class="node[^"]*\\bns-'+token+'\\b'));
  const reader=await page.context().newPage();await reader.goto('data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'));
  const exported=await reader.evaluate(tokens=>{
    const read=g=>{const card=getComputedStyle(g.querySelector('.card'));return {fill:card.fill,stroke:card.stroke};};
    const out={plain:read(document.querySelector('g.node:not(.node-styled)'))};
    for(const token of tokens)out[token]=read(document.querySelector('g.node.ns-'+token));return out;},STYLE_TOKENS);
  await reader.close();
  for(const id of ['plain',...STYLE_TOKENS])expect(exported[id],id+' exported paint').toEqual({fill:liveCards[id].fill,stroke:liveCards[id].stroke});
}

export {CORE_EDITOR_SKINS,LEGACY_CARD,STYLE_TOKENS,styledDiagram,contrastRatio,auditCards,auditState,auditTone,auditEditorStyle};
