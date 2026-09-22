"""Make a generated photo texture tileable by blending it with its half-shifted copy.

The half-shift moves the image seams to the centre cross, where the original is
continuous; a feathered cross mask takes the original there and the shifted copy
everywhere else, so the borders wrap exactly.

python3 scripts/sompo/make-seamless.py SRC.jpg DEST.webp [feather=0.22] [size=1024]
"""
import sys
import numpy as np
from PIL import Image

src, dest = sys.argv[1], sys.argv[2]
feather = float(sys.argv[3]) if len(sys.argv) > 3 else 0.22
size = int(sys.argv[4]) if len(sys.argv) > 4 else 1024
image = np.asarray(Image.open(src).convert('RGB').resize((size, size), Image.LANCZOS), dtype=np.float32)
shifted = np.roll(image, (size // 2, size // 2), axis=(0, 1))
t = np.abs(np.linspace(-1, 1, size))
edge = np.clip((feather - t) / feather, 0, 1) ** 1.5
mask = np.maximum.outer(edge, edge)[..., None]
out = shifted * (1 - mask) + image * mask
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(dest, quality=90, method=6)
print(dest)
