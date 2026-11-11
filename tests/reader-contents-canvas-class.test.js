'use strict';
/* #1318: the Workbench canvas class that replaced `.workspace-canvas:has(#docview.has-reader-contents)`
   follows the reader Contents lifecycle exactly.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| C1 | Creating Contents on #docview inside .workspace-canvas adds workspace-docview-contents beside has-reader-contents; destroy() removes both. | fake DOM: body.workspace-canvas > #docview > nav | class strings after create and after destroy | a class left behind (zoom buttons stay hidden), or never set |
| C2 | Contents on any other view, or a #docview outside a Workbench canvas, leaves the canvas classes alone. | view #page-preview-view; #docview under a plain body | body class string unchanged through create and destroy | a reader preview or standalone reader writing Workbench state |
Class strings are compared, never elements (fake elements in assert diffs can exhaust memory). */
const test=require('node:test'),assert=require('node:assert/strict');
const {viewerEnvironment}=require('./helpers/fake-viewer-dom.js');

function contents(env,viewId,canvas){
  env.doc.body.className=canvas?'workspace-canvas':'';
  const {view,nav,ctl}=env.view(viewId,false);
  return {body:env.doc.body,view,instance:env.C.createReaderContents(ctl,nav,env.element('div'),{})};
}

test('C1 Contents on #docview inside the Workbench canvas sets workspace-docview-contents and destroy() removes it',()=>{
  const {body,view,instance}=contents(viewerEnvironment({stubSearch:true}),'docview',true);
  assert.equal(view.className,'has-reader-contents');
  assert.equal(body.className,'workspace-canvas workspace-docview-contents','the canvas mirrors reader Contents');
  instance.destroy();
  assert.equal(view.className,'');
  assert.equal(body.className,'workspace-canvas','destroy() removes the mirror, so the zoom buttons come back');
});

test('C2 other views and a #docview outside a Workbench canvas leave the canvas classes alone',()=>{
  const env=viewerEnvironment({stubSearch:true});
  for(const [id,canvas,expected] of [['page-preview-view',true,'workspace-canvas'],['docview',false,'']]){
    const {body,instance}=contents(env,id,canvas);
    assert.equal(body.className,expected,id+(canvas?' in the canvas':' outside a canvas')+' after create');
    instance.destroy();
    assert.equal(body.className,expected,id+' after destroy');
  }
});
