/* Section prose stays in existing text/bullets fields; surrounding source and
   complete bullet subtrees are preserved. */
function planAddProse(text,raw,section,kind){
  var rec=specSectionPaths(raw)[section],sec=rec && specValueAt(raw,rec.section);
  if(!rec || !rec.section.length || !specObject(sec))return {error:'Choose a page section for prose.'};
  if(kind!=='para' && kind!=='bullet')return {error:'Unknown prose kind.'};
  var key=kind==='para'?'text':'bullets',value=sec[key],list;
  if(kind==='para' && typeof value==='string')list=value.length?[value]:[];
  else if(value==null)list=[];
  else if(Array.isArray(value))list=value.slice();
  else return {error:'Correct this section’s '+key+' in JSON before adding.'};
  if(kind==='para' && list.some(function(item){return typeof item!=='string';}))return {error:'Paragraphs must be text strings.'};
  var index=list.length;list.push(kind==='para'?'New paragraph':'New point');
  var plan=Array.isArray(value)?jsonInsertMember(text,rec.section.concat([key]),null,JSON.stringify(list[index])):
    planSetField(text,raw,rec.section,key,JSON.stringify(list,null,2));
  if(!plan || plan.error)return plan || {error:'Could not add prose.'};
  plan.kind=kind;plan.index=index;return plan;
}
function planAddParagraph(text,raw,section){return planAddProse(text,raw,section,'para');}
function planAddBullet(text,raw,section){return planAddProse(text,raw,section,'bullet');}

function planParagraphStructure(text,raw,target,action,expectedText){
  var rec=specSectionPaths(raw)[target.section],sec=rec && specValueAt(raw,rec.section),value=sec && sec.text;
  var list=typeof value==='string'?[value]:Array.isArray(value)?value.slice():[],index=target.index;
  if(target.kind!=='para' || !rec || !rec.section.length || !Number.isInteger(index) || index<0 || index>=list.length ||
    list.some(function(item){return typeof item!=='string';}))return {error:'Select an existing paragraph.'};
  if(expectedText!==undefined && JSON.stringify(value)!==expectedText)return {error:'The paragraphs changed. Select the paragraph again.'};
  var next=index;
  if(action==='before' || action==='after'){
    next=index+(action==='after'?1:0);list.splice(next,0,'New paragraph');
  }else if(action==='up' || action==='down'){
    next=index+(action==='up'?-1:1);if(next<0 || next>=list.length)return {error:'Already at the end of these paragraphs.'};
    list.splice(next,0,list.splice(index,1)[0]);
  }else return {error:'Unknown paragraph action.'};
  var plan=planSetField(text,raw,rec.section,'text',JSON.stringify(list,null,2));
  if(!plan.error)plan.target={kind:'para',section:target.section,index:next};return plan;
}

function planBulletStructure(text,raw,target,action,expectedTree){
  var path=builderTargetPath(raw,target),rec=specSectionPaths(raw)[target.section];
  if(target.kind!=='bullet' || !path || !rec)return {error:'Select an existing bullet.'};
  var treePath=rec.section.concat(['bullets']),tree=specValueAt(raw,treePath);
  if(expectedTree!==undefined && JSON.stringify(tree)!==expectedTree)return {error:'The bullet list changed. Select the point again.'};
  var copy=builderClone(raw),indices=builderBulletIndices(target),index=indices[indices.length-1],parent=path.slice(0,-1);
  var list=specValueAt(copy,parent),item=list[index],next=indices.slice();
  function children(container,at){
    var value=container[at];
    if(typeof value==='string'){value={text:value};container[at]=value;}
    if(!specObject(value) || (value.sub!=null && !Array.isArray(value.sub)))return null;
    if(!value.sub)value.sub=[];return value.sub;
  }
  if(action==='sibling'){list.splice(index+1,0,'New point');next[next.length-1]++;}
  else if(action==='child'){
    var sub=children(list,index);if(!sub)return {error:'Correct this bullet’s children in JSON first.'};
    next.push(sub.length);sub.push('New subpoint');
  }else if(action==='up' || action==='down'){
    var to=index+(action==='up'?-1:1);if(to<0 || to>=list.length)return {error:'Already at the end of this list.'};
    list.splice(index,1);list.splice(to,0,item);next[next.length-1]=to;
  }else if(action==='indent'){
    if(index===0)return {error:'The first point cannot be indented.'};
    var into=children(list,index-1);if(!into)return {error:'Correct the preceding point’s children in JSON first.'};
    next[next.length-1]--;next.push(into.length);list.splice(index,1);into.push(item);
  }else if(action==='outdent'){
    if(indices.length===1)return {error:'This point is already at the top level.'};
    var parentIndex=indices[indices.length-2],outer=specValueAt(copy,path.slice(0,-3));
    list.splice(index,1);outer.splice(parentIndex+1,0,item);next=indices.slice(0,-1);next[next.length-1]++;
  }else return {error:'Unknown bullet action.'};
  var plan=planReplaceValue(text,raw,treePath,JSON.stringify(specValueAt(copy,treePath),null,2));
  if(!plan.error)plan.target={kind:'bullet',section:target.section,index:next[0],bulletPath:next};return plan;
}

function proseFormatEdit(value,start,end,kind,url){
  var text=String(value),a=Math.max(0,Math.min(text.length,start || 0)),b=Math.max(a,Math.min(text.length,end==null?a:end));
  var chosen=text.slice(a,b) || (kind==='block'?'code':'text'),before='',after='';
  if(kind==='bold'){before=after='**';}
  else if(kind==='italic'){before=after='*';}
  else if(kind==='code' || kind==='block'){
    var longest=Math.max.apply(null,[0].concat((chosen.match(/`+/g) || []).map(function(run){return run.length;})));
    var fence='`'.repeat(Math.max(kind==='block'?3:1,longest+1));
    before=kind==='block'?(a && text[a-1]!=='\n'?'\n':'')+fence+'\n':fence;
    after=kind==='block'?'\n'+fence+(b<text.length && text[b]!=='\n'?'\n':''):fence;
    if(kind==='code' && (/^`|`$/.test(chosen) || /^ .* $/.test(chosen))){before+=' ';after=' '+after;}
  }else if(kind==='link'){
    if(typeof url!=='string' || !/^https?:\/\/[^\s)]+$/.test(url) || !isValidLinkBase(url))return {error:'Enter an absolute http or https URL without spaces or a closing parenthesis.'};
    if(/[\]\n]/.test(chosen))return {error:'Link text must be one line without a closing bracket.'};
    before='[';after=']('+url+')';
  }else return {error:'Unknown prose format.'};
  return {text:text.slice(0,a)+before+chosen+after+text.slice(b),start:a+before.length,end:a+before.length+chosen.length};
}
