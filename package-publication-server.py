"""Package current trusted publication source separately from browser uploads.

No credentials, journals or production data are packaged. The illustrative
wcspedia-data.json is included only because the workflow regression tests use
it; the deployment guide explicitly forbids treating it as live state.
"""
from pathlib import Path, PurePosixPath
import hashlib
import re
import zipfile

root = Path(__file__).resolve().parent
names = [
    'PUBLICATION-SERVER-SOURCE.md',
    'confluence-publisher.cjs', 'confluence-storage.cjs',
    'confluence-projection.cjs', 'publication-workflow.cjs',
    'publication-http.cjs', 'publication-http.test.cjs',
    'confluence-entitlements.cjs', 'confluence-entitlements.test.cjs',
    'workflow.js', 'editor-content.js', 'governance.js', 'entitlements.js',
    'confluence.js', 'search.js',
    'vendor/markdown-it-15.0.2.min.js', 'vendor/markdown-it-LICENSE.txt',
    'confluence-publisher.test.cjs', 'confluence-storage.test.cjs',
    'confluence-projection.test.cjs', 'publication-workflow.test.cjs',
    'confluence.test.cjs', 'tests/native-publication-flow.cjs',
    'tests/native-projection-flow.cjs',
    'tests/helpers/confluence-publication-fixture.cjs',
    'tests/helpers/confluence-projection-fixture.cjs',
    'wcspedia-data.json',
]
files = {name: (root / name).read_bytes() for name in names}
# Catch missing local CommonJS dependencies before producing a misleading ZIP.
for name, data in files.items():
    if PurePosixPath(name).suffix not in {'.js', '.cjs'}:
        continue
    for relative in re.findall(r"require\(['\"](\.[^'\"]+)['\"]\)", data.decode()):
        resolved = (root / name).parent.joinpath(relative).resolve()
        dependency = resolved.relative_to(root).as_posix()
        if dependency not in files:
            raise ValueError(f'Missing package dependency: {name} -> {dependency}')
files['SHA256SUMS.txt'] = ''.join(
    hashlib.sha256(data).hexdigest() + '  ' + name + '\n'
    for name, data in sorted(files.items())
).encode()
target = root / 'WCSpedia-publication-server-source.zip'
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name, data in files.items():
        archive.writestr('wcspedia-publication-server/' + name, data)
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert len(archive.namelist()) == len(files)
    for name, data in files.items():
        assert archive.read('wcspedia-publication-server/' + name) == data
target.with_suffix('.zip.sha256').write_text(
    hashlib.sha256(target.read_bytes()).hexdigest() + '  ' + target.name + '\n'
)
print(f'Verified {len(files)} trusted publication-source files: {target}')
