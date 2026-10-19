# Friends site overlay

This branch is the Friends company fork overlay. `company/company.json` enables
the science and sports packages for this site. The upstream default build
remains core-only. `canon.json` publishes four
reviewed documents copied from those packages into `diagrams/friends/`:

- Venue map (`packages/sports/examples/venue-map.spec.json`)
- Sequencing walkthrough (`packages/science/starters/sequencing-walkthrough.json`)
- Biology teaching (`packages/science/diagrams/biology/cell-journey/biology-teaching.spec.json`)
- Season of seats (`packages/sports/diagrams/season-of-seats/season-of-seats.spec.json`)

When upstream changes one of these specs, copy the reviewed version into its
matching `diagrams/friends/<slug>/<slug>.spec.json` before preparing the site.
The deployment script requires exactly these four Canon IDs and thumbnails.
It builds the selected packages, keeps the diagram library, and hides the
service catalog. The default build is restored when the script exits.

The build embeds science starter templates and both packages' panel code in
the Workbench and viewer. The Workbench also embeds an offline authoring kit
with the selected contracts, recipes, and source story specs. The hosted
`workbench/starters.json` exposes editable copies of all four Friends stories.
`prepare` verifies those contents against the actual staged HTML and fails if
one is absent or an unselected package appears.

Set `FLOWVIEW_CF_WORKER` in the environment or in ignored
`deploy/cloudflare/local.env` (see `deploy/cloudflare/local.env.example`).
No Cloudflare account credentials or Worker name belong in this branch.

```sh
sh company/friends-deploy.sh prepare
sh company/friends-deploy.sh deploy
```

`prepare` creates `deploy/cloudflare/site/` and
`deploy/cloudflare/.generated/wrangler.jsonc` without uploading. Inspect the
generated library and stage before `deploy`, which prepares afresh and uploads
those assets with Wrangler 4. Both paths are ignored by Git.
