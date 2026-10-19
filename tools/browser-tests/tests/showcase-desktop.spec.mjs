import {execFileSync} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const viewports=[{width:1280,height:800},{width:1440,height:900}];
const packages=(process.env.FLOWVIEW_PACKAGES||'').split(',');
// CI exercises every authored state; use the smaller sample only for local iteration.
const allSteps=process.env.FLOWVIEW_SHOWCASE_SAMPLE!=='1';
const showcases=[
  {name:'science showcase',package:'science',spec:'packages/science/diagrams/biology/cell-journey/biology-teaching.spec.json'},
  {name:'sports showcase',package:'sports',spec:'packages/sports/diagrams/season-of-seats/season-of-seats.spec.json'},
];
const screenshotSections={
  science:new Set(['replication-fork','translation-codons','membrane-pump','nerve-impulse','sequencing-run']),
  sports:new Set(['schaefer-effect','first-10000-vs-everyone','gate-night','score-first','morning-after','clinch-or-fade']),
};

function selectedSteps(section){
  const {steps,paths=[]}=section.diagram;
  if(allSteps)return paths.length?paths.map(route=>({path:route.id,ids:route.steps})):
    [{path:null,ids:steps.map(step=>step.id)}];
  if(!paths.length)return [{path:null,ids:[steps[0].id,steps[Math.floor(steps.length/2)].id,steps.at(-1).id]}];
  return paths.map(route=>{
    const otherSteps=new Set(paths.filter(other=>other!==route).flatMap(other=>other.steps));
    const branch=route.steps.find(id=>!otherSteps.has(id));
    return {path:route.id,ids:[...new Set([route.steps[0],branch,route.steps.at(-1)].filter(Boolean))]};
  });
}

async function geometry(page,sectionId){
  return page.evaluate(id=>{
    const section=document.getElementById('section-'+id);
    const tile=section?.querySelector('.section-layout-tile[data-layout-key="steps"]');
    const rail=tile?.querySelector(':scope > .termbar');
    const chips=rail?.querySelector('.schips');
    if(!section||!tile||!rail||!chips)return {missing:true};
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
    const bounds=el=>({rect:rect(el),scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,
      scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,overflowY:getComputedStyle(el).overflowY});
    const panelTiles=[...section.querySelectorAll('.section-layout-tile[data-layout-key^="panel:"]')]
      .filter(visible).map(tile=>{
        const panel=tile.querySelector('.pwidget');
        const body=panel?.querySelector(':scope > .pbody');
        return {key:tile.getAttribute('data-layout-key'),tile:bounds(tile),
          panel:panel&&bounds(panel),body:body&&bounds(body)};
      });
    const navNumbers=[...document.querySelectorAll('.reader-tree-section[data-page-number]')]
      .filter(visible).map(el=>{
        const style=getComputedStyle(el,'::before');
        return {number:el.getAttribute('data-page-number'),height:parseFloat(style.height),
          lineHeight:parseFloat(style.lineHeight)};
      });
    return {missing:false,rail:bounds(rail),chips:bounds(chips),hasPaths:rail.classList.contains('has-paths'),navNumbers,
      buttons:[...rail.querySelectorAll('button')].filter(visible).map(button=>({
        label:button.getAttribute('aria-label')||button.textContent.trim(),step:button.classList.contains('schip'),rect:rect(button),
      })),
      selected:[...rail.querySelectorAll('.schip[aria-current="true"]')].filter(visible).map(rect),
      panelTiles,pageOverflow:document.documentElement.scrollWidth-innerWidth};
  },sectionId);
}

function assertLayout(g,viewport,context){
  expect(g.missing,context+' has a rendered controls rail').toBe(false);
  expect(g.rail.rect.width,context+' rail width').toBeGreaterThan(100);
  expect(g.rail.rect.top,context+' rail top').toBeGreaterThanOrEqual(0);
  expect(g.rail.rect.bottom,context+' rail bottom').toBeLessThanOrEqual(viewport.height+2);
  expect(g.rail.scrollHeight,context+' rail vertical fit').toBeLessThanOrEqual(g.rail.clientHeight+1);
  expect(g.chips.scrollHeight,context+' step/path rows fit').toBeLessThanOrEqual(g.chips.clientHeight+1);
  if(g.hasPaths)expect(g.chips.scrollWidth,context+' step/path columns fit').toBeLessThanOrEqual(g.chips.clientWidth+1);
  expect(g.pageOverflow,context+' page horizontal overflow').toBeLessThanOrEqual(1);
  for(const number of g.navNumbers.filter(item=>Number(item.number)>=10))
    expect(number.height,context+' section '+number.number+' navigation number stays on one line')
      .toBeLessThanOrEqual(number.lineHeight+1);
  expect(g.buttons.length,context+' visible controls').toBeGreaterThan(2);
  for(const button of g.buttons){
    expect(button.rect.left,context+' '+button.label+' left').toBeGreaterThanOrEqual(g.rail.rect.left-1);
    expect(button.rect.right,context+' '+button.label+' right').toBeLessThanOrEqual(g.rail.rect.right+1);
    expect(button.rect.top,context+' '+button.label+' top').toBeGreaterThanOrEqual(g.rail.rect.top-1);
    expect(button.rect.bottom,context+' '+button.label+' bottom').toBeLessThanOrEqual(g.rail.rect.bottom+1);
    if(button.step&&!g.hasPaths){
      expect(button.rect.left,context+' '+button.label+' inside step strip').toBeGreaterThanOrEqual(g.chips.rect.left-1);
      expect(button.rect.right,context+' '+button.label+' inside step strip').toBeLessThanOrEqual(g.chips.rect.right+1);
    }
  }
  expect(g.selected.length,context+' selected step').toBeGreaterThan(0);
  for(const chip of g.selected){
    expect(chip.left,context+' selected step left').toBeGreaterThanOrEqual(g.chips.rect.left-1);
    expect(chip.right,context+' selected step right').toBeLessThanOrEqual(g.chips.rect.right+1);
    expect(chip.bottom,context+' selected step bottom').toBeLessThanOrEqual(g.chips.rect.bottom+1);
  }
  expect(g.panelTiles.length,context+' visible panels').toBeGreaterThan(0);
  for(const panel of g.panelTiles){
    expect(panel.panel,context+' '+panel.key+' panel exists').not.toBeNull();
    expect(panel.panel.rect.right,context+' '+panel.key+' right').toBeLessThanOrEqual(panel.tile.rect.right+1);
    expect(panel.panel.rect.bottom,context+' '+panel.key+' bottom').toBeLessThanOrEqual(panel.tile.rect.bottom+1);
    for(const [name,part] of [['card',panel.panel],['body',panel.body]])if(part){
      expect(part.scrollWidth,context+' '+panel.key+' '+name+' horizontal fit').toBeLessThanOrEqual(part.clientWidth+1);
      if(part.scrollHeight>part.clientHeight+1)
        expect(['auto','scroll'],context+' '+panel.key+' '+name+' vertical overflow is reachable').toContain(part.overflowY);
    }
  }
}

for(const showcase of showcases){
  test.describe(showcase.name,()=>{
    test.skip(!packages.includes(showcase.package),showcase.package+' is an opt-in browser package.');
    for(const viewport of viewports){
      test(`every section keeps controls and panels within the desktop layout at ${viewport.width}×${viewport.height}`,async({page,server},testInfo)=>{
        test.setTimeout(allSteps?480000:180000);
        await page.setViewportSize(viewport);
        const source=JSON.parse(await readFile(path.join(repo,showcase.spec),'utf8'));
        const sections=source.page.sections;
        expect(sections.length).toBe(showcase.package==='science'?13:14);
        const output=path.join(server.root,showcase.package+'-showcase-desktop.html');
        execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(repo,showcase.spec),
          path.join(repo,'template/flowview.html'),output]);
        await page.goto(server.origin+'/'+path.basename(output));
        await page.evaluate(()=>document.fonts.ready);
        await expect(page.locator('.reader-tree-section')).toHaveCount(sections.length);
        const failures=[],failureSections=new Set();
        for(const [sectionIndex,section] of sections.entries()){
          await page.locator('.reader-tree-section').nth(sectionIndex).click();
          const controls=page.locator('#section-'+section.id+' .section-layout-tile[data-layout-key="steps"]>.termbar');
          await expect(controls).toBeVisible();
          for(const route of selectedSteps(section)){
            if(route.path)await controls.locator(`[data-dv-path="${route.path}"]`).click();
            for(const step of route.ids){
            const sourceIndex=section.diagram.steps.findIndex(item=>item.id===step);
            expect(sourceIndex,section.id+' has authored step '+step).toBeGreaterThanOrEqual(0);
            const onPath=route.path?controls.locator(`[data-step-path="${route.path}"][data-step-source="${sourceIndex}"]`):null;
            const chip=onPath&&await onPath.count()?onPath.first():controls.locator(`[data-step-source="${sourceIndex}"]`).first();
            await chip.click();
            await expect(controls.locator(`.schip[aria-current="true"][data-step-source="${sourceIndex}"]`).first()).toBeVisible();
            await expect(controls).toBeVisible();
            await controls.scrollIntoViewIfNeeded();
            const context=showcase.name+' / '+section.id+' / '+(route.path||'main')+' / '+step+' / '+viewport.width;
            const g=await geometry(page,section.id);
            try{assertLayout(g,viewport,context);}catch(error){
              failures.push({context,issue:error.message.split('\n')[0],geometry:g});
              if(!failureSections.has(section.id)){
                failureSections.add(section.id);
                if(process.env.FLOWVIEW_SCREENSHOT_DIR){
                  await mkdir(process.env.FLOWVIEW_SCREENSHOT_DIR,{recursive:true});
                  await page.screenshot({path:path.join(process.env.FLOWVIEW_SCREENSHOT_DIR,
                    `${showcase.package}-${section.id}-${viewport.width}x${viewport.height}-failure.png`)});
                }
              }
            }
            }
          }
          if(process.env.FLOWVIEW_SCREENSHOT_DIR&&screenshotSections[showcase.package].has(section.id)){
            await mkdir(process.env.FLOWVIEW_SCREENSHOT_DIR,{recursive:true});
            await page.locator('#section-'+section.id).screenshot({
              path:path.join(process.env.FLOWVIEW_SCREENSHOT_DIR,
                `${showcase.package}-${section.id}-${viewport.width}x${viewport.height}.png`),
            });
          }
        }
        if(failures.length){
          await testInfo.attach('showcase-layout-failures',{body:JSON.stringify(failures,null,2),contentType:'application/json'});
          throw new Error(failures.length+' layout failures across '+failureSections.size+' sections:\n'+
            failures.map(f=>f.context+': '+f.issue).join('\n'));
        }
      });
    }
  });
}
