// Isolated desktop QA; never opens the user's internal browser.
import {chromium,expect} from '../../../../tools/browser-tests/node_modules/@playwright/test/index.mjs';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {projectSource,useProjectDownloads} from '../../../../tools/browser-tests/helpers/project-export.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../../..');
const id='islanders-marketing',file=path.join(here,id+'.spec.json');
const spec=JSON.parse(await readFile(file,'utf8')),tabs=spec.page.blocks[0].tabs;
const base=process.env.FLOWVIEW_PREVIEW_ORIGIN||'http://127.0.0.1:8879';
const url=base+'/workbench/flowspec.html',out=path.join(repo,'.local',id);
await mkdir(out,{recursive:true});
const browser=await chromium.launch(),errors=[];
const watch=page=>page.on('pageerror',e=>errors.push(e.message));
const skipTour=async page=>{const skip=page.getByRole('button',{name:'Skip tour',exact:true});if(await skip.isVisible())await skip.click();};
try{
  for(const width of process.argv.includes('--import-only')?[]:[1280,1440]){
    const page=await browser.newPage({viewport:{width,height:1100}});watch(page);
    await page.goto(url+'?diagram='+id+'&theme=islanders');
    await page.locator('.appscreen-clock:visible').waitFor();await skipTour(page);
    const select=async sectionId=>{
      const target=page.locator('.reader-tree-section[data-reader-section="'+sectionId+'"]');
      if(!await target.isVisible())await page.locator('.reader-contents-toggle').click();
      await target.click();
      const section=page.locator('#section-'+sectionId);await expect(section).toBeVisible();
      assert.equal(await page.locator('.doc-sec:visible').count(),1);
      return section;
    };
    for(const tab of tabs){
      const {id:sectionId,diagram:d}=tab.sections[0],section=await select(sectionId);
      const state=async step=>{
        await expect(section.locator('.appscreen-previous')).toHaveCount(0);
        for(const [index,panelId]of ['destination','record'].entries()){
          const panel=section.locator('[data-dv-panel="'+index+'"]');
          await expect(panel).toBeVisible();
          await expect(panel.locator('.appscreen-current')).toHaveAttribute('data-screen-id',step.panels[panelId].screen);
          assert.ok(await panel.locator('.appscreen-current').evaluate(i=>i.complete&&i.naturalWidth>0));
        }
        await expect(section.locator('.appscreen-statusbar')).toBeVisible();
        await expect(section.locator('.appscreen-clock')).toHaveText('9:41');
      };
      for(const p of d.paths){
        await section.getByRole('button',{name:p.label,exact:true}).click();
        for(let i=0;i<p.steps.length;i++){
          await state(d.steps.find(s=>s.id===p.steps[i]));
          if(i<p.steps.length-1)await section.getByRole('button',{name:'Next step',exact:true}).click();
        }
        await section.getByRole('button',{name:'Previous step',exact:true}).click();
        await state(d.steps.find(s=>s.id===p.steps.at(-2)));
      }
      await section.getByRole('button',{name:d.paths[0].label,exact:true}).click();
      await state(d.steps.find(s=>s.id===d.paths[0].steps[0]));
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:path.join(out,sectionId+'-'+width+'.png'),fullPage:true});
      console.log(JSON.stringify({sectionId,width,paths:d.paths.length,steps:d.steps.length,forwardBackwardReset:true,phoneBar:true}));
    }
    // Returning must not carry another story's screen or path into this tab.
    for(const tab of tabs){
      const {id:sectionId,diagram:d}=tab.sections[0],section=await select(sectionId);
      const step=d.steps.find(s=>s.id===d.paths[0].steps[0]);
      for(const [index,panelId]of ['destination','record'].entries())await expect(section.locator('[data-dv-panel="'+index+'"] .appscreen-current')).toHaveAttribute('data-screen-id',step.panels[panelId].screen);
    }
    const decoded=await page.evaluate(async tabs=>{
      let count=0;
      for(const t of tabs)for(const panel of t.sections[0].diagram.panels)for(const screen of panel.screens){
        const img=new Image();img.src=screen.src;await img.decode();
        if(img.naturalWidth!==screen.width||img.naturalHeight!==screen.height)throw Error('Screen dimension mismatch: '+screen.id);
        count++;
      }
      return count;
    },tabs);assert.equal(decoded,48);
    assert.equal(await page.evaluate(()=>document.characterSet),'UTF-8');
    assert.ok(!/â†|â€™|â€œ|ï¿½|\uFFFD/.test(await page.locator('body').innerText()));
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:1440,height:1100}});watch(page);
  await page.goto(url+'?theme=islanders');await page.locator('#welcome-library').click();
  await expect(page.locator('.canon-library-card')).toHaveCount(6);
  for(const old of ['member-campaign','group-night','fan-event-rsvp'])await expect(page.locator('.canon-library-card[data-id="'+old+'"]')).toHaveCount(0);
  const card=page.locator('.canon-library-card[data-id="'+id+'"]');
  await expect(card).toBeVisible();
  const preview=card.locator('.canon-library-preview img');await expect(preview).toBeVisible();
  await expect.poll(()=>preview.evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);
  await card.locator('.canon-library-open').click();
  await page.locator('.appscreen-clock:visible').waitFor();await skipTour(page);
  await page.locator('#canon-reader-edit').click();await page.locator('#diagram-add').waitFor();
  assert.deepEqual(JSON.parse(await page.locator('#src').inputValue()).page.blocks,spec.page.blocks);
  await page.screenshot({path:path.join(out,'workbench.png'),fullPage:true});
  await page.close();
  // Fresh context: opening a file must not overwrite an existing user draft.
  const imported=await browser.newPage({viewport:{width:1440,height:1100}});watch(imported);
  await useProjectDownloads({page:imported});
  await imported.goto(url+'?theme=islanders');await imported.locator('#welcome-file').setInputFiles(file);
  await imported.locator('#diagram-add').waitFor();
  assert.deepEqual(JSON.parse(await imported.locator('#src').inputValue()),spec);
  const download=imported.waitForEvent('download');
  await imported.locator('#workspace-export-trigger').click();await imported.locator('#file-save').click();
  const saved=await projectSource(await download);
  assert.deepEqual(JSON.parse(saved).page.blocks,spec.page.blocks);
  await imported.close();
  // Large embedded-media documents can exceed localStorage's baseline/draft
  // quota. Reopen the explicit saved file in a fresh context, not from cache.
  const reopened=await browser.newPage({viewport:{width:1440,height:1100}});watch(reopened);
  await reopened.goto(url+'?theme=islanders');
  await reopened.locator('#welcome-file').setInputFiles({name:id+'.spec.json',mimeType:'application/json',buffer:Buffer.from(saved)});
  await reopened.locator('#diagram-add').waitFor();
  assert.deepEqual(JSON.parse(await reopened.locator('#src').inputValue()).page.blocks,spec.page.blocks);
  await reopened.close();
  assert.deepEqual(errors,[]);
  console.log(process.argv.includes('--import-only')?'PASS: Canon retirement/edit, file import and explicit export/reopen; no browser errors.':'PASS: three tabs, eight paths at two desktop sizes, 48 images, tab isolation, Canon retirement/edit, file import and explicit export/reopen; no browser errors.');
}finally{await browser.close();}
