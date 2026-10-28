"""Verify and zip the generated, independent-page Confluence upload kit."""
from pathlib import Path
import hashlib
import zipfile

ATTACHMENT_MAX_BYTES = 10_000_000

root = Path(__file__).resolve().parent
source = root / 'confluence-upload'
target = root / 'WCSpedia-confluence-upload.zip'
files = sorted(file for file in source.rglob('*') if file.is_file())
for file in files:
    name = file.relative_to(source).as_posix()
    if name.split('/')[0] in {'attachments', 'initial-data', 'initial-json'} and file.stat().st_size > ATTACHMENT_MAX_BYTES:
        raise SystemExit(f'Confluence attachment exceeds the 10 MB (10,000,000 bytes) per-file limit: {name}. Reduce this file; the ZIP total is not the limit.')
manifest = {}
for line in (source / 'SHA256SUMS.txt').read_text().splitlines():
    digest, name = line.split('  ', 1)
    manifest[name] = digest
expected = {file.relative_to(source).as_posix() for file in files if file.name != 'SHA256SUMS.txt'}
if set(manifest) != expected:
    raise SystemExit('Upload manifest does not match the current files; rebuild first.')
for name, digest in manifest.items():
    if hashlib.sha256((source / name).read_bytes()).hexdigest() != digest:
        raise SystemExit('Upload checksum mismatch: ' + name)
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        archive.write(file, 'confluence-upload/' + file.relative_to(source).as_posix())
with zipfile.ZipFile(target) as archive:
    if archive.testzip() is not None:
        raise SystemExit('Upload ZIP verification failed.')
    for file in files:
        if archive.read('confluence-upload/' + file.relative_to(source).as_posix()) != file.read_bytes():
            raise SystemExit('Upload ZIP content mismatch: ' + file.name)
print(f'Packaged and verified {len(files)} upload files: {target.name}')
