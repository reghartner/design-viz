import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const block=(title,span=6)=>({title,span,fields:[{k:'event_id',v:title,g:'The **stable** identity of this event.'},{k:'status',v:'accepted',g:'Available after receipt.',revealAt:1}],note:'Use `event_id` when joining records.'});
const section={heading:'Wire contracts',contract:block('Existing'),contracts:[{...block('Reply'),id:'reply'},{...block('Failure',12),id:'failure'}],diagram:{nodes:{a:{title:'Doorbell'},b:{title:'Cloud'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],steps:[{id:'send',edge:'a->b',text:'Send the request.'},{id:'reply',edge:'a->b',text:'Receive an acknowledgment.'}],view:'step',autoplay:false}};
const raw={page:{title:'Doorbell contracts',skin:'pastel',blocks:[section]}};
const source=JSON.stringify(raw,null,2);
async function bounds(root){const boxes=await root.locator('.ctcard').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,overflow:el.scrollWidth>el.clientWidth+1};}));return boxes;}
async function expectTwoWide(root){const [a,b,c]=await bounds(root);expect(Math.abs(a.y-b.y)).toBeLessThan(2);expect(b.x).toBeGreaterThan(a.x+a.w);expect(c.y).toBeGreaterThan(a.y+a.h);expect(c.w).toBeGreaterThan(a.w*1.9);expect([a,b,c].some(x=>x.overflow)).toBe(false);}

test('contract blocks edit independently, resize, duplicate, reorder and undo in the workbench',async({page,server},testInfo)=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,source);
 const root=page.locator('#docview'),guide=page.locator('#guide');
 await expect(root.locator('.ctcard')).toHaveCount(3);await expectTwoWide(root);
 await root.locator('[data-dv-contract="0"] .ctrow').first().click();
 await guide.getByLabel('v',{exact:true}).fill('Only the reply');await guide.getByLabel('v',{exact:true}).press('Tab');
 await expect(root.locator('[data-dv-contract="0"] .ctv').first()).toHaveText('Only the reply');
 await expect(root.locator('[data-dv-contract="legacy"] .ctv').first()).toHaveText('Existing');
 await guide.getByRole('button',{name:'Edit contract block',exact:true}).click();
 await guide.getByRole('combobox',{name:'Contract block width'}).selectOption('Full width');
 const stacked=await bounds(root);expect(stacked[1].y).toBeGreaterThan(stacked[0].y+stacked[0].h);
 await page.locator('#undo-builder').click();await expectTwoWide(root);
 await page.locator('#redo-builder').click();expect((await bounds(root))[1].y).toBeGreaterThan((await bounds(root))[0].y);
 await root.locator('[data-dv-contract="0"] .cttitle>span').click();
 await guide.getByRole('button',{name:'Duplicate block',exact:true}).click();await expect(root.locator('.ctcard')).toHaveCount(4);
 await expect(guide.getByLabel('title',{exact:true})).toHaveValue('Reply (copy)');
 await guide.getByRole('button',{name:'↑ Move earlier',exact:true}).click();
 await expect(guide.getByLabel('title',{exact:true})).toHaveValue('Reply (copy)');
 await guide.getByRole('button',{name:'+ Add field',exact:true}).click();await expect(guide.getByLabel('k',{exact:true})).toHaveValue('field1');
 await guide.getByRole('button',{name:'Edit contract block',exact:true}).click();
 await guide.getByRole('button',{name:'Delete block',exact:true}).click();await expect(root.locator('.ctcard')).toHaveCount(3);
 await page.locator('#undo-builder').click();await expect(root.locator('.ctcard')).toHaveCount(4);
 await testInfo.attach('contract-blocks-editor',{body:await page.screenshot(),contentType:'image/png'});
});

test('multi-selection keeps equal row indexes in different cards distinct',async({page,server})=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,source);
 const root=page.locator('#docview'),guide=page.locator('#guide');
 const legacy=root.locator('[data-dv-contract="legacy"] .ctrow').first(),reply=root.locator('[data-dv-contract="0"] .ctrow').first();
 await reply.click();await legacy.click({modifiers:['Shift']});await expect(guide).toContainText('2 crows selected');
 await legacy.click({modifiers:['Shift']});await expect(guide.getByLabel('v',{exact:true})).toHaveValue('Reply');
 await legacy.click({modifiers:['Shift']});await guide.getByRole('button',{name:/delete 2/}).click();
 const sec=JSON.parse(await page.locator('#src').inputValue()).page.blocks[0];
 expect(sec.contract.fields.map(f=>f.k)).toEqual(['status']);expect(sec.contracts[0].fields.map(f=>f.k)).toEqual(['status']);expect(sec.contracts[1].fields).toHaveLength(2);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(source);
});

test('Add contract block works in a prose-only tabbed section and preserves the old single card',async({page,server})=>{
 const small={page:{blocks:[{tabs:[{label:'Text',sections:[{heading:'Notes',contract:block('Existing',12)}]}]}]}};
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(small,null,2));
 await page.locator('#diagram-add').click();await page.locator('.diagram-add-structure summary').click();
 await page.locator('#add-contract').click();
 await expect(page.locator('#docview .ctcard')).toHaveCount(2);
 await expect(page.locator('#guide').getByLabel('title',{exact:true})).toHaveValue('New contract');
 await page.locator('#guide').getByRole('button',{name:'All contract blocks',exact:true}).click();
 await page.locator('#guide').getByRole('button',{name:'+ Add contract block',exact:true}).click();
 await expect(page.locator('#docview .ctcard')).toHaveCount(3);
 const edited=JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].tabs[0].sections[0];
 expect(edited.contract).toEqual(small.page.blocks[0].tabs[0].sections[0].contract);expect(edited.contracts).toHaveLength(2);
});

test('standalone contract links target the correct block and rows; narrow embeds stack the cards',async({page,server},testInfo)=>{
 await writeFile(path.join(server.root,'contracts.json'),source);
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,'contracts.json'),path.join(repo,'template/flowview.html'),path.join(server.root,'contracts.html')]);
 await page.goto(server.origin+'/contracts.html#d=wire-contracts&m=step&s=reply&c=wire-contracts&ct=reply&r=2');
 const root=page.locator('.docview');await expectTwoWide(root);
 await expect(root.locator('[data-contract-ref=reply] .ctrow').nth(1)).toHaveClass(/dv-hash-target/);
 await expect(root.locator('[data-contract-ref=legacy] .ctrow.dv-hash-target')).toHaveCount(0);
 await page.evaluate(()=>{window.copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copied.push(text)},configurable:true});});
 await root.locator('[data-contract-ref=failure] .contractcopy').click();
 await expect.poll(()=>page.evaluate(()=>window.copied.at(-1))).toContain('ct=failure');
 await expect.poll(()=>page.evaluate(()=>window.copied.at(-1))).not.toContain('r=2');
 await page.goto(server.origin+'/contracts.html#c=wire-contracts&r=1');
 await expect(root.locator('[data-contract-ref=legacy] .ctrow').first()).toHaveClass(/dv-hash-target/);
 await testInfo.attach('contract-blocks-wide',{body:await page.screenshot(),contentType:'image/png'});
 await page.setViewportSize({width:760,height:1000});
 const boxes=await bounds(root);expect(boxes[1].y).toBeGreaterThan(boxes[0].y+boxes[0].h);expect(boxes[2].y).toBeGreaterThan(boxes[1].y+boxes[1].h);
 for(const box of boxes)expect(box.overflow).toBe(false);
});

test('native Backstage contract grid follows the host width, not the outer viewport',async({page,server})=>{
 await writeFile(path.join(server.root,'contracts-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'contracts-native.html'),'<div id="host" style="width:1100px"></div><script type="module">import {mountNativeViewer} from "./contracts-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/contracts-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(raw=>window.viewer=mount(document.querySelector('#host'),raw),raw);
 const root=page.locator('#host');await expectTwoWide(root);
 await root.evaluate(el=>el.style.width='650px');
 await expect.poll(async()=>{const b=await bounds(root);return b[1].y>b[0].y+b[0].h;}).toBe(true);
 await page.evaluate(()=>viewer.destroy());await expect(root).toBeEmpty();
});
