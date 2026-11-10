/* #1305 (follow-up to #622): the closed-Contents rail counts document pages, the same list
   as the "‹ Page n of m ›" pager: one marker per section in each View of each Tab.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| Q1 | The rail has one marker per document page, numbered 1..m in pager order; its count reads "n/m" and the current marker is n, on every page reached with Next; a detail-only section is never a marker. | pages(): a page section that opens a detail-only section, a Tab with two Views (2 + 1 sections), a one-section Tab; 1440×900, Contents closed | marker count = m = 5; texts 1..5; per page: aria-current marker index = n-1 and .reader-rail-count = "n/m" | one marker per Tab or per section of the current View |
| Q2 | Clicking marker k lands on "Page k of m" in that page's View, Contents stays closed (#681). | same | pager text, selected View, toggle aria-expanded=false, rail visible | markers that go to a Tab's first page, or pin Contents |
| Q3 | Keyboard: markers are reachable in order with Tab; Enter and Space navigate and focus stays on the marker. | same | focus order 1..5; Enter on 4 → "Page 4 of 5"; Space on 5 → "Page 5 of 5" | mouse-only markers |
| Q4 | 40 pages: the rail scrolls, the current marker stays inside the list when paging, markers keep a 24 px hit target. | one Tab, 10 prose sections × 4 Views | 40 markers; list scrolls; after Next to page 40 marker 40 lies inside the list box; every marker box ≥ 24×24 | an unscrollable rail; a current marker off-list; tiny markers |
*/
import {test,expect} from '../helpers/test.mjs';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

const prose=(id,heading)=>({id,heading,text:heading+' prose.'});
function pages(){
  // The introduction opens a detail-only section: it is never a document page (#1305 reviewer minor).
  const intro={id:'intro',heading:'Introduction',diagram:{nodes:{a:{title:'Gateway',detail:{section:'hidden',mode:'focus'}},b:{title:'Store'}},rows:[['a','b']],edges:[{from:'a',to:'b'}]}};
  const hidden={id:'hidden',heading:'Detail only page',detailOnly:true,diagram:{nodes:{c:{title:'Inner'}},rows:[['c']]}};
  return {page:{title:'Rail pages',sections:[intro,hidden,{tabs:[
    {label:'Alpha',defaultView:'one',views:[{id:'one',name:'View one',presentation:'standard',sections:['a1','a2']},{id:'two',name:'View two',presentation:'standard',sections:['a2']}],sections:[prose('a1','Alpha one'),prose('a2','Alpha two')]},
    {label:'Beta',sections:[prose('b1','Beta one')]}]}]}};
}
async function openRaw(page,server,raw,name){
  const input=path.join(server.root,name+'.json'),output=path.join(server.root,name+'.html');await writeFile(input,JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);await page.goto(server.origin+'/'+name+'.html');return page.locator('#docview');
}
const railOf=root=>root.locator('.reader-rail'),marksOf=root=>railOf(root).locator('.reader-rail-mark');
async function closeContents(root){const toggle=root.locator('.reader-top>button');if(await toggle.getAttribute('aria-expanded')==='true')await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(railOf(root)).toBeVisible();}
async function pageNumbers(root){const text=(await root.locator('.reader-page-label').textContent()).trim(),m=/^Page (\d+) of (\d+)$/.exec(text);return {n:+m[1],m:+m[2]};}
async function expectRailMatchesPager(root){
  const {n,m}=await pageNumbers(root);
  await expect(marksOf(root)).toHaveCount(m);
  await expect(railOf(root).locator('.reader-rail-count')).toHaveText(n+'/'+m);
  await expect(marksOf(root).nth(n-1)).toHaveAttribute('aria-current','page');await expect(railOf(root).locator('[aria-current="page"]')).toHaveCount(1);
  return {n,m};
}

test('Q1 Q2 the rail has one marker per document page, matches "Page n of m" on every page, and a marker click lands on its page without pinning',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});
  const root=await openRaw(page,server,pages(),'rail-pages'),label=root.locator('.reader-page-label');
  await expect(label).toHaveText(/^Page \d+ of 5$/);await closeContents(root);
  await expect(marksOf(root)).toHaveText(['1','2','3','4','5']);
  expect(await marksOf(root).evaluateAll(els=>els.some(el=>/Detail only page/.test(el.getAttribute('aria-label')))),'the detail-only section is not a page').toBe(false);
  const previous=root.getByRole('button',{name:'Previous page',exact:true}),next=root.getByRole('button',{name:'Next page',exact:true});
  while(!(await previous.isDisabled()))await previous.click();
  await expect(label).toHaveText('Page 1 of 5');await expectRailMatchesPager(root);
  for(let n=2;n<=5;n++){await next.click();await expect(label).toHaveText('Page '+n+' of 5');await expectRailMatchesPager(root);}
  const views={3:'View one',4:'View two'};
  for(const k of [4,1,3,5]){
    await marksOf(root).nth(k-1).click();await expect(label).toHaveText('Page '+k+' of 5');await expectRailMatchesPager(root);
    if(views[k])await expect(root.locator('.reader-view-strip [aria-selected="true"]')).toContainText(views[k]);
    await expect(root.locator('.reader-top>button')).toHaveAttribute('aria-expanded','false');await expect(railOf(root)).toBeVisible();
  }
});

test('Q3 rail markers are keyboard reachable in page order; Enter and Space navigate',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});
  const root=await openRaw(page,server,pages(),'rail-pages-keys'),label=root.locator('.reader-page-label');
  await closeContents(root);await marksOf(root).first().focus();
  for(let i=1;i<5;i++){await page.keyboard.press('Tab');await expect(marksOf(root).nth(i)).toBeFocused();}
  await marksOf(root).nth(3).focus();await page.keyboard.press('Enter');await expect(label).toHaveText('Page 4 of 5');await expect(marksOf(root).nth(3)).toBeFocused();
  await marksOf(root).nth(4).focus();await page.keyboard.press('Space');await expect(label).toHaveText('Page 5 of 5');await expect(marksOf(root).nth(4)).toBeFocused();
  await expectRailMatchesPager(root);
});

test('Q4 forty pages: the rail scrolls, keeps the current marker in view while paging, and markers keep a 24 px target',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});
  const ids=Array.from({length:10},(_,i)=>'s'+(i+1));
  const views=[1,2,3,4].map(v=>({id:'v'+v,name:'View '+v,presentation:'standard',sections:ids}));
  const raw={page:{title:'Forty pages',sections:[{tabs:[{label:'Long',defaultView:'v1',views,sections:ids.map((id,i)=>prose(id,'Section '+(i+1)))}]}]}};
  const root=await openRaw(page,server,raw,'rail-pages-forty'),label=root.locator('.reader-page-label');
  await expect(label).toHaveText('Page 1 of 40');await closeContents(root);
  await expect(marksOf(root)).toHaveCount(40);
  const list=root.locator('.reader-rail-list');expect(await list.evaluate(el=>el.scrollHeight>el.clientHeight),'the rail list scrolls').toBe(true);
  const sizes=await marksOf(root).evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return Math.min(r.width,r.height);}));
  expect(Math.min(...sizes),'every marker keeps a 24 px hit target').toBeGreaterThanOrEqual(24);
  const next=root.getByRole('button',{name:'Next page',exact:true});
  for(let n=2;n<=40;n++)await next.click();
  await expect(label).toHaveText('Page 40 of 40');await expectRailMatchesPager(root);
  await expect.poll(async()=>{const box=await list.boundingBox(),mark=await marksOf(root).nth(39).boundingBox();return mark.y>=box.y-1 && mark.y+mark.height<=box.y+box.height+1;},{message:'the current marker is scrolled into the list'}).toBe(true);
});
