#!/usr/bin/env python3
"""Produce a temporary enlarged crop of an original for human OCR adjudication."""
import sys
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter

source = Path(sys.argv[1])
left, top, right, bottom = map(int, sys.argv[2:6])
target = Path(sys.argv[6])
with Image.open(source) as image:
    crop = image.crop((left, top, right, bottom)).resize(((right-left)*4, (bottom-top)*4), Image.Resampling.LANCZOS)
    crop = ImageEnhance.Contrast(crop).enhance(1.6)
    crop = crop.filter(ImageFilter.UnsharpMask(radius=1,percent=150))
    crop.save(target)
print(target)
