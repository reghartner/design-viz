import {test as base,expect,pastePage,inspectPageElement} from '../helpers/test.mjs';
import {projectFiles} from '../helpers/project-export.mjs';
import {createServer} from 'node:http';
import {readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import fixture from '../../../tests/helpers/company-icons.cjs';
const {scratchFork,supplyIcons,buildFork,spec,beaconPath,relayPath}=fixture;
// Build a real fork, never inject/mock FlowIcons or populate the upstream company/.
// This server is independent of globalSetup's no-config upstream build.
const test=base.extend({server:[async({},use)=>{
 const root=scratchFork();
 let server;
 try{
  supplyIcons(root);buildFork(root);
  await writeFile(path.join(root,'native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./native.js";window.mount=mountNativeViewer;</script>');
  server=createServer(async(req,res)=>{
   try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))throw Error('Outside fixture root');
    const bytes=await readFile(file);res.writeHead(200,{'Content-Type':path.extname(file)==='.js'?'text/javascript':path.extname(file)==='.html'?'text/html':'application/json'});res.end(bytes);
   }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await use({root,origin:'http://127.0.0.1:'+server.address().port});
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
},{scope:'worker',timeout:120000}]});

async function geometry(icon,d){await expect(icon.locator('path').first()).toHaveAttribute('d',d);}
async function nodeGeometry(root,id,icon,d){
 const node=root.locator('.node[data-dv-node="'+id+'"]');
 await expect(node.locator('use').first()).toHaveAttribute('href','#i-'+icon);
 await geometry(root.locator('symbol#i-'+icon),d);
 // Check that the referenced sprite has rendered an actual shape.
 expect(await node.locator('use').first().evaluate(el=>el.getBBox().width)).toBeGreaterThan(0);
}

test('fork icons are selectable on desktop and survive saved JSON, exported HTML and a native ShadowRoot',async({page,context,server},info)=>{
 await page.addInitScript(()=>{window.showDirectoryPicker=undefined;});
 await page.goto(server.origin+'/workbench/flowspec.html');await pastePage(page,JSON.stringify(spec(),null,2));
 const root=page.locator('#docview');
 await nodeGeometry(page,'beacon','acme-beacon',beaconPath);
 await geometry(root.locator('.pt-deviceapp .da-icon'),beaconPath);
 await geometry(root.locator('.doc-company-brand .fv-brand-mark'),beaconPath);
 await inspectPageElement(page,root.locator('.node[data-dv-node="beacon"]'));
 await page.locator('#guide .flow-icon-browse').first().click();
 const dialog=page.locator('dialog.flow-icon-picker');
 await dialog.locator('.flow-icon-category').selectOption('Acme equipment');
 await expect(dialog.locator('[data-icon-id]:not([data-icon-id=""])')).toHaveCount(2);
 await geometry(dialog.locator('[data-icon-id="acme-relay"] svg'),relayPath);
 await expect(dialog.locator('[data-icon-id="acme-relay"]')).toContainText('Acme relay');
 await dialog.locator('[data-icon-id="acme-relay"]').click();
 await nodeGeometry(page,'beacon','acme-relay',relayPath);
 expect(JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.nodes.beacon.icon).toBe('acme-relay');
 await inspectPageElement(page,root.locator('.pt-deviceapp .ptitle'));
 const brand=page.locator('#guide .fv-brand-editor');await brand.locator('summary').click();
 await brand.locator('.flow-icon-browse').click();await dialog.locator('[data-icon-id="acme-beacon"]').click();
 await geometry(root.locator('.pt-deviceapp .fv-brand-mark'),beaconPath);
 await page.screenshot({path:info.outputPath('fork-icons-desktop.png')});
 const pending=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();
 const files=await projectFiles(await pending),saved=JSON.parse(Object.entries(files).find(([name])=>name.endsWith('.spec.json'))[1]);
 expect(saved.page.sections[0].diagram.nodes.beacon.icon).toBe('acme-relay');
 expect(saved.page.sections[0].diagram.brand.icon).toBe('acme-beacon');
 expect(saved.page.flowview.features).toContain('media.shared-icons');
 const html=Object.entries(files).find(([name])=>name.endsWith('.html'))[1];
 expect(html).toContain(beaconPath);expect(html).toContain(relayPath);
 await writeFile(path.join(server.root,'exported.html'),html);
 const viewer=await context.newPage();await viewer.goto(server.origin+'/exported.html');
 await nodeGeometry(viewer,'beacon','acme-relay',relayPath);await geometry(viewer.locator('.pt-deviceapp .da-icon'),beaconPath);
 await viewer.getByRole('button',{name:'Next step',exact:true}).click();await geometry(viewer.locator('.pt-deviceapp .da-icon'),relayPath);
 await viewer.close();
 await page.goto(server.origin+'/native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw,{skin:'pastel'});},saved);
 const host=page.locator('#host');expect(await host.evaluate(el=>!!el.shadowRoot)).toBe(true);
 await nodeGeometry(host,'beacon','acme-relay',relayPath);await geometry(host.locator('.pt-deviceapp .da-icon'),beaconPath);
 await geometry(host.locator('.pt-deviceapp .fv-brand-mark'),beaconPath);
 await host.getByRole('button',{name:'Next step',exact:true}).click();await geometry(host.locator('.pt-deviceapp .da-icon'),relayPath);
 await host.getByRole('button',{name:'Previous step',exact:true}).click();await geometry(host.locator('.pt-deviceapp .da-icon'),beaconPath);
 await page.screenshot({path:info.outputPath('fork-icons-native.png')});
});
