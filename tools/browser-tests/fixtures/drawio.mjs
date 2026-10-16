import {deflateRawSync} from 'node:zlib';
export const model='<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>'+
  '<mxCell id="g" value="Order service" style="group" vertex="1" parent="1"><mxGeometry x="80" y="100" width="500" height="200" as="geometry"/></mxCell>'+
  '<UserObject id="a" label="&lt;b&gt;Receive order&lt;/b&gt;" owner="ops"><mxCell style="rounded=1;html=1;" vertex="1" parent="g"><mxGeometry x="30" y="50" width="160" height="60" as="geometry"/></mxCell></UserObject>'+
  '<object id="b" label="Dispatch"><mxCell vertex="1" parent="g"><mxGeometry x="300" y="50" width="160" height="60" as="geometry"/></mxCell></object>'+
  '<mxCell id="e" value="approved" edge="1" parent="g" source="b" target="a" style="startArrow=block;endArrow=none;"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="260" y="80"/></Array></mxGeometry></mxCell>'+
  '</root></mxGraphModel>';
export const secondModel='<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Second page node" vertex="1" parent="1"><mxGeometry x="20" y="30" width="160" height="60" as="geometry"/></mxCell></root></mxGraphModel>';
export const compressed=xml=>deflateRawSync(Buffer.from(encodeURIComponent(xml))).toString('base64');
export const multi='<mxfile><diagram id="orders" name="Orders">'+model+'</diagram><diagram id="second" name="Second page">'+compressed(secondModel)+'</diagram></mxfile>';
export const compressedFile='<mxfile><diagram id="compressed" name="Compressed orders">'+compressed(model)+'</diagram></mxfile>';
export const original=JSON.stringify({page:{title:'Retained source',sections:[{heading:'Retained',text:['Keep this prose'],diagram:{nodes:{pin:{title:'Locked existing'}},rows:[[]],floats:[{id:'pin',side:'below',x:75,y:300,locked:true,noSpread:true}],edges:[],steps:[]}}]}},null,2);
