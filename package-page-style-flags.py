"""Package the separate shared-header flags helper from the verified upload kit."""
from pathlib import Path
import hashlib
import zipfile

root = Path(__file__).resolve().parent
source = root / 'confluence-upload'
output = root / 'confluence-page-style-flags'
target = root / 'WCSpedia-page-style-flags.zip'
mapping = {
    'attachments/wcspedia-page-style-flags.js': 'wcspedia-page-style-flags.js',
    'html/wcspedia-page-style-flags-header.html': 'wcspedia-page-style-flags-header.html',
    'html/wcspedia-page-style-flags-marker.html': 'wcspedia-page-style-flags-marker.html',
    'docs/PAGE-STYLE-FLAGS.md': 'README.md',
}
manifest = dict(line.split('  ',1)[::-1] for line in (source/'SHA256SUMS.txt').read_text().splitlines())
contents = {}
for original,name in mapping.items():
    content=(source/original).read_bytes()
    if hashlib.sha256(content).hexdigest()!=manifest.get(original):
        raise SystemExit('Rebuild the upload kit; checksum mismatch: '+original)
    contents[name]=content
contents['SHA256SUMS.txt']=''.join(hashlib.sha256(content).hexdigest()+'  '+name+'\n' for name,content in sorted(contents.items())).encode()
output.mkdir(exist_ok=True)
for name,content in contents.items():
    (output/name).write_bytes(content)
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED) as archive:
    for name in contents:
        archive.write(output/name,'confluence-page-style-flags/'+name)
with zipfile.ZipFile(target) as archive:
    if archive.testzip() is not None:
        raise SystemExit('Page-style flags ZIP verification failed.')
    for name,content in contents.items():
        if archive.read('confluence-page-style-flags/'+name)!=content:
            raise SystemExit('Page-style flags ZIP byte mismatch: '+name)
print(f'Packaged and verified {len(contents)} page-style flags files: {target.name}')
