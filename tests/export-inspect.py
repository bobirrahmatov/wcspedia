"""Inspect generated export bytes after export-generation.cjs; rendering remains mandatory."""
import pathlib
import sys
import zipfile
import xml.etree.ElementTree as ET
from pypdf import PdfReader

folder = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/wcspedia-export-qa')
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
for name in ('document-export', 'document-export-stress'):
    with zipfile.ZipFile(folder / f'{name}.docx') as archive:
        root = ET.fromstring(archive.read('word/document.xml'))
        texts = ''.join(root.itertext())
        assert len(root.findall('.//w:tbl', ns)) >= 3, 'Editable tables must be retained'
        assert len(root.findall('.//w:tblHeader', ns)) >= 2, 'Table headers must repeat'
        assert len(root.findall('.//w:p', ns)) > 25, 'Document must contain editable paragraphs'
        assert any(x.startswith('word/media/') for x in archive.namelist()), 'Brand image is missing'
        assert 'PRIVATE AUDIT VALUE' not in texts
        assert 'JL12345' in texts and 'AM12345' in texts
        assert 'Supporting evidence and references for control 44' in texts if name.endswith('stress') else 'Record the handover' in texts
        relations = archive.read('word/_rels/document.xml.rels').decode()
        assert 'https://confluence.example/confluence/pages/viewpage.action?pageId=12345' in relations
        assert 'javascript:' not in relations
    reader = PdfReader(folder / f'{name}.pdf')
    texts = '\n'.join(page.extract_text() for page in reader.pages)
    assert len(reader.pages) >= 2, 'Cover and content must use separate pages'
    assert 'JL12345' in texts and 'AM12345' in texts
    assert 'PRIVATE AUDIT VALUE' not in texts
    assert 'Supporting evidence and references for control 44' in ' '.join(texts.split()) if name.endswith('stress') else 'Record the handover' in texts
    assert all(len(page.extract_text().strip()) > 40 for page in reader.pages), 'Unexpected blank page'
    print(f'{name}: editable structures, metadata, source links and {len(reader.pages)} selectable-text PDF pages verified')
