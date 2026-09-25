"""Trator agricola brasileiro medio, procedural e sem marca.

Metros, +X para a frente, +Y para cima e +Z para a esquerda no simulador.
O script trabalha nessas coordenadas e converte para o sistema Z-up do Blender.
As pecas ficam geometricamente separadas, mas sao consolidadas por material na
exportacao para preservar detalhe sem multiplicar draw calls no Three.js.
"""

import bpy
import math
import os
from mathutils import Vector


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def xyz(point):
    """Coordenada do simulador (X frente, Y cima, Z lateral) para Blender."""
    return (point[0], -point[2], point[1])


def inp(principled, name, value):
    if name in principled.inputs:
        principled.inputs[name].default_value = value


def material(name, color, metallic=0.0, roughness=0.5, emission=0.0, alpha=1.0, coat=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, alpha)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    inp(p, 'Base Color', (*color, 1))
    inp(p, 'Metallic', metallic)
    inp(p, 'Roughness', roughness)
    inp(p, 'Alpha', alpha)
    if emission:
        inp(p, 'Emission Color', (*color, 1))
        inp(p, 'Emission Strength', emission)
    if coat:
        inp(p, 'Coat Weight', coat)
        inp(p, 'Coat Roughness', 0.16)
    if alpha < 1:
        inp(p, 'Transmission Weight', 0.08)
        try:
            mat.surface_render_method = 'DITHERED'
        except Exception:
            pass
    return mat


# Doze materiais no maximo, todos PBR e sem atlas externo.
paint = material('Trator pintura verde', (0.035, 0.19, 0.065), 0.38, 0.25, coat=0.72)
accent = material('Trator faixa amarela', (0.94, 0.61, 0.035), 0.32, 0.29, coat=0.45)
dark = material('Trator plastico e grade', (0.018, 0.022, 0.019), 0.12, 0.67)
tire = material('Trator borracha com terra', (0.055, 0.046, 0.035), 0.0, 0.92)
rim = material('Trator aro amarelo', (0.88, 0.56, 0.025), 0.52, 0.31)
steel = material('Trator aco mecanico', (0.24, 0.27, 0.25), 0.76, 0.36)
glass = material('Trator vidro da cabine', (0.075, 0.16, 0.15), 0.05, 0.12, alpha=0.28, coat=0.5)
interior = material('Trator interior da cabine', (0.045, 0.05, 0.043), 0.02, 0.83)
lamp = material('Trator farois', (0.82, 0.88, 0.79), 0.25, 0.19, emission=0.35)
red = material('Trator lanternas traseiras', (0.52, 0.018, 0.012), 0.12, 0.31, emission=0.15)
amber = material('Trator giroflex', (0.9, 0.28, 0.015), 0.08, 0.24, emission=0.3, alpha=0.82)
dust = material('Trator poeira e lama seca', (0.25, 0.145, 0.065), 0.0, 0.96)


parts = bpy.data.objects.new('trator-agricola-procedural', None)
bpy.context.collection.objects.link(parts)


def finish(obj, name, mat, bevel=0.0, segments=2, smooth=True):
    obj.name = name
    obj.parent = parts
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('chanfro de fabricacao', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
    if smooth:
        for face in obj.data.polygons:
            face.use_smooth = True
    return obj


def box(name, center, size, mat, bevel=0.015, segments=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(center))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel, segments, smooth=False)


def mesh(name, vertices, faces, mat, bevel=0.0, segments=2, smooth=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(vertex) for vertex in vertices], [], faces)
    data.validate()
    data.update()
    return finish(bpy.data.objects.new(name, data), name, mat, bevel, segments, smooth)


def linked_mesh(name, vertices, faces, mat, bevel=0.0, segments=2, smooth=True):
    obj = mesh(name, vertices, faces, mat, bevel, segments, smooth)
    bpy.context.collection.objects.link(obj)
    return obj


def profile(name, polygon, z0, z1, mat, bevel=0.025, segments=3):
    """Perfil lateral XY extrudado na largura Z."""
    vertices = [(x, y, z) for z in (z0, z1) for x, y in polygon]
    count = len(polygon)
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    return linked_mesh(name, vertices, faces, mat, bevel, segments, smooth=False)


def rod(name, start, end, radius, mat, vertices=12, bevel=0.0):
    a, b = Vector(xyz(start)), Vector(xyz(end))
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(b - a).length, location=(a + b) / 2)
    obj = bpy.context.object
    obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, name, mat, bevel, 2)


def cylinder(name, center, axis, radius, depth, mat, vertices=24, bevel=0.008):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=xyz(center))
    obj = bpy.context.object
    obj.rotation_euler = {
        'x': (0, math.pi / 2, 0),
        'y': (0, 0, 0),
        'z': (math.pi / 2, 0, 0),
    }[axis]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, name, mat, bevel, 2)


def torus(name, center, major, minor, mat, major_segments=40, minor_segments=12):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=xyz(center),
        rotation=(math.pi / 2, 0, 0),
    )
    return finish(bpy.context.object, name, mat, 0.0, smooth=True)


def quad(name, points, mat, bevel=0.0):
    return linked_mesh(name, points, [tuple(range(len(points)))], mat, bevel, 2, smooth=False)


def arch_fender(name, center_x, center_y, radius_inner, radius_outer, z0, z1, mat, steps=22):
    """Lamina curva sobre a roda, aberta embaixo e com espessura visivel."""
    angles = [math.radians(10 + i * 160 / steps) for i in range(steps + 1)]
    vertices = []
    for z in (z0, z1):
        for radius in (radius_inner, radius_outer):
            vertices += [(center_x + math.cos(a) * radius, center_y + math.sin(a) * radius, z) for a in angles]
    n = len(angles)
    faces = []
    for z_layer in (0, 1):
        base = z_layer * n * 2
        for i in range(steps):
            faces.append((base + i, base + i + 1, base + n + i + 1, base + n + i))
    for radial in (0, 1):
        a = radial * n
        b = n * 2 + radial * n
        for i in range(steps):
            faces.append((a + i, b + i, b + i + 1, a + i + 1))
    faces += [(0, n, n * 3, n * 2), (n - 1, n * 2 - 1, n * 4 - 1, n * 3 - 1)]
    return linked_mesh(name, vertices, faces, mat, 0.012, 2, smooth=True)


def chevron_lug(name, center, radial, tangent, axial_half, tangent_half, radial_half, slope, mat):
    """Paralelepipedo orientado: garra diagonal que forma o V agricola."""
    c = Vector(center)
    r = Vector(radial) * radial_half
    t = Vector(tangent)
    a = Vector((0, 0, 1))
    u = a * axial_half + t * slope
    v = t * tangent_half
    vertices = []
    for sr, su, sv in ((-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1),
                       (1, -1, -1), (1, -1, 1), (1, 1, 1), (1, 1, -1)):
        vertices.append(tuple(c + r * sr + u * su + v * sv))
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7)]
    return linked_mesh(name, vertices, faces, mat, 0.008, 2, smooth=False)


def wheel(label, center_x, radius, width, center_z, front=False):
    center_y = radius
    # Carcaca arredondada, aro rebaixado e cubo aparafusado.
    casing = radius * 0.93
    torus(f'{label}-pneu', (center_x, center_y, center_z), casing * 0.72, casing * 0.28, tire,
          48 if not front else 40, 14)
    for face in (-1, 1):
        z = center_z + face * width * 0.47
        cylinder(f'{label}-aro', (center_x, center_y, z), 'z', radius * 0.55, 0.055, rim, 32, 0.012)
        cylinder(f'{label}-cubo', (center_x, center_y, z + face * 0.035), 'z', radius * 0.18, 0.07, steel, 20, 0.006)
        for i in range(8):
            angle = i * math.pi / 4
            cylinder(
                f'{label}-parafuso',
                (center_x + math.cos(angle) * radius * 0.28, center_y + math.sin(angle) * radius * 0.28, z + face * 0.075),
                'z', radius * 0.025, 0.025, steel, 8, 0.002,
            )
    # Duas metades espelhadas por passo formam garras em chevron de verdade.
    count = 24 if not front else 20
    for index in range(count):
        angle = index * math.tau / count
        radial = (math.cos(angle), math.sin(angle), 0)
        tangent = (-math.sin(angle), math.cos(angle), 0)
        surface_x = center_x + radial[0] * (radius * 0.965)
        surface_y = center_y + radial[1] * (radius * 0.965)
        for half in (-1, 1):
            chevron_lug(
                f'{label}-garra',
                (surface_x, surface_y, center_z + half * width * 0.24),
                radial, tangent,
                width * 0.24, radius * 0.055, radius * 0.035,
                half * radius * 0.11, tire,
            )


# ---------------------------------------------------------------- chassis e capô
box('chassi-esquerdo', (-0.05, 0.58, -0.48), (3.95, 0.18, 0.15), steel, 0.025)
box('chassi-direito', (-0.05, 0.58, 0.48), (3.95, 0.18, 0.15), steel, 0.025)
for x in (-1.25, -0.25, 0.75, 1.65):
    box('travessa-do-chassi', (x, 0.58, 0), (0.13, 0.15, 1.05), steel, 0.018)

# Capô facetado com frente alta e nariz levemente caido.
hood_poly = [(-0.02, 0.91), (2.50, 0.91), (2.61, 1.12), (2.51, 1.78), (2.23, 1.92),
             (0.34, 2.02), (-0.02, 1.84)]
profile('capo-principal', hood_poly, -0.69, 0.69, paint, 0.045, 3)
profile('faixa-lateral-esquerda', [(0.18, 1.65), (2.34, 1.72), (2.48, 1.60), (0.18, 1.52)], 0.695, 0.715, accent, 0.008, 2)
profile('faixa-lateral-direita', [(0.18, 1.65), (2.34, 1.72), (2.48, 1.60), (0.18, 1.52)], -0.715, -0.695, accent, 0.008, 2)
box('grade-frontal', (2.585, 1.37, 0), (0.055, 0.72, 1.08), dark, 0.025, 3)
for z in (-0.42, -0.21, 0, 0.21, 0.42):
    box('aleta-grade-frontal', (2.622, 1.36, z), (0.02, 0.55, 0.035), steel, 0.005)
for side in (-1, 1):
    # Painel de ventilacao com barras horizontais e moldura.
    box('rebaixo-ventilacao', (1.18, 1.42, side * 0.704), (1.18, 0.48, 0.025), dark, 0.018)
    for x in (0.78, 1.02, 1.26, 1.50):
        box('aleta-ventilacao', (x, 1.42, side * 0.724), (0.06, 0.38, 0.018), steel, 0.004)
    box('farol-frontal', (2.60, 1.64, side * 0.43), (0.06, 0.22, 0.28), lamp, 0.025, 3)

# Lastro dianteiro: laminas independentes legiveis na silhueta.
box('suporte-lastro', (2.66, 0.73, 0), (0.52, 0.20, 0.52), steel, 0.025)
for i in range(9):
    box('placa-lastro-dianteiro', (2.86, 0.72, (i - 4) * 0.115), (0.31, 0.54, 0.085), dark, 0.018, 2)

# ---------------------------------------------------------------- cabine fechada e interior
box('piso-cabine', (-0.66, 0.94, 0), (1.72, 0.18, 1.48), dark, 0.035)
for side in (-1, 1):
    # Colunas A/B/C visiveis separam os paineis de vidro.
    for x, y, height in ((0.18, 2.02, 1.75), (-0.58, 2.05, 1.88), (-1.34, 1.98, 1.72)):
        rod('coluna-cabine', (x, y - height / 2, side * 0.69), (x, y + height / 2, side * 0.69), 0.045, dark, 10)
    quad('vidro-porta', [(0.13, 1.17, side * 0.701), (0.13, 2.78, side * 0.701),
                         (-0.54, 2.92, side * 0.701), (-0.54, 1.17, side * 0.701)], glass)
    quad('vidro-lateral-traseiro', [(-0.62, 1.20, side * 0.701), (-0.62, 2.91, side * 0.701),
                                    (-1.28, 2.72, side * 0.701), (-1.28, 1.22, side * 0.701)], glass)
    box('corrimao-cabine', (-0.15, 1.55, side * 0.80), (0.055, 1.25, 0.055), steel, 0.015)
    # Tres degraus vazados sob cada porta.
    for idx, y in enumerate((0.38, 0.62, 0.86)):
        box('degrau-antiderrapante', (-0.13 - idx * 0.055, y, side * 0.84), (0.44, 0.055, 0.35), steel, 0.012)
    # Retrovisor com braco duplo.
    rod('braco-retrovisor', (0.05, 2.58, side * 0.66), (0.20, 2.60, side * 1.08), 0.025, dark, 10)
    box('retrovisor', (0.20, 2.51, side * 1.13), (0.11, 0.31, 0.15), dark, 0.025, 3)

# Para-brisa e vidro traseiro em placas discretas para evitar dupla transparencia.
quad('para-brisa', [(0.205, 1.25, -0.62), (0.205, 1.25, 0.62), (0.205, 2.78, 0.56), (0.205, 2.78, -0.56)], glass)
quad('vidro-traseiro', [(-1.355, 1.25, 0.59), (-1.355, 1.25, -0.59), (-1.355, 2.69, -0.54), (-1.355, 2.69, 0.54)], glass)
profile('teto-cabine', [(-1.43, 2.70), (-1.26, 3.02), (0.05, 3.08), (0.29, 2.79)], -0.79, 0.79, paint, 0.055, 3)

# Banco, console, volante e coluna aparecem atraves do vidro.
box('assento-operador', (-0.79, 1.48, 0), (0.52, 0.18, 0.52), interior, 0.055, 3)
box('encosto-operador', (-1.02, 1.90, 0), (0.16, 0.72, 0.53), interior, 0.055, 3)
box('console-operador', (-0.05, 1.35, -0.18), (0.55, 0.42, 0.72), interior, 0.035)
torus('volante', (0.05, 2.03, -0.03), 0.18, 0.018, interior, 24, 8)
rod('coluna-volante', (0.03, 1.70, -0.03), (0.05, 2.03, -0.03), 0.025, interior, 10)

# Luzes de trabalho no teto e giroflex.
for x in (-1.15, 0.05):
    for side in (-1, 1):
        box('projetor-cabine', (x, 2.89, side * 0.64), (0.12, 0.13, 0.17), lamp, 0.022, 3)
cylinder('base-giroflex', (-0.62, 3.09, 0.28), 'y', 0.085, 0.045, dark, 16, 0.005)
cylinder('domo-giroflex', (-0.62, 3.10, 0.28), 'y', 0.073, 0.14, amber, 20, 0.01)

# Escapamento vertical com silencioso e ponteira inclinada.
cylinder('silencioso-vertical', (0.12, 2.02, -0.78), 'y', 0.105, 1.05, dark, 20, 0.012)
rod('escapamento-vertical', (0.12, 2.50, -0.78), (0.12, 3.04, -0.78), 0.060, dark, 14)
rod('ponteira-escapamento', (0.12, 3.04, -0.78), (0.21, 3.12, -0.78), 0.060, dark, 14)

# ---------------------------------------------------------------- rodas e para-lamas
for side in (-1, 1):
    wheel(f'roda-traseira-{side}', -0.75, 0.82, 0.52, side * 1.02, front=False)
    wheel(f'roda-dianteira-{side}', 1.58, 0.61, 0.44, side * 1.00, front=True)
    arch_fender('paralama-traseiro', -0.75, 0.82, 0.96, 1.03,
                side * 0.74, side * 1.30, paint, 24)
    arch_fender('paralama-dianteiro', 1.58, 0.61, 0.73, 0.79,
                side * 0.75, side * 1.25, dark, 20)

# Eixos e diferencial ficam legiveis entre as rodas.
rod('eixo-traseiro', (-0.75, 0.82, -1.11), (-0.75, 0.82, 1.11), 0.105, steel, 18)
cylinder('diferencial-traseiro', (-0.75, 0.82, 0), 'z', 0.25, 0.42, steel, 24, 0.018)
rod('eixo-dianteiro', (1.58, 0.61, -1.04), (1.58, 0.61, 1.04), 0.08, steel, 16)

# ---------------------------------------------------------------- engate de tres pontos e hidraulica
box('suporte-engate', (-1.73, 0.76, 0), (0.18, 0.82, 0.82), steel, 0.025)
for side in (-1, 1):
    rod('braco-inferior-engate', (-1.70, 0.58, side * 0.34), (-2.62, 0.31, side * 0.49), 0.055, steel, 14)
    cylinder('olhal-engate', (-2.63, 0.31, side * 0.49), 'z', 0.11, 0.06, steel, 20, 0.006)
    rod('tirante-vertical', (-1.92, 1.06, side * 0.34), (-2.22, 0.42, side * 0.44), 0.032, steel, 12)
rod('terceiro-ponto', (-1.79, 1.19, 0), (-2.48, 0.75, 0), 0.047, steel, 14)
cylinder('olhal-terceiro-ponto', (-2.49, 0.75, 0), 'z', 0.105, 0.07, steel, 20, 0.006)
for side in (-1, 1):
    rod('cilindro-hidraulico-engate', (-1.58, 1.12, side * 0.26), (-2.13, 0.46, side * 0.40), 0.055, paint, 14)
for z in (-0.25, -0.08, 0.08, 0.25):
    cylinder('conector-hidraulico', (-1.78, 1.35, z), 'x', 0.045, 0.10, accent, 14, 0.004)

# Lanternas e refletores traseiros.
for side in (-1, 1):
    box('lanterna-traseira', (-1.48, 1.43, side * 0.58), (0.08, 0.18, 0.24), red, 0.02, 3)

# Lama seca concentrada embaixo, sem encobrir a pintura nem os vidros.
for x, z, sx in ((-1.18, -0.38, 0.38), (-1.18, 0.38, 0.38), (0.62, -0.53, 0.62), (0.62, 0.53, 0.62)):
    box('crosta-lama-seca', (x, 0.69, z), (sx, 0.06, 0.18), dust, 0.015)
for side in (-1, 1):
    # Pequena faixa irregular na banda baixa dos pneus; a garra continua dominante.
    for angle in (215, 245, 275, 305):
        a = math.radians(angle)
        quad('poeira-no-pneu', [
            (-0.75 + math.cos(a - 0.09) * 0.80, 0.82 + math.sin(a - 0.09) * 0.80, side * 1.285),
            (-0.75 + math.cos(a + 0.09) * 0.80, 0.82 + math.sin(a + 0.09) * 0.80, side * 1.285),
            (-0.75 + math.cos(a + 0.09) * 0.70, 0.82 + math.sin(a + 0.09) * 0.70, side * 1.287),
            (-0.75 + math.cos(a - 0.09) * 0.70, 0.82 + math.sin(a - 0.09) * 0.70, side * 1.287),
        ], dust)


# ---------------------------------------------------------------- consolidacao por material
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH':
        continue
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Um mesh por material. As ilhas continuam separadas e o rig particiona rodas e engate.
for mat in list(bpy.data.materials):
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.data.materials and obj.data.materials[0] == mat]
    if not objects:
        continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    objects[0].name = f'trator-{mat.name.lower().replace(" ", "-")}'

triangles = sum(len(poly.vertices) - 2 for obj in bpy.context.scene.objects if obj.type == 'MESH' for poly in obj.data.polygons)
out = os.path.abspath(os.environ.get('AGRI_TRACTOR_OUT', 'public/models/sompo/generated-agri-tractor.glb'))
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    export_yup=True,
    export_apply=True,
    export_materials='EXPORT',
)
print('AGRI_TRACTOR_EXPORTED', out, os.path.getsize(out), 'triangles', triangles, 'materials', len(bpy.data.materials))
