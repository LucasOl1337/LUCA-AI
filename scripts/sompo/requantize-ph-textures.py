"""Requantize 16-bit Poly Haven runtime maps to 8-bit and relink them.

prepare-polyhaven.py copies authored maps verbatim; several arrived as 16-bit
PNG (4-5 MB each at 1024^2). WebGL samples them as 8-bit UNORM anyway, so the
extra precision never reaches the screen. Each converted file gets a new
content-addressed name; textures.json manifests, GLB image URIs and the
runtime hashes in polyhaven-sources.json are rewritten to match.

python3 scripts/sompo/requantize-ph-textures.py
"""
import hashlib, json, struct
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path('public/models/sompo')

def to_8bit(path):
    image = Image.open(path)
    array = np.asarray(image)
    if array.dtype == np.uint8 and image.mode in ('RGB', 'RGBA', 'L'):
        return None
    if image.mode.startswith('I;16') or image.mode == 'I':
        return Image.fromarray((np.asarray(image, dtype=np.uint32) >> 8).astype(np.uint8), 'L')
    # Pillow exposes 16-bit RGB(A) as 8-bit already scaled; re-save drops the 16-bit payload.
    return image.convert(image.mode)

renames = {}
for path in sorted(ROOT.glob('ph-*.png')):
    header = path.read_bytes()[:26]
    if header[24] != 16:
        continue
    before = path.stat().st_size
    converted = to_8bit(path) or Image.open(path)
    tmp = path.with_suffix('.tmp.png')
    converted.save(tmp, optimize=True)
    data = tmp.read_bytes()
    name = f'ph-{hashlib.sha256(data).hexdigest()[:16]}.png'
    tmp.rename(ROOT / name)
    if name != path.name:
        path.unlink()
    renames[path.name] = name
    print(f'{path.name} {before} -> {name} {len(data)}')

def relink_glb(path):
    data = path.read_bytes()
    json_len = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + json_len]); rest = data[20 + json_len:]
    changed = False
    for image in doc.get('images', []):
        if image.get('uri') in renames:
            image['uri'] = renames[image['uri']]; changed = True
    if not changed:
        return False
    meta = json.dumps(doc, separators=(',', ':')).encode(); meta += b' ' * (-len(meta) % 4)
    body = struct.pack('<II', len(meta), 0x4E4F534A) + meta + rest
    path.write_bytes(struct.pack('<III', 0x46546C67, 2, 12 + len(body)) + body)
    return True

for manifest in ROOT.glob('ph-*.textures.json'):
    doc = json.loads(manifest.read_text())
    doc['images'] = [renames.get(name, name) for name in doc['images']]
    doc['alphaMaps'] = {key: renames.get(name, name) for key, name in doc.get('alphaMaps', {}).items()}
    manifest.write_text(json.dumps(doc, indent=2) + '\n')
    glb = manifest.with_name(manifest.name.replace('.textures.json', '.glb'))
    if relink_glb(glb):
        print('relinked', glb.name)

sources = ROOT / 'polyhaven-sources.json'
doc = json.loads(sources.read_text())
for entry in doc.get('runtime', []):
    glb = ROOT / entry['file']
    if glb.exists():
        entry['sha256'] = hashlib.sha256(glb.read_bytes()).hexdigest(); entry['bytes'] = glb.stat().st_size
sources.write_text(json.dumps(doc, indent=2) + '\n')
