'use strict';
const fixture=()=>({page:{title:'Visibility evidence',sections:[{id:'arrival',heading:'Arrival',diagram:{
 view:'step',autoplay:false,nodes:{n:{title:'Camera'}},rows:[['n']],
 panels:[{id:'app',type:'deviceapp',title:'App',fields:[{id:'battery',label:'Battery',kind:'battery'}],initial:{phoneScreen:'home',battery:{value:20,status:'ready'}}},{id:'state',type:'state',title:'State',states:['Idle'],initial:{state:'Idle'}}],
 steps:[{id:'wait',text:'Wait',nodes:['n']},{id:'open',text:'Open app',panels:{app:{phoneScreen:'app'}}},{id:'hide-card',text:'Hide card',panels:{app:{battery:{visible:false}}}},{id:'hide-panel',text:'Hide panel',panelVisibility:{app:false}},{id:'restore',text:'Restore',panels:{app:{battery:{visible:true}}},panelVisibility:{app:true}},{id:'shared',text:'Shared',nodes:['n']}],
 paths:[{id:'happy',steps:['wait','open','hide-card','hide-panel','restore','shared']},{id:'offline',steps:['wait','shared']}],
 layouts:[{id:'story',name:'Story',sectionLayout:{columns:24,default:[{panel:'app',x:0,y:0,w:16,h:18},{panel:'state',x:16,y:0,w:8,h:6},{x:16,y:6,w:8,h:6},{controls:'steps',x:0,y:18,w:24,h:4,attachTo:'panel:app'}]}},{id:'summary',name:'Summary',paths:['happy'],steps:['wait','shared'],sectionLayout:{columns:24,default:[{panel:'app',x:0,y:0,w:16,h:18,hidden:true}]}}],defaultLayout:'story'
}}]}});
const expectation=(patch={})=>({section:'arrival',view:'story',path:'happy',step:'open',panel:'app',field:'battery',visible:true,...patch});
module.exports={fixture,expectation};
