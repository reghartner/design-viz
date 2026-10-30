/* #826: a live board published as two files (index.html + flowspec.json) boots
   from the file. Contract source: #826 "What changes" + "Test + flip", #825
   Design "Save: the board is published as two files"; Chuck 2026-10-30 ruling:
   the issue's own Test + flip plan. Python rows P1-P7 live in tests/test_inject.py.
   Observation seam: the standalone boot hands its controller to a host hook
   `window.flowviewBooted(ctl)` (same host-hook family as window.flowviewLiveStatus);
   the test stores it and reads `ctl.sourceText()`; it never calls other internals.

| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| B1 two-file page renders from flowspec.json when it differs from the inline block | injected --two-file page, flowspec.json overwritten with a different title | `#docview .doc-title` text == the file's title, not the inline block's | boot that reads only the inline block (no fetch) |
| B2 `ctl.sourceText()` is the served flowspec.json byte for byte | file with tabs + 2-space indentation, key order sections/canon/title, trailing newline | `ctl.sourceText()` === the file text read from disk | re-serialized (JSON.stringify) text; text of the inline block |
| B3 single-file page: `ctl.sourceText()` is the inline block's text content byte for byte | injected single-file page whose block has the same distinctive formatting | `ctl.sourceText()` === `#flowspec` textContent, whose trimmed form is the block text in the HTML on disk; no request for flowspec.json; no marker in the HTML | re-serialized text; trimmed text; a boot that fetches without the marker |
| B4 fetched spec fails the workspace-handoff gate | two-file page, inline spec A, file spec B (same canon id), `#fv=` request with A's revision | `#docview .errbox` contains "changed since"; `#docview .doc-title` count 0 | skipping the gate on the fetched path (B renders); falling back to the inline A on gate failure (A renders) |
| B5 fetched spec passes the gate | same page, `#fv=` request with B's revision | `#docview .doc-title` text == B's title | a gate that compares against the inline block |
| B6 missing flowspec.json boots the inline block | two-file page with the file deleted (404 allowed) | `#docview .doc-title` == inline title; `.errbox` count 0; `ctl.sourceText()` === `#flowspec` textContent (trimmed: the block text on disk); one request for flowspec.json was made | fail() on fetch error; no fetch attempt at all |
| B7 load failure shows the persistent warning (Chuck 2026-10-30) | B6's page (HTTP 404) and B8's page (malformed) | `.dv-source-fallback[role=alert]` visible, names both facts (latest version not loaded; copy saved at publish shown, later changes not shown), no dismiss control; `ctl.sourceFallback()` == `{reason:'http', detail:'HTTP 404'}` / `{reason:'parse', detail:<JSON.parse message>}`; `.errbox` count 0 | a toast; a dismissible notice; fail() on a malformed file; a boot that reports no fallback state |
| B8 malformed flowspec.json boots the inline block | two-file page whose file is `{not json` | `#docview .doc-title` == inline title; `ctl.sourceText()` === `#flowspec` textContent | rendering nothing; rendering the broken file; sourceText from the file |
| B9 Copy error copies the diagnostics | real click on the banner's `Copy error` button with clipboard permission granted | clipboard text contains the failure detail (parse message / `HTTP 404`), `flowspec.json`, the page title, the renderer version line, a timestamp and the inline-boot hint; the button reads `Copied` | copying only the banner sentence; a button that opens a dialog |
| B10 no banner without the marker and without a failure | B3's single-file page; B1's two-file page that loaded | `.dv-source-fallback` count 0; `ctl.sourceFallback()` null | a banner on every two-file page; a banner on single-file pages |
| B11 network failure boots the inline block and warns | two-file page whose flowspec.json request is aborted by the test (`route.abort('aborted')`) | `#docview .doc-title` == inline title; banner as B7; `ctl.sourceFallback().reason` == `network`, detail names the fetch failure; Copy error text contains that detail | treating only HTTP statuses and parse errors as failures; fail() on a network error |
| B12 the warning persists | B6's page after 3 s, a real click on a node card and a wheel scroll | banner still visible, still one button reading `Copy error`, no close/dismiss control (`[aria-label*=close i]`, `[aria-label*=dismiss i]`, `.close`) | a toast that auto-hides; a banner that collapses on interaction; a dismiss button |
*/
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const MARKER='<meta name="dv-spec-file" content="flowspec.json">';
// The block as written on disk. Python's text-mode write makes the HTML CRLF on
// Windows (m3); the HTML parser normalizes CRLF to LF in text content, so the
// on-disk text is normalized the same way before any comparison with the DOM.
const BLOCK=/^<script type="application\/json" id="flowspec">\r?\n([\s\S]*?)\r?\n<\/script>/m;
const blockOf=html=>{const m=BLOCK.exec(html);expect(m,'inline flowspec block present').not.toBeNull();return m[1].replace(/\r\n/g,'\n');};
const canon={version:1,id:'board',kind:'canonical',owner:'group:default/test'};
const diagram={nodes:{a:{title:'Alpha'},b:{title:'Beta'}},rows:[['a','b']],edges:[{from:'a',to:'b'}]};
const inline={page:{title:'Inline block',canon,sections:[{id:'main',heading:'Main board',diagram}]}};
// Distinctive authored text: tabs and two-space indentation mixed, keys ordered
// sections / canon / title (JSON.stringify of the parsed object orders them the
// same way but drops the whitespace), and a trailing newline.
function formatted(title){
 return '{\n\t"page": {\n\t\t"sections": [{"id": "main", "heading": "Main board", "diagram": '+JSON.stringify(diagram)+'}],\n  "canon": '+JSON.stringify(canon)+',\n\t"title": '+JSON.stringify(title)+'\n\t}\n}\n';
}
const revision=spec=>createHash('sha256').update(JSON.stringify(spec)).digest('hex');
const handoff=rev=>'#fv='+encodeURIComponent(JSON.stringify({version:1,id:'board',revision:rev,action:'view'}));
function expectDistinctive(text){
 expect(text).toContain('\n\t"page"');expect(text).toContain('\n  "canon"');expect(text.endsWith('\n')).toBe(true);
 expect(text).not.toBe(JSON.stringify(JSON.parse(text)));
 expect(text).not.toBe(JSON.stringify(JSON.parse(text),null,2));
}
async function build(server,name,specText,twoFile){
 const dir=path.join(server.root,'two-file-'+name);await rm(dir,{recursive:true,force:true});await mkdir(dir,{recursive:true});
 const spec=path.join(dir,'board.spec.json'),out=path.join(dir,'index.html');await writeFile(spec,specText);
 execFileSync('python3',[path.join(repo,'tools/inject.py'),spec,path.join(repo,'template/flowview.html'),out,...(twoFile?['--two-file']:[])]);
 await rm(spec);
 const html=await readFile(out,'utf8');expect(html.includes(MARKER)).toBe(twoFile);
 return {dir,html,url:server.origin+'/two-file-'+name+'/index.html'};
}
function captureController(page){
 return page.addInitScript(()=>{window.flowviewBooted=ctl=>{window.__board=ctl;};});
}
const sourceText=page=>page.evaluate(()=>window.__board && typeof window.__board.sourceText==='function'?window.__board.sourceText():null);
const sourceFallback=page=>page.evaluate(()=>window.__board && typeof window.__board.sourceFallback==='function'?window.__board.sourceFallback():'no sourceFallback accessor');
const BANNER_FACTS=[/latest version/i,/saved when the page was published/i,/not shown/i];
// The persistent warning: visible, both facts, no way to dismiss it, no error box.
async function expectFallbackBanner(page){
 const banner=page.locator('.dv-source-fallback[role="alert"]');await expect(banner).toHaveCount(1);await expect(banner).toBeVisible();
 for(const fact of BANNER_FACTS)await expect(banner).toContainText(fact);
 await expect(banner.getByRole('button')).toHaveCount(1);await expect(banner.getByRole('button',{name:'Copy error',exact:true})).toBeVisible();
 expect((await banner.boundingBox()).height).toBeGreaterThan(40);
 await expect(page.locator('#docview .errbox')).toHaveCount(0);
 await expectNoDismiss(banner);
 return banner;
}
async function expectNoDismiss(banner){
 await expect(banner.locator('[aria-label*="close" i],[aria-label*="dismiss" i],.close,[data-dismiss]')).toHaveCount(0);
 await expect(banner.getByRole('button')).toHaveCount(1);await expect(banner.getByRole('button')).toHaveText('Copy error');
}
// Persistent: still there after time passes and after ordinary reading gestures.
async function expectBannerPersists(page,banner){
 await page.waitForTimeout(3000);
 const card=page.locator('#docview .node').first();await card.scrollIntoViewIfNeeded();const box=await card.boundingBox();await card.click({position:{x:box.width-6,y:box.height/2}});
 await page.mouse.wheel(0,400);await page.waitForTimeout(300);
 await expect(banner).toBeVisible();await expectNoDismiss(banner);
 for(const fact of BANNER_FACTS)await expect(banner).toContainText(fact);
}
// A real click copies the diagnostics; the clipboard is read back as data.
async function copyError(page,banner){
 await banner.getByRole('button',{name:'Copy error',exact:true}).click();
 await expect(banner.getByRole('button')).toHaveText('Copied');
 return page.evaluate(()=>navigator.clipboard.readText());
}
async function expectDiagnostics(text,detail,title){
 expect(text).toContain(detail);expect(text).toContain('flowspec.json');expect(text).toContain(title);
 expect(text).toMatch(/authoredWith|not stamped/);expect(text).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);expect(text).toMatch(/inline flowspec block/);
}
const blockText=page=>page.evaluate(()=>document.getElementById('flowspec').textContent);
function specRequests(page){
 const urls=[];page.on('request',request=>{if(request.url().endsWith('/flowspec.json'))urls.push(request.url());});return urls;
}

test('two-file page renders from flowspec.json and keeps its exact text as sourceText',async({page,server})=>{
 const {dir,html,url}=await build(server,'served',JSON.stringify(inline),true);
 const file=path.join(dir,'flowspec.json');
 expect(JSON.parse(await readFile(file,'utf8'))).toEqual(inline);
 const text=formatted('Served from the file');expectDistinctive(text);await writeFile(file,text);
 expect(blockOf(html)).toBe(JSON.stringify(inline));expect(text).not.toBe(blockOf(html));
 await captureController(page);const requests=specRequests(page);
 await page.goto(url);
 // B1: the file wins over the inline block
 await expect(page.locator('#docview .doc-title')).toHaveText('Served from the file');
 await expect(page.locator('#docview .errbox')).toHaveCount(0);
 expect(requests).toHaveLength(1);
 // B2: byte for byte, never re-serialized
 expect(await sourceText(page)).toBe(await readFile(file,'utf8'));
 expect(await sourceText(page)).not.toBe(await blockText(page));
 // B10: a loaded file is no fallback
 await expect(page.locator('.dv-source-fallback')).toHaveCount(0);
 expect(await sourceFallback(page)).toBeNull();
});

test('single-file page keeps the inline block text as sourceText and never fetches',async({page,server})=>{
 const text=formatted('Inline formatted');expectDistinctive(text);
 const {html,url}=await build(server,'single',text,false);
 const block=blockOf(html);expect(block).toBe(text.trim());expect(block).not.toBe(JSON.stringify(JSON.parse(block)));
 await captureController(page);const requests=specRequests(page);
 await page.goto(url);
 await expect(page.locator('#docview .doc-title')).toHaveText('Inline formatted');
 // B3: the block's text content, exactly (the DOM keeps the newlines around
 // the authored text), and no fetch without the marker
 const content=await blockText(page);expect(content.trim()).toBe(block);expect(content).not.toBe(block);
 expect(await sourceText(page)).toBe(content);
 expect(requests).toEqual([]);
 // B10: single-file pages never show the warning
 await expect(page.locator('.dv-source-fallback')).toHaveCount(0);
 expect(await sourceFallback(page)).toBeNull();
});

test('fetched flowspec.json passes the workspace-handoff gate before boot',async({page,server})=>{
 const {dir,url}=await build(server,'handoff',JSON.stringify(inline),true);
 const served=formatted('Served from the file');await writeFile(path.join(dir,'flowspec.json'),served);
 const inlineRevision=revision(inline),fileRevision=revision(JSON.parse(served));
 expect(inlineRevision).not.toBe(fileRevision);
 await captureController(page);
 // B4: the request pins the inline spec's revision; the fetched file is a different revision
 await page.goto(url+handoff(inlineRevision));
 await expect(page.locator('#docview .errbox')).toContainText('changed since');
 await expect(page.locator('#docview .doc-title')).toHaveCount(0);
 await expect(page.locator('#docview .node')).toHaveCount(0);
 expect(await sourceText(page)).toBeNull();
 // B5: a request matching the file renders it
 await page.goto('about:blank');await page.goto(url+handoff(fileRevision));
 await expect(page.locator('#docview .doc-title')).toHaveText('Served from the file');
 await expect(page.locator('#docview .errbox')).toHaveCount(0);
 expect(await sourceText(page)).toBe(served);
});

test('two-file page without its flowspec.json boots the inline block and warns',async({page,context,server,audit})=>{
 const {dir,html,url}=await build(server,'missing',JSON.stringify(inline),true);
 await rm(path.join(dir,'flowspec.json'));
 audit.allowStatus(404,requested=>requested.endsWith('/flowspec.json'));
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:server.origin});
 await captureController(page);const requests=specRequests(page);
 await page.goto(url);
 // B6: the fetch was attempted, failed, and the inline block rendered
 await expect(page.locator('#docview .doc-title')).toHaveText('Inline block');
 await expect(page.locator('#docview .errbox')).toHaveCount(0);
 expect(requests).toHaveLength(1);
 const content=await blockText(page);expect(content.trim()).toBe(blockOf(html));
 expect(await sourceText(page)).toBe(content);
 // B7: the persistent warning, with the HTTP status as the reason
 const banner=await expectFallbackBanner(page);
 expect(await sourceFallback(page)).toEqual({reason:'http',detail:'HTTP 404'});
 // B12: still there after time and interaction
 await expectBannerPersists(page,banner);
 // B9: Copy error
 await expectDiagnostics(await copyError(page,banner),'HTTP 404','Inline block');
});

test('two-file page whose flowspec.json request fails boots the inline block and warns',async({page,context,server,audit})=>{
 const {dir,html,url}=await build(server,'network',JSON.stringify(inline),true);
 expect(JSON.parse(await readFile(path.join(dir,'flowspec.json'),'utf8'))).toEqual(inline);
 // The file exists; the network drops the request. Only that one abort is allowed by the audit.
 page.on('request',request=>{if(request.url().endsWith('/flowspec.json'))audit.allowAbort(request);});
 audit.allowStatus(0,requested=>requested.endsWith('/flowspec.json'));
 await page.route('**/flowspec.json',route=>route.abort('aborted'));
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:server.origin});
 await captureController(page);const requests=specRequests(page);
 await page.goto(url);
 // B11: the inline block renders behind the warning
 await expect(page.locator('#docview .doc-title')).toHaveText('Inline block');
 await expect(page.locator('#docview .node')).toHaveCount(2);
 expect(requests).toHaveLength(1);
 const content=await blockText(page);expect(content.trim()).toBe(blockOf(html));
 expect(await sourceText(page)).toBe(content);
 const banner=await expectFallbackBanner(page);
 const fallback=await sourceFallback(page);expect(fallback.reason).toBe('network');expect(fallback.detail).toMatch(/fetch/i);
 await expectDiagnostics(await copyError(page,banner),fallback.detail,'Inline block');
});

test('two-file page with a malformed flowspec.json boots the inline block and warns',async({page,context,server})=>{
 const {dir,html,url}=await build(server,'malformed',JSON.stringify(inline),true);
 await writeFile(path.join(dir,'flowspec.json'),'{not json\n');
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:server.origin});
 await captureController(page);const requests=specRequests(page);
 await page.goto(url);
 // B8: the broken file is fetched, the inline block renders
 await expect(page.locator('#docview .doc-title')).toHaveText('Inline block');
 await expect(page.locator('#docview .node')).toHaveCount(2);
 expect(requests).toHaveLength(1);
 const content=await blockText(page);expect(content.trim()).toBe(blockOf(html));
 expect(await sourceText(page)).toBe(content);
 // B7: the warning names the parse failure
 const banner=await expectFallbackBanner(page);
 const fallback=await sourceFallback(page);expect(fallback.reason).toBe('parse');expect(fallback.detail).toMatch(/JSON|token|json/i);
 // B9: Copy error carries that detail
 await expectDiagnostics(await copyError(page,banner),fallback.detail,'Inline block');
});
