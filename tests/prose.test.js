'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {entrypoint}=require('../tools/source-loader.cjs');
const C={console,URL};vm.runInNewContext(entrypoint('native').source,C);

test('inline code is literal, including markup, tags, entities and shorter backtick runs',()=>{
  assert.equal(C.inlineMarkup('Use `**raw** [link](https://example.test) <b>&amp;</b>` now'),
    'Use <code>**raw** [link](https://example.test) &lt;b&gt;&amp;amp;&lt;/b&gt;</code> now');
  assert.equal(C.inlineMarkup('Use ``a `quoted` value`` and `x`'), 'Use <code>a `quoted` value</code> and <code>x</code>');
  assert.equal(C.inlineMarkup('An unmatched `tick'), 'An unmatched `tick');
  assert.equal(C.inlineMarkup('**Call `receive()`** with *care*'), '<strong>Call <code>receive()</code></strong> with <em>care</em>');
  assert.equal(C.inlineMarkup('**Run `a*b` now**'), '<strong>Run <code>a*b</code> now</strong>');
  assert.equal(C.inlineMarkup('*Use `a*b` here*'), '<em>Use <code>a*b</code> here</em>');
  assert.equal(C.inlineMarkup('**Use `**literal**` now**'), '<strong>Use <code>**literal**</code> now</strong>');
});

test('inline links cannot acquire HTML from formatting their attributes',()=>{
  assert.equal(C.inlineMarkup('[`id`](https://example.test/**route**/`value`?q="<x>&a=1)'),
    '<a class="ilink" href="https://example.test/**route**/`value`?q=&quot;&lt;x&gt;&amp;a=1" target="_blank" rel="noopener"><code>id</code></a>');
  assert.ok(!C.inlineMarkup('[x](javascript:alert(1))').includes('<a'));
});

test('fenced code preserves whitespace and literal content between formatted prose',()=>{
  const raw='Intro `id`.\n```json\n{\n  "tag": "<script>bad()</script>",\n\t"literal": "**bold** [link](https://example.test) `x`"\n}\n```\nAfter **done**.';
  const html=C.proseMarkup(raw);
  assert.match(html,/^Intro <code>id<\/code>\.\n<pre class="prose-code"/);
  assert.match(html,/data-language="json"/);
  assert.ok(html.includes('{\n  &quot;tag&quot;: &quot;&lt;script&gt;bad()&lt;/script&gt;&quot;,\n\t'));
  assert.ok(html.includes('**bold** [link](https://example.test) `x`'));
  assert.ok(!html.includes('<script>')&&!html.includes('<a'));
  assert.match(html,/<\/code><\/pre>\nAfter <strong>done<\/strong>\.$/);
  assert.equal(C.proseMarkup(raw.replace(/\n/g,'\r\n')),html);
});

test('multiple, longer, empty and unfinished fences do not eat following prose or format code',()=>{
  const html=C.proseMarkup('````md\n```json\n{}\n```\n````\nBetween\n```\n```\nEnd');
  assert.equal((html.match(/<pre /g)||[]).length,2);
  assert.ok(html.includes('```json\n{}\n```\n</code></pre>\nBetween'));
  assert.ok(html.endsWith('<code class="prose-block-code"></code></pre>\nEnd'));
  assert.ok(C.proseMarkup('```js\n`raw` **text** <img src=x>').endsWith('`raw` **text** &lt;img src=x&gt;</code></pre>'));
  assert.equal(C.proseMarkup('Use ```literal``` here'),'Use <code>literal</code> here');
  assert.ok(!C.proseMarkup('```" onmouseover="oops\nx\n```').includes('onmouseover='));
});

test('prose containers use valid block markup and retain editor addresses',()=>{
  const snippet='Payload\n```json\n{}\n```';
  const section=C.sectionIntroHTML({heading:'Example',text:[snippet,'After'],bullets:[{text:snippet,sub:['`nested`']}]},0,'example').html;
  assert.match(section,/<div class="sec-text" data-dv-para="0">Payload\n<pre /);
  assert.match(section,/<div class="sec-text" data-dv-para="1">After<\/div>/);
  assert.match(section,/<li data-dv-bullet="0" data-dv-bullet-path="0">Payload\n<pre /);
  assert.ok(section.includes('<li data-dv-bullet-path="0.0"><code>nested</code></li>'));
  const contract=C.contractCardHTML({fields:[{k:'`literal-key`',v:'`literal-value`',g:snippet}],note:snippet},'example');
  assert.match(contract,/<td class="ctg">Payload\n<pre /);
  assert.match(contract,/<div class="ctnote">Payload\n<pre /);
  assert.ok(contract.includes('`literal-key`')&&contract.includes('`literal-value`'));
});

test('notification messages format prose while app names, titles, code and unsafe HTML stay literal',()=>{
  const text='**Ready** *now* `id` [details](https://example.test) <img src=x onerror=alert(1)> [unsafe](javascript:alert(1))\n```js\n<strong>literal</strong>\n```';
  const html=C.FlowNotifications.cardsHTML({cards:[{app:'**App**',title:'*Title*',text}]},false);
  assert.ok(html.includes('>**App**</div>')&&html.includes('>*Title*</div>'));
  assert.ok(html.includes('<strong>Ready</strong> <em>now</em> <code>id</code>'));
  assert.ok(html.includes('href="https://example.test"'));
  assert.ok(html.includes('&lt;strong&gt;literal&lt;/strong&gt;\n</code></pre>'));
  assert.ok(!html.includes('<img')&&!html.includes('href="javascript:'));
  assert.ok(html.includes('title="'+C.esc(text)+'"'));
});

test('bullet lists mix markers, nest, resume siblings and retain inline formatting',()=>{
  const raw='Accepted.\n- **Validate**\n  * Check `eventId`\n  + Check *type*\n- Save\n  and acknowledge\n\nDone.';
  const html=C.proseMarkup(raw);
  assert.equal(html,'Accepted.\n<ul class="prose-list"><li><strong>Validate</strong><ul class="prose-list"><li>Check <code>eventId</code></li><li>Check <em>type</em></li></ul></li><li>Save\n  and acknowledge</li></ul>\nDone.');
  assert.equal(C.proseMarkup(raw.replace(/\n/g,'\r\n')),html);
  assert.equal(C.proseMarkup('- First\nAfter'),'<ul class="prose-list"><li>First</li></ul>After');
  assert.equal(C.proseMarkup('- First\n\n+ Second'),'<ul class="prose-list"><li>First</li></ul>\n<ul class="prose-list"><li>Second</li></ul>');
});

test('bullet parsing preserves literal code and non-list punctuation and escapes unsafe items',()=>{
  assert.equal(C.proseMarkup('Use `literal\n- not a list\n` here'), 'Use <code>literal - not a list </code> here');
  assert.equal(C.proseMarkup('- `literal\n\n- still code`'), '<ul class="prose-list"><li><code>literal  - still code</code></li></ul>');
  assert.equal(C.proseMarkup('**Bold**\n*italic*\n-2\na + b\n---'), '<strong>Bold</strong>\n<em>italic</em>\n-2\na + b\n---');
  const html=C.proseMarkup('- [details](https://example.test)\n- <img src=x onerror=alert(1)>\n- [unsafe](javascript:alert(1))\n```\n- literal\n* literal\n```\n+ After');
  assert.ok(html.includes('href="https://example.test"'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img')&&!html.includes('href="javascript:'));
  assert.ok(html.includes('<code class="prose-block-code">- literal\n* literal\n</code>'));
  assert.ok(html.endsWith('<ul class="prose-list"><li>After</li></ul>'));
});
