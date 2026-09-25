"""Gera mapas leves para a vegetação da lavoura a partir dos albedos-fonte.

Uso: python scripts/sompo/build-lavoura-materials.py
"""

from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "public/sompo/gen/maize-leaf-albedo.png"
OUTPUT = ROOT / "public/sompo/gen/maize-leaf-normal.webp"


def normal_from_leaf() -> None:
    rgba = Image.open(SOURCE).convert("RGBA").resize((512, 768), Image.Resampling.LANCZOS)
    pixels = np.asarray(rgba, dtype=np.float32) / 255.0
    alpha = pixels[..., 3]
    height = pixels[..., 1] * 0.58 + pixels[..., 0] * 0.22 + pixels[..., 2] * 0.20

    # Nervuras paralelas e nervura central: microrelevo, não cor pintada.
    yy, xx = np.mgrid[0:height.shape[0], 0:height.shape[1]]
    veins = np.sin(xx * 0.29 + np.sin(yy * 0.018) * 2.2) * 0.022
    midrib = np.exp(-((xx - height.shape[1] * 0.5) / 8.5) ** 2) * 0.18
    height = (height + veins + midrib) * alpha
    gradient_y, gradient_x = np.gradient(height)
    normal = np.dstack((-gradient_x * 5.0, gradient_y * 2.2, np.ones_like(height)))
    normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-6)
    encoded = ((normal * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)
    encoded[alpha < 0.02] = (128, 128, 255)
    Image.fromarray(encoded, "RGB").save(OUTPUT, "WEBP", quality=94, method=6)


if __name__ == "__main__":
    normal_from_leaf()
    print(OUTPUT.relative_to(ROOT), OUTPUT.stat().st_size)
