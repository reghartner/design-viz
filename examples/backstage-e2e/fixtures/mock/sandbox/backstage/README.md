# Real Backstage host for the fictional rehearsal

Follow [the mock repository setup](../../README.md). Its launcher supplies local
credentials and starts the catalog source, diagram read service, real Backstage
backend and frontend together. Run setup before the installer so it can find the
designer source. The installer builds and packs that source, installs the compiled
`@flowview/backstage-plugin` tarball, and refreshes the local app manifest/lockfile.
The package archive is ignored under `.local/`; there is no `plugins/flowview`
workspace. The app uses `/new-frontend` with the reference proxy transport.

Use Node 24 and the locally installed Yarn 4.13.0 release. `yarn tsc`,
`yarn workspace app build` and `yarn build:backend` validate the host and bundles.
`yarn test:e2e` exercises the running host with Google Chrome.

This scaffold uses development Guest authentication and an in-memory database.
Company deployment needs its own authentication, database and host configuration.
The designer's nginx image is a separate static editor build.
