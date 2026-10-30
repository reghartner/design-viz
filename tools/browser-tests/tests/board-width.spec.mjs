import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const repo=fileURLToPath(new URL('../../..',import.meta.url));
function widthSpec(skin,routing){return {page:{title:'Full-width diagram',skin,sections:[{heading:'Doorbell recording',diagram:{
  routing,view:'step',autoplay:false,
  nodes:Object.fromEntries(['a','b','c','d','e','f','g'].map((id,i)=>[id,{title:['Doorbell','Gateway','Recording','Storage','Events','Push','Phone'][i]}])),
  rows:[['a','b','c'],['d'],['e','f','g']],
  edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'d',label:'Store clip'},
    {from:'d',to:'e',label:'Publish event'},{from:'e',to:'f'},{from:'f',to:'g'}],
  steps:[{edge:'c->d',text:'Store the recording'},{edge:'d->e',text:'Publish the recording event'}],
}}]}};}

async function expectFullWidth(board){
  const dimensions=await board.locator('.boardcanvas>svg').evaluate(svg=>{
    const frame=svg.getBoundingClientRect();
    const cards=Array.from(svg.querySelectorAll('.node>.card'),el=>el.getBoundingClientRect());
    return {width:frame.width,left:Math.min(...cards.map(b=>b.left))-frame.left,
      right:frame.right-Math.max(...cards.map(b=>b.right)),
      clipped:Array.from(svg.querySelectorAll('.edge,.coin,.lbl'),el=>el.getBoundingClientRect())
        .some(b=>b.left<frame.left-1||b.right>frame.right+1)};
  });
  expect(Math.abs(dimensions.left-dimensions.right)).toBeLessThan(1);
  expect(dimensions.right/dimensions.width).toBeLessThan(.04);
  expect(dimensions.clipped,'connections, step coins and labels fit inside the SVG').toBe(false);
}

for(const skin of ['pastel','aurora'])for(const routing of ['curves','lanes']){
  test(`${skin} ${routing} rows fill Auto and Fit width in workbench and standalone`,async({page,server},testInfo)=>{
    const source=JSON.stringify(widthSpec(skin,routing));
    await page.goto(server.origin+'/workbench.html');await paste(page,source);await prepareEditorSurface(page);
    const board=page.locator('.board');
    await expectFullWidth(board);
    await board.getByRole('button',{name:'Fit width',exact:true}).click();await expectFullWidth(board);
    await expect(page.locator('#src')).toHaveValue(source);

    const input=path.join(server.root,'width.json');await writeFile(input,source);
    execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),path.join(server.root,'width.html')]);
    await page.goto(server.origin+'/width.html');await page.evaluate(()=>document.fonts.ready);
    await expectFullWidth(board);
    await board.getByRole('button',{name:'Fit width',exact:true}).click();await expectFullWidth(board);
    if(skin==='pastel'&&routing==='curves')await page.screenshot({path:testInfo.outputPath('full-width.png'),fullPage:true});
    await page.setViewportSize({width:800,height:900});await expectFullWidth(board);
    expect(await board.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test('native Backstage diagrams also use both sides of the fitted canvas',async({page,server})=>{
  await page.goto(server.origin+'/native/index.html');await page.waitForFunction(()=>!!window.__host);
  await page.evaluate(()=>__host.left(true));
  const board=page.locator('#alpha .board');
  await expectFullWidth(board);
  await board.getByRole('button',{name:'Fit width',exact:true}).click();await expectFullWidth(board);
});

test('Jira repaint preserves fitted framing when its cue stays inside a card',async({page,server})=>{
  const spec=widthSpec('aurora','curves');let originalFrame;
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec));
  for(const tracked of [false,true]){
    if(tracked){
      spec.page.sections[0].diagram.nodes.a.tickets=['UI-1'];
      await page.locator('#editor-tab-json').click();await page.locator('#src').fill(JSON.stringify(spec));await page.locator('#go').click();
    }
    await prepareEditorSurface(page);
    const board=page.locator('.board'),svg=board.locator('.boardcanvas>svg');
    await expectFullWidth(board);
    const frame=await svg.getAttribute('viewBox');
    if(!tracked)originalFrame=frame;else expect(frame).toBe(originalFrame);
    await expect(board.locator('.dv-jira-cue')).toHaveCount(tracked?1:0);
    expect(await svg.evaluate(el=>{
      const observer=new MutationObserver(()=>{});observer.observe(el,{attributes:true,attributeFilter:['viewBox']});
      for(let i=0;i<3;i++)el._refreshStatusFrame();
      const writes=observer.takeRecords().length;observer.disconnect();return writes;
    })).toBe(0);
    await expect(svg).toHaveAttribute('viewBox',frame);await expectFullWidth(board);
  }
});
