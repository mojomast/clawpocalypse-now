"""Rebuild lossless socket cleanup from the untouched approved sheetA.jpg.

The moving deltoid comes from the upper-arm slice, not a cap on the vest.
Run before tools/slice-hero-parts.py turbofit --write.
"""
from pathlib import Path
from PIL import Image, ImageDraw

base = Path(__file__).resolve().parent
image = Image.open(base / 'sheetA.jpg').convert('RGB')
draw = ImageDraw.Draw(image)
# Follow the outside vest seam, retaining its dark edge and chest artwork.
for polygon in (
    [(640, 40), (676, 40), (669, 56), (671, 101), (640, 110)],
    [(820, 42), (850, 42), (850, 117), (809, 117), (805, 101), (806, 63)],
    [(940, 40), (966, 40), (960, 58), (960, 101), (940, 110)],
    [(1110, 42), (1140, 42), (1140, 117), (1100, 117), (1097, 100), (1098, 63)],
):
    draw.polygon(polygon, fill=(255, 0, 150))
image.save(base / 'sheetA-polish.png')
