import {test,expect} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

test('repository defaults paint local/imported status cards and controls without saved preferences',async({page,context,server},testInfo)=>{
 await page.setViewportSize({width:1700,height:1200});await page.goto(server.origin+'/status-colors.html');
 const view=page.locator('#palette-view'),defaults={
  todo:{color:'#8fb4ff',rgb:'rgb(143, 180, 255)',width:3,fill:15,glow:0},
  active:{color:'#009dff',rgb:'rgb(0, 157, 255)',width:2,fill:15,glow:100},
  done:{color:'#2ed600',rgb:'rgb(46, 214, 0)',width:3.5,fill:14,glow:153},
  blocked:{color:'#e81717',rgb:'rgb(232, 23, 23)',width:3,pillWidth:2,fill:15,glow:183},
  missing:{color:'#e81717',rgb:'rgb(232, 23, 23)',width:2,fill:15,glow:130},
  unchanged:{color:'#2ed600',rgb:'rgb(46, 214, 0)',width:1,fill:3,glow:0}
 };
 expect(await page.evaluate(()=>localStorage.getItem('flowview.status-colors.v1'))).toBeNull();
 for(const [state,value] of Object.entries(defaults)){
  await expect(page.getByRole('textbox',{name:(state==='todo'?'To do':state==='missing'?'Missing work':state[0].toUpperCase()+state.slice(1))+' hex',exact:true})).toHaveValue(value.color);
  const label=state==='todo'?'To do':state==='missing'?'Missing work':state[0].toUpperCase()+state.slice(1);
  await page.getByText(label+' border, fill & glow',{exact:true}).click();
  await expect(page.getByRole('textbox',{name:label+' border color',exact:true})).toHaveValue(value.color);
  for(const [title,expected] of [['border width (px)',value.width],['fill tint (%)',value.fill],['glow strength (%)',value.glow]]){
   await expect(page.getByRole('spinbutton',{name:label+' '+title,exact:true})).toHaveValue(String(expected));
   await expect(page.getByRole('slider',{name:label+' '+title+' slider',exact:true})).toHaveValue(String(expected));
  }
  for(const id of [state,'shared::'+(state==='active'?'imported':state)]){
   const node=view.locator('[data-dv-node="'+id+'"]');await expect(node).toHaveAttribute('data-live-appearance',state);
   await expect(node.locator('.card')).toHaveCSS('stroke',value.rgb);await expect(node.locator('.card')).toHaveCSS('stroke-width',value.width+'px');
   await expect(node).toHaveCSS('--dv-live-fill',value.fill+'%');await expect(node).toHaveCSS('--dv-live-glow',String(value.glow/100));
   expect(Number(await node.locator('.dv-live-halo').evaluate(el=>getComputedStyle(el).opacity))).toBeCloseTo(.35*value.glow/100,5);
  }
  const pills=view.locator(':is(.schip,.dv-live-state-pill,.dv-live-count)[data-live-appearance="'+state+'"]');expect(await pills.count()).toBeGreaterThan(0);
  for(const pill of await pills.all()){await expect(pill).toHaveCSS('border-top-color',value.rgb);await expect(pill).toHaveCSS('--dv-live-width',(value.pillWidth ?? value.width)+'px');await expect(pill).toHaveCSS('border-top-width',Math.floor(value.pillWidth ?? value.width)+'px');await expect(pill).toHaveCSS('--dv-live-fill',value.fill+'%');await expect(pill).toHaveCSS('--dv-live-glow',String(value.glow/100));}
  await page.getByText(label+' border, fill & glow',{exact:true}).click();
 }
 // HTML border widths quantize to device pixels; SVG cards retain the exact 3.5 px stroke.
 const coin=view.locator('.coin[data-live-appearance=active]');await expect(coin).toHaveCount(1);
 await expect(coin.locator('circle')).toHaveCSS('stroke','rgb(0, 157, 255)');await expect(coin.locator('circle')).toHaveCSS('stroke-width','2px');await expect(coin).toHaveCSS('--dv-live-fill','15%');
 for(const skin of ['aurora','terminal','pastel','blueprint','rose','lavender','lilac','daylight','editorial']){
  await page.getByLabel('Preview skin').selectOption(skin);
  for(const icon of await view.locator('.dv-live-pr-link[data-pr-state=open]').all())await expect(icon).toHaveCSS('color','rgb(0, 157, 255)');
  for(const icon of await view.locator('.comm-break').all())await expect(icon).toHaveCSS('stroke','rgb(180, 35, 56)');
 }
 await page.getByLabel('Preview skin').selectOption('pastel');
 // The repository's fixed Unchanged border remains independent of a personal fill color.
 await page.getByText('Unchanged border, fill & glow',{exact:true}).click();
 await page.getByRole('textbox',{name:'Unchanged hex',exact:true}).fill('#9933cc');
 await expect(page.getByRole('textbox',{name:'Unchanged border color',exact:true})).toHaveValue('#2ed600');
 await expect(view.locator('[data-dv-node=unchanged] .card')).toHaveCSS('stroke','rgb(46, 214, 0)');
 await page.getByRole('textbox',{name:'Unchanged border color',exact:true}).fill('#123456');
 await page.getByRole('button',{name:'Reset Unchanged border color',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Unchanged border color',exact:true})).toHaveValue('#2ed600');
 await expect(view.locator('[data-dv-node="shared::unchanged"] .card')).toHaveCSS('stroke','rgb(46, 214, 0)');
 await page.getByRole('spinbutton',{name:'Unchanged border width (px)',exact:true}).fill('7');
 await page.getByRole('button',{name:'Reset Unchanged border width (px)',exact:true}).click();
 await expect(page.getByRole('spinbutton',{name:'Unchanged border width (px)',exact:true})).toHaveValue('1');
 await expect(view.locator('[data-dv-node="shared::unchanged"] .card')).toHaveCSS('stroke-width','1px');
 await page.getByText('Done border, fill & glow',{exact:true}).click();
 for(const title of ['border width (px)','fill tint (%)','glow strength (%)'])await page.getByRole('spinbutton',{name:'Done '+title,exact:true}).fill('7');
 await page.getByRole('button',{name:'Save defaults',exact:true}).click();
 for(const [title,expected] of [['border width (px)',3.5],['fill tint (%)',14],['glow strength (%)',153]]){
  await page.getByRole('button',{name:'Reset Done '+title,exact:true}).click();
  await expect(page.getByRole('spinbutton',{name:'Done '+title,exact:true})).toHaveValue(String(expected));
 }
 for(const id of ['done','shared::done']){await expect(view.locator('[data-dv-node="'+id+'"] .card')).toHaveCSS('stroke-width','3.5px');await expect(view.locator('[data-dv-node="'+id+'"]')).toHaveCSS('--dv-live-fill','14%');await expect(view.locator('[data-dv-node="'+id+'"]')).toHaveCSS('--dv-live-glow','1.53');}
 await page.getByRole('button',{name:'Reset all',exact:true}).click();await page.getByRole('button',{name:'Save defaults',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Unchanged hex',exact:true})).toHaveValue('#2ed600');
 expect(await page.evaluate(()=>localStorage.getItem('flowview.status-colors.v1'))).toBeNull();
 const reader=await context.newPage();await reader.goto(server.origin+'/standalone.html');
 for(const [state,value] of Object.entries(defaults))await expect(reader.locator('#docview')).toHaveCSS('--dv-live-'+state,value.color);
 await expect(reader.locator('#docview')).toHaveCSS('--dv-pr-open','#009dff');
 await page.locator('.palette-controls').evaluate(el=>el.scrollTop=0);await page.screenshot({path:testInfo.outputPath('repository-status-defaults-desktop.png'),fullPage:true});
});

test('desktop status colors preview local/imported nodes, save across tabs, reload and reset',async({page,context,server},testInfo)=>{
 await page.setViewportSize({width:1600,height:1100});await page.goto(server.origin+'/status-colors.html');
 const view=page.locator('#palette-view');
 await expect(view.locator('[data-dv-node="active"] .card')).toHaveCSS('stroke','rgb(0, 157, 255)');
 await expect(view.locator('[data-dv-node="shared::imported"] .card')).toHaveCSS('stroke','rgb(0, 157, 255)');
 await expect(view.locator('[data-dv-node="shared::missing"]')).toHaveAttribute('data-live-appearance','missing');
 await expect(view.locator('.dv-live-pr-link[data-pr-state=merged]')).toBeVisible();
 await expect(view.locator('.schip[data-step-source="0"]').first()).toBeVisible();
 await page.getByRole('textbox',{name:'Active hex',exact:true}).fill('#9933cc');
 for(const id of ['active','shared::imported'])await expect(view.locator('[data-dv-node="'+id+'"] .card')).toHaveCSS('stroke','rgb(153, 51, 204)');
 expect(await page.evaluate(()=>localStorage.getItem('flowview.status-colors.v1'))).toBeNull();
 // An independent, ordinary built viewer receives storage events and reloads the saved value.
 const reader=await context.newPage();await reader.goto(server.origin+'/standalone.html');
 await page.getByRole('button',{name:'Save defaults',exact:true}).click();
 await expect(reader.locator('#docview')).toHaveCSS('--dv-live-active','#9933cc');
 await reader.reload();await expect(reader.locator('#docview')).toHaveCSS('--dv-live-active','#9933cc');
 await page.reload();await expect(page.getByRole('textbox',{name:'Active hex',exact:true})).toHaveValue('#9933cc');
 await page.getByRole('textbox',{name:'Blocked hex',exact:true}).fill('#008888');
 for(const skin of ['aurora','terminal','pastel','blueprint','rose','lavender','lilac','daylight','editorial']){
  await page.getByLabel('Preview skin').selectOption(skin);
  const surface=await view.locator('.board').first().evaluate(el=>({ground:getComputedStyle(el).getPropertyValue('--dv-board-ground').trim(),background:getComputedStyle(el).backgroundColor,title:getComputedStyle(document.querySelector('#palette-view .doc-title')).color,page:getComputedStyle(document.querySelector('.palette-preview')).backgroundColor}));
  if(['pastel','rose','lavender','lilac','daylight','editorial'].includes(skin)){expect(surface.background).not.toBe('rgb(11, 18, 32)');expect(surface.title).not.toBe('rgb(255, 255, 255)');}
  expect(surface.ground).not.toBe('');
  if(skin==='aurora')expect(surface.page).toBe('rgb(11, 18, 32)');
  if(skin==='blueprint')expect(surface.page).toBe('rgb(7, 59, 119)');
  const breaks=view.locator('.comm-break');expect(await breaks.count()).toBeGreaterThan(0);
  for(const icon of await breaks.all())await expect(icon).toHaveCSS('stroke','rgb(180, 35, 56)');
 }
 await page.getByLabel('Preview skin').selectOption('pastel');
 await expect(view.locator('.board').first()).toHaveCSS('background-color','rgb(250, 251, 254)');
 await page.screenshot({path:testInfo.outputPath('status-colors-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'Reset all',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Active hex',exact:true})).toHaveValue('#009dff');
 await expect(reader.locator('#docview')).toHaveCSS('--dv-live-active','#9933cc');
 await page.getByRole('button',{name:'Save defaults',exact:true}).click();await expect(reader.locator('#docview')).toHaveCSS('--dv-live-active','#009dff');
 expect(await page.evaluate(()=>localStorage.getItem('flowview.status-colors.v1'))).toBeNull();
});

test('palette imports, exports, invalid edits and storage failure preserve honest save state',async({page,server})=>{
 await page.goto(server.origin+'/status-colors.html');await page.getByText('Import / export colors',{exact:true}).click();
 await page.getByLabel('Palette JSON').fill('{"version":1,"colors":{"live-active":"#abcdef","pr-open":"#123456"}}');await page.getByRole('button',{name:'Import JSON',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Active hex',exact:true})).toHaveValue('#abcdef');
 await expect(page.locator('#palette-view .dv-live-pr-link[data-pr-state=open]').first()).toHaveCSS('color','rgb(18, 52, 86)');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();const exported=await download;expect(exported.suggestedFilename()).toBe('flowview-status-colors.json');
 const stream=await exported.createReadStream();let content='';for await(const chunk of stream)content+=chunk;expect(JSON.parse(content)).toEqual({version:1,colors:{'live-active':'#abcdef','pr-open':'#123456'}});
 await page.getByLabel('Palette JSON').fill('{"version":1,"colors":{"live-active":"#bad"}}');await page.getByRole('button',{name:'Import JSON',exact:true}).click();await expect(page.locator('#palette-message')).toContainText('Import rejected');await expect(page.getByRole('textbox',{name:'Active hex',exact:true})).toHaveValue('#abcdef');
 await page.getByRole('textbox',{name:'Active hex',exact:true}).fill('invalid');await page.getByRole('button',{name:'Save defaults',exact:true}).click();await expect(page.locator('#palette-message')).toContainText('six-digit');expect(await page.evaluate(()=>localStorage.getItem('flowview.status-colors.v1'))).toBeNull();
 await page.getByRole('textbox',{name:'Active hex',exact:true}).fill('#ffffff');
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Storage is full','QuotaExceededError');};});await page.getByRole('button',{name:'Save defaults',exact:true}).click();await expect(page.locator('#palette-message')).toContainText('Could not save defaults');
});


test('native sibling palettes isolate host styles, refresh ink and retire listeners',async({page,server})=>{
 await writeFile(path.join(server.root,'palette-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'palette-native.html'),'<style>#one,#two{width:1000px}</style><div id="one"></div><div id="two"></div><script type="module">import {mountNativeViewer} from "./palette-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/palette-native.html');await page.waitForFunction(()=>!!window.mount);
 const spec={page:{title:'Native palette',sections:[{diagram:{nodes:{a:{title:'Active',tickets:['TEST-1']},b:{title:'Unknown',tickets:['TEST-2'],existsWhen:'tickets-done'}},rows:[['a','b']],edges:[{from:'a',to:'b',tickets:['TEST-1']}]}}]}};
 await page.evaluate(spec=>{
  const names=['storage','flowview-status-colors-change'],add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);window.paletteListeners=new Set();window.paletteHeld=[];
  window.addEventListener=(type,fn,...rest)=>{if(names.includes(type)){window.paletteListeners.add(fn);window.paletteHeld.push(fn);}return add(type,fn,...rest);};
  window.removeEventListener=(type,fn,...rest)=>{if(names.includes(type))window.paletteListeners.delete(fn);return remove(type,fn,...rest);};
  window.viewers=['one','two'].map(id=>window.mount(document.getElementById(id),spec,{skin:'pastel'}));
  window.viewers.forEach(v=>v.controller.liveStatus.apply({'TEST-1':{state:'active'}}));
 },spec);
 const node=page.locator('#one [data-dv-node="a"]');
 await expect(node.locator('.card')).toHaveCSS('stroke','rgb(0, 157, 255)');
 expect(await page.evaluate(()=>window.paletteListeners.size)).toBe(2);
 const change=async color=>page.evaluate(color=>{localStorage.setItem('flowview.status-colors.v1',JSON.stringify({version:1,colors:{'live-active':color,'live-blocked':'#008888'}}));window.dispatchEvent(new CustomEvent('flowview-status-colors-change'));},color);
 await node.evaluate(el=>el.closest('.board').style.setProperty('--dv-board-ground','#777777'));
 await change('#000000');await expect(node.locator('.t1')).toHaveCSS('fill','rgb(255, 255, 255)');
 await change('#ffffff');await expect(node.locator('.t1')).toHaveCSS('fill','rgb(0, 0, 0)');
 await expect(page.locator('#two [data-dv-node="a"] .card')).toHaveCSS('stroke','rgb(255, 255, 255)');
 expect(await page.locator('body').evaluate(el=>el.style.getPropertyValue('--dv-live-active'))).toBe('');
 for(const state of ['todo','active','done','blocked','missing',null]){
  await page.evaluate(state=>window.viewers.forEach(v=>v.controller.liveStatus.apply(state?{'TEST-1':{state}}:{})),state);
  await expect(page.locator('#one .comm-break')).toHaveCSS('stroke','rgb(180, 35, 56)');
 }
 await page.evaluate(()=>window.viewers[0].destroy());expect(await page.evaluate(()=>window.paletteListeners.size)).toBe(1);
 await change('#abcdef');await page.evaluate(()=>window.viewers[1].controller.liveStatus.apply({'TEST-1':{state:'active'}}));await expect(page.locator('#two [data-dv-node="a"] .card')).toHaveCSS('stroke','rgb(171, 205, 239)');
 await page.evaluate(()=>{window.viewers[1].destroy();window.paletteHeld.forEach(fn=>fn(new CustomEvent('flowview-status-colors-change')));});expect(await page.evaluate(()=>window.paletteListeners.size)).toBe(0);
 await expect(page.locator('#one .docview,#two .docview')).toHaveCount(0);
});


test('status appearance preserves legacy saves and controls every local and imported status',async({page,context,server},testInfo)=>{
 await page.setViewportSize({width:1700,height:1200});await page.goto(server.origin+'/status-colors.html');
 const legacy='{"version":1,"colors":{"live-active":"#9933cc"}}';
 await page.evaluate(value=>localStorage.setItem('flowview.status-colors.v1',value),legacy);await page.reload();
 expect(await page.evaluate(()=>localStorage.getItem('flowview.status-colors.v1'))).toBe(legacy);
 await page.getByText('Active border, fill & glow',{exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Active border color',exact:true})).toHaveValue('#9933cc');
 await page.getByRole('textbox',{name:'Active border color',exact:true}).fill('#123456');
 await page.getByRole('slider',{name:'Active border width (px) slider',exact:true}).focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await expect(page.getByRole('spinbutton',{name:'Active border width (px)',exact:true})).toHaveValue('0.5');
 await page.getByRole('spinbutton',{name:'Active border width (px)',exact:true}).fill('5');
 await page.getByRole('spinbutton',{name:'Active fill tint (%)',exact:true}).fill('100');
 await page.getByRole('spinbutton',{name:'Active glow strength (%)',exact:true}).fill('0');
 const view=page.locator('#palette-view');
 for(const id of ['active','shared::imported']){const node=view.locator('[data-dv-node="'+id+'"]');await expect(node.locator('.card')).toHaveCSS('stroke','rgb(18, 52, 86)');await expect(node.locator('.card')).toHaveCSS('stroke-width','5px');await expect(node.locator('.dv-live-halo')).toHaveCSS('opacity','0');}
 for(const pill of await view.locator('.dv-live-state-pill[data-live-appearance=active]').all()){
  await expect(pill).toHaveCSS('border-top-width','5px');expect(await pill.evaluate(el=>getComputedStyle(el,'::before').opacity)).toBe('0');await expect(pill).toHaveCSS('box-shadow','none');
 }
 await page.getByRole('button',{name:'Save defaults',exact:true}).click();
 let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('flowview.status-colors.v1')));
 expect(saved).toEqual({version:2,colors:{'live-active':'#9933cc'},appearance:{'live-active':{borderColor:'#123456',borderWidth:5,fillStrength:100,glowStrength:0}}});
 const reader=await context.newPage();await reader.goto(server.origin+'/standalone.html');await expect(reader.locator('#docview')).toHaveCSS('--dv-live-active-border-width','5px');
 await page.getByRole('button',{name:'Reset Active border color',exact:true}).click();await expect(view.locator('[data-dv-node=active] .card')).toHaveCSS('stroke','rgb(153, 51, 204)');
 await page.getByRole('button',{name:'Save defaults',exact:true}).click();expect(await reader.locator('#docview').evaluate(el=>el.style.getPropertyValue('--dv-live-active-border-color'))).toBe('');
 await page.getByText('Import / export colors',{exact:true}).click();
 const states=['todo','active','done','blocked','missing','unchanged'];
 const palette={version:2,colors:Object.fromEntries(states.map(state=>['live-'+state,'#000000'])),appearance:Object.fromEntries(states.map(state=>['live-'+state,{borderColor:'#008888',borderWidth:4,fillStrength:100,glowStrength:0}]))};
 await page.getByLabel('Palette JSON').fill(JSON.stringify(palette));await page.getByRole('button',{name:'Import JSON',exact:true}).click();
 for(const skin of ['pastel','aurora']){
  await page.getByLabel('Preview skin').selectOption(skin);
  for(const state of states)for(const id of [state,'shared::'+(state==='active'?'imported':state)]){
   const node=view.locator('[data-dv-node="'+id+'"]');await expect(node).toHaveAttribute('data-live-appearance',state);await expect(node.locator('.card')).toHaveCSS('stroke','rgb(0, 136, 136)');await expect(node.locator('.card')).toHaveCSS('stroke-width','4px');await expect(node.locator('.t1')).toHaveCSS('fill','rgb(255, 255, 255)');
   expect(await node.locator('.card').evaluate(el=>getComputedStyle(el).fill)).toMatch(/(?:color\(srgb 0 0 0\)|rgb\(0, 0, 0\))/);
  }
  for(const icon of await view.locator('.comm-break').all())await expect(icon).toHaveCSS('stroke','rgb(180, 35, 56)');
 }
 await page.emulateMedia({media:'print'});await expect(view.locator('[data-dv-node=active] .t1')).toHaveCSS('fill','rgb(255, 255, 255)');await expect(view.locator('[data-dv-node=active] .dv-live-halo')).toHaveCSS('animation-name','none');await page.emulateMedia({media:'screen'});
 await page.getByRole('spinbutton',{name:'Active fill tint (%)',exact:true}).fill('0');await page.getByLabel('Preview skin').selectOption('pastel');await expect(view.locator('[data-dv-node=active] .t1')).toHaveCSS('fill','rgb(0, 0, 0)');
 await page.getByLabel('Preview skin').selectOption('aurora');await expect(view.locator('[data-dv-node=active] .t1')).toHaveCSS('fill','rgb(255, 255, 255)');
 await page.getByLabel('Palette JSON').fill(JSON.stringify({version:2,colors:{'live-active':'#ffffff'},appearance:{'live-active':{fillStrength:101}}}));await page.getByRole('button',{name:'Import JSON',exact:true}).click();await expect(page.locator('#palette-message')).toContainText('Import rejected');await expect(page.getByRole('textbox',{name:'Active hex',exact:true})).toHaveValue('#000000');
 await page.getByRole('spinbutton',{name:'Active border width (px)',exact:true}).fill('9');await page.getByRole('button',{name:'Save defaults',exact:true}).click();await expect(page.locator('#palette-message')).toContainText('highlighted');
 await page.getByRole('spinbutton',{name:'Active border width (px)',exact:true}).fill('4');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();const exported=await download,stream=await exported.createReadStream();let content='';for await(const chunk of stream)content+=chunk;expect(JSON.parse(content).appearance['live-active'].fillStrength).toBe(0);
 await page.getByRole('button',{name:'Reset all',exact:true}).click();await page.getByRole('button',{name:'Save defaults',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('flowview.status-colors.v1'))).toBeNull();await expect(reader.locator('#docview')).toHaveCSS('--dv-live-active','#009dff');expect(await reader.locator('#docview').evaluate(el=>el.style.getPropertyValue('--dv-live-active-border-width'))).toBe('');
 await page.getByLabel('Preview skin').selectOption('pastel');await page.getByRole('spinbutton',{name:'Active glow strength (%)',exact:true}).fill('150');await page.getByRole('spinbutton',{name:'Active fill tint (%)',exact:true}).fill('25');await page.locator('.palette-controls').evaluate(el=>el.scrollTop=0);await page.screenshot({path:testInfo.outputPath('status-appearance-desktop.png'),fullPage:true});
});
