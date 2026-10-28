"""Package optional trusted server source separately from Confluence attachments."""
from pathlib import Path
import hashlib
import zipfile

root = Path(__file__).resolve().parent
names = ['article-feedback-service.cjs', 'article-feedback-http.cjs',
         'article-feedback.test.cjs', 'article-feedback-service.md',
         'article-feedback-analytics.example.json', 'article-analytics.cjs',
         'article-analytics.test.cjs', 'article-analytics.md',
         'templates/wcspedia-analytics.json']
files = {name: (root / name).read_bytes() for name in names}
files['README.md'] = b'''# Optional WCSpedia feedback server source

This ZIP is for a trusted Node service host, not Confluence attachments.
Use article-feedback-service.md for authenticated helpfulness voting and
authorized aggregate exports. The service must independently enforce the
current Confluence identity, native permissions and report-export rights.
Set insightsPageId to the configured Insights parent alongside areaPageIds.

The WCSpedia manual Download analytics JSON action reads native comment
metadata directly and does not require this server package. Leave helpfulness
unavailable until a trusted feedback endpoint is actually deployed.

article-analytics.cjs is an optional server-side snapshot publisher, separate
from the manual download. It runs only if the host explicitly calls publish().
No scheduler, credentials, authentication middleware or deployment is included.

Run: node --test article-feedback.test.cjs article-analytics.test.cjs
'''
files['SHA256SUMS.txt'] = ''.join(
    hashlib.sha256(data).hexdigest() + '  ' + name + '\n'
    for name, data in sorted(files.items())).encode()
target = root / 'WCSpedia-feedback-server-source.zip'
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name, data in files.items():
        archive.writestr('wcspedia-feedback-server/' + name, data)
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    for name, data in files.items():
        assert archive.read('wcspedia-feedback-server/' + name) == data
target.with_suffix('.zip.sha256').write_text(
    hashlib.sha256(target.read_bytes()).hexdigest() + '  ' + target.name + '\n')
print(f'Verified {len(files)} optional server-source files: {target}')
