# WCSpedia document export

The shared document menu offers **PDF document**, **Word document**, and **Markdown file** for the exact version and revision currently displayed. PDF contains selectable text; Word is a genuinely editable `.docx`; Markdown downloads the canonical portable `.md` source. **Copy Markdown** remains a separate clipboard action. JSON is not a document export format. Exporting does not change the online document, its approval status, its revision or its audit trail.

## Document structure

PDF and Word use the same structured content model and document-control fields:

- Approved Citi logo, document title and content type.
- Document reference, business area, owner and author names and SOEIDs.
- Version, revision, status, revision or version-created date, effective date, next scheduled review and export date. Dates use UTC explicitly.
- Reviewer and approver names, SOEIDs and actual dates from the selected version. Missing approvals remain “Not recorded”; an assigned reviewer is never presented as someone who already reviewed the document.
- A link to the online source and a note to verify that downloaded copies are current before use.
- Body content on the following page, including headings, emphasis, underline, strikethrough, ordered and unordered lists, nested lists, tables, images, hyperlinks, code examples, highlights, attachments and topic/process/region tags.
- Document reference, version and page numbers in the footer.

Drafts and older versions are explicitly identified as not the current approved version. Private audit comments, unpublished alternatives and entitlement policy data are not included. The exporter builds a whitelist of public document fields; it never serializes the complete document object or its audit history.

Markdown is the canonical body when present. Legacy section arrays are converted only when Markdown is absent. The same local Markdown parser and media validators used by the editor validate the export. Arbitrary raw HTML is literal text, never executable markup.

Images are embedded into both output formats. Recorded trainings use readable **Watch recording: title** hyperlinks to the validated SharePoint URL, preserving quoted and Unicode titles. Videos and other embedded resources never become iframes in exported documents. File attachments remain links to their Confluence attachment URLs; locally embedded demo files link back to the online document with an explicit “available in the source document” label. They are not silently converted into broken `data:` links or embedded binary Office objects.

Markdown uses the host's existing `WCSEditorContent.toMarkdown(version)` serializer without adding a print cover or changing its content. It includes the title, summary, body, image references, tags, and attachment links supported by that serializer. The filename identifies the selected version and revision. No PDF/Word library or image conversion runs for Markdown; the shared menu, progress, retry, and cancellation behavior apply to all three choices.

## Reusable API

Load the bundled Markdown parser, `editor-content.js`, then `document-export.js`. The shared bundle already includes that order.

```js
const exporter = WCSDocumentExport.create({
  doc,                       // stable document identity and assignments
  version,                   // exact snapshot visible to this user
  people,                    // directory records with id, name, soeid
  sourceUrl: location.href,
  areaLabel: 'Credit Approval Control',
  isCurrentPublished: true,   // computed by the host for the selected snapshot
  revisionAt,                // optional trusted date of this content revision
  config: window.WCS_CONFIG?.exports
});

const { blob, filename, mimeType } = await exporter.prepare('pdf');
// Host checks that this is still the active page, then downloads the Blob.
// Use 'docx' for Word. This Promise rejects if a dependency, image or generation fails.
```

`create()` snapshots the fields and parsed content immediately. Later editor activity cannot alter an export already being prepared. The host remains responsible for the current user's read entitlements and for suppressing a late download after cancellation, navigation or teardown. `prepare` does not create a popup, browser print dialog or download by itself. The shared Citi export popover handles progress, completion and errors.

If no trusted edit timestamp is available, the cover labels `createdAt` as **Version created**, not **Revision date**. This avoids falsely attributing an initial creation date to a later edit.

Mount the shared menu on a container with a `[data-wcs-export]` button. The host supplies the current export snapshot and its canonical Markdown serializer:

```js
const exportUI = WCSDocumentExportUI.mount(root, {
  getDocument: getCurrentExportSnapshot,
  getMarkdown: ({version}, {signal}) => WCSEditorContent.toMarkdown(version),
  notify: toast
});
// Destroy on navigation or teardown to cancel and suppress pending downloads.
exportUI.destroy();
```

`getMarkdown(snapshot, {signal})` may return a string or Promise. It must serialize that exact snapshot, including any metadata the host already adds, rather than fetch a newer draft. Empty output and serializer failures appear in the same retryable error dialog. Cancellation or teardown suppresses late downloads and success notices. An optional `download({blob, filename, mimeType})` callback can replace the default browser download for host integration or tests. The core `WCSDocumentExport.prepare` API remains PDF/Word only.

## Same-origin library attachments

The configured package includes pdfmake 0.2.20, its font VFS, and docx 9.5.1 as versioned attachments. Upload all package attachments to 3962195316 and replace the WCSpedia helper fragment in the existing navBar. The shared loader is lazy: PDF loads pdfmake then its VFS; Word loads only docx. Concurrent requests share one script load, and existing initialized globals are reused. No CDN script fallback is allowed.

```js
exports: {
  allowCDN: false,
  pdfMakeUrl: '/confluence/download/attachments/3962195316/pdfmake-0.2.20.min.js?api=v2',
  pdfFontsUrl: '/confluence/download/attachments/3962195316/pdfmake-0.2.20-vfs-fonts.js?api=v2',
  docxUrl: '/confluence/download/attachments/3962195316/docx-9.5.1.iife.js?api=v2',
  logoUrl: '/confluence/download/attachments/3962195316/citi-logo.png?api=v2'
}
```

All generated application macros already contain these settings. Keep the native Content Security Policy and attachment permissions in place. Export content is processed in the browser; no conversion service receives the document. The source manifest and upstream licenses are in `licenses/` in the delivered package.

## Logo and image handling

`assets/citi-logo.svg` is the original self-contained Citi SVG obtained from the public Citi Wealth page. `assets/citi-logo.png` is its transparent raster fallback. Source provenance is recorded alongside them in `assets/citi-logo-source.txt`. Use the approved SVG for the web when appropriate and the PNG attachment for consistent PDF/Word compatibility. The exported mark is not recreated with a substitute font.

`logoUrl` defaults to `./assets/citi-logo.png`. `logoDataUrl` may contain the embedded PNG in portable single-file previews. The logo URL must be same-origin. A trusted self-contained SVG logo URL is accepted and rasterized, but script, event handlers, external SVG references, foreign objects and CSS are rejected. Prefer the supplied PNG attachment in production.

Content images reuse editor URL/type validation. PNG, JPEG, GIF and WebP are loaded with same-origin credentials where applicable, then converted to PNG. External images require appropriate CORS. Animated images export their browser-decoded static frame. All image bytes are local before generation; downloaded response size is capped at 5 MB and decoded dimensions at 25 megapixels. Export images are proportionally resized to at most 1,800 pixels on the longest side; image aspect ratio is preserved. An inaccessible, unsupported or corrupt image stops export with a visible retryable error, rather than producing an incomplete document.

PDF text remains selectable. Word paragraphs, headings, lists and tables remain editable. Both formats use real table rows with repeated headings; Word keeps ordinary rows together. Very wide, unusually long or complex content may need editorial adjustment for print. Default PDF fonts support the tested Latin-language content; deploy an approved font VFS and adapt the named font mapping before relying on scripts outside that font's coverage.

## Verification

Run the pure regression tests:

```sh
node --test document-export.test.cjs
# With jsdom available through the test environment:
node tests/document-export-ui.cjs
```

Real-generation integration uses the exact browser distributions. Download them to a temporary QA directory, without modifying the runtime or adding CDN files to the application bundle:

```sh
mkdir -p /tmp/wcs-export-deps
curl -fLsS https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/pdfmake.min.js -o /tmp/wcs-export-deps/pdfmake.cjs
curl -fLsS https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/vfs_fonts.js -o /tmp/wcs-export-deps/vfs_fonts.cjs
curl -fLsS https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js -o /tmp/wcs-export-deps/docx.iife.js
WCS_EXPORT_DEPS=/tmp/wcs-export-deps node tests/export-generation.cjs /tmp/wcspedia-export-qa
python3 tests/export-inspect.py /tmp/wcspedia-export-qa
```

In this Codex workspace use the Node/Python binaries returned by `load_workspace_dependencies`. Render both DOCX files with the documents skill's `render_docx.py`, which resolves bundled LibreOffice at `/Users/bobrahmatov/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice`, and render PDFs with the bundled Poppler `pdftoppm`. Do not use the user's desktop LibreOffice. Inspect every generated page for wrapping, table continuation, clipping, image scaling and footer placement.

Primary library documentation: [pdfmake browser setup](https://pdfmake.github.io/docs/0.1/getting-started/client-side/), [table pagination](https://pdfmake.github.io/docs/0.1/document-definition-object/tables/), [PDF generation methods](https://pdfmake.github.io/docs/0.1/getting-started/client-side/methods/), [docx library](https://docx.js.org/) and its [official source repository](https://github.com/dolanmiu/docx).
