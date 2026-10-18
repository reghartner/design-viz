import {createRequire} from 'node:module';
import {test,expect,pastePage,closeTools,arrangeChapter,inspectPageElement} from '../helpers/test.mjs';
const {migrate}=createRequire(import.meta.url)('../../migrate-panel-views.cjs');
const fixture=()=>({page:{title:'Explicit panel Views',sections:[{id:'story',heading:'Door story',diagram:{view:'step',autoplay:false,nodes:{camera:{title:'Camera'},cloud:{title:'Cloud'}},rows:[['camera','cloud']],edges:[{from:'camera',to:'cloud'}],steps:[{id:'one',text:'Detect visitor',nodes:['camera']},{id:'two',text:'Upload clip',edge:'camera->cloud'},{id:'retry',text:'Retry upload',nodes:['camera']}],paths:[{id:'happy',label:'Happy',steps:['one','two']},{id:'retry',label:'Retry',steps:['one','retry']} ]}}]}});
const nav=page=>page.locator('#docview > .explore-navigation');
const section=page=>page.locator('#docview .doc-sec').first();
const source=page=>page.locator('#src');
async function single(page){await expect(nav(page).locator('.reader-top-view')).toHaveCount(1);await expect(nav(page).getByRole('tab',{name:'Standard',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.locator('.secondary-flow,[data-view-focus]')).toHaveCount(0);}
async function reloadJSON(page){const text=await source(page).inputValue();await page.locator('#file-input').setInputFiles({name:'reload.json',mimeType:'application/json',buffer:Buffer.from(text)});await closeTools(page);return text;}
test('adding and removing panels and saving Arrange never manufactures a View',async({page,server},info)=>{
 await page.goto(server.origin+'/workbench.html');await pastePage(page,JSON.stringify(fixture()));await single(page);
 for(const type of ['homemap','data-contract','homemap']){
  await page.locator('#diagram-add').click();await page.locator('#add-panel').click();await page.locator('#panel-picker-search').fill(type);await page.locator('.panel-picker-card[data-panel-type="'+type+'"]').click();await page.locator('#panel-picker-add').click();await closeTools(page);await single(page);
 }
 await page.screenshot({path:'/tmp/explicit-panels-standard.png',fullPage:true});
 const added=await source(page).inputValue(),d=JSON.parse(added).page.sections[0].diagram;expect(d.panels).toHaveLength(3);expect(d.layouts).toBeUndefined();
 await page.locator('#undo-builder').click();await single(page);await page.locator('#redo-builder').click();await expect(source(page)).toHaveValue(added);await single(page);
 await inspectPageElement(page,section(page).locator('.pt-homemap .ptitle').last());await expect(page.locator('#guide').getByText('Centerpiece',{exact:true})).toHaveCount(0);
 await page.keyboard.press('Escape');await closeTools(page);await arrangeChapter(page,section(page));
 await page.getByRole('button',{name:'Optimize layout',exact:true}).click();await single(page);
 await reloadJSON(page);await single(page);const saved=JSON.parse(await source(page).inputValue());expect(saved.page.views).toBeUndefined();expect(saved.page.sections[0].diagram.layouts).toBeUndefined();
 await info.attach('Single Standard with panels',{body:await page.screenshot(),contentType:'image/png'});
});
test('migrated Views share live playback and preserve path, Undo and JSON reload',async({page,server},info)=>{
 const raw=fixture(),d=raw.page.sections[0].diagram;d.primaryPanel='home';d.panels=[{id:'home',type:'homemap',title:'Home',devices:[{id:'camera',kind:'camera',x:80,y:60}],rooms:[],subjects:[]}];
 const migrated=migrate(raw).spec;await page.emulateMedia({reducedMotion:'no-preference'});await page.goto(server.origin+'/workbench.html');await pastePage(page,JSON.stringify(migrated,null,2));await closeTools(page);
 await expect(nav(page).locator('.reader-top-view')).toHaveCount(2);await expect(section(page)).toHaveAttribute('data-view-id','home');await expect(section(page).locator('.board')).toBeHidden();await expect(section(page).locator('.pt-homemap')).toBeVisible();
 await page.screenshot({path:'/tmp/explicit-panels-home.png',fullPage:true});
 await section(page).getByRole('button',{name:'Play',exact:true}).click();await nav(page).getByRole('tab',{name:'Data flow',exact:true}).click();await expect(section(page).locator('.termbar')).toHaveAttribute('data-playback','playing');await section(page).getByRole('button',{name:'Pause',exact:true}).click();
 await nav(page).getByRole('tab',{name:'Data flow',exact:true}).click();await expect(section(page).locator('.board')).toBeVisible();

 await section(page).getByRole('button',{name:'Next step',exact:true}).click();
 await expect(section(page).locator('.stepline:not([aria-hidden=true])')).toContainText('Upload clip');
 await section(page).getByRole('button',{name:'Go to step 2 on Retry',exact:true}).click();await expect(section(page).locator('.stepline:not([aria-hidden=true])')).toContainText('Retry upload');
 await nav(page).getByRole('tab',{name:'Home',exact:true}).click();await expect(section(page).locator('.stepline:not([aria-hidden=true])')).toContainText('Retry upload');
 await nav(page).getByRole('tab',{name:'Data flow',exact:true}).click();await expect(section(page).locator('.stepline:not([aria-hidden=true])')).toContainText('Retry upload');
 const before=await source(page).inputValue();await section(page).locator('[data-dv-node="camera"]').click();await page.locator('#editor-tab-inspect').click();const title=page.locator('#guide').getByLabel('Name',{exact:true});await title.fill('Front camera');await title.press('Enter');
 await page.locator('#undo-builder').click();await expect(source(page)).toHaveValue(before);await expect(section(page)).toHaveAttribute('data-view-id','flow');await page.locator('#redo-builder').click();
 await reloadJSON(page);await expect(nav(page).locator('.reader-top-view')).toHaveCount(2);await nav(page).getByRole('tab',{name:'Data flow',exact:true}).click();
 await page.screenshot({path:'/tmp/explicit-panels-flow.png',fullPage:true});await info.attach('Explicit Data flow',{body:await page.screenshot(),contentType:'image/png'});
});
