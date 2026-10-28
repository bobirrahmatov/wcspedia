# Article helpfulness service

The article interface uses native Confluence comments for discussion. Helpfulness votes are stored separately by this trusted service. Comments and comment bodies are not copied into this JSON record. A comment does not depend on the analytics service being available.

The two Node modules are service source, not Confluence attachments. They do not install an endpoint when uploaded to a page. Deploy them behind the same origin through your existing trusted Confluence service integration, then configure the browser's `feedbackEndpoint` to that actual deployed route. Leave it empty until deployment; the page must not pretend that an unsaved vote succeeded.

## JSON storage

The file adapter creates **one JSON file per document automatically on its first accepted vote**:

```text
<private-service-data>/wcspedia-feedback-<rootPageId>-<pageId>.json
```

Do not upload an empty starter JSON for every article. An initial GET returns real zero totals and creates no file. The service alone writes these files; keep the directory outside web roots and Confluence attachments. The internal JSON contains pseudonymous voter keys, the latest vote per person, change events and idempotency receipts. Do not expose it to readers or manually edit it. It is separate from page content, article versions and approval audit trails.

The file adapter uses exclusive filesystem lock directories and atomic rename with file/directory fsync. Concurrent processes on the **same host/local filesystem** serialize by document. A crashed writer can leave a `.lock` directory: confirm that no writer owns it before removing it. Locks are never automatically stolen, so a slow operation cannot be overwritten. Multiple hosts, network shares or a Confluence cluster require an injected transactional database/distributed lock store instead. Do not use NFS as a substitute.

The JSON adapter has a 16 MiB record limit and 100,000-record limits on votes, events and receipts. At capacity it stops accepting changes without discarding evidence. Move large installations to database storage and retain the same API. Plan service-managed retention/archival before reaching these limits; receipts are not silently expired because that would make late retries unsafe.

## Required server integration

```js
const {
  createArticleFeedbackService,
  createArticleFeedbackFileStore
} = require('./article-feedback-service.cjs');
const { createArticleFeedbackHandler } = require('./article-feedback-http.cjs');

const service = createArticleFeedbackService({
  rootPageId: '3954553300',
  spaceKey: 'wcspedia',
  areaPageIds: [
    '3961735771', '3961735776', '3961735781', '3961735791',
    '3961735795', '3961735800', '3961735803', '3961735808'
  ],
  insightsPageId: '3961735728', // Published Insights article parent, inside WCSpedia.
  excludePageIds: [
    '3962195316', // shared attachments
    '3961735744', '3961735749', '3961735759', '3961735763'
  ],
  excludeAncestorIds: ['3961735834'], // working/draft page tree
  store: createArticleFeedbackFileStore(process.env.WCS_FEEDBACK_DATA_DIR),
  actorSecret: process.env.WCS_FEEDBACK_ACTOR_SECRET,
  resolveAccess: resolveConfluenceArticleAccess,
  canExportAnalytics: canCurrentSessionExportArticleAnalytics
});

const feedbackHandler = createArticleFeedbackHandler({
  service,
  origin: process.env.CONFLUENCE_ORIGIN, // origin only; no /confluence suffix
  pathname: process.env.WCS_FEEDBACK_ROUTE, // actual deployed same-origin path
  authenticate: authenticateCurrentConfluenceSession
});
// In the host router: if (await feedbackHandler(req, res)) return;
```

The three named callbacks in this example are **mandatory host integration functions**, not implementations included in the attachment package:

- `authenticateCurrentConfluenceSession(req)` must validate the signed-in Confluence session and return server-owned context or `null`. Never accept an SOEID, actor ID, administrator flag, or permissions from JSON, query parameters or a caller-supplied header.
- `resolveConfluenceArticleAccess({rootPageId, pageId, context})` must obtain current page metadata and root/document native read permissions **as the authenticated user**, including after permissions change. A privileged service account GET alone does not prove that the user can read a page. Return the exact shape below only after verifying it from Confluence.
- `canCurrentSessionExportArticleAnalytics({rootPageId, pageId, context})` must check the organization's analytics/export permission. Without this callback exports are denied. Ordinary readers receive totals and only their own vote, never another person's voter key.

```js
{
  authenticated: true,
  rootReadable: true,
  canRead: true,
  actorId: 'stable-server-verified-confluence-user-key',
  page: {
    id: 'the-requested-native-page-id',
    type: 'page',
    status: 'current',
    spaceKey: 'wcspedia',
    ancestorIds: ['3954553300', 'the-business-area-page-id'],
    version: 3
  }
}
```

The service verifies the WCSpedia root followed by a configured business-area or Insights ancestor, exact space, current page status, native version and exclusions itself. `insightsPageId` is optional; leave it blank only when Insights is not configured. Root, business-area/Insights navigation pages, interface pages, attachments page and descendants of the working root cannot receive votes. The callbacks must enforce any additional native restrictions. Keep the actor secret stable, private and at least 32 bytes; changing it changes voter identities and requires a deliberate migration. Browser clients never receive it.

Every read, write, export and idempotent retry checks current access again. The transport additionally checks same-origin POSTs, JSON content type, the `X-Requested-With` header and matching idempotency header. These CSRF checks supplement authenticated host middleware; they do not replace it. No CORS allow-all response is added.

## Browser contract

`GET feedbackEndpoint?rootPageId=3954553300&pageId=<native-document-page-id>`

```json
{
  "schemaVersion": 1,
  "rootPageId": "3954553300",
  "pageId": "12345",
  "pageVersion": 3,
  "revision": 7,
  "totals": { "yes": 5, "no": 1, "total": 6 },
  "currentVersionTotals": { "yes": 2, "no": 0, "total": 2 },
  "myVote": { "value": "yes", "revision": 2, "pageVersion": 3 }
}
```

No existing vote returns `myVote: {value: null, revision: 0, pageVersion: null}`. `totals` counts each person's latest choice once across article revisions. `currentVersionTotals` counts only latest choices made against the current native page version. A user's Yes-to-No change replaces their current choice. Reaffirming a choice on a new native page version associates that person's vote with the new version. This avoids presenting old-version feedback as evaluation of a new revision.

`POST feedbackEndpoint`, headers:

```text
Content-Type: application/json
X-Requested-With: XMLHttpRequest
Idempotency-Key: <same value as requestId>
```

```json
{
  "rootPageId": "3954553300",
  "pageId": "12345",
  "pageVersion": 3,
  "value": "yes",
  "expectedVoteRevision": 2,
  "requestId": "a-new-unique-request-id"
}
```

The success body is the same as GET plus `accepted: true`, matching `requestId`, and `changed: true|false`. `expectedVoteRevision` is the current person's vote revision, not the shared aggregate revision: unrelated people can vote concurrently without conflicting. A stale vote revision or changed article version returns HTTP 409. A previously accepted request replays its original acknowledgement after rechecking current read permission. Never merge an older aggregate revision over a newer UI state.

Show the optimistic choice immediately with a pending state, then replace it with the verified response. On a known failure restore the previous choice and preserve a retry. On a timeout or connection loss, the outcome is uncertain: retain the same request ID for retry/reconciliation. Do not submit another request ID automatically. Disable repeated click changes while the operation is in flight. No navigation or page reload is required.

## Analytics JSON export

Authorized users can request:

```text
GET feedbackEndpoint?rootPageId=3954553300&pageId=12345&format=analytics
```

This downloads `wcspedia-feedback-12345.json` containing aggregate totals, per-native-version current vote totals, service revision, update time and count of vote changes. It contains no voter identities, comment bodies or idempotency receipts. `article-feedback-analytics.example.json` shows the shape. These exports are snapshots, not the writable source. If copies are attached to Confluence for reporting, a trusted scheduled publisher should produce them under appropriate permissions; the UI should not overwrite them after every vote.

`byPageVersion` groups each person's **current** vote by the page version they evaluated. It is not an immutable historical survey snapshot. Historical change analysis can use the protected service events under approved analytics access; do not expose the raw private file to readers.

## Verification

Run `node --test article-feedback.test.cjs`. Tests cover authentication, exact root/area/space and working-tree exclusions, optimistic revision conflicts, concurrent voters, duplicate clicks, uncertain acknowledgements, current-version analytics, storage corruption, filesystem locking, CSRF and aggregate-only exports. These are local tests and do not certify an undeployed internal endpoint.
