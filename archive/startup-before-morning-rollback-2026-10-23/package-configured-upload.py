"""Personalize a verified runtime ZIP; never rebuild or alter its runtime assets.

The installation profile is build input, not another Confluence attachment.
Run after package-upload-ready.py. Optional paths support isolated verification.
"""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import html
import json
import re
import shutil
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent
ATTACHMENT_MAX_BYTES = 10_000_000
PAGES = {
    'home': ('Landing page', 'wcspedia-landing.html'),
    'mine': ('My workspace', 'wcspedia-my-workspace.html'),
    'review': ('Reviewer workspace', 'wcspedia-reviewer-workspace.html'),
    'saved': ('Saved items', 'wcspedia-saved-items.html'),
    'entitlements': ('Entitlements', 'wcspedia-entitlements.html'),
    'insights': ('Insights', 'wcspedia-insights.html'),
    'faq': ('FAQs', 'wcspedia-faq.html'),
}
AREAS = (
    'credit-approval-control', 'credit-information-management',
    'credit-management-reporting', 'deal-closing', 'documentation-pledging',
    'emea-credit-admin', 'loan-management', 'regional-operating-manuals',
)
SERVICES = (
    'workspaceEndpoint', 'workflowEndpoint', 'suggestionEndpoint',
    'entitlementsEndpoint', 'metricsEndpoint', 'bookmarksEndpoint', 'healthEndpoint',
)
OBSOLETE = re.compile(r'\b(?:entitlementsPageId|entitlementsSource|entitlementsFilename)\b')
SETTINGS = re.compile(r'(var settings = )(\{.*?\})(;\s*var context =)', re.S)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def fail(message):
    raise ValueError(message)


def check_attachment_size(name, size):
    if name.split('/')[0] in {'attachments', 'initial-json'} and size > ATTACHMENT_MAX_BYTES:
        fail(f'Confluence attachment exceeds the 10 MB (10,000,000 bytes) per-file limit: {name}. Reduce this file; the ZIP total is not the limit.')


def profile_from(path):
    profile = json.loads(path.read_text())
    if set(profile) != {'spaceKey', 'attachmentPageId', 'pageIds', 'workingRootPageId', 'areaPageIds', 'services', 'insightsPageId'}:
        fail('Installation profile has missing or unexpected fields')
    if not isinstance(profile['spaceKey'], str) or not re.fullmatch(r'[A-Za-z0-9_~-]+', profile['spaceKey']):
        fail('Installation spaceKey must be the exact non-empty Confluence key')
    for field, keys in [('pageIds', [key for key in PAGES if key != 'insights']), ('areaPageIds', AREAS), ('services', SERVICES)]:
        if not isinstance(profile[field], dict) or set(profile[field]) != set(keys):
            fail('Invalid installation mapping: ' + field)
    ids = [profile['attachmentPageId'], profile['workingRootPageId'], profile['insightsPageId'], *profile['pageIds'].values(), *profile['areaPageIds'].values()]
    if any(not isinstance(value, str) or not re.fullmatch(r'[1-9][0-9]*', value) for value in ids):
        fail('All installation page IDs must be numeric strings')
    if len(ids) != len(set(ids)):
        fail('Installation page IDs must identify distinct pages')
    for name, endpoint in profile['services'].items():
        if not isinstance(endpoint, str) or (endpoint and (
            not endpoint.startswith('/confluence/') or re.search(r'[\s<>"\\]', endpoint)
        )):
            fail(name + ' must be empty or a verified same-origin /confluence/ service path')
    return profile


def verified_archive(source):
    digest_path = source.with_suffix(source.suffix + '.sha256')
    recorded = digest_path.read_text().strip().split('  ', 1)
    if len(recorded) != 2 or recorded[1] != source.name or recorded[0] != sha(source.read_bytes()):
        fail('Input upload ZIP checksum mismatch')
    with zipfile.ZipFile(source) as archive:
        prefix = 'wcspedia-upload/'
        names = archive.namelist()
        if len(names) != len(set(names)):
            fail('Input upload ZIP failed integrity verification')
        if any(not name.startswith(prefix) or name.endswith('/') or
               '..' in PurePosixPath(name).parts or '\\' in name for name in names):
            fail('Unexpected upload ZIP path')
        for entry in archive.infolist():
            check_attachment_size(entry.filename[len(prefix):], entry.file_size)
        if archive.testzip():
            fail('Input upload ZIP failed integrity verification')
        files = {name[len(prefix):]: archive.read(name) for name in names}
        for name, data in files.items():
            check_attachment_size(name, len(data))
    manifest = files.get('SHA256SUMS.txt', b'').decode()
    expected = {}
    for line in manifest.splitlines():
        digest, name = line.split('  ', 1)
        if name in expected:
            fail('Duplicate manifest path')
        expected[name] = digest
    if set(expected) != set(files) - {'SHA256SUMS.txt'}:
        fail('Input upload manifest does not match ZIP files')
    if any(sha(files[name]) != digest for name, digest in expected.items()):
        fail('Input upload manifest checksum mismatch')
    allowed = {'.md', '.js', '.css', '.html', '.json', '.mdx', '.yaml', '.png', '.jpg', '.txt'}
    if any(PurePosixPath(name).suffix not in allowed or PurePosixPath(name).name == 'entitlements-table.html'
           for name in files):
        fail('Unexpected development or retired file in runtime ZIP')
    if any(name not in {'README.md', 'SHA256SUMS.txt'} and name.split('/')[0] not in
           {'attachments', 'html', 'templates', 'licenses', 'initial-json'} for name in files):
        fail('Unexpected folder in runtime ZIP')
    return files


def configure(files, profile):
    replacements = {
        'REPLACE_WITH_ATTACHMENTS_PAGE_ID': profile['attachmentPageId'],
        'REPLACE_WITH_WCSPEDIA_PAGE_ID': profile['pageIds']['home'],
        'REPLACE_WITH_MY_WORKSPACE_PAGE_ID': profile['pageIds']['mine'],
        'REPLACE_WITH_REVIEWER_WORKSPACE_PAGE_ID': profile['pageIds']['review'],
        'REPLACE_WITH_SAVED_ITEMS_PAGE_ID': profile['pageIds']['saved'],
        'REPLACE_WITH_ENTITLEMENTS_PAGE_ID': profile['pageIds']['entitlements'],
        'REPLACE_WITH_FAQ_PAGE_ID': profile['pageIds']['faq'],
        'REPLACE_WITH_INSIGHTS_PAGE_ID': profile['insightsPageId'],
        'REPLACE_WITH_RESTRICTED_WORKING_ROOT_PAGE_ID': profile['workingRootPageId'],
        **{'REPLACE_WITH_' + area.upper().replace('-', '_') + '_PAGE_ID': value
           for area, value in profile['areaPageIds'].items()},
    }
    configured = dict(files)
    page_files = {'html/' + filename for _, filename in PAGES.values()}
    for name, data in files.items():
        if not name.startswith('html/') or not name.endswith('.html'):
            continue
        source = data.decode()
        for placeholder, value in replacements.items():
            source = source.replace(placeholder, value)
        source = source.replace(
            'Edit the settings below and the TWO attachment script URLs at the end.',
            'Page IDs and attachment URLs are already configured for this installation.',
        ).replace(
            'Edit the IDs below and BOTH attachment URLs.',
            'Page IDs and both attachment URLs are already configured.',
        )
        if name in page_files:
            match = SETTINGS.search(source)
            if not match:
                fail('Cannot locate inline settings in ' + name)
            settings = json.loads(match.group(2))
            for field in profile:
                settings[field] = profile[field]
            source = SETTINGS.sub(lambda m: m.group(1) + json.dumps(settings, indent=2) + m.group(3), source, count=1)
            json.loads(SETTINGS.search(source).group(2))
            # Keep inert markup settings identical to the inline fast path.
            role = next(key for key, (_, filename) in PAGES.items() if name == 'html/' + filename)
            payload = html.escape(json.dumps({'role': role, 'settings': settings}, separators=(',', ':')), quote=True)
            source, count = re.subn(r'data-wcs-page-settings="[^"]*"', lambda _: 'data-wcs-page-settings="' + payload + '"', source, count=1)
            if count != 1:
                fail('Missing declarative page settings in ' + name)
        elif name in ('html/wcspedia-header-widget.html', 'html/wcspedia-navbar.html'):
            source = re.sub(r"\bspaceKey:\s*(['\"]).*?\1", lambda m: 'spaceKey: ' + json.dumps(profile['spaceKey']), source)
            for key in ('workspaceEndpoint', 'workflowEndpoint'):
                source, count = re.subn(r'\b' + key + r":\s*(['\"]).*?\1", lambda m: key + ': ' + json.dumps(profile['services'][key]), source)
                if count != 1:
                    fail('Cannot locate header setting ' + key)
        elif name == 'html/wcspedia-article-discussion-header.html':
            source, count = re.subn(r"\bspaceKey:\s*(['\"]).*?\1", lambda m: 'spaceKey: ' + json.dumps(profile['spaceKey']), source)
            if count != 1:
                fail('Cannot locate article discussion space key')
        if re.search(r'REPLACE_WITH_[A-Z0-9_]+_PAGE_ID', source):
            fail('Unresolved page ID placeholder in ' + name)
        if OBSOLETE.search(source):
            fail('Obsolete entitlement configuration in ' + name)
        if re.search(r'<\/?(?:html|head|body|meta)\b', source, re.I):
            fail('Expected a content-only Confluence macro: ' + name)
        configured[name] = source.encode()
    if not page_files <= set(configured) or 'html/wcspedia-navbar.html' not in configured:
        fail('Required page/header fragments missing')
    for name, data in configured.items():
        if name.endswith('.json'):
            json.loads(data)
        if not name.startswith('html/') and name not in {'README.md', 'SHA256SUMS.txt'} and data != files[name]:
            fail('Configured packaging must not alter runtime assets or JSON: ' + name)
    return configured


def readme(profile):
    rows = '\n'.join(f"| {label} | `{(profile['insightsPageId'] if key == 'insights' else profile['pageIds'][key])}` | `html/{filename}` |"
                     for key, (label, filename) in PAGES.items())
    areas = '\n'.join(f'| {area} | `{page_id}` |' for area, page_id in profile['areaPageIds'].items())
    base = (ROOT / 'UPLOAD-READY.md').read_text()
    return (base + f"""
## Configured page IDs

Space key: `{profile['spaceKey']}`. Context: `/confluence`. Attachment page: `{profile['attachmentPageId']}`.

| Interface | Page ID | HTML macro |
| --- | --- | --- |
{rows}

Insights parent: `{profile['insightsPageId']}`. Restricted Working parent: `{profile['workingRootPageId']}`.

| Business area | Parent page ID |
| --- | --- |
{areas}

These IDs match the supplied configuration. Native access must be checked on your internal instance. `SHA256SUMS.txt` verifies every file in this package.
""").encode()


def manifest(files):
    return ''.join(f'{sha(data)}  {name}\n' for name, data in sorted(files.items())
                   if name != 'SHA256SUMS.txt').encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'WCSpedia-upload-ready.zip')
    parser.add_argument('--profile', type=Path, default=ROOT / 'confluence-installation.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'WCSpedia-configured-upload.zip')
    parser.add_argument('--directory', type=Path, default=ROOT / 'confluence-ready')
    args = parser.parse_args()
    if args.output.resolve() == args.source.resolve():
        fail('Configured output must not overwrite the generic source ZIP')
    if args.directory.is_symlink():
        fail('Refusing to replace a symlink output directory')
    profile = profile_from(args.profile)
    files = configure(verified_archive(args.source), profile)
    files['README.md'] = readme(profile)
    for name, data in files.items():
        check_attachment_size(name, len(data))
    files['SHA256SUMS.txt'] = manifest(files)
    # An owned, exact directory may be refreshed; refuse to delete unrelated files.
    directory = args.directory.resolve()
    if directory.exists():
        current = {p.relative_to(directory).as_posix() for p in directory.rglob('*') if p.is_file()}
        retired = {'html/wcspedia-' + name + '.html' for name in
                   ('header-widget', 'global-styles', 'notifications-header', 'page-style-flags-header', 'article-discussion-header')}
        extra = current - set(files)
        old_manifest = directory / 'SHA256SUMS.txt'
        old_hashes = dict(line.split('  ', 1)[::-1] for line in old_manifest.read_text().splitlines()) if old_manifest.exists() else {}
        # Retire only unchanged generated fragments. Preserve user edits/files.
        safe_retired = extra <= retired and all(sha((directory / name).read_bytes()) == old_hashes.get(name) for name in extra)
        if not safe_retired or any(p.is_symlink() for p in directory.rglob('*')):
            fail('Refusing to replace an output directory with unexpected files or symlinks')
    directory.parent.mkdir(parents=True, exist_ok=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.wcspedia-configured-', dir=directory.parent) as temp:
        staging = Path(temp) / 'confluence-ready'
        staging.mkdir()
        for name, data in files.items():
            target = staging / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        temporary_zip = Path(temp) / 'configured.zip'
        with zipfile.ZipFile(temporary_zip, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, data in sorted(files.items()):
                archive.writestr('confluence-ready/' + name, data)
        with zipfile.ZipFile(temporary_zip) as archive:
            if archive.testzip() or set(archive.namelist()) != {'confluence-ready/' + name for name in files}:
                fail('Configured ZIP integrity check failed')
            for name, data in files.items():
                if archive.read('confluence-ready/' + name) != data:
                    fail('Configured ZIP content mismatch')
        if directory.exists():
            shutil.rmtree(directory)
        shutil.move(str(staging), str(directory))
        shutil.copyfile(temporary_zip, args.output)
    args.output.with_suffix(args.output.suffix + '.sha256').write_text(f'{sha(args.output.read_bytes())}  {args.output.name}\n')
    print(f'Configured {len(files)} verified files for {profile["spaceKey"]}: {args.output}')
    print(f'Ready-to-paste files: {directory}')
    print('Live JSON preserved: initial-json files are first-install only. Unknown service endpoints remain empty.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, zipfile.BadZipFile) as error:
        raise SystemExit(str(error))
