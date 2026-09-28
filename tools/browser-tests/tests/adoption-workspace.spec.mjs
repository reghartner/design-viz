import {test,expect,paste} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
const spec=()=>{const value=editorSpec();value.page.blocks[0].id='delivery';return value;};

test('workspace presets preserve authored story and short windows keep conversation input reachable',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');const original=JSON.stringify(spec());await paste(page,original);
  for(const mode of ['story','engineering','present']){await page.locator('#workspace-preset').selectOption(mode);await expect(page.locator('#src')).toHaveValue(original);}
  await expect(page.locator('.workspace-window:visible')).toHaveCount(0);
  await page.setViewportSize({width:640,height:360});await page.locator('#editor-tab-agent').click();
  const layout=await page.evaluate(()=>{
    const win=document.getElementById('workspace-window-agent').getBoundingClientRect();
    return {history:document.getElementById('folder-agent-history').clientHeight,controls:['folder-agent-input','folder-agent-send'].map(id=>{
      const node=document.getElementById(id),r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {inside:r.top>=win.top && r.bottom<=win.bottom,reachable:node===hit || node.contains(hit)};
    })};
  });
  expect(layout.history).toBeGreaterThan(30);expect(layout.controls).toEqual([{inside:true,reachable:true},{inside:true,reachable:true}]);
  await page.locator('#folder-agent-input').fill('Keep the outcome in focus');await expect(page.locator('#folder-agent-input')).toHaveValue('Keep the outcome in focus');
});

test('Brief links engineering evidence to a block story and exports the exact viewable draft',async({page,server},info)=>{
  await page.route('**/template/flowview.html',async route=>route.fulfill({contentType:'text/html',body:await readFile(path.join(repo,'template/flowview.html'),'utf8')}));
  await page.goto(server.origin+'/workbench.html');const original=JSON.stringify(spec());await paste(page,original);
  await page.locator('#workspace-prepare-review').click();const brief=page.locator('#editor-brief');await brief.getByText('Add engineering evidence',{exact:true}).click();
  await brief.locator('[name=storyTarget]').selectOption(JSON.stringify({kind:'node',sectionId:'delivery',id:'a'}));
  await brief.locator('[name=reference]').fill('src/delivery.ts:42');await brief.locator('[name=note]').fill('Retry behavior conflicts with the promised outcome');await brief.locator('[name=relationship]').selectOption('conflicts');
  await brief.getByRole('button',{name:'Attach evidence',exact:true}).click();await expect(brief).toContainText('Evidence attached');const enriched=await page.locator('#src').inputValue();
  expect(JSON.parse(enriched).page).toEqual(JSON.parse(original).page);expect(JSON.parse(enriched).storyBrief.evidence[0].storyTarget).toEqual({kind:'node',sectionId:'delivery',id:'a'});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(enriched);
  const download=page.waitForEvent('download');await brief.getByRole('button',{name:'Prepare engineering handoff',exact:true}).click();const file=await download,destination=info.outputPath('engineering-handoff.zip');await file.saveAs(destination);
  const result=JSON.parse(execFileSync('python3',['-c','import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps({"source":z.read("story.spec.json").decode(),"manifest":json.loads(z.read("sources.json")),"viewer":z.read("story.html").decode()}))',destination],{encoding:'utf8',maxBuffer:8*1024*1024}));
  expect(result.source).toBe(enriched);expect(result.manifest.publication).toBe('local-draft');expect(result.viewer).toContain('Retry behavior conflicts with the promised outcome');expect(result.manifest.references.some(item=>item.kind==='engineering-evidence')).toBe(true);
});

test('invalid authored graphs cannot be packaged as a successful viewable handoff',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');const value=spec();await paste(page,JSON.stringify(value));value.page.blocks[0].diagram.edges[0].to='missing';
  await page.locator('#file-input').setInputFiles({name:'invalid.spec.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  const downloads=[];page.on('download',event=>downloads.push(event));await page.locator('#workspace-prepare-review').click();await page.locator('#editor-brief').getByRole('button',{name:'Prepare engineering handoff',exact:true}).click();
  await expect(page.locator('.story-brief-status')).toContainText('Repair the story');await expect(page.locator('.story-brief-status')).toContainText('missing');expect(downloads).toHaveLength(0);
});
