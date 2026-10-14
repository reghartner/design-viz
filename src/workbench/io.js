/* Import/export controls and their independent asynchronous lifetimes. */
function createBuilderFileOpening(opts,current){
  // Capture before the native read, so neither a slow reader nor provider fetch
  // can replace a newer draft. The caller owns file selection/navigation lifetime.
  var expected=opts.session.snapshot();
  function active(){
    if(!opts.alive() || !current())return false;
    var now=opts.session.snapshot();
    return now.project===expected.project && now.text===expected.text && now.topologyRevision===expected.topologyRevision;
  }
  async function stage(source){
    if(!active())return false;
    var context=await opts.prepare(source);
    return active()?context:false;
  }
  function publish(source,context){return active()?opts.publish(source,context):false;}
  return {current:active,stage:stage,publish:publish,open:async function(source){
    var context=await stage(source);return context===false?false:publish(source,context);
  }};
}

/* One controller is mounted for each visible drop surface. Reading and
   preparation are staged; only the confirmation button owns publication. */
function createStagedFileImport(opts){
  var document=opts.document,browser=opts.browser,surface=opts.surface,input=opts.input,trigger=opts.trigger;
  var disposed=false,version=0,reader=null,decoder=null,depth=0,pending=null,returnFocus=null;
  function element(tag,cls){var node=document.createElement(tag);node.className=cls;return node;}
  var overlay=element('div','file-drop-overlay');overlay.hidden=true;overlay.setAttribute('aria-hidden','true');overlay.textContent='Drop to preview import';
  var status=element('p','file-import-status');status.hidden=true;status.setAttribute('role','alert');
  var dialog=element('dialog','file-import-dialog');dialog.setAttribute('aria-label','Import preview');
  var title=element('h2','');title.textContent='Import preview';
  var detail=element('p','file-import-detail'),summary=element('p','file-import-summary');
  var actions=element('div','file-import-actions'),confirm=element('button','welcome-button welcome-button-primary'),cancel=element('button','welcome-button');
  confirm.type=cancel.type='button';confirm.textContent='Import';cancel.textContent='Cancel';actions.appendChild(confirm);actions.appendChild(cancel);
  dialog.appendChild(title);dialog.appendChild(detail);dialog.appendChild(summary);dialog.appendChild(actions);
  document.body.appendChild(overlay);document.body.appendChild(status);document.body.appendChild(dialog);
  var listeners=[];
  function listen(target,type,fn,capture){target.addEventListener(type,fn,capture);listeners.push(function(){target.removeEventListener(type,fn,capture);});}
  function active(){return !disposed && surface && surface.isConnected && (!opts.active || opts.active());}
  function message(text){if(!active())return;status.textContent=text;status.hidden=false;if(opts.message)opts.message(text);}
  function durableMessage(text){
    var target=opts.durableStatus;
    if(!target || !target.isConnected)return false;
    target.textContent=text;target.hidden=false;return true;
  }
  function clearDurable(){var target=opts.durableStatus;if(target){target.textContent='';target.hidden=true;}}
  function external(ev){
    var dt=ev.dataTransfer;if(!dt)return false;
    var types=Array.from(dt.types || []);if(types.indexOf('Files')<0)return false;
    var items=Array.from(dt.items || []);return !items.length || items.some(function(item){return item.kind==='file';});
  }
  function hideOverlay(){depth=0;overlay.hidden=true;}
  function cancelRead(){version++;if(reader && reader.abort)reader.abort();reader=null;if(decoder)decoder.abort();decoder=null;}
  function close(refocus){pending=null;if(dialog.open)dialog.close();if(refocus && returnFocus && returnFocus.isConnected)returnFocus.focus();returnFocus=null;}
  function retire(reason){var had=!!reader || !!decoder || !!pending || dialog.open;cancelRead();hideOverlay();close(false);if(had && reason)message(reason);}
  async function loaded(file,text,run,opening){
    if(!active() || run!==version)return;
    try{
      /* The opening owner validates after resolving any approved topology
         providers; pure callers retain io-model's direct validation default. */
      if(drawioImportRecognized(String(text)) || /\.(?:drawio|xml)$/i.test(file.name))decoder=new AbortController();
      var prepared=await prepareFlowviewFileImportAsync({name:file.name,size:file.size,type:file.type},String(text),function(){},{signal:decoder && decoder.signal,isCurrent:function(){return active() && run===version && opening.current();}});
      if(!active() || run!==version)return;
      decoder=null;
      var context=await opening.stage(prepared.text);
      if(!active() || run!==version)return;
      if(context===false){message('Import cancelled because the document changed while the file was loading.');return;}
      pending={run:run,prepared:prepared,opening:opening,context:context};
      status.hidden=true;detail.textContent=prepared.name+' · '+prepared.type;summary.textContent=prepared.summary.text+(prepared.todos.length?'. '+prepared.todos.join(' '):'');
      returnFocus=document.activeElement;dialog.showModal();confirm.focus();
    }catch(ex){if(active() && run===version){decoder=null;message('Could not import “'+file.name+'”. '+(ex.message || ex));}}
  }
  function start(files){
    if(!active())return;
    var list=Array.from(files || []);retire();status.hidden=true;clearDurable();
    if(list.length!==1){message(list.length?'Choose one file at a time.':'No file was provided.');return;}
    var file=list[0];
    if(typeof file.size==='number' && file.size>FLOWVIEW_IMPORT_MAX_BYTES){message('Could not import “'+file.name+'”. Use a file no larger than 4 MiB.');return;}
    var run=version,opening;
    try{opening=opts.begin(function(){return active() && run===version;});reader=browser.reader();}
    catch(ex){message('Could not start the import. The document is unchanged.');return;}
    reader.onload=function(){if(run!==version)return;var result=reader.result;reader=null;loaded(file,result,run,opening);};
    reader.onerror=function(){if(run!==version)return;reader=null;message('Could not read “'+file.name+'”. The document is unchanged.');};
    try{reader.readAsText(file);}catch(ex){reader=null;message('Could not read “'+file.name+'”. The document is unchanged.');}
  }
  if(input){
    if(trigger)listen(trigger,'click',function(){input.value='';input.click();});
    listen(input,'change',function(){start(input.files);input.value='';});
  }
  listen(surface,'dragenter',function(ev){if(ev.defaultPrevented){hideOverlay();return;}if(!active() || !external(ev))return;ev.preventDefault();depth++;overlay.hidden=false;});
  listen(surface,'dragover',function(ev){if(ev.defaultPrevented){hideOverlay();return;}if(!active() || !external(ev))return;ev.preventDefault();if(ev.dataTransfer)ev.dataTransfer.dropEffect='copy';});
  listen(surface,'dragleave',function(ev){if(!external(ev))return;depth=Math.max(0,depth-1);if(!depth)overlay.hidden=true;});
  listen(surface,'drop',function(ev){if(!active() || !external(ev))return;ev.preventDefault();hideOverlay();start(ev.dataTransfer.files);});
  /* Canvas image drops stop bubbling after ingestion; retire the file overlay
     during capture so it cannot remain above a successfully added image. */
  listen(document,'dragend',hideOverlay);listen(document,'drop',hideOverlay,true);
  listen(confirm,'click',function(){
    var staged=pending;if(!staged)return;pending=null;if(dialog.open)dialog.close();
    try{
      var ok=staged.opening.publish(staged.prepared.text,staged.context);
      version++;
      if(!ok){message('Import cancelled because the document changed before confirmation.');return;}
      if(opts.confirmed)opts.confirmed(staged.prepared);
      if(opts.restoreFocusOnConfirm!==false && returnFocus && returnFocus.isConnected)returnFocus.focus();
      returnFocus=null;
    }catch(ex){version++;message('Import failed. '+(ex.message || ex));}
  });
  listen(cancel,'click',function(){version++;close(true);});
  listen(dialog,'cancel',function(ev){
    if(!pending)return;ev.preventDefault();version++;close(true);
  });
  return {start:start,retire:retire,destroy:function(reason){
    if(disposed)return;
    var had=!!reader || !!decoder || !!pending || dialog.open;
    retire();
    if(had && reason)durableMessage(reason);
    disposed=true;listeners.splice(0).forEach(function(remove){remove();});overlay.remove();status.remove();dialog.remove();
  }};
}

function createBuilderIO(opts){
  var document=opts.document,src=opts.sourceElement,session=opts.session,browser=opts.browser;
  var disposed=false,listeners=[],urls=new Map(),exportVersion=0,exportRequest=null,svgCopyRun=0;
  var stagedImport=null;
  var retireTraceUI=function(){};
  var traceFileVersion=0,traceReader=null,traceReading=false;
  function parseEditor(){return session.snapshot();}
  function inspectorMessage(message){if(!disposed)opts.message(message);}
  function errorText(error){return error && error.message?error.message:String(error);}
  function listen(target,type,callback,capture,group){
    var record={target:target,type:type,capture:capture,group:group,active:true};
    record.handler=function(ev){if(!disposed && record.active)return callback.call(this,ev);};
    target.addEventListener(type,record.handler,capture);listeners.push(record);
  }
  function clearListeners(group){
    listeners=listeners.filter(function(record){
      if(group!=null && record.group!==group)return true;
      record.active=false;
      if(record.target.removeEventListener)record.target.removeEventListener(record.type,record.handler,record.capture);
      return false;
    });
  }
  function cancelFileRead(){
    fileReadVersion++;
    var reader=fileReader;fileReader=null;
    if(reader && reader.abort)reader.abort();
  }
  function cancelTraceRead(){
    traceFileVersion++;traceReading=false;
    var reader=traceReader;traceReader=null;
    if(reader && reader.abort)reader.abort();
  }
  function cancelExport(){
    exportVersion++;
    if(exportRequest)exportRequest.abort();exportRequest=null;
  }
  function exportCurrent(run){return !disposed && run===exportVersion;}
  function retireProject(){
    if(disposed)return;
    cancelFileRead();cancelTraceRead();cancelExport();closeExportMenu();confluenceCopyRun++;closeSvgFallback();
    if(stagedImport)stagedImport.retire('Import cancelled because the project changed.');
    if(importBox)importBox.hidden=true;
    retireTraceUI();
    if(confluenceBox)confluenceBox.hidden=true;
  }
  /* ---- open a .spec.json / save the editor to disk ---- */
  var fileReadVersion=0,fileReader=null;
  var fileInput = document.getElementById('file-input');
  var openBtn = document.getElementById('file-open');
  var saveBtn = document.getElementById('file-save');
  if (fileInput){
    /* Keep programmatic/embedded repairable-source opening compatible; the
       shipped File panel exposes only the staged importer. */
    if(openBtn)listen(openBtn,'click',function(){ fileInput.click(); });
    listen(fileInput,'change',function(){
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      cancelFileRead();
      var readVersion=fileReadVersion,reader=browser.reader();fileReader=reader;
      function current(){return !disposed && readVersion===fileReadVersion;}
      var opening=opts.beginFileOpen?opts.beginFileOpen(current,true):null;
      function active(){return current() && (!opening || opening.current());}
      reader.onload = async function(){
        if(!active())return;
        fileReader=null;
        try{
          if(opening)await opening.open(String(reader.result));
          else opts.replaceProject(String(reader.result)); /* invalid source remains repairable in the editor */
        }catch(ex){if(active())inspectorMessage('could not open "' + f.name + '": ' + errorText(ex));}
      };
      reader.onerror = function(){
        if(!active())return;
        fileReader=null;
        inspectorMessage('could not read "' + f.name + '" — the editor is unchanged');
      };
      try{reader.readAsText(f);}catch(ex){fileReader=null;if(active())inspectorMessage('could not read "'+f.name+'" — the editor is unchanged');}
      fileInput.value = ''; /* allow re-opening the same file */
    });
  }
  var stagedInput=document.getElementById('file-import-input'),stagedBtn=document.getElementById('file-import');
  if(stagedInput && stagedBtn && opts.beginFileImport){
    stagedImport=createStagedFileImport({document:document,browser:browser,surface:document.getElementById('workbench-workspace'),
      input:stagedInput,trigger:stagedBtn,active:function(){return !disposed && (!opts.isActive || opts.isActive());},
      begin:opts.beginFileImport,message:inspectorMessage,durableStatus:document.getElementById('workbench-import-status'),confirmed:function(prepared){
        if(prepared.todos.length)importMessage('w',prepared.todos.length+' todo(s) added to the spec — enrich by hand');
      }});
  }
  var exportMenu=document.getElementById('workspace-export');
  var exportTrigger=document.getElementById('workspace-export-trigger');
  var htmlBtn=document.getElementById('file-export-html'),bothBtn=document.getElementById('file-export-both');
  var svgDownload=document.getElementById('file-export-svg'),svgCopy=document.getElementById('file-copy-svg');
  function closeExportMenu(refocus){
    if(!exportMenu)return;
    var wasOpen=exportMenu.open;exportMenu.open=false;
    var body=exportMenu.querySelector('.workspace-export-body');
    if(body && body.hidePopover && body.matches(':popover-open'))body.hidePopover();
    if(refocus && wasOpen && exportTrigger)exportTrigger.focus();
  }
  if(exportMenu){
    listen(document,'pointerdown',function(ev){if(exportMenu.open && !exportMenu.contains(ev.target))closeExportMenu();});
    listen(document,'focusin',function(ev){if(exportMenu.open && !exportMenu.contains(ev.target))closeExportMenu();});
    listen(exportMenu,'keydown',function(ev){
      if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();closeExportMenu(true);}
    });
  }
  if (saveBtn){
    listen(saveBtn,'click',function(){
      closeExportMenu(true);cancelExport();
      /* Stamp the downloaded snapshot; preserve the live source and unfinished JSON. */
      var parsed = parseEditor();
      var name = specFileName(parsed.error ? null : parsed.raw);
      var savedText = typeof FlowviewCompatibility !== 'undefined' ? FlowviewCompatibility.stampText(session.text()) : session.text();
      try{downloadTextFile(name,savedText,'application/json');}
      catch(ex){inspectorMessage('save failed: '+errorText(ex));return;}
      session.markSaved();opts.saved();session.save();
    });
  }

  /* ---- export: static HTML, optionally paired with editable JSON ---- */
  var EXPORT_TEMPLATE_PATHS = ['../template/flowview.html', 'template/flowview.html', 'flowview.html'];
  function fetchExportTemplate(run,done){
    if(!browser.fetch){done('this browser cannot fetch the page template');return;}
    var i=0;
    exportRequest=browser.abortController();
    var request=exportRequest;
    function tryNext(){
      if(!exportCurrent(run))return;
      if(i>=EXPORT_TEMPLATE_PATHS.length){
        exportRequest=null;done('could not load the page template ('+EXPORT_TEMPLATE_PATHS.join(' / ')+') — '+
          'serve the workbench over http beside template/flowview.html; Export → JSON only still downloads the editable source');return;
      }
      var path=EXPORT_TEMPLATE_PATHS[i++],pending;
      try{pending=browser.fetch(path,{cache:'no-store',signal:request?request.signal:undefined});}
      catch(ex){tryNext();return;}
      Promise.resolve(pending).then(function(resp){
        if(!exportCurrent(run))return null;
        if(!resp.ok)throw new Error('HTTP '+resp.status);
        return resp.text();
      }).then(function(text){
        if(!exportCurrent(run))return;
        if(exportTemplateOpeners(text)!==1){tryNext();return;}
        exportRequest=null;done(null,text);
      },function(){if(exportCurrent(run))tryNext();});
    }
    tryNext();
  }
  function releaseUrl(url){
    var timer=urls.get(url);if(!urls.has(url))return;
    urls.delete(url);if(timer!=null)browser.cancel(timer);browser.revokeUrl(url);
  }
  function downloadTextFile(name,contents,mime){
    if(disposed)return;
    var url=browser.objectUrl(contents,mime),a=document.createElement('a');
    urls.set(url,null);a.href=url;a.download=name;
    try{document.body.appendChild(a);a.click();}
    catch(ex){releaseUrl(url);throw ex;}
    finally{a.remove();}
    if(urls.has(url))urls.set(url,browser.schedule(function(){releaseUrl(url);},1000));
    return function(){releaseUrl(url);};
  }
  async function writeIntoDirectory(dir,name,contents,run){
    if(!exportCurrent(run))return false;
    var handle=await dir.getFileHandle(name,{create:true});
    if(!exportCurrent(run))return false;
    var writer=await handle.createWritable();
    try{
      if(!exportCurrent(run)){await writer.abort();return false;}
      // Once write begins, finish that authorized snapshot and close its stream.
      // Retirement prevents follow-on files and stale UI, never rolls files back.
      await writer.write(contents);await writer.close();return true;
    }catch(ex){
      try{await writer.abort();}catch(cleanupError){/* retain the original write failure */}
      throw ex;
    }
  }
  /* Manual handoff: download and clipboard share exactly the same snapshot.
     Keep a selectable fallback for phones/LAN HTTP without Clipboard API. */
  var confluenceBox = document.getElementById('confluence-handoff');
  var confluenceText = document.getElementById('confluence-json');
  var confluenceStatus = document.getElementById('confluence-status');
  var confluenceCopy = document.getElementById('confluence-copy');
  var confluenceExport = document.getElementById('confluence-export');
  var confluenceClose = document.getElementById('confluence-close');
  var confluenceCopyRun=0;
  function confluenceHandoff(copy){
    var run = ++confluenceCopyRun;
    var handoffText = typeof FlowviewCompatibility !== 'undefined' ? FlowviewCompatibility.stampText(session.text()) : session.text();
    var built = buildConfluenceExport(handoffText);
    if (built.error){
      if (confluenceBox) confluenceBox.hidden = true;
      inspectorMessage('Confluence export: ' + built.error); return;
    }
    if (confluenceBox && confluenceText && confluenceStatus){
      confluenceBox.hidden = false; confluenceText.value = built.text;
      confluenceStatus.textContent = 'Import this file or paste this JSON in the Flowview macro configuration.';
    }
    if (!copy){
      try{downloadTextFile(built.name,built.text,'application/json');}
      catch(ex){inspectorMessage('Confluence export failed: '+errorText(ex));}
      return;
    }
    function result(ok){
      if(disposed || run!==confluenceCopyRun || !confluenceStatus || confluenceBox.hidden || confluenceText.value!==built.text)return;
      confluenceStatus.textContent = ok ? 'Copied. Paste into the Flowview macro configuration in Confluence.' :
        'Automatic copy is unavailable. Select and copy the JSON below, or use Export for Confluence.';
    }
    function fallback(){
      var ok = false;
      if(disposed || run!==confluenceCopyRun || confluenceBox.hidden || confluenceText.value!==built.text)return;
      if (confluenceText){ confluenceText.focus(); confluenceText.select();
        try { ok = browser.copySelection(); } catch (ex){}
      }
      result(ok);
    }
    try {
      var copied=browser.copyText(built.text);
      if(copied)copied.then(function(){result(true);},fallback);else fallback();
    } catch (ex){ fallback(); }
  }
  if(confluenceText)listen(confluenceText,'input',function(){confluenceCopyRun++;});
  if (confluenceExport) listen(confluenceExport,'click',function(){confluenceHandoff(false);});
  if (confluenceCopy) listen(confluenceCopy,'click',function(){confluenceHandoff(true);});
  if (confluenceClose) listen(confluenceClose,'click',function(){
    confluenceCopyRun++; confluenceBox.hidden = true; confluenceCopy.focus();
  });
  var exportBtn = document.getElementById('file-export');
  function exportFiles(mode){
    closeExportMenu(true);
    cancelExport();var run=exportVersion;
    var parsed = parseEditor();
    if (parsed.error){ inspectorMessage('export needs valid JSON — ' + parsed.error); return; }
    var exportText = typeof FlowviewCompatibility !== 'undefined' ? FlowviewCompatibility.stampText(session.text()) : session.text();
    var snapshot = prepareExportSnapshot(exportText,session.resolve);
    if(snapshot.error){inspectorMessage(snapshot.error);return;}
    var jsonName = specFileName(parsed.raw);
    var htmlName = jsonName.replace(/\.spec\.json$/, '') + '.html';
    /* the folder picker needs the click's transient activation, which a
       fetch would spend — so pick the directory FIRST, then fetch, build,
       and write. Files are overwritten in place. */
    if(mode==='both' && browser.pickDirectory){
      var picked;
      try{picked=browser.pickDirectory({mode:'readwrite'});}
      catch(ex){if(!ex || ex.name!=='AbortError')inspectorMessage('export failed: '+errorText(ex));return;}
      Promise.resolve(picked).then(function(dir){
        if(!exportCurrent(run))return;
        fetchExportTemplate(run,function(err, tplText){
          if(!exportCurrent(run))return;
          if (err){ inspectorMessage(err); return; }
          var built = buildExportHtml(tplText, snapshot.text.trim());
          if (built.error){ inspectorMessage(built.error); return; }
          writeIntoDirectory(dir,jsonName,exportText,run)
            .then(function(){ return writeIntoDirectory(dir,htmlName,built.html,run); })
            .then(function(){ if(!exportCurrent(run))return;inspectorMessage('exported ' + jsonName + ' and ' + htmlName + ' (overwritten in place)'); })
            ['catch'](function(ex){
              if(!exportCurrent(run))return;
              inspectorMessage('export failed while writing: ' + (ex && ex.message ? ex.message : ex));
            });
        });
      })['catch'](function(ex){
        if(!exportCurrent(run))return;
        if (ex && ex.name === 'AbortError') return; /* picker dismissed */
        inspectorMessage('export failed: ' + (ex && ex.message ? ex.message : ex));
      });
    } else {
      /* Static HTML is one download; Both falls back to two downloads. */
      fetchExportTemplate(run,function(err, tplText){
          if(!exportCurrent(run))return;
        if (err){ inspectorMessage(err); return; }
        var built = buildExportHtml(tplText, snapshot.text.trim());
        if (built.error){ inspectorMessage(built.error); return; }
        try{
          if(mode==='both')downloadTextFile(jsonName, exportText, 'application/json');
          if(!exportCurrent(run))return;
          downloadTextFile(htmlName, built.html, 'text/html');
        }catch(ex){inspectorMessage('export failed: '+errorText(ex));return;}
        inspectorMessage(mode==='both'?'no folder picker here — downloaded ' + jsonName + ' and ' + htmlName:'downloaded ' + htmlName);
      });
    }
  }
  if(exportBtn)listen(exportBtn,'click',function(){exportFiles('both');});
  if(bothBtn)listen(bothBtn,'click',function(){exportFiles('both');});
  if(htmlBtn)listen(htmlBtn,'click',function(){exportFiles('html');});

  /* ---- diagram-only SVG: serialize the live active graph, never the source ---- */
  var svgBox=document.getElementById('svg-handoff'),svgText=document.getElementById('svg-copy-text');
  var svgStatus=document.getElementById('svg-copy-status'),svgClose=document.getElementById('svg-copy-close');
  function closeSvgFallback(){
    svgCopyRun++;if(!svgBox)return;
    if(svgBox.open && svgBox.close)svgBox.close();svgBox.hidden=true;
    if(svgText)svgText.value='';if(svgStatus)svgStatus.textContent='';
  }
  function svgFallback(built,run){
    if(disposed || run!==svgCopyRun || built.current && !built.current())return;
    if(!svgBox || !svgText || !svgStatus){inspectorMessage('Copy SVG is unavailable in this browser. Use Download SVG instead.');return;}
    svgText.value=built.text;svgStatus.textContent='Automatic image/svg+xml copy was unavailable. The diagram-only SVG is selected below; press ⌘C / Ctrl+C to copy it.';
    svgBox.hidden=false;if(svgBox.showModal && !svgBox.open)svgBox.showModal();svgText.focus();svgText.select();
    var copied=false;try{copied=browser.copySelection();}catch(ex){}
    if(copied)svgStatus.textContent='Copied as selectable SVG text because image/svg+xml clipboard access was unavailable.';
  }
  function svgExportAction(copy){
    closeExportMenu(true);var run=++svgCopyRun,built=opts.svgExport && opts.svgExport();
    if(!built || built.error){inspectorMessage(built && built.error || 'SVG export is unavailable.');return;}
    if(built.current && !built.current()){inspectorMessage('SVG export was cancelled because the project or preview changed.');return;}
    if(!copy){
      try{downloadTextFile(built.name,built.text,'image/svg+xml');}
      catch(ex){inspectorMessage('SVG download failed: '+errorText(ex));return;}
      inspectorMessage((built.note?built.note+' ':'')+'Downloaded diagram-only SVG for “'+built.section+'”.');return;
    }
    var pending;
    try{pending=browser.copySvg?browser.copySvg(built.text):null;}catch(ex){svgFallback(built,run);return;}
    if(!pending){svgFallback(built,run);return;}
    Promise.resolve(pending).then(function(){
      if(disposed || run!==svgCopyRun || built.current && !built.current())return;
      inspectorMessage((built.note?built.note+' ':'')+'Copied diagram-only SVG for “'+built.section+'” as image/svg+xml.');
    },function(){svgFallback(built,run);});
  }
  if(svgDownload)listen(svgDownload,'click',function(){svgExportAction(false);});
  if(svgCopy)listen(svgCopy,'click',function(){svgExportAction(true);});
  if(svgText)listen(svgText,'input',function(){svgCopyRun++;});
  if(svgClose)listen(svgClose,'click',function(){closeSvgFallback();if(svgCopy)svgCopy.focus();});

  /* ---- inline Mermaid import ---- */
  var importBtn = document.getElementById('import-mermaid');
  var importBox = document.getElementById('importbox');
  var importText = document.getElementById('import-mermaid-text');
  var importConvert = document.getElementById('import-mermaid-convert');
  var importCancel = document.getElementById('import-mermaid-cancel');
  var importPreview = document.getElementById('import-mermaid-preview');
  function previewMermaid(){
    if(!importPreview)return;
    try{var prepared=mermaidToSpec(importText.value);importPreview.textContent=mermaidImportSummary(prepared).text+'. '+prepared.todos.join(' ');}
    catch(ex){importPreview.textContent=ex.message;}
  }
  function importMessage(cls, message){
    var list = document.getElementById('msgs');
    if (!list) return;
    var li = document.createElement('li');
    li.className = cls;
    li.textContent = (cls === 'e' ? 'ERROR ' : 'warn ') + message;
    list.appendChild(li);
  }
  if (importBtn && importBox && importText && importConvert && importCancel){
    listen(importBtn,'click',function(){
      importBox.hidden = false;
      previewMermaid();
      importText.focus();
    });
    listen(importText,'input',previewMermaid);
    listen(importCancel,'click',function(){
      importBox.hidden = true;
      importBtn.focus();
    });
    listen(importConvert,'click',function(){
      if(importBox.hidden)return;
      var spec;
      try { spec = mermaidToSpec(importText.value); }
      catch (ex){
        var list = document.getElementById('msgs');
        if (list) list.innerHTML = '';
        importMessage('e', ex.message);
        return;
      }
      session.importText(JSON.stringify(spec, null, 2),{
        rememberImport:true,
        beforeRender:function(){opts.beforeImport('mermaid');},
        afterRender:function(){opts.afterImport(spec);}
      });
      importBox.hidden = true;
      importBtn.focus();
      if (spec.todos.length) importMessage('w', spec.todos.length + ' todo(s) added to the spec — enrich by hand');
    });
    listen(document,'keydown',function(ev){
      if(opts.isActive && !opts.isActive())return;
      if(ev.key==='Escape' && !importBox.hidden){
        ev.preventDefault();importBox.hidden=true;importBtn.focus();return;
      }
      if(!opts.canUndoImport())return;
      /* Programmatic replacement has no native textarea undo entry. */
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey || ev.key.toLowerCase() !== 'z') return;
      if(!session.imported())return;
      if (document.activeElement !== src && document.activeElement !== importBtn) return;
      ev.preventDefault();
      session.undo();
    });
  }

  /* ---- Honeycomb trace import (local, shared with the CLI) ---- */
  var traceBtn = document.getElementById('import-trace');
  var traceBox = document.getElementById('tracebox');
  if (traceBtn && traceBox){
    var traceText = document.getElementById('trace-text');
    var traceFeedback = document.getElementById('trace-feedback');
    var traceFile = document.getElementById('trace-file');
    var traceScope = document.getElementById('trace-scope'), traceRoot = document.getElementById('trace-root');
    var traceService = document.getElementById('trace-service'), traceBuild = document.getElementById('trace-convert');
    var tracePreviewBox = document.getElementById('trace-preview-box'), traceSearch = document.getElementById('trace-search');
    var traceAnalysis = null, traceSnapshot = null;
    retireTraceUI=function(){invalidateTrace();clearListeners('trace-results');traceBox.hidden=true;traceBtn.setAttribute('aria-expanded','false');};
    function traceOptions(){
      var mapping = document.getElementById('trace-fields').value.trim();
      return {traceId:document.getElementById('trace-id').value.trim() || undefined,
        sourceUrl:document.getElementById('trace-url').value.trim(),fields:mapping ? JSON.parse(mapping) : undefined,
        rootSpanId:traceScope.value==='subtree' ? traceRoot.value : undefined,
        service:traceScope.value==='service' ? traceService.value : undefined};
    }
    function traceFingerprint(){
      return JSON.stringify([traceText.value,document.getElementById('trace-id').value,document.getElementById('trace-url').value,
        document.getElementById('trace-fields').value,traceScope.value,traceRoot.value,traceService.value]);
    }
    function updateTraceScope(){
      document.getElementById('trace-root-label').hidden=traceScope.value!=='subtree';
      document.getElementById('trace-service-label').hidden=traceScope.value!=='service';
      document.getElementById('trace-clear-focus').hidden=traceScope.value==='all';
    }
    function invalidateTrace(){
      traceAnalysis=null; traceSnapshot=null; traceBuild.disabled=true; tracePreviewBox.hidden=true;
      traceFeedback.textContent='Preview the current input and scope before building.';
    }
    function renderTraceSearch(){
      clearListeners('trace-results');
      var results=document.getElementById('trace-search-results'); results.textContent='';
      if (!traceAnalysis) return;
      var terms=traceSearch.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      var matches=traceAnalysis.sourceSpans.filter(function(s){
        var text=(s.id+' '+s.service+' '+s.name+(s.error?' recorded error':'')).toLowerCase();
        return terms.every(function(term){ return text.indexOf(term)>=0; });
      });
      document.getElementById('trace-search-count').textContent=matches.length+' matching span(s); showing '+Math.min(25,matches.length)+'. Choose a row to preview that subtree.';
      matches.slice(0,25).forEach(function(s){
        var button=document.createElement('button'); button.type='button'; button.className='bbtn trace-result';
        button.setAttribute('aria-label','Focus subtree at '+s.id);
        var title=document.createElement('span'); title.textContent=s.service+' · '+s.name+(s.error?' · ERROR':'');
        var detail=document.createElement('small'); detail.textContent=s.id+' · +'+s.startMs+' ms · '+s.ms+' ms duration · '+traceAnalysis.subtreeSizes.get(s.id)+' span(s) in subtree';
        button.appendChild(title); button.appendChild(detail);
        var analysis=traceAnalysis,fingerprint=traceSnapshot;
        listen(button,'click',function(){
          if(traceBox.hidden || analysis!==traceAnalysis || fingerprint!==traceFingerprint())return;
          traceScope.value='subtree'; traceRoot.value=s.id; updateTraceScope(); previewTrace();
          document.getElementById('trace-preview').focus();
        },false,'trace-results');
        results.appendChild(button);
      });
    }
    function previewTrace(){
      if(traceBox.hidden)return;
      invalidateTrace();
      try {
        if (traceReading) throw new Error('The trace file is still loading. Preview it when loading finishes.');
        if (traceText.value.length>10*1024*1024) throw new Error('Use a trace export smaller than 10 MB.');
        traceAnalysis=tracePreview(traceText.value,traceOptions()); traceSnapshot=traceFingerprint();
      } catch(ex){ traceFeedback.textContent=ex.message; return; }
      var a=traceAnalysis, stats=a.stats, original=a.sourceStats;
      document.getElementById('trace-summary').textContent='Source export: '+original.spans+' spans · '+original.services+' services · '+original.elapsedMs+' ms. Selection: '+stats.spans+' spans · '+stats.services+' services · '+stats.elapsedMs+' ms; '+(original.spans-stats.spans)+' spans omitted.';
      var breadcrumbs=document.getElementById('trace-breadcrumbs'); breadcrumbs.textContent='';
      if (a.focus && a.focus.kind==='subtree') breadcrumbs.textContent='Branch: '+(a.focus.omittedAncestors ? '… → ' : '')+
        a.focus.ancestors.map(function(s){ return s.service+' / '+s.name+' ['+s.id+']'; }).concat([a.focus.value]).join(' → ');
      var warnings=document.getElementById('trace-warnings'); warnings.textContent='';
      a.warnings.forEach(function(w){ var li=document.createElement('li'); li.textContent=w; warnings.appendChild(li); });
      var names=new Map(); a.sourceSpans.forEach(function(s){ names.set(s.service,(names.get(s.service)||0)+1); });
      var suggestions=document.getElementById('trace-services'); suggestions.textContent='';
      Array.from(names.keys()).slice(0,100).forEach(function(name){
        var option=document.createElement('option'); option.value=name; option.label=names.get(name)+' own span(s)'; suggestions.appendChild(option);
      });
      tracePreviewBox.hidden=false; traceBuild.disabled=!a.canBuild;
      traceFeedback.textContent=a.blocked || 'Ready to build. The current document has not changed.';
      renderTraceSearch();
    }
    ['trace-text','trace-id','trace-url','trace-fields','trace-root','trace-service'].forEach(function(id){
      listen(document.getElementById(id),'input',function(){if(id==='trace-text')cancelTraceRead();invalidateTrace();});
    });
    listen(traceScope,'change',function(){ updateTraceScope(); invalidateTrace(); });
    listen(traceSearch,'input',renderTraceSearch);
    listen(document.getElementById('trace-preview'),'click',previewTrace);
    listen(document.getElementById('trace-clear-focus'),'click',function(){
      traceScope.value='all'; traceRoot.value=''; traceService.value=''; updateTraceScope(); previewTrace();
    });
    function closeTrace(){cancelTraceRead();invalidateTrace();clearListeners('trace-results');traceBox.hidden=true;traceBtn.setAttribute('aria-expanded','false');traceBtn.focus();}
    listen(traceBtn,'click',function(){
      if(!traceBox.hidden){closeTrace();return;}
      traceBox.hidden=false;traceBtn.setAttribute('aria-expanded','true');opts.closeInsertMenu();traceText.focus();
    });
    listen(document.getElementById('trace-cancel'),'click',closeTrace);
    listen(traceBox,'keydown',function(ev){ if (ev.key === 'Escape'){ ev.stopPropagation(); closeTrace(); } });
    listen(document.getElementById('trace-open'),'click',function(){ traceFile.click(); });
    listen(traceFile,'change',function(){
      var file = traceFile.files[0];
      if (!file) return;
      cancelTraceRead();var version=traceFileVersion;invalidateTrace();
      if (file.size > 10 * 1024 * 1024){ traceFeedback.textContent = 'Use a trace export smaller than 10 MB.'; traceFile.value = ''; return; }
      var reader=browser.reader();traceReader=reader;
      traceReading=true; traceFeedback.textContent='Loading '+file.name+'…';
      reader.onload = function(){ if(disposed || version!==traceFileVersion || traceBox.hidden)return;traceReader=null; traceReading=false; traceText.value = String(reader.result); invalidateTrace(); traceFeedback.textContent = 'Loaded ' + file.name + '. Preview to inspect the export.'; };
      reader.onerror = function(){ if(!disposed && version===traceFileVersion && !traceBox.hidden){traceReader=null; traceReading=false; traceFeedback.textContent = 'Could not read the trace file.'; } };
      try{reader.readAsText(file);}catch(ex){traceReader=null;traceReading=false;traceFeedback.textContent='Could not read the trace file.';}traceFile.value='';
    });
    listen(document.getElementById('trace-convert'),'click',function(){
      if(traceBox.hidden)return;
      var result;
      try {
        if (!traceSnapshot || traceSnapshot!==traceFingerprint() || !traceAnalysis || !traceAnalysis.canBuild){ invalidateTrace(); return; }
        if (traceText.value.length > 10 * 1024 * 1024) throw new Error('Use a trace export smaller than 10 MB.');
        result = traceToSpec(traceText.value, traceOptions());
        var verdict = validate(normalize(result.spec));
        if (verdict.errors.length) throw new Error(verdict.errors.join('\n'));
      } catch (ex){ traceFeedback.textContent = ex.message; return; }
      session.importText(JSON.stringify(result.spec, null, 2),{
        beforeRender:function(){opts.beforeImport('trace');},
        afterRender:function(){opts.afterImport(result.spec);}
      });
      closeTrace();
      inspectorMessage('Imported ' + result.stats.spans + ' spans across ' + result.stats.services + ' services. ' +
        result.stats.elapsedMs + ' ms observed extent. ' + (result.warnings.join(' ') || 'Select a step to inspect its source span.'));
    });
  }


  return {
    download:downloadTextFile,
    retireProject:retireProject,
    destroy:function(){
      if(disposed)return;
      if(stagedImport){stagedImport.destroy('Import cancelled because the editor was closed. The document is unchanged.');stagedImport=null;}
      retireProject();disposed=true;clearListeners();
      Array.from(urls.keys()).forEach(releaseUrl);
    }
  };
}
