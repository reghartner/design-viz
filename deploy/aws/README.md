# AWS hosted project pilot

This is one shared library for explicitly invited teammates. Editing is desktop
only. AWS hosts the service: Cognito managed login, API Gateway HTTP API, Lambda,
DynamoDB metadata and private S3 snapshots. Private S3 plus CloudFront OAC hosts
the static editor shell. The shell is publicly downloadable; **all project data
requires an invited account**. A share link is authenticated, read-only viewing.
This implementation has local mock evidence, not a deployed-AWS validation claim.

For an agent using the company's rollout platform, start with
[Company deployment requirements](AGENT-ONBOARDING.md). It describes the resource,
identity, packaging and validation contracts without prescribing Terraform, SAM
or another infrastructure deployment tool.

## Local rehearsal (no account, credentials, Docker or AWS calls)

From the repository root, with Node 22+ and Python 3:

```sh
npm run mock --prefix deploy/aws
```

Open http://127.0.0.1:8787/ on desktop Chromium. Open **Team library** and sign
in as Alice. Save any new/pasted/local draft. Bob shares the pilot library;
read-only teammate cannot write; outsider is rejected. State is in memory until
the server stops. The mock binds only 127.0.0.1 and rejects other Host/Origin
headers. It does not import the AWS SDK or production authentication. Production
Lambda accepts only the validated API Gateway Cognito JWT context, `token_use:
access`, expected issuer, public client ID and `flowview/projects` scope.

Local-only failure injection:

```sh
curl -H 'content-type: application/json' -d '{"upload":true}' http://127.0.0.1:8787/__faults
curl -H 'content-type: application/json' -d '{"upload":false,"ack":true}' http://127.0.0.1:8787/__faults
```

Other toggles: `freeze`, `commit` (booleans), `delay` (0–5000 ms). `ack` substitutes one failed
commit response after its transaction succeeds, exercising uncertain retries.
Use two browser contexts for the stale-editor conflict. Retry preserves the
operation ID. Reload online archives the outgoing draft; Save as new copy leaves
the original unchanged. A restore creates a new head revision.

Focused checks (the same service and DTOs run locally and in Lambda):

```sh
node --test tests/cloud-*.test.js
npm ci --prefix tools/browser-tests --no-audit --no-fund
npm run install:browser --prefix tools/browser-tests
npm test --prefix tools/browser-tests -- --config=playwright.cloud.config.mjs
```

The service tests are also included in the normal `tests/*.test.js` CI command.
The desktop cloud browser spec runs in the ordinary required browser suite too.

## Saving and local folders

Open **Team library** in the desktop header. The dialog follows the editor's
selected theme and keeps account actions, revision history and recovery
contextual. Start or open a project first: Home cannot save the hidden practice
source. **Save current project online** uses the current title as its initial
name; existing project names remain fixed, with **Save a separate copy** for a
new project. **Revision history** exposes restore, while the authenticated share
link opens a reader.

Save online attaches the current exact source, coverage ledger and frozen
provider context to a cloud project. Subsequent accepted edits, JSON handwriting,
agent approvals and Undo/Redo autosave that same artifact pair. Invalid JSON is a
repairable saved draft; the reader explains why it cannot display it yet. New,
paste, file import, local open and earlier-draft restore detach cloud identity.
Choosing an agent folder whose source matches the open cloud draft deliberately
retains its cloud connection. An empty folder becomes an optional working copy.
Cloud remains the shared durable state. Agent suggestions still require the
existing approval preview. No `.flowview-agent` session, transcript, lease,
candidate or pilot metadata is uploaded. Saving does not publish Canon or refresh
frozen providers.

Cloud-specific unsynced recovery is scoped by internal team/user ID. Sign-out
always retires in-flight operations and clears the app's token. If recovery is
available it also clears the displayed document before Cognito logout. If browser
recovery fails, the draft stays in memory and a recovery-download action appears;
the app avoids redirecting away and offers **Finish account sign-out** in another
tab to end Cognito's hosted session. Download the exact current draft before
reauthenticating when recovery is unavailable. The recovery JSON contains the
source, ledger and frozen context, never local agent transcripts. Existing local
browser recovery, including earlier drafts, remains local to the browser profile
and can contain opened cloud source. Shared computers should use separate browser
profiles. Browser storage failure blocks destructive project replacement and
reports that a recovery export or cleanup is required. Recovery is bounded by
browser quota, so very large drafts may require a local export before switching.
Tokens are tab-session storage only, never project artifacts. Access tokens expire
after an hour; the UI asks for another managed sign-in without losing the draft.

## AWS configuration reference (no deploy performed here)

Use the company's existing rollout platform to implement the requirements in
[AGENT-ONBOARDING.md](AGENT-ONBOARDING.md). `template.yaml` is a reference
SAM/CloudFormation configuration, not a required deployment path. Keep the region
compatible with your SES sender identity. EMAIL_OTP requires Cognito ESSENTIALS (or higher),
SES DEVELOPER email configuration, a verified sender and appropriate SES sending
access. The template disables self-signup and uses a public code-grant app client
with PKCE; there is no frontend secret. Provision users with `AdminCreateUser`,
omitting `TemporaryPassword` when passwordless EMAIL_OTP is enabled, and verify
the email through your invitation process. No automatic linking by email occurs.

The reference inputs are `CognitoDomainPrefix`, `SesIdentityArn` and `FromEmail`;
map them into the company platform's configuration. Package the Lambda handler
and pinned production dependencies using the allowlist in `Makefile`. Never
enable mock auth in a production build. No real AWS calls are needed for local tests.

For each invited Cognito subject, an administrator creates exactly one membership
item in the output `MembershipTable`:

```json
{"pk":"IDENTITY#<Cognito sub>","sk":"MEMBERSHIP","teamId":"pilot","userId":"<stable internal ID>","role":"editor","name":"Invited teammate"}
```

`reader` grants read-only access. Absence, unknown role, or `disabled: true` denies
access. Account linking is an explicit administrator-controlled mapping from a
verified Cognito subject to an internal user ID. When adding Okta/Auth0 through
Cognito SAML/OIDC federation later, verify external identity ownership and map/link
subjects administratively; an equal email address is not proof. Different client
supplied user/team IDs cannot select a library.

Create a local production config from stack outputs (do not commit account data):

```json
{"api":"https://API.execute-api.REGION.amazonaws.com","domain":"https://DOMAIN.auth.REGION.amazoncognito.com","clientId":"CLIENT","scope":"flowview/projects","redirectUri":"https://DISTRIBUTION.cloudfront.net/"}
```

```sh
node deploy/aws/stage.mjs /absolute/path/cloud-config.json /tmp/flowview-aws-shell
```

Upload **only** `/tmp/flowview-aws-shell/` into `ShellBucketName`; invalidate
CloudFront after updating. The packager builds `--no-config --no-library
--no-catalog` and allowlists shell HTML plus the viewer template and empty catalog/
starter indexes. Never upload the repository, company files, libraries or drafts.

## Storage and concurrency contract

1. The authenticated prepare API accepts an operation ID, expected head revision
   and bounded name. Team, writer and staging object ownership come from membership.
2. The client uploads the closed envelope directly to a short-lived signed S3 PUT.
   Source is at most 4 MiB, ledger 256 KiB, frozen context 1 MiB. Serialized JSON
   can expand because of escaping; the object limit is 32 MiB. No full envelope
   crosses the API Gateway/Lambda 6 MiB request/response boundary.
3. Finalize pins the staging S3 version, validates its fields and size, and freezes
   it under a conditional immutable key. Reusing the staging signed URL cannot
   mutate a frozen revision. A DynamoDB transaction conditionally updates the
   project head, adds a revision and adds a durable idempotency receipt together.
   A stale base returns 409 with current metadata, preserving both drafts.
4. S3 failure or transaction failure cannot publish phantom revisions. Failed CAS
   can leave an unreachable immutable snapshot, intentionally retained for an
   operator's later retention audit. Staging versions expire after two days;
   successful revision snapshots and durable receipts are retained. Prepared
   operations expire logically after a day but are kept to reject ID reuse.

S3 URLs are short-lived bearer capabilities; do not log or share them. Share the
stable authenticated project link instead. IAM grants only table Get/Query/Put/
transaction writes and snapshot-prefix Get/GetVersion/Put. Bucket listing is granted only to Lambda on the private snapshots bucket so
S3 HeadObject returns 404 for missing keys; the browser receives no listing
capability. This follows the [S3 HeadObject permission contract](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html).
Arbitrary 403 errors remain failures. No public writes, arbitrary object keys, delete permissions or cloud credentials are
available to the browser. Admin membership updates are operational actions, not
client API routes. Bucket/table retention policies protect stored projects on
stack deletion. Operational deletion, retention quotas, audit logs, custom domains
and federation setup are follow-up deployment concerns, not claimed mock evidence.
