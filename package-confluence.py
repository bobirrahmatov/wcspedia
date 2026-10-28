"""Package the established WCSpedia interface; exclude the native UI experiment."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent
baseline = root / 'archive' / 'WCSpedia-before-native-redesign.zip'
target = root / 'WCSpedia-confluence-package.zip'
# Preserve the previous package layout and feature set. Sample content and
# portable previews remain illustrative, as documented in README.md.
with zipfile.ZipFile(baseline) as archive:
    files = archive.namelist()
# Add the nonvisual native child-page integration and its deployment contract.
# The separately named native-interface experiment remains excluded.
files += [name for name in [
    'UPLOAD-START-HERE.md',
    'previews/mdx-import-preview.jpg', 'previews/mdx-download-menu.jpg', 'MDX-IMPORT.md', 'templates/wcspedia-document.mdx', 'templates/wcspedia-metadata.yaml', 'tests/editor-mdx.cjs', 'tests/mdx-adapter.test.cjs', 'tests/mdx-download.test.cjs',
    'build-confluence-upload.cjs', 'package-confluence-upload.py', 'package-header-widget.py', 'tests/confluence-upload.test.cjs', 'tests/confluence-upload-http.test.cjs',
    'confluence-entitlements.cjs', 'confluence-entitlements.test.cjs', 'tests/entitlements-json-client.test.cjs', 'tests/entitlements-json-flow.test.cjs',
    'bootstrap-data.cjs', 'tests/bootstrap-data.test.cjs', 'tests/data-starters.test.cjs', 'package-data-starters.py', 'DATA-STARTERS.md',
    'page-style-flags.js', 'tests/page-style-flags.test.cjs', 'page-style-flags-header.html', 'page-style-flags-marker.html', 'PAGE-STYLE-FLAGS.md', 'package-page-style-flags.py',
    'assets/wcspedia-logo.png', 'assets/wcspedia-logo-source.txt', 'BRANDING.md',
    'tests/branding-app.cjs', 'tests/search-app.cjs', 'tests/native-landing-app.cjs', 'tests/discovery-startup-app.cjs', 'tests/page-layout-dom.cjs', 'tests/page-frame-app.cjs',
    'add-document-widgetHTMLPage.js', 'previews/search-performance-check.png', 'previews/search-descendant-repair.jpg', 'previews/header-widget-standalone.jpg',
    'previews/viewport-entitlements.png', 'previews/viewport-entitlements-top.png', 'previews/viewport-suggestion-mobile.png',
    'previews/native-primary-search.png',
    'previews/landing-cleanup.png', 'previews/brand-landing.png', 'previews/brand-landing-desktop.png',
    'previews/brand-landing-mobile.png',
    'publication-config.js',
    'loading-overlay.js', 'loading-overlay.css', 'loading-overlay.test.cjs',
    'LOADING-OVERLAY-CONFLUENCE.md', 'wcspedia-global-header-confluence-macro.html',
    'confluence-global-header/WCSpedia-confluence-macro.html',
    'confluence-global-header/wcspedia-my-workspace-confluence-macro.html',
    'confluence-global-header/wcspedia-reviewer-workspace-confluence-macro.html',
    'confluence-global-header/wcspedia-saved-items-confluence-macro.html',
    'confluence-global-header/wcspedia-entitlements-confluence-macro.html',
    'tests/loading-overlay-app.cjs',
    'previews/loading-overlay-preview.html',
    'previews/loading-overlay-desktop.png', 'previews/loading-overlay-mobile.png',
    'publication-workflow.cjs', 'publication-workflow.test.cjs',
    'confluence-publisher.cjs', 'confluence-publisher.test.cjs',
    'confluence-storage.cjs', 'confluence-storage.test.cjs',
    'confluence-projection.cjs', 'confluence-projection.test.cjs',
    'tests/native-publication-flow.cjs',
    'tests/native-projection-flow.cjs',
    'tests/helpers/confluence-publication-fixture.cjs',
    'tests/helpers/confluence-projection-fixture.cjs',
    'NATIVE-PUBLICATION.md'
] if name not in files]
files += [str(file.relative_to(root)) for file in sorted((root / 'confluence-upload').rglob('*')) if file.is_file() and str(file.relative_to(root)) not in files]
files += [str(file.relative_to(root)) for file in sorted((root / 'confluence-header-widget').rglob('*')) if file.is_file() and str(file.relative_to(root)) not in files]
files += [str(file.relative_to(root)) for file in sorted((root / 'confluence-data-starters').rglob('*')) if file.is_file() and str(file.relative_to(root)) not in files]
files += [str(file.relative_to(root)) for file in sorted((root / 'confluence-page-style-flags').rglob('*')) if file.is_file() and str(file.relative_to(root)) not in files]
for optional in ['publication-journal.cjs', 'publication-journal.test.cjs']:
    if (root / optional).is_file() and optional not in files:
        files.append(optional)
# Retired search-introduction screenshots remain local history, not deployment previews.
files = [name for name in files if name not in {
    'previews/search.jpg', 'previews/shared-landing-search.png',
    'previews/brand-search-desktop.png', 'previews/brand-search-mobile.png'
}]
# Native entitlement tables are retired from every current distribution.
files = [name for name in files if Path(name).name != 'entitlements-table.html']
missing = [name for name in files if not (root / name).is_file()]
if missing:
    raise SystemExit('Missing package files: ' + ', '.join(missing))
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, name)
with zipfile.ZipFile(target) as archive:
    if archive.testzip() is not None:
        raise SystemExit('Full package ZIP verification failed.')
    for name in files:
        if archive.read(name) != (root / name).read_bytes():
            raise SystemExit('Full package content mismatch: ' + name)
print(f'Packaged and verified {len(files)} established-design files: {target.name}')
