"""Colheitadeira genérica brasileira para o simulador SOMPO.

Modelo procedural em metros, +X para a frente, +Y para cima e +Z para a
esquerda. A plataforma, as rodas e o corpo respeitam os pivôs usados por
rigSompoAgriAsset. Não há marca ou geometria baixada.
"""
import bpy
import bmesh
import hashlib
import json
import math
import os
from mathutils import Vector
from mathutils.bvhtree import BVHTree


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def xyz(point):
    """Converte coordenadas do rig (X frente, Y cima, Z esquerda) para Blender."""
    return (point[0], -point[2], point[1])


def inp(principled, name, value):
    if name in principled.inputs:
        principled.inputs[name].default_value = value


def material(name, color, metal=0.0, rough=.5, coat=0.0, emission=0.0, alpha=1.0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, alpha)
    result.use_nodes = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    inp(shader, 'Base Color', (*color, 1))
    inp(shader, 'Metallic', metal)
    inp(shader, 'Roughness', rough)
    inp(shader, 'Alpha', alpha)
    if coat:
        inp(shader, 'Coat Weight', coat)
        inp(shader, 'Coat Roughness', .16)
    if emission:
        inp(shader, 'Emission Color', (*color, 1))
        inp(shader, 'Emission Strength', emission)
    if alpha < 1:
        for key, value in (('surface_render_method', 'DITHERED'), ('use_transparency_overlap', False)):
            try:
                setattr(result, key, value)
            except Exception:
                pass
    return result


# Paleta de autoria. Na exportação, as cores e a rugosidade são consolidadas em
# CavityAO e um único material opaco por parte rígida. O vidro fica separado.
green = material('Harvester green satin', (.025, .22, .075), .28, .34, .52)
green_dark = material('Harvester dark green', (.012, .075, .032), .32, .44, .3)
yellow = material('Harvester warm yellow', (.96, .61, .015), .22, .32, .45)
rubber = material('Harvester tyre rubber', (.016, .019, .017), .02, .88)
dark = material('Harvester black metal', (.014, .019, .017), .5, .48)
steel = material('Harvester brushed steel', (.38, .42, .40), .84, .29)
glass = material('Harvester panoramic glass', (.035, .11, .105), .08, .08, alpha=.24)
interior = material('Harvester cabin interior', (.045, .052, .043), .02, .82)
lamp = material('Harvester work lights', (.84, .89, .82), .14, .16, emission=.18)
amber = material('Harvester amber lights', (.92, .28, .015), .08, .24, emission=.28)
red = material('Harvester rear lights', (.56, .012, .008), .12, .30, emission=.14)


root = bpy.data.objects.new('agri-harvester', None)
bpy.context.collection.objects.link(root)

parts = {}
for part_name in (
    'harvester-body',
    'harvester-wheel-front-left',
    'harvester-wheel-front-right',
    'harvester-wheel-rear-left',
    'harvester-wheel-rear-right',
    'harvester-header',
    'harvester-reel',
):
    part = bpy.data.objects.new(part_name, None)
    bpy.context.collection.objects.link(part)
    part.parent = root
    parts[part_name] = part


def parent_for(name):
    for prefix in ('front-left', 'front-right', 'rear-left', 'rear-right'):
        if name.startswith(prefix + '-'):
            return parts['harvester-wheel-' + prefix]
    if name.startswith('header-reel-'):
        return parts['harvester-reel']
    if name.startswith(('header-', 'corn-', 'divider-', 'cutter-')):
        return parts['harvester-header']
    return parts['harvester-body']


def mesh_object(name, vertices, faces, mat, bevel=0.0, segments=2, smooth=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([xyz(point) for point in vertices], [], faces)
    mesh.validate()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent_for(name)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new('Chanfrado', 'BEVEL')
        modifier.width = bevel
        modifier.segments = segments
        modifier.limit_method = 'ANGLE'
    if smooth:
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        normals = obj.modifiers.new('Normais ponderadas', 'WEIGHTED_NORMAL')
        normals.keep_sharp = True
        normals.weight = 45
    return obj


def finish_primitive(obj, name, mat, bevel=0.0, segments=2, smooth=True):
    obj.name = name
    obj.parent = parent_for(name)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new('Chanfrado', 'BEVEL')
        modifier.width = bevel
        modifier.segments = segments
        modifier.limit_method = 'ANGLE'
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        normals = obj.modifiers.new('Normais ponderadas', 'WEIGHTED_NORMAL')
        normals.keep_sharp = True
        normals.weight = 45
    return obj


def box(name, center, size, mat, bevel=.018, segments=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(center))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_primitive(obj, name, mat, bevel, segments)


def box2(name, low, high, mat, bevel=.018, segments=2):
    low = tuple(min(a, b) for a, b in zip(low, high))
    high = tuple(max(a, b) for a, b in zip(low, high))
    center = tuple((a + b) / 2 for a, b in zip(low, high))
    size = tuple(b - a for a, b in zip(low, high))
    return box(name, center, size, mat, bevel, segments)


def profile(name, polygon, z0, z1, mat, bevel=.025, segments=2):
    """Perfil lateral em XY, extrudado na largura Z."""
    vertices = [(x, y, z) for z in (z0, z1) for x, y in polygon]
    count = len(polygon)
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    return mesh_object(name, vertices, faces, mat, bevel, segments)


def wedge(name, rear_x, tip_x, y0, y1, z_center, rear_width, tip_width, mat):
    """Bico fechado da plataforma, com ponta baixa e seção traseira alta."""
    vertices = [
        (tip_x, y0 + .03, z_center - tip_width / 2), (tip_x, y0 + .03, z_center + tip_width / 2),
        (rear_x, y0, z_center - rear_width / 2), (rear_x, y0, z_center + rear_width / 2),
        (rear_x, y1, z_center - rear_width / 2), (rear_x, y1, z_center + rear_width / 2),
        (tip_x - .18, y0 + .16, z_center - tip_width / 2), (tip_x - .18, y0 + .16, z_center + tip_width / 2),
    ]
    faces = [(0, 1, 7, 6), (2, 4, 5, 3), (0, 6, 4, 2), (1, 3, 5, 7),
             (0, 2, 3, 1), (6, 7, 5, 4)]
    return mesh_object(name, vertices, faces, mat, .018, 2)


def rod(name, start, end, radius, mat, vertices=12):
    a, b = Vector(xyz(start)), Vector(xyz(end))
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(b - a).length, location=(a + b) / 2)
    obj = bpy.context.object
    obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish_primitive(obj, name, mat, smooth=True)


def cylinder(name, center, axis, radius, depth, mat, vertices=24, bevel=.008):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=xyz(center))
    obj = bpy.context.object
    obj.rotation_euler = {
        'x': (0, math.pi / 2, 0),
        'y': (0, 0, 0),
        'z': (math.pi / 2, 0, 0),
    }[axis]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish_primitive(obj, name, mat, bevel, 2)


def torus(name, center, major_radius, minor_radius, mat, major_segments=32, minor_segments=12):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=xyz(center),
        rotation=(math.pi / 2, 0, 0),
    )
    return finish_primitive(bpy.context.object, name, mat, smooth=True)


def wheel(prefix, center, radius, width, rim_radius, lug_count):
    """Pneu agrícola com cravos altos em chevron, aro, cubo e porcas."""
    x, y, z = center
    torus(prefix + '-tyre', center, radius * .71, radius * .29, rubber, 44, 14)
    cylinder(prefix + '-rim', center, 'z', rim_radius, width * 1.045, yellow, 32, .018)
    outside = z + math.copysign(width * .55, z)
    cylinder(prefix + '-hub', (x, y, outside), 'z', rim_radius * .34, .07, steel, 24, .006)
    for index in range(8):
        angle = index * math.tau / 8
        cylinder(prefix + '-nut', (
            x + math.cos(angle) * rim_radius * .23,
            y + math.sin(angle) * rim_radius * .23,
            outside + math.copysign(.042, z),
        ), 'z', rim_radius * .035, .035, dark, 10, .002)
    for index in range(lug_count):
        angle = index * math.tau / lug_count
        # Duas metades inclinadas formam o V alto da banda agrícola.
        lateral = (.19 if index % 2 else -.19) * width
        cx = x + math.cos(angle) * radius * .91
        cy = y + math.sin(angle) * radius * .91
        lug = box(prefix + '-lug', (cx, cy, z + lateral),
                  (radius * .26, width * .48, radius * .14), rubber, .024, 1)
        lug.rotation_euler[1] = -angle
        lug.rotation_euler[0] = math.radians(24 if index % 2 else -24)


# ---------------------------------------------------------------- chassi e rodas
box2('chassis-longarina', (-3.65, .72, -.82), (2.22, .98, .82), dark, .035, 3)
for z in (-.92, .92):
    box2('chassis-rail', (-3.80, .62, z - .07), (2.26, .82, z + .07), steel, .015)
for x in (-3.25, -2.2, -1.0, .2, 1.25):
    box2('chassis-crossmember', (x - .055, .66, -.98), (x + .055, .80, .98), dark, .008)

wheel('front-left', (1.30, .95, 1.24), .95, .58, .53, 22)
wheel('front-right', (1.30, .95, -1.24), .95, .58, .53, 22)
wheel('rear-left', (-1.48, .62, 1.10), .62, .44, .35, 18)
wheel('rear-right', (-1.48, .62, -1.10), .62, .44, .35, 18)

# Eixos, redutores e braços de direção visíveis sob a máquina.
for x, y, half_width, radius in ((1.30, .95, 1.24, .14), (-1.48, .62, 1.10, .11)):
    rod('axle', (x, y, -half_width), (x, y, half_width), radius, dark, 16)
    cylinder('final-drive', (x, y, half_width), 'z', radius * 1.65, .18, steel, 20)
    cylinder('final-drive', (x, y, -half_width), 'z', radius * 1.65, .18, steel, 20)
rod('rear-steering-link', (-1.48, .74, -1.02), (-1.48, .74, 1.02), .035, steel, 10)


# ---------------------------------------------------------------- corpo, tanque graneleiro e painéis
# Casco em degraus, com volumes de motor, graneleiro e transmissão legíveis.
profile('main-body', [(-4.38, 1.08), (-4.35, 2.56), (-4.06, 2.90), (-3.48, 3.08),
                      (-1.72, 3.10), (-1.56, 2.84), (-.30, 2.84), (.40, 2.47),
                      (.82, 1.72), (.70, 1.17)], -1.28, 1.28, green, .055, 3)
profile('rear-engine-cover', [(-4.54, 1.22), (-4.52, 2.62), (-4.22, 2.88), (-3.08, 2.90),
                              (-2.76, 2.60), (-2.66, 1.16)], -1.35, 1.35, green_dark, .045, 3)
profile('mid-service-panel', [(-3.00, 1.34), (-2.96, 2.72), (-1.70, 2.76),
                              (-1.42, 2.45), (-1.46, 1.30)], 1.286, 1.335, green, .018, 2)
profile('mid-service-panel-far', [(-3.00, 1.34), (-2.96, 2.72), (-1.70, 2.76),
                                  (-1.42, 2.45), (-1.46, 1.30)], -1.335, -1.286, green, .018, 2)
# A faixa é uma lâmina fina aplicada sobre painéis, não um volume estrutural.
profile('yellow-side-band-left', [(-4.04, 2.05), (-3.90, 2.24), (-.76, 2.35),
                                  (-.50, 2.20), (-.62, 2.08)], 1.348, 1.373, yellow, .008, 1)
profile('yellow-side-band-right', [(-4.04, 2.05), (-3.90, 2.24), (-.76, 2.35),
                                   (-.50, 2.20), (-.62, 2.08)], -1.373, -1.348, yellow, .008, 1)

# Funil central e quatro abas abertas: o topo fica mais largo que o casco.
profile('grain-tank', [(-3.58, 2.82), (-3.25, 3.54), (-2.82, 3.70), (-.36, 3.70),
                       (.04, 3.48), (.02, 2.82)], -1.03, 1.03, green, .04, 3)
for side in (-1, 1):
    inner = side * 1.00
    outer = side * 1.56
    vertices = [
        (-3.42, 3.48, inner), (-.18, 3.48, inner),
        (-.34, 3.88, outer), (-3.14, 3.88, outer),
        (-3.42, 3.44, inner), (-.18, 3.44, inner),
        (-.34, 3.84, outer), (-3.14, 3.84, outer),
    ]
    mesh_object('grain-tank-open-flap', vertices,
                [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
                 (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], green, .018, 2)
box2('grain-tank-front-lip', (-3.48, 3.78, -1.48), (-3.10, 3.94, 1.48), green_dark, .018)
box2('grain-tank-rear-lip', (-.42, 3.78, -1.48), (-.10, 3.94, 1.48), green_dark, .018)
for x in (-3.0, -2.25, -1.5, -.75):
    rod('grain-tank-brace-left', (x, 3.15, 1.23), (x + .18, 3.83, 1.23), .027, steel, 10)
    rod('grain-tank-brace-right', (x, 3.15, -1.23), (x + .18, 3.83, -1.23), .027, steel, 10)

# Grades reais, recuadas, nas duas faces do compartimento do motor.
for side in (-1, 1):
    z_face = side * 1.374
    box2('engine-vent-recess', (-4.10, 2.28, z_face - side * .012), (-3.10, 2.82, z_face), dark, .012)
    for y in (2.35, 2.46, 2.57, 2.68, 2.79):
        box('engine-vent-slat', (-3.60, y, z_face + side * .014), (.90, .035, .025), steel, .006, 1)

# Tela rotativa do radiador e frisos de serviço na face próxima à câmera.
cylinder('rotary-screen', (-3.46, 2.10, 1.395), 'z', .47, .045, dark, 48, .008)
torus('rotary-screen-ring', (-3.46, 2.10, 1.426), .38, .022, steel, 36, 8)
cylinder('rotary-screen-hub', (-3.46, 2.10, 1.445), 'z', .075, .04, steel, 18, .003)
for angle in range(0, 360, 45):
    a = math.radians(angle)
    rod('rotary-screen-spoke', (-3.46, 2.10, 1.447),
        (-3.46 + math.cos(a) * .36, 2.10 + math.sin(a) * .36, 1.447), .011, steel, 6)
for x in (-4.10, -3.04, -1.66, -.48):
    box('panel-seam', (x, 1.74, 1.383), (.018, 1.05, .018), dark, .003, 1)

# Poeira física discreta nos protetores inferiores, usando a própria paleta PBR.
for side in (-1, 1):
    box2('lower-dust-panel', (-3.65, .94, side * 1.285), (-2.02, 1.30, side * 1.325), green_dark, .025)
    for x in (-3.45, -3.05, -2.65, -2.25):
        box('dust-streak', (x, 1.02, side * 1.348), (.20, .045, .018), yellow, .006, 1)


# ---------------------------------------------------------------- cabine panorâmica e interior
# Cabine realmente vazada: piso, antepara e peitoris substituem uma casca
# fechada, para banco, painel e volante permanecerem legíveis pelo vidro.
box2('cab-floor', (.98, 1.16, -.91), (2.40, 1.38, .91), green, .035, 3)
box2('cab-rear-bulkhead', (.96, 1.28, -.91), (1.10, 3.52, .91), green, .035, 3)
box2('cab-front-sill', (2.28, 1.30, -.91), (2.43, 1.70, .91), green, .028, 3)
for side in (-1, 1):
    box2('cab-side-sill', (1.06, 1.30, side * .84), (2.35, 1.70, side * .92), green, .025, 2)
box2('cab-roof', (.88, 3.52, -1.03), (2.34, 3.69, 1.03), green, .04, 3)
box2('cab-roof-yellow-pinstripe', (2.29, 3.50, -1.02), (2.365, 3.57, 1.02), yellow, .008, 1)

# Para-brisa em três lâminas: centro inclinado e cantos recuados simulam a
# curvatura panorâmica sem uma bolha plástica lisa.
for z0, z1, bottom_x, top_x in (
    (-.82, -.36, 2.34, 2.12), (-.36, .36, 2.42, 2.18), (.36, .82, 2.34, 2.12),
):
    mesh_object('front-windscreen-curved', [
        (bottom_x, 1.70, z0), (bottom_x, 1.70, z1),
        (top_x, 3.45, z1), (top_x, 3.45, z0),
    ], [(0, 1, 2, 3)], glass, 0, 1, False)
for side in (-1, 1):
    z = side * .925
    # Janela lateral principal e vidro inferior de visão da plataforma.
    vertices = [(1.10, 1.70, z), (1.10, 3.38, z), (2.14, 3.40, z), (2.31, 1.70, z)]
    mesh_object('cab-side-window', vertices, [(0, 1, 2, 3)], glass, 0, 1, False)
    vertices = [(1.84, 1.30, z + side * .002), (1.86, 1.66, z + side * .002),
                (2.30, 1.66, z + side * .002), (2.34, 1.36, z + side * .002)]
    mesh_object('cab-lower-window', vertices, [(0, 1, 2, 3)], glass, 0, 1, False)
    rod('cab-rear-window-post', (1.07, 1.38, z + side * .025),
        (1.07, 3.46, z + side * .025), .034, green_dark, 10)
    rod('cab-a-pillar', (2.37, 1.38, z + side * .025),
        (2.12, 3.47, z + side * .025), .042, green_dark, 10)

# Banco, console, painel e volante estão atrás do vidro, não pintados nele.
box('seat-base', (1.50, 1.47, .18), (.54, .26, .54), interior, .08, 3)
box('seat-back', (1.35, 2.02, .18), (.22, .88, .55), interior, .10, 3)
box('dashboard', (2.13, 1.88, 0), (.34, .36, 1.22), interior, .05, 2)
rod('steering-column', (1.96, 1.83, .17), (2.14, 2.08, .17), .035, steel, 10)
torus('steering-wheel', (2.15, 2.10, .17), .20, .025, dark, 20, 8)
rod('windscreen-center-post', (2.42, 1.67, 0), (2.18, 3.48, 0), .022, green_dark, 8)

# Faróis e projetores em caixas individuais.
for z in (-.67, -.22, .22, .67):
    box('roof-work-light', (2.34, 3.50, z), (.12, .18, .24), dark, .018)
    box('roof-work-lens', (2.407, 3.50, z), (.018, .13, .18), lamp, .004, 1)
for side in (-1, 1):
    box('lower-headlight', (2.39, 1.50, side * .70), (.12, .18, .28), lamp, .018)
    cylinder('beacon', (1.38, 3.82, side * .72), 'y', .075, .15, amber, 16, .006)

# Espelhos em braços reais.
for side in (-1, 1):
    rod('mirror-arm', (1.86, 2.92, side * .88), (2.06, 2.82, side * 1.24), .025, dark, 10)
    box('mirror', (2.08, 2.72, side * 1.28), (.08, .34, .20), dark, .035, 3)


# ---------------------------------------------------------------- acesso, corrimãos e hidráulica
# Passarela em L contorna a cabine, com escada inclinada no lado visível.
box2('access-platform-side', (.72, 1.55, 1.00), (2.30, 1.68, 1.62), dark, .018, 2)
box2('access-platform-front', (2.22, 1.55, -1.02), (2.47, 1.68, 1.58), dark, .018, 2)
for index, y in enumerate((.42, .68, .94, 1.20, 1.46)):
    x = .48 + index * .075
    box('ladder-step', (x, y, 1.54), (.44, .065, .55), steel, .012, 2)
for z in (1.28, 1.79):
    rod('ladder-rail', (.43, .34, z), (.82, 1.77, z), .032, steel, 10)
for x in (.82, 1.30, 1.78, 2.28):
    rod('platform-handrail-upright', (x, 1.65, 1.58), (x, 2.38, 1.58), .028, steel, 10)
rod('platform-handrail-top', (.82, 2.38, 1.58), (2.28, 2.38, 1.58), .030, steel, 10)
for z in (1.58, .72, -.20, -1.02):
    rod('front-handrail-upright', (2.43, 1.65, z), (2.43, 2.30, z), .027, steel, 10)
rod('front-handrail-top', (2.43, 2.30, -1.02), (2.43, 2.30, 1.58), .030, steel, 10)
rod('header-lift-left', (1.85, 1.08, .72), (2.48, .70, 1.06), .075, green_dark, 14)
rod('header-lift-right', (1.85, 1.08, -.72), (2.48, .70, -1.06), .075, green_dark, 14)
rod('header-cylinder-left', (1.62, 1.23, .62), (2.42, .82, .94), .038, steel, 10)
rod('header-cylinder-right', (1.62, 1.23, -.62), (2.42, .82, -.94), .038, steel, 10)


# ---------------------------------------------------------------- tubo descarregador dobrado
# Tubo longitudinal alto no lado visível, com base, bandas, joelho e bocal
# curvado sobre a cabine. Ele é a linha de silhueta típica da colheitadeira.
rod('unloading-auger-base', (-3.50, 3.02, 1.34), (-3.18, 3.37, 1.52), .25, green_dark, 28)
rod('unloading-auger-main', (-3.22, 3.38, 1.52), (.82, 3.38, 1.52), .205, green, 28)
rod('unloading-auger-elbow', (.76, 3.38, 1.52), (1.18, 3.55, 1.52), .225, green, 28)
rod('unloading-auger-head', (1.14, 3.54, 1.52), (1.83, 3.54, 1.52), .19, green, 28)
profile('unloading-spout', [(1.72, 3.69), (2.02, 3.57), (2.00, 3.18), (1.74, 3.28)],
        1.37, 1.67, dark, .025, 2)
for x in (-2.7, -1.7, -.7, .3):
    cylinder('auger-band', (x, 3.38, 1.52), 'x', .218, .055, steel, 20, .004)


# ---------------------------------------------------------------- plataforma de milho (toda acima de x=2,53 para o rig)
box2('header-backbone', (2.56, .52, -3.78), (2.78, .87, 3.78), green_dark, .028, 3)
box2('header-floor', (2.58, .34, -3.72), (4.02, .57, 3.72), green, .035, 3)
box2('cutter-bar', (3.92, .27, -3.76), (4.18, .39, 3.76), steel, .018)

# Sem-fim central com hélice sugerida por anéis alternados; todo em geometria.
rod('header-auger-shaft', (2.95, .80, -3.48), (2.95, .80, 3.48), .20, dark, 24)
for index, z in enumerate([(-3.30 + i * .30) for i in range(23)]):
    cylinder('header-auger-flight', (2.95 + (index % 2) * .045, .80, z), 'z', .39, .035, steel, 16, .004)

# Doze divisores dão a leitura inequívoca de plataforma de milho.
divider_count = 12
for index in range(divider_count):
    z = -3.45 + index * 6.90 / (divider_count - 1)
    wedge('corn-divider', 3.84, 4.60, .30, .69, z, .48, .055, green)
    box('divider-tip', (4.57, .35, z), (.13, .10, .075), yellow, .012, 2)

# Laterais, molinete de alimentação e dentes.
profile('header-side-left', [(2.58, .34), (2.58, 1.20), (3.55, 1.02), (4.20, .36)], 3.62, 3.80, green, .025, 2)
profile('header-side-right', [(2.58, .34), (2.58, 1.20), (3.55, 1.02), (4.20, .36)], -3.80, -3.62, green, .025, 2)
rod('header-reel-axis', (3.40, 1.06, -3.52), (3.40, 1.06, 3.52), .045, dark, 12)
for z in (-3.48, -1.74, 0, 1.74, 3.48):
    cylinder('header-reel-spider', (3.40, 1.06, z), 'z', .34, .026, yellow, 12, .003)
for angle in range(0, 360, 60):
    radians = math.radians(angle)
    x = 3.40 + math.cos(radians) * .34
    y = 1.06 + math.sin(radians) * .34
    rod('header-reel-bat', (x, y, -3.45), (x, y, 3.45), .026, dark, 8)
    for z in [(-3.30 + i * .44) for i in range(16)]:
        rod('header-reel-tine', (x, y, z), (x, y - .14, z), .012, steel, 6)


# Lanternas traseiras e olhais de serviço.
for side in (-1, 1):
    box('rear-lamp', (-4.49, 1.63, side * 1.04), (.10, .22, .18), red, .018)
    box('rear-indicator', (-4.50, 1.89, side * 1.04), (.10, .16, .18), amber, .018)
    rod('rear-handrail', (-4.24, 2.76, side * 1.28), (-3.46, 3.30, side * 1.28), .028, steel, 10)


# ---------------------------------------------------------------- consolidação, AO e exportação
# Aplica transformações/modificadores antes do bake. Cada parte rígida vira um
# draw opaco; a cor, a rugosidade e a poeira ficam no atributo CavityAO.
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH':
        continue
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)


opaque_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH'
                  and obj.data.materials and obj.data.materials[0] != glass]
vertices, polygons = [], []
for obj in opaque_objects:
    start = len(vertices)
    vertices.extend([obj.matrix_world @ vertex.co for vertex in obj.data.vertices])
    polygons.extend([tuple(start + index for index in polygon.vertices) for polygon in obj.data.polygons])
bvh = BVHTree.FromPolygons(vertices, polygons)
sample_directions = []
for index in range(12):
    radius = math.sqrt((index + .5) / 12)
    angle = index * 2.399963229728653
    sample_directions.append(Vector((radius * math.cos(angle), radius * math.sin(angle),
                                     math.sqrt(1 - radius * radius))))

for obj in opaque_objects:
    source_material = obj.data.materials[0]
    base = source_material.diffuse_color[:3]
    shader = source_material.node_tree.nodes.get('Principled BSDF')
    base_roughness = shader.inputs['Roughness'].default_value if shader else .5
    colors = obj.data.color_attributes.new(name='CavityAO', type='FLOAT_COLOR', domain='POINT')
    obj.data.color_attributes.active_color = colors
    normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
    for vertex in obj.data.vertices:
        point = obj.matrix_world @ vertex.co
        normal = (normal_matrix @ vertex.normal).normalized()
        rotation = Vector((0, 0, 1)).rotation_difference(normal)
        visibility = 0.0
        for direction in sample_directions:
            hit, _, _, distance = bvh.ray_cast(point + normal * .008, rotation @ direction, 1.8)
            visibility += 1 if hit is None else min(1, (distance / 1.8) ** .58)
        ao = .18 + .82 * visibility / len(sample_directions)
        # Altura no Blender é Z. A poeira ganha força abaixo de 1,75 m e recebe
        # ruído pequeno para não parecer uma faixa pintada a régua.
        dust_height = max(0.0, min(1.0, (1.85 - point.z) / 1.55))
        noise = .58 + .42 * (math.sin(point.x * 13.1 + point.y * 9.7) * .5 + .5)
        dust = dust_height * noise * (.18 if source_material == rubber else .34)
        dust_color = (.34, .25, .13)
        color = tuple((channel * (1 - dust) + dust_color[i] * dust) * ao
                      for i, channel in enumerate(base))
        roughness = max(.24, min(.96, base_roughness * (1 - dust) + .94 * dust))
        colors.data[vertex.index].color = (*color, roughness)

opaque = material('Harvester vertex-painted PBR', (1, 1, 1), .18, .52, .25)
opaque.diffuse_color = (1, 1, 1, 1)
opaque_shader = opaque.node_tree.nodes.get('Principled BSDF')
vertex_color = opaque.node_tree.nodes.new('ShaderNodeVertexColor')
vertex_color.layer_name = 'CavityAO'
opaque.node_tree.links.new(vertex_color.outputs['Color'], opaque_shader.inputs['Base Color'])
opaque.node_tree.links.new(vertex_color.outputs['Alpha'], opaque_shader.inputs['Roughness'])

for part in parts.values():
    children = [obj for obj in part.children if obj.type == 'MESH']
    for suffix, objects, target_material in (
        ('surface', [obj for obj in children if obj.data.materials[0] != glass], opaque),
        ('glass-surface', [obj for obj in children if obj.data.materials[0] == glass], glass),
    ):
        if not objects:
            continue
        for obj in objects:
            obj.data.materials.clear()
            obj.data.materials.append(target_material)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        objects[0].name = part.name + '-' + suffix

triangles = sum(len(poly.vertices) - 2 for obj in bpy.context.scene.objects if obj.type == 'MESH'
                for poly in obj.data.polygons)
mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
material_count = len({obj.data.materials[0].name for obj in mesh_objects if obj.data.materials})

output = os.path.abspath(os.environ.get('HARVESTER_OUT', 'public/models/sompo/generated-agri-harvester.glb'))
bpy.ops.export_scene.gltf(
    filepath=output,
    export_format='GLB',
    export_yup=True,
    export_apply=True,
    export_materials='EXPORT',
    export_vertex_color='ACTIVE',
)

digest = hashlib.sha256(open(output, 'rb').read()).hexdigest()
provenance = {
    'asset': os.path.basename(output),
    'generatedBy': 'Blender 5.2 + scripts/sompo/build-agri-harvester.py',
    'createdAt': '2026-09-25',
    'method': 'Procedural hard-surface modeling; no reconstruction, download, or purchased mesh',
    'referenceImage': 'generated-agri-harvester-source.png',
    'referenceUse': 'Visual proportion and color reference only',
    'license': 'SOMPO-AGRI-ASSET-LICENSE.txt',
    'coordinateSystem': '+X forward, +Y up, +Z left; metres',
    'nominalSizeM': {'length': 9.2, 'width': 7.6, 'height': 4.0},
    'features': [
        'Stepped modular body panels and open grain-tank flaps',
        'Panoramic transparent cabin with seat, dashboard and steering wheel',
        'Four agricultural tyres with geometric lugs and yellow rims',
        'Corn header with twelve dividers, cutter bar, auger, reel and tines',
        'Prominent folded unloading auger, rotary radiator screen and engine grilles',
        'Inclined ladder, wraparound access platform, handrails, mirrors and lights',
        'CavityAO vertex bake with height-based dust colour and roughness variation',
    ],
    'externalManifest': 'generated-agri-harvester.textures.json',
    'textures': [],
    'triangles': triangles,
    'materials': material_count,
    'bytes': os.path.getsize(output),
    'sha256': digest,
    'limits': [
        'Visual simulation asset, not manufacturing CAD',
        'Authored rigid nodes are consumed directly by the runtime rig',
    ],
}
with open(os.path.splitext(output)[0] + '.provenance.json', 'w', encoding='utf-8') as handle:
    json.dump(provenance, handle, ensure_ascii=False, indent=2)
    handle.write('\n')
with open(os.path.splitext(output)[0] + '.textures.json', 'w', encoding='utf-8') as handle:
    json.dump({'images': []}, handle, indent=2)
    handle.write('\n')

print('HARVESTER_EXPORTED', output, os.path.getsize(output), 'tris', triangles, 'materials', material_count)
