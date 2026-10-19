"""Empacota os props do Tripo Studio para a cabine do Gameplay (Trator MAX).

Roda dentro do Blender (headless):

    blender -b --factory-startup --python scripts/gameplay/package-tripo-props.py -- \
        ORIGEM_DIR [SAIDA_DIR]

ORIGEM_DIR tem gv-console/gv-console.glb, gv-banco/gv-banco.glb e
gv-fardo/gv-fardo.glb exportados do Tripo (texto -> 3D, PBR). Para cada um:
decimação planar+colapso até a meta de triângulos, atlas reduzidos, export GLB
com as imagens embutidas e as mesmas imagens em arquivos externos (contrato de
CSP de restoreSompoTextures: GLB + .textures.json), mais .provenance.json.
A orientação fica a do Tripo (+Y cima, frente em +Z); o encaixe na cabine é
do carregador (src/components/gameplay/visual/).
"""

import datetime
import hashlib
import json
import struct
import sys
from pathlib import Path

import bpy

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SOURCE = Path(ARGS[0]) if ARGS else Path('.sompo-preview/gv/tripo')
OUT = Path(ARGS[1]) if len(ARGS) > 1 else Path('public/models/gameplay')
OUT.mkdir(parents=True, exist_ok=True)

# Prompt, projeto e meta de cada asset. O gasto de créditos foi anunciado no QUADRO da missão.
PROPS = {
    'gv-console': {
        'stem': 'cabine-console',
        'project': '241a1da3-eda5-44c4-a306-1d0aedabb09d',
        'faces': 15000, 'texture': 2048,
        'targetTriangles': 9000, 'atlas': 1024,
        'prompt': 'Tractor cab dashboard console: a compact molded dark grey plastic instrument housing with an angled '
                  'top face holding one round analog gauge on each side and a flat blank rectangular screen in the '
                  'centre, a few small rocker switches and a key slot below, satin rugged agricultural plastic, '
                  'realistic PBR game prop, no logos, no text, no steering wheel, no base',
    },
    'gv-banco': {
        'stem': 'cabine-banco',
        'project': '7a95bf12-780b-4b8f-976b-c11711f3f758',
        'faces': 15000, 'texture': 2048,
        'targetTriangles': 8000, 'atlas': 1024,
        'prompt': 'Tractor operator seat: padded black vinyl suspension seat with a tall backrest, short armrests on '
                  'both sides and a black steel suspension base, slightly worn, realistic PBR game prop, no logos, '
                  'no text, no base, no ground',
    },
    'gv-fardo': {
        'stem': 'fardo-feno',
        'project': 'fcc7384e-d85b-439d-b464-a082e76e3b4f',
        'faces': 12000, 'texture': 1024,
        # A palha solta abre buracos no colapso a 6k (prints/visual-i3-tripo-otimizado.png): decima pouco.
        # Visto de longe, o atlas cai para 512 e fica dentro do orçamento de 1,5 MB.
        'targetTriangles': 9500, 'atlas': 512,
        'prompt': 'Round hay bale lying on its side, tightly rolled dry golden straw with visible spiral layers on the '
                  'flat faces and loose strands on the surface, wrapped with a few thin net twine lines, realistic '
                  'PBR game prop, no ground, no base',
    },
}
ROLES = {'normalTexture': 'normal', 'baseColorTexture': 'basecolor', 'metallicRoughnessTexture': 'metallicroughness'}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def triangles(mesh_objects):
    total = 0
    for obj in mesh_objects:
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def read_glb(path):
    data = path.read_bytes()
    length = struct.unpack_from('<I', data, 12)[0]
    return data, json.loads(data[20:20 + length]), data[28 + length:]


for key, spec in PROPS.items():
    source = SOURCE / key / f'{key}.glb'
    source_bytes = source.read_bytes()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    assert len(meshes) == 1, f'{key}: esperava 1 malha do Tripo, veio {len(meshes)}'
    obj = meshes[0]
    before = triangles(meshes)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    # Colapso preserva UV (seams delimitadas) e silhueta; triangula no fim para contar igual ao glTF.
    ratio = min(1.0, spec['targetTriangles'] / before)
    mod = obj.modifiers.new('decimar', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    mod.delimit = {'SEAM', 'UV'}
    bpy.ops.object.modifier_apply(modifier=mod.name)
    after = triangles(meshes)
    for image in bpy.data.images:
        if image.size[0] > spec['atlas']:
            image.scale(spec['atlas'], spec['atlas'])
    obj.name = spec['stem']
    obj.data.name = spec['stem']
    for slot in obj.material_slots:
        slot.material.name = f'{spec["stem"]}-pbr'
    glb = OUT / f'{spec["stem"]}.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', export_image_format='JPEG',
                              export_jpeg_quality=82, export_yup=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_tangents=False,
                              export_materials='EXPORT', export_animations=False, export_extras=False)

    data, document, binary = read_glb(glb)
    images = []
    for material in document['materials']:
        pbr = material.get('pbrMetallicRoughness', {})
        for field, info in (('normalTexture', material.get('normalTexture')),
                            ('baseColorTexture', pbr.get('baseColorTexture')),
                            ('metallicRoughnessTexture', pbr.get('metallicRoughnessTexture'))):
            if not info:
                continue
            source_index = document['textures'][info['index']]['source']
            while len(images) <= source_index:
                images.append(None)
            images[source_index] = ROLES[field]
    manifest = []
    for index, image in enumerate(document.get('images', [])):
        view = document['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        assert image['mimeType'] == 'image/jpeg', f'{key}: imagem {index} não é JPEG'
        filename = f'{spec["stem"]}-{images[index] or f"image-{index}"}.jpg'
        (OUT / filename).write_bytes(binary[start:start + view['byteLength']])
        manifest.append(filename)
    (OUT / f'{spec["stem"]}.textures.json').write_text(json.dumps({'images': manifest}, indent=2) + '\n', encoding='utf-8')

    tris = sum(document['accessors'][p['indices']]['count'] // 3 for m in document['meshes'] for p in m['primitives'])
    accessor = document['accessors'][document['meshes'][0]['primitives'][0]['attributes']['POSITION']]
    provenance = {
        'asset': glb.name,
        'generatedBy': 'Tripo Studio (studio.tripo3d.ai), texto -> 3D com textura PBR detalhada, pela conta do dono',
        'createdAt': datetime.date.today().isoformat(),
        'tripoProject': spec['project'],
        'tripoUrl': f'https://studio.tripo3d.ai/workspace/generate/{spec["project"]}',
        'prompt': spec['prompt'],
        'tripoExport': {'faces': spec['faces'], 'textureResolution': spec['texture'], 'format': 'glb',
                        'sourceSha256': sha256(source_bytes), 'sourceBytes': len(source_bytes),
                        'sourceTriangles': before},
        'packaging': {
            'tool': f'Blender {bpy.app.version_string}, scripts/gameplay/package-tripo-props.py',
            'decimate': {'type': 'COLLAPSE', 'ratio': round(ratio, 4), 'delimit': ['SEAM', 'UV']},
            'atlas': spec['atlas'], 'jpegQuality': 82,
        },
        'triangles': tris,
        'boundsM': {'min': accessor['min'], 'max': accessor['max']},
        'axes': {'up': '+Y', 'front': '+Z (encaixe e escala no carregador da cabine)'},
        'externalManifest': f'{spec["stem"]}.textures.json',
        'license': 'GAMEPLAY-ASSET-LICENSE.txt',
        'reproducibleCommand': 'blender -b --factory-startup --python scripts/gameplay/package-tripo-props.py -- '
                               '.sompo-preview/gv/tripo public/models/gameplay',
        'sha256': sha256(data),
        'bytes': len(data),
    }
    (OUT / f'{spec["stem"]}.provenance.json').write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + '\n',
                                                         encoding='utf-8')
    print(f'TRIPO_PROP {spec["stem"]} {before}->{tris} tris, {len(data)} bytes, imagens {manifest}')
