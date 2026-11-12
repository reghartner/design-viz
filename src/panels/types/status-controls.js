/* #1371: Status controls. The controls that change what the canvas shows (Jira | Trace, Env, the Metrics overlay and
   its style, Refresh now, Live | Over time, the day row) and the connector lines (refreshed time, Demo, Snapshot), in a
   panel of their own so a reader can hide the Status panel, for example in Explore. It drives the same live-status
   controller as the Status panel, which leaves these controls out while this panel is shown and draws them again when
   it is hidden, not in the current View or absent. Opt-in; no authored state. */
(function(){
  function empty(){return {};}
  var SAMPLE='<div class="dv-status-header"><div class="dv-status-top"><div class="dv-status-modes dv-status-segmented" role="group" aria-label="Status view">'+
    '<button type="button" class="tbtn reader-button dv-status-mode" aria-pressed="true">Jira</button><button type="button" class="tbtn reader-button dv-status-mode" aria-pressed="false">Trace</button></div></div>'+
    '<div class="dv-live-time dv-status-segmented" role="group" aria-label="Status time"><button type="button" class="tbtn reader-button dv-live-toggle" aria-pressed="true">Live</button><button type="button" class="tbtn reader-button dv-live-over-time">Over time</button></div></div>'+
    '<div class="dv-live-status dv-status-controls-status"><div class="dv-live-status-text"><span class="dv-live-connection" data-state="demo"><i class="dv-live-connection-dot"></i><span>Demo, refreshed 10:42</span></span></div></div>';
  PanelRegistry.define('status-controls',{
    label:'Status controls',since:'0.2.0',
    validateDeclaration:function(panel,path,warnings,errors,diagram){
      if(Object.prototype.hasOwnProperty.call(panel,'initial'))warnings.push(path+'.initial: status controls have no authored state');
      (diagram && diagram.steps || []).forEach(function(step,index){var patch=stepPanelPatch(step);
        if(patch && Object.prototype.hasOwnProperty.call(patch,panel.id) && !panelObject(patch[panel.id]))
          warnings.push(path.replace(/\.panels\[\d+\]$/,'')+'.steps['+index+'].panels.'+panel.id+': status controls have no authored state');
      });
    },
    validatePatch:function(patch,path,panel,warnings){warnings.push(path+': status controls have no authored state');},
    fold:function(panel,steps){return foldSanitizedPanelStates(panel,steps,empty).map(empty);},
    presentation:{ambientInitial:true},
    layout:{height:4,fallbackHeight:4,supporting:false,large:false,attachControls:false,
      canvasSizing:{mode:'content-fit',maxHeight:360,resizeAxis:'width'},
      sectionSizing:{minWidth:320,preferredWidth:480,maxWidth:880,aspectPolicy:'content',grow:1,height:'content'}},
    render:function(host,panel,state){return state && state.controlsSample?{html:SAMPLE}:
      {html:'<div class="dv-status-header"></div>',mounted:function(){if(typeof liveStatusPanelMount==='function')liveStatusPanelMount(host,'controls');}};},
    authoring:{template:{title:'Status controls'},setupFields:[],patchFields:[],
      picker:{name:'Status controls',category:'Delivery',tagline:'Change what the board shows',description:'Jira, Metrics and Trace, Live or Over time, the day and Refresh in a small panel of their own, so the Status panel can be hidden (for example in Explore). Add it beside a Live status panel.'},
      example:function(sample){sample.state.controlsSample=true;return sample;}}
  });
})();
