import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

function story(mode,scale=.75){
 const presentation=mode==='standard'?'standard':'explore';
 const exploreLayout={controlsScale:scale,controlsPlacement:mode==='canvas'?'canvas':'floating',steps:{textPosition:'below'},controls:{x:.08,y:.62,w:.78,h:.23},canvas:{controls:{x:80,y:420,w:760,h:190}}};
 return {page:{title:'Smooth step captions',skin:'pastel',sections:[{id:'transition',heading:'Transition',diagram:{view:'step',autoplay:false,
  nodes:{source:{title:'Source'},destination:{title:'Destination'}},rows:[['source','destination']],edges:[{from:'source',to:'destination'}],
  steps:[{id:'queued',text:'The request is queued for delivery.',nodes:['source']},{id:'sent',text:'The request crosses the delivery boundary.',edge:'source->destination'},{id:'done',text:'The destination accepts the request.',nodes:['destination']}],
  paths:[{id:'delivery',label:'Delivery',steps:['queued','sent','done']}],
  layouts:[{id:'main',name:'Main',presentation,playbackPosition:'beside',sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:12}]},exploreLayout}]}}]}};
}

async function open(page,server,mode,scale=.75){
 const input=path.join(server.root,'step-caption-'+mode+'.json'),output=path.join(server.root,'step-caption-'+mode+'.html');
 await writeFile(input,JSON.stringify(story(mode,scale)));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 await page.goto(server.origin+'/step-caption-'+mode+'.html');
 await page.evaluate(()=>document.fonts.ready);
 const section=page.locator('#section-transition');await expect(section.locator('.termbar')).toBeVisible();return section;
}

function captionRects(bar){
 return bar.evaluate(el=>{
  const live=el.querySelector('.stepline:not(.dv-caption-old)'),old=el.querySelector('.dv-caption-old');
  const metric=node=>{const r=node.getBoundingClientRect(),style=getComputedStyle(node);return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,opacity:Number(style.opacity),animationName:style.animationName,animationPlayState:style.animationPlayState};};
  return {bar:metric(el),live:metric(live),old:old?metric(old):null,oldText:old?.innerText,liveText:live.innerText};
 });
}

function expectAligned({bar,live,old}){
 expect(old).not.toBeNull();
 expect.soft(Math.abs(old.left-live.left),'outgoing and incoming caption left edges').toBeLessThanOrEqual(1);
 expect.soft(Math.abs(old.top-live.top),'outgoing and incoming caption top edges').toBeLessThanOrEqual(1);
 expect.soft(Math.abs(old.width-live.width),'outgoing and incoming caption widths').toBeLessThanOrEqual(1);
 expect.soft(old.left).toBeGreaterThanOrEqual(bar.left-1);expect.soft(old.right).toBeLessThanOrEqual(bar.right+1);
 expect.soft(old.top).toBeGreaterThanOrEqual(bar.top-1);expect.soft(old.bottom).toBeLessThanOrEqual(bar.bottom+1);
}

function expectCrossfading({live,old}){
 expect(old.animationName).toBe('dvcaptionold');expect(live.animationName).toBe('dvcaptionnew');
 expect(old.animationPlayState).toBe('running');expect(live.animationPlayState).toBe('running');
 expect(old.opacity+live.opacity,'combined caption opacity during crossfade').toBeGreaterThanOrEqual(.8);
 expect(old.opacity+live.opacity,'combined caption opacity during crossfade').toBeLessThanOrEqual(1.2);
}

test.use({reducedMotion:'no-preference'});

for(const mode of ['standard','floating','canvas'])test(`${mode} scaled controls crossfade captions in one region`,async({page,server},info)=>{
 await page.setViewportSize({width:1600,height:1100});const section=await open(page,server,mode);const bar=section.locator('.termbar');
 await bar.getByRole('button',{name:'Next step',exact:true}).click();
 const first=await captionRects(bar);expect(first.oldText).toContain('queued for delivery');expect(first.liveText).toContain('crosses the delivery boundary');expectCrossfading(first);
 const shot=info.outputPath(mode+'-caption-transition.png');await page.screenshot({path:shot});await info.attach(mode+' caption mid-fade',{path:shot,contentType:'image/png'});
 await info.attach(mode+' caption geometry',{body:JSON.stringify(first,null,2),contentType:'application/json'});expectAligned(first);
 await bar.getByRole('button',{name:'Next step',exact:true}).click();
 await expect(bar.locator('.dv-caption-old')).toHaveCount(1);const rapid=await captionRects(bar);expect(rapid.oldText).toContain('crosses the delivery boundary');expect(rapid.liveText).toContain('destination accepts');expectCrossfading(rapid);expectAligned(rapid);
 await bar.getByRole('button',{name:'Previous step',exact:true}).click();
 await expect(bar.locator('.dv-caption-old')).toHaveCount(1);const reverse=await captionRects(bar);expect(reverse.oldText).toContain('destination accepts');expect(reverse.liveText).toContain('crosses the delivery boundary');expectCrossfading(reverse);expectAligned(reverse);
 await expect(bar.locator('.dv-caption-old')).toHaveCount(0);
 await expect(bar.locator('.stepline.dv-caption-new')).toHaveCount(0);
 await expect(bar.locator('.stepline:not(.dv-caption-old)')).toHaveCSS('opacity','1');
});

test('reduced motion updates immediately without a transition copy',async({page,server})=>{
 await page.emulateMedia({reducedMotion:'reduce'});const section=await open(page,server,'floating',.8);const bar=section.locator('.termbar');
 await bar.getByRole('button',{name:'Next step',exact:true}).click();
 await expect(bar.locator('.stepline:not(.dv-caption-old)')).toContainText('crosses the delivery boundary');
 await expect(bar.locator('.dv-caption-old')).toHaveCount(0);await expect(bar.locator('.stepline.dv-caption-new')).toHaveCount(0);
});
