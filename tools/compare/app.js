/* Git Compare picker page (issue #849). Talks only to the local server's JSON API. Every text
   from git or GitHub (subjects, authors, branch, tag and pull request names) is untrusted and is
   written with textContent only. */
'use strict';
(function(){
  const $ = selector => document.querySelector(selector);
  const state = {doc:null, from:null, to:null, side:'from', tab:'document', query:'', page:1};
  let docToken = 0, listToken = 0, betweenToken = 0, pickToken = 0, choiceToken = 0, lookupToken = 0, searchTimer = 0;

  /* ---------- helpers ---------- */
  const minute = iso => iso ? String(iso).slice(0, 10) + ' ' + String(iso).slice(11, 16) : '';
  function el(tag, attrs, text){
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    if (text != null) node.textContent = String(text);
    return node;
  }
  async function api(url, options){
    const response = await fetch(url, Object.assign({headers:{Accept:'application/json'}}, options || {}));
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body && body.error || 'The request failed.');
    return body;
  }
  const q = params => Object.entries(params).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  function message(text){ const m = $('#message'); m.textContent = text || ''; m.hidden = !text; }

  /* ---------- header ---------- */
  function renderStatus(s){
    document.querySelector('[data-testid="clone-state"]').textContent = 'Clone: ' + s.path + ' · last fetch ' + (s.lastFetch ? minute(s.lastFetch) + ' UTC' : 'never');
    document.querySelector('[data-testid="gh-state"]').textContent = s.gh && s.gh.signedIn
      ? 'GitHub: signed in as ' + s.gh.login : 'GitHub: not signed in. Run: ' + (s.gh && s.gh.command || 'gh auth login');
  }
  async function loadStatus(){ try{ renderStatus(await api('/api/status')); }catch(ex){ message(ex.message); } }

  /* ---------- documents (from the To revision, or HEAD before one is chosen) ---------- */
  async function loadDocuments(){
    const token = ++docToken, rev = state.to ? state.to.rev : 'HEAD';
    let list;
    try{ list = await api('/api/documents?' + q({rev})); }catch(ex){ if (token === docToken) message(ex.message); return; }
    if (token !== docToken) return;
    const select = $('#document'), options = list.map(path => [path, path]);
    if (state.doc && !list.includes(state.doc)) options.push([state.doc, state.doc + ' (not in To)']);
    options.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    select.replaceChildren(...options.map(([value, label]) => { const o = el('option', {value}, label); return o; }));
    if (!state.doc && list.length){ state.doc = list[0]; refreshAfterDocument(); }
    if (state.doc) select.value = state.doc;
  }
  function refreshAfterDocument(){
    loadBetween();
    if (!$('.picker').hidden){ state.page = 1; loadRows(); }
  }

  /* ---------- choices ---------- */
  function renderChoice(side){
    const chosen = state[side], node = document.querySelector('[data-testid="' + side + '-choice"]');
    node.textContent = !chosen ? 'No revision chosen' : chosen.label ? chosen.label
      : [chosen.row.short, minute(chosen.row.date), chosen.row.author, chosen.row.subject].join(' · ');
  }
  function setChoice(side, choice){
    ++choiceToken;
    state[side] = choice; renderChoice(side);
    if (side === 'to') loadDocuments();
    loadBetween();
  }

  /* ---------- picker ---------- */
  function badges(row){
    const list = [...row.branches, ...row.tags, ...row.prs.map(n => 'PR #' + n)];
    if (row.touches) list.push('changes this document');
    return list;
  }
  function rowNode(row){
    const li = el('li', {role:'option', 'aria-selected':'false', tabindex:'-1'});
    li.append(el('span', {'data-field':'date', class:'date'}, minute(row.date)));
    const body = el('span', {class:'body'}), line1 = el('span', {class:'line'}), line2 = el('span', {class:'line meta'});
    const marks = el('span', {class:'badges'});
    badges(row).forEach(b => marks.append(el('span', {'data-field':'badge', class:'badge'}, b)));
    line1.append(marks, el('span', {'data-field':'subject', class:'subject'}, row.subject));
    line2.append(el('span', {'data-field':'sha', class:'sha'}, row.short), el('span', {'data-field':'author'}, row.author));
    body.append(line1, line2); li.append(body);
    li.addEventListener('click', () => pick(row, li));
    li.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); pick(row, li); } });
    return li;
  }
  /* A pull request is chosen by number so the server can fetch a head the clone does not have.
     If that fails, the row is marked and stays unchosen. */
  async function pick(row, li){
    if (li.getAttribute('aria-disabled') === 'true' || li.getAttribute('aria-busy') === 'true') return;
    /* Only the latest click may choose: an earlier row's check that finishes later is ignored. */
    const side = state.side, token = listToken, click = ++pickToken, pr = state.tab === 'prs' && row.prs.length ? 'pr:' + row.prs[0] : null;
    if (pr){
      li.setAttribute('aria-busy', 'true');
      try{ await api('/api/documents?' + q({rev:pr})); }
      catch(ex){
        li.setAttribute('aria-disabled', 'true');
        li.querySelector('.meta').append(el('span', {class:'unavailable'}, 'not available locally'));
        return;
      }finally{ li.removeAttribute('aria-busy'); }
      if (click !== pickToken || token !== listToken || state.side !== side) return;
    }
    closePicker();
    setChoice(side, {rev:pr || row.sha, row});
  }
  async function loadRows(append){
    const picker = $('.picker'), list = picker.querySelector('[role=listbox]'), error = picker.querySelector('.error'), more = picker.querySelector('.more');
    const token = ++listToken;
    if (!append){ list.replaceChildren(); error.hidden = true; more.hidden = true; }
    if (!state.doc) return;
    /* Show more stays disabled until this page arrives, so a second click cannot skip a page. */
    more.setAttribute('aria-disabled', 'true');
    let out;
    try{ out = await api('/api/revisions?' + q({doc:state.doc, tab:state.tab, q:state.query, page:state.page})); }
    catch(ex){ if (token === listToken){ error.textContent = ex.message; error.hidden = false; more.disabled = false; } return; }
    if (token !== listToken) return;
    more.disabled = false;
    if (out.error){ error.textContent = out.error; error.hidden = false; } else error.hidden = true;
    list.append(...out.rows.map(rowNode));
    more.hidden = !(out.page < out.pages);
  }
  function selectTab(tab){
    state.tab = tab; state.page = 1;
    document.querySelectorAll('.picker [role=tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
    loadRows();
  }
  function openPicker(side){
    const picker = $('.picker'), section = document.querySelector('.side[data-side="' + side + '"]');
    if (!picker.hidden && state.side === side){ closePicker(); return; }
    state.side = side; state.query = ''; state.page = 1;
    picker.setAttribute('aria-label', (side === 'from' ? 'From' : 'To') + ' revisions');
    picker.querySelector('input').value = '';
    picker.classList.toggle('right', side === 'to');
    document.querySelectorAll('.trigger').forEach(t => t.setAttribute('aria-expanded', 'false'));
    section.querySelector('.trigger').setAttribute('aria-expanded', 'true');
    picker.hidden = false;
    selectTab('document');
    picker.querySelector('input').focus();
  }
  function closePicker(){
    const picker = $('.picker');
    if (picker.hidden) return;
    picker.hidden = true; ++listToken; ++pickToken;
    document.querySelectorAll('.trigger').forEach(t => t.setAttribute('aria-expanded', 'false'));
  }

  /* ---------- between these revisions ---------- */
  async function loadBetween(){
    const section = $('.between'), note = section.querySelector('.note'), list = section.querySelector('ul');
    const token = ++betweenToken;
    list.replaceChildren();
    if (!state.from || !state.to || !state.doc){ note.textContent = 'Choose From and To to list the commits between them.'; return; }
    note.textContent = 'Loading…';
    let rows;
    try{ rows = await api('/api/between?' + q({from:state.from.rev, to:state.to.rev, doc:state.doc})); }
    catch(ex){ if (token === betweenToken) note.textContent = ex.message; return; }
    if (token !== betweenToken) return;
    note.textContent = rows.length ? 'Commits after From up to To that change ' + state.doc + ', newest first.' : 'No commits between these revisions change this document.';
    list.replaceChildren(...rows.map(row => {
      const li = el('li');
      li.append(el('span', {'data-field':'date', class:'date'}, minute(row.date)), el('span', {'data-field':'sha', class:'sha'}, row.short));
      const body = el('span', {class:'body'});
      body.append(el('span', {'data-field':'subject', class:'subject'}, row.subject));
      const meta = el('span', {class:'line meta'});
      meta.append(el('span', {}, row.author));
      row.prs.forEach(n => meta.append(el('span', {'data-field':'pr', class:'badge'}, 'PR #' + n)));
      body.append(meta); li.append(body);
      const button = el('button', {type:'button'}, 'Compare this commit');
      if (!row.parent){ button.disabled = true; button.title = 'The first commit has no parent to compare with.'; }
      button.addEventListener('click', () => compareCommit(row));
      li.append(button);
      return li;
    }));
  }
  /* First parent (for a merge, the branch merged into) against the commit. */
  /* The section is aria-busy while the latest parent lookup runs; a choice made meanwhile wins. */
  async function compareCommit(row){
    const token = ++choiceToken, lookup = ++lookupToken, section = $('.between');
    let parentRow;
    section.setAttribute('aria-busy', 'true');
    try{
      const out = await api('/api/revisions?' + q({doc:state.doc, tab:'all', q:row.parent, page:1}));
      parentRow = out.rows.find(r => r.sha === row.parent);
    }catch(ex){ if (token === choiceToken) message(ex.message); return; }
    finally{ if (lookup === lookupToken) section.removeAttribute('aria-busy'); }
    if (token !== choiceToken) return;
    /* A parent that no branch or tag reaches (inside a fetched pull request) is chosen by SHA. */
    state.from = parentRow ? {rev:row.parent, row:parentRow}
      : {rev:row.parent, label:row.parent.slice(0, 7) + ' · first parent of ' + row.short};
    renderChoice('from');
    setChoice('to', {rev:row.sha, row});
  }

  /* ---------- wiring ---------- */
  document.querySelectorAll('.side').forEach(section => section.querySelector('.trigger').addEventListener('click', () => openPicker(section.dataset.side)));
  document.querySelectorAll('.picker [role=tab]').forEach(t => t.addEventListener('click', () => selectTab(t.dataset.tab)));
  $('.picker input').addEventListener('input', ev => {
    clearTimeout(searchTimer);
    if ($('.picker').hidden) return;
    searchTimer = setTimeout(() => { state.query = ev.target.value; state.page = 1; loadRows(); }, 150);
  });
  $('.picker .more').addEventListener('click', () => { state.page += 1; loadRows(true); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closePicker(); });
  document.addEventListener('mousedown', ev => {
    const picker = $('.picker');
    if (!picker.hidden && !picker.contains(ev.target) && !ev.target.closest('.trigger')) closePicker();
  });
  $('#swap').addEventListener('click', () => {
    ++choiceToken;
    [state.from, state.to] = [state.to, state.from];
    renderChoice('from'); renderChoice('to'); loadDocuments(); loadBetween();
  });
  $('#document').addEventListener('change', ev => { ++choiceToken; state.doc = ev.target.value; loadDocuments(); refreshAfterDocument(); });
  $('#fetch').addEventListener('click', async ev => {
    const button = ev.currentTarget;
    button.disabled = true; message('');
    try{ renderStatus(await api('/api/fetch', {method:'POST'})); if (!$('.picker').hidden){ state.page = 1; loadRows(); } loadDocuments(); loadBetween(); }
    catch(ex){ message(ex.message); }
    finally{ button.disabled = false; }
  });
  loadStatus(); loadDocuments(); loadBetween();
})();
