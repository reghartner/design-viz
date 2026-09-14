/* Story navigation uses raw section paths; filtered indices never become edit indices. */
function builderStorySections(raw){
  return specSectionPaths(raw).map(function(rec, section){
    var d = specValueAt(raw, rec.diagram), sec = specValueAt(raw, rec.section) || {};
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    var ti = rec.section.indexOf('tabs');
    var parent = ti >= 0 ? specValueAt(raw, rec.section.slice(0, ti + 2)) : null;
    return {section:section, path:rec.diagram, diagram:d,
      tab:ti >= 0 ? {block:rec.section[ti - 1], tab:rec.section[ti + 1]} : null,
      label:(parent && parent.label ? parent.label + ' / ' : '') + (sec.heading || 'Section ' + (section + 1))};
  }).filter(Boolean);
}
function builderStorySteps(section, query){
  var terms = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  function count(n, noun){ return n + ' ' + noun + (n === 1 ? '' : 's'); }
  return (Array.isArray(section.diagram.steps) ? section.diagram.steps : []).map(function(step, index){
    step = step || {};
    var hops = builderStepHops(step), nodes = Array.isArray(step.nodes) ? step.nodes : [];
    var panels = step.panels && typeof step.panels === 'object' ? Object.keys(step.panels) : [];
    var caption = typeof step.text === 'string' && step.text ? step.text : 'Untitled step';
    var id = typeof step.id === 'string' ? step.id : '', lane = typeof step.lane === 'string' ? step.lane : '';
    var haystack = [index + 1, caption, id, lane].concat(hops, nodes, panels).join(' ').toLowerCase();
    if (!terms.every(function(term){ return haystack.indexOf(term) >= 0; })) return null;
    return {index:index, caption:caption, id:id, lane:lane,
      summary:[lane, count(hops.length, 'hop'), count(nodes.length, 'node'), count(panels.length, 'panel')].filter(Boolean).join(' · '),
      target:{kind:'step', section:section.section, index:index},
      path:section.path.concat(['steps', index]), tab:section.tab};
  }).filter(Boolean);
}

function initWorkbenchStepList(opts){
  var box = document.getElementById('sec-steps'), select = document.getElementById('steps-section');
  var search = document.getElementById('steps-search'), list = document.getElementById('steps-list');
  var status = document.getElementById('steps-status'), paging = document.getElementById('steps-paging');
  if (!box || !select || !search || !list || !status || !paging) return null;
  var buttons = {}, sections = [], chosen = null, entries = [], indexedText = null, raw = null;
  var offset = 0, pageSize = 200, lastSelection = '', stale = true;
  ['add','duplicate','earlier','later','previous','next'].forEach(function(name){ buttons[name] = document.getElementById('steps-' + name); });
  function current(){
    var target = opts.selection();
    return target && target.kind === 'step' && chosen && target.section === chosen.section ? target.index : -1;
  }
  function controls(){
    var index = current(), count = chosen && Array.isArray(chosen.diagram.steps) ? chosen.diagram.steps.length : 0;
    var blocked = stale || opts.locked() || !chosen;
    select.disabled = blocked; search.disabled = blocked;
    buttons.add.disabled = blocked;
    buttons.duplicate.disabled = blocked || index < 0 || index >= count;
    buttons.earlier.disabled = blocked || index <= 0 || index >= count;
    buttons.later.disabled = blocked || index < 0 || index >= count - 1;
    buttons.previous.disabled = stale || offset === 0;
    buttons.next.disabled = stale || offset + pageSize >= entries.length;
  }
  function invalidate(message){
    stale = true; list.innerHTML = ''; paging.hidden = true;
    select.disabled = true; search.disabled = true;
    status.textContent = message || 'Source changed. Click Render before editing story steps.';
    controls();
  }
  function ready(){
    if (stale || opts.src.value !== indexedText || (opts.renderedText && opts.renderedText() !== opts.src.value)){
      invalidate(); return false;
    }
    if (opts.locked()){
      status.textContent = 'Finish ADD TO STEP or edge connection first (Done or Esc).';
      controls(); return false;
    }
    return true;
  }
  function paint(){
    list.innerHTML = '';
    var index = current();
    entries.slice(offset, offset + pageSize).forEach(function(entry){
      var button = document.createElement('button');
      button.type = 'button'; button.className = 'story-step';
      button.setAttribute('data-step-index', entry.index);
      button.setAttribute('aria-current', entry.index === index ? 'step' : 'false');
      button.setAttribute('aria-label', 'Edit step ' + (entry.index + 1) + ': ' + entry.caption);
      var number = document.createElement('b'); number.textContent = entry.index + 1;
      var text = document.createElement('span'), caption = document.createElement('span'), meta = document.createElement('small');
      caption.className = 'story-caption'; caption.textContent = entry.caption;
      meta.textContent = (entry.id ? entry.id + ' · ' : '') + entry.summary;
      text.appendChild(caption); text.appendChild(meta); button.appendChild(number); button.appendChild(text);
      button.title = entry.caption + '\n' + meta.textContent;
      button.addEventListener('click', function(){
        if (!ready()) return;
        opts.navigate(entry);
        var selected = list.querySelector('[aria-current="step"]');
        if (selected) selected.focus({preventScroll:true});
      });
      list.appendChild(button);
    });
    var total = chosen && Array.isArray(chosen.diagram.steps) ? chosen.diagram.steps.length : 0;
    status.textContent = !chosen ? 'No diagrams in this document.' : !total ? 'No steps yet. Add a beat to begin.' :
      !entries.length ? 'No matching steps. Clear the filter to see the story.' :
      (offset + 1) + '–' + Math.min(offset + pageSize, entries.length) + ' of ' + entries.length +
      ' matching steps · ' + total + ' total';
    paging.hidden = entries.length <= pageSize;
    controls();
  }
  function filter(followSelection){
    entries = chosen ? builderStorySteps(chosen, search.value) : [];
    offset = 0;
    if (followSelection){
      var at = entries.findIndex(function(entry){ return entry.index === current(); });
      if (at >= 0) offset = Math.floor(at / pageSize) * pageSize;
    }
    paint();
  }
  function refresh(){
    if (opts.renderedText && opts.renderedText() !== opts.src.value){ invalidate(); return; }
    if (indexedText === opts.src.value && !stale){ sync(); return; }
    try { raw = JSON.parse(opts.src.value); sections = builderStorySections(raw); }
    catch (ex){ invalidate('Fix the JSON source and click Render to browse story steps.'); return; }
    var previous = chosen, target = opts.selection();
    chosen = sections.find(function(section){ return target && target.section === section.section; }) ||
      sections.find(function(section){ return previous && section.label === previous.label && JSON.stringify(section.path) === JSON.stringify(previous.path); }) || sections[0] || null;
    indexedText = opts.src.value; stale = false;
    select.innerHTML = '';
    sections.forEach(function(section){
      var option = document.createElement('option'); option.value = String(section.section);
      option.textContent = (section.section + 1) + ' · ' + section.label;
      select.appendChild(option);
    });
    select.disabled = !chosen; search.disabled = !chosen;
    if (chosen) select.value = String(chosen.section);
    lastSelection = JSON.stringify(target);
    filter(true);
  }
  function sync(){
    if (opts.src.value !== indexedText || stale){ refresh(); return; }
    var target = opts.selection(), signature = JSON.stringify(target);
    if (signature !== lastSelection){
      lastSelection = signature;
      var section = sections.find(function(s){ return target && s.section === target.section; });
      if (section && section !== chosen){ chosen = section; select.value = String(section.section); search.value = ''; filter(true); return; }
      var at = entries.findIndex(function(entry){ return entry.index === current(); });
      if (at >= 0 && (at < offset || at >= offset + pageSize)){ offset = Math.floor(at / pageSize) * pageSize; paint(); return; }
    }
    Array.prototype.forEach.call(list.children, function(button){
      button.setAttribute('aria-current', Number(button.getAttribute('data-step-index')) === current() ? 'step' : 'false');
    });
    controls();
  }
  select.addEventListener('change', function(){
    if (!ready()){ if (chosen) select.value = String(chosen.section); return; }
    chosen = sections.find(function(s){ return String(s.section) === select.value; }) || null;
    search.value = ''; filter(false);
  });
  search.addEventListener('input', function(){ if (ready()) filter(false); });
  search.addEventListener('keydown', function(ev){
    if ((ev.key === 'ArrowDown' || ev.key === 'Enter') && list.firstChild){ ev.preventDefault(); list.firstChild.focus(); }
  });
  list.addEventListener('keydown', function(ev){
    var row = ev.target.closest && ev.target.closest('.story-step');
    var rows = Array.prototype.slice.call(list.children), at = rows.indexOf(row), next;
    if (at < 0 || ev.altKey || ev.metaKey || ev.ctrlKey) return;
    if (ev.key === 'ArrowDown') next = Math.min(at + 1, rows.length - 1);
    else if (ev.key === 'ArrowUp') next = Math.max(0, at - 1);
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = rows.length - 1;
    else return;
    ev.preventDefault(); rows[next].focus();
  });
  ['previous','next'].forEach(function(name){ buttons[name].addEventListener('click', function(){
    if (!ready()) return;
    offset = Math.max(0, Math.min(Math.floor((entries.length - 1) / pageSize) * pageSize,
      offset + (name === 'next' ? pageSize : -pageSize)));
    paint(); if (list.firstChild) list.firstChild.focus();
  }); });
  ['add','duplicate','earlier','later'].forEach(function(name){ buttons[name].addEventListener('click', function(){
    if (!ready() || !chosen || buttons[name].disabled) return;
    var index = current(), section = chosen.section;
    var plan = name === 'add' ? planAddStep(indexedText, raw, section) : name === 'duplicate' ?
      planDuplicateStep(indexedText, raw, section, index) : planMoveStep(indexedText, raw, section, index, name === 'earlier' ? -1 : 1);
    if (plan.error){ status.textContent = plan.error; return; }
    if (!opts.apply(plan, section)) return;
    search.value = ''; refresh();
    var selected = list.querySelector('[aria-current="step"]');
    if (selected){
      selected.scrollIntoView({block:'nearest'});
      /* a moved row's text looks identical in its new slot — pulse it so
         the click visibly landed */
      selected.className = 'story-step story-moved';
      setTimeout(function(){ selected.className = 'story-step'; }, 900);
    }
    if (!buttons[name].disabled) buttons[name].focus(); else if (selected) selected.focus();
  }); });
  opts.src.addEventListener('input', function(){ invalidate(); });
  box.addEventListener('focusin', function(){ if (opts.pause) opts.pause(); });
  box.addEventListener('toggle', function(){ if (box.open) refresh(); });
  new MutationObserver(refresh).observe(opts.view, {childList:true});
  /* Mode transitions do not replace the page; re-evaluate button availability. */
  document.addEventListener('click', controls);
  document.addEventListener('keydown', function(ev){
    /* The builder's Escape handler is registered later; read its settled mode. */
    if (ev.key === 'Escape') setTimeout(sync, 0);
  });
  refresh();
  return {sync:sync};
}
