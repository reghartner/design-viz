import {test,expect,paste} from '../helpers/test.mjs';

function fixture(shared){
 const paths=[
  {id:'alpha',label:'Alpha path',color:'#0284c7',steps:shared?['shared','a1','a2']:['a1','a2'],metadata:{owner:'alpha'}},
  {id:'hidden',label:'Hidden path',color:'#a855f7',steps:shared?['shared','h1']:['h1'],metadata:{owner:'hidden'}},
  {id:'gamma',label:'Gamma path',color:'#ea580c',steps:shared?['shared','g1','g2']:['g1','g2'],metadata:{owner:'gamma'}}
 ];
 const steps=[
  ...(shared?[{id:'shared',text:'Shared start',edge:'a->b'}]:[]),
  {id:'a1',text:'Alpha starts',edge:'a->b'},{id:'a2',text:'Alpha finishes',edge:'b->c'},
  {id:'h1',text:'Hidden outcome',edge:'a->d'},
  {id:'g1',text:'Gamma starts',edge:'a->e'},{id:'g2',text:'Gamma finishes',edge:'e->c'}
 ];
 const visible=shared?['shared','a2','g1','g2']:['a1','a2','g1','g2'];
 return {page:{title:'Path ordering',sections:[{heading:'Delivery',diagram:{view:'step',autoplay:false,
  nodes:{a:{},b:{},c:{},d:{},e:{}},rows:[['a','b','c'],['d','e']],
  edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'a',to:'d'},{from:'a',to:'e'},{from:'e',to:'c'}],
  steps,paths,layouts:[{id:'focused',name:'Focused',steps:visible,paths:['alpha','gamma'],sectionLayout:{default:[{x:0,y:0,w:12,h:14},{controls:'steps',x:0,y:14,w:12,h:7}]}}],defaultLayout:'focused'
 }}]}};
}
const chip=(root,id)=>root.locator('.path-chip[data-dv-path="'+id+'"]');
const order=async page=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.paths.map(path=>path.id);

for(const shared of [false,true])test((shared?'shared timeline':'matrix')+' path chips reorder in one transaction and keep playback context',async({page,server})=>{
 const raw=fixture(shared),input=JSON.stringify(raw,null,2);
 await page.goto(server.origin+'/workbench.html');await paste(page,input);
 const root=page.locator('#docview .doc-sec').first(),controller=root.locator(shared?'.path-timeline':'.path-matrix');
 await expect(controller).toHaveCount(1);await expect(chip(root,'hidden')).toHaveCount(0);
 await expect(chip(root,'alpha')).toHaveAttribute('data-dv-path-reorder','true');
 await expect(chip(root,'alpha')).toHaveCSS('cursor','grab');
 const selectedStep=root.locator('.schip[data-step-path="alpha"]').last();await selectedStep.click();
 const sourceIndex=await selectedStep.getAttribute('data-step-source');
 const alpha=await chip(root,'alpha').boundingBox(),gamma=await chip(root,'gamma').boundingBox();
 await page.mouse.move(gamma.x+gamma.width/2,gamma.y+gamma.height/2);await page.mouse.down();
 await page.mouse.move(alpha.x+alpha.width/2,alpha.y+1,{steps:10});
 await expect(chip(root,'gamma')).toHaveCSS('cursor','grabbing');
 await expect(chip(root,'alpha')).toHaveClass(/dv-path-drop-before/);
 await expect.poll(()=>chip(root,'alpha').evaluate(el=>({content:getComputedStyle(el,'::after').content,height:getComputedStyle(el,'::after').height}))).toEqual({content:'""',height:'3px'});
 await page.mouse.up();
 await expect.poll(()=>order(page)).toEqual(['gamma','alpha','hidden']);
 await expect(chip(root,'alpha')).toHaveAttribute('aria-pressed','true');
 await expect(root.locator('.schip[aria-current="true"]')).toHaveAttribute('data-step-source',sourceIndex);
 await expect(chip(root,'gamma')).toBeFocused();
 let changed=await page.locator('#src').inputValue();
 expect(JSON.parse(changed).page.sections[0].diagram.paths.find(path=>path.id==='hidden').metadata).toEqual({owner:'hidden'});
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(input);await expect(page.locator('#undo-builder')).toBeDisabled();
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(changed);
 await chip(root,'gamma').press('Alt+ArrowDown');await expect.poll(()=>order(page)).toEqual(['alpha','gamma','hidden']);
 await expect(chip(root,'gamma')).toBeFocused();
 const keyboard=await page.locator('#src').inputValue();
 await chip(root,'alpha').press('Alt+ArrowUp');await expect(page.locator('#src')).toHaveValue(keyboard);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(changed);
});

test('path drag cancellation and stale source never publish a reorder',async({page,server})=>{
 const input=JSON.stringify(fixture(false),null,2);await page.goto(server.origin+'/workbench.html');await paste(page,input);
 const root=page.locator('#docview .doc-sec').first(),controller=root.locator('.path-matrix'),alpha=await chip(root,'alpha').boundingBox(),gamma=await chip(root,'gamma').boundingBox();
 const source=await root.locator('.schip[aria-current="true"]').getAttribute('data-step-source');
 await page.mouse.move(gamma.x+gamma.width/2,gamma.y+gamma.height/2);await page.mouse.down();
 await page.mouse.move(alpha.x+alpha.width/2,alpha.y+1,{steps:8});await expect(chip(root,'alpha')).toHaveClass(/dv-path-drop-before/);
 await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('#src')).toHaveValue(input);
 await expect(chip(root,'alpha')).toHaveAttribute('aria-pressed','true');await expect(root.locator('.schip[aria-current="true"]')).toHaveAttribute('data-step-source',source);
 const bounds=await controller.boundingBox();await page.mouse.move(gamma.x+gamma.width/2,gamma.y+gamma.height/2);await page.mouse.down();
 await page.mouse.move(bounds.x+bounds.width+40,gamma.y+gamma.height/2,{steps:8});await page.mouse.up();
 await expect(page.locator('#src')).toHaveValue(input);await expect(chip(root,'alpha')).toHaveAttribute('aria-pressed','true');
 const stale=input.replace('"Path ordering"','"Path ordering draft"');
 await page.mouse.move(gamma.x+gamma.width/2,gamma.y+gamma.height/2);await page.mouse.down();
 await page.mouse.move(alpha.x+alpha.width/2,alpha.y+1,{steps:8});
 await page.locator('#src').evaluate((source,value)=>{source.value=value;source.dispatchEvent(new Event('input',{bubbles:true}));},stale);await page.mouse.up();
 await expect(page.locator('#src')).toHaveValue(stale);await expect(page.locator('#undo-builder')).toBeDisabled();
 await expect(chip(root,'alpha')).toHaveAttribute('aria-pressed','true');await expect(root.locator('.schip[aria-current="true"]')).toHaveAttribute('data-step-source',source);
});

test('published viewer path chips have no Workbench reorder chrome or behavior',async({page,server})=>{
 await page.goto(server.origin+'/tour-paths.html');const root=page.locator('#docview'),chips=root.locator('.path-chip[data-dv-path]');
 await expect(chips.first()).toBeVisible();expect(await chips.count()).toBeGreaterThan(1);
 await expect(chips.first()).not.toHaveAttribute('data-dv-path-reorder',/.+/);
 const before=await chips.evaluateAll(items=>items.map(item=>item.getAttribute('data-dv-path')));
 await chips.first().focus();await chips.first().press('Alt+ArrowDown');
 const second=await chips.nth(1).boundingBox(),first=await chips.first().boundingBox();
 await page.mouse.move(second.x+second.width/2,second.y+second.height/2);await page.mouse.down();
 await page.mouse.move(first.x+first.width/2,first.y+1,{steps:8});await page.mouse.up();
 expect(await chips.evaluateAll(items=>items.map(item=>item.getAttribute('data-dv-path')))).toEqual(before);
 await expect(root.locator('.dv-path-dragging,.dv-path-drop-before,.dv-path-drop-after')).toHaveCount(0);
});
