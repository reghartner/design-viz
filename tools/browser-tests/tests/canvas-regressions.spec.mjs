import {test,expect,paste,pagePreview} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

const named=async()=>JSON.parse(await readFile(path.join(repo,'src/starters/named-layouts.json'),'utf8'));

test('canvas keeps the graph through playback changes and restores authored visibility on Page preview',async({page,server})=>{
  const spec=await named();spec.page.sections[0].diagram.autoplay=false;
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec));
  const section=page.locator('#docview .workspace-active-section'),board=section.locator('.explore-board');
  await expect(board).toBeVisible();
  await section.getByRole('button',{name:'AMBIENT',exact:true}).click();await expect(board).toBeVisible();
  await section.getByRole('button',{name:'STEP',exact:true}).click();await expect(board).toBeVisible();
  await section.getByRole('button',{name:'Service flow',exact:true}).click();
  await section.getByRole('button',{name:'Home story',exact:true}).click();await expect(board).toBeVisible();
  await pagePreview(page);await expect(page.locator('#docview .board').first()).toBeHidden();
});

test('legacy Data flow keeps an active canvas and can return to its authored layout',async({page,server})=>{
  const spec=await named(),d=spec.page.sections[0].diagram;
  d.sectionLayout=d.layouts[0].sectionLayout;delete d.layouts;delete d.defaultLayout;d.autoplay=false;
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec));
  const section=page.locator('#docview .workspace-active-section');
  await section.getByRole('button',{name:'Data flow',exact:true}).click();
  await expect(section.locator('.explore-board')).toBeVisible();
  await expect(section.locator('.explore-stage')).toBeVisible();
  await section.getByRole('button',{name:'Layout',exact:true}).click();
  await expect(section.locator('.explore-board')).toBeVisible();
});

test('keyboard focus raises an overlapping tool window',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(await named()));
  await page.locator('#editor-tab-json').click();await page.locator('#editor-tab-inspect').click();
  await page.locator('#workspace-window-inspect .workspace-window-resize').focus();await page.keyboard.press('Tab');
  await expect(page.getByRole('button',{name:'Move JSON source panel',exact:true})).toBeFocused();
  expect(await page.locator('#workspace-window-json').evaluate(el=>{
    const r=el.querySelector('.workspace-window-grip').getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
  })).toBe(true);
});

test('reader canvas follows same-view hash navigation and writes the story dropdown target',async({page,server})=>{
  const spec=await named(),first=spec.page.sections[0];first.id='story0';first.heading='Story 0';
  first.diagram.defaultLayout='service-flow';first.diagram.autoplay=false;
  const second=structuredClone(first);second.id='story1';second.heading='Story 1';spec.page.sections=[first,second];
  const input=path.join(server.root,'canvas-navigation.json'),output=path.join(server.root,'canvas-navigation.html');
  await writeFile(input,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.goto(server.origin+'/canvas-navigation.html#d=story0&v=service-flow');
  await expect(page.locator('.explore-active-section .sec-h')).toHaveText('Story 0');
  await page.evaluate(()=>{location.hash='d=story1&v=service-flow';});
  await expect(page.locator('.explore-active-section .sec-h')).toHaveText('Story 1');
  await page.getByRole('combobox',{name:'Explore story',exact:true}).selectOption('1');
  await expect(page.locator('.explore-active-section .sec-h')).toHaveText('Story 0');
  await expect.poll(()=>new URLSearchParams(new URL(page.url()).hash.slice(1)).get('d')).toBe('story0');
  await page.getByRole('button',{name:'Back to page',exact:true}).click();
  await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);
  await page.locator('#section-story0').getByRole('button',{name:'STEP',exact:true}).click();
  await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);
});
