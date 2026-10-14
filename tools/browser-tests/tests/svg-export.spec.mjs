import {test,expect,pastePage} from '../helpers/test.mjs';
import {readFile} from 'node:fs/promises';

const raw={page:{title:'SVG Export',skin:'pastel',sections:[
  {heading:'First section',diagram:{nodes:{first:{title:'First Node',icon:'cloud'}},rows:[['first']],edges:[]}},
  {heading:'Second / section',diagram:{view:'step',nodes:{second:{title:'Second Node',icon:'db'},done:{title:'Done',icon:'shield'}},rows:[['second','done']],edges:[{from:'second',to:'done',kind:'https'}],steps:[{id:'sent',edge:'second->done',text:'Sent'}]}}
]}};
const source=JSON.stringify(raw,null,2);

const fidelityRaw={page:{title:'SVG fidelity',protocols:{signal:{label:'Signal',color:{aurora:'#E05DCC',daylight:'#176B87'}}},sections:[
  {heading:'Theme sample',diagram:{nodes:{sender:{title:'Sender',icon:'cloud',locked:true},receiver:{title:'Receiver',icon:'db'}},rows:[['sender','receiver']],edges:[{from:'sender',to:'receiver',kind:'signal'}]}}
]}};

async function menu(page,id){await page.locator('#workspace-export-trigger').click();await page.locator('#'+id).click();}

async function graphPaint(page,rootSelector='.boardcanvas > svg',cardSelector='.card'){
  return page.locator(rootSelector).first().evaluate((svg,cardSelector)=>{
    const value=(selector,name)=>getComputedStyle(svg.querySelector(selector)).getPropertyValue(name).trim();
    const edge=svg.querySelector('.edge.main'),marker=value('.edge.main','marker-end');
    const markerId=(marker.match(/#([^)'"\s]+)/)||[])[1]||'';
    return {
      ground:value('.dv-board-ground','fill'),cardFill:value(cardSelector,'fill'),cardStroke:value(cardSelector,'stroke'),
      edgeStroke:value('.edge.main','stroke'),markerFill:value('marker .dv-protocol-fill','fill'),textFill:value('.t1','fill'),
      markerResolved:Boolean(markerId && svg.querySelector('#'+CSS.escape(markerId)))
    };
  },cardSelector);
}

test('Download SVG exports only the selected live graph and opens independently',async({page,server},info)=>{
  await page.goto(server.origin+'/workbench.html');await pastePage(page,source);
  const node=page.locator('#docview [data-dv-node="second"]');await node.click();
  await page.locator('#docview [data-dv-step="0"]').click();
  const before=await page.locator('#src').inputValue(),classes=await node.getAttribute('class');
  const download=page.waitForEvent('download');await menu(page,'file-export-svg');const file=await download;
  expect(file.suggestedFilename()).toBe('svg-export-second-section.svg');
  const svg=await readFile(await file.path(),'utf8');
  expect(svg).toContain('SVG Export — Second / section diagram');expect(svg).toContain('Second Node');expect(svg).not.toContain('First Node');
  expect(svg).toMatch(/<symbol[^>]+id="dvx-\d+"/);expect(svg).toMatch(/<use[^>]+href="#dvx-\d+"/);
  expect(svg).toMatch(/style="[^"]*(?:fill|stroke|font-family):/);expect(svg).not.toMatch(/\bdv-sel\b|data-dv-|<script|<animate|\bpkt\b|(?:href|src)="https?:/i);
  expect(svg).not.toMatch(/aria-(?:haspopup|keyshortcuts|description)=|title="Row nodes/i);
  const ids=new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
  for(const match of svg.matchAll(/(?:href="#|url\(#)([^)"\s]+)/g))expect(ids.has(match[1]),'resolved #'+match[1]).toBe(true);
  await expect(page.locator('#src')).toHaveValue(before);await expect(node).toHaveAttribute('class',classes);
  const reader=await page.context().newPage();await reader.goto('data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'));
  await expect(reader.locator('svg')).toBeVisible();await expect(reader.getByText('Second Node')).toBeVisible();
  await info.attach('standalone-diagram-svg',{body:await reader.screenshot(),contentType:'image/png'});await reader.close();
  const extra=[];page.on('download',item=>extra.push(item));await node.locator('xpath=ancestor::*[contains(@class,"board")][1]').evaluate(board=>board.hidden=true);
  await menu(page,'file-export-svg');await expect(page.locator('#guide')).toContainText('hidden or unavailable');expect(extra).toHaveLength(0);
});

test('standalone SVG preserves meaningful live paint across Aurora, Daylight, and Pastel',async({page,server},info)=>{
  await page.goto(server.origin+'/workbench.html');
  for(const [index,skin] of ['aurora','daylight','pastel'].entries()){
    const text=JSON.stringify({...fidelityRaw,page:{...fidelityRaw.page,skin}},null,2);
    if(index===0)await pastePage(page,text);
    else{await page.locator('#editor-tab-json').click();await page.locator('#src').fill(text);await page.locator('#go').click();await expect(page.locator('#src')).toHaveValue(text);}
    await page.locator('[data-dv-node="sender"]').click();
    const before=await graphPaint(page,'.boardcanvas > svg','[data-dv-node="receiver"] .card'),sourceBefore=await page.locator('#src').inputValue();
    expect(before.markerResolved).toBe(true);
    const download=page.waitForEvent('download');await menu(page,'file-export-svg');const file=await download;
    const svg=await readFile(await file.path(),'utf8'),reader=await page.context().newPage();
    expect(svg).not.toMatch(/dv-sel|dv-position-locked|Position locked|data-dv-/);
    await reader.goto('data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'));
    const reopened=await graphPaint(reader,'svg','.card');
    expect(reopened).toEqual(before);
    await expect(page.locator('#src')).toHaveValue(sourceBefore);
    await info.attach('standalone-'+skin+'-svg',{body:await reader.screenshot(),contentType:'image/png'});
    await reader.close();
  }
});

test('Copy SVG uses image/svg+xml and falls back to selectable text on denial',async({page,server})=>{
  await page.addInitScript(()=>{
    window.__svgCopies=[];
    class Item{constructor(values){this.values=values;this.types=Object.keys(values);}}
    Object.defineProperty(window,'ClipboardItem',{value:Item,configurable:true});
    Object.defineProperty(navigator,'clipboard',{value:{write:async items=>{const item=items[0],blob=item.values['image/svg+xml'];window.__svgCopies.push({types:item.types,text:await blob.text()});}},configurable:true});
  });
  await page.goto(server.origin+'/workbench.html');await pastePage(page,source);await page.locator('#docview [data-dv-node="second"]').click();
  await menu(page,'file-copy-svg');await expect.poll(()=>page.evaluate(()=>window.__svgCopies.length)).toBe(1);
  const copied=await page.evaluate(()=>window.__svgCopies[0]);expect(copied.types).toEqual(['image/svg+xml']);expect(copied.text).toContain('Second Node');
  await expect(page.locator('#guide')).toContainText('Copied diagram-only SVG');
  await page.evaluate(()=>{navigator.clipboard.write=async()=>{throw Error('Denied');};document.execCommand=()=>false;});
  await menu(page,'file-copy-svg');const fallback=page.locator('#svg-handoff');await expect(fallback).toBeVisible();
  await expect(page.locator('#svg-copy-status')).toContainText('selected below');await expect(page.locator('#svg-copy-text')).toHaveValue(/<svg/);
  const selected=await page.locator('#svg-copy-text').evaluate(el=>el.selectionStart===0 && el.selectionEnd===el.value.length);expect(selected).toBe(true);
  await page.locator('#workspace-home').evaluate(el=>el.click());await page.locator('#welcome-new').evaluate(el=>el.click());
  await page.getByRole('button',{name:/Blank diagram/}).evaluate(el=>el.click());
  await expect(fallback).toBeHidden();await expect(page.locator('#svg-copy-text')).toHaveValue('');await expect(page.locator('#svg-copy-status')).toHaveText('');
});

test('SVG export refuses a valid stale render but labels the retained preview for invalid source',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await pastePage(page,source);await page.locator('#docview [data-dv-node="second"]').click();
  const downloads=[];page.on('download',item=>downloads.push(item));await page.locator('#editor-tab-json').click();
  const changed=JSON.stringify({...raw,page:{...raw.page,title:'Changed'}},null,2);await page.locator('#src').fill(changed);await menu(page,'file-export-svg');
  await expect(page.locator('#guide')).toContainText('rendered preview is stale');expect(downloads).toHaveLength(0);
  await page.locator('#src').fill('{ invalid');await menu(page,'file-export-svg');await expect.poll(()=>downloads.length).toBe(1);
  expect(downloads[0].suggestedFilename()).toBe('svg-export-second-section.svg');
  await expect(page.locator('#guide')).toContainText('Current source is invalid; this is the last usable preview.');
  await expect(page.locator('#src')).toHaveValue('{ invalid');
});
