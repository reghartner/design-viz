'use strict';
/* Overlapping export arrays cross two provider levels before review rendering. */
module.exports=function reviewImports(){
  const page=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/review'},sections:[{id:'main',diagram}]}});
  const provider=page('provider',{nodes:{api:{title:'API'},store:{title:'Event store',status:'decided'},old:{title:'Old store'}},rows:[['api','store','old']],edges:[{from:'api',to:'store',label:'Persist'},{from:'store',to:'old',label:'Replicate'}],topologyExports:{front:{nodes:['api','store'],edges:['api->store']},storage:{nodes:['store','old'],edges:['store->old']}}});
  const middle=page('middle',{topologyImports:[{spec:'provider',export:['front','storage'],as:'base'}],topologyExports:{front:{nodes:['base::api','base::store'],edges:['base::api->base::store']},storage:{nodes:['base::store','base::old'],edges:['base::store->base::old']}}});
  const consumer=page('consumer',{nodes:{local:{title:'Proposed client',status:'proposed'}},rows:[['local']],view:'ambient',autoplay:false,edges:[{from:'local',to:'shared::base::api',status:'proposed',label:'New route'}],topologyImports:[{spec:'middle',export:['front','storage'],as:'shared',presentation:'baseline',nodeOverrides:{'base::api':{title:'Event intake service',sub:'Ingests events'},'base::old':{title:'Hidden audit storage',hidden:true}}}]});
  return [consumer,middle,provider];
};
