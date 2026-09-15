/* A viewer plus import configuration; never the diagram editor. All persistence
   is a single macro config submission, so draft previews cannot mutate a page. */
export async function startConfluenceApp(document, bridge, core){
  const el = id => document.getElementById(id);
  const host = el('docview'), input = el('spec-input'), file = el('spec-file');
  const section = el('section'), focus = el('focus'), skin = el('skin');
  const save = el('save'), status = el('import-status'), appStatus = el('app-status');
  let controller = null, context = null, revision = 0, busy = false, reading = false;
  const destroy = () => { if (controller) controller.destroy(); controller = null; host.replaceChildren(); };
  function message(text, error = false){ status.textContent = text; status.classList.toggle('error',error); }
  function fail(text){ appStatus.hidden = false; appStatus.textContent = text; appStatus.classList.add('error'); }
  function selections(){ return {section:section.value,focus:focus.value,skin:skin.value}; }
  function optionsFor(page, selected){
    section.replaceChildren(new document.defaultView.Option('Entire spec','all'));
    core.confluenceSections(page).forEach(s=>section.add(new document.defaultView.Option(s.label,s.id)));
    section.value = selected;
    if (!section.value) section.value = 'all';
  }
  function protectLinks(){
    host.querySelectorAll('a[href]').forEach(a=>{
      const url = core.confluenceSourceUrl(a.getAttribute('href'),context.siteUrl);
      if (url) a.setAttribute('href',url);
      else { a.removeAttribute('href'); a.setAttribute('aria-disabled','true'); a.setAttribute('title','This source link is unavailable in Confluence.'); }
    });
  }
  function render(built){
    destroy();
    const page = core.confluenceDisplayPage(built.exported.page,built.config);
    const selectedSkin = core.SKIN_NAMES.includes(page.skin) ? page.skin : 'aurora';
    core.applySkinClasses(document.body,host,selectedSkin);
    controller = core.renderPage(host,page,selectedSkin,{}, {autoplay:!configuring});
    controller.onChange = protectLinks;
    protectLinks();
  }
  function preview(){
    if (busy) return null;
    if (reading){ message('Reading the selected file…'); return null; }
    const exported = core.buildConfluenceExport(input.value);
    if (exported.error){ destroy(); save.disabled = true; message(exported.error,true); return null; }
    optionsFor(exported.page,section.value || 'all');
    const built = core.buildConfluenceConfig(input.value,selections());
    if (built.error){ destroy(); save.disabled = true; message(built.error,true); return null; }
    try { render(built); }
    catch (ex){ destroy(); save.disabled = true; message('Could not render this spec: '+ex.message,true); return null; }
    save.disabled = false;
    const warnings = built.exported.warnings;
    message('Ready to save · '+Math.ceil(built.exported.bytes/1024)+' KiB'+
      (warnings.length ? '\nWarnings:\n'+warnings.join('\n') : ''));
    return built;
  }
  function changed(){ revision++; reading = false; save.disabled = true; destroy(); message('Preview the new JSON before saving.'); }
  function setBusy(value){
    busy = value;
    el('configuration').querySelectorAll('button,input,textarea,select').forEach(e=>{e.disabled=value;});
    save.textContent = value ? 'Saving…' : 'Save snapshot';
  }
  host.addEventListener('click',event=>{
    const a = event.target.closest('a');
    if (!a || !host.contains(a)) return;
    event.preventDefault(); event.stopPropagation();
    const url = core.confluenceSourceUrl(a.getAttribute('href'),context?.siteUrl);
    if (url) Promise.resolve().then(()=>bridge.router.open(url)).catch(()=>fail('Could not open the source link.'));
  },true);
  try { context = await bridge.view.getContext(); }
  catch { fail('Could not connect to Confluence. Reload the page to try again.'); return {destroy}; }
  appStatus.hidden = true;
  const config = context.extension?.config || {};
  const configuring = context.extension?.macro?.isConfiguring === true;
  if (!configuring){
    if (!config.specJson){ appStatus.hidden=false; appStatus.textContent='No diagram imported. Edit this macro to choose a Confluence JSON export or paste its JSON.'; return {destroy}; }
    const built = core.buildConfluenceConfig(config.specJson,config);
    if (built.error) { fail('This saved diagram could not be loaded.\n'+built.error); return {destroy}; }
    try { render(built); } catch (ex){destroy();fail('This saved diagram could not be rendered.\n'+ex.message);}
    return {destroy};
  }
  el('configuration').hidden = false;
  core.SKIN_NAMES.forEach(name=>skin.add(new document.defaultView.Option(name[0].toUpperCase()+name.slice(1),name)));
  input.value = typeof config.specJson === 'string' ? config.specJson : '';
  focus.value = ['spec','home','data'].includes(config.focus) ? config.focus : 'spec';
  skin.value = core.SKIN_NAMES.includes(config.skin) ? config.skin : 'spec';
  if (input.value){
    const existing = core.buildConfluenceExport(input.value);
    if (!existing.error) optionsFor(existing.page,config.section || 'all');
    preview();
  }
  input.addEventListener('input',changed);
  [section,focus,skin].forEach(field=>field.addEventListener('change',preview));
  file.addEventListener('change',async()=>{
    const selected = file.files?.[0]; file.value = '';
    if (!selected || busy) return;
    changed(); const current = revision;
    if (selected.size > core.CONFLUENCE_INPUT_BYTES){message('File is larger than 2 MiB. Export a smaller spec.',true);return;}
    reading = true; message('Reading the selected file…');
    try {
      const text = await selected.text();
      if (revision !== current || busy) return;
      reading = false; input.value=text; section.value='all'; preview();
    } catch {if(revision===current){ reading = false; message('Could not read that file. Try copying its JSON instead.',true); }}
  });
  el('validate').addEventListener('click',preview);
  save.addEventListener('click',async()=>{
    const built = preview(); if (!built) return;
    setBusy(true); message('Saving snapshot…');
    try { await bridge.view.submit({config:built.config}); message('Snapshot saved. Publish the Confluence page to share it.'); }
    catch (ex){message('Could not save the snapshot. Your imported JSON is still here. '+(ex.message || 'Try again.'),true);}
    finally {setBusy(false);}
  });
  el('cancel').addEventListener('click',()=>{
    if (!busy) Promise.resolve().then(()=>bridge.view.close()).catch(()=>message('Could not close configuration. Try Cancel again.',true));
  });
  return {destroy};
}
