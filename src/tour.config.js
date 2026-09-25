/* Built-in default tour config. A page overrides it wholesale with page.tour
   (no deep-merge). The shape and the retargeting contract are documented in
   docs/tour.md; tourLintConfig (core/tour-model.js) is the source of truth
   for what validates. Selectors here name controls the engine always renders
   with these exact class names — tests/tour-config.test.js guards the pairing.

   Portable by design: steps whose selector or diagram state cannot resolve on
   a page (no branching, no node links, no view choice) skip silently, so this
   one default works on every page the viewer can render. */

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
      id: 'controls',
      target: {selector: '.step-transport', within: 'section'},
      diagramState: {mode: 'step'},
      copy: {
        heading: 'Play the story',
        body: 'AMBIENT loops the whole flow. STEP walks it one move at a time — play runs a step every 3 seconds, ‹ › move by hand.'
      },
      secondary: {
        target: {selector: '.presentbtn', within: 'page'},
        note: 'Presenting to a room? PRESENT goes fullscreen — arrows and Space work there.'
      }
    },
    {
      id: 'branching',
      target: {selector: '.path-timeline', within: 'section'},
      diagramState: {mode: 'step', path: '@alt', step: '@shared'},
      copy: {
        heading: 'Flows can split',
        body: 'Each row is one path through the system. Paths share steps, split where behavior differs, and can rejoin later. Click any chip to jump.'
      }
    },
    {
      id: 'links',
      personas: ['eng'],
      target: {selector: '.nrefs-trigger', within: 'section'},
      copy: {
        heading: 'Every box is real',
        body: 'Open ⋯ on any node for its Backstage entry, API definition, and the code behind each step. The ↗ jumps straight to the source.'
      }
    },
    {
      id: 'story',
      personas: ['ux'],
      target: {selector: '.diagram-view-choice', within: 'section'},
      copy: {
        heading: 'Two ways to read it',
        body: 'Switch to the story view for the human side of the same steps. The “Generated from” line at the top links to the document this page was built from.'
      }
    },
    {
      id: 'panels',
      personas: ['ux'],
      target: {selector: '.panelcol', within: 'section'},
      diagramState: {mode: 'step'},
      demo: {advance: 3, intervalMs: 1800},
      copy: {
        heading: 'The panels tell the story',
        body: 'Watch the home and the phone react as each step plays. Every widget follows the diagram.'
      }
    },
    {
      id: 'finish',
      kind: 'done',
      copy: {
        heading: 'That’s the tour',
        body: 'Replay it anytime from the ? button next to PRESENT.'
      }
    }
  ]
};
