# Company deployment requirements for agents

Use this as the handoff to an agent running inside the company environment.
Implement these requirements through the company's existing rollout platform.
Do not introduce a separate Terraform/SAM/CDK deployment path or assume access
to company tooling from this repository. [template.yaml](template.yaml) is a
reference resource configuration, not a required deployment mechanism.

This documents the current implementation. Local mocks have been validated;
live AWS provisioning, email delivery and integration still need company-side
validation. Read [README.md](README.md) for local rehearsal and save semantics.

## Product boundaries to preserve

- Existing local file/folder saving, browser recovery, agent proposal approval
  and paired source/ledger Undo/Redo must continue working. Cloud saving is
  opt-in; opening a local file does not upload it. Explicit online saving can
  coexist with a connected working file. Opening another local document retires
  the previous cloud attachment.
- Document editing is desktop-only. Mobile authoring is not a rollout criterion.
- Keep all project data authenticated and private. The reference deployment's
  generic editor shell is publicly downloadable; it contains no company data.
  If company policy also requires a protected shell, use its approved edge access
  mechanism while preserving login redirects, static assets and authenticated
  project APIs. Changing shell access does not replace API authorization.
- Never deploy mock authentication, test identities, repository contents,
  company catalogs or `.flowview-agent` files. Only the document source, coverage
  ledger and frozen topology context belong in cloud snapshots.

## Company inputs

Resolve these from company configuration and platform documentation before
mapping the resources. Do not invent account IDs, domains, owners or policies.

| Input | Needed for |
| --- | --- |
| AWS account, environment and region | Resource placement and environment isolation; separate production from test data and identities. |
| HTTPS editor origin and public/protected shell policy | Static hosting, API/S3 CORS, Cognito callback/logout URLs. Host the current shell at the origin root; subpath hosting needs an explicit asset/redirect adaptation. |
| API base URL and Cognito login domain | Browser configuration and route mapping. |
| Verified SES sender identity ARN and From address | Cognito email-code delivery; confirm compatible SES/Cognito regions and sending access for invited recipients. |
| Initial team ID, invited accounts, stable internal user IDs and roles | Membership bootstrap; there is no admin invitation UI. |
| Company deployment, tagging, encryption, observability and recovery standards | Map company defaults without changing the storage/authentication contracts below. |

## Resource contract

| Resource | Required behavior |
| --- | --- |
| DynamoDB table | One table with string partition key `pk` and string sort key `sk`. Support strongly consistent Get/Query, conditional Put and transactional writes. Reference configuration uses on-demand billing, encryption and point-in-time recovery. No secondary index is required. |
| Snapshot S3 bucket | Private, public access blocked, encrypted, HTTPS-only, **versioning enabled**. The adapter requires version IDs to pin uploads. Allow browser GET/PUT CORS only from approved editor origins, with `content-type` and `x-amz-*` headers. |
| Lambda service | Production package below, handler `handler.main`, API Gateway HTTP API proxy events with payload format 2.0. Reference settings: `nodejs22.x`, 512 MiB, 30 seconds. Use an approved supported runtime and validate the package if changing it. |
| HTTP API | HTTPS, JWT authorizer on every application route, required scope `flowview/projects`, Lambda invoke permission restricted to this API. CORS permits approved editor origins, GET/POST and `authorization`/`content-type`; configure preflight at the gateway. |
| Cognito user pool/client/domain | Invited accounts only; initial email-code managed login, public app client, authorization code + PKCE, no client secret. Details below. |
| Static shell hosting | Reference: private encrypted S3 origin plus CloudFront Origin Access Control, HTTPS viewer access and `index.html` as the root document. An approved equivalent must serve the staged assets and preserve URL query strings in the browser. |

Snapshot prefixes are `staging/` and `revisions/`. The reference lifecycle expires
current and noncurrent staging versions after two days. Retain revision snapshots,
project/revision records and durable save receipts. Preserve buckets/table on
rollout replacement or removal. Operation records have a logical one-day expiry;
**do not enable DynamoDB TTL on `expiresAt`**: those records are retained to reject
operation-ID reuse. Failed saves can leave unreachable revision objects. Any
cleanup/retention policy must account for references, receipts and recoverability;
do not apply a blanket expiry to committed data.

The browser must reach the editor, API, Cognito authorization/token/logout
endpoints and signed S3 URLs. A private-network rollout must provide that browser
connectivity. If Lambda runs in a company VPC, provide its DynamoDB/S3 connectivity
through approved endpoints or egress. No database server or inbound Lambda
listener needs provisioning.

### Authentication and membership

Use Cognito Essentials or higher, `EMAIL_OTP` as the first factor, SES `DEVELOPER`
email configuration and managed login version 2 with app-client branding.
Disable self-signup. Enable the public client's code flow, `ALLOW_USER_AUTH`,
`ALLOW_REFRESH_TOKEN_AUTH`, and scopes `openid`, `email`, `flowview/projects`.
Register the **exact** HTTPS callback and logout URL used by `redirectUri`.
The reference access-token lifetime is 60 minutes; the app asks for sign-in again
when access expires. These prerequisites are described in AWS's
[email settings](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html)
and [Essentials features](https://docs.aws.amazon.com/cognito/latest/developerguide/feature-plans-features-essentials.html).

The API authorizer uses the pool issuer and app client ID as its audience, with
the required resource-server scope. Preserve the trusted
`requestContext.authorizer.jwt.claims` integration field. The handler also checks
issuer, `token_use: access`, `client_id`, scope and subject; forwarding an
unverified JWT or substituting a user ID header is incompatible. See AWS's
[HTTP API JWT contract](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html).

Provision invited users through the approved company process. For the initial
passwordless pool, omit `TemporaryPassword` when creating users and verify their
email ownership. In the same DynamoDB table, provision one membership per subject:

```json
{"pk":"IDENTITY#<Cognito sub>","sk":"MEMBERSHIP","teamId":"<team ID>","userId":"<stable internal user ID>","role":"editor","name":"<display name>"}
```

`reader` allows authenticated viewing without writes. Missing membership,
unrecognized roles or `disabled: true` deny access. Team selection comes from
membership, never browser input. Later Okta/Auth0 federation must preserve the
Cognito token contract and explicitly map verified subjects to internal users;
matching email addresses must not automatically link identities. Reusing a
company pool is conditional on meeting these requirements, not assumed compatible.

### Service permissions

The Lambda role needs these application permissions, plus the company's standard
runtime logging permissions:

- Table ARN: `dynamodb:GetItem`, `dynamodb:Query`, `dynamodb:PutItem`.
  The current transaction contains only conditional Put operations; authorize
  their underlying `PutItem` action. `TransactWriteItems` is the API operation,
  not an IAM action to copy into a company policy. See AWS's
  [transaction permissions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html).
- Snapshot bucket ARN: `s3:ListBucket`. This is needed for missing-object
  detection; without it, `HeadObject` can return 403 instead of 404 and first
  saves can fail. This permission belongs to Lambda, not the browser. See the
  [S3 HeadObject contract](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html).
- Snapshot `staging/*` and `revisions/*` object ARNs: `s3:GetObject`,
  `s3:GetObjectVersion`, `s3:PutObject`. No application delete permission.

Membership administration and deployment use separate approved operator roles.
If company policy requires customer-managed KMS keys, supply the corresponding
key policies and runtime permissions and validate signed uploads/downloads;
the reference bucket encryption is SSE-S3. Do not give browser users AWS
credentials or direct table permissions. Signed object URLs expire after five
minutes and must not appear in logs; neither should tokens or document bodies.
Keep project API responses uncached (`Cache-Control: no-store`).

## Artifacts and configuration

The Lambda artifact root contains only `handler.mjs`, `service.mjs`,
`aws-adapters.mjs`, `package.json`, `package-lock.json` and production
`node_modules`. Package from `deploy/aws/` with the committed lockfile and
`npm ci --omit=dev --ignore-scripts --no-audit --no-fund`; do not rely on the
runtime's bundled SDK. [Makefile](Makefile) describes this allowlist without
requiring the company platform to invoke SAM.

| Lambda variable | Value supplied by the company platform |
| --- | --- |
| `TABLE` | DynamoDB table name |
| `BUCKET` | Snapshot bucket name |
| `ISSUER` | Exact Cognito pool issuer URL |
| `CLIENT_ID` | Public Cognito app client ID |
| `ACCESS_SCOPE` | `flowview/projects` |

The shell build needs Node 22+ and Python 3. Supply environment-specific public
configuration as a build input, not a committed company configuration file:

```json
{"api":"https://api.example.com","domain":"https://login.example.com","clientId":"PUBLIC_CLIENT_ID","scope":"flowview/projects","redirectUri":"https://editor.example.com/"}
```

Run the existing artifact preparer with that config and a new empty output
directory: `node deploy/aws/stage.mjs /path/to/config.json /path/to/empty-output`.
This is a local build, not an infrastructure deploy. Publish **only** its four
outputs: `index.html`, `template/flowview.html`, `catalog.json`, `starters.json`.
The packager excludes company configuration/libraries/catalogs, injects the
production config and rejects mock auth. It assumes `/template/flowview.html`.
Do not sync the repository or Workbench directory into a hosting bucket.
Refresh the shell CDN cache after publishing and keep previous artifacts for
rollback. API/CDN proxies must preserve these application paths at Lambda:

```text
GET  /me
GET  /projects
GET  /projects/{projectId}
GET  /projects/{projectId}/revisions
POST /uploads
POST /uploads/{operationId}/commit
POST /projects/{projectId}/restore
```

The JSON API accepts small metadata bodies (8 KiB maximum). Documents upload
directly to signed S3 URLs, not through API Gateway/Lambda bodies. Preserve the
limits: source 4 MiB, ledger 256 KiB, frozen context 1 MiB, serialized envelope
32 MiB. Do not add a proxy that reroutes document bodies through the JSON API.

## Company rollout acceptance and handoff

Use the company pipeline for resource changes, promotion, approvals and rollback.
The agent should return its resource-to-platform mapping, artifact versions,
non-secret output/config references, membership bootstrap method, validation
evidence and unresolved company decisions. Rollback must retain stored data and
identity mappings; changing a hostname/client/pool also needs a callback/config
and identity-migration plan.

Before inviting general users, validate in the company's test environment:

1. Real email delivery, code/PKCE login, logout and expired-token reauthentication.
2. Invited editor save/reload/autosave, reader view without writes, outsider denial,
   and isolation between teams. Unauthenticated APIs and snapshot URLs without
   valid signatures must deny access.
3. First save, direct S3 upload/download, revision restore, two-editor conflict
   and uncertain-save retry without duplicate revisions. Check IAM, versioning,
   CORS and integration claims in the actual AWS deployment.
4. Existing local file/folder save/reopen, agent approval and paired Undo/Redo;
   explicit local-plus-cloud saving; opening a different local file leaves the
   old cloud project unchanged. Offline or failed cloud saves preserve the draft.
5. Published shell contains no company artifacts; required assets, cloud query
   links and read-only sharing work over the selected hosting/access layer.
6. Company monitoring, ownership, throttles/cost limits, retention and restore
   procedures are in place. These operational controls and an admin invitation
   UI are not supplied by the application pilot.

Local commands and automated checks remain in [README.md](README.md). Passing
mocks is not a substitute for the company-side integration checks above.
