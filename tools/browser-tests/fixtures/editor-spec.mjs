export function editorSpec(){return {page:{title:'Browser contract',blocks:[{heading:'Delivery',diagram:{
  view:'step',autoplay:false,nodes:{a:{title:'Doorbell'},b:{title:'Backend'},c:{title:'Storage'}},rows:[['a','b','c']],edges:[{from:'a',to:'b',kind:'https'}],
  panels:[{id:'home',type:'homemap',title:'Home',outline:{w:280,h:160},rooms:[],devices:[{id:'doorbell',kind:'camera',x:30,y:90}],subjects:[]}],
  steps:[{id:'press',edge:'a->b',text:'Button pressed'},{id:'done',nodes:['b'],text:'Recording ready'},{id:'failed',failures:{'a->b':'dropped'},text:'Exact hidden failure'}],
  paths:[{id:'happy',label:'Happy path',steps:['press','done']},{id:'failed',label:'Failure',steps:['failed']}],
  layouts:[{id:'brief',name:'Business',steps:['done'],sectionLayout:{default:[{x:0,y:0,w:8,h:14},{panel:'home',x:8,y:0,w:4,h:8},{controls:'steps',attachTo:'diagram',x:0,y:14,w:8,h:6}]}}],defaultLayout:'brief',
}}]}};}
export const source=JSON.stringify(editorSpec(),null,2).replace('"title": "Browser contract"','"title"  :  "Browser contract"');
