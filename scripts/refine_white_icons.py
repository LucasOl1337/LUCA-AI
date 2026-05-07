from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps


BASE = Path("public/icons")
ICON_NAMES = [
    "database.png",
    "quest.png",
    "supervisor.jpg",
    "planejador.png",
    "pesquisador.png",
    "designer.png",
]


def get_foreground(arr):
    h, w = arr.shape[:2]
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    bright = arr.mean(axis=2)
    sat = arr.max(axis=2) - arr.min(axis=2)

    yy, xx = np.ogrid[:h, :w]
    cx, cy = w / 2, h / 2
    center = ((xx - cx) / (w * 0.38)) ** 2 + ((yy - cy) / (h * 0.42)) ** 2 <= 1.0
    visual = (bright > 52) | (sat > 42)
    dark_detail = center & (bright > 22) & (sat > 16)
    return center & (visual | dark_detail)


def white_with_detail(path):
    im = Image.open(path).convert("RGB")
    arr = np.array(im).astype(np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = arr.max(axis=2) - arr.min(axis=2)

    fg = get_foreground(arr)
    mask = Image.fromarray((fg * 255).astype("uint8"))
    mask = mask.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(1.0))
    m = np.array(mask).astype(np.float32) / 255.0

    low = np.percentile(lum[fg], 8) if fg.any() else 0
    high = np.percentile(lum[fg], 96) if fg.any() else 255
    detail = np.clip((lum - low) / max(high - low, 1), 0, 1)
    detail = detail ** 0.72

    gray = Image.fromarray(np.clip(detail * 255, 0, 255).astype("uint8"))
    edges = ImageOps.autocontrast(gray.filter(ImageFilter.FIND_EDGES))
    edge = np.array(edges).astype(np.float32) / 255.0
    edge = np.clip(edge * m * 1.25, 0, 1)

    white_luma = 132 + detail * 120
    white_luma -= edge * 72
    white_luma -= ((sat > 55) & fg).astype(np.float32) * 8
    white_luma = np.clip(white_luma, 58, 255)

    out = arr.copy()
    target = np.dstack([white_luma, white_luma, white_luma])
    out = out * (1 - m[:, :, None]) + target * m[:, :, None]

    # Keep the original dark ink and eye details from being washed out.
    ink = fg & (lum < np.percentile(lum[fg], 24) if fg.any() else False)
    ink_mask = Image.fromarray((ink * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(0.6))
    imask = np.array(ink_mask).astype(np.float32) / 255.0
    out = out * (1 - imask[:, :, None] * 0.55) + arr * (imask[:, :, None] * 0.55)

    Image.fromarray(np.clip(out, 0, 255).astype("uint8")).save(path, quality=96)


for icon_name in ICON_NAMES:
    icon_path = BASE / icon_name
    white_with_detail(icon_path)
    print(f"refined {icon_path}")
