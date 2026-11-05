// Test namespace boundary backed by the actual checked-in mock handlers.
// No copied tool schema or happy-path response; no network or deployment.
import {handleMcp as honeycomb} from '../../deploy/cloudflare/mock-honeycomb-mcp/mcp.mjs';
import {handleMcp as grafana} from '../../deploy/cloudflare/mock-grafana-mcp/mcp.mjs';
import timeline from '../../examples/live-status/live-status.timeline.json' with {type:'json'};
export const EVENT_QUERY='sum(rate(http_server_requests_total{service="event-ingest",route="/v1/events"}[5m]))*3600';
export const nativeQuery=(carrier='mcu->ingest')=>({calculations:[{op:'AVG',column:'flowview.value'}],filters:[{column:'flowview.carrier',op:'=',value:carrier},{column:'flowview.signal',op:'=',value:'rate'}]});
export function expected(day=11,carrier='mcu->ingest',hours=24){
 const values=timeline.days[day].telemetry.carriers[carrier].rate.values.slice(-hours).filter(v=>v!==null);
 return values.length?values.reduce((a,b)=>a+b,0)/values.length:undefined;
}
export function createMockBridge({day=11,transport='structuredContent',absent=false}={}){
 let id=0;const calls=[];const bridge={day,calls,lists:0};
 const rpc=(handler,method,params)=>handler({jsonrpc:'2.0',id:++id,method,params},{scenario:'story',day:bridge.day});
 bridge.listTools=async()=>{bridge.lists++;return absent?[]:[{server:'Grafana',tools:rpc(grafana,'tools/list').result.tools},{server:'Honeycomb',tools:rpc(honeycomb,'tools/list').result.tools}];};
 bridge.callTool=async(server,name,args)=>{
  calls.push({server,name,args:structuredClone(args)});
  const response=rpc(server==='Honeycomb'?honeycomb:grafana,'tools/call',{name,arguments:args});
  if(response.error)throw Object.assign(new Error(response.error.message),{code:'tool_error'});
  const result=response.result;
  if(server==='Honeycomb')return transport==='payload'&&!result.isError?{payload:result.structuredContent}:result;
  if(result.isError)throw Object.assign(new Error(result.content[0].text),{code:'tool_error'});
  if(result.structuredContent)return {payload:result.structuredContent};
  const text=result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
  try{return {payload:JSON.parse(text)};}catch{return {payload:text};}
 };
 return bridge;
}
