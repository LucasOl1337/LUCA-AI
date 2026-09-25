"""Gera mapas leves para a vegetação da lavoura a partir dos albedos-fonte.

Uso: python scripts/sompo/build-lavoura-materials.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "public/sompo/gen/maize-leaf-albedo.png"
SURFACE = ROOT / "public/sompo/gen/maize-leaf-surface.webp"
OUTPUT = ROOT / "public/sompo/gen/maize-leaf-normal.webp"


def flattened_surface() -> np.ndarray:
    """Estica cada linha opaca da foto sobre a lâmina modelada.

    A textura-fonte define só matéria e microdetalhe. A silhueta fica na
    geometria, então não há alpha-test brigando com a dobra central.
    """
    rgba = Image.open(SOURCE).convert("RGBA").resize((512, 1024), Image.Resampling.LANCZOS)
    pixels = np.asarray(rgba, dtype=np.uint8)
    surface = np.empty((1024, 256, 3), dtype=np.uint8)
    valid_rows: list[int] = []
    for y in range(pixels.shape[0]):
        opaque = np.flatnonzero(pixels[y, :, 3] >= 96)
        if opaque.size < 3:
            continue
        left, right = int(opaque[0]), int(opaque[-1]) + 1
        inset = max(1, int((right - left) * 0.08))
        left, right = left + inset, right - inset
        if right - left < 3:
            continue
        strip = Image.fromarray(pixels[y : y + 1, left:right, :3], "RGB")
        surface[y] = np.asarray(strip.resize((256, 1), Image.Resampling.BICUBIC))[0]
        valid_rows.append(y)
    if not valid_rows:
        raise RuntimeError("fonte sem folha opaca")
    first, last = valid_rows[0], valid_rows[-1]
    surface[:first] = surface[first]
    surface[last + 1 :] = surface[last]
    for y in range(first + 1, last):
        if y not in valid_rows:
            surface[y] = surface[y - 1]
    # As extremidades da foto-fonte incluem fundo escuro nas quinas. Sem
    # alpha-test esses pixels virariam um ponto preto idêntico em toda folha.
    # A geometria já afunila as pontas; o mapa só precisa continuar a matéria.
    edge_guard = 32
    surface[:edge_guard] = surface[edge_guard]
    surface[-edge_guard:] = surface[-edge_guard - 1]
    # A fotografia ainda traz poucos pixels escuros isolados no miolo. Quando
    # o mesmo mapa cobre milhares de folhas, eles viram o pontilhado repetido
    # que parece buraco ou verso sem luz. Troque apenas outliers locais fortes;
    # a nervura e a variacao larga de albedo permanecem intactas.
    luminance_weights = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    for _ in range(3):
        local_median = np.asarray(
            Image.fromarray(surface, "RGB").filter(ImageFilter.MedianFilter(5)),
            dtype=np.uint8,
        )
        luminance = surface.astype(np.float32) @ luminance_weights
        median_luminance = local_median.astype(np.float32) @ luminance_weights
        dark_outliers = (luminance < median_luminance * 0.75) & (median_luminance - luminance > 12)
        surface[dark_outliers] = local_median[dark_outliers]
    # Lossless evita que o encoder recrie blocos escuros ao redor dos poucos
    # pixels corrigidos; ainda fica muito abaixo do PNG-fonte.
    Image.fromarray(surface, "RGB").save(SURFACE, "WEBP", lossless=True, method=6)
    return surface.astype(np.float32) / 255.0


def normal_from_leaf(surface: np.ndarray) -> None:
    height = surface[..., 1] * 0.58 + surface[..., 0] * 0.22 + surface[..., 2] * 0.20

    # Nervuras paralelas e nervura central: microrelevo, não cor pintada.
    yy, xx = np.mgrid[0:height.shape[0], 0:height.shape[1]]
    veins = np.sin(xx * 0.23 + np.sin(yy * 0.014) * 2.2) * 0.018
    midrib = np.exp(-((xx - height.shape[1] * 0.5) / 7.0) ** 2) * 0.12
    height = height + veins + midrib
    gradient_y, gradient_x = np.gradient(height)
    normal = np.dstack((-gradient_x * 4.2, gradient_y * 1.8, np.ones_like(height)))
    normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-6)
    encoded = ((normal * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)
    Image.fromarray(encoded, "RGB").save(OUTPUT, "WEBP", quality=94, method=6)


if __name__ == "__main__":
    normal_from_leaf(flattened_surface())
    print(SURFACE.relative_to(ROOT), SURFACE.stat().st_size)
    print(OUTPUT.relative_to(ROOT), OUTPUT.stat().st_size)
