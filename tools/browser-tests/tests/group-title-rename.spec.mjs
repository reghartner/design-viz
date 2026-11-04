/* #962 group boundary title: right-click -> Rename (desktop Workbench, Standard). Contract: the
   ticket's "How it should look" and "Test + flip"; Chuck's coverage ruling 2026-11-04: the Test +
   flip section as written; Chuck's ruling for imported groups: Rename shows disabled with the
   reason "Imported structure belongs to its provider."

   Local fixture localFixture(): section 'Services'; group 'edge-tier' {title:'Edge tier',
   icon:'gear'} with members api and cache; group 'data' {title:'Data'} with member db. The
   boundary title is g.grp[data-dv-group=<key>] > text.grptitle; the editor is the textbox
   "Group title" in #docview. Right-clicks land in the boundary's title band (rect.grpbox, 12 SVG
   units below its top, 24 from its right edge), away from the title glyphs and member cards.

   row | fixture / input | scoped assertion | rejects
   P1 fixture discriminates | localFixture | edge-tier title reads 'Edge tier', data title 'Data',
      exactly two boundaries, no editor, #src === original | a fixture whose boundary shows its key
   1 Rename offered on a local group | right-click edge-tier box | "Object actions" menuitem
      'Rename' (exact) visible and not aria-disabled (FLIP: fails today, the menu has no Rename) |
      no item; an item disabled for local groups
   2 opens in place | click Rename | textbox "Group title" visible, focused, in the viewport,
      value 'Edge tier' (the source title, not the key), whole value selected, its box covers the
      boundary title's center; #src unchanged | an editor opened in Inspect or a dialog; an editor
      seeded with the key
   3 Enter saves the title only | type 'Ingress tier', Enter | editor gone; parsed #src equals
      the fixture with only groups['edge-tier'].title changed (key, icon, members' group fields,
      group 'data' unchanged); the edge-tier boundary title reads 'Ingress tier'; still exactly
      two boundaries | a save through key rename (planRenameGroup moves members); a write to the
      wrong object or field; a boundary not re-rendered
   4 one save = one Undo; Redo | #undo-builder, #redo-builder | Undo: #src === original exactly,
      title 'Edge tier', Undo disabled; Redo: #src === saved, title 'Ingress tier' | a save that
      records two history entries or none
   5 click outside saves | Rename, type 'Edge gateway', click the section heading | editor gone;
      parsed #src equals the fixture with only the title changed; title rendered; Undo restores
      the original exactly | a click-outside that discards the draft
   6 Escape writes nothing | Rename, End, type ' discarded', Escape | editor gone; #src ===
      original; title 'Edge tier' | an Escape that saves
   7 empty value = clearing Inspect -> title | Rename, Backspace on the selected value, Enter |
      parsed #src equals the fixture with groups['edge-tier'] = {icon:'gear'} (title removed;
      key, declaration and members kept: planSetGroupTitle's blank rule, which Inspect -> title
      uses); the boundary shows the key 'edge-tier'; Rename again holds the key ("How it should
      look"), Escape keeps that source; Undo restores the original | an editor saving "" as the
      title; one deleting the group declaration or its key
   8 imported group: Rename disabled with the reason | importFixtures(): consumer imports the
      provider export as 'shared' (group shared::platform 'Provider platform') and owns local
      group 'mine'; right-click the shared::platform box | menu "Reference actions for shared"
      has one menuitem starting 'Rename' with aria-disabled="true", title and <small> text
      "Imported structure belongs to its provider."; clicking it opens no "Group title" editor;
      #src unchanged after the menu closes (FLIP: fails today, no Rename item) | an enabled
      Rename that edits provider structure; a missing item; a disabled item without the reason
   8b contrast in the same consumer | right-click local 'mine' | "Object actions" 'Rename' not
      aria-disabled | a Rename disabled for every group in a consumer with imports
   excluded — §0 ruling ("the ticket's Test + flip section, as written"): Explore presentation,
      the Shift+F10 keyboard route and multi-selection menus, which the Test + flip section does
      not name. Group key rename stays in Inspect (unchanged by this ticket). */
import {test,expect,pastePage,closeTools,prepareEditorSurface} from '../helpers/test.mjs';
import {digest} from '../../canon/drift.mjs';

const localFixture=()=>({page:{title:'Group titles',sections:[{heading:'Services',diagram:{autoplay:false,
 nodes:{api:{title:'API',group:'edge-tier'},cache:{title:'Cache',group:'edge-tier'},db:{title:'Database',group:'data'}},
 groups:{'edge-tier':{title:'Edge tier',icon:'gear'},data:{title:'Data'}},
 rows:[['api','cache'],['db']],edges:[{from:'api',to:'cache'},{from:'cache',to:'db'}]}}]}});
function importFixtures(){
 const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{heading:'Groups',diagram}]}});
 const provider=spec('provider',{nodes:{a:{title:'API',group:'platform'},b:{title:'Store',group:'platform'}},groups:{platform:{title:'Provider platform'}},
  rows:[[]],floats:[{id:'a',x:100,y:100},{id:'b',x:350,y:100}],edges:[],topologyExports:{core:{nodes:['a','b'],edges:[]}}});
 const consumer=spec('consumer',{nodes:{local:{title:'Local',group:'mine'}},groups:{mine:{title:'Consumer group'}},
  rows:[[]],floats:[{id:'local',x:100,y:100}],topologyImports:[{spec:'provider',export:'core',as:'shared'}],autoplay:false});
 return {provider,consumer};
}
const group=(page,key)=>page.locator('#docview g.grp[data-dv-group="'+key+'"]');
const title=(page,key)=>group(page,key).locator(':scope > text.grptitle');
const editor=page=>page.locator('#docview').getByRole('textbox',{name:'Group title',exact:true});
const objectMenu=page=>page.getByRole('menu',{name:'Object actions'});
// Real right-click inside the boundary's title band, clear of the title glyphs and member cards.
async function rightClickGroup(page,key){
 const box=group(page,key).locator(':scope > rect.grpbox');await expect(box).toHaveCount(1);
 const r=await box.boundingBox(),s=r.width/Number(await box.getAttribute('width'));
 await box.click({button:'right',position:{x:r.width-24*s,y:12*s}});
}
async function rename(page,key){
 await rightClickGroup(page,key);const item=objectMenu(page).getByRole('menuitem',{name:'Rename',exact:true});
 await expect(item).toBeVisible();await expect(item).not.toHaveAttribute('aria-disabled','true');await item.click();
 const edit=editor(page);await expect(edit).toBeFocused();return edit;
}

test('local group boundary title renames in place from the object menu: Enter, click outside, Escape, empty value, one Undo',async({page,server})=>{
 await page.goto(server.origin+'/workbench.html');const original=JSON.stringify(localFixture(),null,2);await pastePage(page,original);await closeTools(page);
 const src=page.locator('#src'),undo=page.locator('#undo-builder'),redo=page.locator('#redo-builder'),edit=editor(page),heading=title(page,'edge-tier');
 const want=meta=>{const raw=localFixture();raw.page.sections[0].diagram.groups['edge-tier']=meta;return raw;};
 // P1: the fixture discriminates: two titled boundaries, no editor.
 await expect(page.locator('#docview g.grp[data-dv-group]')).toHaveCount(2);
 await expect(heading).toHaveText('Edge tier');await expect(title(page,'data')).toHaveText('Data');
 await expect(edit).toHaveCount(0);await expect(src).toHaveValue(original);
 // Rows 1-2 (flip): right-click -> Rename opens a single-line editor over the boundary title.
 const spot=await heading.boundingBox();await rename(page,'edge-tier');
 await expect(edit).toBeVisible();await expect(edit).toBeInViewport();await expect(edit).toHaveValue('Edge tier');
 expect(await edit.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([0,'Edge tier'.length]);
 const box=await edit.boundingBox(),cx=spot.x+spot.width/2,cy=spot.y+spot.height/2;
 expect(box.x<=cx && cx<=box.x+box.width && box.y<=cy && cy<=box.y+box.height,'the editor covers the boundary title').toBe(true);
 await expect(src).toHaveValue(original);
 // Row 3: Enter saves only the title; key, icon, members and the other group stay.
 await edit.pressSequentially('Ingress tier');await expect(edit).toHaveValue('Ingress tier');await expect(src).toHaveValue(original);
 await edit.press('Enter');await expect(edit).toHaveCount(0);
 const saved=await src.inputValue();expect(JSON.parse(saved)).toEqual(want({title:'Ingress tier',icon:'gear'}));
 await expect(heading).toHaveText('Ingress tier');await expect(page.locator('#docview g.grp[data-dv-group]')).toHaveCount(2);
 // Row 4: one save is one Undo entry; Redo reapplies it.
 await undo.click();await expect(src).toHaveValue(original);await expect(undo).toBeDisabled();await expect(heading).toHaveText('Edge tier');
 await redo.click();await expect(src).toHaveValue(saved);await expect(heading).toHaveText('Ingress tier');
 await undo.click();await expect(src).toHaveValue(original);
 // Row 5: click outside saves.
 await rename(page,'edge-tier');await edit.pressSequentially('Edge gateway');await expect(src).toHaveValue(original);
 await page.locator('#docview .sec-h').click();await expect(edit).toHaveCount(0);
 expect(JSON.parse(await src.inputValue())).toEqual(want({title:'Edge gateway',icon:'gear'}));await expect(heading).toHaveText('Edge gateway');
 await undo.click();await expect(src).toHaveValue(original);await expect(heading).toHaveText('Edge tier');
 // Row 6: Escape cancels and writes nothing.
 await rename(page,'edge-tier');await edit.press('End');await edit.pressSequentially(' discarded');await expect(edit).toHaveValue('Edge tier discarded');
 await edit.press('Escape');await expect(edit).toHaveCount(0);await expect(src).toHaveValue(original);await expect(heading).toHaveText('Edge tier');
 // Row 7: an empty value removes the title like Inspect -> title; the boundary shows the key.
 await rename(page,'edge-tier');await edit.press('Backspace');await expect(edit).toHaveValue('');await edit.press('Enter');await expect(edit).toHaveCount(0);
 const cleared=await src.inputValue();expect(JSON.parse(cleared)).toEqual(want({icon:'gear'}));await expect(heading).toHaveText('edge-tier');
 await rename(page,'edge-tier');await expect(edit).toHaveValue('edge-tier');await edit.press('Escape');await expect(edit).toHaveCount(0);await expect(src).toHaveValue(cleared);
 await undo.click();await expect(src).toHaveValue(original);await expect(heading).toHaveText('Edge tier');
});

test('imported group shows Rename disabled with the provider reason; a local group in the same consumer offers it',async({page,server})=>{
 const f=importFixtures(),catalog={version:3,diagrams:Object.values(f).map(spec=>({id:spec.page.canon.id,title:spec.page.title,canon:spec.page.canon,counts:{nodes:2,steps:0,panels:0},revision:digest(spec),specUrl:spec.page.canon.id+'.json'}))};
 await page.route('**/diagrams.json',route=>route.fulfill({json:catalog}));for(const spec of Object.values(f))await page.route('**/'+spec.page.canon.id+'.json',route=>route.fulfill({json:spec}));
 await page.goto(server.origin+'/workbench.html?diagram=consumer');await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.locator('#canon-reader-edit').click();
 await prepareEditorSurface(page);await closeTools(page);
 const src=page.locator('#src'),reason='Imported structure belongs to its provider.',anyEditor=page.getByRole('textbox',{name:'Group title',exact:true});
 // P: the imported boundary renders from the provider; the consumer source owns only 'mine'.
 await expect(title(page,'shared::platform')).toHaveText('Provider platform');await expect(title(page,'mine')).toHaveText('Consumer group');
 const original=await src.inputValue();expect(JSON.parse(original).page.sections[0].diagram.groups).toEqual({mine:{title:'Consumer group'}});
 // Row 8b: a local group beside the import offers an enabled Rename.
 await rightClickGroup(page,'mine');const local=objectMenu(page).getByRole('menuitem',{name:'Rename',exact:true});
 await expect(local).toBeVisible();await expect(local).not.toHaveAttribute('aria-disabled','true');
 await page.keyboard.press('Escape');await expect(objectMenu(page)).toBeHidden();await expect(src).toHaveValue(original);
 // Row 8 (flip): the imported group's reference menu shows Rename disabled with the reason.
 await rightClickGroup(page,'shared::platform');const reference=page.getByRole('menu',{name:'Reference actions for shared'});
 await expect(reference).toBeVisible();await expect(objectMenu(page)).toBeHidden();
 const item=reference.getByRole('menuitem',{name:/^Rename/});await expect(item).toHaveCount(1);
 await expect(item).toHaveAttribute('aria-disabled','true');await expect(item).toHaveAttribute('title',reason);await expect(item.locator('small')).toHaveText(reason);
 // A real click on the disabled item (force: Playwright treats aria-disabled as not actionable) does nothing.
 await item.click({force:true});await expect(anyEditor).toHaveCount(0);await expect(src).toHaveValue(original);
 await page.keyboard.press('Escape');await expect(reference).toBeHidden();await expect(anyEditor).toHaveCount(0);await expect(src).toHaveValue(original);
 await expect(title(page,'shared::platform')).toHaveText('Provider platform');
});
