"""Build the clean runtime-only upload ZIP from verified generated assets."""
from pathlib import Path
import hashlib
import json
import zipfile

ATTACHMENT_MAX_BYTES = 10_000_000

root = Path(__file__).resolve().parent
kit = root / 'confluence-upload'
starters = root / 'confluence-data-starters'
target = root / 'WCSpedia-upload-ready.zip'

def verify_manifest(folder):
    expected = {}
    for line in (folder / 'SHA256SUMS.txt').read_text().splitlines():
        digest, name = line.split('  ', 1)
        expected[name] = digest
    actual = {p.relative_to(folder).as_posix() for p in folder.rglob('*')
              if p.is_file() and p.name != 'SHA256SUMS.txt'}
    if set(expected) != actual:
        raise SystemExit(f'Stale manifest: {folder.name}')
    for name, digest in expected.items():
        if hashlib.sha256((folder / name).read_bytes()).hexdigest() != digest:
            raise SystemExit(f'Checksum mismatch: {folder.name}/{name}')

verify_manifest(kit)
verify_manifest(starters)
files = {'README.md': (root / 'UPLOAD-READY.md').read_bytes()}
for folder in ('attachments', 'html', 'templates', 'licenses'):
    for source in sorted((kit / folder).rglob('*')):
        if not source.is_file() or source.name == 'wcspedia-published.json':
            continue
        files[source.relative_to(kit).as_posix()] = source.read_bytes()
# One installable navbar fragment; do not ship overlapping alternatives.
header_parts = [
    'wcspedia-file-drop-guard-header.html', 'wcspedia-library-header.html',
    'wcspedia-global-styles.html', 'wcspedia-typography-header.html', 'wcspedia-loading-header.html', 'wcspedia-notifications-header.html',
    'wcspedia-header-widget.html', 'wcspedia-page-style-flags-header.html',
    'wcspedia-article-discussion-header.html',
]
navbar = ['<!-- Install ONCE in the right-hand action area of the EXISTING navBar. Replace old WCSpedia header fragments; preserve your navigation and fonts. -->']
for name in header_parts:
    source = files.pop('html/' + name).decode()
    navbar.append('<!-- WCSpedia component: ' + name + ' -->\n' + source)
    if name == 'wcspedia-global-styles.html':
        navbar.append("""<script>
(function () {
  // Collapse only links to this exact attachment, including older cache suffixes.
  var links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).filter(function (link) {
    var url = new URL(link.href, location.href);
    return url.origin === location.origin && url.pathname === '/confluence/download/attachments/REPLACE_WITH_ATTACHMENTS_PAGE_ID/wcspedia-style.css';
  });
  if (links.length) {
    links[0].href = '/confluence/download/attachments/REPLACE_WITH_ATTACHMENTS_PAGE_ID/wcspedia-style.css?api=v2';
    links.slice(1).forEach(function (link) { link.remove(); });
  }
})();
</script>""")
files['html/wcspedia-navbar.html'] = ('\n'.join(navbar) + '\n').encode()
for name in ('entitlements.json', 'wcspedia-published.json'):
    data = (starters / name).read_bytes()
    json.loads(data)
    if b'BR47149' not in data:
        raise SystemExit(f'Missing initial administrator: {name}')
    files['initial-json/' + name] = data

if any(Path(name).suffix not in {'.md', '.js', '.css', '.html', '.json', '.mdx', '.yaml', '.png', '.jpg', '.txt'}
       for name in files):
    raise SystemExit('Unexpected file type in upload package')
if files['attachments/wcspedia-document.mdx'] != files['templates/wcspedia-document.mdx']:
    raise SystemExit('MDX template copies differ')
for name, data in files.items():
    if name.split('/')[0] in {'attachments', 'initial-json'} and len(data) > ATTACHMENT_MAX_BYTES:
        raise SystemExit(f'Confluence attachment exceeds the 10 MB (10,000,000 bytes) per-file limit: {name}. Reduce this file; the ZIP total is not the limit.')
files['SHA256SUMS.txt'] = ''.join(
    f'{hashlib.sha256(data).hexdigest()}  {name}\n'
    for name, data in sorted(files.items())
).encode()
prefix = 'wcspedia-upload/'
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name, data in sorted(files.items()):
        archive.writestr(prefix + name, data)
with zipfile.ZipFile(target) as archive:
    if archive.testzip() is not None or set(archive.namelist()) != {prefix + name for name in files}:
        raise SystemExit('Upload archive integrity check failed')
    for name, data in files.items():
        if archive.read(prefix + name) != data:
            raise SystemExit('Archive content mismatch: ' + name)
digest = hashlib.sha256(target.read_bytes()).hexdigest()
target.with_suffix('.zip.sha256').write_text(f'{digest}  {target.name}\n')
print(f'Verified {len(files)} files; {target.stat().st_size / 1_000_000:.1f} MB; {target}')
for folder in ('attachments', 'html', 'initial-json', 'templates', 'licenses'):
    print(f'{folder}/: {sum(name.startswith(folder + "/") for name in files)} files')
