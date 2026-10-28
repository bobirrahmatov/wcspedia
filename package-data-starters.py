"""Package existing first-install data without regenerating or replacing user edits."""
from pathlib import Path
import hashlib
import zipfile

root = Path(__file__).resolve().parent
source = root / 'confluence-data-starters'
target = root / 'WCSpedia-data-starters.zip'
required = {
    'initial-users.json', 'entitlements.json',
    'wcspedia-workflow-initial.json', 'wcspedia-published.json', 'README.md',
    'reference/content-health-defaults.json',
}
# Older generated folders may still contain this retired reference. Never
# distribute it as a live policy option or delete an existing user's export.
excluded = {'SHA256SUMS.txt', 'entitlements-table.html'}
files = sorted(file for file in source.rglob('*') if file.is_file() and file.name not in excluded)
names = {file.relative_to(source).as_posix() for file in files}
if not required <= names:
    raise SystemExit('Missing starter files: ' + ', '.join(sorted(required - names)))
manifest = source / 'SHA256SUMS.txt'
manifest.write_text(''.join(hashlib.sha256(file.read_bytes()).hexdigest() + '  ' + file.relative_to(source).as_posix() + '\n' for file in files))
manifest.chmod(0o600)
files.append(manifest)
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        archive.write(file, 'confluence-data-starters/' + file.relative_to(source).as_posix())
target.chmod(0o600)
with zipfile.ZipFile(target) as archive:
    if archive.testzip() is not None:
        raise SystemExit('Starter ZIP integrity verification failed.')
    for file in files:
        if archive.read('confluence-data-starters/' + file.relative_to(source).as_posix()) != file.read_bytes():
            raise SystemExit('Starter ZIP byte mismatch: ' + file.name)
print(f'Packaged and verified {len(files)} starter files: {target.name}')
