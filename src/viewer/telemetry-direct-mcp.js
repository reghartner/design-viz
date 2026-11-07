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
      if(tools.length!==1)FlowTraceConnections.fail('schema','The exact configured detail tool is absent or ambiguous.');
      var annotations=tools[0].annotations || {};if(annotations.readOnlyHint===false || annotations.destructiveHint===true)FlowTraceConnections.fail('schema','Discovered detail tool is marked write/destructive.');
      var described=await telemetryDescribeTools(claude,mcp,p.server,tools,active);if(!active())throw {code:'capability_removed'};
      contracts.set(request,mcp);return described[0];
    },
    call:async function(request,args,signal){var mcp=contracts.get(request);contracts.delete(request);if(!mcp || signal.aborted)throw {code:'capability_removed'};return mcp.callTool(request.profile.server,request.profile.tool,args,{signal:signal});}
  };
}
