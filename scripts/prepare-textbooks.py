"""Prepare private textbook PDFs and printed-page previews; no AI calls or database changes."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import pymupdf

parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', required=True)
parser.add_argument('--output-dir', default='data/textbooks/pilot')
args = parser.parse_args()
catalog = json.loads((Path(__file__).resolve().parent.parent / 'server/textbooks.json').read_text(encoding='utf-8'))
for book in catalog:
    source = Path(args.source_dir) / (book['source_name'] + '.pdf')
    target = Path(args.output_dir) / book['id']
    target.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != book['sha256']:
        raise ValueError(f"Source edition differs from the verified catalog: {source.name}")
    shutil.copy2(source, target / 'source.pdf')
    pages = target / 'pages'
    pages.mkdir(exist_ok=True)
    with pymupdf.open(source) as doc:
        for n in range(1, book['printed_pages'] + 1):
            page_file = pages / f'page_{n}.jpg'
            if page_file.exists():
                continue
            doc[n + book['pdf_offset'] - 1].get_pixmap(matrix=pymupdf.Matrix(1.7, 1.7), alpha=False).save(str(page_file), jpg_quality=82)
    print(f"{book['id']}: {book['printed_pages']} printed pages prepared", flush=True)
