import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const named=JSON.parse(await readFile(path.join(repo,'src/starters/named-layouts.json'),'utf8'));
named.page.sections[0].id='front-door';named.page.sections[0].diagram.autoplay=false;
async function build(server,spec,name='views'){
 const input=path.join(server.root,name+'.json'),output=path.join(server.root,name+'.html');
 await writeFile(input,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 return server.origin+'/'+name+'.html';
}
const selected=page=>page.locator('#section-front-door [data-view-layout][aria-pressed=true]');
const viewOf=page=>new URLSearchParams(new URL(page.url()).hash.slice(1)).get('v');

test('named links select host profile, view, alternate and visible step; copying and reload retain them',async({page,server})=>{
 await page.addInitScript(()=>{window.__copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied.push(text);}}});});
 const url=await build(server,named);
 await page.goto(url+'?layout=confluence#d=front-door&v=service-flow&m=step&p=offline&s=offline');
 const sec=page.locator('#section-front-door');
 await expect(selected(page)).toHaveAttribute('data-layout-id','service-flow');
 await expect(sec).toHaveAttribute('data-view-id','service-flow');
 await expect(sec.locator('.section-layout-grid')).toHaveAttribute('data-layout-target','confluence');
 await expect(sec.locator('.section-layout-tile[data-layout-key="panel:home"]')).toBeHidden();
 await expect(sec.locator('.board')).toBeVisible();await expect(sec.locator('.stepline')).toContainText('Internet service is down');
 await sec.getByRole('button',{name:'Copy link to this diagram step',exact:true}).click();
 const copy=await page.evaluate(()=>__copied.at(-1));expect(new URL(copy).search).toBe('?layout=confluence');expect(new URL(copy).hash).toContain('v=service-flow');expect(new URL(copy).hash).toContain('p=offline&s=offline');
 await sec.getByRole('button',{name:'Home story',exact:true}).click();expect(viewOf(page)).toBe('home-story');
 await expect(sec.locator('.board')).toBeHidden();await expect(sec.locator('.stepline')).toContainText('Internet service is down');
 await sec.locator('.embedcopy').click();const embed=await page.evaluate(()=>__copied.at(-1));expect(new URL(embed).hash).toBe('#embed=front-door&v=home-story');
 await page.reload();await expect(selected(page)).toHaveAttribute('data-layout-id','home-story');
 await page.goto(embed);await expect(page.locator('body')).toHaveClass(/dv-embed/);await expect(sec).toHaveAttribute('data-view-id','home-story');
 await expect(sec.locator('.board')).toBeHidden();
 await page.goto(copy);await expect(selected(page)).toHaveAttribute('data-layout-id','service-flow');
 await expect(sec.locator('.stepline')).toContainText('Internet service is down');
});

test('hash navigation restores named views without history-dependent filters or stale IDs',async({page,server})=>{
 const url=await build(server,named,'navigation-views');await page.goto(url+'#d=front-door&v=service-flow&m=step&s=upload');
 await expect(selected(page)).toHaveAttribute('data-layout-id','service-flow');
 await page.evaluate(()=>{location.hash='d=front-door&v=home-story&m=step&s=upload';});
 await expect(selected(page)).toHaveAttribute('data-layout-id','home-story');
 await expect(page.locator('#section-front-door .stepline')).toContainText('The resident is notified');
 await page.goBack();await expect(selected(page)).toHaveAttribute('data-layout-id','service-flow');await expect(page.locator('.stepline')).toContainText('hub uploads');
 await page.goForward();await expect(selected(page)).toHaveAttribute('data-layout-id','home-story');
 await page.evaluate(()=>{location.hash='d=front-door&v=deleted-view';});
 await expect(page.locator('#section-front-door')).toHaveAttribute('data-view-id','home-story');await expect.poll(()=>viewOf(page)).toBe('home-story');
 await page.evaluate(()=>{location.hash='d=front-door&v=service-flow';});await expect(selected(page)).toHaveAttribute('data-layout-id','service-flow');
 await page.evaluate(()=>{location.hash='d=front-door';});await expect(selected(page)).toHaveAttribute('data-layout-id','home-story');
});

test('legacy Home, Data flow and single-layout aliases work, while named IDs take precedence',async({page,server})=>{
 const spec=structuredClone(named),d=spec.page.sections[0].diagram;delete d.layouts;delete d.defaultLayout;
 const url=await build(server,spec,'legacy-views');
 await page.goto(url+'#d=front-door&v=flow&m=step&s=notify');await expect(page.locator('#section-front-door')).toHaveAttribute('data-view-id','flow');
 await expect(page.locator('[data-view-focus="flow"]')).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Home',exact:true}).click();await expect.poll(()=>viewOf(page)).toBe('home');
 await page.reload();await expect(page.locator('[data-view-focus="panel"]')).toHaveAttribute('aria-pressed','true');
 d.sectionLayout=named.page.sections[0].diagram.layouts[0].sectionLayout;
 const layoutURL=await build(server,spec,'legacy-layout');await page.goto(layoutURL+'#d=front-door&v=home');
 await expect(page.locator('#section-front-door')).toHaveAttribute('data-view-id','layout');expect(viewOf(page)).toBe('layout');
 await page.getByRole('button',{name:'Data flow',exact:true}).click();await expect.poll(()=>viewOf(page)).toBe('flow');await page.reload();
 await expect(page.locator('.section-layout-grid')).toBeHidden();await expect(page.locator('.board')).toBeVisible();
 const collision=structuredClone(named),cd=collision.page.sections[0].diagram;cd.layouts[1].id='home';
 const collisionURL=await build(server,collision,'named-home');await page.goto(collisionURL+'#d=front-door&v=home');
 await expect(selected(page)).toHaveText('Service flow');await expect(page.locator('.board')).toBeVisible();
});

test('view-only embeds target their section even without steps or when other sections come first',async({page,server})=>{
 const spec=structuredClone(named),d=spec.page.sections[0].diagram;delete d.steps;delete d.paths;d.layouts.forEach(v=>delete v.steps);
 spec.page.sections.unshift({id:'other',heading:'Other',diagram:{nodes:{a:{title:'Other'}},rows:[['a']]}});
 const url=await build(server,spec,'no-step-views');await page.goto(url+'#embed=front-door&v=service-flow');
 await expect(page.locator('#section-other')).toBeHidden();await expect(page.locator('#section-front-door')).toBeVisible();
 await expect(selected(page)).toHaveText('Service flow');await expect(page.locator('#section-front-door .board')).toBeVisible();
 expect(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('d')).toBe('front-door');
});
