/* Built-in default tour config. A page overrides it wholesale with page.tour
   (no deep-merge). The shape and the authoring contract are documented in
   docs/tour.md; tourLintConfig (core/tour-model.js) is the source of truth
   for what validates. Selectors here name controls the engine always renders
   with these exact class names — tests/tour-config.test.js guards the pairing.

   Portable by design: steps whose selector or diagram state cannot resolve on
   a page warn and pass through, and this shipped copy never names
   page-specific widgets — a page-authored config may (docs/tour.md). */

var TOUR_DEFAULT_CONFIG = {
  version: 1,
  personas: ['ux', 'eng', 'both'],
  steps: [
    {
      id: 'welcome',
      kind: 'chooser',
      copy: {
        eyebrow: 'WELCOME · FIRST VISIT',
        heading: 'First time in a Flowview diagram?',
        body: 'Pick what you’d like to see. Takes under a minute.',
        choices: [
          {persona: 'ux', label: 'The user experience', sub: 'The story view, screens, and where this design is documented.'},
          {persona: 'eng', label: 'The engineering', sub: 'The live diagram, branching paths, Backstage and the code.'},
          {persona: 'both', label: 'Show me both', sub: 'The full walkthrough, about two minutes.'}
        ],
        note: 'You can rerun this anytime from the ? button.'
      }
    },
    {
      id: 'mode-ambient',
      personas: ['eng', 'both'],
      target: {selector: '.mtoggle', within: 'section'},
      diagramState: {mode: 'ambient'},
      reveal: [{selector: '.board', within: 'section'}],
      copy: {
        heading: 'The big picture',
        body: 'AMBIENT: every box and call in this flow, lit at once and looping.'
      }
    },
    {
      id: 'mode-step',
      personas: ['eng', 'both'],
      target: {selector: '.step-transport', within: 'section'},
      diagramState: {mode: 'step'},
      demo: {advance: 2, intervalMs: 1600},
      reveal: [{selector: '.board', within: 'section'}],
      copy: {
        heading: 'One call at a time',
        body: 'STEP: the same diagram, one call at a time, in order — watch it walk; ‹ › move by hand.'
      },
      secondary: [
        {
          target: {selector: '.presentbtn', within: 'page'},
          note: 'Presenting to a room? PRESENT goes fullscreen — arrows and Space work there.'
        }
      ]
    },
    {
      id: 'controls',
      personas: ['ux'],
      target: {selector: '.step-transport', within: 'section'},
      diagramState: {mode: 'step'},
      copy: {
        heading: 'Play the story',
        body: '▶ plays the flow one step every 3 seconds; ‹ › move by hand.'
      },
      secondary: [
        {
          target: {selector: '.presentbtn', within: 'page'},
          note: 'Presenting to a room? PRESENT goes fullscreen — arrows and Space work there.'
        }
      ]
    },
    {
      id: 'branching-split',
      /* the engine draws paths as a packed timeline when they share and
         rejoin, or as a plain path matrix when they never rejoin — the
         split is real on both, so the authored target names both */
      target: {selector: '.path-timeline, .path-matrix', within: 'section'},
      /* '@fork' is the entry condition AND the demo's start: the step only
         shows when the first two paths share an opening, and walks from
         the fork into the branch (disjoint paths warn and skip) */
      diagramState: {mode: 'step', path: '@alt', step: '@fork'},
      demo: {advance: 3, intervalMs: 1600},
      reveal: [{selector: '.board', within: 'section'}],
      copy: {
        heading: 'Flows can split',
        body: 'Each row is one scenario — its label names the path. Watch the walk leave the shared steps and take the branch where behavior differs. Click any chip to jump.'
      }
    },
    {
      id: 'branching-rejoin',
      target: {selector: '.path-timeline', within: 'section'},
      diagramState: {mode: 'step', path: '@alt', step: '@rejoin'},
      demo: {advance: 2, intervalMs: 1600},
      reveal: [{selector: '.board', within: 'section'}],
      copy: {
        heading: 'And they come back together',
        body: 'The branch flows back — the last steps are shared by every path.'
      }
    },
    {
      id: 'links',
      personas: ['eng', 'both'],
      demo: {click: {selector: '.nrefs-trigger', within: 'section'}},
      target: {selector: '.node-link-menu', within: 'section'},
      secondary: [
        {target: {selector: '.nrefs-trigger', within: 'section'}}
      ],
      copy: {
        heading: 'Nodes link to the real system',
        body: 'The tour just opened this node’s ⋯ menu — every node with links has one: its Backstage entry, API definition, and code references, where available. Every ↗ jumps to the source.'
      }
    },
    {
      id: 'drill',
      personas: ['eng', 'both'],
      demo: {click: {selector: '.detail-trigger', within: 'section'}},
      target: {selector: '.doc-sec[data-dv-detail-preview] .board', within: 'page'},
      secondary: [
        {target: {selector: '.doc-sec[data-dv-detail-preview] .detail-breadcrumb', within: 'page'}}
      ],
      copy: {
        heading: 'Zoom into a part of the system',
        body: 'The tour just pressed \u229e on a node: that part of the system opens as its own flow, with its own steps and paths. The breadcrumb takes you back.'
      }
    },
    {
      id: 'story',
      personas: ['ux', 'both'],
      target: {selector: '.diagram-view-choice', within: 'section'},
      copy: {
        heading: 'Two ways to read it',
        body: 'Switch to the story view for the human side of the same steps. The “Generated from” line at the top links to the document this page was built from.'
      }
    },
    {
      id: 'panels',
      personas: ['ux', 'both'],
      target: {selector: '.panelcol', within: 'section'},
      diagramState: {mode: 'step'},
      demo: {advance: 3, intervalMs: 1800},
      reveal: [{selector: '.board', within: 'section'}],
      copy: {
        heading: 'The panels tell the story',
        body: 'Watch the side panels follow the diagram — every widget updates as each step plays.'
      }
    },
    {
      id: 'finish-ux',
      personas: ['ux'],
      kind: 'done',
      copy: {
        heading: 'Now try it',
        body: 'Click any numbered chip to jump to that step, then press ▶. Replay this tour anytime from the ? button.'
      }
    },
    {
      id: 'finish-eng',
      personas: ['eng', 'both'],
      kind: 'done',
      copy: {
        heading: 'Now try it',
        body: 'Click any numbered chip to jump to that step, then press ▶ — then open ⋯ on any node. Replay this tour anytime from the ? button.'
      }
    }
  ]
};
