import {test,expect,paste,prepareEditorSurface,closeTools} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

function fixture(){
  const raw=editorSpec(),d=raw.page.blocks[0].diagram;
  raw.page.protocols={https:{label:'Company API',color:'#123456'},mqtt:{label:'Event stream',color:'#a83d19'}};
  d.edges.push({from:'b',to:'c',kind:'mqtt'},{from:'b',to:'a',kind:'https',ret:true});
  d.layouts.push({...structuredClone(d.layouts[0]),id:'explore',name:'Explore',presentation:'explore'});
  return raw;
}
async function open(page,server,surface,raw){
  if(surface==='workbench'){
    await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await prepareEditorSurface(page);
    return page.locator('#docview');
  }
  if(surface==='native'){
    await writeFile(path.join(server.root,'legend-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
    await writeFile(path.join(server.root,'legend-native.html'),'<style>body{margin:0}#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./legend-native.js";window.mount=mountNativeViewer;</script>');
    await page.goto(server.origin+'/legend-native.html');await page.waitForFunction(()=>!!window.mount);
    await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw);},raw);
    return page.locator('#host');
  }
  const input=path.join(server.root,'legend.json'),output=path.join(server.root,'legend.html');await writeFile(input,JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.goto(server.origin+'/legend.html');return page.locator('#docview');
}

async function expectLegendWithin(legend,containerBounds){
  // Viewport/host resize acknowledgement can precede the navigation's
  // ResizeObserver callback. Retry the original bounds until that update arrives.
  await expect(async()=>{
    const container=await containerBounds(),bounds=await legend.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds.x).toBeGreaterThanOrEqual(container.x);
    expect(bounds.x+bounds.width).toBeLessThanOrEqual(container.x+container.width);
  }).toPass({timeout:10000});
}

for(const surface of ['standalone','workbench','native'])test(surface+' Explore exposes the same edge samples and restores Standard legend',async({page,server},info)=>{
  const raw=fixture(),root=await open(page,server,surface,raw),source=surface==='workbench'?await page.locator('#src').inputValue():null;
  const standard=root.locator('.explore-edge-legend .li'),expected=await standard.evaluateAll(nodes=>nodes.map(node=>node.outerHTML));
  expect(expected).toHaveLength(3);const original=await standard.first().elementHandle();
  await expect(root.locator('.explore-legend-menu')).toBeVisible();
  for(let round=0;round<2;round++){
    await root.getByRole('button',{name:'Explore',exact:true}).click();
    const summary=root.locator('.explore-legend-menu>summary'),legend=root.getByRole('group',{name:'Edge legend',exact:true});
    await expect(summary).toBeVisible();await expect(legend).toBeHidden();await summary.focus();await page.keyboard.press('Enter');
    await expect(legend).toBeVisible();expect(await legend.locator('.li').evaluateAll(nodes=>nodes.map(node=>node.outerHTML))).toEqual(expected);
    expect(await original.evaluate(node=>!!node.closest('.explore-edge-legend'))).toBe(true);
    await expect(legend).toContainText('Company API');await expect(legend).toContainText('Event stream');await expect(legend).toContainText('response / ack');
    await page.keyboard.press('Escape');await expect(legend).toBeHidden();await expect(summary).toBeFocused();
    await summary.click();await root.getByRole('button',{name:'Business',exact:true}).click();
    await expect(root.locator('.explore-legend-menu')).toBeVisible();
    expect(await standard.evaluateAll(nodes=>nodes.map(node=>node.outerHTML))).toEqual(expected);
  }
  await root.getByRole('button',{name:'Explore',exact:true}).click();
  if(surface==='workbench'){await closeTools(page);}
  if(surface==='native')await page.evaluate(()=>viewer.setCanvas(true));
  await page.setViewportSize({width:640,height:800});
  const summary=root.locator('.explore-legend-menu>summary');await summary.click();
  const legend=root.getByRole('group',{name:'Edge legend',exact:true});await expect(legend).toBeVisible();
  for(const width of [640,480,375,320]){
    await page.setViewportSize({width,height:800});
    await expectLegendWithin(legend,()=>({x:0,width}));
    for(const sample of await legend.locator('.li').all())await expect(sample).toBeInViewport();
  }
  if(surface==='native'){
    await page.setViewportSize({width:900,height:900});
    await root.evaluate(el=>Object.assign(el.style,{left:'36px',top:'24px',width:'360px',height:'700px',right:'auto',bottom:'auto'}));
    await expectLegendWithin(legend,()=>root.boundingBox());
  }
  await page.screenshot({path:info.outputPath('explore-edge-legend-'+surface+'.png')});
  if(source!==null){await expect(page.locator('#src')).toHaveValue(source);await expect(page.locator('#undo-builder')).toBeDisabled();}
  await original.dispose();
});

test('Explore omits an empty edge legend',async({page,server})=>{
  const raw=fixture(),d=raw.page.blocks[0].diagram;d.edges=[];d.steps=[];delete d.paths;delete raw.page.protocols;
  d.layouts.forEach(layout=>delete layout.steps);d.defaultLayout='explore';
  const root=await open(page,server,'standalone',raw);await expect(root.locator('.explore-stage')).toBeVisible();
  await expect(root.locator('.explore-legend-menu')).toBeVisible();
});
