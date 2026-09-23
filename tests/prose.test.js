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
  assert.match(section,/<li data-dv-bullet="0">Payload\n<pre /);
  assert.ok(section.includes('<li><code>nested</code></li>'));
  const contract=C.contractCardHTML({fields:[{k:'`literal-key`',v:'`literal-value`',g:snippet}],note:snippet},'example');
  assert.match(contract,/<td class="ctg">Payload\n<pre /);
  assert.match(contract,/<div class="ctnote">Payload\n<pre /);
  assert.ok(contract.includes('`literal-key`')&&contract.includes('`literal-value`'));
});
