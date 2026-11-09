/* Portable artifact transport. Only explicit Load/Verify invokes these methods.
   Discovery never searches for approximate names or acquires credentials. */
function createTelemetryDirectMcp(win){
  if(!win || !win.claude || typeof win.claude.use!=='function')return null;
  var contracts=new WeakMap();
  return {
    describe:async function(request,signal){
      var p=request.profile,claude=win.claude;
      function active(){return !signal.aborted;}
      var mcp=await claude.use('mcp');if(!active())throw {code:'capability_removed'};
      var list=await mcp.listTools();if(!active())throw {code:'capability_removed'};
      var servers=telemetryGrafanaListed(list).filter(function(s){return (s.server || s.name)===p.server;});
      if(servers.length!==1)FlowTraceConnections.fail('schema','The exact configured connector is absent or ambiguous.');
      var tools=(servers[0].tools || []).filter(function(t){return t.name===p.tool;});
      if(tools.length!==1)FlowTraceConnections.fail('schema',p.tool==='run_query'?'The configured connector offers no single run_query tool.':'The exact configured detail tool is absent or ambiguous.');
      var annotations=tools[0].annotations || {};if(annotations.readOnlyHint===false || annotations.destructiveHint===true)FlowTraceConnections.fail('schema','Discovered detail tool is marked write/destructive.');
      var described=await telemetryDescribeTools(claude,mcp,p.server,tools,active);if(!active())throw {code:'capability_removed'};
      contracts.set(request,mcp);return described[0];
    },
    call:async function(request,args,signal){var mcp=contracts.get(request);contracts.delete(request);if(!mcp || signal.aborted)throw {code:'capability_removed'};return mcp.callTool(request.profile.server,request.profile.tool,args,{signal:signal});},
    // Log lookups (#1099): the connector qualified by query_loki_logs, as for
    // loki signals (telemetryGrafanaServer). Listing reads tool metadata only.
    logsConnector:async function(){var mcp=await win.claude.use('mcp');if(!mcp)throw {code:'capability_disabled'};return telemetryGrafanaServer(await mcp.listTools(),['query_loki_logs']);},
    queryLogs:async function(args,signal){
      function check(){if(signal.aborted)throw {code:'capability_removed'};}
      var mcp=await win.claude.use('mcp');check();if(!mcp)throw {code:'capability_disabled'};
      var list=await mcp.listTools();check();var server=telemetryGrafanaServer(list,['query_loki_logs']);if(!server)throw {code:'server_not_found'};
      var tool=telemetryGrafanaListed(list).filter(function(s){return (s.server || s.name)===server;}).map(function(s){return (s.tools || []).find(function(t){return t && t.name==='query_loki_logs';});})[0],annotations=tool && tool.annotations || {};
      if(annotations.readOnlyHint===false || annotations.destructiveHint===true)FlowTraceConnections.fail('schema','The Grafana query_loki_logs tool is marked write/destructive.');
      var answer=await mcp.callTool(server,'query_loki_logs',args,{signal:signal});check();return telemetryGrafanaPayload(answer);
    }
  };
}
