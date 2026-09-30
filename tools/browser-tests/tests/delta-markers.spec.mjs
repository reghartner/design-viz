import {readFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test, expect, openInspectorGroup, paste, closeTools, inspectPageElement, trackResources, resources} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const raw = JSON.parse(await readFile(path.join(repo, 'examples/delta-markers/delta-markers.spec.json')));
const diagram = value => value.page.sections[0].diagram;
async function standalone(page, server){
  const spec = structuredClone(raw);
  diagram(spec).nodes.device.deltaLinks = [{label:'Design decision',url:server.origin+'/decision.html'}];
  diagram(spec).nodes.cloud.deltaText = '<img src=x onerror=alert(1)>\n**Changed** *behavior* with `id`.\n```json\n{"safe": "<script>"}\n```';
  diagram(spec).steps[2].delta = true;
  await writeFile(path.join(server.root,'decision.html'), '<p>Decision destination</p>');
  await writeFile(path.join(server.root,'deltas.json'), JSON.stringify(spec));
  execFileSync('python3', [path.join(repo,'tools/inject.py'),path.join(server.root,'deltas.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'deltas.html')]);
  await page.goto(server.origin+'/deltas.html');
}

test('delta details support notes, multiple links, keyboard and independent step navigation across skins', async({page, context, server}, testInfo) => {
  await standalone(page,server);
  const root = page.locator('.docview'), marker = root.locator('[data-dv-node="device"] .dvdelta');
  const pop = root.getByRole('dialog',{name:'Change details for Doorbell'});
  await expect(root.locator('[data-dv-node="app"] .dvdelta')).not.toHaveAttribute('tabindex');
  const passiveStep = root.locator('.delta-chip-wrap:has([data-step-source="2"])');
  await expect(passiveStep.getByRole('img',{name:'Changed · ready'})).not.toHaveAttribute('tabindex');
  await expect(passiveStep.getByRole('button')).toHaveCount(1);
  for (const skin of ['pastel','aurora','daylight','editorial','terminal','blueprint']){
    await page.evaluate(skin => window.dvSetSkin(skin), skin);
    await marker.click(); await expect(pop).toBeVisible();
    await expect(pop).toContainText('acknowledges a recording request');
    await page.screenshot({path:testInfo.outputPath('delta-'+skin+'.png')});
    await page.keyboard.press('Escape'); await expect(pop).toBeHidden(); await expect(marker).toBeFocused();
  }
  await marker.press('Enter');
  const opened = context.waitForEvent('page'); await pop.getByRole('link',{name:'Design decision'}).click();
  const destination = await opened; await expect(destination.locator('p')).toHaveText('Decision destination'); await destination.close();
  await page.keyboard.press('Escape');
  await root.locator('[data-dv-node="cloud"] .dvdelta').click();
  const note = root.getByRole('dialog',{name:'Change details for Recording'});
  await expect(note.locator('img')).toHaveCount(0); await expect(note).toContainText('<img src=x onerror=alert(1)>');
  await expect(note.locator('.delta-popover-text strong')).toHaveText('Changed');
  await expect(note.locator('.delta-popover-text em')).toHaveText('behavior');
  await expect(note.locator('pre code')).toHaveText('{"safe": "<script>"}\n');
  await expect(note.locator('script')).toHaveCount(0);
  await note.getByRole('button',{name:'Close change details'}).click();
  await root.getByRole('button',{name:'Change details for acknowledge',exact:true}).click();
  await expect(root.getByRole('dialog',{name:'Change details for acknowledge'}).getByRole('link')).toHaveCount(2);
  await page.keyboard.press('Escape');
  const current = root.locator('.schip[aria-current="true"]'); const before = await current.getAttribute('data-step-source');
  await root.locator('.delta-chip-wrap:has([data-step-source="1"]) .dvdelta').click();
  await expect(root.getByRole('dialog',{name:'Change details for ack'})).toBeVisible();
  await expect(current).toHaveAttribute('data-step-source',before);
  await page.keyboard.press('Escape');
  await root.locator('.delta-chip-wrap:has([data-step-source="0"]) .dvdelta').press('Space');
  await expect(root.getByRole('dialog',{name:'Change details for prepare'})).toBeVisible();
  await root.getByRole('button',{name:'Δ ONLY',exact:true}).click();
  await expect(root.locator('.delta-popover:visible')).toHaveCount(0);
  await expect(marker).toHaveCSS('opacity','1');
  await page.setViewportSize({width:420,height:850});
  await marker.click(); await expect(pop).toBeVisible();
  const box = await pop.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(420);
  await page.screenshot({path:testInfo.outputPath('delta-narrow.png')});
  await page.keyboard.press('Escape');
  // The decorative SVG overlaps this corner but must not swallow navigation.
  const passiveChip = passiveStep.locator('.schip'), chipBox = await passiveChip.boundingBox();
  await passiveChip.click({position:{x:chipBox.width-4,y:4}});
  await expect(current).toHaveAttribute('data-step-source','2');
  await expect(root.locator('.delta-popover:visible')).toHaveCount(0);
});

test('inspector authors delta notes and links with exact Undo/Redo and rejects unsafe URLs', async({page,server}) => {
  const spec = structuredClone(raw); delete diagram(spec).nodes.device.deltaText; delete diagram(spec).nodes.device.deltaLinks;
  const source = JSON.stringify(spec,null,2);
  await page.goto(server.origin+'/workbench.html'); await paste(page,source);
  await inspectPageElement(page,page.locator('[data-dv-node="device"]'));
  const guide = page.locator('#guide'), src = page.locator('#src');
  await openInspectorGroup(guide.locator('.delta-details-editor'));
  await guide.getByLabel('Delta note',{exact:true}).fill('A new acknowledgement.'); await guide.getByLabel('Delta note',{exact:true}).press('Tab');
  const edited = await src.inputValue(); expect(diagram(JSON.parse(edited)).nodes.device.deltaText).toBe('A new acknowledgement.');
  await page.locator('#undo-builder').click(); await expect(src).toHaveValue(source);
  await page.locator('#redo-builder').click(); await expect(src).toHaveValue(edited);
  await inspectPageElement(page,page.locator('[data-dv-node="device"]'));
  await openInspectorGroup(guide.locator('.delta-details-editor'));
  await guide.getByLabel('Add delta link',{exact:true}).fill('javascript:alert(1)'); await guide.getByLabel('Add delta link',{exact:true}).press('Enter');
  await expect(src).toHaveValue(edited); await expect(guide).toContainText('Use a full https://');
  await guide.getByLabel('Add delta link',{exact:true}).fill(server.origin+'/decision'); await guide.getByLabel('Add delta link',{exact:true}).press('Enter');
  await expect(guide.getByLabel('Link URL',{exact:true})).toHaveValue(server.origin+'/decision');
  await guide.getByLabel('Link label',{exact:true}).fill('Read the decision'); await guide.getByLabel('Link label',{exact:true}).press('Enter');
  await closeTools(page);
  await page.locator('[data-dv-node="device"] .dvdelta').click();
  await expect(page.getByRole('dialog',{name:'Change details for Doorbell'}).getByRole('link',{name:'Read the decision'})).toHaveAttribute('href',server.origin+'/decision');
});

test('native delta menus retire across path replacement and destroy without affecting a sibling viewer', async({page,server}) => {
  await page.addInitScript(trackResources);
  const spec = structuredClone(raw), d = diagram(spec);
  spec.page.sections[0].id = 'changes';
  d.paths = [{id:'all',label:'Full story',steps:['prepare','ack','ready']},{id:'quick',label:'Quick',steps:['prepare','ready']}];
  const sectionLayout = {default:[{x:0,y:0,w:12,h:20},{controls:'steps',attachTo:'diagram',x:0,y:20,w:12,h:8}]};
  d.layouts = [{id:'full',name:'Full',sectionLayout},{id:'brief',name:'Brief',steps:['prepare','ready'],sectionLayout}]; d.defaultLayout = 'full';
  await writeFile(path.join(server.root,'delta-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'delta-native.html'),'<div id="left"></div><div id="right"></div><script type="module">import {mountNativeViewer} from "./delta-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/delta-native.html'); await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(spec=>{window.rightViewer=window.mount(document.querySelector('#right'),spec);},spec);
  await page.evaluate(()=>document.fonts.ready);
  await expect.poll(async()=> (await resources(page)).timers).toBe(0);
  const siblingResources = await resources(page);
  await page.evaluate(spec=>{window.leftViewer=window.mount(document.querySelector('#left'),spec);},spec);
  const left = page.locator('#left'), right = page.locator('#right');
  await left.locator('.coin .dvdelta-action').click();
  await expect(left.locator('.delta-popover:visible')).toHaveCount(1);
  await page.evaluate(()=>window.leftViewer.navigate({section:'changes',view:'brief'}));
  await expect(left.locator('.delta-popover:visible')).toHaveCount(0);
  await page.evaluate(()=>window.leftViewer.navigate({section:'changes',view:'full'}));
  await left.locator('[data-dv-node="device"] .dvdelta').click();
  await expect(left.locator('.delta-popover:visible')).toHaveCount(1); await expect(right.locator('.delta-popover:visible')).toHaveCount(0);
  await page.evaluate(()=>window.leftViewer.navigate({section:'changes',path:'quick'}));
  await expect(left.locator('.delta-popover:visible')).toHaveCount(0);
  await left.locator('[data-dv-node="device"] .dvdelta').click();
  await page.evaluate(()=>window.leftViewer.destroy());
  await expect(left.locator('.delta-popover')).toHaveCount(0);
  await expect.poll(()=>resources(page)).toEqual(siblingResources);
  await right.locator('[data-dv-node="device"] .dvdelta').click();
  await expect(right.locator('.delta-popover:visible')).toHaveCount(1);
  await page.keyboard.press('Escape'); await expect(right.locator('[data-dv-node="device"] .dvdelta')).toBeFocused();
});

test('larger delta markers stay clear of neighboring step numbers on a diagonal connection', async({page,server}) => {
  const d = {view:'step',autoplay:false,nodes:{a:{title:'A'},b:{title:'B'}},rows:[[]],
    floats:[{id:'a',x:150,y:450},{id:'b',x:550,y:100}],edges:[{from:'a',to:'b'}],
    steps:Array.from({length:3},(_,i)=>({id:'step'+i,edge:'a->b',text:'Step '+i,delta:true,deltaText:'Change '+i}))};
  await writeFile(path.join(server.root,'diagonal.json'),JSON.stringify({page:{title:'Diagonal changes',sections:[{diagram:d}]}}));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'diagonal.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'diagonal.html')]);
  await page.goto(server.origin+'/diagonal.html');
  const overlap = await page.locator('.boardcanvas>svg').evaluate(svg => {
    const coins = [...svg.querySelectorAll('.coin')];
    return coins.flatMap((coin,i) => {
      const marker = coin.querySelector('.dvdelta-hit').getBoundingClientRect();
      return coins.flatMap((other,j) => {
        if (i === j) return [];
        const number = other.querySelector('circle').getBoundingClientRect();
        const distance = Math.hypot(marker.x+marker.width/2-number.x-number.width/2,marker.y+marker.height/2-number.y-number.height/2);
        return distance < (marker.width+number.width)/2 ? [{marker:i,number:j}] : [];
      });
    });
  });
  expect(overlap).toEqual([]);
  const current = page.locator('.schip[aria-current="true"]');
  await page.locator('.coin[data-dv-step="1"] .dvdelta').click();
  await expect(page.getByRole('dialog',{name:'Change details for step1'})).toBeVisible();
  await expect(current).toHaveAttribute('data-step-source','0');
});
