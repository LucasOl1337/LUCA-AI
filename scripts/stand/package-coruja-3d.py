"""Empacota a Coruja 3D do Totem (variante `coruja-3d`).

Roda dentro do Blender (headless):

    blender -b --factory-startup --python scripts/stand/package-coruja-3d.py -- \
        RIG_DECODIFICADO.glb ALTA.glb [SAIDA_DIR]

- RIG_DECODIFICADO.glb: Auto Rig "Other" (esqueleto avian) do Tripo na coruja do
  #16, passado por `gltf-transform dequantize`. Dá os ossos e os pesos.
- ALTA.glb: a coruja nova do Tripo Studio (imagem -> 3D H3.1, Ultra Mesh,
  textura 4K, Remove Lighting, PBR, 250 mil faces), export GLB do Studio.

O script:

1. alinha a malha alta à do rig (mesma referência, mesma pose) e cria uma
   malha leve por decimação, guardando mais detalhe no rosto;
2. mantém as UVs do Tripo (a decimação respeita as costuras) e reaproveita as
   texturas dele reduzidas: cor base e normal 2048, metal/rugosidade 1024;
3. tira os olhos pintados do visor e cria a tela dos olhos (`CorujaOlhos`), o
   bico que abre (`bico_abre`) e a boca (`CorujaRosto`), em coruja3d_rosto.py;
4. transfere os pesos do rig antigo (mesma silhueta) e cria as animações por
   estado de voz, o aceno de entrada e o feliz, em 30 fps;
5. exporta o GLB sem imagens dentro: elas vão em arquivos ao lado (`uri`), o
   contrato de CSP de restoreSompoTextures (GLB + .textures.json), mais
   .provenance.json.

Frente do modelo em +X do Blender (continua +X no glTF; o export +Y-up só
troca cima), cima em +Z, asa direita da coruja em -Y. Ossos usados: Spine_0 (tronco),
Head_1/Head_2 (pescoço/cabeça), bone_10/11 (asa direita: ombro/antebraço),
bone_12/13 (asa esquerda). Head_0 carrega as asas, então nunca é girado.
Rotações são dadas em eixos do mundo e convertidas para o espaço de repouso de
cada osso.
"""
import datetime
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

args = sys.argv[sys.argv.index('--') + 1:]
SRC = Path(args[0])
ALTA = Path(args[1])
OUT = Path(args[2]) if len(args) > 2 else Path('public/stand/avatar/coruja-3d')
OUT.mkdir(parents=True, exist_ok=True)
FPS = 30
STEM = 'coruja-3d'
ALVO_TRIANGULOS = 38000
ATLAS = 2048          # cor base
ATLAS_NORMAL = 2048
ATLAS_MR = 1024
ATLAS_EMISSIVO = 512
QUALIDADE_JPEG = 86
FOSCO_BRANCO = 0.62  # rugosidade mínima do branco (penas e casco)

sys.path.insert(0, str(Path(__file__).resolve().parent))
import coruja3d_rosto as rosto_mod  # noqa: E402

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = FPS


def importar(caminho):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(caminho))
    return [o for o in bpy.data.objects if o not in antes]


def pontos(obj):
    co = np.empty(len(obj.data.vertices) * 3, np.float32)
    obj.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    mw = np.array(obj.matrix_world)
    return co @ mw[:3, :3].T + mw[:3, 3]


def triangulos(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def ativar(obj, *outros):
    bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode != 'OBJECT' else None
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in outros:
        o.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


# 1. Rig antigo (ossos + pesos) e malha alta nova.
for o in importar(SRC):
    if o.type == 'MESH' and not o.vertex_groups:
        bpy.data.objects.remove(o)  # Icosphere solta do Tripo
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
arm.name = 'CorujaRig'
velha = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
velha.name = 'CorujaVelha'
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)

alta = next(o for o in importar(ALTA) if o.type == 'MESH')
alta.name = 'CorujaAlta'
alta.rotation_mode = 'XYZ'
alta.rotation_euler = (0, 0, math.radians(90))  # export do Studio olha para -Y
ativar(alta)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
pv, pa = pontos(velha), pontos(alta)
escala = (pv[:, 2].max() - pv[:, 2].min()) / (pa[:, 2].max() - pa[:, 2].min())
centro_v = (pv.min(0) + pv.max(0)) / 2
centro_a = (pa.min(0) + pa.max(0)) / 2
desloc = Vector((centro_v[0] - centro_a[0] * escala, centro_v[1] - centro_a[1] * escala,
                 pv[:, 2].min() - pa[:, 2].min() * escala))
alta.data.transform(Matrix.Translation(desloc) @ Matrix.Scale(escala, 4))
alta.data.update()
print('ALINHAMENTO escala', round(escala, 4), 'desloc', tuple(round(x, 4) for x in desloc))
TRIS_ALTA = triangulos(alta)

# Malha leve: decimação uniforme que respeita as costuras de UV do Tripo (delimit
# UV), para reaproveitar as texturas originais sem bake de cor. Decimate com
# vertex group é muito não linear (as pernas somem com qualquer peso), então não usa.
mesh = alta.copy()
mesh.data = alta.data.copy()
mesh.name = mesh.data.name = 'Coruja'
bpy.context.scene.collection.objects.link(mesh)
ativar(mesh)
mod = mesh.modifiers.new('decimar', 'DECIMATE')
mod.use_collapse_triangulate = True
mod.delimit = {'UV'}
lo, hi = 0.05, 0.6
for _ in range(10):
    mod.ratio = (lo + hi) / 2
    n = len(mesh.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.polygons)
    if abs(n - ALVO_TRIANGULOS) < ALVO_TRIANGULOS * 0.015:
        break
    lo, hi = (mod.ratio, hi) if n < ALVO_TRIANGULOS else (lo, mod.ratio)
RAZAO = mod.ratio
bpy.ops.object.modifier_apply(modifier='decimar')
for p in mesh.data.polygons:
    p.use_smooth = True
TRIS = triangulos(mesh)
pb = pontos(mesh)
print('DECIMADA', TRIS_ALTA, '->', TRIS, 'tris; vértices na cabeça', int((pb[:, 2] > 0.58).sum()), 'de', len(pb))

# 2. Texturas: as do Tripo (mesmas UVs), reduzidas. Sem bake.
mat_alta = alta.material_slots[0].material
nta = mat_alta.node_tree
bsdf_a = next(n for n in nta.nodes if n.type == 'BSDF_PRINCIPLED')


def imagem_de(entrada):
    no = bsdf_a.inputs[entrada].links[0].from_node
    while no.type != 'TEX_IMAGE':
        no = no.inputs['Color'].links[0].from_node if 'Color' in no.inputs else no.inputs[0].links[0].from_node
    return no.image


def reduzida(img, nome, tamanho, cor):
    nova = img.copy()
    nova.name = nome
    nova.colorspace_settings.name = 'sRGB' if cor else 'Non-Color'  # antes do scale: trocar recarrega
    nova.scale(tamanho, tamanho)
    assert tuple(nova.size) == (tamanho, tamanho), (nome, tuple(nova.size))
    return nova


img_base = reduzida(imagem_de('Base Color'), f'{STEM}-basecolor', ATLAS, True)
img_mr = reduzida(imagem_de('Roughness'), f'{STEM}-metallicroughness', ATLAS_MR, False)
img_normal = reduzida(imagem_de('Normal'), f'{STEM}-normal', ATLAS_NORMAL, False)

mesh.data.materials.clear()
mat = bpy.data.materials.new(f'{STEM}-pbr')
mat.use_nodes = True
mesh.data.materials.append(mat)
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')


def no_img(img):
    no = nt.nodes.new('ShaderNodeTexImage')
    no.image = img
    return no


n_base, n_mr, n_normal = no_img(img_base), no_img(img_mr), no_img(img_normal)

# 3. Olhos: tira os pintados (cor e normal) e cria a tela; bico e boca.
rosto_mod.apagar_olhos_pintados(mesh, n_base.image, n_normal.image)
h = w = ATLAS
base_px = np.array(n_base.image.pixels[:], np.float32).reshape(h, w, 4)[..., :3]

# Penas e casco brancos sem cara de plástico: o Tripo deixa trechos brancos com
# rugosidade ~0,2 e metal até ~0,5, que no three.js viram reflexo cromado. Onde a
# cor base é branca (pouca saturação, clara), metal ~0 e rugosidade mínima.
# Os frisos e placas azuis mantêm o brilho.
mr = np.array(n_mr.image.pixels[:], np.float32).reshape(ATLAS_MR, ATLAS_MR, 4)
passo = ATLAS // ATLAS_MR
cor = base_px.reshape(ATLAS_MR, passo, ATLAS_MR, passo, 3).mean((1, 3))
claro, escuro = cor.max(-1), cor.min(-1)
branco = ((claro - escuro) / np.maximum(claro, 1e-4) < 0.18) & (claro > 0.5)
mr[..., 1] = np.where(branco, np.maximum(mr[..., 1], FOSCO_BRANCO), mr[..., 1])
mr[..., 2] = np.where(branco, np.minimum(mr[..., 2], 0.04), mr[..., 2])
n_mr.image.pixels[:] = mr.ravel()
print('FOSCO', round(float(branco.mean()), 3))

nt.links.new(n_base.outputs['Color'], bsdf.inputs['Base Color'])
sep = nt.nodes.new('ShaderNodeSeparateColor')
nt.links.new(n_mr.outputs['Color'], sep.inputs['Color'])
nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
nmap = nt.nodes.new('ShaderNodeNormalMap')
nt.links.new(n_normal.outputs['Color'], nmap.inputs['Color'])
nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])

# 4. Pesos do rig antigo -> malha nova (superfície mais próxima, interpolada).
for g in velha.vertex_groups:
    mesh.vertex_groups.new(name=g.name)
ativar(mesh)
dt = mesh.modifiers.new('pesos', 'DATA_TRANSFER')
dt.object = velha
dt.use_vert_data = True
dt.data_types_verts = {'VGROUP_WEIGHTS'}
dt.vert_mapping = 'POLYINTERP_NEAREST'
dt.layers_vgroup_select_src = 'ALL'
dt.layers_vgroup_select_dst = 'NAME'
bpy.ops.object.modifier_apply(modifier=dt.name)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
mesh.parent = arm
mesh.matrix_parent_inverse = arm.matrix_world.inverted()
am = mesh.modifiers.new('Armature', 'ARMATURE')
am.object = arm
bpy.data.objects.remove(velha)
bpy.data.objects.remove(alta)

olhos = rosto_mod.malha_olhos(mesh, arm)
rosto = rosto_mod.bico(mesh, arm, base_px)


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


# Repouso frontal: a coruja olha para quem está na frente do totem. Guinada e
# inclinação de cabeça nos clipes ficam em poucos graus; o olhar de lado é um
# gesto curto e raro, somado no three.js (`cabecaViva`), que volta ao centro.

# Ocioso: respira (tronco e asas) e a cabeça só balança de leve. 6 s.
acao('ocioso', 180, {
    0.0: {'tronco': [], 'pescoco': [], 'cabeca': [], 'asaD': asa('D', 0), 'asaE': asa('E', 0)},
    1.5: {'tronco': [(Y, 2.0)], 'pescoco': [(Z, 2.0)], 'cabeca': [(Y, 1.5)], 'asaD': asa('D', 4), 'asaE': asa('E', 4)},
    3.0: {'tronco': [], 'pescoco': [(Z, 0.5)], 'cabeca': [], 'asaD': asa('D', 0), 'asaE': asa('E', 0)},
    4.5: {'tronco': [(Y, 2.0)], 'pescoco': [(Z, -1.5)], 'cabeca': [(Y, 1.0)], 'asaD': asa('D', 4), 'asaE': asa('E', 4)},
    6.0: {'tronco': [], 'pescoco': [], 'cabeca': [], 'asaD': asa('D', 0), 'asaE': asa('E', 0)},
})

# Ouvindo: tronco um pouco à frente, cabeça atenta e de frente, asas atentas. 4 s.
acao('ouvindo', 120, {
    0.0: {'tronco': [(Y, 4)], 'pescoco': [], 'cabeca': [(Y, 2)], 'asaD': asa('D', 6), 'asaE': asa('E', 6)},
    1.0: {'tronco': [(Y, 5)], 'pescoco': [(X, 2)], 'cabeca': [(Y, 3)], 'asaD': asa('D', 7), 'asaE': asa('E', 6)},
    2.0: {'tronco': [(Y, 4)], 'pescoco': [], 'cabeca': [(Y, 2)], 'asaD': asa('D', 6), 'asaE': asa('E', 7)},
    3.0: {'tronco': [(Y, 5)], 'pescoco': [(X, -2)], 'cabeca': [(Y, 3)], 'asaD': asa('D', 7), 'asaE': asa('E', 6)},
    4.0: {'tronco': [(Y, 4)], 'pescoco': [], 'cabeca': [(Y, 2)], 'asaD': asa('D', 6), 'asaE': asa('E', 6)},
})

# Pensando: ergue um pouco a cabeça (olha para cima), asas recolhidas, balança devagar. 5 s.
# (Asa no "queixo" atravessa o peito com este rig; testado e descartado.)
acao('pensando', 150, {
    0.0: {'tronco': [(Y, -1.5)], 'pescoco': [(X, -3), (Z, 2)], 'cabeca': [(Y, -6)], 'asaD': asa('D', -3, 6), 'asaE': asa('E', -3, 6)},
    1.25: {'tronco': [(Y, -2)], 'pescoco': [(X, -4), (Z, 3)], 'cabeca': [(Y, -7)], 'asaD': asa('D', -4, 6), 'asaE': asa('E', -4, 6)},
    2.5: {'tronco': [(Y, -1.5)], 'pescoco': [(X, -2), (Z, 1)], 'cabeca': [(Y, -5)], 'asaD': asa('D', -3, 6), 'asaE': asa('E', -3, 6)},
    3.75: {'tronco': [(Y, -2)], 'pescoco': [(X, -4), (Z, 3)], 'cabeca': [(Y, -7)], 'asaD': asa('D', -4, 6), 'asaE': asa('E', -4, 6)},
    5.0: {'tronco': [(Y, -1.5)], 'pescoco': [(X, -3), (Z, 2)], 'cabeca': [(Y, -6)], 'asaD': asa('D', -3, 6), 'asaE': asa('E', -3, 6)},
})

# Falando: gesticula alternando as asas, acena com a cabeça e balança o tronco. 4 s.
acao('falando', 120, {
    0.0: {'tronco': [], 'pescoco': [], 'cabeca': [(Y, 3)], 'asaD': asa('D', 6, 8), 'antD': [], 'asaE': asa('E', 6, 8), 'antE': []},
    0.5: {'tronco': [(Z, 3)], 'pescoco': [(Z, -2)], 'cabeca': [(Y, -2)], 'asaD': asa('D', 10, 10), 'antD': [], 'asaE': asa('E', 28, 30), 'antE': [(Y, -25)]},
    1.0: {'tronco': [(Z, 1.5)], 'pescoco': [(Z, -1)], 'cabeca': [(Y, 4)], 'asaD': asa('D', 8, 8), 'antD': [], 'asaE': asa('E', 14, 18), 'antE': [(Y, -10)]},
    1.5: {'tronco': [], 'pescoco': [(X, 2)], 'cabeca': [(Y, -1)], 'asaD': asa('D', 6, 8), 'antD': [], 'asaE': asa('E', 6, 8), 'antE': []},
    2.0: {'tronco': [], 'pescoco': [], 'cabeca': [(Y, 3)], 'asaD': asa('D', 6, 8), 'antD': [], 'asaE': asa('E', 6, 8), 'antE': []},
    2.5: {'tronco': [(Z, -3)], 'pescoco': [(Z, 2)], 'cabeca': [(Y, -2)], 'asaD': asa('D', 28, 30), 'antD': [(Y, -25)], 'asaE': asa('E', 10, 10), 'antE': []},
    3.0: {'tronco': [(Z, -1.5)], 'pescoco': [(Z, 1)], 'cabeca': [(Y, 4)], 'asaD': asa('D', 14, 18), 'antD': [(Y, -10)], 'asaE': asa('E', 8, 8), 'antE': []},
    3.5: {'tronco': [], 'pescoco': [(X, -2)], 'cabeca': [(Y, -1)], 'asaD': asa('D', 6, 8), 'antD': [], 'asaE': asa('E', 6, 8), 'antE': []},
    4.0: {'tronco': [], 'pescoco': [], 'cabeca': [(Y, 3)], 'asaD': asa('D', 6, 8), 'antD': [], 'asaE': asa('E', 6, 8), 'antE': []},
}, ciclo=True)

# Aceno: levanta a asa direita e balança o antebraço três vezes. 2,6 s, uma vez.
aceno = {0.0: {'pescoco': [], 'asaD': asa('D', 0), 'antD': []}}
aceno[0.45] = {'pescoco': [(X, 4)], 'asaD': asa('D', 105, 10), 'antD': [(X, -20)]}
for i, t in enumerate((0.7, 0.95, 1.2, 1.45, 1.7, 1.95)):
    aceno[t] = {'pescoco': [(X, 4 + (1 if i % 2 else -1))], 'asaD': asa('D', 105, 10), 'antD': [(X, 25 if i % 2 == 0 else -20)]}
aceno[2.6] = {'pescoco': [], 'asaD': asa('D', 0), 'antD': []}
acao('aceno', 78, aceno, ciclo=False)


# Feliz: duas batidas rápidas das asas, cabeça balança de leve de um lado para o outro. 2 s, uma vez.
acao('feliz', 60, {
    0.0: {'tronco': [], 'pescoco': [], 'cabeca': [], 'asaD': asa('D', 0), 'asaE': asa('E', 0)},
    0.25: {'tronco': [(Y, -3)], 'pescoco': [(X, 5)], 'cabeca': [(Y, -6)], 'asaD': asa('D', 26, 6), 'asaE': asa('E', 26, 6)},
    0.5: {'tronco': [(Y, -1)], 'pescoco': [(X, 4)], 'cabeca': [(Y, -4)], 'asaD': asa('D', 6), 'asaE': asa('E', 6)},
    0.75: {'tronco': [(Y, -3)], 'pescoco': [(X, -5)], 'cabeca': [(Y, -6)], 'asaD': asa('D', 26, 6), 'asaE': asa('E', 26, 6)},
    1.0: {'tronco': [(Y, -1)], 'pescoco': [(X, -4)], 'cabeca': [(Y, -3)], 'asaD': asa('D', 5), 'asaE': asa('E', 5)},
    1.45: {'tronco': [], 'pescoco': [(X, 2)], 'cabeca': [(Y, -2)], 'asaD': asa('D', 2), 'asaE': asa('E', 2)},
    2.0: {'tronco': [], 'pescoco': [], 'cabeca': [], 'asaD': asa('D', 0), 'asaE': asa('E', 0)},
}, ciclo=False)

# Emissivo: frisos azul-claros brilhantes da cor base (visor, fones, mic, frisos da armadura).
px = np.array(n_base.image.pixels[:], dtype=np.float32).reshape(h, w, 4)
r, g, b = px[..., 0], px[..., 1], px[..., 2]
mx_, mn_ = px[..., :3].max(-1), px[..., :3].min(-1)
sat = (mx_ - mn_) / np.maximum(mx_, 1e-4)
mask = ((b > 0.55) & (sat > 0.35) & (g > 0.25) & (b > r + 0.25)).astype(np.float32)
mask = np.clip(mask * (b - 0.45) * 2.2, 0, 1)
em = np.zeros_like(px)
em[..., :3] = px[..., :3] * mask[..., None]
em[..., 3] = 1
em_img = bpy.data.images.new(f'{STEM}-emissive', w, h)
em_img.pixels = em.ravel()
em_img.scale(ATLAS_EMISSIVO, ATLAS_EMISSIVO)
tex = nt.nodes.new('ShaderNodeTexImage')
tex.image = em_img
nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
bsdf.inputs['Emission Strength'].default_value = 1.0
print('EMISSIVO cobre', float((mask > 0.05).mean()))
n_mr.image.scale(ATLAS_MR, ATLAS_MR)
for img in (n_base.image, n_mr.image, n_normal.image, em_img):
    img.pack()  # pixels assados vivem só na memória: o exportador lê do pacote

ROLES = {'normalTexture': 'normal', 'baseColorTexture': 'basecolor',
         'metallicRoughnessTexture': 'metallicroughness', 'emissiveTexture': 'emissive'}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def ler_glb(path):
    data = path.read_bytes()
    tamanho = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + tamanho]), data[28 + tamanho:]


def gravar_glb(path, documento, binario):
    js = json.dumps(documento, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    binario += b'\0' * (-len(binario) % 4)
    total = 12 + 8 + len(js) + 8 + len(binario)
    path.write_bytes(struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js
                     + struct.pack('<II', len(binario), 0x004E4942) + binario)


def pesos_em_bytes(documento, binario, malha):
    """WEIGHTS_0 float -> UNSIGNED_BYTE normalizado (soma 255 exata) na malha principal.

    Um quarto do tamanho; o rosto e os olhos ficam em float (peso 1 inteiro).
    Devolve {bufferView: bytes novos}.
    """
    novos = {}
    for m in documento['meshes']:
        if m['name'] != malha:
            continue
        for prim in m['primitives']:
            acc = documento['accessors'][prim['attributes']['WEIGHTS_0']]
            if acc['componentType'] != 5126:
                continue
            view = documento['bufferViews'][acc['bufferView']]
            assert view.get('byteStride', 16) == 16, 'WEIGHTS_0 intercalado'
            inicio = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
            w = np.frombuffer(binario, np.float32, acc['count'] * 4, inicio).reshape(-1, 4).astype(np.float64)
            w /= np.maximum(w.sum(1, keepdims=True), 1e-9)
            q = np.floor(w * 255).astype(np.int64)
            falta = 255 - q.sum(1)
            resto = w * 255 - q
            for k in range(3):  # distribui o que falta pelos maiores restos
                idx = np.argsort(-resto, 1)[:, k]
                linhas = np.nonzero(falta > 0)[0]
                q[linhas, idx[linhas]] += 1
                resto[linhas, idx[linhas]] = -1
                falta = 255 - q.sum(1)
            assert (q.sum(1) == 255).all()
            novos[acc['bufferView']] = q.astype(np.uint8).tobytes()
            acc.update(componentType=5121, normalized=True, byteOffset=0)
            view.pop('byteStride', None)
    return novos


def imagens_para_fora(path):
    """Tira as imagens do GLB para arquivos ao lado (images[].uri) e reempacota o binário."""
    documento, binario = ler_glb(path)
    trocas = pesos_em_bytes(documento, binario, 'Coruja')
    papeis = {}
    for material in documento['materials']:
        pbr = material.get('pbrMetallicRoughness', {})
        for campo, info in (('normalTexture', material.get('normalTexture')),
                            ('baseColorTexture', pbr.get('baseColorTexture')),
                            ('metallicRoughnessTexture', pbr.get('metallicRoughnessTexture')),
                            ('emissiveTexture', material.get('emissiveTexture'))):
            if info:
                papeis[documento['textures'][info['index']]['source']] = ROLES[campo]
    manifesto, de_imagem = [], set()
    for indice, imagem in enumerate(documento.get('images', [])):
        view = documento['bufferViews'][imagem['bufferView']]
        inicio = view.get('byteOffset', 0)
        assert imagem['mimeType'] == 'image/jpeg', f'imagem {indice} não é JPEG'
        nome = f'{STEM}-{papeis.get(indice, f"image-{indice}")}.jpg'
        (OUT / nome).write_bytes(binario[inicio:inicio + view['byteLength']])
        manifesto.append(nome)
        de_imagem.add(imagem.pop('bufferView'))
        imagem['uri'] = nome
    novo, mapa, views = bytearray(), {}, []
    for i, view in enumerate(documento['bufferViews']):
        if i in de_imagem:
            continue
        novo += b'\0' * (-len(novo) % 4)
        inicio = view.get('byteOffset', 0)
        trecho = trocas.get(i, binario[inicio:inicio + view['byteLength']])
        view = dict(view, byteOffset=len(novo), byteLength=len(trecho))
        novo += trecho
        mapa[i] = len(views)
        views.append(view)
    documento['bufferViews'] = views
    for acc in documento['accessors']:
        if 'bufferView' in acc:
            acc['bufferView'] = mapa[acc['bufferView']]
        if 'sparse' in acc:
            acc['sparse']['indices']['bufferView'] = mapa[acc['sparse']['indices']['bufferView']]
            acc['sparse']['values']['bufferView'] = mapa[acc['sparse']['values']['bufferView']]
    documento['buffers'][0]['byteLength'] = len(novo) + (-len(novo) % 4)
    gravar_glb(path, documento, bytes(novo))
    return manifesto, documento


glb = OUT / f'{STEM}.glb'
bpy.ops.export_scene.gltf(
    filepath=str(glb), export_format='GLB', export_image_format='JPEG', export_jpeg_quality=QUALIDADE_JPEG,
    export_yup=True, export_texcoords=True, export_normals=True, export_tangents=False, export_morph_normal=False,
    export_materials='EXPORT', export_animations=True, export_animation_mode='NLA_TRACKS',
    export_skins=True, export_extras=False, export_optimize_animation_size=True)
manifesto, documento = imagens_para_fora(glb)
(OUT / f'{STEM}.textures.json').write_text(json.dumps({'images': manifesto}, indent=2) + '\n', encoding='utf-8')
data = glb.read_bytes()

tris = sum(documento['accessors'][p['indices']]['count'] // 3 for m in documento['meshes'] for p in m['primitives'])
pos = documento['accessors'][documento['meshes'][0]['primitives'][0]['attributes']['POSITION']]
fonte, fonte_alta = SRC.read_bytes(), ALTA.read_bytes()
proveniencia = {
    'asset': glb.name,
    'generatedBy': 'Tripo Studio (studio.tripo3d.ai), imagem -> 3D (H3.1, Ultra Mesh, 4K, PBR) pela conta do dono; '
                   'ossos e pesos do Auto Rig "Other" (avian) da coruja do #16',
    'createdAt': datetime.date.today().isoformat(),
    'reference': 'Imagem frontal de corpo inteiro gerada por cx/gpt-5.6-sol-image (9Router) a partir de '
                 'public/stand/avatar/coruja-a/coruja-a-1024.png, para manter a identidade da Coruja A',
    'tripoProject': '9d92de09-8985-49fe-b7f8-8f80d18e56db',
    'tripoUrl': 'https://studio.tripo3d.ai/workspace/generate/9d92de09-8985-49fe-b7f8-8f80d18e56db',
    'tripoOperations': {'generate': '8f83a2b9-8999-472c-801a-e4a1199a9e66',
                        'rigSource': {'project': 'f66f3bb8-0f29-4aa1-89a8-15564f97ac2b',
                                      'autoRig': '3756a343-ec50-45d7-bd60-b396e7c5350a'}},
    'tripoCredits': 55,
    'tripoExport': {'faces': 250000, 'format': 'glb (export do Studio, sem meshopt)',
                    'sourceSha256': sha256(fonte_alta), 'sourceBytes': len(fonte_alta), 'sourceTriangles': TRIS_ALTA,
                    'rigSha256': sha256(fonte), 'rigBytes': len(fonte), 'joints': len(arm.data.bones)},
    'packaging': {
        'tool': f'Blender {bpy.app.version_string}, scripts/stand/package-coruja-3d.py',
        'decimate': {'type': 'COLLAPSE', 'triangles': TRIS, 'delimit': 'UV', 'ratio': round(RAZAO, 4)},
        'uv': 'UVs originais do Tripo Studio (decimação com delimit UV)',
        'textures': 'mapas do Tripo reduzidos; olhos pintados apagados por preenchimento Laplace; '
                    f'branco fosco (rugosidade >= {FOSCO_BRANCO}, metal <= 0,04)',
        'atlas': {'basecolor': ATLAS, 'normal': ATLAS_NORMAL, 'metallicroughness': ATLAS_MR, 'emissive': ATLAS_EMISSIVO},
        'jpegQuality': QUALIDADE_JPEG,
        'images': 'fora do GLB (images[].uri), mesmos arquivos do manifesto externo',
        'olhos': 'olhos pintados apagados do visor; tela CorujaOlhos (material coruja-3d-olhos) desenhada em canvas no '
                 'three.js; scripts/stand/coruja3d_rosto.py',
        'rosto': 'bico_abre na malha principal (bico de cima) e CorujaRosto (boca escura + bico de baixo), 100% tripo::Head_2',
    },
    'morphTargets': {o.name: [k.name for k in o.data.shape_keys.key_blocks[1:]]
                     for o in (mesh, rosto) if o.data.shape_keys},
    'animations': {a.name: round(a.frame_range[1] - a.frame_range[0]) for a in bpy.data.actions},
    'fps': FPS,
    'triangles': tris,
    'boundsM': {'min': pos['min'], 'max': pos['max']},
    'axes': {'up': '+Y', 'front': '+X (o componente gira -90° em Y para olhar a câmera)'},
    'externalManifest': f'{STEM}.textures.json',
    'reproducibleCommand': 'gltf-transform dequantize RIG_TRIPO.glb rig-decoded.glb && '
                           'blender -b --factory-startup --python scripts/stand/package-coruja-3d.py -- '
                           'rig-decoded.glb coruja-tripo-alta.glb public/stand/avatar/coruja-3d',
    'sha256': sha256(data),
    'bytes': len(data),
}
(OUT / f'{STEM}.provenance.json').write_text(json.dumps(proveniencia, indent=2, ensure_ascii=False) + '\n',
                                            encoding='utf-8')
print(f'CORUJA_3D {TRIS_ALTA}->{tris} tris, {len(data)} bytes, imagens {manifesto}')
