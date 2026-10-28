# WCSpedia trusted publication source

**Not applicable to the department's confirmed space-only setup (2026-10-17).** This source is retained as reference for a different hosting model. The user cannot deploy a server service. The current project direction uses native Confluence APIs through the signed-in session, retaining the existing navBar/editor/design; that replacement is not implemented in this archive. Do not treat this package as an installation requirement.

Deploy this source only on the trusted workflow service host. Uploading HTML/JS/CSS to Confluence does not execute these CommonJS modules or create a workflow endpoint. This package includes source and regression tests, not credentials, authentication middleware, production state or a running service.

The current custom editor keeps authorized working snapshots and audit events in a protected workflow journal. The publisher creates/updates native working and approved pages from the reviewed snapshot; the projection writer maintains the approved reader projection. This remains a hybrid workflow. Direct native editor changes are detected as version conflicts and are not silently imported into the custom editor.

## Components

- `publication-workflow.cjs`: authenticated identity, current entitlements/native rights, exact revision workflow, durable transaction and commit receipt.
- `publication-http.cjs`: Node HTTP routing for the authorized workspace, lightweight creation capability check and workflow commands. Requires the host's trusted authentication, workspace filtering and native-capability adapters.
- `confluence-publisher.cjs`: native working/reader page creation, versioned updates, verified parents, labels/media and resumable publication.
- `confluence-storage.cjs`: approved snapshot conversion to native storage XHTML with escaped content, native metadata and per-article discussion policy markers.
- `confluence-projection.cjs`: idempotent approved-only reader attachment publication with verification.
- `confluence-entitlements.cjs`: reads the live, version-verified `entitlements.json` attachment through `loadPolicy()`; its administration API is separate from the publication routes.
- Shared `.js` modules and the vendored Markdown parser/license: required local dependencies; keep their relative paths.

`wcspedia-data.json` contains illustrative data used by regression tests. **Do not import it as production documents, users, grants or audit history.** Preserve the live `entitlements.json`, page mappings, journals and approved reader data during deployment.

## Publication routing

Configure the trusted publisher independently of browser-supplied JSON:

```js
const publication = {
  baseUrl: 'https://cedt-confluence.nam.nsroot.net/confluence',
  spaceKey: 'wcspedia',
  publishedRootPageId: '3954553300',
  workingRootPageId: '3961735834',
  insightsPageId: '3961735728',
  insightsTypes: ['Blog', 'Knowledge sharing', 'Reference'],
  areaPageIds: {
    'credit-approval-control': '3961735771',
    'credit-information-management': '3961735776',
    'credit-management-reporting': '3961735781',
    'deal-closing': '3961735791',
    'documentation-pledging': '3961735795',
    'emea-credit-admin': '3961735800',
    'loan-management': '3961735803',
    'regional-operating-manuals': '3961735808'
  }
};
```

Use the actual verified internal hostname if it differs. The publisher verifies that the business-area and Insights parents are directly below WCSpedia in the configured space. The working root must be separate and have explicit native read restrictions.

The working root and published WCSpedia root **must not be ancestors of one another**. The numeric working-root ID above does not establish that this hierarchy or its restrictions are correct. Verify both before enabling creation; do not change or expose an existing restricted tree to bypass a configuration failure.

Every new draft goes beneath the working root. Approval publishes Blog, Knowledge sharing and Reference articles under Insights; other document types use their business-area parent. Later approvals preserve the existing native page identity. Existing articles already mapped to a different parent require an explicit migration; the publisher will not silently move them or accept an incorrect receipt.

Each version carries `commentsEnabled` as a boolean. The renderer exposes the approved value to the article discussion bootstrap. The option controls the WCSpedia discussion presentation and its submission path; native Confluence permissions remain the authority. It is not a substitute for native comment restrictions where a policy must block all clients.

## Host integration

Create the publisher with server-held credentials, a durable private journal, and `publication` above. Connect it to `createWorkflowService` and `createProjectionWriter` using the contracts documented in those modules. The host must supply:

1. Authenticated Confluence session resolution and CSRF/origin checks for every mutation.
2. The current authorized workspace, real directory mappings and validated live `entitlements.json`.
3. Fresh native page permissions and versions for the caller, independent of any privileged service account.
4. A protected durable journal shared by all authoritative writers, plus the actual approved-reader attachment destination/version.
5. Server-side filtering of workspace responses; never expose unrestricted `snapshot()` output to ordinary readers.

The following function composes the supplied modules. `host` is a required integration with your approved internal Confluence/SSO host; this package does **not** provide that integration, a proxy trust policy, or credentials. Do not construct a trusted session from a username header, SOEID query parameter, browser JSON or unverified cookie. Do not use the publishing service account's rights as proof of the caller's rights.

```js
const { createPublisher, createFileJournal } = require('./confluence-publisher.cjs');
const { createProjectionWriter } = require('./confluence-projection.cjs');
const { createEntitlementsService } = require('./confluence-entitlements.cjs');
const { createWorkflowService } = require('./publication-workflow.cjs');
const { createPublicationHandler } = require('./publication-http.cjs');

function buildPublicationRoutes(host, publication) {
  // One process only. Clustered deployments must inject a shared transactional
  // journal instead. This directory must never be served over HTTP or attached.
  const journal = host.journal || createFileJournal(host.privateJournalDirectory);
  const headers = host.confluenceServiceHeaders; // Server-held secrets only.
  const rootPageId = publication.publishedRootPageId;
  const attachmentPageId = '3962195316';
  const policy = createEntitlementsService({
    baseUrl: publication.baseUrl, rootPageId,
    entitlementsPageId: attachmentPageId,
    filename: 'entitlements.json', journal, headers
  });
  const publisher = createPublisher({ ...publication, journal, headers });
  const writeProjection = createProjectionWriter({
    baseUrl: publication.baseUrl,
    // This writer's rootPageId means the ATTACHMENT HOST, not the landing page.
    rootPageId: attachmentPageId,
    filename: 'wcspedia-published.json', journal, headers
  });
  const service = createWorkflowService({
    rootPageId, journal, publisher, writeProjection,
    loadInitialState: () => host.loadInitialState(),
    authenticate: session => host.authenticateSession(session),
    loadPolicy: () => policy.loadPolicy(),
    nativeAccess: context => host.nativeAccess(context)
  });
  return createPublicationHandler({
    service, rootPageId,
    origin: new URL(publication.baseUrl).origin,
    // Proposed custom routes, NOT existing Atlassian REST endpoints:
    workspacePath: '/confluence/rest/wcspedia/1/workspace',
    workflowPath: '/confluence/rest/wcspedia/1/workflow',
    authenticate: request => host.authenticateRequest(request),
    loadWorkspace: (session, context) => host.loadAuthorizedWorkspace(session, {
      ...context, readSnapshot: () => service.snapshot()
    }),
    loadCapabilities: (session, context) => host.loadCapabilities(session, {
      ...context, loadPolicy: () => policy.loadPolicy()
    }),
    maxBodyBytes: 10000000,
    requestTimeoutMs: 30000
  });
}
```

Mount the returned async `(request, response) => handled` function before body-parsing middleware. If it returns `false`, let the host handle the unrelated route. Serve both paths through the same HTTPS origin as Confluence; do not add permissive CORS. Set host/proxy header, connection and body timeouts and protect service credentials in the host's secret store. Once a mutation is accepted, a browser disconnect must not abort its durable transaction; the original request ID is used for recovery.

These callbacks are part of the deployment contract:

| Callback | Required result and checks |
| --- | --- |
| `authenticateRequest(request)` | Opaque verified session, or `null` when unauthenticated. Resolve through the approved host/session integration. |
| `authenticateSession(session)` | The real current Confluence user record (`username`/SOEID and available immutable `userKey`/`accountId`). Never use command fields. |
| `loadInitialState()` | `{ data, attachmentVersion }` from protected production state, only on first initialization. `data` must contain actual directory mappings and valid migrated native mappings for existing managed documents. The version must match the pre-uploaded reader attachment. |
| `loadAuthorizedWorkspace(session, context)` | `{ data, attachmentVersion }` filtered for this caller using native read permissions, role/assignment and entitlements. `context.readSnapshot()` is private input to that filter, never the response by itself. Include the signed-in person's unique verified mapping even when no public directory exists; use a minimal Reader mapping for a permitted reader. Include only permitted document/audit/version records and the people those records reference. |
| `loadCapabilities(session, context)` | `{ rootPageId, identity: { soeid, userKey?, accountId? }, canCreateDocument: boolean }`. Prove current JSON `content.create`, native library read, read access to the configured restricted working parent, and actual Add page permission in that Confluence space. Return `false` when not authorized; never infer create from update permission. Fail when checks cannot be completed. |
| `nativeAccess(context)` | Fresh caller-specific operations and native versions in the shape documented by `publication-workflow.cjs`. The workflow rechecks permissions for every mutation and every retry. |

Confluence Data Center may not include `create/page` in a page's expanded `operations`. Add page is a space permission. The host must derive a creation proof from authoritative caller-specific space permissions and readable destination parent; it must not turn an absent operation into an automatic grant. The capability response is used only to enable the browser control. It cannot replace the workflow's fresh mutation checks.

`BR47149` in the starter entitlement policy does not create a trusted directory record or an independent reviewer. Register real author/reviewer/Manager identities in the protected directory. A contributor cannot review or approve their own document; at least one separate eligible reviewer/Manager is required to publish that contributor's article.

## Connect the existing editor

After the host has actually deployed and verified these routes, set the **same** endpoints in every installed page/header configuration:

```js
workspaceEndpoint: '/confluence/rest/wcspedia/1/workspace',
workflowEndpoint: '/confluence/rest/wcspedia/1/workflow'
```

Keep them blank until real routes exist. These example names are not enabled by uploading `entitlements.json` or by entering a page ID. The custom editor, Add document modal and approval screens remain in use.

The workspace endpoint supports authenticated `GET ?rootPageId=3954553300` and the smaller `GET ?rootPageId=3954553300&capabilitiesOnly=true`. The latter must call only the capability adapter, not load the document library. The workflow endpoint accepts authenticated JSON `POST`, with same-origin Origin/Referer verification, `X-Requested-With: XMLHttpRequest`, and `Idempotency-Key` exactly matching `requestId`. Unknown roots, duplicate/unsupported queries, browser-supplied identity/permission fields and malformed UTF-8 fail closed.

Saving a new document writes a restricted native working page and a protected journal snapshot. Submitting moves that exact revision to review. Completing review records the revision-specific review evidence. Approval by the eligible Manager publishes the approved snapshot to the configured area or Insights parent, verifies the native result, writes/verifies the approved reader JSON, then commits the workflow receipt. The endpoint never reports success before that commit. Subsequent approvals update the same reader page ID.

The reader JSON is the approved read model for this custom workflow; it is not the full Confluence search index. Native child pages remain the searchable Confluence content. `entitlements.json` is the access policy. Working versions, audit evidence, mappings and retry receipts belong in the protected server journal, not a public attachment. Preserve live policy and journal state during upgrades.

## Limits and recovery

Each native attachment and the reader projection must be at most **10,000,000 UTF-8/file bytes**. The HTTP adapter also caps the entire incoming JSON body at 10,000,000 bytes by default, configurable only downward. This request limit is separate from the per-attachment limit: inline base64 adds size, so a file that fits Confluence's limit may still make an editor request too large. Reduce or split the supplied media when rejected; do not retry a 413 indefinitely. The entitlement module retains its smaller 2 MiB policy limit.

The request-body receive timeout defaults to 30 seconds and is bounded at 120 seconds. It does not time out or cancel the durable publication after execution starts. Host adapters still require their own bounded authentication/native-request deadlines and safe error logging. The HTTP response deliberately hides upstream exception text, URLs and secrets.

For first Insights approval, the workflow supplies `publicationDestination: { kind: 'insights', parentPageId: '3961735728' }` to `nativeAccess`. That adapter must return `publicationDestination: { pageId: '3961735728', operations: [...] }` proving this caller's native `read/page` and `create/page` rights on that exact parent. Business-area permissions cannot substitute for Insights permissions. Existing published pages also require their own current update permissions.

Keep complete publication, workflow and projection journals during updates. Retry an uncertain operation with its original request ID; do not delete receipts or pending transactions to force success. The reference publisher file journal supports one Node process on one host. Clustered or multi-process deployments need a shared transactional journal and locking adapter.

## Verification

Use a supported Node runtime with built-in `fetch`, `FormData` and `Blob`; the storage XML test also uses Python 3's standard library.

```sh
node --test publication-http.test.cjs confluence.test.cjs confluence-entitlements.test.cjs confluence-publisher.test.cjs confluence-storage.test.cjs confluence-projection.test.cjs publication-workflow.test.cjs tests/native-publication-flow.cjs tests/native-projection-flow.cjs
```

These fixtures verify local behavior. Before production, verify real author/manager permissions, both destination types, enabled/disabled comments, first publication, revision publication, conflict handling and recovery against the internal Confluence staging instance. This source archive does not establish that the service is deployed or that those live checks passed.
