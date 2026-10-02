import {test,expect,pastePage as paste} from '../helpers/test.mjs';

const fixture=()=>({page:{title:'Export authoring',sections:[{id:'main',heading:'Main',diagram:{view:'ambient',autoplay:false,
  nodes:{a:{title:'Sender'},b:{title:'Receiver'},c:{title:'Archive'}},rows:[['a','b','c']],
  edges:[{from:'a',to:'b',label:'send'},{from:'b',to:'c',label:'store'}]}},
  {id:'other',heading:'Other',diagram:{nodes:{z:{title:'Other'}},rows:[['z']]}}]}});
const node=(page,id)=>page.locator('#docview g.node[data-dv-node="'+id+'"] .t1');
const edge=(page,index)=>page.locator('#section-main text.lbl[data-dv-edge="'+index+'"]');
const form=page=>page.locator('#guide .topology-export-form');
async function start(page,server,path='/workbench.html'){
  await page.goto(server.origin+path);const text=JSON.stringify(fixture(),null,4).replace('"title": "Export authoring"','"title" : "Export authoring"')+'\n';await paste(page,text);return text;
}
async function selectPair(page){await node(page,'a').click();await node(page,'b').click({modifiers:['Shift']});}
async function history(page,before,after){await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);}

test('local canvas selection creates, updates, renames and removes exports with exact Undo/Redo',async({page,server})=>{
  const before=await start(page,server),src=page.locator('#src');
  await node(page,'a').click();await expect(form(page)).toHaveCount(0);
  await node(page,'b').click({modifiers:['Shift']});await expect(form(page)).toContainText('Nodes: a, b');
  await expect(page.locator('#guide').getByRole('button',{name:'Align horizontal',exact:true})).toBeVisible();
  await form(page).getByLabel('Export name',{exact:true}).fill('delivery');await form(page).getByRole('button',{name:'Create export',exact:true}).click();
  const created=await src.inputValue();let d=JSON.parse(created).page.sections[0].diagram;
  expect(d.topologyExports).toEqual({delivery:{nodes:['a','b'],edges:[]}});delete d.topologyExports;expect(d).toEqual(fixture().page.sections[0].diagram);
  expect(created).toContain('"title" : "Export authoring"');await history(page,before,created);
  await selectPair(page);await edge(page,0).click({modifiers:['Shift']});
  await expect(page.locator('#guide')).toContainText('3 topology items selected');await expect(form(page)).toContainText('a->b');
  await expect(page.locator('#guide > .inspector-actions')).toHaveCount(0);await expect(page.locator('#object-copy')).toBeDisabled();await expect(page.locator('#object-duplicate')).toBeDisabled();
  await page.keyboard.press('Delete');await expect(src).toHaveValue(created);
  await form(page).getByLabel('Topology export',{exact:true}).selectOption('delivery');await form(page).getByLabel('Export name',{exact:true}).fill('delivery-v2');
  await form(page).getByRole('button',{name:'Update export',exact:true}).click();const updated=await src.inputValue();
  expect(JSON.parse(updated).page.sections[0].diagram.topologyExports).toEqual({'delivery-v2':{nodes:['a','b'],edges:['a->b']}});await history(page,created,updated);
  await selectPair(page);await form(page).getByLabel('Topology export',{exact:true}).selectOption('delivery-v2');
  await form(page).getByRole('button',{name:'Remove export',exact:true}).click();const removed=await src.inputValue();expect(JSON.parse(removed)).toEqual(fixture());await history(page,updated,removed);
});

test('closure, stale source, cross-section and narrow Inspector fail safely; homogeneous edges retain bulk controls',async({page,server},info)=>{
  const before=await start(page,server),src=page.locator('#src');
  await node(page,'a').click();await edge(page,0).click({modifiers:['Meta']});
  await form(page).getByLabel('Export name',{exact:true}).fill('delivery');await expect(form(page).getByRole('status')).toContainText('both endpoint');await expect(form(page).getByRole('button',{name:'Create export',exact:true})).toBeDisabled();
  await node(page,'b').click({modifiers:['Shift']});await form(page).getByLabel('Export name',{exact:true}).fill('delivery');
  await page.setViewportSize({width:720,height:640});
  const input=form(page).getByLabel('Export name',{exact:true});await input.focus();await input.press('Tab');await expect(form(page).getByRole('button',{name:'Create export',exact:true})).toBeFocused();
  expect(await form(page).evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await info.attach('export-inspector-narrow',{body:await form(page).screenshot({path:info.outputPath('export-inspector-narrow.png')}),contentType:'image/png'});
  await page.evaluate(value=>{const src=document.querySelector('#src');src.value=value+'\n';src.dispatchEvent(new Event('input',{bubbles:true}));},before);
  await expect(form(page).getByRole('button',{name:'Create export',exact:true})).toBeDisabled();await expect(form(page).getByRole('status')).toContainText('changed');await expect(src).toHaveValue(before+'\n');
  await page.setViewportSize({width:1800,height:1200});await page.locator('#go').evaluate(el=>el.click());
  await node(page,'a').click();await node(page,'z').click({modifiers:['Shift']});await expect(form(page)).toContainText('one diagram section');await expect(form(page).getByRole('button',{name:'Create export',exact:true})).toHaveCount(0);
  await edge(page,0).click();await edge(page,1).click({modifiers:['Shift']});await expect(page.locator('#guide')).toContainText('2 edges selected');
  await expect(page.locator('#guide').getByLabel('kind',{exact:true})).toBeVisible();await expect(page.locator('#guide').getByLabel('ret',{exact:true})).toBeVisible();
  await expect(form(page)).toContainText('at least one selected node');await expect(page.locator('#undo-builder')).toBeDisabled();
});

test('retired export controls cannot write after selection changes, project replacement or remount',async({page,server})=>{
  const before=await start(page,server,'/lifetime/index.html'),src=page.locator('#src');
  await selectPair(page);await form(page).getByLabel('Export name',{exact:true}).fill('old');const held=await form(page).getByRole('button',{name:'Create export',exact:true}).elementHandle();
  await node(page,'a').click();await held.evaluate(el=>el.click());await expect(src).toHaveValue(before);
  await selectPair(page);await form(page).getByLabel('Export name',{exact:true}).fill('old');const replaced=await form(page).getByRole('button',{name:'Create export',exact:true}).elementHandle();
  await page.evaluate(text=>__editorTest.builder.loadText(text),before+'\n');await replaced.evaluate(el=>el.click());await expect(src).toHaveValue(before+'\n');
  for(let cycle=0;cycle<2;cycle++){
    await selectPair(page);await form(page).getByLabel('Export name',{exact:true}).fill('retired');const retired=await form(page).getByRole('button',{name:'Create export',exact:true}).elementHandle();
    await page.evaluate(()=>{__editorTest.builder.destroy();__editorTest.remount();});await retired.evaluate(el=>el.click());await expect(src).toHaveValue(before+'\n');
    await selectPair(page);await form(page).getByLabel('Export name',{exact:true}).fill('live');await form(page).getByRole('button',{name:'Create export',exact:true}).click();
    expect(JSON.parse(await src.inputValue()).page.sections[0].diagram.topologyExports.live.nodes).toEqual(['a','b']);await page.locator('#undo-builder').click();await expect(src).toHaveValue(before+'\n');await expect(page.locator('#undo-builder')).toBeDisabled();
  }
});
