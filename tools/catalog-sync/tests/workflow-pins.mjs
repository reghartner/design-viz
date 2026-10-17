import assert from 'node:assert/strict';

// Held back for self-hosted runners older than 2.327.1 (see the workflow's header comment).
export function assertPinnedActions(uses){
  assert.deepEqual(uses,[
    'actions/checkout@v4','actions/setup-node@v4',
    'actions/create-github-app-token@v3','actions/create-github-app-token@v3',
    'peter-evans/create-pull-request@22a9089034f40e5a961c8808d113e2c98fb63676',
  ]);
}
