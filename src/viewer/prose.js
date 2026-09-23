/* Safe prose formatting only. Graph labels and panel values remain literal.
   Parse the source, never generated HTML: code and link URLs are opaque. */
function proseCodeClose(source,start,length){
  var runs=/`+/g,run;runs.lastIndex=start;
  while((run=runs.exec(source))){if(run[0].length===length)return {index:run.index,end:runs.lastIndex};}
  return null;
}
function proseEmphasisClose(source,start,marker){
  var runs=/`+|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\*+/g,run;runs.lastIndex=start;
  while((run=runs.exec(source))){
    if(marker==='*' && /[\r\n]/.test(source.slice(start,run.index)))return null;
    if(run[0][0]==='`'){
      var code=proseCodeClose(source,runs.lastIndex,run[0].length);
      if(code)runs.lastIndex=code.end;
    }else if(run[0]===marker)return {index:run.index,end:runs.lastIndex};
  }
  return null;
}
function inlineMarkup(value, links){
  var source=String(value == null ? '' : value),html='',position=0,match;
  var tokens=/(`+)|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(\*\*|\*)/g;
  while((match=tokens.exec(source))){
    html+=esc(source.slice(position,match.index));
    if(match[1]){
      var close=proseCodeClose(source,tokens.lastIndex,match[1].length);
      if(close){
        html+='<code>'+esc(source.slice(tokens.lastIndex,close.index).replace(/\r\n?|\n/g,' '))+'</code>';
        tokens.lastIndex=close.end;
      }else html+=esc(match[0]);
    }else if(match[2]){
      html+=links===false ? esc(match[0]) : '<a class="ilink" href="'+esc(match[3])+'" target="_blank" rel="noopener">'+inlineMarkup(match[2],false)+'</a>';
    }else{
      var marker=match[4],next=source[tokens.lastIndex],canOpen=next && next!=='*' && source[match.index-1]!=='*' && (marker==='**' || !/\s/.test(next));
      var end=canOpen && proseEmphasisClose(source,tokens.lastIndex,marker);
      if(end){
        var tag=marker==='**'?'strong':'em';
        html+='<'+tag+'>'+inlineMarkup(source.slice(tokens.lastIndex,end.index),links)+'</'+tag+'>';
        tokens.lastIndex=end.end;
      }else html+=marker;
    }
    position=tokens.lastIndex;
  }
  return html+esc(source.slice(position));
}

/* Backtick fences occupy their own lines, optionally with a language label.
   A longer fence can quote shorter fences. An unfinished fence extends to EOF,
   so editing a snippet never exposes its contents as prose/HTML. */
function proseMarkup(value){
  var source=String(value == null ? '' : value).replace(/\r\n?/g,'\n');
  var fences=/^ {0,3}(`{3,})([^`\n]*)$/gm,position=0,html='',match;
  while((match=fences.exec(source))){
    html+=inlineMarkup(source.slice(position,match.index));
    var start=fences.lastIndex+(source[fences.lastIndex]==='\n'?1:0);
    var closing=new RegExp('^ {0,3}`{'+match[1].length+',}[ \\t]*$','gm');closing.lastIndex=start;
    var end=closing.exec(source),language=match[2].trim().split(/\s+/)[0];
    if(!/^[\w.+#-]+$/.test(language))language='';
    html+='<pre class="prose-code" tabindex="0" aria-label="Code block'+(language?' ('+esc(language)+')':'')+'"'+
      (language?' data-language="'+esc(language)+'"':'')+'><code class="prose-block-code">'+esc(source.slice(start,end?end.index:source.length))+'</code></pre>';
    position=end?closing.lastIndex:source.length;
    fences.lastIndex=position;
  }
  return html+inlineMarkup(source.slice(position));
}
