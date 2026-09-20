/* Bind platform calls at the browser edge. Tests can inject held operations. */
function createBuilderBrowserIO(document,window){
  return {
    reader:function(){return new FileReader();},
    fetch:typeof fetch==='function'?function(url,options){return fetch(url,options);}:null,
    abortController:function(){return typeof AbortController==='function'?new AbortController():null;},
    objectUrl:function(text,mime){return URL.createObjectURL(new Blob([text],{type:mime}));},
    revokeUrl:function(url){URL.revokeObjectURL(url);},
    schedule:function(fn,ms){return setTimeout(fn,ms);},cancel:function(timer){clearTimeout(timer);},
    pickDirectory:typeof window.showDirectoryPicker==='function'?function(options){return window.showDirectoryPicker(options);}:null,
    copyText:function(text){
      return typeof navigator!=='undefined' && navigator.clipboard && navigator.clipboard.writeText?
        navigator.clipboard.writeText(text):null;
    },
    copySelection:function(){return document.execCommand('copy');}
  };
}
