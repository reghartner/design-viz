'use strict';
/* These command families load core/data leaves without the builder inspector. */
const test = require('node:test');
const assert = require('node:assert');
const commandContext = require('./workbench-command-context.cjs');
const commands = () => commandContext(['graph', 'document', 'narrative']);
const B = commands();
const V = B;
const plain = value => JSON.parse(JSON.stringify(value));

const SPEC = {
  page: {
    title: 'T',
    blocks: [
      {heading: 'Plain', accent: 'green',
       diagram: {
         nodes: {a: {title: 'A'}, b: {title: 'B "quoted" }brace{'}},
         rows: [['a', 'b']],
         edges: [{from: 'a', to: 'b', kind: 'int', label: 'call'}],
         steps: [{edge: 'a->b', text: 'first'}]
       }},
      {tabs: [
        {label: 'One', sections: [
          {heading: 'InTab',
           diagram: {nodes: {x: {title: 'X'}, y: {title: 'Y'}},
                     rows: [['x', 'y']],
                     edges: [{from: 'x', to: 'y'}],
                     panels: [{id: 'p', type: 'queue', initial: {state: 'empty'}}]}}
        ]},
        {label: 'Two', sections: [{heading: 'Second tab'}]}
      ]}
    ]
  }
};
const TEXT = JSON.stringify(SPEC, null, 2);

const RICH = {
  page: {
    blocks: [
      {heading: 'Rich',
       diagram: {
         nodes: {a: {title: 'A'}, b: {title: 'B'}, c: {title: 'C'}, f: {title: 'F'}},
         rows: [['a', ['b', 'c']]],
         floats: [{id: 'f', side: 'above'}],
         edges: [
           {from: 'a', to: 'b', kind: 'int', label: 'one'},
           {from: 'a', to: 'c', kind: 'mqtt'},
           {from: 'b', to: 'a', kind: 'int', ret: true},
           {from: 'a', to: 'f', kind: 'int'}
         ],
         panels: [{id: 'q', type: 'queue', initial: {state: 'empty'}},
                  {id: 'g', type: 'gauge', unit: 'mA', max: 10, initial: {value: 1}}],
         steps: [
           {edge: 'a->b', text: 's1', panels: {q: {state: 'enqueue', label: 'm'}}},
           {edges: ['a->c', 'b->a'], text: 's2', nodes: ['f'],
            panels: {q: {state: 'empty'}, g: {value: 5}}},
           {edge: 'a->f', text: 's3'}
         ]
       }}
    ]
  }
};
const RICH_TEXT = JSON.stringify(RICH, null, 2);

const GROUPED = {
  page: {blocks: [{heading: 'Groups', diagram: {
    nodes: {
      a: {title: 'A', group: 'dev'},
      b: {title: 'B', group: 'dev'},
      c: {title: 'C', group: 'orphan'},
      d: {title: 'D'}
    },
    rows: [['a', 'b', 'c', 'd']],
    groups: {dev: {title: 'Device'}, spare: {title: 'Spare'}}
  }}]}
};
const GROUPED_TEXT = JSON.stringify(GROUPED, null, 2);

const PROSE = {
  page: {
    blocks: [
      {heading: 'P', text: ['first paragraph', 'second paragraph'],
       bullets: ['plain point', {text: 'fancy point', sub: ['child'], revealAt: 1}],
       contract: {title: 'Wire', fields: [
         {k: 'topic', v: 'a/b', g: 'where'},
         {k: 'ttl', v: '30s'}
       ]},
       diagram: {nodes: {a: {title: 'A'}, b: {title: 'B'}, c: {title: 'C'}},
                 rows: [['a', ['b', 'c']]],
                 edges: [{from: 'a', to: 'b', labelDx: -40}],
                 steps: [{edge: 'a->b', text: 's1'}]}}
    ]
  }
};
const PROSE_TEXT = JSON.stringify(PROSE, null, 2);

function bulkSpec(){
  return {page: {blocks: [{heading: 'S',
    bullets: ['first point', 'second point'],
    contract: {fields: [{k: 'topic', v: 'a/b'}, {k: 'ttl', v: '30s'}]},
    diagram: {
      nodes: {a: {title: 'A'}, b: {title: 'B', tint: 'dev'}, c: {title: 'C'}},
      rows: [['a', 'b', 'c']],
      edges: [{from: 'a', to: 'b'}, {from: 'b', to: 'c', kind: 'mqtt'}],
      panels: [{id: 'q', type: 'queue', initial: {state: 'empty'}}],
      steps: [{edge: 'a->b', text: 's1'}, {edge: 'b->c', text: 's2'}, {nodes: ['c'], text: 's3'}]
    }}]}};
}

test('planSetField sets and removes the optional node delta marker', () => {
  const target = B.builderTargetPath(SPEC, {section: 0, kind: 'node', id: 'a'});
  const set = B.planSetField(TEXT, SPEC, target, 'delta', 'true');
  assert.ok(!set.error, set.error);
  const marked = JSON.parse(set.text);
  assert.strictEqual(marked.page.blocks[0].diagram.nodes.a.delta, true);
  const clear = B.planSetField(set.text, marked, target, 'delta', null);
  assert.ok(!clear.error, clear.error);
  assert.ok(!('delta' in JSON.parse(clear.text).page.blocks[0].diagram.nodes.a));
  assert.deepStrictEqual(plain(JSON.parse(clear.text)), SPEC);
});

test('planBulkSetField marks and clears delta on two nodes', () => {
  const targets = ['a', 'b'].map(id => ({section: 0, kind: 'node', id}));
  const plan = B.planBulkSetField(TEXT, targets, 'delta', 'true');
  assert.ok(!plan.error, plan.error);
  assert.strictEqual(plan.count, 2);
  const nodes = JSON.parse(plan.text).page.blocks[0].diagram.nodes;
  assert.strictEqual(nodes.a.delta, true);
  assert.strictEqual(nodes.b.delta, true);
  const clear = B.planBulkSetField(plan.text, targets, 'delta', null);
  assert.ok(!clear.error, clear.error);
  assert.deepStrictEqual(plain(JSON.parse(clear.text)), SPEC);
});

test('planBulkSetField marks and clears delta on a step target', () => {
  const targets = [{section: 0, kind: 'step', index: 0}];
  const plan = B.planBulkSetField(TEXT, targets, 'delta', 'true');
  assert.ok(!plan.error, plan.error);
  assert.strictEqual(JSON.parse(plan.text).page.blocks[0].diagram.steps[0].delta, true);
  const clear = B.planBulkSetField(plan.text, targets, 'delta', null);
  assert.ok(!clear.error, clear.error);
  assert.deepStrictEqual(plain(JSON.parse(clear.text)), SPEC);
});

test('planAddNode places a fresh id in nodes AND the last row', () => {
  const plan = B.planAddNode(TEXT, SPEC, 0);
  assert.ok(!plan.error, plan.error);
  assert.strictEqual(plan.kind, 'node');
  assert.strictEqual(plan.id, 'node1');
  const out = JSON.parse(plan.text);
  const d = out.page.blocks[0].diagram;
  assert.deepStrictEqual(d.nodes.node1, {title: 'New node', sub: 'what it does', icon: 'gear', tint: 'cmd'});
  assert.deepStrictEqual(d.rows[d.rows.length - 1], ['a', 'b', 'node1']);
  assert.deepStrictEqual(JSON.parse(plan.text.slice(plan.start, plan.end)), d.nodes.node1);
});

test('planAddNode skips ids already taken and reports diagram-less sections plainly', () => {
  const taken = JSON.parse(JSON.stringify(SPEC));
  taken.page.blocks[0].diagram.nodes.node1 = {title: 'occupied'};
  const plan = B.planAddNode(JSON.stringify(taken, null, 2), taken, 0);
  assert.strictEqual(plan.id, 'node2');
  const bad = B.planAddNode(TEXT, SPEC, 2); /* "Second tab" has no diagram */
  assert.match(bad.error, /no diagram/);
});

test('planAddEdge avoids duplicate from->to keys and creates edges when missing', () => {
  /* a->b already exists — the engine keys edges by "from->to", so a
     duplicate would override the first edge; the planner takes b->a */
  const plan = B.planAddEdge(TEXT, SPEC, 0);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.strictEqual(d.edges.length, 2);
  assert.deepStrictEqual(d.edges[1], {from: 'b', to: 'a', kind: 'int', label: 'describe the hop'});
  assert.strictEqual(plan.index, 1);

  const noEdges = JSON.parse(JSON.stringify(SPEC));
  delete noEdges.page.blocks[0].diagram.edges;
  const made = B.planAddEdge(JSON.stringify(noEdges, null, 2), noEdges, 0);
  assert.strictEqual(made.index, 0);
  assert.deepStrictEqual(JSON.parse(made.text).page.blocks[0].diagram.edges,
    [{from: 'a', to: 'b', kind: 'int', label: 'describe the hop'}]);

  /* both directions taken on the only pair: fall back to the first pair */
  const full = JSON.parse(JSON.stringify(SPEC));
  full.page.blocks[0].diagram.edges.push({from: 'b', to: 'a'});
  const fb = B.planAddEdge(JSON.stringify(full, null, 2), full, 0);
  const fd = JSON.parse(fb.text).page.blocks[0].diagram;
  assert.strictEqual(fd.edges[2].from, 'a');
  assert.strictEqual(fd.edges[2].to, 'b');
});

test('planAddPanel creates the panels list on demand and avoids taken ids', () => {
  const plan = B.planAddPanel(TEXT, SPEC, 0); /* section 0 has no panels list */
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.deepStrictEqual(d.panels[0], {id: 'queue1', type: 'queue', title: 'Queue', initial: {state: 'empty'}});
  assert.strictEqual(plan.index, 0);

  const tabPlan = B.planAddPanel(TEXT, SPEC, 1); /* section 1 already has panel "p" */
  const td = JSON.parse(tabPlan.text).page.blocks[1].tabs[0].sections[0].diagram;
  assert.strictEqual(td.panels.length, 2);
  assert.strictEqual(td.panels[1].id, 'queue1');
  assert.strictEqual(tabPlan.index, 1);

  /* id stem follows the type; a taken stem counts up */
  const g = B.planAddPanel(TEXT, SPEC, 0, 'gauge');
  assert.strictEqual(JSON.parse(g.text).page.blocks[0].diagram.panels[0].id, 'gauge1');
});

test('planAddSection appends a complete renderable section and handles every page shape', () => {
  const plan = B.planAddSection(TEXT, SPEC);
  const out = JSON.parse(plan.text);
  assert.strictEqual(out.page.blocks.length, 3);
  assert.strictEqual(out.page.blocks[2].heading, 'New section');
  assert.ok(out.page.blocks[2].diagram.nodes.svc1);
  assert.strictEqual(plan.index, 3); /* section ordinals: 3 already rendered */

  const alias = {sections: [{heading: 'a'}]};
  const aliasPlan = B.planAddSection(JSON.stringify(alias, null, 2), alias);
  assert.strictEqual(JSON.parse(aliasPlan.text).sections.length, 2);

  const bare = {nodes: {a: {}}, rows: [['a']]};
  assert.match(B.planAddSection(JSON.stringify(bare), bare).error, /bare diagram/);
});

test('the section template itself is valid JSON', () => {
  const sec = JSON.parse(B.BUILDER_SECTION_TEMPLATE);
  assert.strictEqual(sec.heading, 'New section');
  assert.deepStrictEqual(Object.keys(sec.diagram), ['nodes', 'rows', 'edges', 'steps']);
});

test('builder helpers: unique keys count past collisions, row flattening sees stacks', () => {
  assert.strictEqual(B.builderUniqueKey({}, 'node'), 'node1');
  assert.strictEqual(B.builderUniqueKey({node1: 1, node2: 1}, 'node'), 'node3');
  assert.deepStrictEqual(plain(B.builderFlatRowIds([['a', ['b', 'c']], ['d']])), ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(plain(B.builderFlatRowIds(null)), []);
});

test('planSetNodeGroup sets and blank-removes a node group while auto-declaring once', () => {
  const plan = B.planSetNodeGroup(RICH_TEXT, RICH, 0, 'a', 'api');
  assert.ok(!plan.error, plan.error);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.strictEqual(d.nodes.a.group, 'api');
  assert.deepStrictEqual(plain(d.groups), {api: {}});

  const groupLoc = B.jsonLocate(plan.text, ['page', 'blocks', 0, 'diagram', 'groups']);
  const groupMembers = B.jsonContainer(plan.text, groupLoc.start).members;
  assert.strictEqual(groupMembers.filter(m => m.key === 'api').length, 1,
    'the declaration is inserted exactly once');

  const cleared = B.planSetNodeGroup(plan.text, JSON.parse(plan.text), 0, 'a', '  ');
  const clearedDiagram = JSON.parse(cleared.text).page.blocks[0].diagram;
  assert.ok(!('group' in clearedDiagram.nodes.a));
  assert.deepStrictEqual(plain(clearedDiagram.groups), {api: {}}, 'blank leaves the declaration in place');
  assert.match(B.planSetNodeGroup(RICH_TEXT, RICH, 0, 'missing', 'api').error, /not found/);
});

test('planBulkSetGroup assigns every selected node, declares once, and blank-removes all memberships', () => {
  const spec = bulkSpec();
  const text = JSON.stringify(spec, null, 2);
  const targets = [
    {section: 0, kind: 'node', id: 'a'},
    {section: 0, kind: 'node', id: 'c'}
  ];
  const plan = B.planBulkSetGroup(text, spec, targets, 'workers');
  assert.ok(!plan.error, plan.error);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.strictEqual(d.nodes.a.group, 'workers');
  assert.strictEqual(d.nodes.c.group, 'workers');
  assert.ok(!('group' in d.nodes.b), 'unselected node is untouched');
  assert.deepStrictEqual(plain(d.groups), {workers: {}});
  assert.strictEqual(plan.count, 2);

  const groupLoc = B.jsonLocate(plan.text, ['page', 'blocks', 0, 'diagram', 'groups']);
  assert.strictEqual(B.jsonContainer(plan.text, groupLoc.start).members.filter(m => m.key === 'workers').length, 1);

  const cleared = B.planBulkSetGroup(plan.text, JSON.parse(plan.text), targets, null);
  const clearedDiagram = JSON.parse(cleared.text).page.blocks[0].diagram;
  assert.ok(!('group' in clearedDiagram.nodes.a) && !('group' in clearedDiagram.nodes.c));
  assert.deepStrictEqual(plain(clearedDiagram.groups), {workers: {}});
  assert.match(B.planBulkSetGroup(text, spec, [{section: 0, kind: 'edge', index: 0}], 'x').error,
    /only contain nodes/);
});

test('planSetGroupTitle edits declarations, blank-removes title, and tolerates undeclared groups', () => {
  const titled = B.planSetGroupTitle(GROUPED_TEXT, GROUPED, 0, 'dev', 'Platform');
  assert.strictEqual(JSON.parse(titled.text).page.blocks[0].diagram.groups.dev.title, 'Platform');
  const cleared = B.planSetGroupTitle(titled.text, JSON.parse(titled.text), 0, 'dev', ' ');
  assert.deepStrictEqual(plain(JSON.parse(cleared.text).page.blocks[0].diagram.groups.dev), {});

  const declared = B.planSetGroupTitle(GROUPED_TEXT, GROUPED, 0, 'orphan', 'Orphaned');
  const d = JSON.parse(declared.text).page.blocks[0].diagram;
  assert.strictEqual(d.groups.orphan.title, 'Orphaned');
  assert.strictEqual(d.nodes.c.group, 'orphan');
});

test('planSetGroupIcon sets, replaces, and removes icons while preserving group metadata', () => {
  const before = JSON.stringify(GROUPED);
  const set = B.planSetGroupIcon(GROUPED_TEXT, GROUPED, 0, 'dev', 'house');
  assert.ok(!set.error, set.error);
  const raw = JSON.parse(set.text);
  assert.deepStrictEqual(plain(raw.page.blocks[0].diagram.groups.dev), {title: 'Device', icon: 'house'});
  assert.deepStrictEqual(plain(raw.page.blocks[0].diagram.groups.spare), {title: 'Spare'});
  const replaced = B.planSetGroupIcon(set.text, raw, 0, 'dev', 'camera');
  assert.strictEqual(JSON.parse(replaced.text).page.blocks[0].diagram.groups.dev.icon, 'camera');
  for (const empty of [null, '', ' ']) {
    const removed = B.planSetGroupIcon(set.text, raw, 0, 'dev', empty);
    assert.deepStrictEqual(plain(JSON.parse(removed.text).page.blocks[0].diagram.groups.dev), {title: 'Device'});
  }
  assert.strictEqual(JSON.stringify(GROUPED), before, 'input is not mutated');
});

test('planSetGroupIcon declares missing groups and refuses missing keys', () => {
  const declared = B.planSetGroupIcon(GROUPED_TEXT, GROUPED, 0, 'orphan', 'house');
  const d = JSON.parse(declared.text).page.blocks[0].diagram;
  assert.deepStrictEqual(plain(d.groups.orphan), {icon: 'house'});
  assert.strictEqual(d.nodes.c.group, 'orphan');
  const raw = JSON.parse(GROUPED_TEXT);
  delete raw.page.blocks[0].diagram.groups;
  const created = B.planSetGroupIcon(JSON.stringify(raw), raw, 0, 'dev', 'house');
  assert.deepStrictEqual(plain(JSON.parse(created.text).page.blocks[0].diagram.groups), {dev: {icon: 'house'}});
  assert.match(B.planSetGroupIcon(GROUPED_TEXT, GROUPED, 0, '', 'house').error, /needs a key/);
});

test('renaming or deleting a group keeps every child parent link valid', () => {
  const spec = {nodes: {n: {group: 'child'}}, rows: [['n']],
    groups: {top: {}, mid: {parent: 'top'}, child: {parent: 'mid'}}};
  let plan = B.planRenameGroup(JSON.stringify(spec), spec, 0, 'mid', 'middle');
  assert.ok(!plan.error, plan.error);
  let g = JSON.parse(plan.text).groups;
  assert.strictEqual(g.middle.parent, 'top');
  assert.strictEqual(g.child.parent, 'middle');
  plan = B.planDeleteGroup(JSON.stringify(spec), spec, 0, 'mid');
  assert.ok(!plan.error, plan.error);
  g = JSON.parse(plan.text).groups;
  assert.strictEqual(g.mid, undefined);
  assert.strictEqual(g.child.parent, 'top');
  plan = B.planDeleteGroup(JSON.stringify(spec), spec, 0, 'top');
  assert.ok(!plan.error, plan.error);
  g = JSON.parse(plan.text).groups;
  assert.strictEqual(g.mid.parent, undefined);
  assert.strictEqual(g.child.parent, 'mid');
  // a dangling or cyclic parent on the deleted group must not be handed down
  const broken = {nodes: {n: {group: 'child'}}, rows: [['n']],
    groups: {bad: {parent: 'missing'}, child: {parent: 'bad'}}};
  g = JSON.parse(B.planDeleteGroup(JSON.stringify(broken), broken, 0, 'bad').text).groups;
  assert.strictEqual(g.child.parent, undefined);
  const looped = {nodes: {n: {group: 'child'}}, rows: [['n']],
    groups: {x: {parent: 'y'}, y: {parent: 'x'}, child: {parent: 'x'}}};
  g = JSON.parse(B.planDeleteGroup(JSON.stringify(looped), looped, 0, 'x').text).groups;
  assert.strictEqual(g.child.parent, undefined);
  assert.strictEqual(g.y.parent, undefined);
});

test('builderGroupParentOptions excludes self and descendants over sanitized links', () => {
  const groups = {a: {}, b: {parent: 'a'}, c: {parent: 'b'}, other: {}};
  const before = JSON.stringify(groups);
  assert.deepStrictEqual(plain(B.builderGroupParentOptions(groups, 'a')), ['other']);
  assert.deepStrictEqual(plain(B.builderGroupParentOptions(groups, 'b')), ['a', 'other']);
  assert.deepStrictEqual(plain(B.builderGroupParentOptions(groups, 'c')), ['a', 'b', 'other']);
  assert.deepStrictEqual(plain(B.builderGroupParentOptions(undefined, 'a')), []);
  assert.strictEqual(JSON.stringify(groups), before);
  const invalid = {a: {parent: 'b'}, b: {parent: 'a'}, c: {parent: 'a'},
    unknown: {parent: 'missing'}, self: {parent: 'self'}, bad: {parent: 7}};
  assert.deepStrictEqual(plain(B.builderGroupParentOptions(invalid, 'a')), ['b', 'unknown', 'self', 'bad']);
});

test('planSetGroupParent sets, replaces and clears only the parent field', () => {
  const before = JSON.stringify(GROUPED);
  const set = B.planSetGroupParent(GROUPED_TEXT, GROUPED, 0, 'dev', 'spare');
  assert.ok(!set.error, set.error);
  const raw = JSON.parse(set.text);
  assert.deepStrictEqual(raw.page.blocks[0].diagram.groups.dev, {title: 'Device', parent: 'spare'});
  assert.strictEqual(JSON.stringify(GROUPED), before);
  const replaced = B.planSetGroupParent(set.text, raw, 0, 'dev', 'orphan');
  assert.strictEqual(JSON.parse(replaced.text).page.blocks[0].diagram.groups.dev.parent, 'orphan');
  for (const empty of [null, '', ' ']) {
    const cleared = B.planSetGroupParent(set.text, raw, 0, 'dev', empty);
    assert.deepStrictEqual(JSON.parse(cleared.text), GROUPED);
  }
  assert.match(B.planSetGroupParent(GROUPED_TEXT, GROUPED, 0, '', 'spare').error, /needs a key/);
  const malformed = {nodes: {a: {}}, rows: [['a']], groups: []};
  assert.match(B.planSetGroupParent(JSON.stringify(malformed), malformed, 0, 'a', null).error, /not an object/);
});

test('planRenameGroup moves its declaration and members and refuses collisions', () => {
  const renamed = B.planRenameGroup(GROUPED_TEXT, GROUPED, 0, 'dev', 'platform');
  assert.ok(!renamed.error, renamed.error);
  const d = JSON.parse(renamed.text).page.blocks[0].diagram;
  assert.deepStrictEqual(plain(d.groups), {platform: {title: 'Device'}, spare: {title: 'Spare'}});
  assert.strictEqual(d.nodes.a.group, 'platform');
  assert.strictEqual(d.nodes.b.group, 'platform');
  assert.strictEqual(d.nodes.c.group, 'orphan');
  assert.match(B.planRenameGroup(GROUPED_TEXT, GROUPED, 0, 'dev', 'spare').error, /already taken/);
  assert.match(B.planRenameGroup(GROUPED_TEXT, GROUPED, 0, 'dev', ' ').error, /needs a key/);
});

test('planRenameGroup and planDeleteGroup work for undeclared groups', () => {
  const renamed = B.planRenameGroup(GROUPED_TEXT, GROUPED, 0, 'orphan', 'loose');
  const rd = JSON.parse(renamed.text).page.blocks[0].diagram;
  assert.strictEqual(rd.nodes.c.group, 'loose');
  assert.ok(!Object.prototype.hasOwnProperty.call(rd.groups, 'loose'),
    'renaming an undeclared group does not invent a declaration');

  const deleted = B.planDeleteGroup(GROUPED_TEXT, GROUPED, 0, 'orphan');
  const dd = JSON.parse(deleted.text).page.blocks[0].diagram;
  assert.ok(!('group' in dd.nodes.c));
  assert.deepStrictEqual(plain(dd.groups), plain(GROUPED.page.blocks[0].diagram.groups));
});

test('planDeleteGroup removes its declaration and strips every member reference', () => {
  const plan = B.planDeleteGroup(GROUPED_TEXT, GROUPED, 0, 'dev');
  assert.ok(!plan.error, plan.error);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.deepStrictEqual(plain(d.groups), {spare: {title: 'Spare'}});
  assert.ok(!('group' in d.nodes.a) && !('group' in d.nodes.b));
  assert.strictEqual(d.nodes.c.group, 'orphan');

  const routed = B.builderDeletePlan(GROUPED_TEXT, GROUPED,
    {section: 0, kind: 'group', id: 'dev'});
  assert.deepStrictEqual(plain(JSON.parse(routed.text)), plain(JSON.parse(plan.text)));
});

test('planSetEdgeEndpoint retargets the edge AND every step reference to its old key', () => {
  const plan = B.planSetEdgeEndpoint(RICH_TEXT, RICH, 0, 0, 'to', 'c');
  assert.ok(!plan.error, plan.error);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.strictEqual(d.edges[0].to, 'c');
  assert.strictEqual(d.steps[0].edge, 'a->c'); /* was a->b */
  assert.deepStrictEqual(d.steps[1].edges, ['a->c', 'b->a']); /* untouched */
  assert.match(B.planSetEdgeEndpoint(RICH_TEXT, RICH, 0, 0, 'to', 'zz').error, /unknown node/);
  assert.match(B.planSetEdgeEndpoint(RICH_TEXT, RICH, 0, 9, 'to', 'c').error, /not found/);
});

test('planRenameNode rewrites the map key, rows, floats, edges, steps, and step edge keys', () => {
  const plan = B.planRenameNode(RICH_TEXT, RICH, 0, 'a', 'hub');
  assert.ok(!plan.error, plan.error);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.ok(d.nodes.hub && !d.nodes.a);
  assert.deepStrictEqual(d.rows, [['hub', ['b', 'c']]]);
  assert.deepStrictEqual(d.edges.map(e => e.from + '->' + e.to),
    ['hub->b', 'hub->c', 'b->hub', 'hub->f']);
  assert.strictEqual(d.steps[0].edge, 'hub->b');
  assert.deepStrictEqual(d.steps[1].edges, ['hub->c', 'b->hub']);
  assert.strictEqual(d.steps[2].edge, 'hub->f');
  /* keeps map order: hub replaces a in place */
  assert.deepStrictEqual(Object.keys(d.nodes), ['hub', 'b', 'c', 'f']);

  const float = B.planRenameNode(RICH_TEXT, RICH, 0, 'f', 'sig');
  const fd = JSON.parse(float.text).page.blocks[0].diagram;
  assert.strictEqual(fd.floats[0].id, 'sig');
  assert.strictEqual(fd.steps[1].nodes[0], 'sig');

  assert.match(B.planRenameNode(RICH_TEXT, RICH, 0, 'a', 'b').error, /taken/);
  assert.match(B.planRenameNode(RICH_TEXT, RICH, 0, 'a', 'no spaces').error, /letters/);
  assert.match(B.planRenameNode(RICH_TEXT, RICH, 0, 'zz', 'ok').error, /not found/);
});

test('planRenamePanel moves every step patch to the new id', () => {
  const plan = B.planRenamePanel(RICH_TEXT, RICH, 0, 0, 'queue1');
  assert.ok(!plan.error, plan.error);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.strictEqual(d.panels[0].id, 'queue1');
  assert.deepStrictEqual(Object.keys(d.steps[0].panels), ['queue1']);
  assert.deepStrictEqual(Object.keys(d.steps[1].panels), ['queue1', 'g']);
  assert.match(B.planRenamePanel(RICH_TEXT, RICH, 0, 0, 'g').error, /taken/);
});

test('planDeleteNode removes placement and touching edges, pruning steps to legal shapes', () => {
  const plan = B.planDeleteNode(RICH_TEXT, RICH, 0, 'a');
  assert.ok(!plan.error, plan.error);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.ok(!d.nodes.a);
  assert.deepStrictEqual(d.rows, [[['b', 'c']]]); /* plain slot removed, stack kept */
  assert.deepStrictEqual(d.edges, []); /* every edge touched a */
  /* steps survive as captions; edge references are gone, node light kept */
  assert.ok(!('edge' in d.steps[0]) && !('edges' in d.steps[0]));
  assert.deepStrictEqual(d.steps[1].nodes, ['f']);
  assert.strictEqual(d.steps.length, 3);

  /* deleting a stack member shrinks the stack; deleting the float drops floats */
  const b = JSON.parse(B.planDeleteNode(RICH_TEXT, RICH, 0, 'b').text).page.blocks[0].diagram;
  assert.deepStrictEqual(b.rows, [['a', ['c']]]);
  const f = JSON.parse(B.planDeleteNode(RICH_TEXT, RICH, 0, 'f').text).page.blocks[0].diagram;
  assert.ok(!('floats' in f));
  assert.ok(!('nodes' in f.steps[1]));
});

test('planDeleteEdge splices the edge and prunes step references unless a duplicate key survives', () => {
  const plan = B.planDeleteEdge(RICH_TEXT, RICH, 0, 0); /* a->b */
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.strictEqual(d.edges.length, 3);
  assert.ok(!('edge' in d.steps[0]));

  /* with a duplicate a->b present, deleting one keeps the step reference */
  const dup = JSON.parse(JSON.stringify(RICH));
  dup.page.blocks[0].diagram.edges.push({from: 'a', to: 'b', kind: 'https'});
  const dupPlan = B.planDeleteEdge(JSON.stringify(dup, null, 2), dup, 0, 0);
  const dd = JSON.parse(dupPlan.text).page.blocks[0].diagram;
  assert.strictEqual(dd.steps[0].edge, 'a->b');
});

test('planDeletePanel removes the widget and its step patches', () => {
  const plan = B.planDeletePanel(RICH_TEXT, RICH, 0, 0);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.deepStrictEqual(d.panels.map(p => p.id), ['g']);
  assert.ok(!('panels' in d.steps[0]));
  assert.deepStrictEqual(Object.keys(d.steps[1].panels), ['g']);
});

test('planDeleteSection removes the whole section member and refuses the bare diagram', () => {
  const plan = B.planDeleteSection(TEXT, SPEC, 1); /* first tab section */
  const out = JSON.parse(plan.text);
  assert.deepStrictEqual(out.page.blocks[1].tabs[0].sections, []);
  assert.strictEqual(out.page.blocks[0].heading, 'Plain');
  const top = B.planDeleteSection(TEXT, SPEC, 0);
  assert.strictEqual(JSON.parse(top.text).page.blocks.length, 1);
  const bare = {nodes: {a: {}}, rows: [['a']]};
  assert.match(B.planDeleteSection(JSON.stringify(bare), bare, 0).error, /bare diagram/);
});

test('renames to hostile ids like __proto__ keep the entry as a real own property', () => {
  /* a plain {} rebuild would route "__proto__" through the prototype
     setter and silently drop the node (Codex cycle-1 MAJOR) */
  const plan = B.planRenameNode(RICH_TEXT, RICH, 0, 'a', '__proto__');
  assert.ok(!plan.error, plan.error);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.ok(Object.prototype.hasOwnProperty.call(d.nodes, '__proto__'));
  assert.strictEqual(Object.keys(d.nodes).length, 4);
  assert.strictEqual(d.steps[0].edge, '__proto__->b');

  const panelPlan = B.planRenamePanel(RICH_TEXT, RICH, 0, 0, '__proto__');
  assert.ok(!panelPlan.error, panelPlan.error);
  const pd = JSON.parse(panelPlan.text).page.blocks[0].diagram;
  assert.strictEqual(pd.panels[0].id, '__proto__');
  assert.ok(Object.prototype.hasOwnProperty.call(pd.steps[0].panels, '__proto__'));
});

test('planReplaceValue rewrites a bullet string and a paragraph in place', () => {
  const bulletPath = ['page', 'blocks', 0, 'bullets', 0];
  const r = B.planReplaceValue(PROSE_TEXT, PROSE, bulletPath, JSON.stringify('sharper point'));
  assert.strictEqual(JSON.parse(r.text).page.blocks[0].bullets[0], 'sharper point');
  const miss = B.planReplaceValue(PROSE_TEXT, PROSE, ['page', 'nope'], '1');
  assert.match(miss.error, /not found/);
});

test('planSetFields applies several surgical edits in one plan', () => {
  const edgePath = ['page', 'blocks', 0, 'diagram', 'edges', 0];
  const r = B.planSetFields(PROSE_TEXT, PROSE, edgePath, [['labelDx', '12'], ['labelDy', '-8']]);
  const e = JSON.parse(r.text).page.blocks[0].diagram.edges[0];
  assert.strictEqual(e.labelDx, 12);
  assert.strictEqual(e.labelDy, -8);
  const clear = B.planSetFields(PROSE_TEXT, PROSE, edgePath, [['labelDx', null], ['labelDy', null]]);
  const ec = JSON.parse(clear.text).page.blocks[0].diagram.edges[0];
  assert.ok(!('labelDx' in ec) && !('labelDy' in ec));
});

test('planDeleteListItem removes bullets, paragraphs, and contract rows', () => {
  const noBullet = B.planDeleteListItem(PROSE_TEXT, PROSE, ['page', 'blocks', 0, 'bullets'], 0);
  assert.strictEqual(JSON.parse(noBullet.text).page.blocks[0].bullets.length, 1);
  const noRow = B.planDeleteListItem(PROSE_TEXT, PROSE, ['page', 'blocks', 0, 'contract', 'fields'], 1);
  assert.deepStrictEqual(JSON.parse(noRow.text).page.blocks[0].contract.fields.map(f => f.k), ['topic']);
  assert.match(B.planDeleteListItem(PROSE_TEXT, PROSE, ['page', 'blocks', 0, 'bullets'], 9).error, /no such/);
});

test('planAddEdgeBetween wires the exact clicked pair and refuses duplicates and self-loops', () => {
  const r = B.planAddEdgeBetween(PROSE_TEXT, PROSE, 0, 'c', 'a');
  assert.ok(!r.error, r.error);
  const d = JSON.parse(r.text).page.blocks[0].diagram;
  assert.deepStrictEqual(d.edges[1], {from: 'c', to: 'a', kind: 'int', label: 'describe the hop'});
  assert.strictEqual(r.index, 1);
  assert.match(B.planAddEdgeBetween(PROSE_TEXT, PROSE, 0, 'a', 'b').error, /already exists/);
  assert.match(B.planAddEdgeBetween(PROSE_TEXT, PROSE, 0, 'a', 'a').error, /same node/);
  assert.match(B.planAddEdgeBetween(PROSE_TEXT, PROSE, 0, 'a', 'zz').error, /unknown node/);
});

test('planDuplicateNode copies the definition beside the original placement', () => {
  const plain1 = B.planDuplicateNode(PROSE_TEXT, PROSE, 0, 'a');
  const d1 = JSON.parse(plain1.text).page.blocks[0].diagram;
  assert.strictEqual(plain1.id, 'a1');
  assert.deepStrictEqual(d1.rows[0][0], 'a');
  assert.strictEqual(d1.rows[0][1], 'a1'); /* right after the original slot */
  assert.deepStrictEqual(d1.nodes.a1, {title: 'A'});

  const stack = B.planDuplicateNode(PROSE_TEXT, PROSE, 0, 'b');
  const d2 = JSON.parse(stack.text).page.blocks[0].diagram;
  assert.deepStrictEqual(d2.rows[0][1], ['b', 'b1', 'c']); /* inside the stack */

  const float = B.planDuplicateNode(JSON.stringify(RICH, null, 2), RICH, 0, 'f');
  const d3 = JSON.parse(float.text).page.blocks[0].diagram;
  assert.deepStrictEqual(d3.floats[1], {id: 'f1', side: 'above'});
  assert.match(B.planDuplicateNode(PROSE_TEXT, PROSE, 0, 'zz').error, /not found/);
});

test('planDuplicateSection deep-copies right after the original and renames the heading', () => {
  const r = B.planDuplicateSection(TEXT, SPEC, 1); /* first tab section */
  const out = JSON.parse(r.text);
  const secs = out.page.blocks[1].tabs[0].sections;
  assert.strictEqual(secs.length, 2);
  assert.strictEqual(secs[1].heading, 'InTab (copy)');
  assert.deepStrictEqual(secs[1].diagram.nodes, secs[0].diagram.nodes);
  assert.strictEqual(r.index, 2); /* renders directly after the original ordinal 1 */
  const bare = {nodes: {a: {}}, rows: [['a']]};
  assert.match(B.planDuplicateSection(JSON.stringify(bare), bare, 0).error, /bare diagram/);
});

test('planDuplicateNode clones a float entry wholesale and places it after the original', () => {
  /* extra placement fields on the float entry must survive the copy
     (Codex pass-3 cycle-1 MAJOR: the copy was rebuilt from id+side only
     and appended at the end) */
  const spec = JSON.parse(JSON.stringify(RICH));
  spec.page.blocks[0].diagram.floats = [
    {id: 'f', side: 'above', dx: 18},
    {id: 'g2', side: 'above'}
  ];
  spec.page.blocks[0].diagram.nodes.g2 = {title: 'G2'};
  const plan = B.planDuplicateNode(JSON.stringify(spec, null, 2), spec, 0, 'f');
  assert.ok(!plan.error, plan.error);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.deepStrictEqual(d.floats, [
    {id: 'f', side: 'above', dx: 18},
    {id: 'f1', side: 'above', dx: 18},
    {id: 'g2', side: 'above'}
  ]);
});

test('node presets cover distinct icons with legal icon and tint tokens', () => {
  const icons = B.NODE_PRESETS.map(p => p.icon);
  assert.strictEqual(new Set(icons).size, icons.length);
  for (const preset of B.NODE_PRESETS){
    assert.ok(V.ICON_SET.includes(preset.icon), preset.icon);
    assert.ok(V.TINT_SET.includes(preset.tint), preset.tint);
    assert.ok(preset.title && typeof preset.title === 'string');
  }
});

test('panel templates exist for every engine panel type and no extras', () => {
  assert.deepStrictEqual(Object.keys(B.PANEL_TEMPLATES).sort(), [...V.PANEL_TYPES].sort());
});

test('every panel template validates with zero errors AND zero warnings', () => {
  for (const type of Object.keys(B.PANEL_TEMPLATES)){
    const spec = JSON.parse(JSON.stringify(SPEC));
    const plan = B.planAddPanel(JSON.stringify(spec, null, 2), spec, 0, type);
    assert.ok(!plan.error, type + ': ' + plan.error);
    const out = JSON.parse(plan.text);
    const added = out.page.blocks[0].diagram.panels[0];
    assert.strictEqual(added.type, type);
    assert.strictEqual(added.id, type + '1');
    const v = V.validate(V.normalize(plain(out)));
    assert.deepStrictEqual(plain(v.errors), [], type + ' errors');
    assert.deepStrictEqual(plain(v.warnings), [], type + ' warnings: ' + JSON.stringify(v.warnings));
  }
});

test('planAddNode presets carry icon, tint, title, and an icon-named id', () => {
  const preset = B.NODE_PRESETS.find(p => p.icon === 'db');
  const plan = B.planAddNode(TEXT, SPEC, 0, plain(preset));
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.deepStrictEqual(d.nodes.db1, {title: 'Store', sub: 'what it does', icon: 'db', tint: 'data'});
  assert.deepStrictEqual(d.rows[0], ['a', 'b', 'db1']);
  /* every preset yields a validator-clean insert */
  for (const pr of B.NODE_PRESETS){
    const pl = B.planAddNode(TEXT, SPEC, 0, plain(pr));
    const v = V.validate(V.normalize(plain(JSON.parse(pl.text))));
    assert.deepStrictEqual(plain(v.errors), [], pr.icon);
    assert.deepStrictEqual(plain(v.warnings), [], pr.icon + ': ' + JSON.stringify(v.warnings));
  }
  /* no preset: unchanged default behavior */
  const plain1 = B.planAddNode(TEXT, SPEC, 0);
  assert.ok(JSON.parse(plain1.text).page.blocks[0].diagram.nodes.node1);
});

test('the tab template is valid JSON holding one renderable section', () => {
  const tab = JSON.parse(B.BUILDER_TAB_TEMPLATE);
  assert.strictEqual(tab.label, 'New tab');
  assert.strictEqual(tab.sections.length, 1);
  assert.ok(tab.sections[0].diagram.nodes.svc1);
});

test('planAddTab inserts a validator-clean tab directly after the current one', () => {
  const plan = B.planAddTab(TEXT, SPEC, 1, 0);
  assert.ok(!plan.error, plan.error);
  const tabs = JSON.parse(plan.text).page.blocks[1].tabs;
  assert.deepStrictEqual(tabs.map(x => x.label), ['One', 'New tab', 'Two']);
  assert.strictEqual(plan.index, 1);
  const v = V.validate(V.normalize(plain(JSON.parse(plan.text))));
  assert.deepStrictEqual(plain(v.errors), []);
  assert.deepStrictEqual(plain(v.warnings), []);
  assert.match(B.planAddTab(TEXT, SPEC, 0, 0).error, /not found/);
});

test('planDeleteTab removes a tab but refuses the last one in its block', () => {
  const plan = B.planDeleteTab(TEXT, SPEC, 1, 0);
  const tabs = JSON.parse(plan.text).page.blocks[1].tabs;
  assert.deepStrictEqual(tabs.map(x => x.label), ['Two']);
  const one = {page: {blocks: [{tabs: [{label: 'Only', sections: []}]}]}};
  assert.match(B.planDeleteTab(JSON.stringify(one), one, 0, 0).error, /last tab/);
});

test('planMoveTab reorders within the block and clamps the ends', () => {
  const plan = B.planMoveTab(TEXT, SPEC, 1, 0, 1);
  const tabs = JSON.parse(plan.text).page.blocks[1].tabs;
  assert.deepStrictEqual(tabs.map(x => x.label), ['Two', 'One']);
  assert.strictEqual(plan.index, 1);
  assert.match(B.planMoveTab(TEXT, SPEC, 1, 0, -1).error, /end/);
  assert.match(B.planMoveTab(TEXT, SPEC, 1, 1, 1).error, /end/);
});

test('planMoveSection moves within its own list, hops tab containers, and stops at the ends', () => {
  const text = TEXT; /* SPEC: blocks[0]=plain section, blocks[1]=tabs container */
  const down = B.planMoveSection(text, SPEC, 0, 1);
  const parsed = JSON.parse(down.text);
  assert.ok(Array.isArray(parsed.page.blocks[0].tabs), 'the tabs container moved first');
  assert.strictEqual(parsed.page.blocks[1].heading, 'Plain');
  assert.deepStrictEqual(plain(down.newPath), ['page', 'blocks', 1]);
  /* the moved-down section's selection span parses back to the section */
  assert.deepStrictEqual(JSON.parse(down.text.slice(down.start, down.end)).heading, 'Plain');

  assert.match(B.planMoveSection(text, SPEC, 0, -1).error, /already first/);
  /* inside a tab list: the only section of tab One cannot move */
  assert.match(B.planMoveSection(text, SPEC, 1, 1).error, /already last/);
  assert.match(B.planMoveSection(text, SPEC, 1, -1).error, /already first/);
});

test('planBulkSetField writes the same field to every target and reports the failing item', () => {
  const spec = bulkSpec();
  const text = JSON.stringify(spec, null, 2);
  const targets = [
    {section: 0, kind: 'node', id: 'a'},
    {section: 0, kind: 'node', id: 'c'}
  ];
  const plan = B.planBulkSetField(text, targets, 'tint', '"mqtt"');
  const nodes = JSON.parse(plan.text).page.blocks[0].diagram.nodes;
  assert.strictEqual(nodes.a.tint, 'mqtt');
  assert.strictEqual(nodes.c.tint, 'mqtt');
  assert.strictEqual(nodes.b.tint, 'dev', 'unselected node untouched');
  assert.strictEqual(plan.count, 2);
  /* null removes from all */
  const cleared = B.planBulkSetField(plan.text, targets, 'tint', null);
  const n2 = JSON.parse(cleared.text).page.blocks[0].diagram.nodes;
  assert.ok(!('tint' in n2.a) && !('tint' in n2.c));
  /* an unresolvable target names its position */
  /* a missing node maps to a path but fails the locate — either way the
     error names WHICH selection broke */
  const bad = B.planBulkSetField(text, [targets[0], {section: 0, kind: 'node', id: 'ghost'}], 'tint', '"dev"');
  assert.match(bad.error, /selection 2/);
});

test('planBulkDelete removes index targets highest-first so nothing shifts', () => {
  const spec = bulkSpec();
  const text = JSON.stringify(spec, null, 2);
  /* deliberately pass ASCENDING order — the planner must sort descending */
  const plan = B.planBulkDelete(text, [
    {section: 0, kind: 'step', index: 0},
    {section: 0, kind: 'step', index: 2}
  ]);
  const steps = JSON.parse(plan.text).page.blocks[0].diagram.steps;
  assert.deepStrictEqual(steps.map(s => s.text), ['s2'], 'exactly steps 1 and 3 died');
  assert.strictEqual(plan.count, 2);
});

test('planBulkDelete of nodes runs each cascade (rows and steps pruned)', () => {
  const spec = bulkSpec();
  const text = JSON.stringify(spec, null, 2);
  const plan = B.planBulkDelete(text, [
    {section: 0, kind: 'node', id: 'a'},
    {section: 0, kind: 'node', id: 'c'}
  ]);
  const d = JSON.parse(plan.text).page.blocks[0].diagram;
  assert.deepStrictEqual(Object.keys(d.nodes), ['b']);
  assert.deepStrictEqual(plain(d.rows), [['b']]);
  const mentions = JSON.stringify(d);
  assert.ok(mentions.indexOf('"a->b"') < 0 && mentions.indexOf('"b->c"') < 0,
    'edges/steps touching deleted nodes are pruned by the cascades');
});

test('builderDeletePlan deletes the right element for every multi kind', () => {
  const spec = bulkSpec();
  const text = JSON.stringify(spec, null, 2);
  assert.deepStrictEqual(plain(B.BUILDER_MULTI_KINDS),
    ['node', 'edge', 'step', 'panel', 'bullet', 'crow']);

  const node = JSON.parse(B.builderDeletePlan(text, spec, {section: 0, kind: 'node', id: 'c'}).text);
  assert.deepStrictEqual(Object.keys(node.page.blocks[0].diagram.nodes), ['a', 'b']);

  const edge = JSON.parse(B.builderDeletePlan(text, spec, {section: 0, kind: 'edge', index: 1}).text);
  assert.deepStrictEqual(edge.page.blocks[0].diagram.edges, [{from: 'a', to: 'b'}]);

  const step = JSON.parse(B.builderDeletePlan(text, spec, {section: 0, kind: 'step', index: 1}).text);
  assert.deepStrictEqual(step.page.blocks[0].diagram.steps.map(s => s.text), ['s1', 's3']);

  const panel = JSON.parse(B.builderDeletePlan(text, spec, {section: 0, kind: 'panel', index: 0}).text);
  assert.ok(!panel.page.blocks[0].diagram.panels || panel.page.blocks[0].diagram.panels.length === 0);

  const bullet = JSON.parse(B.builderDeletePlan(text, spec, {section: 0, kind: 'bullet', index: 0}).text);
  assert.deepStrictEqual(plain(bullet.page.blocks[0].bullets), ['second point']);

  const crow = JSON.parse(B.builderDeletePlan(text, spec, {section: 0, kind: 'crow', index: 1}).text);
  assert.deepStrictEqual(plain(crow.page.blocks[0].contract.fields), [{k: 'topic', v: 'a/b'}]);
});

test('planAddTabs appends a two-tab container and reports its landing spot', () => {
  const spec = {page: {blocks: [{heading: 'A', text: ['x']}]}};
  const text = JSON.stringify(spec, null, 2);
  const plan = B.planAddTabs(text, spec);
  assert.ok(!plan.error);
  assert.equal(plan.kind, 'tabs');
  assert.equal(plan.block, 1);
  assert.equal(plan.index, 1); /* first new section's flat ordinal */
  const after = JSON.parse(plan.text);
  const block = after.page.blocks[1];
  assert.equal(block.tabs.length, 2);
  assert.deepStrictEqual(block.tabs.map(t => t.label), ['Tab one', 'Tab two']);
  block.tabs.forEach(t => {
    assert.equal(t.sections.length, 1);
    assert.ok(t.sections[0].diagram);
  });
  /* both new tab sections are addressable */
  assert.equal(B.specSectionPaths(after).length, 3);
});

test('planAddTabs handles bare-page specs and refuses bare diagrams', () => {
  const barePage = {sections: [{heading: 'A'}]};
  const plan = B.planAddTabs(JSON.stringify(barePage, null, 2), barePage);
  assert.ok(!plan.error);
  const after = JSON.parse(plan.text);
  assert.equal(after.sections[1].tabs.length, 2);

  const bare = {nodes: {x: {}}, rows: [['x']]};
  assert.match(B.planAddTabs(JSON.stringify(bare), bare).error, /bare diagram/);
  assert.match(B.planAddTabs('null', null).error, /no page/);
});

test('planAddTabs after an existing tabs container: block vs flat-ordinal math', () => {
  /* blocks: [plain, tabs(2 tabs x 1 section), plain] = 4 flat sections */
  const spec = {page: {blocks: [
    {heading: 'A'},
    {tabs: [{label: 'T1', sections: [{heading: 'B'}]},
            {label: 'T2', sections: [{heading: 'C'}]}]},
    {heading: 'D'}
  ]}};
  const plan = B.planAddTabs(JSON.stringify(spec, null, 2), spec);
  assert.ok(!plan.error);
  assert.equal(plan.block, 3);  /* list slot among blocks */
  assert.equal(plan.index, 4);  /* flat section ordinal of the first new tab section */
  const after = JSON.parse(plan.text);
  assert.equal(after.page.blocks.length, 4);
  assert.equal(B.specSectionPaths(after).length, 6);
});

test('bulk failure publishes no intermediate text and subtree rewrites preserve outside bytes', () => {
  const raw = bulkSpec(), before = JSON.stringify(raw);
  const text = '\r\n' + JSON.stringify(raw, null, '\t').replace(/\n/g, '\r\n') + '\r\n';
  const targets = [{kind:'node',section:0,id:'a'}, {kind:'node',section:0,id:'missing'}];
  for (const result of [B.planBulkSetField(text, targets, 'title', '"Edited"'), B.planBulkDelete(text, targets)]) {
    assert.match(result.error, /selection 2/);
    assert.strictEqual(result.text, undefined, 'earlier successful local edits are not published');
  }
  assert.strictEqual(JSON.stringify(raw), before);
  const path = B.specSectionPaths(raw)[0].diagram, old = B.jsonLocate(text, path);
  const result = B.planRenameNode(text, raw, 0, 'a', 'camera');
  assert.ok(!result.error, result.error);
  assert.strictEqual(result.start, old.start);
  assert.strictEqual(result.text.slice(0, result.start), text.slice(0, old.start));
  assert.strictEqual(result.text.slice(result.end), text.slice(old.end));
  assert.deepStrictEqual(JSON.parse(result.text.slice(result.start, result.end)), JSON.parse(result.text).page.blocks[0].diagram);
  assert.strictEqual(JSON.stringify(raw), before, 'rewriting uses a clone');
});

test('headless graph commands honor registered panel references and hostile own IDs', () => {
  const core = commands();
  core.PanelRegistry.define('command-reference-probe', {references:{nodes:['sources.*.node']}});
  const raw = {nodes:{a:{},b:{}},rows:[['a','b']],
    panels:[{id:'probe',type:'command-reference-probe',sources:[{node:'a',label:'keep'},{node:'b'}]}]};
  const text = JSON.stringify(raw);
  const renamed = core.planRenameNode(text, raw, 0, 'a', '__proto__');
  assert.ok(!renamed.error, renamed.error);
  const next = JSON.parse(renamed.text);
  assert.ok(Object.prototype.hasOwnProperty.call(next.nodes, '__proto__'));
  assert.deepStrictEqual(next.panels[0].sources, [{node:'__proto__',label:'keep'},{node:'b'}]);
  const removed = core.planDeleteNode(renamed.text, next, 0, '__proto__');
  assert.ok(!removed.error, removed.error);
  assert.deepStrictEqual(JSON.parse(removed.text).panels[0].sources, [{label:'keep'},{node:'b'}]);
  assert.strictEqual(JSON.stringify(raw), text);
  assert.strictEqual(typeof core.initWorkbenchBuilder, 'undefined');
  assert.strictEqual(typeof core.renderPage, 'undefined');
});
