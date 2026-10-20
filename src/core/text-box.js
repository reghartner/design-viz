/* Plain-text canvas nodes. Shared by layout, validation, editor and SVG output. */
var TEXT_BOX_FONTS = ['IBM Plex Sans','IBM Plex Mono','Sora','Lora','Newsreader','Source Sans 3'];
var TEXT_BOX_LIMITS = {characters:12000,lines:200,height:8000};
function isTextBoxNode(node){
  return !!(node && node.type==='text' && (Object.prototype.hasOwnProperty.call(node,'text') || Object.prototype.hasOwnProperty.call(node,'textStyle')));
}
function textBoxStyle(node){
  var s=node.textStyle || {};
  return {fontFamily:TEXT_BOX_FONTS.indexOf(s.fontFamily)>=0?s.fontFamily:'IBM Plex Sans',
    fontSize:typeof s.fontSize==='number' && isFinite(s.fontSize)?clamp(s.fontSize,8,160):24,
    width:typeof s.width==='number' && isFinite(s.width)?clamp(s.width,48,2000):280,
    height:typeof s.height==='number' && isFinite(s.height)?clamp(s.height,32,2000):80,
    bold:s.bold===true,italic:s.italic===true,underline:s.underline===true,
    color:typeof s.color==='string' && /^#[0-9a-f]{6}$/i.test(s.color)?s.color:null,
    align:['left','center','right'].indexOf(s.align)>=0?s.align:'left'};
}
function textBoxDisplayText(node){
  var text=typeof node.text==='string'?node.text:'';
  var end=Math.min(text.length,TEXT_BOX_LIMITS.characters);
  if(end<text.length && /[\uD800-\uDBFF]/.test(text.charAt(end-1)))end--;
  return text.slice(0,end);
}
function textBoxLayout(node){
  var s=textBoxStyle(node),limit=s.width-16,lines=[];
  var heightLines=Math.floor((TEXT_BOX_LIMITS.height-16)/(s.fontSize*1.25));
  var lineLimit=Math.min(TEXT_BOX_LIMITS.lines,heightLines),overflow=typeof node.text==='string' && node.text.length>TEXT_BOX_LIMITS.characters?'characters':null;
  /* Conservative glyph advances keep wide capitals and Unicode inside the
     same deterministic bounds in browser, worker and backend geometry. */
  function advance(char){
    if(s.fontFamily==='IBM Plex Mono')return s.fontSize*(char.codePointAt(0)>255?1.1:.61);
    var em=/[MW@%]/.test(char)?1.12:/[mw]/.test(char)?1:/[ilIjtfr.,:;!'| ]/.test(char)?.4:/[A-Z0-9]/.test(char)?.8:char.codePointAt(0)>255?1.15:.7;
    return s.fontSize*em*(s.bold?1.04:1);
  }
  function emit(chars,start,end){
    if(lines.length===lineLimit){overflow=overflow || (heightLines<TEXT_BOX_LIMITS.lines?'height':'lines');return false;}
    lines.push(chars.slice(start,end).join(''));return true;
  }
  var paragraphs=textBoxDisplayText(node).replace(/\r\n?/g,'\n').split('\n');
  outer:for(var p=0;p<paragraphs.length;p++){
    var chars=Array.from(paragraphs[p]),prefix=[0],start=0,index=0,lastSpace=-1,used=0;
    /* Indexes and cumulative advances avoid shifting or rescanning the
       unconsumed suffix. Each glyph is visited at most twice. */
    while(index<chars.length){
      var width=advance(chars[index]);
      if(index>start && used+width>limit){
        var cut=lastSpace>=start?lastSpace+1:index;
        if(!emit(chars,start,cut))break outer;
        start=cut;used=prefix[index]-prefix[start];lastSpace=-1;
        continue;
      }
      used+=width;prefix[index+1]=prefix[index]+width;
      if(chars[index]===' ')lastSpace=index;
      index++;
    }
    if(!emit(chars,start,chars.length))break;
  }
  if(overflow && lines.length)lines[lines.length-1]='…';
  return {lines:lines,overflow:overflow,w:s.width,h:Math.min(TEXT_BOX_LIMITS.height,Math.max(s.height,lines.length*s.fontSize*1.25+16))};
}
function textBoxLines(node){return textBoxLayout(node).lines;}
function textBoxSize(node){var result=textBoxLayout(node);return {w:result.w,h:result.h};}
function textBoxResize(node,position,width,height){
  var style=Object.assign({},node.textStyle,{width:width,height:height});
  var size=textBoxSize(Object.assign({},node,{textStyle:style}));
  return {style:style,w:size.w,h:size.h,
    cx:position.cx+(node.locked===true?0:(size.w-position.w)/2),
    cy:position.cy+(node.locked===true?0:(size.h-position.h)/2)};
}
function validateTextBox(node,at,errors){
  if(!isTextBoxNode(node))return;
  if(typeof node.text!=='string')errors.push(at+'.text: text boxes require a plain text string');
  if(typeof node.text==='string'){
    var bounded=textBoxLayout(node);
    if(bounded.overflow==='characters')errors.push(at+'.text: use at most '+TEXT_BOX_LIMITS.characters+' characters');
    else if(bounded.overflow==='lines')errors.push(at+'.text: use at most '+TEXT_BOX_LIMITS.lines+' wrapped lines; shorten the text or widen the box');
    else if(bounded.overflow==='height')errors.push(at+'.text: wrapped text height exceeds '+TEXT_BOX_LIMITS.height+'; shorten the text, reduce font size or widen the box');
  }
  if(node.image || node.handoff || node.detail)errors.push(at+': text boxes cannot also be images, handoffs or domain details');
  validateTextBoxStyle(node.textStyle,at,errors);
}
function validateTextBoxStyle(s,at,errors){
  if(s==null)return;
  if(typeof s!=='object' || Array.isArray(s)){errors.push(at+'.textStyle: expected an object');return;}
  [['fontSize',8,160],['width',48,2000],['height',32,2000]].forEach(function(f){
    if(s[f[0]]!=null && (typeof s[f[0]]!=='number' || !isFinite(s[f[0]]) || s[f[0]]<f[1] || s[f[0]]>f[2]))errors.push(at+'.textStyle.'+f[0]+': use a number from '+f[1]+' to '+f[2]);
  });
  ['bold','italic','underline'].forEach(function(key){if(s[key]!=null && typeof s[key]!=='boolean')errors.push(at+'.textStyle.'+key+': expected true or false');});
  if(s.fontFamily!=null && TEXT_BOX_FONTS.indexOf(s.fontFamily)<0)errors.push(at+'.textStyle.fontFamily: choose a bundled text font');
  if(s.align!=null && ['left','center','right'].indexOf(s.align)<0)errors.push(at+'.textStyle.align: use left, center or right');
  if(s.color!=null && (typeof s.color!=='string' || !/^#[0-9a-f]{6}$/i.test(s.color)))errors.push(at+'.textStyle.color: use a six-digit hex color');
}

/* Section notes share typography with native boxes, without box geometry or
   alignment. Authored values apply only in Explore; prose markup stays intact. */
function validateSectionTextStyle(style,at,errors){
  validateTextBoxStyle(style,at,errors);
  if(!style || typeof style!=='object' || Array.isArray(style))return;
  Object.keys(style).forEach(function(key){
    if(['fontFamily','fontSize','bold','italic','color'].indexOf(key)<0)errors.push(at+'.textStyle.'+key+': unsupported section text setting');
  });
}
function sectionTextStyleCSS(section){
  var style=section.textStyle,errors=[];validateSectionTextStyle(style,'Section',errors);
  if(!style || errors.length)return '';
  var names={fontFamily:'font',fontSize:'size',bold:'weight',italic:'style',color:'color'};
  return Object.keys(names).filter(function(key){return style[key]!=null;}).map(function(key){
    var value=key==='fontFamily'?"'"+style[key]+"'":key==='fontSize'?style[key]+'px':key==='bold'?(style[key]?'700':'400'):key==='italic'?(style[key]?'italic':'normal'):style[key];
    return '--section-text-'+names[key]+':'+value;
  }).join(';');
}
