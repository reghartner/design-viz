#!/usr/bin/env python3
"""Optional contact sheet for visual QA (requires Pillow); never modifies previews."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('round', type=Path)
p.add_argument('--ids', help='Comma-separated scenario IDs; defaults to first 12')
a = p.parse_args()
pairs = json.loads((a.round / 'review/manifest.json').read_text())['pairs']
ids = a.ids.split(',') if a.ids else [r['id'] for r in pairs[:12]]
pairs = [r for r in pairs if r['id'] in ids]
width, height, columns = 620, 800, 3
sheet = Image.new('RGB', (columns * width, ((len(pairs)+columns-1)//columns)*height), '#e8edf3')
draw = ImageDraw.Draw(sheet)
for i, row in enumerate(pairs):
    x, y = i % columns * width, i // columns * height
    draw.text((x+8, y+8), f"{row['id']} | {row['host']['width']}px | {row['panelCount']} panels", fill='black')
    for j, label in enumerate(('A', 'B')):
        image = Image.open(a.round / 'review' / row[label]['png']).convert('RGB')
        image.thumbnail((300, 758))
        sheet.paste(image, (x+8+j*306, y+32))
        draw.text((x+8+j*306, y+20), label, fill='black')
sheet.save(a.round / 'montage.png')
print(a.round / 'montage.png')
