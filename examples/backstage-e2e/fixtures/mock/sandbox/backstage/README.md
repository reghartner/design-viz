# Real Backstage host for the fictional rehearsal

Follow [the mock repository setup](../../README.md). Its launcher supplies local
credentials and starts the catalog source, diagram read service, real Backstage
backend and frontend together. Run setup before installing the workspace so that
the ignored `plugins/flowview` copy exists.

Use Node 24 and the locally installed Yarn 4.13.0 release. `yarn tsc`,
`yarn workspace app build` and `yarn build:backend` validate the host and bundles.
`yarn test:e2e` exercises the running host with Google Chrome.

This scaffold uses development Guest authentication and an in-memory database.
Company deployment needs its own authentication, database and host configuration.
The designer's nginx image is a separate static editor build.
