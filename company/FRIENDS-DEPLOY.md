# Friends site overlay

This branch is the Friends company fork overlay. `company/company.json` enables
the science and sports packages for this site. The upstream default build
remains core-only. `canon.json` publishes six active reviewed documents copied from
those packages into `diagrams/friends/`:

- Create demand (`season-of-seats`): the Schaefer effect, schedule, bobblehead clock, and group holds
  (`packages/sports/diagrams/season-of-seats/season-of-seats.spec.json`)
- Sell the inventory (`sell-the-inventory`): on-sale day, pricing, heritage-night offers, and giveaway eligibility
- Serve and learn from game night (`serve-game-night`): ticket transfers, gate operations, sponsor rewards, and recap
- Build the next season (`build-next-season`): membership conversion and the renewal fork
- Islanders marketing stories (`islanders-marketing`): three native tabs—Member campaign, Group night, and Fan event RSVP—with all eight approved alternate paths
- The insertion signature of NSP15: eight tabs following the reporter lineage,
  insertion evidence, and assay limits from the reviewed preprint story
  (`packages/science/diagrams/biology/nsp15-insertion-evidence/nsp15-insertion-evidence.spec.json`)

The standalone venue map repeats the arena concepts already used in the
Islanders story, so it is not a separate Friends document. Physics, broad
biology, Copy gate, and the illustrative DNA sequencing walkthrough remain available as
reviewed upstream package content without appearing in this site's library.

When upstream changes one of these specs, copy the reviewed version into its
matching `diagrams/friends/<slug>/<slug>.spec.json` before preparing the site.
The deployment script requires exactly these six Canon IDs and distinct thumbnails.
It builds the selected packages, keeps the diagram library, and hides the
service catalog. The default build is restored when the script exits.

The build embeds only the NSP15 science starter and both packages' panel code in
the Workbench and viewer. The Workbench also embeds an offline authoring kit
with the selected contracts, recipes, and source story specs. The hosted
`workbench/starters.json` exposes editable copies of all six active Friends documents.
`prepare` verifies those contents against the actual staged HTML and fails if
one is absent or an unselected package appears.

`company/company.json` selects NSP15 through `packageContent.science`. The
downloaded kit includes its current story, starter, and guide, together with the
contracts and routes needed for the retained science runtime. Older science
story/example specs are excluded. Its exported package manifest lists only the
selected starter and kit files. Generic builds with company identity disabled,
or a replacement company without this selection, retain the complete science
package. The retired Copy gate files remain in the repository for maintenance.
Reusable panel guidance can still link to those upstream examples; the examples
remain in the repository but are intentionally absent from the Friends kit.
All manifest routes and selected starter paths resolve inside the downloaded kit.

The four sports sources live at `packages/sports/diagrams/<slug>/<slug>.spec.json`
and retain all 14 chapters and 173 steps. The numbered library titles establish
the reading order; their READMEs link the previous and next arcs. The original
`season-of-seats` URL remains the first arc. Authoring is desktop-only.

The company config explicitly selects `themes/islanders/theme.json`. That
overlay owns the extra skin, CSS, logos and authoring guidance. Sports alone
does not enable it; `--no-config` omits the overlay and its kit resources.

Share `?theme=islanders` for an Islanders-themed welcome/library, or
`?diagram=islanders-marketing&theme=islanders` for the three-tab marketing document. A valid query theme
wins over the saved cookie and document default on initial load. Theme selectors
update that existing query preference without writing a cookie or changing the
source. Invalid values are ignored and omitted from canonical share links.

The standalone `member-campaign`, `group-night`, and `fan-event-rsvp` Canon cards
are retired. Their original files remain in `diagrams/friends/` and their sibling
package folders for recovery and maintenance; they are not included in the active
registry or hosted starters. See `packages/sports/diagrams/islanders-marketing/`
for the consolidated source and checks. The four older sports arcs remain active.

Set `FLOWVIEW_CF_WORKER` in the environment or in ignored
`deploy/cloudflare/local.env` (see `deploy/cloudflare/local.env.example`).
No Cloudflare account credentials or Worker name belong in this branch.

```sh
sh company/friends-deploy.sh prepare
sh company/friends-deploy.sh deploy
```

Desktop theme/link smoke checks (also prepares locally, never deploys):

```sh
cd tools/browser-tests
npx playwright test -c friends-islanders.config.mjs
```

The browser report includes the library, all four opening readers and focused
arena, heatmap, funnel and card screenshots at a 1440-pixel desktop viewport.

`prepare` creates `deploy/cloudflare/site/` and
`deploy/cloudflare/.generated/wrangler.jsonc` without uploading. Inspect the
generated library and stage before `deploy`, which prepares afresh and uploads
those assets with Wrangler 4. Both paths are ignored by Git.
