"""Prune sub-metre twig islands from the distant jacaranda LOD in place.

prepare-polyhaven.py asks the far branches for 2800 triangles, but Blender's
decimate cannot collapse below one fan per loose island, and the far branch
mesh kept ~1300 islands (62k triangles per tree, rendered twice with shadows).
Beyond 54 m those twigs sit inside the leaf crown. This drops whole islands
whose longest side is below THRESHOLD asset units (tree scale is 0.30-0.53,
so 1.5 units is 0.45-0.8 m in the world) and compacts the vertex buffers.
Trunk, leaf cards, materials and external textures are left untouched.

python3 scripts/sompo/prune-jacaranda-far.py [THRESHOLD]
"""
import json, struct, sys
import numpy as np
from pathlib import Path

PATH = Path('public/models/sompo/ph-jacaranda-far.glb')
THRESHOLD = float(sys.argv[1]) if len(sys.argv) > 1 else 1.5
TYPES = {5123: np.uint16, 5125: np.uint32, 5126: np.float32}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}

data = PATH.read_bytes()
json_len = struct.unpack_from('<I', data, 12)[0]
doc = json.loads(data[20:20 + json_len])
binary = data[28 + json_len:]

def read(index):
    a = doc['accessors'][index]; view = doc['bufferViews'][a['bufferView']]
    width = WIDTH[a['type']]
    array = np.frombuffer(binary, TYPES[a['componentType']], a['count'] * width, view.get('byteOffset', 0) + a.get('byteOffset', 0))
    return array.reshape(a['count'], width) if width > 1 else array

def island_roots(triangles, count):
    parent = np.arange(count)
    def find(x):
        root = x
        while parent[root] != root: root = parent[root]
        while parent[x] != root: parent[x], x = root, parent[x]
        return root
    for a, b, c in triangles:
        ra = find(a); parent[find(b)] = ra; parent[find(c)] = ra
    return np.array([find(i) for i in range(count)])

branches = next(m for m in doc['meshes'] if m['primitives'][0]['material'] is not None
                and 'branches' in doc['materials'][m['primitives'][0]['material']]['name'])
primitive = branches['primitives'][0]
attributes = {name: read(index) for name, index in primitive['attributes'].items()}
triangles = read(primitive['indices']).astype(np.int64).reshape(-1, 3)
position = attributes['POSITION']
roots = island_roots(triangles, len(position))[triangles[:, 0]]
extent = {}
for root in np.unique(roots):
    vertices = np.unique(triangles[roots == root])
    extent[root] = float((position[vertices].max(0) - position[vertices].min(0)).max())
kept = triangles[np.array([extent[r] >= THRESHOLD for r in roots])]
used = np.unique(kept)
remap = np.full(len(position), -1); remap[used] = np.arange(len(used))
kept = remap[kept].astype(np.uint16 if len(used) < 65536 else np.uint32)

# Rebuild the binary chunk: every other buffer view is copied verbatim.
replaced = {primitive['attributes'][name]: attributes[name][used] for name in attributes}
replaced[primitive['indices']] = kept.reshape(-1)
chunks, offset, views = [], 0, []
view_of = {}
for index, view in enumerate(doc['bufferViews']):
    owner = next((a for a, acc in enumerate(doc['accessors']) if acc.get('bufferView') == index), None)
    block = np.ascontiguousarray(replaced[owner]).tobytes() if owner in replaced else binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
    views.append({**view, 'byteOffset': offset, 'byteLength': len(block)})
    block += b'\0' * (-len(block) % 4); chunks.append(block); offset += len(block)
for index, array in replaced.items():
    accessor = doc['accessors'][index]
    accessor['count'] = len(array)
    if index == primitive['indices']:
        accessor['componentType'] = 5123 if array.dtype == np.uint16 else 5125
        accessor['max'] = [int(array.max())]; accessor['min'] = [int(array.min())]
    elif 'max' in accessor:
        accessor['max'] = array.max(0).tolist(); accessor['min'] = array.min(0).tolist()
doc['bufferViews'] = views
doc['buffers'][0]['byteLength'] = offset
blob = b''.join(chunks)
meta = json.dumps(doc, separators=(',', ':')).encode(); meta += b' ' * (-len(meta) % 4)
PATH.write_bytes(struct.pack('<III', 0x46546C67, 2, 28 + len(meta) + len(blob)) + struct.pack('<II', len(meta), 0x4E4F534A) + meta + struct.pack('<II', len(blob), 0x004E4942) + blob)
print(f'branches {len(triangles)} -> {len(kept)} triangles, {len(position)} -> {len(used)} vertices; {len(data)} -> {PATH.stat().st_size} bytes')
