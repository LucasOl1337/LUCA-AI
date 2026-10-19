"""Trator MAX: o brinquedo azul das fotos do Lucas, procedural e sem textura.

Metros, +X para a frente, +Y para cima e +Z lateral no simulador (no glTF/three,
com X para a frente e Y para cima, +Z e o lado direito fisico da maquina, onde
fica o escapamento do brinquedo). O script trabalha nessas coordenadas e
converte para o sistema Z-up do Blender, como build-agri-tractor.py.

Referencias: missoes/trator-referencias (14 fotos). Proporcoes medidas em pixels
nas laterais 12 e 13 e na frente 14; a escala em metros e configuracao, nao medida
real (ver o objeto "scale" da provenance).
"""

import bpy
import bmesh
import datetime
import hashlib
import json
import math
import os
import struct
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
NOMINAL_LENGTH = 4.5
# Variante do Gameplay (cabine em primeira pessoa): sem painel, assento e volante
# antigos, com o volante novo num no proprio (rig-volante). Sem a variavel, o
# script segue o caminho do /sompo e grava public/models/sompo/max-tractor.glb.
VARIANT = os.environ.get('MAX_TRACTOR_VARIANT', '').strip()
if VARIANT not in ('', 'cabine'):
    raise SystemExit(f'MAX_TRACTOR_VARIANT desconhecida: {VARIANT!r} (use cabine ou deixe vazia)')
CABIN = VARIANT == 'cabine'


def xyz(point):
    """Coordenada do simulador (X frente, Y cima, Z lateral) para Blender."""
    return (point[0], -point[2], point[1])


def inp(principled, name, value):
    if name in principled.inputs:
        principled.inputs[name].default_value = value


def material(name, color, metallic=0.0, roughness=0.5):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    inp(p, 'Base Color', (*color, 1))
    inp(p, 'Metallic', metallic)
    inp(p, 'Roughness', roughness)
    return mat


# Tintas do brinquedo. Viram cor por vertice (CavityAO) em dois materiais finais:
# carroceria e rodas, como no trator procedural.
blue = material('MAX azul brinquedo', (0.012, 0.20, 0.72), 0.05, 0.32)
black = material('MAX plastico preto', (0.016, 0.017, 0.019), 0.02, 0.62)
grey = material('MAX cinza teto', (0.36, 0.365, 0.37), 0.04, 0.5)
exhaust = material('MAX cinza escapamento', (0.42, 0.42, 0.43), 0.1, 0.4)
silver = material('MAX prata sensor', (0.55, 0.56, 0.58), 0.7, 0.3)
pcb = material('MAX placa do sensor', (0.008, 0.05, 0.32), 0.05, 0.45)
lamp = material('MAX farol claro', (0.78, 0.82, 0.86), 0.1, 0.2)
amber = material('MAX luz ambar', (0.9, 0.3, 0.015), 0.05, 0.3)
red = material('MAX lanterna vermelha', (0.55, 0.02, 0.012), 0.05, 0.3)
orange = material('MAX letra laranja', (0.95, 0.36, 0.02), 0.02, 0.45)
white = material('MAX letra branca', (0.86, 0.86, 0.84), 0.02, 0.45)
wire_yellow = material('MAX fio amarelo', (0.9, 0.68, 0.02), 0.0, 0.5)
wire_green = material('MAX fio verde', (0.02, 0.42, 0.06), 0.0, 0.5)
wire_blue = material('MAX fio azul', (0.02, 0.10, 0.62), 0.0, 0.5)
tire = material('MAX borracha', (0.03, 0.03, 0.032), 0.0, 0.9)
structural = material('MAX acabamento unificado', (1, 1, 1), 0.05, 0.45)
wheel_finish = material('MAX roda unificada', (1, 1, 1), 0.02, 0.72)
TINTS = (blue, black, grey, exhaust, silver, pcb, lamp, amber, red, orange, white, wire_yellow, wire_green, wire_blue)


parts = bpy.data.objects.new('max-trator-procedural', None)
bpy.context.collection.objects.link(parts)
rig_parts = {}
for key in ('body', 'wheel-0--1', 'wheel-0-1', 'wheel-1--1', 'wheel-1-1', 'hitch') + (('volante',) if CABIN else ()):
    group = bpy.data.objects.new(f'rig-{key}', None)
    bpy.context.collection.objects.link(group)
    group.parent = parts
    rig_parts[key] = group


def finish(obj, name, mat, bevel=0.0, segments=2, smooth=True, rig='body'):
    obj.name = name
    obj.parent = rig_parts[rig]
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('chanfro', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
    for face in obj.data.polygons:
        face.use_smooth = smooth
    return obj


def recalc(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def box(name, center, size, mat, bevel=0.015, segments=2, rig='body'):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(center))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel, segments, smooth=False, rig=rig)


def linked_mesh(name, vertices, faces, mat, bevel=0.0, segments=2, smooth=True, rig='body', closed=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(vertex) for vertex in vertices], [], faces)
    data.validate()
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    if closed:
        recalc(obj)
    return finish(obj, name, mat, bevel, segments, smooth, rig)


def profile(name, polygon, z0, z1, mat, bevel=0.025, segments=3, rig='body'):
    """Perfil lateral XY extrudado na largura Z."""
    vertices = [(x, y, z) for z in (z0, z1) for x, y in polygon]
    count = len(polygon)
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    return linked_mesh(name, vertices, faces, mat, bevel, segments, smooth=False, rig=rig)


def loft(name, sections, mat, bevel=0.03, segments=3, rig='body'):
    """Secoes transversais (x, [(y, z), ...]) com o mesmo numero de pontos."""
    count = len(sections[0][1])
    vertices = [(x, y, z) for x, ring in sections for y, z in ring]
    faces = [tuple(range(count)), tuple(range(len(vertices) - count, len(vertices)))]
    for index in range(len(sections) - 1):
        a, b = index * count, (index + 1) * count
        faces += [(a + i, a + (i + 1) % count, b + (i + 1) % count, b + i) for i in range(count)]
    return linked_mesh(name, vertices, faces, mat, bevel, segments, smooth=False, rig=rig)


def lathe(name, center, outline, mat, steps=48, rig='body'):
    """Perfil fechado (raio, deslocamento axial) girado em torno do eixo Z do simulador."""
    cx, cy, cz = center
    count = len(outline)
    vertices = []
    for step in range(steps):
        angle = step * math.tau / steps
        vertices += [(cx + math.cos(angle) * r, cy + math.sin(angle) * r, cz + a) for r, a in outline]
    faces = []
    for step in range(steps):
        nxt = (step + 1) % steps
        faces += [(step * count + i, step * count + (i + 1) % count,
                   nxt * count + (i + 1) % count, nxt * count + i) for i in range(count)]
    return linked_mesh(name, vertices, faces, mat, 0.0, 2, smooth=True, rig=rig)


def rod(name, start, end, radius, mat, vertices=12, rig='body'):
    a, b = Vector(xyz(start)), Vector(xyz(end))
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(b - a).length, location=(a + b) / 2)
    obj = bpy.context.object
    obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, name, mat, 0.0, 2, rig=rig)


def polyline(name, points, radius, mat, vertices=8, rig='body'):
    for start, end in zip(points, points[1:]):
        rod(name, start, end, radius, mat, vertices, rig)


def cylinder(name, center, axis, radius, depth, mat, vertices=24, bevel=0.008, rig='body'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=xyz(center))
    obj = bpy.context.object
    obj.rotation_euler = {'x': (0, math.pi / 2, 0), 'y': (0, 0, 0), 'z': (math.pi / 2, 0, 0)}[axis]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, name, mat, bevel, 2, rig=rig)


def torus(name, center, major, minor, mat, major_segments=40, minor_segments=10, rotation=(math.pi / 2, 0, 0), rig='body'):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=major_segments,
                                     minor_segments=minor_segments, location=xyz(center), rotation=rotation)
    return finish(bpy.context.object, name, mat, 0.0, smooth=True, rig=rig)


def oriented_box(name, center, axes, halves, mat, bevel=0.006, rig='body'):
    """Caixa com eixos proprios (tres vetores ortogonais do simulador)."""
    c = Vector(center)
    u, v, w = (Vector(axis) * half for axis, half in zip(axes, halves))
    vertices = [tuple(c + u * su + v * sv + w * sw) for su, sv, sw in
                ((-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (1, -1, -1), (1, -1, 1), (1, 1, 1), (1, 1, -1))]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7)]
    return linked_mesh(name, vertices, faces, mat, bevel, 2, smooth=False, rig=rig)


def arch_fender(name, cx, cy, r_in, r_out, z0, z1, mat, a0=15, a1=150, steps=22, rig='body'):
    """Lamina curva sobre a roda, aberta embaixo e com espessura visivel."""
    angles = [math.radians(a0 + i * (a1 - a0) / steps) for i in range(steps + 1)]
    vertices = []
    for z in (z0, z1):
        for radius in (r_in, r_out):
            vertices += [(cx + math.cos(a) * radius, cy + math.sin(a) * radius, z) for a in angles]
    n = len(angles)
    faces = []
    for layer in (0, 1):
        base = layer * n * 2
        faces += [(base + i, base + i + 1, base + n + i + 1, base + n + i) for i in range(steps)]
    for radial in (0, 1):
        a, b = radial * n, n * 2 + radial * n
        faces += [(a + i, b + i, b + i + 1, a + i + 1) for i in range(steps)]
    faces += [(0, n, n * 3, n * 2), (n - 1, n * 2 - 1, n * 4 - 1, n * 3 - 1)]
    return linked_mesh(name, vertices, faces, mat, 0.012, 2, smooth=True, rig=rig)


def chevron_lug(name, center, radial, tangent, axial_half, tangent_half, radial_half, slope, mat, rig):
    """Garra diagonal; duas metades espelhadas formam o V agricola."""
    c = Vector(center)
    r = Vector(radial) * radial_half
    t = Vector(tangent)
    u = Vector((0, 0, 1)) * axial_half + t * slope
    v = t * tangent_half
    vertices = [tuple(c + r * sr + u * su + v * sv) for sr, su, sv in
                ((-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (1, -1, -1), (1, -1, 1), (1, 1, 1), (1, 1, -1))]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7)]
    return linked_mesh(name, vertices, faces, mat, 0.008, 2, smooth=False, rig=rig)


def text_plate(name, body, center, side, size, mat, advance_offset=0.0):
    """Letreiro em geometria: texto do Blender convertido em malha, sem imagem."""
    bpy.ops.object.text_add(location=(0, 0, 0))
    obj = bpy.context.object
    obj.data.body = body
    obj.data.size = size
    obj.data.extrude = 0.006
    obj.data.offset = size * 0.035  # engrossa o traco, como a fonte pesada do adesivo
    obj.data.align_x = 'CENTER'
    obj.data.align_y = 'CENTER'
    obj.data.resolution_u = 3
    # +Z do simulador e -Y do Blender: ali o texto avanca para +X; do outro lado, para -X.
    obj.rotation_euler = (math.pi / 2, 0, 0 if side > 0 else math.pi)
    x, y, z = center
    obj.location = xyz((x + advance_offset * (1 if side > 0 else -1), y, z))
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, name, mat, 0.0, smooth=False)


# ---------------------------------------------------------------- medidas (metros)
FRONT_AXLE = dict(x=1.32, r=0.70, w=0.40, z=0.92)
REAR_AXLE = dict(x=-1.41, r=0.92, w=0.56, z=1.07)
HITCH = (-1.98, 0.88, 0.0)
SENSOR = (2.25, 0.755, 0.0)


def wheel(label, axle, side, rig, front):
    r, w = axle['r'], axle['w']
    cx, cy, cz = axle['x'], r, side * axle['z']
    h = w / 2
    # Flanco preto alto: nas fotos 12 e 13 o pneu ocupa de ~0,57 do raio até a banda.
    inner, outer, shoulder = 0.565 * r, 0.93 * r, 0.11 * r
    outline = [(inner, -h * 0.9)]
    outline += [(outer - shoulder + math.cos(a) * shoulder, -h + shoulder + math.sin(a) * shoulder)
                for a in (math.radians(d) for d in (-90, -60, -30, 0))]
    outline += [(outer - shoulder + math.cos(a) * shoulder, h - shoulder + math.sin(a) * shoulder)
                for a in (math.radians(d) for d in (0, 30, 60, 90))]
    outline += [(inner, h * 0.9)]
    lathe(f'{label}-pneu', (cx, cy, cz), outline, tire, 44 if front else 52, rig)
    # Aro azul fino colado no flanco, medido nas fotos 12 e 13: ~0,45 a 0,57 do raio na
    # dianteira e ~0,46 a 0,58 na traseira. O miolo preto fica dentro dele.
    ring = (0.45 * r, 0.575 * r) if front else (0.46 * r, 0.585 * r)
    for face in (-1, 1):
        a = face * (h - 0.035)
        lathe(f'{label}-aro', (cx, cy, cz), [(ring[0], a - 0.025), (ring[1], a - 0.025), (ring[1], a + 0.025), (ring[0], a + 0.025)],
              blue, 40, rig)
        cylinder(f'{label}-disco', (cx, cy, cz + face * (h - 0.07)), 'z', ring[0] + 0.01, 0.03, black, 32, 0.0, rig)
    out = side
    cylinder(f'{label}-cubo', (cx, cy, cz + out * (h - 0.04)), 'z', 0.32 * r, 0.07, black, 28, 0.01, rig)
    torus(f'{label}-anel-cubo', (cx, cy, cz + out * (h - 0.01)), 0.40 * r, 0.014, black, 32, 6, rig=rig)
    cylinder(f'{label}-tampa', (cx, cy, cz + out * (h - 0.02)), 'z', 0.14 * r, 0.05, black, 20, 0.008, rig)
    for i in range(6):
        angle = i * math.tau / 6
        cylinder(f'{label}-parafuso', (cx + math.cos(angle) * 0.22 * r, cy + math.sin(angle) * 0.22 * r, cz + out * (h - 0.005)),
                 'z', 0.022, 0.02, black, 8, 0.0, rig)
    count = 16 if front else 20
    for index in range(count):
        angle = index * math.tau / count
        radial = (math.cos(angle), math.sin(angle), 0)
        tangent = (-math.sin(angle), math.cos(angle), 0)
        surface = (cx + radial[0] * r * 0.955, cy + radial[1] * r * 0.955)
        for half in (-1, 1):
            chevron_lug(f'{label}-garra', (surface[0], surface[1], cz + half * w * 0.24), radial, tangent,
                        w * 0.235, r * 0.065, r * 0.045, half * r * 0.11, tire, rig)


# ---------------------------------------------------------------- chassi preto e trem de força
box('chassi-motor', (0.85, 0.95, 0), (1.60, 0.50, 0.72), black, 0.03)
box('nariz-inferior', (1.60, 0.93, 0), (0.40, 0.26, 0.64), black, 0.025)
box('base-cabine', (-0.45, 1.05, 0), (1.40, 0.65, 1.10), black, 0.03)
box('caixa-transmissao', (-1.45, 1.00, 0), (0.70, 0.70, 1.20), black, 0.03)
box('suporte-eixo-dianteiro', (1.32, 0.80, 0), (0.30, 0.22, 0.56), black, 0.02)
rod('eixo-dianteiro', (FRONT_AXLE['x'], FRONT_AXLE['r'], -0.76), (FRONT_AXLE['x'], FRONT_AXLE['r'], 0.76), 0.075, black, 14)
rod('eixo-traseiro', (REAR_AXLE['x'], REAR_AXLE['r'], -0.82), (REAR_AXLE['x'], REAR_AXLE['r'], 0.82), 0.12, black, 16)

# ---------------------------------------------------------------- capô azul arredondado e nariz preto
def hood_section(x, bottom, top, half):
    ring = [(bottom, -half), (bottom, half), (top - 0.17, half), (top - 0.06, half * 0.88),
            (top, half * 0.56), (top, -half * 0.56), (top - 0.06, -half * 0.88), (top - 0.17, -half)]
    return (x, ring)


loft('capo', [hood_section(0.15, 1.22, 2.04, 0.54), hood_section(0.70, 1.22, 2.00, 0.54),
              hood_section(1.30, 1.16, 1.90, 0.54), hood_section(1.56, 1.05, 1.83, 0.47),
              hood_section(1.72, 1.04, 1.75, 0.41)], blue, 0.035)
# A tampa preta cobre a ponta do capô por cima e pelos lados (foto 01 e 12).
loft('nariz-preto', [hood_section(1.42, 1.34, 1.865, 0.525), hood_section(1.56, 1.34, 1.84, 0.482),
                     hood_section(1.735, 1.34, 1.765, 0.422)], black, 0.02)
for i in range(13):
    z = -0.27 + i * 0.045
    box('grade-vertical', (1.752, 1.53, z), (0.03, 0.34, 0.022), black, 0.004)
for side in (-1, 1):
    box('moldura-farol', (1.728, 1.20, side * 0.14), (0.03, 0.19, 0.24), grey, 0.012)
    box('farol-dianteiro', (1.745, 1.20, side * 0.14), (0.03, 0.15, 0.20), lamp, 0.012)
    # Painel lateral escuro com aberturas, abaixo do letreiro.
    box('respiro-capo', (1.05, 1.36, side * 0.545), (0.55, 0.12, 0.02), black, 0.006)

# Letreiro "MAX / TRATOR" nos dois lados, MAX puxado para a cabine.
for side in (-1, 1):
    plate_z = side * 0.552
    box('placa-letreiro', (0.84, 1.64, plate_z), (0.70, 0.30, 0.02), black, 0.01)
    text_plate('letreiro-trator', 'TRATOR', (0.84, 1.595, side * 0.565), side, 0.15, white)
    text_plate('letreiro-max', 'MAX', (0.84, 1.715, side * 0.565), side, 0.10, orange, advance_offset=-0.16)

# ---------------------------------------------------------------- lastro, HC-SR04 e fios
box('suporte-lastro', (1.86, 0.62, 0), (0.24, 0.18, 0.40), black, 0.02)
box('lastro-frontal', (2.02, 0.54, 0), (0.20, 0.48, 0.80), black, 0.03)
for i in range(12):
    box('nervura-lastro', (2.13, 0.54, -0.3575 + i * 0.065), (0.03, 0.44, 0.03), black, 0.006)
box('placa-hc-sr04', (2.155, 0.77, 0), (0.02, 0.22, 0.48), pcb, 0.004)
for z in (-0.13, 0.13):
    cylinder('transdutor-hc-sr04', (2.205, SENSOR[1], z), 'x', 0.08, 0.085, silver, 28, 0.006)
    cylinder('tela-transdutor', (2.248, SENSOR[1], z), 'x', 0.062, 0.012, black, 24, 0.0)
box('cristal-hc-sr04', (2.175, 0.835, 0), (0.03, 0.04, 0.09), silver, 0.004)
wires = ((-0.045, wire_yellow), (-0.015, white), (0.015, wire_green), (0.045, wire_blue))
for z, mat in wires:
    box('pino-hc-sr04', (2.155, 0.90, z), (0.015, 0.04, 0.012), silver, 0.0)
    polyline('fio-sensor', [(2.155, 0.92, z), (2.13, 1.00, z * 1.1), (1.95, 1.06, z * 1.3),
                            (1.80, 1.08, z * 1.2), (1.72, 1.10, z)], 0.011, mat)

# ---------------------------------------------------------------- cabine aberta
box('piso-cabine', (-0.58, 1.38, 0), (1.56, 0.08, 1.28), black, 0.02)
if not CABIN:
    box('painel-instrumentos', (0.05, 2.06, 0), (0.24, 0.10, 1.16), black, 0.02)
for side in (-1, 1):
    rod('coluna-dianteira', (0.16, 1.40, side * 0.62), (0.10, 2.97, side * 0.60), 0.065, black, 10)
    rod('coluna-traseira', (-1.30, 1.40, side * 0.62), (-1.26, 2.97, side * 0.60), 0.065, black, 10)
    rod('coluna-porta', (-0.50, 1.85, side * 0.62), (-0.50, 2.95, side * 0.61), 0.04, black, 8)
    rod('trilho-superior', (0.10, 2.93, side * 0.60), (-1.26, 2.93, side * 0.60), 0.05, black, 8)
    box('lateral-baixa-cabine', (-0.58, 1.62, side * 0.62), (1.40, 0.44, 0.04), black, 0.012)
    # Degraus pretos entre os eixos (fotos 12 e 13).
    box('espelho-degrau', (-0.10, 1.05, side * 0.60), (0.50, 0.62, 0.06), black, 0.015)
    for x in (0.15, -0.35):
        box('lateral-degrau', (x, 1.05, side * 0.72), (0.04, 0.62, 0.24), black, 0.008)
    for y in (0.82, 1.03, 1.24):
        box('degrau', (-0.10, y, side * 0.72), (0.50, 0.05, 0.22), black, 0.008)
rod('travessa-teto-frente', (0.10, 2.93, -0.60), (0.10, 2.93, 0.60), 0.05, black, 8)
rod('travessa-teto-tras', (-1.26, 2.93, -0.60), (-1.26, 2.93, 0.60), 0.05, black, 8)
box('parede-traseira-cabine', (-1.29, 1.70, 0), (0.05, 0.60, 1.20), black, 0.012)

# Volante: centro e eixo valem para as duas variantes (inclinado 0,53 rad).
STEER_CENTER = (-0.18, 2.12, 0.0)
STEER_TILT = 0.53
steer_u = (math.cos(STEER_TILT), math.sin(STEER_TILT), 0)  # no plano do volante, para a frente e para cima
steer_n = (-math.sin(STEER_TILT), math.cos(STEER_TILT), 0)  # eixo de giro, apontando para o operador
if not CABIN:
    box('assento', (-0.75, 1.62, 0), (0.42, 0.12, 0.44), black, 0.04, 3)
    box('pedestal-assento', (-0.75, 1.48, 0), (0.20, 0.18, 0.20), black, 0.01)
    box('encosto', (-0.96, 1.90, 0), (0.10, 0.48, 0.44), black, 0.04, 3)
    rod('coluna-volante', (0.02, 1.98, 0), (-0.17, 2.10, 0), 0.025, black, 10)
    torus('volante', (-0.18, 2.12, 0), 0.16, 0.022, black, 28, 8, rotation=(0, -0.53, 0))
    for angle in (math.pi / 2, math.pi * 7 / 6, math.pi * 11 / 6):
        rod('raio-volante', (-0.18, 2.12, 0), (-0.18 + 0.15 * math.cos(angle) * steer_u[0],
            2.12 + 0.15 * math.cos(angle) * steer_u[1], 0.15 * math.sin(angle)), 0.012, black, 6)
else:
    # Cabine do Gameplay: banco e painel entram pelo carregador (Tripo/overlay).
    # A coluna fixa desce pelo eixo do volante ate entrar no capo; aro, raios,
    # cubo e manopla giram juntos no rig-volante, em torno de steer_n.
    c, n, u, w = Vector(STEER_CENTER), Vector(steer_n), Vector(steer_u), Vector((0, 0, 1))
    rod('coluna-volante', tuple(c - n * 0.80), tuple(c - n * 0.02), 0.032, black, 14)
    rod('capa-coluna', tuple(c - n * 0.80), tuple(c - n * 0.42), 0.055, black, 16)
    torus('volante-aro', STEER_CENTER, 0.19, 0.024, black, 56, 12, rotation=(0, -STEER_TILT, 0), rig='volante')
    rod('volante-cubo', tuple(c - n * 0.03), tuple(c + n * 0.035), 0.05, black, 20, rig='volante')
    # Tres raios em T: laterais e o de baixo, que aponta para o operador.
    for radial in (w, -w, -u):
        tangent = n.cross(radial).normalized()
        oriented_box('volante-raio', tuple(c + radial * 0.115 + n * 0.012), (tuple(radial), tuple(n), tuple(tangent)),
                     (0.085, 0.009, 0.022), black, 0.004, rig='volante')
    # Manopla no aro: deixa o giro legivel de dentro da cabine.
    knob = c + (u * math.cos(math.radians(60)) + w * math.sin(math.radians(60))) * 0.19
    rod('volante-manopla', tuple(knob), tuple(knob + n * 0.07), 0.016, black, 10, rig='volante')

# Teto cinza com beiral, alça e recorte escuro (foto 01).
box('teto', (-0.58, 2.99, 0), (1.84, 0.10, 1.56), grey, 0.035, 3)
box('teto-elevado', (-0.62, 3.06, 0), (1.50, 0.04, 1.20), grey, 0.015)
box('recorte-teto', (-0.40, 3.085, 0), (0.45, 0.012, 0.35), black, 0.004)
polyline('alca-teto', [(-1.05, 3.08, -0.18), (-1.05, 3.14, -0.15), (-1.05, 3.14, 0.15), (-1.05, 3.08, 0.18)], 0.022, black)
box('barra-luzes', (0.25, 3.10, 0), (0.12, 0.05, 1.10), black, 0.01)
for z, mat in ((-0.40, amber), (-0.26, lamp), (0.26, lamp), (0.40, amber)):
    cylinder('caixa-luz-teto', (0.28, 3.135, z), 'x', 0.065, 0.10, black, 16, 0.006)
    cylinder('luz-teto-dianteira', (0.335, 3.135, z), 'x', 0.055, 0.02, mat, 16, 0.004)
for z in (-0.32, 0.32):
    cylinder('caixa-luz-teto-traseira', (-1.48, 3.11, z), 'x', 0.055, 0.08, black, 14, 0.006)
    cylinder('luz-teto-traseira', (-1.525, 3.11, z), 'x', 0.045, 0.02, red, 14, 0.004)

# Escapamento cinza alto do lado do escapamento real (+Z), com protetor perfurado.
EX = (0.28, 0.84)
box('suporte-escapamento', (EX[0], 1.42, 0.69), (0.12, 0.10, 0.30), black, 0.01)
rod('braco-escapamento', (EX[0], 2.40, EX[1]), (0.14, 2.40, 0.62), 0.025, exhaust, 8)
rod('protetor-escapamento', (EX[0], 1.36, EX[1]), (EX[0], 2.80, EX[1]), 0.085, exhaust, 16)
polyline('tubo-escapamento', [(EX[0], 2.78, EX[1]), (EX[0], 3.00, EX[1]), (0.21, 3.08, EX[1]), (0.10, 3.11, EX[1])], 0.055, exhaust, 14)
for row in range(8):
    y = 1.55 + row * 0.15
    for degrees in (15, 60, 105):
        phi = math.radians(degrees)
        direction = (math.cos(phi), 0, math.sin(phi))
        start = tuple(c + d * 0.082 for c, d in zip((EX[0], y, EX[1]), direction))
        end = tuple(c + d * 0.094 for c, d in zip((EX[0], y, EX[1]), direction))
        rod('furo-protetor', start, end, 0.017, black, 8)

# ---------------------------------------------------------------- para-lamas azuis e traseira
for side in (-1, 1):
    rx, ry = REAR_AXLE['x'], REAR_AXLE['r']
    arch_fender('paralama-traseiro', rx, ry, 0.97, 1.10, side * 0.74, side * 1.345, blue, 15, 150, 26)
    wall = [(rx + math.cos(math.radians(a)) * 1.10, ry + math.sin(math.radians(a)) * 1.10) for a in range(15, 151, 9)]
    profile('parede-paralama', wall + [(-2.25, 1.30), (-0.45, 1.30)], side * 0.74, side * 0.78, blue, 0.008, 2)
    for offset in (-0.07, 0.07):
        a = math.radians(140)
        radial = (math.cos(a), math.sin(a), 0)
        tangent = (-math.sin(a), math.cos(a), 0)
        center = (rx + radial[0] * 1.106, ry + radial[1] * 1.106, side * 1.05 + offset)
        oriented_box('lanterna-paralama', center, (radial, tangent, (0, 0, 1)), (0.012, 0.065, 0.022), red, 0.004)
    fx, fy = FRONT_AXLE['x'], FRONT_AXLE['r']
    arch_fender('paralama-dianteiro', fx, fy, 0.77, 0.82, side * 0.70, side * 1.10, blue, 60, 150, 14)
profile('painel-traseiro', [(-1.30, 1.35), (-1.30, 1.98), (-1.55, 1.98), (-1.85, 1.80), (-2.02, 1.50), (-2.05, 1.35)],
        -0.76, 0.76, blue, 0.03, 3)

# Cilindro preto do brinquedo com o cabo USB enrolado (fotos 05, 06 e 10).
cylinder('cilindro-traseiro', HITCH, 'x', 0.16, 0.50, black, 28, 0.012, rig='hitch')
cylinder('tampa-cilindro', (HITCH[0] - 0.255, HITCH[1], 0), 'x', 0.12, 0.03, grey, 24, 0.004, rig='hitch')
coil = []
for i in range(90):
    t = i / 89
    angle = t * 3.5 * math.tau
    coil.append((-2.27 + 0.05 * math.cos(angle), 0.86 - t * 0.36, 0.04 + 0.05 * math.sin(angle)))
for i, (start, end) in enumerate(zip(coil, coil[1:])):
    rod('cabo-usb', start, end, 0.017, black if (i // 3) % 2 else white, 6, rig='hitch')
box('plugue-usb', (-2.27, 0.45, 0.04), (0.05, 0.10, 0.07), black, 0.006, rig='hitch')
box('ponta-usb', (-2.27, 0.38, 0.04), (0.03, 0.05, 0.06), silver, 0.002, rig='hitch')

# ---------------------------------------------------------------- rodas
for side in (-1, 1):
    suffix = '-1' if side < 0 else '1'
    wheel(f'roda-dianteira-{side}', FRONT_AXLE, side, f'wheel-0-{suffix}', True)
    wheel(f'roda-traseira-{side}', REAR_AXLE, side, f'wheel-1-{suffix}', False)


# ---------------------------------------------------------------- consolidação por parte rígida e material
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH':
        continue
    original = obj.data.materials[0]
    rig_key = next((key for key, group in rig_parts.items() if obj.parent == group), 'body')
    target = wheel_finish if rig_key.startswith('wheel-') else structural
    tint = tuple(original.diffuse_color[:3])
    colors = obj.data.color_attributes.new(name='CavityAO', type='FLOAT_COLOR', domain='POINT')
    for vertex in obj.data.vertices:
        colors.data[vertex.index].color = (*tint, 1)
    obj.data.color_attributes.active_color = colors
    obj.data.materials.clear()
    obj.data.materials.append(target)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

for key, group in rig_parts.items():
    for mat in (structural, wheel_finish):
        objects = [obj for obj in group.children if obj.type == 'MESH' and obj.data.materials[0] == mat]
        if not objects:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        objects[0].name = f'rig-{key}--{mat.name.lower().replace(" ", "-")}'
for mat in TINTS + (tire,):
    bpy.data.materials.remove(mat)

# ---------------------------------------------------------------- escala de configuração e centro
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
points = [obj.matrix_world @ v.co for obj in meshes for v in obj.data.vertices]
lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
scale = NOMINAL_LENGTH / (hi.x - lo.x)
offset = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
normalize = Matrix.Diagonal((scale, scale, scale, 1)) @ Matrix.Translation(offset)
for obj in meshes:
    obj.data.transform(normalize)
    obj.data.update()


def sim(point):
    """Ponto do simulador antes da normalização -> ponto final do GLB (simulador)."""
    b = normalize @ Vector(xyz(point))
    return [round(b.x, 4), round(b.z, 4), round(-b.y, 4)]


# ---------------------------------------------------------------- CavityAO (igual ao trator procedural)
vertices, polygons = [], []
for obj in meshes:
    start = len(vertices)
    vertices.extend([obj.matrix_world @ vertex.co for vertex in obj.data.vertices])
    polygons.extend([tuple(start + index for index in polygon.vertices) for polygon in obj.data.polygons])
bvh = BVHTree.FromPolygons(vertices, polygons)
samples = 18
directions = []
for index in range(samples):
    radius = math.sqrt((index + .5) / samples)
    angle = index * 2.399963229728653
    directions.append(Vector((radius * math.cos(angle), radius * math.sin(angle), math.sqrt(1 - radius * radius))))
for obj in meshes:
    colors = obj.data.color_attributes.get('CavityAO')
    obj.data.color_attributes.active_color = colors
    normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
    for vertex in obj.data.vertices:
        normal = (normal_matrix @ vertex.normal).normalized()
        rotation = Vector((0, 0, 1)).rotation_difference(normal)
        world = obj.matrix_world @ vertex.co
        origin = world + normal * .006
        visibility = 0
        for direction in directions:
            hit, _, _, distance = bvh.ray_cast(origin, rotation @ direction, 2.0)
            visibility += 1 if hit is None else min(1, (distance / 2.0) ** .60)
        ao = .24 + .76 * visibility / samples
        dirt = max(0, min(1, (0.9 - world.z) / 0.9)) * (.72 + .28 * (math.sin(world.x * 11.7 + world.y * 7.3) * .5 + .5))
        base = tuple(colors.data[vertex.index].color[:3])
        colors.data[vertex.index].color = (
            base[0] * ao * (1 - dirt * .08), base[1] * ao * (1 - dirt * .14), base[2] * ao * (1 - dirt * .24), 1)

default_out = 'public/models/gameplay/max-tractor-cabine.glb' if CABIN else 'public/models/sompo/max-tractor.glb'
out = os.path.abspath(os.environ.get('MAX_TRACTOR_OUT', os.path.join(ROOT, default_out)))
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    export_yup=True,
    export_apply=True,
    export_materials='EXPORT',
    export_vertex_color='ACTIVE',
)

# ---------------------------------------------------------------- proveniência medida no próprio GLB
payload = open(out, 'rb').read()
json_length = struct.unpack_from('<I', payload, 12)[0]
document = json.loads(payload[20:20 + json_length])
primitives = [p for m in document['meshes'] for p in m['primitives']]
triangles = sum(document['accessors'][p['indices']]['count'] // 3 for p in primitives)
mins = [min(document['accessors'][p['attributes']['POSITION']]['min'][i] for p in primitives) for i in range(3)]
maxs = [max(document['accessors'][p['attributes']['POSITION']]['max'][i] for p in primitives) for i in range(3)]
size = [round(b - a, 4) for a, b in zip(mins, maxs)]
# As fotos não vão para o git; num worktree, MAX_TRACTOR_REFERENCES aponta a pasta do checkout que as tem.
reference_dir = os.environ.get('MAX_TRACTOR_REFERENCES') or os.path.join(ROOT, 'missoes', 'trator-referencias')
references = []
for name in sorted(os.listdir(reference_dir)) if os.path.isdir(reference_dir) else []:
    if name.endswith('.jpg'):
        references.append({'path': f'missoes/trator-referencias/{name}',
                           'sha256': hashlib.sha256(open(os.path.join(reference_dir, name), 'rb').read()).hexdigest()})
axle = lambda a, steer: {'x': sim((a['x'], a['r'], a['z']))[0], 'y': sim((a['x'], a['r'], a['z']))[1],
                         'z': sim((a['x'], a['r'], a['z']))[2], 'radius': round(a['r'] * scale, 4),
                         'inner': round((a['z'] - a['w'] / 2) * scale, 4), 'steer': steer}
provenance = {
    'asset': os.path.basename(out),
    'generatedBy': 'LUCA-AI',
    'createdAt': datetime.date.today().isoformat(),
    'method': 'Procedural Blender modeling from dimensioned primitives and custom meshes',
    'generator': 'scripts/sompo/build-max-tractor.py',
    'blenderVersion': bpy.app.version_string,
    'subject': 'Brinquedo "MAX TRATOR" azul do Lucas com o HC-SR04 montado na frente',
    'references': references,
    'referenceRole': 'Fotos originais do brinquedo, usadas só para proporção, cor e posição das peças; nenhuma geometria ou textura foi reconstruída delas',
    'authorship': 'Original procedural geometry authored for LUCA-AI; the side lettering is Blender text converted to mesh, no image',
    'scale': {
        'kind': 'configuration',
        'nominalLengthM': NOMINAL_LENGTH,
        'measuredLengthPx': 1040,
        'measuredInPhoto': 'missoes/trator-referencias/13-ac79ed44fe84.jpg',
        'metresPerPixel': round(NOMINAL_LENGTH / 1040, 5),
        'note': 'O brinquedo foi ampliado para o porte de um trator de campo (4,5 m). Não é medida real de máquina; muda só pela configuração NOMINAL_LENGTH do gerador.',
        'appliedFactor': round(scale, 5),
    },
    'dimensionsM': {'length': size[0], 'width': size[2], 'height': size[1]},
    'axes': {'forward': '+X', 'up': '+Y', 'lateral': '+Z (lado do escapamento)'},
    'rig': {
        'axles': [axle(FRONT_AXLE, True), axle(REAR_AXLE, False)],
        'hitch': sim(HITCH),
        'ultrasonicEmitter': {'position': sim(SENSOR), 'facing': '+X'},
    },
    'geometry': {
        'triangles': triangles,
        'primitives': len(primitives),
        'materials': len(document.get('materials', [])),
        'parts': [
            'rounded blue hood with black ribbed nose and two headlights',
            'MAX / TRATOR lettering as mesh on both hood sides',
            'open cab: four black pillars, seat, steering wheel, grey roof with handle',
            'front and rear roof lamps',
            'tall grey exhaust with perforated guard',
            'black steps between axles',
            'blue rear fenders with two lamps each and blue rear panel',
            'black ribbed front ballast block carrying the HC-SR04 and its four wires',
            'rear black cylinder with coiled USB cable stub',
            'small front and large rear lugged tyres with blue rims',
            'CavityAO vertex colour',
        ],
    },
    'triangles': triangles,
    'materials': 'Two consolidated PBR materials (body and wheels) with colour and CavityAO per vertex; no image textures and no manufacturer marks',
    'externalManifest': 'max-tractor.textures.json',
    'reproducibleCommand': 'blender -b --factory-startup --python scripts/sompo/build-max-tractor.py',
    'license': 'SOMPO-AGRI-ASSET-LICENSE.txt',
    'limitations': [
        'Visual simulator asset of a toy, not a CAD model of a real tractor',
        'No implement: the photos show none, only the toy rear cylinder',
        'Lamps are vertex-coloured on the shared body material; the runtime decides emission',
        'Dimensions are a configured scale of the toy, not measured on a real machine',
    ],
    'sha256': hashlib.sha256(payload).hexdigest(),
    'bytes': len(payload),
}
if CABIN:
    center = sim(STEER_CENTER)
    tip = sim(tuple(Vector(STEER_CENTER) + Vector(steer_n)))
    axis = Vector([b - a for a, b in zip(center, tip)]).normalized()
    provenance.update({
        'variant': 'cabine',
        'variantOf': 'max-tractor.glb',
        'variantNote': 'Gameplay em primeira pessoa: sem painel-instrumentos, assento/encosto e volante antigos; '
                       'volante novo no no rig-volante--*, que gira em torno de rig.steeringWheel.axis. '
                       'Banco e console entram pelo carregador do Gameplay.',
        'reproducibleCommand': 'MAX_TRACTOR_VARIANT=cabine blender -b --factory-startup --python scripts/sompo/build-max-tractor.py',
        'license': 'GAMEPLAY-ASSET-LICENSE.txt',
    })
    provenance['rig']['steeringWheel'] = {
        'node': 'rig-volante', 'center': center, 'axis': [round(v, 4) for v in axis],
        'rimRadius': round(0.19 * scale, 4), 'axisPointsTo': 'operador (para cima e para tras)',
    }
    provenance['geometry']['parts'] = [
        'open cab: four black pillars, floor and low side walls, grey roof with handle; no seat, no dash bar',
        'steering column fixed to the body; rim, three T spokes, hub and spinner knob in rig-volante',
    ] + [part for part in provenance['geometry']['parts'] if not part.startswith('open cab')]
with open(out.replace('.glb', '.provenance.json'), 'w') as handle:
    json.dump(provenance, handle, indent=2, ensure_ascii=False)
    handle.write('\n')
with open(out.replace('.glb', '.textures.json'), 'w') as handle:
    json.dump({'images': []}, handle, indent=2)
    handle.write('\n')
print('MAX_TRACTOR_EXPORTED', out, len(payload), 'triangles', triangles, 'primitives', len(primitives),
      'materials', len(document.get('materials', [])), 'size', size,
      'loaderScale', round(min(4.5 / size[0], 3.2 / size[1], 2.7 / size[2]), 5))
print('MAX_TRACTOR_RIG', json.dumps(provenance['rig']))
print('MAX_TRACTOR_NODES', json.dumps(sorted(node.get('name', '') for node in document['nodes'])))
