import {test,expect,paste} from '../helpers/test.mjs';

const initial=()=>({page:{title:'Quick connections',blocks:[{id:'main',heading:'Doorbell services',diagram:{
  nodes:{a:{title:'Doorbell'},b:{title:'Gateway'},c:{title:'Recording'},f:{title:'Analytics'}},
  rows:[['a','b','c']],floats:[{id:'f',side:'below',x:850,y:260}],edges:[{from:'a',to:'b'}],
  steps:[{nodes:['a'],text:'Begin'}],autoplay:false,view:'step'
}},{id:'other',heading:'Other section',diagram:{nodes:{z:{title:'Elsewhere'}},rows:[['z']]}}]}});
const node=(page,id)=>page.locator('#docview g.node[data-dv-node="'+id+'"]');
const source=page=>page.locator('#src').inputValue();
const diagram=async page=>JSON.parse(await source(page)).page.blocks[0].diagram;
const clean=page=>expect(page.locator('.dv-connect-preview,.dv-connect-hint,.dv-connect-source,.dv-connect-candidate,.dv-connect-target')).toHaveCount(0);
const start=(page,id='a')=>node(page,id).click({modifiers:['Alt']});
const arrow=page=>page.locator('.dv-connect-line');

test('Alt-click connects row and free nodes with a live preview, exact Undo and the edge inspector',async({page,server},testInfo)=>{
  await page.goto(server.origin+'/workbench.html');const original=JSON.stringify(initial(),null,2);await paste(page,original);
  await start(page);await expect(page.locator('.dv-connect-hint')).toContainText('Connect from Doorbell');
  await expect(node(page,'a')).toHaveClass(/dv-connect-source/);await expect(node(page,'b')).not.toHaveClass(/dv-connect-candidate/);
  await expect(node(page,'c')).toHaveClass(/dv-connect-candidate/);await expect(node(page,'f')).toHaveClass(/dv-connect-candidate/);
  await expect(node(page,'z')).not.toHaveClass(/dv-connect-candidate/);
  await node(page,'c').hover();await expect(node(page,'c')).toHaveClass(/dv-connect-target/);const first=await arrow(page).getAttribute('d');
  await node(page,'f').hover();await expect(node(page,'f')).toHaveClass(/dv-connect-target/);expect(await arrow(page).getAttribute('d')).not.toBe(first);
  await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('.dv-ghost,.dv-droptgt')).toHaveCount(0);
  await testInfo.attach('connection-preview',{body:await page.locator('#docview .doc-sec').first().screenshot(),contentType:'image/png'});
  await node(page,'f').click();const d=await diagram(page);expect(d.edges.at(-1)).toEqual({from:'a',to:'f',kind:'int',label:'describe the hop'});
  expect(d.rows).toEqual(initial().page.blocks[0].diagram.rows);expect(d.floats).toEqual(initial().page.blocks[0].diagram.floats);await clean(page);
  await expect(page.locator('#guide')).toContainText('Edge — one hop between nodes');await expect(page.locator('#guide').getByRole('combobox',{name:'Exit side',exact:true})).toBeVisible();
  const after=await source(page);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
  await start(page,'f');await node(page,'b').click();expect((await diagram(page)).edges.at(-1).from).toBe('f');
});

test('visible Connect action and the Add menu share cancellation and invalid-target protection',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');const original=JSON.stringify(initial());await paste(page,original);
  await node(page,'c').click();const button=page.getByRole('button',{name:'Connect from this node',exact:true});
  await button.focus();await page.keyboard.press('Enter');await expect(page.locator('.dv-connect-hint')).toContainText('Recording');
  await page.getByRole('button',{name:'Cancel connection',exact:true}).click();await clean(page);
  await button.click();await node(page,'a').click();expect((await diagram(page)).edges.at(-1)).toMatchObject({from:'c',to:'a'});
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  for(const target of ['a','b','z']){await start(page);await node(page,target).click();await clean(page);await expect(page.locator('#src')).toHaveValue(original);}
  await start(page);await page.keyboard.press('Escape');await clean(page);await expect(page.locator('#src')).toHaveValue(original);
  await start(page);await page.locator('#docview h2').first().click();await clean(page);await expect(page.locator('#src')).toHaveValue(original);
  await page.locator('#diagram-add').click();await page.locator('[data-add-kind=edge]').click();await page.locator('#add-edge').click();
  await node(page,'b').click();await expect(page.locator('.dv-connect-hint')).toContainText('Gateway');await node(page,'c').click();
  expect((await diagram(page)).edges.at(-1)).toMatchObject({from:'b',to:'c'});await clean(page);
});

test('first connections in a step-free graph keep the header clear of nodes across skins',async({page,server},testInfo)=>{
  const raw=initial(),d=raw.page.blocks[0].diagram;delete d.edges;delete d.steps;d.view='ambient-only';
  const original=JSON.stringify(raw);await page.goto(server.origin+'/workbench.html');await paste(page,original);
  for(const skin of ['pastel','aurora','daylight','editorial','terminal','blueprint']){
    await page.locator('#sk-'+skin).click();const before=await node(page,'a').boundingBox();
    await start(page);await node(page,'c').hover();
    const hint=await page.locator('.dv-connect-hint').boundingBox(),a=await node(page,'a').boundingBox();
    expect(a).toEqual(before);expect(hint.y+hint.height).toBeLessThanOrEqual(a.y);
    await expect(page.getByRole('button',{name:'Cancel connection',exact:true})).toBeVisible();
    if(skin==='aurora')await testInfo.attach('first-connection-aurora',{body:await page.locator('#docview .doc-sec').first().screenshot(),contentType:'image/png'});
    await node(page,'c').click();expect((await diagram(page)).edges).toHaveLength(1);await clean(page);
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  }
});

test('source changes, blur, remount and stale inspector actions cannot publish pending connections',async({page,server})=>{
  await page.goto(server.origin+'/lifetime/index.html');const original=JSON.stringify(initial());await paste(page,original);
  await start(page);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await clean(page);await expect(page.locator('#src')).toHaveValue(original);
  await start(page);const changed=original.replace('Doorbell services','Changed');
  await page.locator('#editor-tab-json').click();await page.locator('#src').focus();
  await page.evaluate(value=>{const s=document.querySelector('#src');s.value=value;s.dispatchEvent(new Event('input',{bubbles:true}));},changed);
  await expect(page.locator('#editor-tab-json')).toHaveAttribute('aria-selected','true');await expect(page.locator('#src')).toBeFocused();
  await clean(page);await node(page,'c').click();await expect(page.locator('#src')).toHaveValue(changed);
  await start(page);await clean(page);await expect(page.locator('#guide')).toContainText('Render it before connecting');
  await page.evaluate(()=>__editorTest.builder.loadSpec(JSON.parse(document.querySelector('#src').value)));
  await node(page,'a').click();await page.evaluate(()=>window.oldConnect=document.querySelector('.node-connect-button'));
  const baseline=await source(page);await start(page);await page.evaluate(()=>__editorTest.builder.destroy());await clean(page);
  await page.evaluate(()=>{__editorTest.remount();oldConnect.click();});await clean(page);await expect(page.locator('#src')).toHaveValue(baseline);
  await start(page);await page.evaluate(()=>{document.querySelector('#src').value+=' ';});await node(page,'c').click();await clean(page);
  await expect(page.locator('#src')).toHaveValue(baseline+' ');
});

test('modifier selection, ordinary dragging and zoomed connection creation coexist',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');const original=JSON.stringify(initial());await paste(page,original);
  await node(page,'a').click();await node(page,'b').click({modifiers:['ControlOrMeta']});
  await expect(page.locator('#guide')).toContainText('2 nodes');await clean(page);await expect(page.locator('#src')).toHaveValue(original);
  await page.keyboard.press('Escape');
  const f=node(page,'f'),box=await f.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2-70,box.y+box.height/2-20,{steps:8});await page.mouse.up();
  expect((await diagram(page)).floats[0].x).not.toBe(850);await clean(page);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await page.locator('#docview .doc-sec').first().getByRole('button',{name:'Readable',exact:true}).click();
  await start(page);await node(page,'c').hover();await expect(arrow(page)).toHaveAttribute('d',/^M /);
  await node(page,'c').click();expect((await diagram(page)).edges.at(-1)).toMatchObject({from:'a',to:'c'});await clean(page);
});
