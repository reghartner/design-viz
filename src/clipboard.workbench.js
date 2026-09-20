/* Browser transport is separate from the pure planners so native clipboard
   events, denied permissions, and stale destinations can be tested directly. */
function initBuilderClipboard(document, options){
  var win=document.defaultView, dialog=document.getElementById('object-clipboard'), input=document.getElementById('object-clipboard-text');
  if (!dialog) return null;
  var feedback=document.getElementById('object-clipboard-feedback'), status=document.getElementById('object-clipboard-status');
  var memory=null, destination=null, writing=false, request=0, opener=null;
  function say(message){status.textContent=message;}
  function editable(target){return target && target.closest && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog');}
  function selectedText(){var selection=win.getSelection && win.getSelection();return selection && !selection.isCollapsed;}
  function pack(targets){
    if(options.blocked())return {error:'Finish the current drag, connection, or ADD TO STEP action first.'};
    try {return builderClipboardCopy(JSON.parse(options.text()),targets || options.selection());}
    catch(ex){return {error:'Fix the JSON source before copying.'};}
  }
  function open(text){
    request++;opener=document.activeElement;destination=options.destination();
    destination.text=options.text();input.value=text || (memory ? JSON.stringify(memory,null,2) : '');
    document.getElementById('object-clipboard-destination').textContent=options.destinationLabel(destination);
    feedback.textContent='Paste inserts an independent copy. Home elements and panels include initial state; copy a section to include its timelines.';
    dialog.showModal();input.focus();
  }
  function close(){request++;dialog.close();if(opener && opener.isConnected)opener.focus();}
  function write(data){
    memory=data;var text=JSON.stringify(data,null,2), sequence=++request;
    say('Copied '+builderClipboardLabel(data)+'.');
    function fallback(){
      if(sequence!==request || (options.isActive && !options.isActive()))return;
      var textarea=document.createElement('textarea'), previous=document.activeElement;
      textarea.value=text;textarea.style.cssText='position:fixed;left:-9999px;top:0';document.body.appendChild(textarea);textarea.select();writing=true;
      var ok=false;try{ok=!!document.execCommand('copy');}catch(ex){}finally{writing=false;textarea.remove();if(previous && previous.isConnected)previous.focus({preventScroll:true});}
      if(!ok){open(text);feedback.textContent='Saved to this editor’s clipboard. To copy into another tab, select and copy the text below.';input.select();}
    }
    try{if(win.navigator.clipboard && win.navigator.clipboard.writeText)Promise.resolve(win.navigator.clipboard.writeText(text)).catch(fallback);else fallback();}catch(ex){fallback();}
  }
  function copy(targets){var result=pack(targets);if(result.error){say(result.error);return false;}write(result.data);return true;}
  function paste(data,dest){
    if(options.blocked()){say('Finish the current drag, connection, or ADD TO STEP action first.');return false;}
    if(dest.text !== options.text()){feedback.textContent='The destination changed. Close and reopen Paste to choose it again.';say(feedback.textContent);return false;}
    var plan;
    try{plan=planPasteBuilderClipboard(options.text(),JSON.parse(options.text()),data,dest);}catch(ex){plan={error:'Fix the destination JSON before pasting.'};}
    if(plan.error){say(plan.error);feedback.textContent=plan.error;return false;}
    if(!options.apply(plan))return false;
    say('Pasted '+builderClipboardLabel(data)+'. Undo restores the previous spec.');return true;
  }
  function duplicate(targets){
    if(options.blocked()){say('Finish the current drag, connection, or ADD TO STEP action first.');return false;}
    targets=targets || options.selection();
    if(options.duplicate){var handled=options.duplicate(targets);if(handled !== null)return handled;}
    var result=pack(targets);if(result.error){say(result.error);return false;}var dest=options.destination(targets);dest.text=options.text();return paste(result.data,dest);
  }
  document.getElementById('object-copy').addEventListener('click',function(){copy();});
  document.getElementById('object-duplicate').addEventListener('click',function(){duplicate();});
  document.getElementById('object-paste').addEventListener('click',function(){open();});
  document.getElementById('object-clipboard-cancel').addEventListener('click',close);
  document.getElementById('object-clipboard-apply').addEventListener('click',function(){
    var result=builderClipboardParse(input.value);if(result.error){feedback.textContent=result.error;return;}
    if(paste(result.data,destination)){memory=result.data;close();}
  });
  document.getElementById('object-clipboard-read').addEventListener('click',async function(){
    var sequence=++request;
    try{
      if(!win.navigator.clipboard || !win.navigator.clipboard.readText)throw new Error();
      var text=await win.navigator.clipboard.readText();if(sequence!==request || !dialog.open)return;
      input.value=text;feedback.textContent='Clipboard loaded. Review and choose Paste copy.';
    }catch(ex){if(sequence===request)feedback.textContent='Automatic clipboard reading is unavailable. Paste into the text box using your keyboard or phone’s Paste command.';}
  });
  input.addEventListener('input',function(){request++;});
  dialog.addEventListener('cancel',function(ev){ev.preventDefault();close();});
  dialog.addEventListener('keydown',function(ev){if(ev.key==='Escape')ev.stopPropagation();});
  document.addEventListener('copy',function(ev){
    if(options.isActive && !options.isActive())return;
    if(writing || editable(ev.target) || selectedText() || !ev.clipboardData)return;
    var result=pack();if(result.error){say(result.error);return;}
    ev.clipboardData.setData('text/plain',JSON.stringify(result.data));ev.preventDefault();memory=result.data;
    say('Copied '+builderClipboardLabel(result.data)+'.');
  });
  document.addEventListener('paste',function(ev){
    if(options.isActive && !options.isActive())return;
    if(editable(ev.target) || !ev.clipboardData)return;
    var result=builderClipboardParse(ev.clipboardData.getData('text/plain'));if(result.error)return;
    ev.preventDefault();var dest=options.destination();dest.text=options.text();paste(result.data,dest);
  });
  document.addEventListener('keydown',function(ev){
    if(options.isActive && !options.isActive())return;
    if(editable(ev.target) || !(ev.metaKey || ev.ctrlKey) || ev.altKey || ev.shiftKey || ev.key.toLowerCase()!=='d')return;
    if(!options.selection().length)return;ev.preventDefault();duplicate();
  });
  return {copy:copy,duplicate:duplicate,open:open,cancelPending:function(){request++;}};
}
