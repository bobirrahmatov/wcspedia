# Paste Markdown / MDX and preserve original dates

Use [the complete document template](templates/wcspedia-document.mdx) for one document per file. It includes a table, a code block, and fenced examples for images, files, SharePoint video, and linked resources. The example URLs stay inside code fences so opening the template does not load them. [The metadata block](templates/wcspedia-metadata.yaml) can also be copied to the beginning of an existing Markdown-compatible MDX file. Replace the placeholder values before importing; choose the correct business area and content type.

This format imports metadata and Markdown content into the existing WCSpedia editor. It does not change the page design. It preserves original source dates separately from the timestamps that Confluence and the WCSpedia workflow record when a draft is saved or published.

The **Download MDX template** action uses `wcspedia-document.mdx` hosted on the page configured as `attachmentPageId`. Upload `confluence-upload/attachments/wcspedia-document.mdx` with the other shared assets. The source template is also included at `templates/wcspedia-document.mdx` in the project. See **Hosting the template** below for the attachment URL and deployment steps.

## Metadata contract

The file starts with `---` on its own line, then the flat metadata fields, then a closing `---`. Put document content below the closing line. Names are case-sensitive. Use the exact `format` value below so the importer can identify this contract.

```yaml
---
format: "wcspedia-mdx-v1"
title: "Document title"
summary: "A concise description of the document and when to use it."
type: "Guide"
area: "credit-approval-control"
sourceId: "your-catalogue-stable-document-id"
originalCreatedAt: null
originalUpdatedAt: null
tags: ["Topic one", "Topic two"]
processes: ["Process name"]
regions: ["Global"]
---
```

| Field | Required | Meaning |
| --- | --- | --- |
| `format` | Yes | Exactly `"wcspedia-mdx-v1"`. |
| `title` | Yes | Human-readable document title, up to 160 characters. |
| `summary` | Yes | Short excerpt, up to 1,000 characters. |
| `type` | Yes | One of the current content type names listed below. |
| `area` | Yes | One of the eight business area IDs listed below, not a page ID or display name. |
| `sourceId` | Yes | Stable identifier from the source catalogue, up to 160 characters. Keep it unchanged when revising the same document. Give different documents different identifiers. |
| `originalCreatedAt` | No | Known original creation date, or `null` when unavailable. |
| `originalUpdatedAt` | No | Known original modification date, or `null` when unavailable. |
| `sourceAuthor` | No | Original author attribution as a string, up to 200 characters. Omit when unknown. This does not set the Confluence creator, current owner, reviewer, or approver. |
| `sourcePath` | No | Original file path or source reference as a string, up to 500 characters. Omit when unknown. This is provenance, not an asset upload instruction. |
| `tags` | No | JSON inline array of up to 30 topic strings; use `[]` when empty. |
| `processes` | No | JSON inline array of up to 20 process strings; use `[]` when empty. |
| `regions` | No | JSON inline array of up to 20 region or market strings; use `[]` when empty. |

Use JSON-style double-quoted strings for predictable escaping. The parser accepts a constrained flat metadata format, not the full YAML language: no nested objects, multiline values, anchors, aliases, expressions, or YAML block arrays. Keep arrays on one line, for example `tags: ["Collateral", "Controls"]`. Do not add unrecognized metadata keys. Plain Markdown without this metadata block still uses the ordinary paste flow.

Each tag, process, or region must be nonempty text of at most 80 characters. The complete metadata block must fit within 16,000 characters.

For an optional author or source path, insert fields such as:

```yaml
sourceAuthor: "Name recorded in the source"
sourcePath: "legacy/credit-approval-control/document-name.mdx"
```

Do not include `sourceImportedAt`, native page IDs, workflow timestamps, review status, approval decisions, or user permissions in the metadata block. The workflow assigns the import timestamp from its trusted server clock; pasted metadata does not establish approval or publish content.

### Date values

Use a real date supported by the source. The following are format examples, not dates to copy into documents:

```yaml
originalCreatedAt: "2021-04-08"
originalUpdatedAt: "2024-06-12T14:30:00+02:00"
```

- `YYYY-MM-DD` preserves date-only precision when the source records no time.
- A timestamp must include its timezone, such as `2024-06-12T12:30:00Z` or `2024-06-12T14:30:00+02:00`.
- Use `null`, or omit the field, when a date is not recorded. Do not substitute today's date, the file-copy timestamp, or an inferred date.
- If the source uses an ambiguous date such as `04/05/2021`, establish the original convention before converting it. Do not guess the day and month or the timezone.
- Original modification must not precede original creation when both are known. Resolve contradictory source records before importing.

### Business areas

| `area` value | Business area |
| --- | --- |
| `credit-approval-control` | Credit Approval Control |
| `credit-information-management` | Credit Information Management |
| `credit-management-reporting` | Credit Management Reporting |
| `deal-closing` | Deal Closing |
| `documentation-pledging` | Documentation & Pledging Team |
| `emea-credit-admin` | EMEA Credit Admin |
| `loan-management` | Loan Management |
| `regional-operating-manuals` | Regional Operating Manuals |

The deployment's `areaPageIds` settings map these IDs to Confluence business-area parent pages. The MDX file does not contain or create those mappings.

### Content types

For a new document, use the exact spelling of one configured type:

`Job aid`, `Guide`, `Blog`, `Training`, `Report`.

The interface calls these Job aids, Guides, Blogs, Training and Reports. Keep the exact stored type above in MDX. New imports map Procedure/Playbook/Checklist to Guide, Knowledge sharing to Training, and Reference/Template/FAQ to Report. Existing documents retain their original type when edited. General WCSpedia FAQs now live below the landing page’s latest articles.

Only Job aids require a business area, reviewer and approver. Every other supported type publishes directly under Insights; use `area: "insights"` for these files. Import normalizes legacy non-Job-aid area values to Insights. The type does not confer formal policy authority.

If an administrator changes the active taxonomy, the editor's current allowed values apply. Importing into an existing document does not bypass its business-area or content-type restrictions.

## Write portable content

Use ordinary Markdown headings, paragraphs, lists, blockquotes, tables, fenced code blocks, and links. Start the body at `##` because the metadata supplies the document title.

This importer supports Markdown-compatible MDX and the two WCSpedia media tokens below. It does not run MDX modules or compile React components. Convert custom MDX components into supported Markdown before pasting. Do not include JSX, `import` or `export` statements, JavaScript expressions in braces, raw iframe markup, or executable code outside fenced examples. Code examples belong in fenced code blocks or inline code.

### Supported rendering

| Content in the MDX body | WCSpedia editor and reader | Published native Confluence page |
| --- | --- | --- |
| Markdown headings, text, lists, blockquotes, and links | Formatted content | Native storage content |
| Markdown tables | HTML tables | Native storage tables |
| Inline code and fenced code blocks | Escaped code text; never executed | Inline code or a Confluence Code macro; never executed |
| Markdown raster image | Inline image using its uploaded resource or reachable URL | Image referencing a staged attachment on the document page |
| Supporting uploaded file | Versioned attachment and optional inline link | Attachment link on the document page |
| `@[video](URL "Title")` with a valid SharePoint recording URL | Recording card; a validated SharePoint embed URL additionally displays a player | A **Watch recording** link to SharePoint |
| `@[embed](https://...)` | Linked resource card | An **Open linked resource** link |
| JSX, MDX modules, JavaScript expressions, or arbitrary iframe HTML | Unsupported for import; convert to the supported forms | Not executed or published as an iframe |

The native publication renderer deliberately creates recording/resource links rather than copying a browser iframe into Confluence storage. SharePoint permissions, sign-in, browser policy, and the hosting site's frame restrictions can still affect whether a valid player loads inside the WCSpedia reader.

### Images, files, and attachment ownership

Use the editor's **Image** and **Add files** controls for document resources. PNG, JPEG, GIF, and WebP images are supported. Image bytes are limited to 1 MB per image; supported files are limited to 5 MB each. A version can have up to 20 inline images and 20 supporting files. Embedded raster data URLs in portable content are extracted into versioned image records when imported.

A reachable HTTPS image URL may display in the WCSpedia reader, but it is not an automatic native-publication upload. The trusted publisher requires validated uploaded bytes or an existing trusted staging map; it does not fetch arbitrary external image/file URLs. Upload the file through the editor or have the migration service stage its bytes before publication. Ordinary hyperlinks to existing documents remain links and do not copy those documents.

Confluence attachments belong to a **page ID**. There is no space-wide attachment bucket. The configured `attachmentPageId` hosts shared JavaScript, CSS, logos, and the MDX template. The native publisher stages document-specific images/files on that document's managed working or published page and references them from its native body. These are separate from the shared application-assets page.

Editing the same document can retain its existing recorded assets and trusted staging mappings. Copying MDX to a different document does not transfer attachment ownership or establish a trusted mapping for that destination. Upload or stage the resources for the new document instead of assuming that an attachment ID or another page's URL will be adopted automatically.

Pasting `![Diagram](./diagram.png)` does not upload `diagram.png` from the source folder. A `sourcePath` does not make relative assets available. Do not invent `attachment:` IDs; the editor generates them for its recorded resources. Internal links must point to destinations the intended readers can access. If a linked destination is also being migrated, record its new Confluence URL and update the link after that page exists. Review rendered images, links, tables, and code before saving.

### Video and other resources

The supported video token uses a real SharePoint Online recording URL and a JSON-quoted title:

```markdown
@[video](https://your-tenant.sharepoint.com/sites/Training/Shared%20Documents/recording.mp4 "Recording title")
```

Replace that example tenant and path. The Video control accepts a SharePoint share link or provider embed code and produces the supported token. For an in-reader player, copy the recording's Share → Embed code into that control: it extracts and validates the SharePoint `/_layouts/15/embed.aspx` URL with its `UniqueId`, then generates its own player. Do not paste raw iframe HTML into the MDX body. A non-embed share URL remains a recording card, and a generic iframe or another video host is not supported by this token.

For another HTTPS resource, use a link or the following card token:

```markdown
@[embed](https://resources.example/training)
```

Replace the example URL with the actual resource. This creates a link card, not an iframe, and does not import the external resource's content.

## Import and verify

1. Download the template from a document’s **Download → Download MDX template** menu, or use the supplied template file for your first document. Fill it using verified source material and remove unused instructional examples. Create a new WCSpedia document in the intended business area, or open the existing document for editing. Choose **Paste MDX / Markdown**.
2. Paste the complete file, including the metadata block. Review the extracted title, summary, type, area, source ID, source dates, and discovery tags before applying it. For a complete document, choose replacement of document content rather than insertion into an unrelated body.
3. Correct any invalid or unsupported values in the source. An existing document must retain its source ID; pasting another source document is not a way to replace its identity. Existing area/type restrictions still apply.
4. Check the imported body and supporting assets. Confirm the original dates against the source rather than the current machine's file timestamps.
5. Save with a meaningful change summary. Job aids continue through review and approval; all other types use Publish to Insights. Check the resulting native page and its preserved metadata after publication.

`sourceId` is provenance. Paste import is not a bulk migration service and does not automatically find or update Confluence pages by this value. The trusted workflow rejects duplicate source IDs already recorded in the same WCSpedia library; it does not discover duplicates outside that registry. Keep a migration register mapping each source ID to its WCSpedia document and published Confluence page ID. For later revisions, open that existing document and retain its source ID. Do not repeatedly use Create content for the same source.

## Updating the installation

Replace the matching logic and HTMLPage JS attachments for the five application pages using the canonical upload kit, and update their script cache revisions in your configured HTML macros. Keep your real page IDs, endpoints, header, fonts and existing global CSS. This change does not require a CSS update.

The trusted service deployment must also include the current `editor-content.js`, `workflow.js`, `confluence.js`, `publication-workflow.cjs`, `confluence-storage.cjs`, and `confluence-projection.cjs`, with their existing dependencies. Uploading the browser files does not deploy these server modules. Deploy and verify the service and browser changes together before importing the first document. Source metadata is kept in the governed document snapshot and rendered into the native page metadata table; it is not a new JSON attachment per document. No new source-date CQL index is installed.

### Hosting the template

1. Upload the file named exactly `wcspedia-document.mdx` from `confluence-upload/attachments/` to the existing shared attachments page.
2. Preserve that page's numeric ID as `attachmentPageId` in each configured page macro. The space key and WCSpedia landing-page ID are separate settings.
3. Deploy the matching updated JavaScript pair and cache revisions for each application page. Generated configuration sets `exports.mdxTemplateUrl`; the fallback for older macro settings uses `attachmentPageId`. The template URL resolves through the configured Confluence context path to `/download/attachments/ATTACHMENT_PAGE_ID/wcspedia-document.mdx`.
4. Choose **Download MDX template** while signed in as an intended author. Confirm that the template is reachable and that the shared attachments page's permissions allow that user to read it. The template must fit within the 128 KB download limit.

For a local preview, serve the project over HTTP (for example with a local development server). Browsers do not fetch this template from a standalone `file://` preview. The hosted Confluence page downloads its attachment normally.

The MDX template is a downloadable authoring file, not an executable script or a Confluence HTML macro. Updating the local source file does not update the hosted attachment; upload the new attachment version when the template changes. Its presence on the assets page does not create any document pages.

### Downloading an existing document as MDX

Use the document's **Download → MDX file** option for a WCSpedia-format copy of the selected revision. The export carries the `wcspedia-mdx-v1` metadata block and document content, keeping supported video/resource tokens. Recorded media references are resolved to their portable source URLs or embedded data; the exporter uses the current page's base URL to resolve relative resource URLs. Cover imagery, key highlights, and supporting files not already linked in the body are projected into body content so the export includes those resources.

This is an authoring interchange file, not a complete editor-state backup. Reimporting projected cover/highlights/file sections keeps them in the body rather than restoring all their original editor controls. Hosted media URLs still require access and an unchanged resource; a URL-based MDX file is not an offline archive of all media. Review the import preview and resource staging before saving or publishing.

If a document has no recorded source provenance, the exporter creates a stable `sourceId` using `wcspedia:` followed by its document key and leaves the original dates unknown (`null`). It never invents historical dates from the import date. Existing source provenance is retained.

The MDX export does not export review decisions, approval state, native Confluence history, or permissions. Downloading or reimporting a document does not approve a draft. Retain the stable source ID when revising the same source. **Copy Markdown** and **Markdown file** remain readable exports with the title, excerpt, and governance description; use **MDX file** when the WCSpedia metadata/media-token format is needed.

## Original dates and native Confluence history

Original source creation and modification dates are visible in provenance details and remain separate from the import timestamp and Confluence's own history. Normal publication creates or updates native content using Confluence's current lifecycle; it does not backdate native timestamps or rewrite historical authorship.

The native REST response exposes creation through `history.createdDate` and latest version time through `version.when`, for example with `GET /confluence/rest/api/content/PAGE_ID?expand=history,version`. These fields are not treated as writable date inputs by this feature. See the [Confluence Server REST reference](https://docs.atlassian.com/ConfluenceServer/rest/7.18.3/).

The existing **Updated year** search filter still uses native CQL `lastmodified`. An old source document newly imported this year therefore belongs to this year's native update results. Preserving an original source date does not change Confluence's search index or add source-date filtering. See [Atlassian's CQL field reference](https://developer.atlassian.com/server/confluence/cql-field-reference/).

## Prompt for an agent generating future documents

Copy this prompt along with the source document and its verified metadata:

```text
Produce one WCSpedia document per file using the wcspedia-mdx-v1 contract.
Return the complete file content, beginning with a flat metadata block
delimited by --- on separate lines, followed by Markdown-compatible content.
Do not wrap the whole file in a Markdown code fence.

Required fields, with these exact names:
format: "wcspedia-mdx-v1"
title: a nonempty title of at most 160 characters
summary: a nonempty concise excerpt of at most 1000 characters
type: one exact allowed content type below
area: one exact allowed business area ID below
sourceId: the supplied stable source identifier, at most 160 characters

Optional fields:
originalCreatedAt: verified YYYY-MM-DD or ISO timestamp with timezone, else null
originalUpdatedAt: verified YYYY-MM-DD or ISO timestamp with timezone, else null
sourceAuthor: original author string, at most 200 characters, only if known
sourcePath: original path/reference string, at most 500 characters, only if known
tags: JSON inline array of up to 30 strings, or []
processes: JSON inline array of up to 20 strings, or []
regions: JSON inline array of up to 20 strings, or []

Keep each array item nonempty and at most 80 characters. Keep the complete
metadata block within 16000 characters.

Use JSON double-quoted strings and one-line JSON arrays. Do not use nested
YAML, multiline values, block arrays, anchors, aliases, or extra fields.
Do not invent missing dates, timezone offsets, authors, policy statements,
approval decisions, or evidence. Preserve supplied date precision. Resolve
ambiguous dates with the source owner. Use null for unknown original dates.
Do not supply sourceImportedAt, native page IDs, permissions, or review status.

Allowed business area IDs:
credit-approval-control
credit-information-management
credit-management-reporting
deal-closing
documentation-pledging
emea-credit-admin
loan-management
regional-operating-manuals

Allowed content types for new documents:
Job aid, Guide, Blog, Training, Report.

Only Job aid uses one of the business area IDs above and requires review
and approval. For every other content type, set area to "insights". Metadata
does not confer formal policy authority or record a review/approval decision.

Use the assigned sourceId unchanged for every future revision of this same
document. Ask for a missing identifier instead of inventing a new identity
on each run. Select the business area and type from the supplied assignment.

Start the content with ## headings; the metadata supplies the page title.
Use standard Markdown paragraphs, lists, tables, blockquotes, links, and
fenced code examples. Convert MDX components into appropriate Markdown.
Do not output JSX, import/export statements, or executable brace expressions.
Keep actual code only inside fenced code blocks or inline code. Use Markdown
tables for tabular data. Do not include arbitrary iframe markup.

Use the editor-generated @[video](URL "Title") token only for a verified
SharePoint recording. Use @[embed](https://...) for a linked resource card;
this does not embed an iframe. Published native pages show links for both.
Do not invent a tenant, recording ID, or media URL.

Use verified reachable asset/link URLs or uploaded resources. Relative local
files are not uploaded by paste. Native publication also requires document
images/files to have validated uploaded bytes or trusted attachment staging;
an external image URL alone is not a native upload. Report unresolved
asset/link mappings separately from the document. Keep placeholder media
examples fenced until they have been replaced with real reviewed resources.
Preserve source meaning and make unsupported or missing information explicit.
```

Use [the document template](templates/wcspedia-document.mdx) as the structural starting point. Remove sections that do not apply instead of inventing content to fill them.

## Blog discussion setting

Include `commentsEnabled: true` (default) or `commentsEnabled: false` in the frontmatter. Use an actual boolean, not a quoted string. The Insights editor exposes this setting under Article comments. Saving preserves it in the version; it takes effect on the native article after approval/publication. Existing native comments are retained when disabled. This controls the WCSpedia discussion and does not change Confluence permissions.
