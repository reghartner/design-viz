/* Authored review metadata never participates in runtime state folding. */
var DESIGN_STATUS = {proposed:{label:'Proposed',symbol:'+'},open:{label:'Open',symbol:'?'},decided:{label:'Decided',symbol:'✓'}};
var STEP_VERDICTS = {keep:'Keep',replace:'Replace',open:'Open'};
function reviewStatus(value){return value && typeof value.status==='string' && Object.prototype.hasOwnProperty.call(DESIGN_STATUS,value.status)?value.status:null;}
function reviewBaseline(value){return !!value && value.presentation==='baseline';}
function reviewEdgeBaseline(d,e){
  if(reviewBaseline(e))return true;
  /* A new or unresolved connection must stand out even between old services. */
  if(e.status==='proposed' || e.status==='open')return false;
  return reviewBaseline(d.nodes && d.nodes[e.from]) && reviewBaseline(d.nodes && d.nodes[e.to]);
}
function reviewMetadataErrors(value,path,errors){
  if(value.status!==undefined && !reviewStatus(value))errors.push(path+'.status: use proposed, open, or decided');
  if(value.presentation!==undefined && value.presentation!=='baseline')errors.push(path+'.presentation: use baseline, or omit for ordinary presentation');
}
/* Alignment is the full authored ordinal, even when a view hides some stops.
   No recursive expansion or patch inheritance: each sequence folds itself. */
function pathReviewComparison(d,pathId){
  var paths=diagramPathList(d),current=paths.find(function(p){return p.id===pathId;});
  if(!current || !current.basedOn)return null;
  var base=paths.find(function(p){return p.id===current.basedOn;}),seen=new Set([current.id]),at=base;
  if(!base)return null;
  while(at){
    if(seen.has(at.id))return null;
    seen.add(at.id);
    if(!at.basedOn)break;
    at=paths.find(function(p){return p.id===at.basedOn;});
    if(!at)return null;
  }
  var rows=[];
  for(var i=0;i<Math.max(base.indices.length,current.indices.length);i++){
    var bi=base.indices[i],ci=current.indices[i];
    rows.push({position:i,baseIndex:bi===undefined?null:bi,currentIndex:ci===undefined?null:ci,
      base:bi===undefined?null:d.steps[bi],current:ci===undefined?null:d.steps[ci]});
  }
  return {base:base,current:current,rows:rows};
}
