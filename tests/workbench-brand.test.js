'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');

function element(tag='div'){
  const node={tag,children:[],options:[],attributes:{},className:'',textContent:'',
    appendChild(child){node.children.push(child);return child;},
    setAttribute(name,value){node.attributes[name]=String(value);}};
  let html='';Object.defineProperty(node,'innerHTML',{get(){return html;},set(value){html=String(value);}});
  return node;
}
function setup(options={}){
  const c=vm.createContext({URL});
  vm.runInContext(readSource('validator.js'),c);
  c.builderClone=value=>JSON.parse(JSON.stringify(value));
  vm.runInContext(readSource('workbench/brand.js'),c);
  const fields=[],actions=[],changes=[];
  const controls={
    row(label,control){const row=element('row');row.label=label;row.control=control;return row;},
    action(label,fn){const action=element('button');action.label=label;action.run=fn;actions.push(action);return action;},
    text(value,commit,opts){const input=element('input');Object.assign(input,{value,commit,opts});fields.push(input);return input;},
    select(values,current,commit){const select=element('select');select.value=current;select.commit=commit;select.options=values.map(value=>({value,textContent:''}));return select;}
  };
  const fold=c.createFlowBrandControl({document:{createElement:element},controls,iconPicker:value=>value,
    global:c.FlowBrand.global(),shared:options.shared,local:options.local,
    source:()=>'',listen(){},onRetire(){},error:assert.fail,
    change(shared,value){changes.push({shared,value});return true;}});
  return {c,fold,fields,actions,changes,mode:fold.children[1].control};
}

test('workbench previews inherited global values without copying them into authored overrides',()=>{
  const h=setup();
  const preview=h.fold.children.find(child=>child.className==='fv-brand-preview');
  assert.match(preview.innerHTML,/YOUR COMPANY/);assert.match(preview.innerHTML,/YC/);
  assert.equal(h.fields[0].value,undefined);assert.equal(h.fields[0].opts.placeholder,'YOUR COMPANY');
  h.mode.commit('panel');
  assert.deepEqual(JSON.parse(JSON.stringify(h.changes)),[{shared:false,value:{}}]);
  assert.doesNotMatch(JSON.stringify(h.changes),/YOUR COMPANY|6750A4/);
});

test('workbench keeps diagram and panel opt-outs explicit',()=>{
  const inherited=setup({shared:{app:'Diagram'}});
  inherited.actions.find(action=>action.label==='Hide global brand in this diagram').run();
  assert.deepEqual(inherited.changes,[{shared:true,value:false}]);
  inherited.mode.commit('none');
  assert.deepEqual(inherited.changes.at(-1),{shared:false,value:false});

  const disabled=setup({shared:false});
  assert.match(disabled.fold.children.find(child=>child.className==='fnote').textContent,/off for this diagram/);
  disabled.actions.find(action=>action.label==='Restore global brand for this diagram').run();
  assert.deepEqual(disabled.changes,[{shared:true,value:null}]);
});
