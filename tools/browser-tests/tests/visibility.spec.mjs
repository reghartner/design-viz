import {test,expect,paste} from '../helpers/test.mjs';
const spec=()=>({page:{sections:[{heading:'Visibility',bullets:['Supporting context'],contract:{fields:[{k:'result',v:'ready'}]},diagram:{view:'step',autoplay:false,routing:'lanes',nodes:{a:{title:'Source'},b:{title:'Target'}},rows:[['a'],['b']],edges:[{from:'a',to:'b',label:'Deliver'}],steps:['a','b','c','x','y','unused'].map(id=>({id,text:'Caption '+id,nodes:['a','b']})),paths:[{id:'main',label:'Main',steps:['a','b','c']},{id:'alternate',label:'Alternate',steps:['a','x','y','c']}]}}]}});
test('visibility controls author all three fragments atomically with captions and Undo',async({page,server})=>{
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec(),null,2));
 const root=page.locator('#docview'),guide=page.locator('#guide'),source=()=>page.locator('#src').inputValue();
 for(const selector of ['text.lbl[data-dv-edge="0"]','[data-dv-bullet="0"]','[data-dv-crow="0"]']){
  await root.locator(selector).click();await guide.getByText('Visibility by path position',{exact:true}).click();
  const before=await source();
  await expect(guide.getByLabel('Show from position',{exact:true}).locator('option[value="2"]')).toHaveText('Position 3 — Caption c · c');
  await guide.getByLabel('Caption path',{exact:true}).selectOption('alternate');
  await expect(guide.getByLabel('Show from position',{exact:true}).locator('option[value="2"]')).toHaveText('Position 3 — Caption y · y');
  await guide.getByLabel('Show from position',{exact:true}).selectOption('1');
  await expect(guide.getByLabel('Show from position',{exact:true})).toHaveValue('1');
  const changed=JSON.parse(await source()).page.sections[0];
  expect((selector.includes('edge')?changed.diagram.edges[0]:selector.includes('bullet')?changed.bullets[0]:changed.contract.fields[0]).revealAt).toBe(1);
  await guide.getByLabel('Hide starting at position',{exact:true}).selectOption('3');
  await expect(guide.locator('.ierr')).toBeHidden();
  const interval=JSON.parse(await source()).page.sections[0];
  expect((selector.includes('edge')?interval.diagram.edges[0]:selector.includes('bullet')?interval.bullets[0]:interval.contract.fields[0]).hideAt).toBe(3);
  await guide.getByLabel('Show from position',{exact:true}).selectOption('2');
  await expect(guide.locator('.ierr')).toBeHidden();
  await guide.getByLabel('Hide starting at position',{exact:true}).selectOption('');
  await expect(guide.locator('.ierr')).toBeHidden();
  const cleared=JSON.parse(await source()).page.sections[0];
  expect((selector.includes('edge')?cleared.diagram.edges[0]:selector.includes('bullet')?cleared.bullets[0]:cleared.contract.fields[0]).hideAt).toBeUndefined();
  for(let i=0;i<3;i++)await page.locator('#undo-builder').click();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
 }
});
test('full path positions drive shared events, filtered views and routed edge underlays',async({page,server})=>{
 const raw=spec(),sec=raw.page.sections[0],d=sec.diagram;
 sec.bullets=[{text:'Supporting context',revealAt:2,hideAt:3}];sec.contract.fields[0].revealAt=2;sec.contract.fields[0].hideAt=3;
 Object.assign(d.edges[0],{revealAt:2,hideAt:3});
 d.layouts=[{id:'brief',name:'Brief',steps:['a','c','x','y'],sectionLayout:{default:[{x:0,y:0,w:12,h:20},{controls:'steps',attachTo:'diagram',x:0,y:20,w:12,h:8}]}}];d.defaultLayout='brief';
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));const root=page.locator('#docview');
 const fragments=root.locator('.edge,.lane-bridge,.halo,[data-dv-bullet="0"],[data-dv-crow="0"]');
 async function hidden(value){for(const el of await fragments.all())value?await expect(el).toHaveClass(/dv-fragment-hidden/):await expect(el).not.toHaveClass(/dv-fragment-hidden/);}
 await expect(root.locator('.lane-bridge')).toHaveCount(1);await hidden(true);
 await root.locator('button.schip[data-step-source="2"]').click();await hidden(false);
 await expect(root.locator('button.schip[aria-current="true"]')).toHaveText('2');
 await root.locator('text.lbl[data-dv-edge="0"]').click();
 await page.locator('#guide').getByRole('button',{name:'Show from current position',exact:true}).click();
 expect(JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.edges[0].revealAt).toBe(2);
 await root.locator('.path-chip[data-dv-path="alternate"]').click();await hidden(true);
 await root.locator('button.schip[data-step-source="3"]').click();await hidden(true);
 await root.locator('button.schip[data-step-source="4"]').click();await hidden(false);
 await root.locator('button.schip[data-step-source="2"]').click();await hidden(true);
 await root.getByRole('button',{name:'AMBIENT',exact:true}).click();await hidden(false);
});
