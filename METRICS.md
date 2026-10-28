# WCSpedia reading time and document views

## Reading time

`document-metrics.js` estimates the exact content snapshot being displayed. The estimate is derived when needed, so changing a document automatically changes its reading time without storing a second editable value.

```text
seconds = readable words × 60 / 200 + rendered images × 10
minutes = ceil(seconds / 60), with a minimum of 1 for nonempty content
```

The 200 words-per-minute speed and 10 seconds per image are explicit product assumptions, not measured completion times. The estimate includes the title, summary, highlights, cover caption, and article text. Valid cover and inline images each contribute the image allowance. Markdown is parsed using the bundled parser so formatting markers, link destinations, attachment URLs, and image data do not inflate the word count. Canonical Markdown takes precedence over the legacy section projection; it is never counted twice. Embedded videos and linked files are not treated as completed training time. Attachment contents are not downloaded or inspected for this estimate.

Words are segmented using `Intl.Segmenter` when available. The Unicode fallback recognizes words and contractions but does not perform dictionary segmentation for languages without spaces. This is an approximate reading estimate across languages, not a training completion requirement.

Library sort values `shortest` and `longest` use the calculated seconds before minute rounding. This avoids arbitrary ordering when two articles both display “2 min read.” Existing deterministic tie-breakers retain a stable result order.

## What a view means

A view is a visit to the **current published WCSpedia document**. The page must remain visible for two seconds before the application submits a request. Search results, cards, editor previews, working drafts, and audit screens do not generate views. An author or manager opening the published reader page counts by the same rules as any other authenticated colleague.

The service counts at most one visit for the same authenticated SOEID and immutable document key in a **rolling 30-minute window**, anchored to the last counted visit. Refreshes and navigation within that window do not increase the total or extend the window. A later eligible visit may count again, so the total is visits, not unique people or training completions. The permanent document key preserves a document's total across title changes and new published versions. Changing version does not reset the deduplication window.

These totals cover visits recorded through WCSpedia. They do not claim to include every native Confluence page visit, PDF download, or external attachment view. A native Confluence view must use the same governed recording integration if it should contribute to the same total.

## Trusted service configuration

Set `WCS_CONFIG.metricsEndpoint` to a same-origin endpoint under the configured Confluence context. The production macro leaves it empty until a trusted service exists. An unconfigured or failed service is **unavailable**, never an invented zero. A real zero is shown only when the service returns an authorized document with a count of zero.

```js
window.WCS_CONFIG.metricsEndpoint = '/confluence/rest/wcspedia/metrics';
const adapter = WCSConfluence.create(window.WCS_CONFIG);
const counts = await adapter.loadMetrics();
// counts is a mutable documentKey → nonnegative safe integer map.

const result = await adapter.recordView({
  documentKey: document.id,
  version: published.version,
  revision: published.revision,
  requestId: crypto.randomUUID()
});
// { documentKey, views, counted }
```

Retain the same `requestId` for a retry of the same visit. If omitted, the adapter generates a secure identifier and retains it across an unsuccessful retry. An idempotent replay returns its original acknowledgment; a UI that already has a newer count should merge with `Math.max(existingCount, result.views)`.

### Read counts

`GET metricsEndpoint?rootPageId=100`

```json
{
  "schemaVersion": 1,
  "counts": [
    { "documentKey": "credit-approval-checklist", "views": 24 },
    { "documentKey": "loan-closure-checklist", "views": 0 }
  ]
}
```

Return only current, published, nondeleted documents within this root that the authenticated session can read natively. Include authorized zero counts. Omit inaccessible records entirely; never return a private-document key with a count. Reject unauthenticated or unauthorized root access. The adapter rejects duplicate keys, negative or fractional counts, unsafe integers, and malformed schemas instead of accepting partial metrics.

### Record a visit

`POST metricsEndpoint` with `Content-Type: application/json`, `X-Requested-With: XMLHttpRequest`, and `Idempotency-Key` matching the body:

```json
{
  "rootPageId": "100",
  "documentKey": "credit-approval-checklist",
  "version": 1,
  "revision": 1,
  "requestId": "e42d0038-9a14-4a3d-885f-0056f83e14da"
}
```

The service must authenticate the current Confluence session, derive its normalized SOEID, check native read permission and root/document mapping, and require the exact current published version and revision. Do this before every request, including a replay. Deleted, private, missing, or unreadable documents must not produce a count response. Stale snapshots return a conflict. Do not accept actor, permissions, timestamps, or count values from the browser.

Successful acknowledgment:

```json
{
  "accepted": true,
  "requestId": "e42d0038-9a14-4a3d-885f-0056f83e14da",
  "documentKey": "credit-approval-checklist",
  "views": 25,
  "counted": true
}
```

Return `counted: false` with the current total for a new request within the same person's 30-minute window. Replay an already processed request without incrementing, even after that window expires. Reusing an identifier for different content is a conflict. The adapter requires `accepted: true`, matching request/document keys, a valid integer total, and a boolean `counted` before showing a confirmed update. Network loss or malformed acknowledgment does not imply success.

## Storage and concurrency

Keep counters separate from the document Markdown/JSON attachments, workflow revisions, policy revisions, and approval audit. A reader visit must not create a document version or an edit-audit entry. Browser read-modify-write of a shared JSON attachment loses increments under concurrency and is not supported.

A production implementation needs durable server storage with:

1. A counter keyed by root and permanent document key.
2. The last counted server timestamp keyed by root, authenticated SOEID, and document key.
3. A durable idempotency record keyed by root, authenticated SOEID, and request ID, including a canonical payload fingerprint and original acknowledgment.
4. A transaction or equivalent atomic operation spanning the deduplication check, increment, timestamp, and acknowledgment. Multiple service instances must share these records.

Validate the session and request origin using the deployed Confluence environment's CSRF controls. `X-Requested-With` alone is not authentication. Protect individual visit records and expose aggregate counts only; apply the organization's retention rules. A deleted document's historic metrics may remain in a restricted server record, but must disappear from reader metrics and sorting.

The browser prototype's local counts are isolated sample data for that browser. They are not shared enterprise analytics. `view-count-store.cjs` and `mock-confluence.cjs` are memory-only loopback verification code, not a deployable production analytics backend. The mock fixes its fictional identity on the server, and its synchronous critical section illustrates the transaction; stopping the server resets all counts.

## Sorting scope

`most-viewed` and `least-viewed` sort the authorized WCSpedia library by the returned aggregate count. Unknown counts stay last in both directions; they are not treated as zero. Reading-time and view-count sorting run over the full matched library before pagination. Native Confluence CQL results do not have these application metrics and must not be presented as if a fetched page were a globally sorted native result set.

## Verification

```sh
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test document-metrics.test.cjs discovery.test.cjs view-counts.test.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test confluence.test.cjs view-count-store.test.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/metrics-app.cjs --source
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/metrics-app.cjs
NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/api-metrics-smoke.cjs
```

The store tests use an injected clock to verify the exact 30-minute boundary, repeated visits, publication changes, concurrent requests, request replay after the window, and invalid commands. The HTTP smoke starts and stops its own local mock on port 4176 (override with `WCS_METRICS_TEST_PORT`). It verifies true zero counts, strict transport acknowledgments, stale snapshots, CSRF and identity/count spoofing, native read denial, deleted/private records, and unchanged content/audit/attachment revisions. These tests do not replace validation against the deployed production service.
