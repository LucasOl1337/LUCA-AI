"""Empacota a Coruja 3D do Totem (variante `coruja-3d`) a partir do rig do Tripo Studio.

Roda dentro do Blender (headless):

    blender -b --factory-startup --python scripts/stand/package-coruja-3d.py -- \
        RIG_DECODIFICADO.glb [SAIDA_DIR]

RIG_DECODIFICADO.glb é o `model_url` da operação de Auto Rig ("Other", esqueleto
avian) do Tripo, passado por `gltf-transform dequantize` (o Tripo entrega com
meshopt + quantização, que o importador do Blender não lê). O script:

1. cria as animações por estado de voz do Totem (ocioso, ouvindo, pensando,
   falando) e um aceno de uma vez, em 30 fps;
2. gera um mapa emissivo a partir dos frisos azul-claros da cor base (visor,
   fones, microfone), para o brilho acompanhar a voz no three.js;
3. decima de leve (colapso com seams/UV preservadas) e reduz os atlas;
4. exporta o GLB com as imagens embutidas e as mesmas imagens em arquivos
   externos (contrato de CSP de restoreSompoTextures: GLB + .textures.json),
   mais .provenance.json.

Frente do modelo em +X do Blender (continua +X no glTF; o export +Y-up só
troca cima), cima em +Z, asa direita da coruja em -Y. Ossos usados: Spine_0 (tronco),
Head_1/Head_2 (pescoço/cabeça), bone_10/11 (asa direita: ombro/antebraço),
bone_12/13 (asa esquerda). Head_0 carrega as asas, então nunca é girado.
Rotações são dadas em eixos do mundo e convertidas para o espaço de repouso de
cada osso. O rig não tem osso de bico/pálpebra (testado: bone_6..9 e bone_14
movem os penachos); piscar e bico vêm de uma malha extra com shape keys
(`coruja3d_rosto.py`), presa 100% à cabeça.
"""
import datetime
import hashlib
import json
import struct
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Quaternion, Vector

args = sys.argv[sys.argv.index('--') + 1:]
SRC = Path(args[0])
OUT = Path(args[1]) if len(args) > 1 else Path('public/stand/avatar/coruja-3d')
OUT.mkdir(parents=True, exist_ok=True)
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SRC))
for o in list(bpy.context.scene.objects):
    if o.type == 'MESH' and not o.vertex_groups:
        bpy.data.objects.remove(o)  # Icosphere solta do Tripo
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
arm.name = 'CorujaRig'
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
mesh.name = 'Coruja'
mesh.data.name = 'Coruja'
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
bpy.context.scene.render.fps = FPS

X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
OSSOS = {
    'tronco': 'tripo::Spine_0', 'pescoco': 'tripo::Head_1', 'cabeca': 'tripo::Head_2',
    'asaD': 'bone_10', 'antD': 'bone_11', 'asaE': 'bone_12', 'antE': 'bone_13',
}
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'


def local(nome, rot):
    """rot: lista de (eixo_mundo, graus) aplicadas em ordem -> quaternion local do osso."""
    pb = arm.pose.bones[OSSOS[nome]]
    R = (arm.matrix_world @ pb.bone.matrix_local).to_quaternion()
    if isinstance(rot, Quaternion):
        return R.inverted() @ rot @ R
    q = Quaternion()
    for eixo, graus in rot:
        q = Quaternion(eixo, math.radians(graus)) @ q
    return R.inverted() @ q @ R


def asa(lado, abre=0.0, frente=0.0):
    """Asa: abre para fora (graus) e leva para a frente (graus). lado 'D' ou 'E'."""
    s = -1 if lado == 'D' else 1
    return [(X, s * abre), (Y, -frente)]


def asa_alvo(lado, cotovelo, ponta):
    """Aponta ombro->cotovelo e cotovelo->ponta para pontos do mundo (repouso do rig).

    Devolve {asa: q_mundo, ant: q_relativo}; o antebraço gira no frame já girado pelo ombro.
    """
    o_asa, o_ant = ('asaD', 'antD') if lado == 'D' else ('asaE', 'antE')
    b1 = arm.data.bones[OSSOS[o_asa]]
    b2 = arm.data.bones[OSSOS[o_ant]]
    d1 = (b1.tail_local - b1.head_local).normalized()
    q1 = d1.rotation_difference((Vector(cotovelo) - b1.head_local).normalized())
    d2 = q1 @ (b2.tail_local - b2.head_local).normalized()
    q2w = d2.rotation_difference((Vector(ponta) - Vector(cotovelo)).normalized())
    return {o_asa: q1, o_ant: q1.inverted() @ q2w @ q1}


def acao(nome, quadros, chaves, ciclo=True):
    """chaves: {segundos: {osso: rot | ('esc', fator)}}; ossos ausentes ficam em repouso."""
    act = bpy.data.actions.new(nome)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    usados = sorted({o for pose in chaves.values() for o in pose})
    for t, pose in sorted(chaves.items()):
        f = 1 + round(t * FPS)
        for o in usados:
            pb = arm.pose.bones[OSSOS[o]]
            v = pose.get(o, [])
            if isinstance(v, tuple) and v and v[0] == 'q':
                v = v[1]
            if isinstance(v, tuple) and v[0] == 'esc':
                pb.rotation_quaternion = Quaternion()
                pb.scale = Vector((v[1], v[1], v[1]))
                pb.keyframe_insert('scale', frame=f)
                continue
            pb.rotation_quaternion = local(o, v)
            pb.keyframe_insert('rotation_quaternion', frame=f)
    for fc in act.fcurves if hasattr(act, 'fcurves') else []:
        for k in fc.keyframe_points:
            k.interpolation = 'BEZIER'
    if ciclo:
        assert min(chaves) == 0 and math.isclose(max(chaves), quadros / FPS), nome
    track = arm.animation_data.nla_tracks.new()
    track.name = nome
    track.strips.new(nome, 1, act)
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.scale = Vector((1, 1, 1))
    print('ACAO', nome, quadros)


# Ocioso: respira, olha em volta devagar, asas acompanham o fôlego. 6 s.
acao('ocioso', 180, {
    0.0: {'tronco': [], 'pescoco': [], 'cabeca': [], 'asaD': asa('D', 0), 'asaE': asa('E', 0)},
    1.5: {'tronco': [(Y, 2.5)], 'pescoco': [(Z, 14)], 'cabeca': [(Y, 3)], 'asaD': asa('D', 4), 'asaE': asa('E', 4)},
    3.0: {'tronco': [], 'pescoco': [(Z, 2)], 'cabeca': [], 'asaD': asa('D', 0), 'asaE': asa('E', 0)},
    4.5: {'tronco': [(Y, 2.5)], 'pescoco': [(Z, -12)], 'cabeca': [(Y, -2)], 'asaD': asa('D', 4), 'asaE': asa('E', 4)},
    6.0: {'tronco': [], 'pescoco': [], 'cabeca': [], 'asaD': asa('D', 0), 'asaE': asa('E', 0)},
})

# Ouvindo: inclina a cabeça de lado (coruja curiosa), tronco à frente, asas atentas. 4 s.
acao('ouvindo', 120, {
    0.0: {'tronco': [(Y, 5)], 'pescoco': [(X, 16)], 'cabeca': [(Y, 4)], 'asaD': asa('D', 7), 'asaE': asa('E', 7)},
    1.0: {'tronco': [(Y, 6)], 'pescoco': [(X, 20), (Z, 4)], 'cabeca': [(Y, 6)], 'asaD': asa('D', 9), 'asaE': asa('E', 6)},
    2.0: {'tronco': [(Y, 5)], 'pescoco': [(X, 15)], 'cabeca': [(Y, 3)], 'asaD': asa('D', 7), 'asaE': asa('E', 8)},
    3.0: {'tronco': [(Y, 6)], 'pescoco': [(X, 19), (Z, -3)], 'cabeca': [(Y, 5)], 'asaD': asa('D', 8), 'asaE': asa('E', 7)},
    4.0: {'tronco': [(Y, 5)], 'pescoco': [(X, 16)], 'cabeca': [(Y, 4)], 'asaD': asa('D', 7), 'asaE': asa('E', 7)},
})

# Pensando: olha para cima e de lado com asas recolhidas, balança devagar. 5 s.
# (Asa no "queixo" atravessa o peito com este rig; testado e descartado.)
acao('pensando', 150, {
    0.0: {'tronco': [(Y, -2)], 'pescoco': [(X, -10), (Z, 10)], 'cabeca': [(Y, -9)], 'asaD': asa('D', -3, 6), 'asaE': asa('E', -3, 6)},
    1.25: {'tronco': [(Y, -3)], 'pescoco': [(X, -12), (Z, 16)], 'cabeca': [(Y, -12)], 'asaD': asa('D', -4, 6), 'asaE': asa('E', -4, 6)},
    2.5: {'tronco': [(Y, -2)], 'pescoco': [(X, -8), (Z, 6)], 'cabeca': [(Y, -8)], 'asaD': asa('D', -3, 6), 'asaE': asa('E', -3, 6)},
    3.75: {'tronco': [(Y, -3)], 'pescoco': [(X, -11), (Z, 14)], 'cabeca': [(Y, -11)], 'asaD': asa('D', -4, 6), 'asaE': asa('E', -4, 6)},
    5.0: {'tronco': [(Y, -2)], 'pescoco': [(X, -10), (Z, 10)], 'cabeca': [(Y, -9)], 'asaD': asa('D', -3, 6), 'asaE': asa('E', -3, 6)},
})

# Falando: gesticula alternando as asas, acena com a cabeça e balança o tronco. 4 s.
acao('falando', 120, {
    0.0: {'tronco': [], 'pescoco': [], 'cabeca': [(Y, 4)], 'asaD': asa('D', 6, 8), 'antD': [], 'asaE': asa('E', 6, 8), 'antE': []},
    0.5: {'tronco': [(Z, 4)], 'pescoco': [(Z, -6)], 'cabeca': [(Y, -3)], 'asaD': asa('D', 10, 10), 'antD': [], 'asaE': asa('E', 28, 30), 'antE': [(Y, -25)]},
    1.0: {'tronco': [(Z, 2)], 'pescoco': [(Z, -4)], 'cabeca': [(Y, 6)], 'asaD': asa('D', 8, 8), 'antD': [], 'asaE': asa('E', 14, 18), 'antE': [(Y, -10)]},
    1.5: {'tronco': [], 'pescoco': [(X, 6)], 'cabeca': [(Y, -2)], 'asaD': asa('D', 6, 8), 'antD': [], 'asaE': asa('E', 6, 8), 'antE': []},
    2.0: {'tronco': [], 'pescoco': [], 'cabeca': [(Y, 5)], 'asaD': asa('D', 6, 8), 'antD': [], 'asaE': asa('E', 6, 8), 'antE': []},
    2.5: {'tronco': [(Z, -4)], 'pescoco': [(Z, 6)], 'cabeca': [(Y, -3)], 'asaD': asa('D', 28, 30), 'antD': [(Y, -25)], 'asaE': asa('E', 10, 10), 'antE': []},
    3.0: {'tronco': [(Z, -2)], 'pescoco': [(Z, 4)], 'cabeca': [(Y, 6)], 'asaD': asa('D', 14, 18), 'antD': [(Y, -10)], 'asaE': asa('E', 8, 8), 'antE': []},
    3.5: {'tronco': [], 'pescoco': [(X, -6)], 'cabeca': [(Y, -2)], 'asaD': asa('D', 6, 8), 'antD': [], 'asaE': asa('E', 6, 8), 'antE': []},
    4.0: {'tronco': [], 'pescoco': [], 'cabeca': [(Y, 4)], 'asaD': asa('D', 6, 8), 'antD': [], 'asaE': asa('E', 6, 8), 'antE': []},
}, ciclo=True)

# Aceno: levanta a asa direita e balança o antebraço três vezes. 2,6 s, uma vez.
aceno = {0.0: {'pescoco': [], 'asaD': asa('D', 0), 'antD': []}}
aceno[0.45] = {'pescoco': [(X, 8)], 'asaD': asa('D', 105, 10), 'antD': [(X, -20)]}
for i, t in enumerate((0.7, 0.95, 1.2, 1.45, 1.7, 1.95)):
    aceno[t] = {'pescoco': [(X, 8 + (2 if i % 2 else -2))], 'asaD': asa('D', 105, 10), 'antD': [(X, 25 if i % 2 == 0 else -20)]}
aceno[2.6] = {'pescoco': [], 'asaD': asa('D', 0), 'antD': []}
acao('aceno', 78, aceno, ciclo=False)

# Emissivo: frisos azul-claros brilhantes da cor base (visor, fones, mic, frisos da armadura).
mat = mesh.material_slots[0].material
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
base_img = bsdf.inputs['Base Color'].links[0].from_node.image
w, h = base_img.size
px = np.array(base_img.pixels[:], dtype=np.float32).reshape(h, w, 4)
r, g, b = px[..., 0], px[..., 1], px[..., 2]
mx_, mn_ = px[..., :3].max(-1), px[..., :3].min(-1)
sat = (mx_ - mn_) / np.maximum(mx_, 1e-4)
mask = ((b > 0.55) & (sat > 0.35) & (g > 0.25) & (b > r + 0.25)).astype(np.float32)
mask = np.clip(mask * (b - 0.45) * 2.2, 0, 1)
em = np.zeros_like(px)
em[..., :3] = px[..., :3] * mask[..., None]
em[..., 3] = 1
em_img = bpy.data.images.new('coruja-emissivo', w, h)
em_img.pixels = em.ravel()
em_img.scale(512, 512)
tex = nt.nodes.new('ShaderNodeTexImage')
tex.image = em_img
nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
bsdf.inputs['Emission Strength'].default_value = 1.0
print('EMISSIVO cobre', float((mask > 0.05).mean()))


STEM = 'coruja-3d'
ALVO_TRIANGULOS = 20000
ATLAS = 1024
QUALIDADE_JPEG = 84
ROLES = {'normalTexture': 'normal', 'baseColorTexture': 'basecolor',
         'metallicRoughnessTexture': 'metallicroughness', 'emissiveTexture': 'emissive'}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def triangulos(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def ler_glb(path):
    data = path.read_bytes()
    tamanho = struct.unpack_from('<I', data, 12)[0]
    return data, json.loads(data[20:20 + tamanho]), data[28 + tamanho:]


antes = triangulos(mesh)
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
mod = mesh.modifiers.new('decimar', 'DECIMATE')
mod.decimate_type = 'COLLAPSE'
mod.ratio = min(1.0, ALVO_TRIANGULOS / antes)
mod.use_collapse_triangulate = True
mod.delimit = {'SEAM', 'UV'}
# Armature vem antes na pilha; o decimate tem de ir para o topo antes de aplicar.
bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
bpy.ops.object.modifier_apply(modifier=mod.name)
# Pálpebras e bico inferior: malha extra com shape keys `piscar` e `bico_abre` (ver coruja3d_rosto.py).
sys.path.insert(0, str(Path(__file__).resolve().parent))
from coruja3d_rosto import adicionar_rosto  # noqa: E402
rosto = adicionar_rosto(mesh, arm)
for image in bpy.data.images:
    if image.size[0] > ATLAS:
        image.scale(ATLAS, ATLAS)
mat.name = f'{STEM}-pbr'

glb = OUT / f'{STEM}.glb'
bpy.ops.export_scene.gltf(
    filepath=str(glb), export_format='GLB', export_image_format='JPEG', export_jpeg_quality=QUALIDADE_JPEG,
    export_yup=True, export_texcoords=True, export_normals=True, export_tangents=False,
    export_materials='EXPORT', export_animations=True, export_animation_mode='NLA_TRACKS',
    export_skins=True, export_extras=False, export_optimize_animation_size=True)

data, documento, binario = ler_glb(glb)
papeis = {}
for material in documento['materials']:
    pbr = material.get('pbrMetallicRoughness', {})
    for campo, info in (('normalTexture', material.get('normalTexture')),
                        ('baseColorTexture', pbr.get('baseColorTexture')),
                        ('metallicRoughnessTexture', pbr.get('metallicRoughnessTexture')),
                        ('emissiveTexture', material.get('emissiveTexture'))):
        if info:
            papeis[documento['textures'][info['index']]['source']] = ROLES[campo]
manifesto = []
for indice, imagem in enumerate(documento.get('images', [])):
    view = documento['bufferViews'][imagem['bufferView']]
    inicio = view.get('byteOffset', 0)
    assert imagem['mimeType'] == 'image/jpeg', f'imagem {indice} não é JPEG'
    nome = f'{STEM}-{papeis.get(indice, f"image-{indice}")}.jpg'
    (OUT / nome).write_bytes(binario[inicio:inicio + view['byteLength']])
    manifesto.append(nome)
(OUT / f'{STEM}.textures.json').write_text(json.dumps({'images': manifesto}, indent=2) + '\n', encoding='utf-8')

tris = sum(documento['accessors'][p['indices']]['count'] // 3 for m in documento['meshes'] for p in m['primitives'])
pos = documento['accessors'][documento['meshes'][0]['primitives'][0]['attributes']['POSITION']]
fonte = SRC.read_bytes()
proveniencia = {
    'asset': glb.name,
    'generatedBy': 'Tripo Studio (studio.tripo3d.ai), imagem -> 3D (H3.1, PBR) e Auto Rig "Other" (avian), pela conta do dono',
    'createdAt': datetime.date.today().isoformat(),
    'reference': 'Imagem frontal de corpo inteiro gerada por cx/gpt-5.6-sol-image (9Router) a partir de '
                 'public/stand/avatar/coruja-a/coruja-a-1024.png, para manter a identidade da Coruja A',
    'tripoProject': 'f66f3bb8-0f29-4aa1-89a8-15564f97ac2b',
    'tripoUrl': 'https://studio.tripo3d.ai/workspace/generate/f66f3bb8-0f29-4aa1-89a8-15564f97ac2b',
    'tripoOperations': {'generate': 'be17927f-e461-403c-9033-824fb1141468',
                        'autoRig': '3756a343-ec50-45d7-bd60-b396e7c5350a'},
    'tripoCredits': 75,
    'tripoExport': {'faces': 30000, 'format': 'glb (meshopt + quantização, decodificado com gltf-transform dequantize)',
                    'sourceSha256': sha256(fonte), 'sourceBytes': len(fonte), 'sourceTriangles': antes,
                    'joints': len(arm.data.bones)},
    'packaging': {
        'tool': f'Blender {bpy.app.version_string}, scripts/stand/package-coruja-3d.py',
        'decimate': {'type': 'COLLAPSE', 'ratio': round(mod.ratio, 4), 'delimit': ['SEAM', 'UV']},
        'atlas': ATLAS, 'jpegQuality': QUALIDADE_JPEG,
        'emissive': 'frisos azul-claros da cor base (visor, fones, microfone), 512 px',
        'rosto': 'malha CorujaRosto (100% tripo::Head_2) com morph targets piscar e bico_abre, '
                 'scripts/stand/coruja3d_rosto.py',
    },
    'morphTargets': [k.name for k in rosto.data.shape_keys.key_blocks[1:]],
    'animations': {a.name: round(a.frame_range[1] - a.frame_range[0]) for a in bpy.data.actions},
    'fps': FPS,
    'triangles': tris,
    'boundsM': {'min': pos['min'], 'max': pos['max']},
    'axes': {'up': '+Y', 'front': '+X (o componente gira -90° em Y para olhar a câmera)'},
    'externalManifest': f'{STEM}.textures.json',
    'reproducibleCommand': 'gltf-transform dequantize RIG_TRIPO.glb rig-decoded.glb && '
                           'blender -b --factory-startup --python scripts/stand/package-coruja-3d.py -- '
                           'rig-decoded.glb public/stand/avatar/coruja-3d',
    'sha256': sha256(data),
    'bytes': len(data),
}
(OUT / f'{STEM}.provenance.json').write_text(json.dumps(proveniencia, indent=2, ensure_ascii=False) + '\n',
                                            encoding='utf-8')
print(f'CORUJA_3D {antes}->{tris} tris, {len(data)} bytes, imagens {manifesto}')
