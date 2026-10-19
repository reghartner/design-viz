// Desktop document authoring/readback checks. The depicted phone is fan content,
// not a mobile Workbench requirement.
import {chromium} from '../../../../tools/browser-tests/node_modules/@playwright/test/index.mjs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const browser=await chromium.launch();
try{
  for(const id of process.argv.slice(2).length?process.argv.slice(2):['group-night','fan-event-rsvp']){
    const spec=JSON.parse(await readFile(path.join(repo,'packages/sports/diagrams',id,id+'.spec.json'),'utf8')),d=spec.page.sections[0].diagram;
    for(const width of [1280,1440]){
      const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:8879/.local/'+id+'/preview.html?theme=islanders#embed='+id+'&sk=islanders');
      const fan=page.locator('[data-dv-panel="0"]'),record=page.locator('[data-dv-panel="1"]');
      await fan.locator('.appscreen-current').waitFor();
      const skip=page.getByRole('button',{name:'Skip tour',exact:true});if(await skip.isVisible())await skip.click();
      const settle=async()=>{await page.waitForFunction(()=>!document.querySelector('.appscreen-previous'));};
      const state=async(step)=>{
        await settle();
        for(const [panel,el]of [['destination',fan],['record',record]]){
          assert.equal(await el.locator('.appscreen-current').getAttribute('data-screen-id'),step.panels[panel].screen);
          assert.ok(await el.locator('.appscreen-current').evaluate(i=>i.complete&&i.naturalWidth>0));
          assert.ok(await el.isVisible());
        }
        assert.ok(await fan.locator('.appscreen-statusbar').isVisible());
        assert.match(await fan.locator('.appscreen-clock').innerText(),/9:41/);
        assert.equal(await fan.locator('.appscreen-glyphs svg').count(),2);
      };
      const next=page.getByRole('button',{name:'Next step',exact:true});
      for(const p of d.paths){
        await page.getByRole('button',{name:p.label,exact:true}).click();
        for(let i=0;i<p.steps.length;i++){
          const step=d.steps.find(s=>s.id===p.steps[i]);
          await state(step);
          if(['promo','content','handoff','next','reserved-no','followup-no','waitlist-followup'].includes(step.id)){
            await page.waitForTimeout(400);
            await page.evaluate(()=>window.scrollTo(0,0));
            await page.screenshot({path:path.join(repo,'.local',id,'native-'+p.id+'-'+step.id+'-'+width+'.png'),fullPage:true});
          }
          if(i<p.steps.length-1)await next.click();
        }
        await page.getByRole('button',{name:'Previous step',exact:true}).click();
        await state(d.steps.find(s=>s.id===p.steps.at(-2)));
      }
      await page.getByRole('button',{name:d.paths[0].label,exact:true}).click();
      await state(d.steps.find(s=>s.id===d.paths[0].steps[0]));
      assert.equal(await page.evaluate(()=>document.characterSet),'UTF-8');
      assert.ok(!/â†|â€™|â€œ|ï¿½|\uFFFD/.test(await page.locator('body').innerText()));
      assert.deepEqual(errors,[]);
      console.log(JSON.stringify({id,width,paths:d.paths.length,steps:d.steps.length,forwardBackwardAndReset:true,phoneBar:true,errors}));
      await page.close();
    }
  }
}finally{await browser.close();}
