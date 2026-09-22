"""Cavalo cara-chata brasileiro 6x2 com baú frigorífico (pele visual do rig SOMPO).

Metros, +X frente, +Y cima (coordenadas do rig; o glTF converte). Três grupos:
  astra-cab     cabine basculável, para-choque, degraus, retrovisores
  astra-cargo   baú frigorífico, portas traseiras, aparelho de frio
  astra-chassis vestimenta do chassi (tanque, bateria, ar, estepe, protetor
                lateral, para-lamas, lanternas, para-choque de impacto)
Rodas, suspensão, sensor ESP32 e física continuam no rig procedural.
Sem logotipo de montadora; a única marca é o SOMPO do baú.
"""
import bpy, bmesh, math, os
from mathutils import Vector
from mathutils.bvhtree import BVHTree

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def xyz(p):
    return (p[0], -p[2], p[1])

def inp(principled, name, value):
    if name in principled.inputs:
        principled.inputs[name].default_value = value

def mat(name, color, metal=0, rough=.5, emission=0, coat=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    inp(p, 'Base Color', (*color, 1))
    inp(p, 'Metallic', metal)
    inp(p, 'Roughness', rough)
    if emission:
        inp(p, 'Emission Color', (*color, 1))
        inp(p, 'Emission Strength', emission)
    if coat:
        inp(p, 'Coat Weight', coat)
        inp(p, 'Coat Roughness', .12)
    return m

def glass_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    inp(p, 'Base Color', (.22, .32, .36, 1))
    inp(p, 'Metallic', 0)
    inp(p, 'Roughness', .05)
    inp(p, 'Alpha', .10)
    for key, val in (('blend_method', 'BLEND'), ('surface_render_method', 'BLENDED')):
        try:
            setattr(m, key, val)
        except Exception:
            pass
    return m

# Nomes são contrato com refineSompoTruck (cor da pintura, textura do baú, película).
paint = mat('Pintura da cabine', (.008, .017, .05), .42, .22, coat=.82)
trim = mat('Astra cab trim', (.035, .037, .04), .1, .55)            # faixa do para-brisa, para-sol
bumper_grey = mat('Astra bumper plastic', (.20, .205, .21), .05, .62)
black = mat('Astra black plastic', (.018, .019, .021), .04, .7)
rubber = mat('Astra rubber seals', (.009, .012, .016), .05, .78)
glass = glass_mat('Astra cabin glass')
mirror = mat('Astra mirror glass', (.18, .22, .24), .88, .05)
grille_face = mat('Astra grille face', (.16, .17, .18), .6, .34)
recess = mat('Astra grille recess', (.008, .009, .01), .1, .8)
chrome = mat('Astra polished chrome', (.60, .62, .64), .9, .3)      # inox fosco: travas, dobradiças
lamp = mat('Astra headlight', (.92, .92, .88), .1, .12, .35)
reflector = mat('Astra lamp reflector', (.75, .77, .8), .95, .12)
amber = mat('Astra amber marker', (.85, .32, .02), .1, .25, .35)
tail = mat('Astra tail lamp', (.55, .02, .02), .1, .22, .25)
reverse = mat('Astra reverse lens', (.82, .82, .8), .05, .2)
red = mat('Astra red reflector', (.62, .03, .03), .15, .32)
white_tape = mat('Astra white reflector', (.86, .87, .86), .2, .3)
interior = mat('Astra cabin interior', (.04, .042, .045), 0, .9)
seat = mat('Astra cabin seats', (.05, .052, .055), .02, .85)
letter = mat('SOMPO painted metal', (.008, .017, .05), .3, .35)
shell = mat('Astra box shell', (.84, .84, .80), .1, .5)
panel = mat('Painéis do baú', (.9, .9, .87), .02, .48)
alloy = mat('Alumínio do baú', (.62, .64, .66), .8, .32)
seam = mat('Astra box seam', (.55, .56, .57), .3, .5)
reefer_dark = mat('Astra reefer grille', (.03, .033, .036), .2, .6)
chassis_black = mat('Astra chassis black', (.022, .024, .026), .45, .55)
tank_alu = mat('Astra tank aluminium', (.66, .68, .7), .85, .28)
flap = mat('Astra mudflap rubber', (.012, .012, .013), 0, .9)
plate_mat = mat('Astra plate', (.86, .87, .88), .1, .4)
plate_blue = mat('Astra plate band', (.02, .08, .38), .1, .4)
plate_ink = mat('Astra plate ink', (.02, .02, .025), .1, .5)
steel = mat('Astra wheel steel', (.55, .56, .57), .55, .42)
tire_mat = mat('Sompo tire rubber', (.03, .033, .036), 0, .92)

parts = {}
for n in ['astra-cab', 'astra-cargo', 'astra-chassis']:
    o = bpy.data.objects.new(n, None)
    bpy.context.collection.objects.link(o)
    parts[n] = o
parent = parts['astra-cab']

def link_mesh(n, vs, faces, closed=False):
    me = bpy.data.meshes.new(n)
    me.from_pydata([xyz(p) for p in vs], [], faces)
    me.validate()
    if closed:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    me.update()
    o = bpy.data.objects.new(n, me)
    bpy.context.collection.objects.link(o)
    return o

def finish(o, n, m, bevel=0, segments=3):
    o.name = n
    o.parent = parent
    o.data.materials.append(m)
    if bevel:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for f in o.data.polygons:
        f.use_smooth = True
    mod = o.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL')
    mod.keep_sharp = True
    mod.weight = 40
    return o

def sharpen(o, angle=38):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(angle):
            e.smooth = False
    bm.to_mesh(o.data)
    bm.free()

def box(n, p, s, m, b=.01, seg=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(p))
    o = bpy.context.object
    o.scale = (s[0], s[2], s[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, n, m, b, seg)

def box2(n, lo, hi, m, b=.01, seg=3):
    """Box by rig-space extents (x0,y0,z0)-(x1,y1,z1), any corner order."""
    lo, hi = [min(a, c) for a, c in zip(lo, hi)], [max(a, c) for a, c in zip(lo, hi)]
    return box(n, [(a + c) / 2 for a, c in zip(lo, hi)], [c - a for a, c in zip(lo, hi)], m, b, seg)

def profile(n, poly, z0, z1, m, b=.02, seg=3):
    """Polygon in the XY (side) plane extruded along Z."""
    vs = [(x, y, z) for z in [z0, z1] for x, y in poly]
    l = len(poly)
    faces = [tuple(range(l - 1, -1, -1)), tuple(range(l, l * 2))] + [
        (i, (i + 1) % l, (i + 1) % l + l, i + l) for i in range(l)]
    return finish(link_mesh(n, vs, faces, True), n, m, b, seg)

def profile_y(n, poly, y0, y1, m, b=.02, seg=3):
    """Polygon in the XZ (top) plane, counter-clockwise seen from above, extruded along Y."""
    vs = [(x, y, z) for y in [y0, y1] for x, z in poly]
    l = len(poly)
    faces = [tuple(range(l)), tuple(range(l * 2 - 1, l - 1, -1))] + [
        (i + l, (i + 1) % l + l, (i + 1) % l, i) for i in range(l)]
    return finish(link_mesh(n, vs, faces, True), n, m, b, seg)

def rod(n, a, b, r, m, verts=12):
    a, b = Vector(xyz(a)), Vector(xyz(b))
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=(b - a).length, location=(a + b) / 2)
    o = bpy.context.object
    o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(o, n, m)

def disc(n, center, axis, r, depth, m, verts=24, b=.004):
    """Cylinder whose axis is one of 'x','y','z' in rig space."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=xyz(center))
    o = bpy.context.object
    o.rotation_euler = {'x': (0, math.pi / 2, 0), 'y': (0, 0, 0), 'z': (math.pi / 2, 0, 0)}[axis]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(o, n, m, b)

def quad(n, pts, m):
    return finish(link_mesh(n, pts, [tuple(range(len(pts)))]), n, m)

def text(n, body, p, size, m, facing, extrude=.003, res=3, align='CENTER'):
    """facing: '+z', '-z', '+x', '-x' — the direction the lettering faces."""
    cu = bpy.data.curves.new(n, 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.resolution_u = res
    cu.align_x = align
    cu.align_y = 'CENTER'
    ob = bpy.data.objects.new(n, cu)
    bpy.context.collection.objects.link(ob)
    ob.location = xyz(p)
    ob.rotation_euler = {'+z': (math.pi / 2, 0, 0), '-z': (math.pi / 2, 0, math.pi),
                         '+x': (math.pi / 2, 0, math.pi / 2), '-x': (math.pi / 2, 0, -math.pi / 2)}[facing]
    ob.parent = parent
    ob.data.materials.append(m)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob.select_set(False)
    return ob

def uv_planar(o, fu, fv):
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co   # blender space
            rig = (co.x, co.z, -co.y)
            uv[li].uv = (fu(rig), fv(rig))

def ring_gasket(n, corners, inner_pad, outer_pad, depth_in, depth_out, m):
    """Rubber gasket around a planar quad opening. corners: 4 rig points, CCW seen from outside."""
    c = sum((Vector(p) for p in corners), Vector()) / 4
    e1 = (Vector(corners[1]) - Vector(corners[0])).normalized()
    e2 = (Vector(corners[3]) - Vector(corners[0])).normalized()
    nrm = e1.cross(e2).normalized()
    def expand(p, pad):
        d = Vector(p) - c
        a, b = d.dot(e1), d.dot(e2)
        return c + e1 * (a + math.copysign(pad, a)) + e2 * (b + math.copysign(pad, b))
    outer = [expand(p, outer_pad) for p in corners]
    inner = [expand(p, -inner_pad) for p in corners]
    vs, faces = [], []
    for off in (depth_out, -depth_in):
        vs += [tuple(p + nrm * off) for p in outer] + [tuple(p + nrm * off) for p in inner]
    for i in range(4):
        j = (i + 1) % 4
        faces += [(i, j, 4 + j, 4 + i), (8 + i, 12 + i, 12 + j, 8 + j),
                  (i, 8 + i, 8 + j, j), (4 + i, 4 + j, 12 + j, 12 + i)]
    o = link_mesh(n, vs, faces, True)
    return finish(o, n, m, .006, 2)

def lerp_table(table, y):
    if y <= table[0][0]:
        return table[0][1]
    for (y0, v0), (y1, v1) in zip(table, table[1:]):
        if y <= y1:
            return v0 + (v1 - v0) * (y - y0) / (y1 - y0)
    return table[-1][1]

# ---------------------------------------------------------------- cabine
FRONT = [(1.28, 4.44), (2.06, 4.405), (2.88, 4.275), (2.95, 4.245), (3.01, 4.20), (3.05, 4.14), (3.07, 4.07)]
WIDTH = [(1.28, 1.14), (2.88, 1.14), (2.95, 1.135), (3.01, 1.115), (3.05, 1.085), (3.07, 1.04)]
REAR = [(1.28, 2.28), (2.90, 2.28), (2.97, 2.29), (3.03, 2.31), (3.07, 2.36)]
CAB_YS = [1.28, 1.31, 1.40, 1.62, 1.84, 1.98, 2.06, 2.10, 2.30, 2.50, 2.70, 2.84, 2.88, 2.93, 2.97, 3.01, 3.04, 3.06, 3.07]
FRONT_S = [-1, -.95, -.8, -.6, -.4, -.2, 0, .2, .4, .6, .8, .95]
SIDE_T = [1, .96, .9, .8, .7, .6, .5, .4, .3, .2, .13, .08, .04]
WIN_Y = (2.10, 2.84)
RF, RR = .14, .07

def cab_ring(y, inset=0):
    xf = lerp_table(FRONT, y) - inset
    xr = lerp_table(REAR, y) + inset
    w = lerp_table(WIDTH, y) - inset
    pts = []
    for s in FRONT_S:
        pts.append(((xf, y, s * (w - RF)), ('F', s)))
    for j in range(5):
        a = math.radians(j * 90 / 5)
        pts.append(((xf - RF + RF * math.cos(a), y, w - RF + RF * math.sin(a)), ('C', 0)))
    for t in SIDE_T:
        pts.append(((xr + RR + t * (xf - RF - xr - RR), y, w), ('R', t)))
    for j in range(4):
        a = math.radians(90 + j * 90 / 4)
        pts.append(((xr + RR + RR * math.cos(a), y, w - RR + RR * math.sin(a)), ('C', 0)))
    for k in range(8):
        pts.append(((xr, y, (w - RR) * (1 - 2 * k / 8)), ('B', 0)))
    for j in range(4):
        a = math.radians(180 + j * 90 / 4)
        pts.append(((xr + RR + RR * math.cos(a), y, -(w - RR) + RR * math.sin(a)), ('C', 0)))
    for t in reversed(SIDE_T):
        pts.append(((xr + RR + t * (xf - RF - xr - RR), y, -w), ('L', t)))
    for j in range(5):
        a = math.radians(270 + j * 90 / 5)
        pts.append(((xf - RF + RF * math.cos(a), y, -(w - RF) + RF * math.sin(a)), ('C', 0)))
    return pts

def opening(tag_a, tag_b, ymid):
    if not (WIN_Y[0] < ymid < WIN_Y[1]):
        return False
    if tag_a[0] == tag_b[0] == 'F':
        return abs(tag_a[1]) <= .951 and abs(tag_b[1]) <= .951
    if tag_a[0] == tag_b[0] and tag_a[0] in 'RL':
        return all(.129 <= t[1] <= .961 for t in (tag_a, tag_b))
    return False

def cab_shell(n, inset, ys, m, inward=False, cap_top=True, cap_bottom=True):
    rings = [cab_ring(y, inset) for y in ys]
    nv = len(rings[0])
    vs = [p for ring in rings for p, _ in ring]
    faces = []
    for r in range(len(rings) - 1):
        ymid = (ys[r] + ys[r + 1]) / 2
        for i in range(nv):
            j = (i + 1) % nv
            if opening(rings[r][i][1], rings[r][j][1], ymid):
                continue
            f = (r * nv + i, r * nv + j, (r + 1) * nv + j, (r + 1) * nv + i)
            faces.append(tuple(reversed(f)) if not inward else f)
    last = (len(rings) - 1) * nv
    if cap_top:
        f = tuple(range(last, last + nv))
        faces.append(tuple(reversed(f)) if not inward else f)
    if cap_bottom:
        f = tuple(range(nv))
        faces.append(f if not inward else tuple(reversed(f)))
    o = link_mesh(n, vs, faces)
    # Orientation check: the outer shell must face away from the cab centre.
    o.data.update()
    sharpen(o, 34)
    return finish(o, n, m)

cab = cab_shell('astra-cab-shell', 0, CAB_YS, paint)
lining = cab_shell('astra-cab-lining', .035, [y for y in CAB_YS if 1.31 <= y <= 3.04], interior, inward=True)

def xf_at(y):
    return lerp_table(FRONT, y)

def side_x(t, y):
    xf, xr = lerp_table(FRONT, y), lerp_table(REAR, y)
    return xr + RR + t * (xf - RF - xr - RR)

W = 1.14
# Windscreen: planar quad through the raked front, opening at s=±0.95.
zs = .95 * (W - RF)
ws = [(xf_at(WIN_Y[0]), WIN_Y[0], zs), (xf_at(WIN_Y[0]), WIN_Y[0], -zs),
      (xf_at(WIN_Y[1]), WIN_Y[1], -zs), (xf_at(WIN_Y[1]), WIN_Y[1], zs)]
ring_gasket('astra-windscreen-seal', ws, .018, .035, .045, .012, rubber)
wn = Vector((WIN_Y[1] - WIN_Y[0], xf_at(WIN_Y[0]) - xf_at(WIN_Y[1]), 0)).normalized()
quad('astra-windscreen-glass', [tuple(Vector(p) - wn * .014) for p in ws], glass)
for side in (-1, 1):
    corners = [(side_x(.129, WIN_Y[0]), WIN_Y[0]), (side_x(.961, WIN_Y[0]), WIN_Y[0]),
               (side_x(.961, WIN_Y[1]), WIN_Y[1]), (side_x(.129, WIN_Y[1]), WIN_Y[1])]
    pts = [(x, y, side * W) for x, y in corners]
    if side < 0:
        pts = [pts[1], pts[0], pts[3], pts[2]]
    ring_gasket('astra-side-window-seal', pts, .016, .03, .045, .01, rubber)
    quad('astra-side-window-glass', [(x, y, side * (W - .014)) for x, y, _ in pts], glass)
    # Door: seam lines (dark hairlines just proud of the paint) and hardware.
    for a, b in [((2.44, 1.30), (2.44, 3.00)), ((3.96, 1.30), (3.96, 2.04)), ((2.44, 3.00), (4.10, 3.00))]:
        rod('astra-door-seam', (a[0], a[1], side * (W + .001)), (b[0], b[1], side * (W + .001)), .005, recess, 6)
    rod('astra-door-seam', (3.96, 2.04, side * (W + .001)), (side_x(.99, 2.84) + .02, 2.98, side * (W + .001)), .005, recess, 6)
    box2('astra-door-handle-recess', (2.52, 1.99, side * W - .004), (2.72, 2.06, side * W + .004), recess, .008)
    box2('astra-door-handle', (2.55, 2.015, side * W), (2.70, 2.04, side * (W + .018)), black, .006)
    rod('astra-grab-handle', (2.36, 1.42, side * (W + .045)), (2.36, 2.42, side * (W + .045)), .016, black, 8)
    for y in (1.46, 2.38):
        rod('astra-grab-handle-foot', (2.36, y, side * W), (2.36, y, side * (W + .05)), .014, black, 8)
    box2('astra-side-repeater', (3.82, 1.40, side * W - .005), (3.92, 1.45, side * (W + .012)), amber, .01)
    # Cab lower corner cover over the wheel arch (grey plastic, as on the Constellation).
    box2('astra-cab-corner-cover', (3.70, 1.28, side * (W - .02)), (4.44, 1.36, side * (W + .015)), bumper_grey, .012)

# Front face: dark band below the windscreen, grille band with slats, tilt-cab crease.
def front_plate(n, y0, y1, half, m, proud=.004, thick=.012, b=.004):
    x0, x1 = xf_at(y0), xf_at(y1)
    poly = [(x0 - .02, y0), (x0 + proud, y0), (x1 + proud, y1), (x1 - .02, y1)]
    profile(n, poly, -half, half, m, b, 2)

front_plate('astra-windscreen-band', 1.92, WIN_Y[0] + .01, W - .12, trim, .006)
front_plate('astra-grille-frame', 1.36, 1.84, W - .12, black, .012)
front_plate('astra-grille-back', 1.40, 1.80, .78, recess, .016)
for i in range(4):
    y = 1.44 + i * .095
    front_plate('astra-grille-slat', y, y + .052, .76, grille_face, .04, b=.01)
for side in (-1, 1):
    x = xf_at(1.57)
    box2('astra-grille-indicator', (x - .01, 1.52, side * .83), (x + .03, 1.62, side * 1.02), amber, .012)
front_plate('astra-tilt-crease', 1.885, 1.9, W - .12, recess, .002)
# Sun visor and roof deflector.
profile('astra-sun-visor', [(4.13, 2.965), (4.46, 2.93), (4.47, 2.955), (4.15, 3.02)], -1.03, 1.03, trim, .012)
profile('astra-roof-deflector', [(3.90, 3.05), (3.74, 3.11), (2.56, 3.68), (2.40, 3.70), (2.36, 3.05)], -1.0, 1.0, paint, .07, 5)
box2('astra-deflector-mount', (2.40, 3.03, -.95), (3.80, 3.075, .95), black, .01)
# Wipers parked on the lower edge of the screen.
for z0, z1 in [(-.86, -.10), (.02, .74)]:
    y = WIN_Y[0] + .05
    x = xf_at(y) + .01
    rod('astra-wiper', (x, y, z0), (x - .004, y + .02, z1), .011, black, 6)
# Arm mirrors (main + wide-angle) and a curb mirror over the passenger corner.
for side in (-1, 1):
    zc = side * 1.285
    for y in (2.86, 2.10):
        rod('astra-mirror-arm', (4.08, y, side * 1.12), (4.20, y, zc), .014, black, 8)
    rod('astra-mirror-post', (4.20, 2.10, zc), (4.20, 2.86, zc), .013, black, 8)
    box2('astra-mirror-head', (4.18, 2.34, zc - .085), (4.26, 2.76, zc + .085), black, .018)
    box2('astra-mirror-glass', (4.17, 2.36, zc - .075), (4.18, 2.74, zc + .075), mirror, .004)
    box2('astra-mirror-wide', (4.18, 2.13, zc - .075), (4.25, 2.30, zc + .075), black, .016)
    box2('astra-mirror-glass', (4.17, 2.145, zc - .065), (4.18, 2.29, zc + .065), mirror, .004)
rod('astra-curb-mirror-arm', (4.16, 3.00, .92), (4.40, 3.02, 1.02), .012, black, 8)
box2('astra-curb-mirror', (4.36, 2.86, .94), (4.44, 3.00, 1.10), black, .016)

# Bumper (grey), headlights and fog lamps recessed with booleans, sensor bay centre.
def bumper_poly():
    zc, r = 1.03, .14
    pts = [(3.88, -1.17), (4.36, -1.17)]
    pts += [(4.36 + r * math.cos(math.radians(a)), -zc + r * math.sin(math.radians(a))) for a in range(-75, 0, 15)]
    pts += [(4.50, -zc), (4.50, zc)]
    pts += [(4.36 + r * math.cos(math.radians(a)), zc + r * math.sin(math.radians(a))) for a in range(15, 90, 15)]
    pts += [(4.36, 1.17), (3.88, 1.17), (3.88, 1.05), (4.30, 1.05), (4.30, -1.05), (3.88, -1.05)]
    return pts

bumper = profile_y('astra-front-bumper', bumper_poly(), .42, 1.13, bumper_grey, .03, 3)
cutters = []
def cutter(lo, hi):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz([(a + c) / 2 for a, c in zip(lo, hi)]))
    o = bpy.context.object
    s = [c - a for a, c in zip(lo, hi)]
    o.scale = (s[0], s[2], s[1])
    cutters.append(o)
for side in (-1, 1):
    cutter((4.40, .84, side * .70 if side > 0 else -1.06), (4.60, 1.05, side * 1.06 if side > 0 else -.70))
    cutter((4.42, .52, side * .84 if side > 0 else -1.00), (4.60, .64, side * 1.00 if side > 0 else -.84))
cutter((4.44, .60, -.56), (4.60, .96, .56))
for c in cutters:
    mod = bumper.modifiers.new('cut', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = c
    mod.solver = 'EXACT'
    bpy.context.view_layer.objects.active = bumper
    bpy.ops.object.modifier_apply(modifier=mod.name)
for c in cutters:
    bpy.data.objects.remove(c)
for side in (-1, 1):
    zi, zo = side * .70, side * 1.06
    lo, hi = min(zi, zo), max(zi, zo)
    box2('astra-headlamp-housing', (4.40, .84, lo), (4.43, 1.05, hi), black, .006)
    for zc in (side * .80, side * .93):
        disc('astra-headlamp-reflector', (4.435, .945, zc), 'x', .058, .012, reflector, 20)
        disc('astra-headlamp-lens', (4.445, .945, zc), 'x', .044, .008, lamp, 20)
    box2('astra-front-turn', (4.43, .87, side * 1.0 - .045), (4.46, 1.02, side * 1.0 + .045), amber, .008)
    box2('astra-fog-housing', (4.42, .52, min(side * .84, side * 1.0)), (4.44, .64, max(side * .84, side * 1.0)), black, .006)
    disc('astra-fog-lamp', (4.445, .58, side * .92), 'x', .045, .01, lamp, 16)
    box2('astra-tow-hook', (4.44, .47, side * .45 - .05), (4.49, .52, side * .45 + .05), black, .01)
box2('astra-bumper-grille', (4.44, .60, -.56), (4.47, .96, .56), recess, .004)
for i in range(4):
    box2('astra-bumper-slat', (4.46, .64 + i * .085, -.54), (4.485, .665 + i * .085, .54), black, .006)
box2('astra-bumper-top-cover', (4.18, 1.13, -1.10), (4.46, 1.28, 1.10), black, .02)
box2('astra-front-plate', (4.495, .47, .56 - .20), (4.505, .60, .56 + .20), plate_mat, .004)
box2('astra-front-plate-band', (4.505, .575, .36), (4.508, .60, .76), plate_blue, .001)
text('astra-front-plate-text', 'SMP4A21', (4.508, .528, .56), .065, plate_ink, '+x', .0015, 2)
# Front wheel mudguard and cab steps.
def arch_profile(cx, cy, r0, r1, a0, a1, n=14):
    outer = [(cx + r1 * math.cos(math.radians(a)), cy + r1 * math.sin(math.radians(a)))
             for a in [a0 + (a1 - a0) * i / n for i in range(n + 1)]]
    inner = [(cx + r0 * math.cos(math.radians(a)), cy + r0 * math.sin(math.radians(a)))
             for a in [a1 - (a1 - a0) * i / n for i in range(n + 1)]]
    return outer + inner
for side in (-1, 1):
    profile('astra-front-mudguard', arch_profile(3.14, .60, .675, .705, 8, 172), side * .86, side * 1.20, black, .008, 2)
    profile('astra-front-mudguard-lip', arch_profile(3.14, .60, .675, .745, 20, 160), side * 1.17, side * 1.20, black, .006, 2)
    zo = side * 1.155
    box2('astra-step-back', (2.29, .44, side * .98), (2.55, 1.28, side * 1.0), black, .008)
    for x0 in (2.28, 2.535):
        box2('astra-step-side', (x0, .44, min(side * .98, zo)), (x0 + .02, 1.28, max(side * .98, zo)), black, .006)
    for y in (.50, .90):
        box2('astra-step-tread', (2.30, y, min(side * 1.0, zo)), (2.535, y + .035, max(side * 1.0, zo)), tank_alu, .006)
        for k in range(5):
            box2('astra-step-grip', (2.31 + k * .045, y + .035, min(side * 1.02, zo - side * .02)),
                 (2.33 + k * .045, y + .045, max(side * 1.02, zo - side * .02)), black, .002)
    box2('astra-mudflap-front', (2.255, .30, min(side * .88, side * 1.14)), (2.27, .44, max(side * .88, side * 1.14)), flap, .004)

# Engine air intake snorkel on the right rear corner of the cab (Constellation trait).
box2('astra-snorkel', (2.12, 1.30, .86), (2.30, 2.86, 1.06), black, .04, 4)
box2('astra-snorkel-cap', (2.10, 2.86, .84), (2.32, 3.02, 1.08), black, .03, 3)
for k in range(5):
    box2('astra-snorkel-slot', (2.095, 2.885 + k * .025, .87), (2.105, 2.895 + k * .025, 1.05), recess, .002)
box2('astra-snorkel-clamp', (2.11, 1.60, .85), (2.31, 1.64, 1.07), chassis_black, .006)
box2('astra-snorkel-clamp', (2.11, 2.40, .85), (2.31, 2.44, 1.07), chassis_black, .006)

# Interior seen through the glass: dash, wheel on the driver's (left, -Z) side, seats.
box2('astra-dash', (3.92, 1.86, -1.04), (4.33, 2.12, 1.04), interior, .03)
box2('astra-dash-top', (3.96, 2.10, -1.02), (4.30, 2.16, 1.02), seat, .02)
wheel_at = (3.92, 2.30, -.55)
bpy.ops.mesh.primitive_torus_add(major_radius=.22, minor_radius=.022, major_segments=28, minor_segments=8, location=xyz(wheel_at))
wh = bpy.context.object
wh.rotation_euler = (0, math.radians(-35), 0)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
finish(wh, 'astra-steering-wheel', seat)
rod('astra-steering-column', (4.12, 1.96, -.55), (3.93, 2.29, -.55), .03, seat, 8)
for z in (-.55, .52):
    box2('astra-seat-base', (2.72, 1.52, z - .24), (3.20, 1.70, z + .24), seat, .04)
    box2('astra-seat-back', (2.55, 1.66, z - .23), (2.70, 2.36, z + .23), seat, .05)
    box2('astra-seat-head', (2.56, 2.38, z - .14), (2.66, 2.56, z + .14), seat, .04)
box2('astra-middle-console', (2.60, 1.30, -.18), (3.40, 1.62, .18), interior, .03)

# ---------------------------------------------------------------- baú
parent = parts['astra-cargo']
BX0, BX1, BY0, BY1, BZ = -4.385, 1.46, 1.36, 3.80, 1.25
box2('astra-reefer-body', (BX0, BY0, -BZ), (BX1, BY1, BZ), shell, .01)
for side in (-1, 1):
    z = side * (BZ + .004)
    pts = [(BX0 + .03, BY0 + .06, z), (BX1 - .03, BY0 + .06, z), (BX1 - .03, BY1 - .04, z), (BX0 + .03, BY1 - .04, z)]
    if side < 0:
        pts = list(reversed(pts))
    skin = quad('astra-reefer-side-skin', pts, panel)
    uv_planar(skin, lambda p: (p[0] - BX0) / (BX1 - BX0), lambda p: (p[1] - BY0) / (BY1 - BY0))
    # Aluminium top rail, bottom rail with reflective tape, corner posts.
    box2('astra-top-rail', (BX0 - .03, 3.70, side * BZ - .01), (BX1 + .02, 3.84, side * (BZ + .03)), alloy, .008)
    box2('astra-bottom-rail', (BX0 - .03, 1.30, side * BZ - .01), (BX1 + .02, 1.44, side * (BZ + .035)), alloy, .008)
    for x0, x1 in ((BX1 - .05, BX1 + .03), (BX0 - .04, BX0 + .04)):
        box2('astra-corner-post', (x0, 1.30, side * (BZ - .03)), (x1, 3.84, side * (BZ + .03)), alloy, .01)
    x = BX0 + .12
    k = 0
    while x < BX1 - .12:
        box2('astra-side-tape', (x, 1.335, side * (BZ + .035)), (x + .26, 1.395, side * (BZ + .039)), red if k % 2 == 0 else white_tape, .002)
        x += .30
        k += 1
    for i in range(1, 8):
        xs = BX0 + i * (BX1 - BX0) / 8
        box2('astra-panel-seam', (xs - .008, 1.44, side * (BZ + .004)), (xs + .008, 3.70, side * (BZ + .009)), seam, .003)
    for xs in (-4.05, -2.55, -1.05, .45):
        box2('astra-side-marker', (xs - .05, 1.395, side * (BZ + .035)), (xs + .05, 1.43, side * (BZ + .05)), amber, .006)
    box2('astra-top-marker', (BX1 - .02, 3.72, side * (BZ - .06)), (BX1 + .04, 3.78, side * (BZ + .01)), amber, .008)
    # Vertical tape on the rear corner posts (Contran), red/white.
    for k, y in enumerate([1.46, 1.66, 1.86, 3.18, 3.38, 3.58]):
        box2('astra-rear-post-tape', (BX0 - .044, y, side * BZ - .06), (BX0 - .04, y + .18, side * BZ + .02), red if k % 2 == 0 else white_tape, .002)
    text('astra-SOMPO', 'SOMPO', (-1.35, 2.58, side * (BZ + .009)), .52, letter, '+z' if side > 0 else '-z', .004, 4)
# Subframe and cross-members visible under the box.
for side in (-1, 1):
    box2('astra-subframe', (BX0 + .06, 1.12, side * .62), (BX1 - .10, 1.31, side * .80), chassis_black, .01)
x = BX0 + .2
while x < BX1 - .1:
    box2('astra-box-crossmember', (x - .03, 1.25, -BZ + .02), (x + .03, 1.36, BZ - .02), chassis_black, .006)
    x += .46
# Rear portal, doors, seals, hinges, lock bars, handles.
RX = BX0
box2('astra-rear-header', (RX - .045, 3.64, -BZ - .03), (RX + .01, 3.84, BZ + .03), alloy, .01)
box2('astra-rear-sill', (RX - .05, 1.30, -BZ - .03), (RX + .01, 1.47, BZ + .03), alloy, .01)
for k in range(9):
    z0 = -BZ + k * (2 * BZ / 9)
    box2('astra-rear-sill-tape', (RX - .054, 1.33, z0 + .01), (RX - .049, 1.40, z0 + 2 * BZ / 9 - .01), red if k % 2 == 0 else white_tape, .002)
for side in (-1, 1):
    box2('astra-rear-post', (RX - .045, 1.30, min(side * 1.13, side * (BZ + .03))), (RX + .01, 3.84, max(side * 1.13, side * (BZ + .03))), alloy, .01)
    zin, zout = side * .012, side * 1.115
    lo, hi = min(zin, zout), max(zin, zout)
    door = box2('astra-rear-door', (RX - .03, 1.48, lo), (RX + .005, 3.63, hi), panel, .006)
    uv_planar(door, lambda p: (p[2] + 1.12) / 2.24 * .45 + .3, lambda p: (p[1] - BY0) / (BY1 - BY0))
    # Rubber seal frame around each leaf.
    for (a, b) in [((lo - .012, 1.47), (hi + .012, 1.49)), ((lo - .012, 3.62), (hi + .012, 3.645))]:
        box2('astra-door-seal', (RX - .036, a[1], a[0]), (RX - .026, b[1], b[0]), rubber, .004)
    for zz in (zin, zout):
        box2('astra-door-seal', (RX - .036, 1.47, zz - .012), (RX - .026, 3.645, zz + .012), rubber, .004)
    for y in (1.72, 2.55, 3.38):
        box2('astra-rear-hinge', (RX - .058, y - .05, side * 1.03), (RX - .03, y + .05, side * 1.20), chrome, .006)
        rod('astra-hinge-pin', (RX - .065, y - .07, side * 1.19), (RX - .065, y + .07, side * 1.19), .014, chrome, 8)
    for zb in (side * .20, side * .70):
        rod('astra-lock-bar', (RX - .06, 1.36, zb), (RX - .06, 3.76, zb), .019, chrome, 10)
        for y in (1.40, 3.72):
            box2('astra-lock-keeper', (RX - .075, y - .04, zb - .045), (RX - .04, y + .04, zb + .045), chrome, .006)
        for y in (1.75, 3.10):
            box2('astra-lock-guide', (RX - .07, y - .025, zb - .04), (RX - .03, y + .025, zb + .04), chrome, .004)
        box2('astra-lock-cam-plate', (RX - .065, 2.12, zb - .045), (RX - .03, 2.24, zb + .045), chrome, .005)
        zh = zb + side * .30
        box2('astra-lock-handle', (RX - .085, 2.16, min(zb, zh)), (RX - .065, 2.20, max(zb, zh)), chrome, .006)
        box2('astra-lock-grip', (RX - .09, 2.155, min(zh, zh - side * .12)), (RX - .062, 2.205, max(zh, zh - side * .12)), black, .008)
    box2('astra-rear-top-lamp', (RX - .06, 3.74, side * 1.06 - .06), (RX - .04, 3.79, side * 1.06 + .06), tail, .008)
box2('astra-door-centre-seal', (RX - .04, 1.47, -.012), (RX - .026, 3.645, .012), rubber, .003)
# Refrigeration unit on the front wall: housing, condenser grille, fan grilles.
unit = profile_y('astra-reefer-unit', [(BX1, -.84), (BX1 + .36, -.84), (BX1 + .44, -.76), (BX1 + .44, .76), (BX1 + .36, .84), (BX1, .84)],
                 2.98, 3.78, shell, .05, 4)
box2('astra-reefer-unit-top', (BX1, 3.72, -.80), (BX1 + .40, 3.785, .80), alloy, .02)
box2('astra-reefer-grille', (BX1 + .43, 3.36, -.72), (BX1 + .455, 3.70, .72), reefer_dark, .012)
for i in range(7):
    box2('astra-reefer-louver', (BX1 + .45, 3.385 + i * .045, -.70), (BX1 + .47, 3.40 + i * .045, .70), shell, .004)
for zc in (-.40, .40):
    disc('astra-reefer-fan-grille', (BX1 + .445, 3.13, zc), 'x', .15, .02, reefer_dark, 24)
    for r in (.06, .10, .135):
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=.005, major_segments=24, minor_segments=4, location=xyz((BX1 + .458, 3.13, zc)))
        t = bpy.context.object
        t.rotation_euler = (0, math.pi / 2, 0)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        finish(t, 'astra-reefer-fan-ring', alloy)
for side in (-1, 1):
    box2('astra-reefer-side-vent', (BX1 + .08, 3.10, side * .84 - .01), (BX1 + .34, 3.60, side * .84 + .01), reefer_dark, .006)
box2('astra-reefer-panel-seam', (BX1 + .44, 3.33, -.76), (BX1 + .446, 3.34, .76), seam, .002)

# ---------------------------------------------------------------- chassi
parent = parts['astra-chassis']
# Rear tandem mudguards: two arches joined by a flat top, just below the box.
def tandem_profile():
    top = []
    for a in range(20, 91, 10):
        r = .655
        top.append((-2.27 + r * math.cos(math.radians(a)), .60 + r * math.sin(math.radians(a))))
    for a in range(90, 161, 10):
        r = .655
        top.append((-3.53 + r * math.cos(math.radians(a)), .60 + r * math.sin(math.radians(a))))
    inner = [(x, y - .025) for x, y in reversed(top)]
    return top + inner
for side in (-1, 1):
    profile('astra-tandem-mudguard', tandem_profile(), side * .74, side * 1.31, black, .008, 2)
    top = tandem_profile()[:16]
    profile('astra-tandem-mudguard-lip', top + [(x, y - .09) for x, y in reversed(top)], side * 1.29, side * 1.31, black, .004, 2)
    for x in (-2.9,):
        box2('astra-mudguard-bracket', (x - .03, 1.15, side * .70), (x + .03, 1.26, side * .98), chassis_black, .006)
    # Rear mudflaps behind the tandem.
    box2('astra-rear-mudflap', (-4.215, .16, min(side * .80, side * 1.28)), (-4.20, .80, max(side * .80, side * 1.28)), flap, .006)
    box2('astra-mudflap-hanger', (-4.24, .78, min(side * .74, side * 1.28)), (-4.18, .83, max(side * .74, side * 1.28)), chassis_black, .006)
# Rear light bar, clusters, plate and the Brazilian underrun bumper.
box2('astra-rear-light-bar', (-4.38, .92, -1.12), (-4.30, 1.06, 1.12), chassis_black, .008)
for side in (-1, 1):
    zo, zi = side * 1.08, side * .70
    lo, hi = min(zo, zi), max(zo, zi)
    box2('astra-tail-housing', (-4.42, .87, lo), (-4.37, 1.07, hi), black, .012)
    seg = (hi - lo - .04) / 4
    order = [reverse, tail, tail, amber] if side > 0 else [amber, tail, tail, reverse]
    for k, m in enumerate(order):
        z0 = lo + .02 + k * seg
        box2('astra-tail-lens', (-4.43, .895, z0 + .006), (-4.415, 1.045, z0 + seg - .006), m, .006)
    box2('astra-bumper-hanger', (-4.36, .50, side * .62 - .04), (-4.30, .98, side * .62 + .04), chassis_black, .006)
box2('astra-underrun-bar', (-4.44, .40, -1.12), (-4.32, .545, 1.12), chassis_black, .012)
n = 14
for k in range(n):
    z0 = -1.10 + k * 2.2 / n
    box2('astra-underrun-tape', (-4.446, .415, z0 + .004), (-4.438, .53, z0 + 2.2 / n - .004), red if k % 2 == 0 else white_tape, .002)
box2('astra-rear-plate-bracket', (-4.36, .74, -.52), (-4.32, .96, -.06), chassis_black, .006)
box2('astra-rear-plate', (-4.38, .77, -.49), (-4.37, .90, -.09), plate_mat, .004)
box2('astra-rear-plate-band', (-4.383, .875, -.49), (-4.38, .90, -.09), plate_blue, .001)
text('astra-rear-plate-text', 'SMP4A21', (-4.383, .827, -.29), .065, plate_ink, '-x', .0015, 2)
box2('astra-plate-lamp', (-4.39, .92, -.33), (-4.36, .95, -.25), reverse, .006)
# Right (+Z, camera) side between the axles: battery box, diesel tank, air tanks, spare wheel.
def tank(n, x0, x1, yc, zc, h, d, m):
    pts = []
    for j in range(16):
        a = math.tau * j / 16
        s, c = math.sin(a), math.cos(a)
        pts.append((yc + h / 2 * math.copysign(abs(s) ** .45, s), zc + d / 2 * math.copysign(abs(c) ** .45, c)))
    vs = [(x, y, z) for x in (x0, x1) for y, z in pts]
    faces = [tuple(range(16)), tuple(range(31, 15, -1))] + [(i, i + 16, (i + 1) % 16 + 16, (i + 1) % 16) for i in range(16)]
    o = link_mesh(n, vs, faces, True)
    sharpen(o, 50)
    return finish(o, n, m, .02, 2)
for side in (-1, 1):
    zc = side * .98
    tank('astra-diesel-tank', .30, 1.50, .74, zc, .60, .52, tank_alu)
    for x in (.46, 1.34):
        box2('astra-tank-strap', (x - .03, .43, min(zc - side * .27, zc + side * .27)), (x + .03, 1.05, max(zc - side * .27, zc + side * .27)), chassis_black, .006)
    disc('astra-tank-cap', (1.20, 1.05, zc + side * .12), 'y', .055, .04, chassis_black, 16)
    box2('astra-tank-bracket', (.36, .98, min(side * .72, zc)), (1.44, 1.10, max(side * .72, zc)), chassis_black, .006)
    # Side protection guard (obrigatória no Brasil): two aluminium rails + brackets.
    for y0 in (.46, .82):
        box2('astra-side-guard', (-1.62, y0, side * 1.235 - .015), (.22, y0 + .10, side * 1.235 + .015), alloy, .01)
    for x in (-1.45, -.55, .12):
        box2('astra-guard-bracket', (x - .025, .46, min(side * .80, side * 1.22)), (x + .025, 1.13, max(side * .80, side * 1.22)), chassis_black, .006)
# Right side: battery box behind the steps, air tanks, spare wheel.
box2('astra-battery-box', (1.62, .52, .74), (2.18, 1.02, 1.12), chassis_black, .02)
box2('astra-battery-lid', (1.60, 1.00, .72), (2.20, 1.05, 1.14), black, .01)
for x in (1.72, 2.08):
    box2('astra-battery-latch', (x - .03, .80, 1.12), (x + .03, .92, 1.135), chrome, .004)
for y in (.54, .80):
    rod('astra-air-tank', (-.55, y, .98), (.20, y, .98), .12, chassis_black, 16)
    for x in (-.50, .15):
        disc('astra-air-tank-cap', (x, y, .98), 'x', .121, .03, chassis_black, 16)
rod('astra-air-line', (-.6, .67, 1.1), (1.6, .67, 1.1), .008, black, 6)
disc('astra-spare-tyre', (-1.08, .62, .95), 'z', .52, .26, tire_mat, 32, .06)
disc('astra-spare-rim', (-1.08, .62, 1.07), 'z', .32, .03, steel, 24, .008)
disc('astra-spare-hub', (-1.08, .62, 1.09), 'z', .10, .03, chassis_black, 16)
box2('astra-spare-carrier', (-1.62, .30, .72), (-.54, .36, 1.10), chassis_black, .008)
# Left side: exhaust muffler (matches the rig's exhaust effect origin), toolbox, air tanks.
rod('astra-muffler', (1.55, .66, -.92), (2.15, .66, -.92), .19, chassis_black, 20)
rod('astra-tailpipe', (1.55, .66, -.92), (1.42, .56, -.92), .05, chassis_black, 10)
box2('astra-toolbox', (-1.55, .45, -1.12), (-.95, .95, -.74), chassis_black, .02)
for y in (.54, .80):
    rod('astra-air-tank', (-.80, y, -.98), (.20, y, -.98), .12, chassis_black, 16)
# Hazard-free: no brand badges anywhere.

# ---------------------------------------------------------------- finalizar
for group in parts.values():
    for ob in list(group.children):
        if ob.type != 'MESH':
            continue
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

for group in parts.values():
    for material in list(bpy.data.materials):
        obs = [o for o in group.children if o.type == 'MESH' and o.data.materials and o.data.materials[0] == material]
        if not obs:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in obs:
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            for mod in list(o.modifiers):
                bpy.ops.object.modifier_apply(modifier=mod.name)
        if len(obs) > 1:
            bpy.context.view_layer.objects.active = obs[0]
            bpy.ops.object.join()
        obs[0].name = group.name + '-' + material.name

# Short-range hemispherical visibility baked to a vertex channel (indirect light only).
opaque = [o for o in bpy.context.scene.objects if o.type == 'MESH'
          and o.data.materials and o.data.materials[0] != glass]
vertices, polygons = [], []
for ob in opaque:
    start = len(vertices)
    vertices.extend([ob.matrix_world @ v.co for v in ob.data.vertices])
    polygons.extend([tuple(start + i for i in p.vertices) for p in ob.data.polygons])
bvh = BVHTree.FromPolygons(vertices, polygons)
samples = 24
directions = []
for i in range(samples):
    radius = math.sqrt((i + .5) / samples)
    angle = i * 2.399963229728653
    directions.append(Vector((radius * math.cos(angle), radius * math.sin(angle), math.sqrt(1 - radius * radius))))
for ob in opaque:
    colors = ob.data.color_attributes.new(name='CavityAO', type='FLOAT_COLOR', domain='POINT')
    ob.data.color_attributes.active_color = colors
    normal_matrix = ob.matrix_world.to_3x3().inverted().transposed()
    for vertex in ob.data.vertices:
        normal = (normal_matrix @ vertex.normal).normalized()
        rotation = Vector((0, 0, 1)).rotation_difference(normal)
        origin = ob.matrix_world @ vertex.co + normal * .006
        visibility = 0
        for direction in directions:
            hit, _, _, distance = bvh.ray_cast(origin, rotation @ direction, 2.4)
            visibility += 1 if hit is None else min(1, (distance / 2.4) ** .65)
        ao = .12 + .88 * visibility / samples
        colors.data[vertex.index].color = (ao, ao, ao, 1)

tris = sum(len(p.vertices) - 2 for o in bpy.context.scene.objects if o.type == 'MESH' for p in o.data.polygons)
out = os.path.abspath(os.environ.get('ASTRA_OUT', 'public/models/sompo/astra-sompo-truck.glb'))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_vertex_color='ACTIVE')
print('ASTRA_EXPORTED', out, os.path.getsize(out), 'tris', tris)
