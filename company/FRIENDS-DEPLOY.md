# Friends site overlay

This branch is the Friends company fork overlay. `company/company.json` enables
the science and sports packages for this site. The upstream default build
remains core-only. `canon.json` publishes three reviewed documents copied from
those packages into `diagrams/friends/`:

- Season of seats: an Islanders marketing story that uses the arena map across
  distinct buyer, offer, and renewal decisions
  (`packages/sports/diagrams/season-of-seats/season-of-seats.spec.json`)
- Copy gate: a conceptual virology story for an RNA sequencing researcher
  (`packages/science/diagrams/biology/copy-gate/copy-gate.spec.json`)
- The insertion signature of NSP15: a desktop-first guide to the public Bianco
  et al. preprint, retaining its not-peer-reviewed status, evidence boundaries,
  and unresolved-mechanism language
  (`packages/science/diagrams/biology/nsp15-insertion-evidence/nsp15-insertion-evidence.spec.json`)

The standalone venue map repeats the arena concepts already used in the
Islanders story, so it is not a separate Friends document. Physics, other broad
biology, and the illustrative DNA sequencing walkthrough remain available as
reviewed upstream package content without appearing in this site's library.

When upstream changes one of these specs, copy the reviewed version into its
matching `diagrams/friends/<slug>/<slug>.spec.json` before preparing the site.
The deployment script requires exactly these three Canon IDs and thumbnails.
It builds the selected packages, keeps the diagram library, and hides the
service catalog. The default build is restored when the script exits.

The build embeds science starter templates and both packages' panel code in
the Workbench and viewer. The Workbench also embeds an offline authoring kit
with the selected contracts, recipes, and source story specs. The hosted
`workbench/starters.json` exposes editable copies of all three Friends stories.
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
