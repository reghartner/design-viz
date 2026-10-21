'use strict';
// A tab with shared story content and independently authored Standard/Explore
// arrangements, as emitted by the workbench agent. Variants cover older JSON.
module.exports=function arrangeViews(kind='named'){
  const grid={default:[{x:0,y:2,w:8,h:14},{panel:'home',x:8,y:20,w:4,h:8},
    {controls:'steps',attachTo:'diagram',x:0,y:16,w:8,h:6}],
    confluence:[{x:0,y:0,w:12,h:18},{panel:'home',x:0,y:24,w:12,h:9},
      {controls:'steps',attachTo:'diagram',x:0,y:18,w:12,h:6}]};
  const diagram={view:'step',autoplay:false,nodes:{doorbell:{title:'Doorbell'},api:{title:'Event API'},store:{title:'Recording store'}},
    rows:[['doorbell','api','store']],edges:[{from:'doorbell',to:'api',kind:'https'},{from:'api',to:'store',kind:'write'}],
    panels:[{id:'home',type:'homemap',title:'Home',outline:{w:280,h:160},rooms:[],devices:[{id:'camera',kind:'camera',x:30,y:90}],subjects:[]}],
    steps:[{id:'press',edge:'doorbell->api',text:'A visitor presses the doorbell.'},{id:'record',edge:'api->store',text:'Save the recording.'},{id:'failure',failures:{'doorbell->api':'dropped'},text:'The request times out.'}],
    paths:[{id:'happy',label:'Happy path',steps:['press','record']},{id:'failed',label:'Failure',steps:['failure']}],
    layouts:[{id:'standard-layout',name:'Standard',presentation:'standard',paths:['happy'],steps:['record'],sectionLayout:grid},
      {id:'explore-layout',name:'Explore',presentation:'explore',paths:['happy','failed'],steps:['press','record','failure'],sectionLayout:JSON.parse(JSON.stringify(grid)),
        exploreLayout:{panels:[{panel:'home',x:.65,y:.15,w:.3,h:.4}],controls:{x:.1,y:.75,w:.5,h:.2},camera:{zoom:.8,x:30,y:20}}}],defaultLayout:'standard-layout'};
  const tab={label:'Delivery',sections:[{id:'delivery',heading:'Visitor event delivery',text:'Follow a visitor event from the camera to durable storage.',diagram}],
    views:[{id:'standard',name:'Standard',presentation:'standard',sections:[{section:'delivery',layout:'standard-layout'}]},
      {id:'explore',name:'Explore',presentation:'explore',sections:[{section:'delivery',layout:'explore-layout'}]}],defaultView:'explore'};
  if(kind==='canonical-shared')tab.views[0].sections[0].layout='explore-layout';
  if(kind==='legacy-named'){delete tab.views;delete tab.defaultView;diagram.defaultLayout='explore-layout';}
  if(kind==='legacy-grid' || kind==='automatic'){
    tab.views.forEach(view=>{view.sections=['delivery'];});
    delete diagram.layouts;delete diagram.defaultLayout;
    if(kind==='legacy-grid'){diagram.sectionLayout=grid;diagram.layoutName='Delivery grid';}
  }
  return {page:{title:'Doorbell event delivery',blocks:[{tabs:[tab]}]}};
};
