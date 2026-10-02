import {chapterOptions} from '../helpers/test.mjs';
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

const named=async()=>JSON.parse(await readFile(path.join(repo,'src/starters/named-layouts.json'),'utf8'));

test('Explore keeps the graph through playback and Standard restores authored visibility',async({page,server})=>{
  const spec=await named();spec.page.sections[0].diagram.autoplay=false;spec.page.sections[0].diagram.defaultLayout='service-flow';
  const input=JSON.stringify(spec);await page.goto(server.origin+'/workbench.html');await paste(page,input);
  const section=page.locator('#docview .doc-sec').first(),board=section.locator('.explore-board');
  await expect(board).toBeVisible();
  await section.getByRole('button',{name:'AMBIENT',exact:true}).click();await expect(board).toBeVisible();
  await section.getByRole('button',{name:'STEP',exact:true}).click();await expect(board).toBeVisible();
  await section.getByRole('button',{name:'Home story',exact:true}).click();
  await expect(page.locator('body')).not.toHaveClass(/workspace-diagram/);await expect(board).toBeHidden();
  await expect(section.locator('.board')).toBeHidden();await expect(page.locator('#src')).toHaveValue(input);
});

test('legacy Data flow and saved layout remain curated until their View type changes',async({page,server})=>{
  const spec=await named(),d=spec.page.sections[0].diagram;
  d.sectionLayout=d.layouts[0].sectionLayout;delete d.layouts;delete d.defaultLayout;d.autoplay=false;
  const input=JSON.stringify(spec);await page.goto(server.origin+'/workbench.html');await paste(page,input);await prepareEditorSurface(page);
  const section=page.locator('#docview .doc-sec').first();
  await section.getByRole('button',{name:'Data flow',exact:true}).click();
  await expect(section.locator('.board')).toBeVisible();await expect(section.locator('.explore-stage')).toBeHidden();
  await section.getByRole('button',{name:'Layout',exact:true}).click();
  await expect(section.locator('.board')).toBeHidden();await expect(page.locator('#src')).toHaveValue(input);
  await chapterOptions(page,section);await section.getByRole('combobox',{name:'Viewing mode',exact:true}).selectOption('explore');
  await expect(section.locator('.explore-board')).toBeVisible();await expect(page.locator('body')).toHaveClass(/workspace-diagram/);
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

test('reader canvas follows same-view hash navigation and diagram button target',async({page,server})=>{
  const spec=await named(),first=spec.page.sections[0];first.id='story0';first.heading='Story 0';
  first.diagram.defaultLayout='service-flow';first.diagram.autoplay=false;
  const second=structuredClone(first);second.id='story1';second.heading='Story 1';spec.page.sections=[first,second];
  const input=path.join(server.root,'canvas-navigation.json'),output=path.join(server.root,'canvas-navigation.html');
  await writeFile(input,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.goto(server.origin+'/canvas-navigation.html#d=story0&v=service-flow');
  await expect(page.locator('.explore-active-section .sec-h')).toHaveText('Story 0');
  await page.evaluate(()=>{location.hash='d=story1&v=service-flow';});
  await expect(page.locator('.explore-active-section .sec-h')).toHaveText('Story 1');
  await page.getByRole('button',{name:'Story 0',exact:true}).click();
  await expect(page.locator('.explore-active-section .sec-h')).toHaveText('Story 0');
  await expect.poll(()=>new URLSearchParams(new URL(page.url()).hash.slice(1)).get('d')).toBe('story0');
  await page.locator('#section-story0').getByRole('button',{name:'Home story',exact:true}).click();
  await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);
  await page.locator('#section-story0').getByRole('button',{name:'Service flow',exact:true}).click();
  await expect(page.locator('body')).toHaveClass(/viewer-exploring/);
});


test('a later default Explore story opens full-window without a step or deep link',async({page,server})=>{
  const spec=await named(),story=spec.page.sections[0];story.id='front-door';delete story.diagram.steps;delete story.diagram.paths;story.diagram.defaultLayout='service-flow';
  spec.page.sections.unshift({id:'other',heading:'Other',diagram:{nodes:{a:{title:'Other'}},rows:[['a']]}});
  const input=path.join(server.root,'implicit-canvas.json'),output=path.join(server.root,'implicit-canvas.html');
  await writeFile(input,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.goto(server.origin+'/implicit-canvas.html#tour=0');
  await expect(page.locator('body')).toHaveClass(/viewer-exploring/);
  await expect(page.locator('#section-front-door')).toHaveClass(/explore-active-section/);
  const shell=await page.locator('#section-front-door .viewer-diagram-canvas').boundingBox(),box=await page.locator('#section-front-door .explore-board').boundingBox(),nav=await page.locator('#section-front-door .explore-navigation').boundingBox();
  expect(shell).toEqual({x:0,y:0,width:page.viewportSize().width,height:page.viewportSize().height});
  expect(box.x).toBeGreaterThanOrEqual(shell.x);expect(box.x+box.width).toBeLessThanOrEqual(shell.x+shell.width);
  expect(box.y).toBeGreaterThanOrEqual(nav.y+nav.height);expect(box.y+box.height).toBeLessThanOrEqual(shell.y+shell.height);expect(box.height).toBeGreaterThan(300);
});
