import {test,expect,paste} from '../helpers/test.mjs';

function longSpec(){
  return {page:{title:'Scroll retention',sections:Array.from({length:5},(_,i)=>({
    id:'diagram-'+i,heading:'Section '+(i+1),diagram:{nodes:{
      a:{title:'Camera'},b:{title:'Gateway'},c:{title:'Recording'},d:{title:'Storage'},
      e:{title:'Notifications'},f:{title:'Phone'},
    },view:'step',autoplay:false,steps:[{id:'start',nodes:['a'],text:'Start'},{id:'end',nodes:['f'],text:'End'}],
      panels:[{id:'home',type:'homemap',title:'Home',outline:{w:280,h:160},rooms:[],devices:[{id:'camera',kind:'camera',x:30,y:90}],subjects:[]}],
      rows:[['a','b'],['c','d'],['e','f']],edges:[
      {from:'a',to:'b',kind:'https'},{from:'b',to:'c',kind:'https'},
      {from:'c',to:'d',kind:'https'},{from:'d',to:'e',kind:'https'},
      {from:'e',to:'f',kind:'https'},
    ]},
  }))}};
}

for(const focus of [false,true])test(`row reorder keeps the ${focus?'focused preview':'page'} in place`,async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(longSpec()));
  await page.evaluate(()=>document.fonts.ready);
  if(focus){
    await page.locator('#editor-tab-file').click();await page.locator('.workspace-preferences summary').click();
    await page.locator('#workspace-focus').click();await page.locator('#editor-tab-inspect').click();
  }
  const position=()=>page.evaluate(focus=>focus?document.querySelector('.workmain').scrollTop:scrollY,focus);
  const settled=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const rows=async()=>JSON.parse(await page.locator('#src').inputValue()).page.sections[3].diagram.rows;
  const section=page.locator('#section-diagram-3');
  await section.scrollIntoViewIfNeeded();
  const grabs=section.locator('.dv-rowgrab');
  await expect(grabs).toHaveCount(3);
  const from=await grabs.nth(0).boundingBox(),to=await grabs.nth(2).boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
  await page.mouse.move(to.x+to.width/2,to.y+to.height+60,{steps:12});
  const before=await position();
  expect(before).toBeGreaterThan(1000);
  await page.mouse.up();
  await expect.poll(rows).toEqual([['c','d'],['e','f'],['a','b']]);
  await settled();
  expect(await position()).toBeCloseTo(before,0);
  await page.locator('#undo-builder').click();
  await expect.poll(rows).toEqual([['a','b'],['c','d'],['e','f']]);
  await settled();expect(await position()).toBeCloseTo(before,0);
  await page.locator('#redo-builder').click();
  await expect.poll(rows).toEqual([['c','d'],['e','f'],['a','b']]);
  await settled();expect(await position()).toBeCloseTo(before,0);

  await section.locator('[data-dv-node="c"]').click();
  const title=page.locator('#guide').getByLabel('title',{exact:true});
  await title.fill('Recordings');
  const beforeEdit=await position();
  await title.press('Enter');await expect(title).toBeFocused();
  await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.sections[3].diagram.nodes.c.title).toBe('Recordings');
  await settled();expect(await position()).toBeCloseTo(beforeEdit,0);
});
