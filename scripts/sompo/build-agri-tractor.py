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
from mathutils.bvhtree import BVHTree


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


# Nove familias PBR. A mesma tinta amarela serve faixa e aros; o interior usa
# o plastico escuro. Isso conserva contraste e reduz os passes de material.
paint = material('Trator pintura verde', (0.025, 0.15, 0.048), 0.28, 0.34, coat=0.58)
accent = material('Trator amarelo', (0.86, 0.52, 0.018), 0.34, 0.38, coat=0.34)
dark = material('Trator plastico grade interior', (0.014, 0.017, 0.015), 0.10, 0.72)
tire = material('Trator borracha agricola', (0.038, 0.032, 0.025), 0.0, 0.95)
steel = material('Trator aco mecanico', (0.19, 0.22, 0.20), 0.68, 0.43)
glass = material('Trator vidro da cabine', (0.075, 0.16, 0.15), 0.05, 0.12, alpha=0.28, coat=0.5)
lamp = material('Trator farois', (0.82, 0.88, 0.79), 0.25, 0.19, emission=0.35)
red = material('Trator lanternas traseiras', (0.52, 0.018, 0.012), 0.12, 0.31, emission=0.15)
amber = material('Trator giroflex', (0.9, 0.28, 0.015), 0.08, 0.24, emission=0.3, alpha=0.82)
structural = material('Trator acabamentos unificados', (1, 1, 1), 0.25, 0.58)
wheel_finish = material('Trator roda unificada', (1, 1, 1), 0.08, 0.78)


parts = bpy.data.objects.new('trator-agricola-procedural', None)
bpy.context.collection.objects.link(parts)
rig_parts = {}
for key in ('body', 'wheel-0--1', 'wheel-0-1', 'wheel-1--1', 'wheel-1-1', 'hitch'):
    group = bpy.data.objects.new(f'rig-{key}', None)
    bpy.context.collection.objects.link(group)
    group.parent = parts
    rig_parts[key] = group


def finish(obj, name, mat, bevel=0.0, segments=2, smooth=True, rig='body'):
    obj.name = name
    obj.parent = rig_parts[rig]
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


def box(name, center, size, mat, bevel=0.015, segments=2, rig='body'):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(center))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel, segments, smooth=False, rig=rig)


def mesh(name, vertices, faces, mat, bevel=0.0, segments=2, smooth=True, rig='body'):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(vertex) for vertex in vertices], [], faces)
    data.validate()
    data.update()
    return finish(bpy.data.objects.new(name, data), name, mat, bevel, segments, smooth, rig)


def linked_mesh(name, vertices, faces, mat, bevel=0.0, segments=2, smooth=True, rig='body'):
    obj = mesh(name, vertices, faces, mat, bevel, segments, smooth, rig)
    bpy.context.collection.objects.link(obj)
    return obj


def profile(name, polygon, z0, z1, mat, bevel=0.025, segments=3, rig='body'):
    """Perfil lateral XY extrudado na largura Z."""
    vertices = [(x, y, z) for z in (z0, z1) for x, y in polygon]
    count = len(polygon)
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    return linked_mesh(name, vertices, faces, mat, bevel, segments, smooth=False, rig=rig)


def tapered_shell(name, sections, mat, bevel=0.025, rig='body'):
    """Casco por secoes (x, y_base, y_top, meia_largura), afunilado em planta."""
    vertices = []
    for x, bottom, top, half_width in sections:
        vertices += [(x, bottom, -half_width), (x, bottom, half_width),
                     (x, top, half_width), (x, top, -half_width)]
    faces = [(0, 3, 2, 1), (len(vertices) - 4, len(vertices) - 3, len(vertices) - 2, len(vertices) - 1)]
    for index in range(len(sections) - 1):
        a, b = index * 4, (index + 1) * 4
        faces += [(a, b, b + 3, a + 3), (a + 1, a + 2, b + 2, b + 1),
                  (a + 3, b + 3, b + 2, a + 2), (a, a + 1, b + 1, b)]
    return linked_mesh(name, vertices, faces, mat, bevel, 3, smooth=False, rig=rig)


def rod(name, start, end, radius, mat, vertices=12, bevel=0.0, rig='body'):
    a, b = Vector(xyz(start)), Vector(xyz(end))
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(b - a).length, location=(a + b) / 2)
    obj = bpy.context.object
    obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, name, mat, bevel, 2, rig=rig)


def cylinder(name, center, axis, radius, depth, mat, vertices=24, bevel=0.008, rig='body'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=xyz(center))
    obj = bpy.context.object
    obj.rotation_euler = {
        'x': (0, math.pi / 2, 0),
        'y': (0, 0, 0),
        'z': (math.pi / 2, 0, 0),
    }[axis]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, name, mat, bevel, 2, rig=rig)


def torus(name, center, major, minor, mat, major_segments=40, minor_segments=12, rig='body'):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=xyz(center),
        rotation=(math.pi / 2, 0, 0),
    )
    return finish(bpy.context.object, name, mat, 0.0, smooth=True, rig=rig)


def quad(name, points, mat, bevel=0.0, rig='body'):
    return linked_mesh(name, points, [tuple(range(len(points)))], mat, bevel, 2, smooth=False, rig=rig)


def arch_fender(name, center_x, center_y, radius_inner, radius_outer, z0, z1, mat, steps=22, rig='body'):
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
    return linked_mesh(name, vertices, faces, mat, 0.012, 2, smooth=True, rig=rig)


def chevron_lug(name, center, radial, tangent, axial_half, tangent_half, radial_half, slope, mat, rig):
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
    return linked_mesh(name, vertices, faces, mat, 0.008, 2, smooth=False, rig=rig)


def wheel(label, center_x, radius, width, center_z, rig, front=False):
    center_y = radius
    # Carcaca arredondada, aro rebaixado e cubo aparafusado.
    casing = radius * 0.93
    torus(f'{label}-pneu', (center_x, center_y, center_z), casing * 0.72, casing * 0.28, tire,
          48 if not front else 40, 14, rig=rig)
    for face in (-1, 1):
        z = center_z + face * width * 0.47
        cylinder(f'{label}-aro', (center_x, center_y, z), 'z', radius * 0.55, 0.055, accent, 32, 0.012, rig=rig)
        cylinder(f'{label}-cubo', (center_x, center_y, z + face * 0.035), 'z', radius * 0.18, 0.07, accent, 20, 0.006, rig=rig)
        for i in range(8):
            angle = i * math.pi / 4
            cylinder(
                f'{label}-parafuso',
                (center_x + math.cos(angle) * radius * 0.28, center_y + math.sin(angle) * radius * 0.28, z + face * 0.075),
                'z', radius * 0.025, 0.025, accent, 8, 0.002, rig=rig,
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
                half * radius * 0.11, tire, rig,
            )


# ---------------------------------------------------------------- chassi, motor e capô
box('longarina-esquerda', (0.02, 0.62, -0.43), (4.00, 0.20, 0.14), steel, 0.022)
box('longarina-direita', (0.02, 0.62, 0.43), (4.00, 0.20, 0.14), steel, 0.022)
for x in (-1.05, -0.10, 0.86, 1.62):
    box('travessa-chassi', (x, 0.62, 0), (0.14, 0.16, 0.94), steel, 0.015)

# Bloco, carter e tanque ficam expostos sob a cintura, entre os eixos.
profile('bloco-motor', [(0.02, .67), (1.35, .67), (1.42, 1.23), (.22, 1.37)], -.43, .43, dark, .035, 3)
profile('carter-motor', [(.25, .46), (1.15, .46), (1.29, .70), (.15, .70)], -.32, .32, steel, .025, 2)
cylinder('filtro-oleo', (.64, .82, -.49), 'y', .08, .33, steel, 18, .01)
box('tanque-combustivel', (-.08, .76, .58), (.82, .55, .34), steel, .045, 3)
cylinder('bocal-tanque', (.15, 1.06, .62), 'y', .055, .08, dark, 14, .006)

# Capô afina na frente em planta e desce no nariz, como a referência.
tapered_shell('capo-principal', [(.05, .96, 1.83, .72), (1.18, .91, 1.78, .67),
                                 (2.18, .88, 1.65, .59), (2.48, 1.00, 1.55, .53)], paint, .045)
for side in (-1, 1):
    profile('faixa-amarela-fina', [(.18, 1.58), (2.32, 1.49), (2.40, 1.42), (.18, 1.49)],
            side * .704, side * .721, accent, .005, 2)
    box('painel-ventilacao', (1.18, 1.31, side * .694), (1.26, .41, .026), dark, .018)
    for x in (.72, .94, 1.16, 1.38, 1.60):
        box('veneziana-motor', (x, 1.31, side * .713), (.045, .31, .018), steel, .003)

# Grade inclinada e faróis embutidos, não cubos colados à frente.
profile('grade-frontal', [(2.42, 1.02), (2.51, 1.10), (2.51, 1.50), (2.43, 1.55)], -.49, .49, dark, .018, 2)
for z in (-.38, -.19, 0, .19, .38):
    rod('barra-grade', (2.505, 1.13, z), (2.48, 1.47, z), .018, steel, 8)
for side in (-1, 1):
    profile('nicho-farol', [(2.425, 1.40), (2.505, 1.42), (2.50, 1.56), (2.43, 1.55)],
            side * .27, side * .47, dark, .012, 2)
    profile('farol-integrado', [(2.446, 1.43), (2.516, 1.445), (2.511, 1.53), (2.45, 1.52)],
            side * .29, side * .45, lamp, .008, 2)

# Lastro laminado e suporte, baixo o suficiente para não virar uma caixa na frente.
box('suporte-lastro', (2.59, .65, 0), (.48, .18, .54), steel, .022)
for i in range(9):
    box('placa-lastro', (2.80, .63, (i - 4) * .105), (.28, .46, .075), dark, .018, 2)

# ---------------------------------------------------------------- cabine fechada e interior
box('piso-cabine', (-.66, 1.01, 0), (1.68, .18, 1.56), dark, .035)
for side in (-1, 1):
    # Quatro colunas estruturais, uma em cada canto da cabine.
    rod('coluna-a-cabine', (.17, 1.14, side * .70), (.10, 2.72, side * .70), .038, dark, 10)
    rod('coluna-c-cabine', (-1.34, 1.15, side * .70), (-1.24, 2.70, side * .70), .038, dark, 10)
    quad('vidro-porta', [(.12, 1.18, side * .706), (.10, 2.68, side * .706),
                         (-.55, 2.72, side * .706), (-.55, 1.18, side * .706)], glass)
    quad('vidro-lateral-traseiro', [(-.60, 1.19, side * .706), (-.60, 2.72, side * .706),
                                    (-1.22, 2.67, side * .706), (-1.30, 1.19, side * .706)], glass)
    # Moldura inferior da porta, duas dobradiças e maçaneta real.
    box('soleira-porta', (-.22, 1.16, side * .722), (.75, .065, .045), dark, .008)
    for y in (1.42, 2.35):
        cylinder('dobradica-porta', (.13, y, side * .735), 'y', .025, .10, steel, 10, .003)
    box('macaneta-porta', (-.46, 2.12, side * .742), (.18, .045, .035), steel, .008)
    # Degraus perfurados e corrimão chegam até a maçaneta.
    for index, y in enumerate((.34, .58, .82)):
        box('degrau-cabine', (-.05 - index * .035, y, side * .88), (.48, .055, .38), steel, .010)
        for x in (-.19, -.05, .09):
            box('ranhura-degrau', (x - index * .035, y + .032, side * .88), (.055, .012, .28), dark, .002)
    rod('corrimao-cabine', (.12, .80, side * .83), (.10, 2.05, side * .83), .024, steel, 10)
    # Espelho preso por braço único robusto: nada fica flutuando.
    rod('braco-retrovisor', (.08, 2.48, side * .69), (.20, 2.49, side * 1.00), .022, dark, 10)
    box('retrovisor', (.20, 2.45, side * 1.06), (.10, .28, .15), dark, .020, 3)

quad('para-brisa', [(.16, 1.21, -.63), (.16, 1.21, .63), (.10, 2.67, .60), (.10, 2.67, -.60)], glass)
quad('vidro-traseiro', [(-1.31, 1.21, .63), (-1.31, 1.21, -.63),
                        (-1.23, 2.66, -.59), (-1.23, 2.66, .59)], glass)
# Teto baixo, largo e com beiral/borda saliente.
profile('teto-cabine', [(-1.38, 2.66), (-1.26, 2.84), (.08, 2.86), (.25, 2.70)], -.84, .84, paint, .045, 3)
box('borda-teto-frontal', (.19, 2.72, 0), (.13, .10, 1.76), dark, .018)
box('borda-teto-traseira', (-1.32, 2.70, 0), (.12, .10, 1.76), dark, .018)

# Banco, console e volante legíveis através do vidro.
box('assento-operador', (-.79, 1.48, 0), (.52, .18, .52), dark, .055, 3)
box('encosto-operador', (-1.02, 1.88, 0), (.16, .68, .53), dark, .055, 3)
box('console-operador', (-.06, 1.36, -.18), (.52, .38, .68), dark, .030)
torus('volante', (.02, 1.96, -.03), .18, .018, dark, 24, 8)
rod('coluna-volante', (.00, 1.65, -.03), (.02, 1.96, -.03), .023, dark, 10)

# Projetores encostados na borda do teto e giroflex com base aparafusada.
for x in (-1.16, .02):
    for side in (-1, 1):
        box('projetor-teto', (x, 2.74, side * .68), (.13, .12, .17), lamp, .020, 3)
cylinder('base-giroflex', (-.70, 2.88, .28), 'y', .085, .035, dark, 16, .005)
cylinder('domo-giroflex', (-.70, 2.95, .28), 'y', .072, .14, amber, 20, .010)

# Escapamento completo: tubo, abafador e ponteira acima do teto.
cylinder('abafador-vertical', (.16, 1.89, -.79), 'y', .105, .82, dark, 20, .012)
rod('escapamento-vertical', (.16, 2.28, -.79), (.16, 2.90, -.79), .055, dark, 14)
rod('ponteira-escapamento', (.16, 2.90, -.79), (.24, 2.98, -.79), .055, dark, 14)

# ---------------------------------------------------------------- rodas, para-lamas e eixos
for side in (-1, 1):
    suffix = '-1' if side < 0 else '1'
    wheel(f'roda-traseira-{side}', -.78, .89, .58, side * 1.00, f'wheel-1-{suffix}', front=False)
    wheel(f'roda-dianteira-{side}', 1.57, .575, .43, side * .99, f'wheel-0-{suffix}', front=True)
    arch_fender('paralama-traseiro-envolvente', -.78, .89, .98, 1.06,
                side * .70, side * 1.31, paint, 28)
    arch_fender('paralama-dianteiro', 1.57, .575, .66, .72,
                side * .75, side * 1.23, dark, 20)

rod('eixo-traseiro', (-.78, .89, -1.12), (-.78, .89, 1.12), .11, steel, 18)
cylinder('diferencial-traseiro', (-.78, .89, 0), 'z', .27, .44, steel, 24, .018)
# Eixo dianteiro pivotante com munhão e barra de direção.
rod('berco-eixo-dianteiro', (1.12, .68, 0), (1.57, .575, 0), .095, steel, 16)
rod('eixo-dianteiro-pivotante', (1.57, .575, -.98), (1.57, .575, .98), .082, steel, 16)
cylinder('pivo-eixo-dianteiro', (1.32, .64, 0), 'x', .13, .18, steel, 20, .012)
rod('barra-direcao', (1.48, .69, -.82), (1.48, .69, .82), .025, steel, 10)

# ---------------------------------------------------------------- engate de três pontos, TDP e hidráulica
box('suporte-engate', (-1.70, .82, 0), (.20, .78, .76), steel, .025, rig='hitch')
cylinder('tdp-traseira', (-1.86, .70, 0), 'x', .105, .25, accent, 20, .008, rig='hitch')
cylinder('capa-tdp', (-1.99, .70, 0), 'x', .145, .10, steel, 20, .008, rig='hitch')
for side in (-1, 1):
    rod('braco-inferior-engate', (-1.70, .58, side * .31), (-2.59, .30, side * .48), .055, steel, 14, rig='hitch')
    cylinder('olhal-engate', (-2.60, .30, side * .48), 'z', .11, .06, steel, 20, .006, rig='hitch')
    rod('tirante-vertical', (-1.87, 1.03, side * .31), (-2.18, .42, side * .43), .032, steel, 12, rig='hitch')
    # Barril verde e haste cromada mostram o acionamento do levante.
    rod('barril-cilindro-hidraulico', (-1.55, 1.14, side * .25), (-1.90, .72, side * .35), .060, paint, 14, rig='hitch')
    rod('haste-cilindro-hidraulico', (-1.90, .72, side * .35), (-2.14, .43, side * .42), .030, steel, 12, rig='hitch')
rod('terceiro-ponto', (-1.76, 1.18, 0), (-2.45, .75, 0), .047, steel, 14, rig='hitch')
cylinder('olhal-terceiro-ponto', (-2.46, .75, 0), 'z', .105, .07, steel, 20, .006, rig='hitch')
for z in (-.24, -.08, .08, .24):
    cylinder('conector-hidraulico', (-1.79, 1.35, z), 'x', .043, .10, accent, 14, .004, rig='hitch')

for side in (-1, 1):
    box('lanterna-traseira', (-1.42, 1.45, side * .61), (.08, .17, .20), red, .018, 3)


# ---------------------------------------------------------------- consolidação por parte rígida e material
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH':
        continue
    original = obj.data.materials[0]
    rig_key = next((key for key, group in rig_parts.items() if obj.parent == group), 'body')
    target = wheel_finish if rig_key.startswith('wheel-') else (
        structural if original in (paint, accent, dark, steel, glass, lamp, red, amber) else original)
    if target != original:
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

# O nome é um contrato opcional com o rig do Three.js. Cada grupo já chega como
# corpo, roda ou engate e não precisa ser recortado triângulo a triângulo.
for key, group in rig_parts.items():
    for mat in list(bpy.data.materials):
        objects = [obj for obj in group.children if obj.type == 'MESH' and obj.data.materials and obj.data.materials[0] == mat]
        if not objects:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        objects[0].name = f'rig-{key}--{mat.name.lower().replace(" ", "-")}'

# Visibilidade hemisférica de curto alcance em CavityAO, igual ao caminhão. O
# gradiente inferior acrescenta terra seca sem abrir um material/draw extra.
opaque = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH'
          and obj.data.materials and obj.data.materials[0] != glass]
vertices, polygons = [], []
for obj in opaque:
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
for obj in opaque:
    colors = obj.data.color_attributes.get('CavityAO') or obj.data.color_attributes.new(
        name='CavityAO', type='FLOAT_COLOR', domain='POINT')
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
        ao = .18 + .82 * visibility / samples
        dirt = max(0, min(1, (1.48 - world.z) / 1.20))
        noise = .72 + .28 * (math.sin(world.x * 11.7 + world.y * 7.3) * .5 + .5)
        dirt *= noise
        current = colors.data[vertex.index].color
        base = tuple(current[:3]) if any(current[:3]) else (1, 1, 1)
        colors.data[vertex.index].color = (
            base[0] * ao * (1 - dirt * .16),
            base[1] * ao * (1 - dirt * .27),
            base[2] * ao * (1 - dirt * .46), 1)

triangles = sum(len(poly.vertices) - 2 for obj in bpy.context.scene.objects if obj.type == 'MESH' for poly in obj.data.polygons)
out = os.path.abspath(os.environ.get('AGRI_TRACTOR_OUT', 'public/models/sompo/generated-agri-tractor.glb'))
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    export_yup=True,
    export_apply=True,
    export_materials='EXPORT',
    export_vertex_color='ACTIVE',
)
print('AGRI_TRACTOR_EXPORTED', out, os.path.getsize(out), 'triangles', triangles, 'materials', len(bpy.data.materials))
