"""Organize the verified configured deployment into the Git-tracked ready folder."""
from pathlib import Path, PurePosixPath
import hashlib
import json

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'confluence-ready'
DEST = ROOT / 'ready'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    profile = json.loads((ROOT / 'confluence-installation.json').read_text())
    entries = {}
    for line in (SOURCE / 'SHA256SUMS.txt').read_text().splitlines():
        digest, name = line.split('  ', 1)
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or name in entries:
            raise SystemExit('Invalid configured manifest path')
        data = (SOURCE / name).read_bytes()
        if sha(data) != digest:
            raise SystemExit('Configured checksum mismatch: ' + name)
        entries[name] = data
    actual = {p.relative_to(SOURCE).as_posix() for p in SOURCE.rglob('*') if p.is_file()}
    if actual != set(entries) | {'SHA256SUMS.txt'}:
        raise SystemExit('Configured files do not match their manifest')

    page_names = {
        'landing': ('Landing', profile['pageIds']['home']),
        'my-workspace': ('My Workspace', profile['pageIds']['mine']),
        'reviewer-workspace': ('Reviewer Workspace', profile['pageIds']['review']),
        'saved-items': ('Saved', profile['pageIds']['saved']),
        'entitlements': ('Entitlements', profile['pageIds']['entitlements']),
        'faq': ('FAQ', profile['pageIds']['faq']),
        'insights': ('Insights / Blogs', profile['insightsPageId']),
    }
    extras = {
        'wcspedia-navbar.html': 'shared/navbar.html',
        'wcspedia-insights-header-link.html': 'optional/insights-header-link.html',
        'wcspedia-reader-sidebar.html': 'optional/existing-article-sidebar.html',
        'wcspedia-page-style-flags-marker.html': 'optional/existing-article-style-flags.html',
    }
    output = {}
    mapping = {}
    for name, data in entries.items():
        if name.startswith('html/areas/'):
            target = name.replace('html/areas/', 'pages/business-areas/', 1)
        elif name.startswith('html/'):
            filename = PurePosixPath(name).name
            if filename in extras:
                target = extras[filename]
            else:
                slug = filename.removeprefix('wcspedia-').removesuffix('.html')
                if slug not in page_names:
                    raise SystemExit('Unknown page macro: ' + filename)
                target = 'pages/' + slug + '.html'
        elif name.startswith('initial-json/'):
            target = name.replace('initial-json/', 'first-install-only/', 1)
        elif name == 'README.md':
            target = 'docs/original-package-notes.md'
        else:
            target = name
        if target in output:
            raise SystemExit('Duplicate deployment path: ' + target)
        output[target] = data
        mapping[target] = {'source': name, 'sha256': sha(data)}
    rows = [f'| {title} | `{page_id}` | [pages/{slug}.html](pages/{slug}.html) |'
            for slug, (title, page_id) in page_names.items()]
    rows += [f'| {slug.replace("-", " ").title()} | `{page_id}` | [pages/business-areas/{slug}.html](pages/business-areas/{slug}.html) |'
             for slug, page_id in profile['areaPageIds'].items()]
    readme = f'''# Ready to install

These files are the configured WCSpedia deployment, copied byte-for-byte from the verified package. Use this folder for installation; source code stays at the repository root.

## 1. Upload attachments

Upload **all files inside [attachments/](attachments/)** to Confluence attachment page **{profile['attachmentPageId']}**, replacing matching filenames. Keep their filenames unchanged and upload them together. This includes the shared CSS, JavaScript, export/chart libraries, and 50 cover images. Do not upload this README, page HTML files or a ZIP as runtime attachments.

## 2. Replace page HTML macros

Open each existing Confluence page below, edit its application **HTML macro**, and replace the macro contents with the complete matching file. Publish the page. Uploading an HTML file as an attachment does not replace the macro. Each macro already contains its settings and matching script URLs; do not paste multiple page macros into one page.

| Page | Existing page ID | Macro contents |
| --- | --- | --- |
{chr(10).join(rows)}

## 3. Update the shared header helper

Use **[shared/navbar.html](shared/navbar.html)** in the existing **navBar** HTML macro, replacing only the previous WCSpedia helper fragment. Preserve the branded navigation and the existing `{{include:wcspedia:navBar}}` include. Do not add a second header or put a page application macro here. The supplied helper loads the shared WCSpedia stylesheet; retain the existing Citi Look and Feel theme.

## 4. Keep live data and refresh

**Keep the live entitlements.json and existing document data unchanged.** [first-install-only/](first-install-only/) contains starter files for a new installation, not an update. Working-root **{profile['workingRootPageId']}** remains a protected workflow storage page; it does not receive an application macro.

Close old WCSpedia tabs and hard-refresh. For the failed Job aid publication, use **Check save / retry** on the existing document in Reviewer Workspace. Do not recreate it.

## Folder guide

- **attachments/** — all runtime files to upload to the one attachment page.
- **pages/** — seven application macros; **pages/business-areas/** contains eight filtered Explore macros.
- **shared/** — helper fragment for the existing navBar.
- **optional/** — existing-article compatibility helpers and an optional Insights header link. New publications already include the article sidebar; do not paste these into all pages or duplicate an existing header link.
- **first-install-only/** — starter JSON; skip for this existing installation.
- **templates/** — document examples and reference setup guides; not bulk-upload runtime files.
- **licenses/** — bundled library licenses and image/library source records.
- **docs/original-package-notes.md** — full release history using the original ZIP folder names (`html/`, `initial-json/`). Use the table above for this organized folder.
- **file-map.json** and **SHA256SUMS.txt** — original package mapping and integrity hashes.

## Rebuild after source changes

Run from the repository root:

```sh
node build-confluence-upload.cjs
python3 package-upload-ready.py
python3 package-configured-upload.py
python3 prepare-ready.py
```

Commit the refreshed ready folder alongside the source change. The preparation script verifies the configured package checksums before copying any files. Packaging validation does not confirm live Confluence permissions or server behavior.
'''
    output['README.md'] = readme.encode()
    output['file-map.json'] = (json.dumps(mapping, indent=2, sort_keys=True) + '\n').encode()
    output['SHA256SUMS.txt'] = ''.join(f'{sha(data)}  {name}\n' for name, data in sorted(output.items())).encode()
    existing = {p.relative_to(DEST).as_posix() for p in DEST.rglob('*') if p.is_file()} if DEST.exists() else set()
    if existing - set(output):
        raise SystemExit('Unexpected files in ready/; review before rebuilding: ' + ', '.join(sorted(existing - set(output))))
    for name, data in output.items():
        target = DEST / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    print(f'Prepared {len(output)} verified files in {DEST}')


if __name__ == '__main__':
    main()
