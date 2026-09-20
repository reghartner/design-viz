/* Pure JSON source scanning and splicing. No parsed-document, DOM, panel or
   session dependencies. Public names remain in the assembled workbench scope. */

/* ---------------- JSON source locator ----------------
   A tolerant scanner over the RAW editor text: given a path (array of object
   keys / array indices), find the character range of the value so the
   textarea can select it. Whitespace-agnostic; strings with escapes are
   skipped correctly. On duplicate keys the FIRST occurrence wins (JSON.parse
   keeps the last — hand-authored specs do not duplicate keys, and a miss
   only mis-places the selection). */

function jsonSkipWS(text, i){
  while (i < text.length && ' \t\n\r'.indexOf(text[i]) >= 0) i++;
  return i;
}
function jsonSkipString(text, i){
  /* i at the opening quote; returns the index just past the closing quote */
  i++;
  while (i < text.length){
    if (text[i] === '\\') i += 2;
    else if (text[i] === '"') return i + 1;
    else i++;
  }
  return i;
}
function jsonSkipValue(text, i){
  /* i at the first char of a value; returns the index just past it */
  i = jsonSkipWS(text, i);
  var c = text[i];
  if (c === '"') return jsonSkipString(text, i);
  if (c === '{' || c === '['){
    var open = c, close = c === '{' ? '}' : ']', depth = 0;
    while (i < text.length){
      c = text[i];
      if (c === '"'){ i = jsonSkipString(text, i); continue; }
      if (c === open) depth++;
      else if (c === close){ depth--; if (!depth) return i + 1; }
      i++;
    }
    return i;
  }
  while (i < text.length && ',}] \t\n\r'.indexOf(text[i]) < 0) i++;
  return i;
}
function jsonContainer(text, i){
  /* Parse the container ({...} or [...]) starting at/after i. Returns
     {isObj, open, close, members:[{key, keyStart, valStart, valEnd}]} —
     key is the decoded object key or the array index — or null. */
  i = jsonSkipWS(text, i);
  var c = text[i];
  if (c !== '{' && c !== '[') return null;
  var isObj = c === '{';
  var members = [];
  var j = i + 1, idx = 0;
  while (j < text.length){
    j = jsonSkipWS(text, j);
    if (j >= text.length) break;
    var ch = text[j];
    if (ch === (isObj ? '}' : ']')) return {isObj: isObj, open: i, close: j, members: members};
    if (ch === ','){ j++; continue; }
    if (isObj){
      if (ch !== '"'){ j++; continue; }
      var keyStart = j, keyEnd = jsonSkipString(text, j);
      var key;
      try { key = JSON.parse(text.slice(keyStart, keyEnd)); } catch (ex){ key = null; }
      j = jsonSkipWS(text, keyEnd);
      if (text[j] === ':') j++;
      j = jsonSkipWS(text, j);
      var valStart = j, valEnd = jsonSkipValue(text, j);
      members.push({key: key, keyStart: keyStart, valStart: valStart, valEnd: valEnd});
      j = valEnd;
    } else {
      var vs = jsonSkipWS(text, j), ve = jsonSkipValue(text, vs);
      members.push({key: idx++, keyStart: vs, valStart: vs, valEnd: ve});
      j = ve;
    }
  }
  return null; /* unterminated container */
}
function jsonLocate(text, path){
  /* Character range {start, end, keyStart} of the value at path; [] means
     the whole document. null when any path segment is absent. */
  var start = jsonSkipWS(text, 0);
  if (start >= text.length) return null;
  var node = {keyStart: start, valStart: start, valEnd: jsonSkipValue(text, start)};
  for (var p = 0; p < path.length; p++){
    var cont = jsonContainer(text, node.valStart);
    if (!cont) return null;
    var found = null;
    for (var m = 0; m < cont.members.length; m++){
      if (cont.members[m].key === path[p]){ found = cont.members[m]; break; }
    }
    if (!found) return null;
    node = found;
  }
  return {start: node.valStart, end: node.valEnd, keyStart: node.keyStart};
}

/* ---------------- insertion ---------------- */

function jsonIndentFor(text, cont){
  /* Indent for a new member: copy the last member's line indent, else the
     opening bracket's line indent plus two spaces. */
  var anchor = cont.members.length ? cont.members[cont.members.length - 1].keyStart : -1;
  if (anchor < 0){
    var ls = text.lastIndexOf('\n', cont.open) + 1;
    return (text.slice(ls, cont.open).match(/^[ \t]*/) || [''])[0] + '  ';
  }
  var ls2 = text.lastIndexOf('\n', anchor) + 1;
  return (text.slice(ls2, anchor).match(/^[ \t]*/) || [''])[0];
}
function jsonInsertMember(text, path, keyOrNull, valueText){
  /* Append a member to the object (keyOrNull = key) or array (null) at
     path. valueText may be multi-line with two-space relative indents.
     Returns {text, start, end} — start/end select the inserted value. */
  var loc = path.length ? jsonLocate(text, path) : {start: jsonSkipWS(text, 0)};
  var cont = loc ? jsonContainer(text, loc.start) : null;
  if (!cont || cont.isObj !== (keyOrNull != null)) return null;
  var indent = jsonIndentFor(text, cont);
  var keyPart = keyOrNull != null ? JSON.stringify(keyOrNull) + ': ' : '';
  var adjVal = valueText.split('\n').join('\n' + indent);
  var insertAt, prefix;
  if (cont.members.length){
    insertAt = cont.members[cont.members.length - 1].valEnd;
    prefix = ',\n' + indent;
  } else {
    insertAt = cont.open + 1;
    prefix = '\n' + indent;
  }
  var start = insertAt + prefix.length + keyPart.length;
  return {text: text.slice(0, insertAt) + prefix + keyPart + adjVal + text.slice(insertAt),
          start: start, end: start + adjVal.length};
}
function jsonInsertListItemOrCreate(text, ownerPath, key, itemText){
  /* Append itemText to the array ownerPath.key, creating the array first
     when the key is absent. */
  var listPath = ownerPath.concat([key]);
  if (!jsonLocate(text, listPath)){
    var made = jsonInsertMember(text, ownerPath, key, '[]');
    if (!made) return null;
    text = made.text;
  }
  return jsonInsertMember(text, listPath, null, itemText);
}

function jsonReplaceValue(text, path, valueText){
  /* Replace the value at path; multi-line valueText is re-indented to the
     member's line indent. Returns {text, start, end} or null. */
  var loc = jsonLocate(text, path);
  if (!loc) return null;
  var ls = text.lastIndexOf('\n', loc.keyStart) + 1;
  var indent = (text.slice(ls, loc.keyStart).match(/^[ \t]*/) || [''])[0];
  var adj = valueText.split('\n').join('\n' + indent);
  return {text: text.slice(0, loc.start) + adj + text.slice(loc.end),
          start: loc.start, end: loc.start + adj.length};
}
function jsonRemoveMember(text, containerPath, key){
  /* Remove one member (and the comma that binds it) from the object or
     array at containerPath. Returns {text} or null when absent. */
  var loc = containerPath.length ? jsonLocate(text, containerPath) : {start: jsonSkipWS(text, 0)};
  var cont = loc ? jsonContainer(text, loc.start) : null;
  if (!cont) return null;
  var idx = -1;
  for (var m = 0; m < cont.members.length; m++){
    if (cont.members[m].key === key){ idx = m; break; }
  }
  if (idx < 0) return null;
  var mem = cont.members[idx], from, to;
  if (cont.members.length === 1){ from = cont.open + 1; to = cont.close; }
  else if (idx === cont.members.length - 1){ from = cont.members[idx - 1].valEnd; to = mem.valEnd; }
  else { from = mem.keyStart; to = cont.members[idx + 1].keyStart; }
  return {text: text.slice(0, from) + text.slice(to)};
}
function jsonSetField(text, objPath, key, valueTextOrNull){
  /* Set (replace or insert) one field of the object at objPath; null value
     removes the field. Returns {text, start?, end?} or null. */
  var exists = jsonLocate(text, objPath.concat([key]));
  if (valueTextOrNull == null){
    if (!exists) return {text: text};
    return jsonRemoveMember(text, objPath, key);
  }
  if (exists) return jsonReplaceValue(text, objPath.concat([key]), valueTextOrNull);
  return jsonInsertMember(text, objPath, key, valueTextOrNull);
}

function jsonInsertArrayItemAfter(text, arrPath, afterIdx, itemText){
  /* Insert itemText into the array at arrPath directly AFTER member
     afterIdx (jsonInsertMember only appends at the end). */
  var loc = arrPath.length ? jsonLocate(text, arrPath) : {start: jsonSkipWS(text, 0)};
  var cont = loc ? jsonContainer(text, loc.start) : null;
  if (!cont || cont.isObj) return null;
  var anchor = cont.members[afterIdx];
  if (!anchor) return null;
  var ls = text.lastIndexOf('\n', anchor.keyStart) + 1;
  var indent = (text.slice(ls, anchor.keyStart).match(/^[ \t]*/) || [''])[0];
  var adjVal = itemText.split('\n').join('\n' + indent);
  var prefix = ',\n' + indent;
  var insertAt = anchor.valEnd;
  var start = insertAt + prefix.length;
  return {text: text.slice(0, insertAt) + prefix + adjVal + text.slice(insertAt),
          start: start, end: start + adjVal.length};
}

/* swap two items of one JSON array textually — each item keeps its own
   formatting, only the two spans trade places. Returns the swapped text
   plus the new spans: first = the slot at the SMALLER index, second = the
   slot at the larger. */
function jsonSwapListItems(text, listPath, i, j){
  if (i === j) return null;
  if (i > j){ var t = i; i = j; j = t; }
  var a = jsonLocate(text, listPath.concat([i]));
  var b = jsonLocate(text, listPath.concat([j]));
  if (!a || !b) return null;
  return {
    text: text.slice(0, a.start) + text.slice(b.start, b.end) +
          text.slice(a.end, b.start) + text.slice(a.start, a.end) + text.slice(b.end),
    first: {start: a.start, end: a.start + (b.end - b.start)},
    second: {start: b.end - (a.end - a.start), end: b.end}
  };
}
