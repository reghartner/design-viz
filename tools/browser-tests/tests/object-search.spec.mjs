import {test,expect,paste} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';

const heading='Delivery and recording lifecycle — a deliberately long section title repeated in different tabs';
const title='Recording service with a long recognizable name for customer delivery';
function fixture(){
  const first=editorSpec().page.blocks[0],second=structuredClone(first);
  first.heading=second.heading=heading;
  for(const section of [first,second]){section.diagram.nodes.a.title=title;section.diagram.nodes.b.title=title;}
  return {page:{title:'Object search',blocks:[{tabs:[{label:'Overview',sections:[first]},{label:'Operations',sections:[second]}]}]}};
}
async function open(page,server){const text=JSON.stringify(fixture(),null,2);await page.goto(server.origin+'/workbench.html');await paste(page,text);return text;}

test('Find objects groups duplicate names and keyboard selection inspects the exact hidden-tab object',async({page,server},info)=>{
  await page.setViewportSize({width:1280,height:800});const original=await open(page,server);
  await expect(page.locator('#editor-tab-outline')).toHaveText('▤Find objects');
  await page.keyboard.press('ControlOrMeta+k');const search=page.getByRole('searchbox',{name:'Find objects',exact:true});await expect(search).toBeFocused();
  await search.fill('recording service');const groups=page.locator('.outline-group'),results=page.locator('.outline-item');
  await expect(groups).toHaveCount(2);await expect(results).toHaveCount(4);
  await expect(groups.nth(0).locator('h3')).toHaveText('Overview / '+heading+' · Section 1');
  await expect(groups.nth(1).locator('h3')).toHaveText('Operations / '+heading+' · Section 2');
  for(const row of await results.all()){
    await expect(row.locator('span')).toHaveText(title);await expect(row.locator('small')).toHaveText(/node · [ab]/);
    expect(await row.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  }
  for(const width of [1280,1440]){
    await page.setViewportSize({width,height:900});
    await info.attach('object-search-duplicates-'+width,{body:await page.screenshot(),contentType:'image/png'});
  }
  await search.press('ArrowDown');await expect(results.first()).toBeFocused();
  await search.fill('operations nodes.b');await search.press('Enter');await expect(results).toHaveCount(1);await expect(results).toBeFocused();
  await expect(results).toHaveAttribute('title','page.blocks[0].tabs[1].sections[0].diagram.nodes.b');
  await page.keyboard.press('Enter');await expect(page.locator('#tab-0-1')).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#editor-outline')).toBeVisible();await page.locator('#outline-inspect').click();
  const input=page.locator('#guide').getByLabel('Name',{exact:true});await expect(input).toHaveValue(title);
  await input.fill('Correct hidden object');await input.press('Enter');
  const after=JSON.parse(await page.locator('#src').inputValue());
  expect(after.page.blocks[0].tabs[1].sections[0].diagram.nodes.b.title).toBe('Correct hidden object');
  expect(after.page.blocks[0].tabs[1].sections[0].diagram.nodes.a.title).toBe(title);
  expect(after.page.blocks[0].tabs[0].sections[0].diagram.nodes.b.title).toBe(title);
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await page.locator('#redo-builder').click();expect(JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].tabs[1].sections[0].diagram.nodes.b.title).toBe('Correct hidden object');
});

test('object search finds a step excluded from the saved View and rejects stale or invalid source',async({page,server})=>{
  const original=await open(page,server);await page.keyboard.press('ControlOrMeta+k');const search=page.locator('#outline-search');
  await search.fill('operations failed');const result=page.locator('.outline-item');await expect(result).toHaveCount(1);
  await expect(result.locator('span')).toHaveText('Exact hidden failure');await expect(result.locator('small')).toHaveText('step · 3 · failed');
  await result.click();await expect(page.locator('#tab-0-1')).toHaveAttribute('aria-selected','true');
  await page.locator('#outline-inspect').click();const caption=page.locator('#guide').getByLabel('text',{exact:true});await expect(caption).toHaveValue('Exact hidden failure');
  await caption.fill('Hidden step inspected');await caption.press('Tab');
  expect(JSON.parse(await page.locator('#src').inputValue()).page.blocks[0].tabs[1].sections[0].diagram.steps[2].text).toBe('Hidden step inspected');
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
  await page.keyboard.press('ControlOrMeta+k');await search.fill('operations nodes.b');
  // Change source and activate the old row in the same task, before the debounce refresh.
  await page.evaluate(()=>{const src=document.querySelector('#src');src.value+=' ';src.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.outline-item').click();});
  await expect(page.locator('#outline-status')).toHaveText('Source changed; outline refreshed. Select the item again.');
  await expect(page.locator('#src')).toHaveValue(original+' ');
  const invalid=fixture();invalid.page.blocks[0].tabs[1].sections[0].diagram.rows=[['missing-node']];
  await page.locator('#editor-tab-json').click();await page.locator('#src').fill(JSON.stringify(invalid));
  await page.keyboard.press('ControlOrMeta+k');await search.fill('operations nodes.b');await result.click();
  await expect(page.locator('#guide .gerr')).toHaveText('Fix validation errors before navigating the preview.');
  await expect(page.locator('#src')).toHaveValue(JSON.stringify(invalid));
  await page.locator('#editor-tab-json').click();await page.locator('#src').fill('{invalid');
  await expect(page.locator('#outline-status')).toHaveText('Fix the JSON source to find objects.');await expect(page.locator('.outline-item')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+k');await search.press('ArrowDown');await expect(search).toBeFocused();
  await expect(page.locator('#src')).toHaveValue('{invalid');
});
