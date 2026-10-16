import {test,expect,paste,closeTools} from '../helpers/test.mjs';

function fixture(presentation='standard'){
 const diagram={autoplay:false,nodes:{a:{title:'Entry'},b:{title:'Remote service'}},rows:[[]],floats:[{id:'a',x:150,y:120},{id:'b',x:2300,y:900}],edges:[{from:'a',to:'b'}],panels:[{id:'p',type:'state',title:'Canvas status',states:['Ready'],initial:{state:'Ready'}},{id:'q',type:'state',title:'Floating status',states:['Ready'],initial:{state:'Ready'}}],layouts:[{id:'main',name:'Main',presentation,sectionLayout:{default:[{x:0,y:0,w:8,h:12},{panel:'p',x:8,y:0,w:4,h:6},{panel:'q',x:8,y:6,w:4,h:6}]},exploreLayout:{panelPlacement:'canvas',panelPlacements:[{panel:'q',placement:'floating'}],overlayScale:.7,canvas:{panels:[{panel:'p',x:2700,y:0,w:280,h:300}]}}}]};
 return {page:{title:'Independent zoom',sections:[{id:'one',heading:'Selected diagram',text:'Supporting explanation stays on the page.',diagram},{id:'two',heading:'Another diagram',diagram:{nodes:{c:{title:'Other'}},rows:[['c']]}}]}};
}
const nav=page=>page.locator('#docview>.explore-navigation');
const selected=page=>page.locator('#section-one');
async function open(page,server,presentation='standard',width=1280){await page.setViewportSize({width,height:900});await page.goto(server.origin+'/workbench.html');const input=JSON.stringify(fixture(presentation),null,2);await paste(page,input);await closeTools(page);await page.evaluate(()=>document.fonts.ready);return input;}
async function frame(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function camera(page){return selected(page).locator('.board').evaluate(el=>({x:el.scrollLeft,y:el.scrollTop,width:el.querySelector('.boardcanvas>svg').getBoundingClientRect().width,zoom:el.style.getPropertyValue('--board-zoom-width')}));}
async function assertSource(page,input){await expect(page.locator('#src')).toHaveValue(input);await expect(page.locator('#undo-builder')).toBeDisabled();}
for(const presentation of ['standard','explore'])for(const width of [1280,1440])test(`${presentation} Focus diagram restores independent cameras and Contents at ${width}`,async({page,server},info)=>{
 const input=await open(page,server,presentation,width);await expect(page.locator('body')).not.toHaveClass(/workspace-diagram-focused/);
 if(presentation==='standard'){
  await nav(page).getByLabel('Canvas zoom', {exact:true}).click();await nav(page).getByRole('button',{name:'Zoom 125%',exact:true}).click();
  await selected(page).getByRole('button',{name:'Diagram zoom in',exact:true}).click();
 }else await nav(page).getByRole('button',{name:'Canvas zoom in',exact:true}).click();
 await page.locator('#editor-tab-outline').click();await page.locator('#outline-search').fill('Remote service');await page.locator('#outline-results').getByRole('button',{name:/Remote service/}).click();await closeTools(page);await frame(page);const before=await camera(page),outer=await selected(page).evaluate(el=>el.style.zoom);
 await page.locator('#editor-tab-json').click();await page.locator('#editor-tab-inspect').click();
 await page.locator('#workspace-focus-diagram').click();await expect(page.locator('body')).toHaveClass(/workspace-diagram-focused/);
 await expect(nav(page).locator('.reader-contents')).toBeHidden();await expect(page.locator('#workspace-window-json')).toBeHidden();await expect(page.locator('#workspace-window-inspect')).toBeVisible();
 await expect(selected(page).locator('.explore-window:visible')).toHaveCount(0);await expect(page.getByRole('button',{name:'Return to page',exact:true})).toBeVisible();
 await nav(page).getByRole('button',{name:'Diagram zoom in',exact:true}).click();await page.locator('#workspace-fit-selection').click();await frame(page);
 const node=await selected(page).locator('[data-dv-node=b]').boundingBox(),inspect=await page.locator('#workspace-window-inspect').boundingBox();expect(node.width).toBeGreaterThan(100);expect(node.x+node.width<=inspect.x || node.x>=inspect.x+inspect.width || node.y+node.height<=inspect.y || node.y>=inspect.y+inspect.height).toBe(true);
 await assertSource(page,input);await page.screenshot({path:`/tmp/diagram-focus-${presentation}-${width}.png`});await info.attach('Focused workspace',{body:await page.screenshot(),contentType:'image/png'});
 await page.getByRole('button',{name:'Return to page',exact:true}).click();await frame(page);await expect(page.locator('body')).not.toHaveClass(/workspace-diagram-focused/);
 await expect(nav(page).locator('.reader-contents')).toBeVisible();await expect(page.locator('#workspace-window-json')).toBeVisible();
 const after=await camera(page);expect(after.width).toBeCloseTo(before.width,0);expect(after.x).toBeCloseTo(before.x,0);expect(after.y).toBeCloseTo(before.y,0);expect(await selected(page).evaluate(el=>el.style.zoom)).toBe(outer);await assertSource(page,input);
});

test('Standard Fit selection frames an offscreen node without changing canvas zoom or source',async({page,server})=>{
 const input=await open(page,server);await nav(page).getByLabel('Canvas zoom',{exact:true}).click();await nav(page).getByRole('button',{name:'Zoom 125%',exact:true}).click();
 await selected(page).getByRole('button',{name:'Diagram zoom in',exact:true}).click();
 // Select through Outline, as a user looking for an existing remote object does.
 await page.locator('#editor-tab-outline').click();await page.locator('#outline-search').fill('Remote service');
 await page.locator('#outline-results').getByRole('button',{name:/Remote service/}).click();
 await page.locator('#workspace-fit-selection').click();await frame(page);
 const result=await selected(page).locator('[data-dv-node=b]').evaluate(el=>{const r=el.getBoundingClientRect(),b=el.closest('.board').getBoundingClientRect();return {width:r.width,x:r.left,y:r.top,right:r.right,bottom:r.bottom,board:{x:b.left,y:b.top,right:b.right,bottom:b.bottom},outer:el.closest('.doc-sec').style.zoom};});
 expect(result.width).toBeGreaterThan(100);expect(result.x).toBeGreaterThanOrEqual(result.board.x);expect(result.right).toBeLessThanOrEqual(result.board.right);expect(result.y).toBeGreaterThanOrEqual(result.board.y);expect(result.bottom).toBeLessThanOrEqual(result.board.bottom);expect(result.outer).toBe('1.25');await assertSource(page,input);
});

test('focused manual render and Undo preserve the editing context; navigation and replacement retire focus',async({page,server})=>{
 const input=await open(page,server);await page.locator('#workspace-focus-diagram').click();await page.locator('#editor-tab-json').click();
 const edited=input.replace('Remote service','Renamed remote service');await page.locator('#src').fill(edited);await page.locator('#go').click();await expect(page.locator('body')).toHaveClass(/workspace-diagram-focused/);await closeTools(page);await selected(page).locator('[data-dv-node=a]').click();await page.locator('#editor-tab-inspect').click();await page.locator('#guide .node-advanced>summary').click();await page.locator('#guide').getByLabel('Stable identifier',{exact:true}).fill('renamed');await page.locator('#guide').getByLabel('Stable identifier',{exact:true}).press('Enter');await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);await expect(page.locator('body')).toHaveClass(/workspace-diagram-focused/);
 await page.getByRole('button',{name:'Return to page',exact:true}).click();await assertSource(page,edited);
 await page.locator('#workspace-focus-diagram').click();await nav(page).getByRole('button',{name:'Next section',exact:true}).click();await expect(page.locator('body')).not.toHaveClass(/workspace-diagram-focused/);await expect(page.locator('.workspace-focus-tucked')).toHaveCount(0);
 await page.locator('#workspace-focus-diagram').click();await page.locator('#workspace-home').click();await paste(page,JSON.stringify(fixture()));await expect(page.locator('body')).not.toHaveClass(/workspace-diagram-focused/);await expect(page.getByRole('button',{name:'Focus diagram',exact:true})).toBeVisible();
});

test('mixed panel scaling stays independent and focus preserves a closed Contents preference and authored Undo',async({page,server})=>{
 const original=await open(page,server,'explore');await nav(page).locator('.reader-top>button').click();await expect(nav(page).locator('.reader-contents')).toBeHidden();
 const sizes=()=>selected(page).evaluate(el=>{const width=selector=>el.querySelector(selector).getBoundingClientRect().width;return {graph:width('.boardcanvas>svg'),canvas:width('[data-explore-panel=p]'),floating:width('[data-explore-panel=q]')};});
 const initial=await sizes();await nav(page).getByRole('button',{name:'Canvas zoom in',exact:true}).click();const zoomed=await sizes();expect(zoomed.graph).toBeGreaterThan(initial.graph);expect(zoomed.canvas).toBeGreaterThan(initial.canvas);expect(zoomed.floating).toBeCloseTo(initial.floating,0);
 await nav(page).locator('.explore-panel-menu>summary').click();await nav(page).getByRole('button',{name:'Enlarge panels and controls',exact:true}).click();await frame(page);
 const scaled=await sizes();expect(scaled.graph).toBeCloseTo(zoomed.graph,0);expect(scaled.canvas).toBeCloseTo(zoomed.canvas,0);expect(scaled.floating).toBeGreaterThan(zoomed.floating);
 const authored=await page.locator('#src').inputValue();expect(authored).not.toBe(original);
 await page.locator('#workspace-focus-diagram').click();await page.getByRole('button',{name:'Return to page',exact:true}).click();await frame(page);
 await expect(nav(page).locator('.reader-contents')).toBeHidden();expect(await sizes()).toEqual(scaled);await expect(page.locator('#src')).toHaveValue(authored);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expect(page.locator('#undo-builder')).toBeDisabled();
});

for(const exit of ['Return','navigation','project replacement'])test(`Focus restores every tool's prior visibility after ${exit}`,async({page,server})=>{
 const input=await open(page,server);await page.locator('#editor-tab-json').click();await page.locator('#editor-tab-inspect').click();
 const states=()=>page.locator('.workspace-window').evaluateAll(windows=>windows.map(win=>({id:win.id,hidden:win.hidden,tab:document.getElementById('editor-tab-'+win.id.slice(17)).getAttribute('aria-pressed'),tabIndex:document.getElementById('editor-tab-'+win.id.slice(17)).tabIndex})));
 const before=await states();await page.locator('#workspace-focus-diagram').click();await page.locator('#editor-tab-file').click();await expect(page.locator('#workspace-window-file')).toBeVisible();
 await page.locator('#editor-tab-inspect').click();await page.locator('#workspace-window-inspect .workspace-window-close').click();
 if(exit==='Return')await page.getByRole('button',{name:'Return to page',exact:true}).click();
 else if(exit==='navigation')await nav(page).getByRole('button',{name:'Next section',exact:true}).click();
 else{await page.locator('#workspace-home').click();await paste(page,input);}
 await expect(page.locator('body')).not.toHaveClass(/workspace-diagram-focused/);await expect(page.locator('.workspace-focus-tucked')).toHaveCount(0);expect(await states()).toEqual(before);await assertSource(page,input);
});

test('Focus restores global Hide tools independently of each tool open preference',async({page,server})=>{
 const input=await open(page,server);await page.locator('#editor-tab-json').click();await page.locator('#editor-tab-inspect').click();
 await page.locator('#workspace-canvas-tools>summary').click();await page.getByRole('button',{name:'Hide tools',exact:true}).click();await page.locator('#workspace-canvas-tools>summary').click();
 const preferences=()=>page.evaluate(()=>{const prefs=JSON.parse(localStorage.getItem('dv-workbench-floating-v1'));return Object.fromEntries(Object.entries(prefs.windows).map(([name,state])=>[name,state.open]));});
 const before=await preferences();await page.locator('#workspace-focus-diagram').click();await page.locator('#editor-tab-file').click();await page.locator('#editor-tab-inspect').click();await expect(page.locator('#workspace-window-inspect')).toBeVisible();
 await page.getByRole('button',{name:'Return to page',exact:true}).click();await expect(page.locator('.workspace-window:visible')).toHaveCount(0);expect(await preferences()).toEqual(before);
 await page.locator('#workspace-canvas-tools>summary').click();await page.getByRole('button',{name:'Show tools',exact:true}).click();await expect(page.locator('#workspace-window-json')).toBeVisible();await expect(page.locator('#workspace-window-inspect')).toBeVisible();await expect(page.locator('#workspace-window-file')).toBeHidden();await assertSource(page,input);
});

test('nested detail Focus keeps a newly authored child camera after Render and Return',async({page,server})=>{
 const section=(id,next)=>({id,heading:id,detailOnly:id!=='root',diagram:{nodes:{a:{title:id, ...(next?{detail:{section:next,mode:'focus'}}:{})}},rows:[['a']],layouts:[{id:'main',name:'Main',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:15}]},exploreLayout:{camera:{zoom:.8,x:.5,y:.5}}}],defaultLayout:'main'}});
 const raw={page:{title:'Nested cameras',sections:[section('root','middle'),section('middle','leaf'),section('leaf')]}};
 await page.setViewportSize({width:1440,height:900});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await closeTools(page);
 await page.locator('#section-root [data-dv-detail=a]').click();const child=page.locator('[data-dv-detail-preview]:visible');await child.locator('[data-dv-detail=a]').click();await expect(child.locator('.detail-breadcrumb')).toContainText('leaf');
 const zoom=()=>child.locator('.explore-board').evaluate(board=>parseFloat(board.style.getPropertyValue('--explore-width'))/board.querySelector('.boardcanvas>svg').viewBox.baseVal.width);
 await expect.poll(zoom).toBeCloseTo(.8,2);await page.locator('#workspace-focus-diagram').click();await page.locator('#editor-tab-json').click();
 raw.page.sections[2].diagram.layouts[0].exploreLayout.camera={zoom:.3,x:.1,y:.1};const edited=JSON.stringify(raw,null,2);await page.locator('#src').fill(edited);await page.locator('#go').click();
 await expect(page.locator('body')).toHaveClass(/workspace-diagram-focused/);await expect(child.locator('.detail-breadcrumb')).toContainText('leaf');await expect.poll(zoom).toBeCloseTo(.3,2);
 await page.getByRole('button',{name:'Return to page',exact:true}).click();await expect.poll(zoom).toBeCloseTo(.3,2);await assertSource(page,edited);
});
