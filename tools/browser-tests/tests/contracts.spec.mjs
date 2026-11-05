import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,pastePage as paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const block=(title,span=6)=>({title,span,fields:[{k:'event_id',v:title,g:'The **stable** identity of this event.'},{k:'status',v:'accepted',g:'Available after receipt.',revealAt:1}],note:'Use `event_id` when joining records.'});
const section={heading:'Wire contracts',contract:block('Existing'),contracts:[{...block('Reply'),id:'reply'},{...block('Failure',12),id:'failure'}],diagram:{nodes:{a:{title:'Doorbell'},b:{title:'Cloud'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],steps:[{id:'send',edge:'a->b',text:'Send the request.'},{id:'reply',edge:'a->b',text:'Receive an acknowledgment.'}],view:'step',autoplay:false}};
const raw={page:{title:'Doorbell contracts',skin:'pastel',blocks:[section]}};
const source=JSON.stringify(raw,null,2);
async function bounds(root){const boxes=await root.locator('.ctcard').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,overflow:el.scrollWidth>el.clientWidth+1};}));return boxes;}
async function expectTwoWide(root){const [a,b,c]=await bounds(root);expect(Math.abs(a.y-b.y)).toBeLessThan(2);expect(b.x).toBeGreaterThan(a.x+a.w);expect(c.y).toBeGreaterThan(a.y+a.h);expect(c.w).toBeGreaterThan(a.w*1.9);expect([a,b,c].some(x=>x.overflow)).toBe(false);}

test('contract blocks edit independently, resize, duplicate, reorder and undo in the workbench',async({page,server},testInfo)=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,source);
 // Reserve canvas space while repeatedly editing and selecting contract cards.
 await page.getByRole('button',{name:'Dock Inspect panel',exact:true}).click();
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
 // Reserve canvas space while repeatedly editing and selecting contract cards.
 await page.getByRole('button',{name:'Dock Inspect panel',exact:true}).click();
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

test('contract text edits the addressed block and row in place with one Undo',async({page,server})=>{
 await page.setViewportSize({width:1440,height:950});
 await page.addInitScript(()=>{window.__contractCopies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.__contractCopies.push(text)}});});
 const doc=structuredClone(raw);delete doc.page.blocks[0].contract;const chosen=doc.page.blocks[0].contracts[1];delete chosen.title;chosen.source=server.origin+'/contract-source.html';chosen.fields[0].link=server.origin+'/field-source.html';
 await writeFile(path.join(server.root,'contract-source.html'),'Contract source');await writeFile(path.join(server.root,'field-source.html'),'Field source');
 const original=JSON.stringify(doc,null,2);await page.goto(server.origin+'/workbench.html');await paste(page,original);
 await page.getByRole('button',{name:'Dock Inspect panel',exact:true}).click();
 const root=page.locator('#docview'),card=root.locator('[data-dv-contract="1"]'),row=card.locator('.ctrow').first(),src=page.locator('#src'),guide=page.locator('#guide'),undo=page.locator('#undo-builder'),redo=page.locator('#redo-builder');
 const title=card.locator('.cttitle > span'),key=row.locator('.ctkey'),value=row.locator('.ctv'),meaning=row.locator('.ctg'),note=card.locator('.ctnote');
 const input=name=>page.getByRole('textbox',{name,exact:true});
 await title.click();await expect(guide.getByLabel('title',{exact:true})).toHaveValue('');await expect(input('Contract title')).toHaveCount(0);
 await row.click();await expect(guide.getByLabel('k',{exact:true})).toHaveValue('event_id');await expect(input('Contract field name')).toHaveCount(0);
 const sourceLink=card.locator('.srcchip'),fieldLink=row.locator('.ctlink');
 for(const link of [sourceLink,fieldLink]){const popup=page.waitForEvent('popup');await link.click();const opened=await popup;await opened.close();await expect(page.locator('.dv-inline-editor')).toHaveCount(0);}
 await card.locator('.contractcopy').click();await expect.poll(()=>page.evaluate(()=>window.__contractCopies.length)).toBeGreaterThan(0);await expect(page.locator('.dv-inline-editor')).toHaveCount(0);await expect(src).toHaveValue(original);
 await row.click();const inspectValue=guide.getByLabel('v',{exact:true});await inspectValue.fill('');await inspectValue.press('Enter');const cleared=await src.inputValue();
 await undo.click();await expect(src).toHaveValue(original);
 const entries=[
  [title,'Contract title','Renamed contract','title',false],
  [key,'Contract field name','message_key','k',false],
  [value,'Contract value','response value','v',false],
  [meaning,'Contract meaning','Meaning **changed**','g',true],
  [note,'Contract note','Note with `code`','note',true]
 ];
 for(const [surface,label,next,field,markdown] of entries){
  const before=await src.inputValue(),expected=JSON.parse(before);if(field==='title' || field==='note')expected.page.blocks[0].contracts[1][field]=next;else expected.page.blocks[0].contracts[1].fields[0][field]=next;
  await surface.dblclick();const edit=input(label);await expect(edit).toBeFocused();if(field==='title')await expect(edit).toHaveValue('');
  await edit.fill(next);await edit.press(markdown?'ControlOrMeta+Enter':'Enter');await expect(edit).toHaveCount(0);const saved=await src.inputValue();expect(JSON.parse(saved)).toEqual(expected);
  if(field==='g')await expect(meaning.locator('strong')).toHaveText('changed');else if(field==='note')await expect(note.locator('code')).toHaveText('code');else await expect(surface).toContainText(next);
  await undo.click();await expect(src).toHaveValue(before);await redo.click();await expect(src).toHaveValue(saved);
 }
 const before=await src.inputValue();await key.dblclick();await input('Contract field name').fill('   ');await input('Contract field name').press('Enter');await expect(page.locator('.dv-inline-editor [role=status]')).toHaveText('a contract row needs k — the field name');await expect(src).toHaveValue(before);await input('Contract field name').press('Escape');
 await value.dblclick();await input('Contract value').fill('discarded');await input('Contract value').press('Escape');await expect(src).toHaveValue(before);
 // Revert the five edits to compare the same source with Inspect's empty-value result.
 for(let i=0;i<5;i++)await undo.click();await expect(src).toHaveValue(original);
 await value.dblclick();await input('Contract value').fill('');await input('Contract value').press('Enter');await expect(src).toHaveValue(cleared);await undo.click();await expect(src).toHaveValue(original);
 await meaning.dblclick();await input('Contract meaning').fill('A line');await input('Contract meaning').press('Enter');await input('Contract meaning').pressSequentially('second');await expect(input('Contract meaning')).toHaveValue('A line\nsecond');await title.click();expect(JSON.parse(await src.inputValue()).page.blocks[0].contracts[1].fields[0].g).toBe('A line\nsecond');await undo.click();await expect(src).toHaveValue(original);
 await note.dblclick();await input('Contract note').fill('stale draft');await src.evaluate(el=>{el.value+=' ';el.dispatchEvent(new Event('input',{bubbles:true}));});await expect(input('Contract note')).toHaveCount(0);await expect(src).toHaveValue(original+' ');
});
