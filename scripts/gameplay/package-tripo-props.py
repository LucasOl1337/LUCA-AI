"""Empacota os props do Tripo Studio para a cabine do Gameplay (Trator MAX).

Roda dentro do Blender (headless):

    blender -b --factory-startup --python scripts/gameplay/package-tripo-props.py -- \
        ORIGEM_DIR [SAIDA_DIR]

ORIGEM_DIR tem gv-<prop>/gv-<prop>.glb exportados do Tripo (texto -> 3D, PBR):
console, banco, fardo, volante e teto. Só empacota os que estiverem lá, então dá
para refazer um prop sem baixar os outros de novo. Para cada um:
decimação planar+colapso até a meta de triângulos, atlas reduzidos, export GLB
com as imagens embutidas e as mesmas imagens em arquivos externos (contrato de
CSP de restoreSompoTextures: GLB + .textures.json), mais .provenance.json.
A orientação fica a do Tripo (+Y cima, frente em +Z); o encaixe na cabine é
do carregador (src/components/gameplay/visual/). O volante é a exceção: sai com
o centro do aro na origem, o eixo da coluna em +Y (face do aro para +Y, lado do
operador) e o raio do aditivo em -Z, para o carregador alinhar ao rig da cabine.
"""

import datetime
import hashlib
import json
import struct
import sys
from pathlib import Path

import bpy

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SOURCE = Path(ARGS[0]) if ARGS else Path('.sompo-preview/gv2/tripo')
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
        # A palha solta abre buracos no colapso a 6k (prints/visual-i3-tripo-otimizado.png): decima pouco.
        # O fardo do obstáculo chega a 3 m do olho: com atlas 512 a palha virava borrão
        # (gameplay-visual-20261021/antes/05-dirigindo.png). Reexportado a 2048 e reduzido a 1024.
        'faces': 12000, 'texture': 2048,
        'targetTriangles': 9500, 'atlas': 1024,
        'prompt': 'Round hay bale lying on its side, tightly rolled dry golden straw with visible spiral layers on the '
                  'flat faces and loose strands on the surface, wrapped with a few thin net twine lines, realistic '
                  'PBR game prop, no ground, no base',
    },
    'gv-volante': {
        'stem': 'cabine-volante',
        'project': '77b91aba-e09f-4a00-a6cd-44839b797bb7',
        'faces': 15000, 'texture': 2048,
        # Ocupa o meio da tela em toda a corrida: o aro de borracha precisa de silhueta redonda.
        'targetTriangles': 7000, 'atlas': 1024, 'orientar': 'volante', 'raioDeBaixoRad': 0.611,
        'prompt': 'Tractor steering wheel only: round black three-spoke steering wheel with a thick textured rubber '
                  'grip rim, a dark grey centre hub cap and a small black spinner knob on the rim, realistic PBR game '
                  'prop, no logos, no text, no steering column, no base',
    },
    'gv-teto': {
        'stem': 'cabine-teto',
        # Rodada 2 (mundo do gameplay): o forro liso virava uma placa cinza chapada no alto da tela.
        # O console de teto (rádio, alto-falantes, difusores e cúpula) chega deitado para a frente:
        # a exportação do Studio veio com a face rica em -Y do Blender e o console no alto; antes
        # de empacotar, gira 180° em Z e 90° em Y (face rica para +Y, console para +X).
        'project': 'f9c8aa93-c59f-4092-b2f6-fea60d95c636',
        'faces': 15000, 'texture': 2048,
        'targetTriangles': 4000, 'atlas': 1024, 'soFaceAparente': 0.5, 'margemBorda': 0.04,
        'prompt': 'Tractor cab roof headliner panel seen from below: a flat rectangular moulded light grey textured '
                  'plastic ceiling panel with a raised central overhead console holding a car radio, two round speaker '
                  'grilles, four round adjustable air vents and a rectangular dome light, quilted padded edges, '
                  'realistic PBR game prop, no logos, n… (texto completo no projeto do Studio)',
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


def orientar_volante(obj, raio_baixo_rad):
    """Centro do aro na origem, eixo em +Z do Blender (+Y no glTF) e o raio de baixo em +Y do Blender (-Z no glTF).

    O plano do aro sai por PCA dos vértices afastados do eixo; o lado da coluna (cubo) é o -eixo.
    Gira em torno do eixo para que o raio de baixo (o único sem oposto no T) fique em +Y do Blender,
    que o export (+Y cima) leva para -Z do glTF.
    """
    import numpy as np
    from mathutils import Matrix, Vector
    # O nó do Tripo vem sob um pai com rotação; sem soltar, v.co (local) não é o espaço exportado.
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    pts = np.array([v.co[:] for v in obj.data.vertices])
    centro = pts.mean(axis=0)
    normal = np.linalg.eigh(np.cov((pts - centro).T))[1][:, 0]
    for _ in range(3):
        # Círculo do aro (ajuste algébrico de Kasa) no plano atual, partindo do centro da caixa;
        # a média dos vértices puxa para o lado do botão giratório e diverge.
        u = np.cross(normal, [0.0, 0.0, 1.0] if abs(normal[2]) < 0.9 else [1.0, 0.0, 0.0])
        u /= np.linalg.norm(u)
        v = np.cross(normal, u)
        q = np.stack([(pts - centro) @ u, (pts - centro) @ v], axis=1)
        c2 = (q.min(axis=0) + q.max(axis=0)) / 2
        raio = 0.9 * np.linalg.norm(q - c2, axis=1).max()
        for _ in range(8):
            sel = np.abs(np.linalg.norm(q - c2, axis=1) - raio) < 0.2 * raio
            a = np.column_stack([2 * q[sel], np.ones(sel.sum())])
            sol = np.linalg.lstsq(a, (q[sel] ** 2).sum(axis=1), rcond=None)[0]
            c2 = sol[:2]
            raio = float(np.sqrt(sol[2] + c2 @ c2))
        aro = pts[sel]
        raio_aro = raio
        centro = centro + c2[0] * u + c2[1] * v
        centro = centro + normal * float((aro - centro).mean(axis=0) @ normal)
        normal = np.linalg.eigh(np.cov((aro - aro.mean(axis=0)).T))[1][:, 0]
    dist = np.linalg.norm((pts - centro) - np.outer((pts - centro) @ normal, normal), axis=1)
    rel = pts - centro
    # Cubo e coluna ficam do lado oposto ao operador: o eixo aponta para longe deles.
    if (rel @ normal)[np.linalg.norm(rel - np.outer(rel @ normal, normal), axis=1) < 0.3 * dist.max()].mean() > 0:
        normal = -normal
    alinhar = Vector(normal.tolist()).rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4()
    obj.matrix_world = alinhar @ Matrix.Translation(-Vector(centro.tolist())) @ obj.matrix_world
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    pts = np.array([v.co[:] for v in obj.data.vertices])
    # Raio externo do aro (o botão giratório sobra para fora: percentil, não máximo).
    raio = float(np.percentile(np.linalg.norm(pts[:, :2], axis=1), 99.5))
    # Raio de baixo do T: ângulo no plano já alinhado, medido na vista de topo desta exportação
    # (histograma de vértices por ângulo não separa os raios do cubo e do botão giratório com segurança).
    raio_baixo = raio_baixo_rad
    obj.matrix_world = Matrix.Rotation(np.pi / 2 - raio_baixo, 4, 'Z') @ obj.matrix_world
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return {'rimRadiusM': round(raio_aro, 4), 'rimOuterRadiusM': round(raio, 4), 'spokeDownAlignedRad': raio_baixo_rad}


def so_face_aparente(obj, cos_minimo, margem):
    """Fica só a face que o operador vê (normal para +Y do Blender, -Z do glTF), sem a borda; devolve quantas saíram.

    O forro é visto só de baixo: o verso não aparece, e a borda levantada do Tripo
    tinha aletas que surgiam sob a viga da frente (juiz cego, rodada 1). A faixa de
    `margem` (fração do lado) em volta sai inteira; o carregador estica o que sobra.
    """
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    xs = [v.co.x for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    mx = (max(xs) - min(xs)) * margem
    mz = (max(zs) - min(zs)) * margem

    def na_borda(c):
        return c.x < min(xs) + mx or c.x > max(xs) - mx or c.z < min(zs) + mz or c.z > max(zs) - mz

    fora = [face for face in bm.faces if face.normal.y < cos_minimo or na_borda(face.calc_center_median())]
    bmesh.ops.delete(bm, geom=fora, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()
    return len(fora)


for key, spec in PROPS.items():
    source = SOURCE / key / f'{key}.glb'
    if not source.exists():
        print(f'TRIPO_PROP {key}: sem {source}, fica o empacotado')
        continue
    source_bytes = source.read_bytes()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    assert len(meshes) == 1, f'{key}: esperava 1 malha do Tripo, veio {len(meshes)}'
    obj = meshes[0]
    before = triangles(meshes)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    orientacao = orientar_volante(obj, spec['raioDeBaixoRad']) if spec.get('orientar') == 'volante' else None
    ilhas_fora = so_face_aparente(obj, spec['soFaceAparente'], spec.get('margemBorda', 0)) if spec.get('soFaceAparente') else 0
    if ilhas_fora:
        print(f'TRIPO_PROP {key}: {ilhas_fora} faces de borda e verso removidas')
    # Colapso preserva UV (seams delimitadas) e silhueta; triangula no fim para contar igual ao glTF.
    ratio = min(1.0, spec['targetTriangles'] / triangles(meshes))
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
            **({'hiddenFacesRemoved': ilhas_fora} if ilhas_fora else {}),
        },
        'triangles': tris,
        'boundsM': {'min': accessor['min'], 'max': accessor['max']},
        'axes': ({'axis': '+Y (eixo da coluna, face do aro para o operador)', 'spokeDown': '-Z',
                  'origin': 'centro do aro', **orientacao} if orientacao else
                 {'up': '+Y', 'front': '+Z (encaixe e escala no carregador da cabine)'}),
        'externalManifest': f'{spec["stem"]}.textures.json',
        'license': 'GAMEPLAY-ASSET-LICENSE.txt',
        'reproducibleCommand': 'blender -b --factory-startup --python scripts/gameplay/package-tripo-props.py -- '
                               f'{SOURCE} public/models/gameplay',
        'sha256': sha256(data),
        'bytes': len(data),
    }
    (OUT / f'{spec["stem"]}.provenance.json').write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + '\n',
                                                         encoding='utf-8')
    print(f'TRIPO_PROP {spec["stem"]} {before}->{tris} tris, {len(data)} bytes, imagens {manifest}')
