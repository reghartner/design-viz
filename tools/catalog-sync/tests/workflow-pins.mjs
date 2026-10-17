import assert from 'node:assert/strict';

// Upstream holds these versions back for self-hosted runners older than 2.327.1 (see the
// workflow's header comment and dependabot.yml). Forks on newer runners may bump them, so
// only the roster, its order and pinning are fixed here.
export function assertPinnedActions(uses){
  assert.deepEqual(uses.map(use=>use.split('@')[0]),[
    'actions/checkout','actions/setup-node',
    'actions/create-github-app-token','actions/create-github-app-token',
    'peter-evans/create-pull-request',
  ]);
  for(const use of uses)assert.match(use,/^[^@]+@(v\d+|[a-f0-9]{40})$/,use+' must be pinned to @vN or a 40-hex commit SHA');
  assert.match(uses.at(-1),/@[a-f0-9]{40}$/,'peter-evans/create-pull-request must be pinned to a commit SHA');
}
