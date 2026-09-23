/* Safe prose formatting only. Graph labels and panel values remain literal.
   Parse the source, never generated HTML: code and link URLs are opaque. */
function inlineMarkup(value, links){
  var source=String(value == null ? '' : value),html='',position=0,match;
  var tokens=/(`+)|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*(?![\s*])([^*\n]+?)\*(?!\*)/g;
  while((match=tokens.exec(source))){
    html+=esc(source.slice(position,match.index));
    if(match[1]){
      var end=/`+/g,close=null,run;end.lastIndex=tokens.lastIndex;
      while((run=end.exec(source))){if(run[0].length===match[1].length){close=run;break;}}
      if(close){
        html+='<code>'+esc(source.slice(tokens.lastIndex,close.index).replace(/\r\n?|\n/g,' '))+'</code>';
        tokens.lastIndex=close.index+close[0].length;
      }else html+=esc(match[0]);
    }else if(match[2]){
      html+=links===false ? esc(match[0]) : '<a class="ilink" href="'+esc(match[3])+'" target="_blank" rel="noopener">'+inlineMarkup(match[2],false)+'</a>';
    }else if(match[4]) html+='<strong>'+inlineMarkup(match[4],links)+'</strong>';
    else if(match.index && source[match.index-1]==='*')html+=esc(match[0]);
    else html+='<em>'+inlineMarkup(match[5],links)+'</em>';
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
