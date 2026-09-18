import bpy, math, os
from mathutils import Vector
from mathutils.bvhtree import BVHTree

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Author in the rig's metres and +X-forward/Y-up coordinates; glTF converts back.
def xyz(p):
    return (p[0], -p[2], p[1])

def inp(principled, name, value):
    if name in principled.inputs:
        principled.inputs[name].default_value = value

def mat(name, color, metal=0, rough=.5, emission=0):
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
    if name == 'Pintura da cabine':
        inp(p, 'Coat Weight', .82)
        inp(p, 'Coat Roughness', .12)
    return m

def glass_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    inp(p, 'Base Color', (.22, .32, .36, 1))
    inp(p, 'Metallic', 0)
    inp(p, 'Roughness', .05)
    inp(p, 'Specular IOR Level', .55)
    inp(p, 'IOR', 1.45)
    inp(p, 'Transmission Weight', .88)
    inp(p, 'Transmission', .88)
    inp(p, 'Coat Weight', 1)
    inp(p, 'Coat Roughness', .03)
    inp(p, 'Alpha', .10)
    for key, val in (('blend_method', 'BLEND'), ('surface_render_method', 'BLENDED'),
                     ('use_screen_refraction', True), ('use_transparency_overlap', True)):
        try:
            setattr(m, key, val)
        except Exception:
            pass
    return m

def uv_local(o, u_axis, v_axis, u_size, v_size, repeat=(1, 1), flip_u=False, u0=0, v0=0, u_span=1, v_span=1):
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    layer = me.uv_layers.active.data
    ru, rv = repeat
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = co[u_axis] / max(1e-6, u_size) + .5
            v = co[v_axis] / max(1e-6, v_size) + .5
            if flip_u:
                u = 1 - u
            layer[li].uv = (u0 + u * u_span * ru, v0 + v * v_span * rv)

navy = mat('Pintura da cabine', (.008, .017, .05), .42, .22)
white = mat('Astra box shell', (.84, .84, .80), .18, .48)
alloy = mat('Alumínio do baú', (.5, .54, .56), .8, .28)
chrome = mat('Astra polished chrome', (.68, .72, .76), .90, .25)
black = mat('Astra rubber seals', (.009, .012, .016), .05, .78)
mirror = mat('Astra mirror glass', (.18, .22, .24), .88, .05)
glass = glass_mat('Astra cabin glass')
vent = mat('Astra grille recess', (.017, .022, .025), .45, .48)
lamp = mat('Astra headlight', (.95, .91, .76), .15, .15, 1.15)
amber = mat('Astra amber marker', (.8, .23, .014), .15, .22, 1.1)
red = mat('Astra red reflector', (.45, .013, .014), .18, .28)
seat = mat('Astra cabin seats', (.07, .075, .08), .04, .82)
letter = mat('SOMPO painted metal', (.008, .017, .05), .38, .28)
dark_cabin = mat('Astra cabin void', (.025, .028, .032), .02, .9)
corrugated = mat('Painéis do baú', (.9, .9, .86), .28, .44)
grille_face = mat('Astra grille face', (.18, .20, .22), .78, .16)
cabin_card = mat('Astra cabin interior', (.28, .24, .20), 0, .86, 0.8)
leather = mat('Astra wheel leather', (.035, .028, .025), .04, .74)
gauge_body = mat('Astra gauge cluster', (.22, .20, .18), .05, .44)
gauge_face = mat('Astra gauge faces', (.58, .54, .46), .02, .36)

parts = {}
for n in ['astra-cab', 'astra-cargo']:
    o = bpy.data.objects.new(n, None)
    bpy.context.collection.objects.link(o)
    parts[n] = o
parent = parts['astra-cab']

def finish(o, n, m, bevel=0):
    o.name = n
    o.parent = parent
    o.data.materials.append(m)
    if bevel:
        mod = o.modifiers.new('Machined soft edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 5
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for f in o.data.polygons:
        f.use_smooth = True
    mod = o.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL')
    mod.keep_sharp = True
    mod.weight = 40
    return o

def box(n, p, s, m, b=.01):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(p))
    o = bpy.context.object
    o.scale = (s[0], s[2], s[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, n, m, b)

def profile(n, poly, z0, z1, m, b=.035):
    vs = [xyz((x, y, z)) for z in [z0, z1] for x, y in poly]
    l = len(poly)
    faces = [tuple(range(l - 1, -1, -1)), tuple(range(l, l * 2))] + [
        (i, (i + 1) % l, (i + 1) % l + l, i + l) for i in range(l)
    ]
    me = bpy.data.meshes.new(n)
    me.from_pydata(vs, [], faces)
    me.update()
    o = bpy.data.objects.new(n, me)
    bpy.context.collection.objects.link(o)
    return finish(o, n, m, b)

def window_ring(n, outer, inner, z0, z1, m):
    """Closed gasket with an actual aperture, never a filled window polygon."""
    assert len(outer) == len(inner)
    count = len(outer)
    vs = [xyz((x, y, z)) for z in (z0, z1) for poly in (outer, inner) for x, y in poly]
    faces = []
    for i in range(count):
        j = (i + 1) % count
        faces.extend([
            (i, j, count + j, count + i),
            (2 * count + i, 3 * count + i, 3 * count + j, 2 * count + j),
            (i, 2 * count + i, 2 * count + j, j),
            (count + i, count + j, 3 * count + j, 3 * count + i),
        ])
    me = bpy.data.meshes.new(n)
    me.from_pydata(vs, [], faces)
    me.update()
    ob = bpy.data.objects.new(n, me)
    bpy.context.collection.objects.link(ob)
    return finish(ob, n, m, .004)

def pane(n, points):
    """One optical surface; a thin box would blend four glass faces at grazing angles."""
    me = bpy.data.meshes.new(n)
    me.from_pydata([xyz(p) for p in points], [], [tuple(range(len(points)))])
    me.update()
    ob = bpy.data.objects.new(n, me)
    bpy.context.collection.objects.link(ob)
    return finish(ob, n, glass)

def loft(n, rings, m, b=.03):
    nvert = len(rings[0])
    vs = [xyz(p) for ring in rings for p in ring]
    faces = [tuple(range(nvert - 1, -1, -1))]
    faces.append(tuple(range((len(rings) - 1) * nvert, len(rings) * nvert)))
    for s in range(len(rings) - 1):
        base = s * nvert
        nxt = (s + 1) * nvert
        for i in range(nvert):
            j = (i + 1) % nvert
            faces.append((base + i, base + j, nxt + j, nxt + i))
    me = bpy.data.meshes.new(n)
    me.from_pydata(vs, [], faces)
    me.update()
    o = bpy.data.objects.new(n, me)
    bpy.context.collection.objects.link(o)
    return finish(o, n, m, b)

def rod(n, a, b, r, m):
    a, b = Vector(xyz(a)), Vector(xyz(b))
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=r, depth=(b - a).length, location=(a + b) / 2)
    o = bpy.context.object
    o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return finish(o, n, m)

def torus(n, p, major, minor, m, eul=(0, 0, 0), b=.006):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor,
        major_segments=40, minor_segments=12,
        location=xyz(p),
    )
    o = bpy.context.object
    o.rotation_euler = eul
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(o, n, m, b)

def tube(n, p, r, depth, m, eul=(0, math.pi / 2, 0), b=.004):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=r, depth=depth, location=xyz(p))
    o = bpy.context.object
    o.rotation_euler = eul
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(o, n, m, b)

def text(n, body, p, size, m, front=False, side=1):
    cu = bpy.data.curves.new(n, 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = .0022
    cu.bevel_depth = .0004
    cu.align_x = 'CENTER'
    ob = bpy.data.objects.new(n, cu)
    bpy.context.collection.objects.link(ob)
    ob.location = xyz(p)
    ob.rotation_euler = (math.pi / 2, 0, 0) if side > 0 else (math.pi / 2, 0, math.pi)
    if front:
        ob.rotation_euler = (math.pi / 2, 0, math.pi / 2)
    ob.parent = parent
    ob.data.materials.append(m)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob.select_set(False)
    return ob

# Hollow day-cab greenhouse: roof / rear / skirts / thin pillars. Window
# volume stays empty so the 3/4 sees dash, wheel and the interior card.
profile('astra-cab-roof', [
    (1.58, 3.00), (1.70, 3.22), (2.72, 3.22), (2.90, 3.08), (2.90, 2.98), (1.58, 2.98),
], -1.03, 1.03, navy, .05)
box('astra-cab-rear-wall', (1.62, 2.10, 0), (.10, 1.76, 2.06), navy, .04)
box('astra-cab-floor', (2.28, 1.26, 0), (1.36, .08, 1.92), navy, .02)
box('astra-cowl', (3.02, 2.14, 0), (.16, .22, 1.62), navy, .03)
box('astra-sun-visor', (2.88, 3.14, 0), (.26, .05, 1.74), black, .012)
for side in [-1, 1]:
    camera_face = side > 0
    belt_h = 0.74 if camera_face else 0.84
    belt_y = 1.59 if camera_face else 1.64
    box('astra-cab-side-skirt', (2.22, belt_y, side * 1.015), (1.28, belt_h, .042), navy, .03)
    box('astra-b-pillar', (1.70, 2.56, side * 1.02), (.065, 1.28, .034), navy, .012)
    profile('astra-a-pillar', [
        (2.94, 2.10), (3.02, 2.10), (2.90, 3.10), (2.80, 3.16),
    ], side * 0.998, side * 1.028, navy, .012)

def hood_ring(x, taper):
    # Smooth superellipse shoulder instead of a faceted polygon plus a separate
    # slab bulge. Rings preserve the measured wheel/sensor envelope.
    width = .83 - .07 * taper
    top = 2.15 - .22 * taper
    bottom = 1.10
    center = (top + bottom) / 2
    radius = (top - bottom) / 2
    ring = []
    for j in range(32):
        a = math.tau * j / 32
        s, c = math.sin(a), math.cos(a)
        ring.append((x, center + radius * math.copysign(abs(s) ** .58, s),
                     width * math.copysign(abs(c) ** .58, c)))
    return ring

hood = loft('astra-long-hood', [hood_ring(3.00 + i * 1.43 / 16, i / 16) for i in range(17)], navy, 0)
# Equal-angle vertex normals keep the broad curved sheet smooth; weighted
# planar normals are appropriate for trim, not for this compound curvature.
for modifier in list(hood.modifiers):
    hood.modifiers.remove(modifier)

# Volumetric fenders: lofted arch around the steer axle, dropping into a deep well.
def fender_rings(side):
    cx, cy = 3.14, 0.58
    z_in, z_out = side * 0.72, side * 1.27
    rings = []
    for i in range(33):
        ang = math.radians(195 - i * 200 / 32)
        ca, sa = math.cos(ang), math.sin(ang)
        xw, yw = cx + 0.68 * ca, cy + 0.68 * sa
        xl, yl = cx + 0.94 * ca, cy + 0.94 * sa
        xh = cx + 0.28 * ca
        yh = max(1.24, cy + 1.02 * sa)
        rings.append([
            (xw, max(0.40, yw), z_in),
            (xw, max(0.40, yw), z_out - side * .06),
            (cx + .76*ca, max(.4, cy + .76*sa), z_out),
            (xl, max(.42, yl), z_out - side * .045),
            (xl, max(.52, yl + .09), z_out - side * .16),
            (xh, yh, z_in),
        ])
    return rings

for side in [-1, 1]:
    camera_face = side > 0
    fender = loft('astra-front-arched-fender', fender_rings(side), navy, 0)
    for modifier in list(fender.modifiers):
        fender.modifiers.remove(modifier)
    z = side * 1.08
    liner = [(3.14 + 0.64 * math.cos(t), 0.58 + 0.64 * math.sin(t))
             for t in [i * math.pi / 16 for i in range(17)]]
    liner += [(3.14 + 0.52 * math.cos(t), 0.58 + 0.52 * math.sin(t))
              for t in [i * math.pi / 16 for i in range(16, -1, -1)]]
    profile('astra-wheel-arch-liner', liner, z - 0.18, z + 0.18, black, .012)
    poly = [(1.64, 1.94), (1.64, 3.08), (1.96, 3.16), (2.86, 3.16), (3.04, 2.06)] if camera_face else [
        (1.68, 2.06), (1.68, 3.04), (1.94, 3.14), (2.84, 3.14), (3.02, 2.10)]
    outer = poly
    poly = [(1.68, 1.98), (1.68, 3.04), (1.98, 3.12), (2.82, 3.12), (3.00, 2.10)] if camera_face else [
        (1.72, 2.12), (1.72, 3.00), (1.98, 3.08), (2.78, 3.08), (2.98, 2.14)]
    window_ring('astra-side-window-seal', outer, poly, side * 1.045 - .012, side * 1.045 + .012, black)
    pane('astra-side-window-glass', [(x, y, side * 1.065) for x, y in poly])
    door_h = 0.58 if camera_face else 0.70
    door_y = 1.58 if camera_face else 1.64
    box('astra-door-lower-panel', (2.16, door_y, side * 1.048), (1.02, door_h, .024), navy, .035)
    box('astra-door-handle', (1.90, 1.88, side * 1.078), (.20, .055, .035), black, .018)
    for y in [2.18, 3.02]:
        rod('astra-west-coast-arm', (2.92, y, side * 1.02), (3.14, y, side * 1.28), .018, chrome)
    box('astra-west-coast-mirror', (3.16, 2.60, side * 1.275), (.12, .82, .14), chrome, .05)
    box('astra-mirror-glass', (3.235, 2.60, side * 1.275), (.014, .72, .10), mirror, .025)
    box('astra-headlight-integrated-pod', (4.05, 1.16, side * .96), (.58, .43, .48), navy, .14)
    box('astra-headlight-bezel', (4.35, 1.17, side * .99), (.08, .23, .37), chrome, .065)
    box('astra-headlamp-lens', (4.396, 1.17, side * .99), (.02, .17, .29), lamp, .045)
    box('astra-turn-signal', (4.37, 1.19, side * 1.19), (.04, .15, .055), amber, .02)

# The windshield gasket follows four edges; its center remains open.
for side in [-1, 1]:
    rod('astra-windscreen-side-seal', (3.10, 2.12, side * .93), (2.89, 3.12, side * .93), .024, black)
rod('astra-windscreen-bottom-seal', (3.10, 2.12, -.93), (3.10, 2.12, .93), .024, black)
rod('astra-windscreen-top-seal', (2.89, 3.12, -.93), (2.89, 3.12, .93), .024, black)
pane('astra-wide-windscreen', [(3.108, 2.16, -.90), (3.108, 2.16, .90), (2.910, 3.10, .90), (2.910, 3.10, -.90)])
for side in [-1, 1]:
    rod('astra-wiper', (3.08, 2.26, side * .13), (3.00, 2.52, side * .62), .013, black)

box('astra-bumper', (4.30, .78, 0), (.34, .33, 2.36), navy, .14)
box('astra-bumper-chrome-lip', (4.48, .94, 0), (.03, .05, 2.08), chrome, .012)
box('astra-chrome-grille-surround', (4.44, 1.47, 0), (.12, 1.03, 1.53), chrome, .12)
inset = box('astra-grille-black-inset', (4.52, 1.47, 0), (.035, 0.87, 1.29), grille_face, .07)
uv_local(inset, 1, 2, 1.46, 0.94, u0=.20, v0=.12, u_span=.60, v_span=.74)
for i in range(9):
    box('astra-chrome-grille-bar', (4.545, 1.08 + i * .095, 0), (.024, .018, 1.25), chrome, .008)
box('astra-license-plate', (4.48, .72, 0), (.016, .14, .34), white, .005)
box('astra-license-blue-strip', (4.49, .77, 0), (.005, .035, .34), navy, .001)
for z in [-.78, -.39, 0, .39, .78]:
    box('astra-roof-marker', (2.68, 3.26, z), (.14, .06, .07), amber, .022)

# Void stays below the belt so it cannot occlude the cockpit.
box('astra-cabin-void', (2.08, 1.42, 0), (0.52, 0.32, 1.00), dark_cabin, .02)
# Real interior: no opaque photograph bisecting the cockpit as the camera orbits.
headliner = mat('Astra headliner fabric', (.065, .059, .048), 0, .95)
box('astra-headliner', (2.20, 3.00, 0), (1.02, .035, 1.84), headliner, .025)
box('astra-interior-rear-trim', (1.70, 2.18, 0), (.018, 1.48, 1.82), headliner, .025)
box('astra-seat-base', (2.10, 1.50, .34), (.48, .38, .42), seat, .05)
box('astra-seat-back', (1.90, 1.90, .34), (.12, .56, .42), seat, .04)
box('astra-seat-base-r', (2.10, 1.50, -.34), (.48, .38, .42), seat, .05)
box('astra-seat-back-r', (1.90, 1.90, -.34), (.12, .56, .42), seat, .04)
for side in [-1, 1]:
    box('astra-seat-headrest', (1.93, 2.34, side * .34), (.14, .22, .31), seat, .045)
    for offset in [-.12, 0, .12]:
        rod('astra-seat-stitch', (1.976, 1.70, side * .34 + offset), (1.976, 2.12, side * .34 + offset), .003, headliner)
box('astra-dash', (2.94, 2.16, 0.22), (.26, .52, 1.48), black, .04)
# Cluster on the dash in the +Z / windshield sightline. Lighter plastic,
# not emissive — it picks up the harvest key.
box('astra-gauge-cluster', (2.86, 2.50, 0.64), (.14, .16, .46), gauge_body, .02)
for z in (0.48, 0.64, 0.80):
    tube('astra-gauge-dial', (2.94, 2.54, z), 0.055, 0.028, gauge_face)
# Cascadia rim: torus in the camera-facing glass, large enough to cut
# across the cream upper third. Axis +X, rake toward the driver, yaw +Z.
wheel_at = (2.70, 2.58, 0.76)
torus(
    'astra-steering-wheel', wheel_at, 0.28, 0.032, leather,
    eul=(0, math.pi / 2 + math.radians(30), math.radians(-16)),
)
tube('astra-wheel-hub', wheel_at, 0.055, 0.05, leather)
rod('astra-steering-column', (2.92, 2.28, 0.62), (2.74, 2.50, 0.74), .022, leather)
for ang in (0.35, 2.44, 4.53):
    rod(
        'astra-wheel-spoke',
        wheel_at,
        (wheel_at[0], wheel_at[1] + 0.20 * math.sin(ang), wheel_at[2] + 0.20 * math.cos(ang)),
        .012, leather,
    )

parent = parts['astra-cargo']
def reefer_panel(side):
    # Pressed sheet: 42 shallow horizontal corrugations, continuous curved normals.
    # UVs retain metre-scale texture detail; ribs are geometry and catch the actual sun.
    vs, faces = [], []
    rows = 42 * 8
    for row in range(rows + 1):
        y = 1.30 + 2.12 * row / rows
        relief = .003 * (0.5 - .5 * math.cos(row * math.tau / 8))
        for x in [-4.45, 1.46]:
            vs.append(xyz((x, y, side * (1.17 + relief))))
    for row in range(rows):
        a = row * 2
        face = (a, a + 1, a + 3, a + 2)
        faces.append(face if side > 0 else tuple(reversed(face)))
    me = bpy.data.meshes.new('reefer-pressed-sheet')
    me.from_pydata(vs, [], faces)
    me.update()
    ob = bpy.data.objects.new('astra-reefer-side-skin', me)
    bpy.context.collection.objects.link(ob)
    finish(ob, ob.name, corrugated)
    uv = me.uv_layers.new(name='UVMap').data
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = ((co.x + 4.45) / 2.12, (co.z - 1.30) / 2.12)

# Lower, longer reefer vs the day cab. Roof ~3.44, rear almost at envelope.
body = box('astra-reefer-insulated-body', (-1.495, 2.36, 0), (5.93, 2.16, 2.22), white, .02)
for side in [-1, 1]:
    reefer_panel(side)
    for y in [1.28, 3.43]:
        box('astra-reefer-edge-rail', (-1.495, y, side * 1.18), (5.94, .08, .065), alloy, .012)
    for x in [-4.44, 1.45]:
        box('astra-reefer-corner-post', (x, 2.36, side * 1.18), (.075, 2.24, .065), alloy, .014)
    for i in range(36):
        for y in [1.29, 3.43]:
            box('astra-rivet', (-4.34 + i * .17, y, side * 1.218), (.012, .012, .008), chrome, .003)
    for i in range(12):
        box('astra-reflector', (-4.14 + i * .51, 1.36, side * 1.205), (.15, .047, .016), red if i % 2 == 0 else white, .004)
    text('astra-SOMPO', 'SOMPO', (0.85, 1.53, side * 1.200), .14, letter, side=side)
    for x in [-4.38, 1.38]:
        box('astra-reefer-marker', (x, 3.42, side * 1.22), (.12, .055, .025), amber, .012)

box('astra-thermo-king-housing', (1.68, 3.00, 0), (.50, .88, 1.50), white, .12)
box('astra-thermo-king-vent', (1.942, 2.96, 0), (.025, .58, 1.18), vent, .06)
for i in range(6):
    box('astra-thermo-king-louver', (1.966, 2.72 + i * .09, 0), (.055, .024, 1.12), alloy, .008)
for z in [-.37, 0, .37]:
    box('astra-thermo-king-upright', (1.983, 2.96, z), (.019, .55, .019), white, .005)
box('astra-thermo-king-badge', (1.943, 3.32, 0), (.026, .10, 1.00), letter, .016)
text('astra-Thermo-King', 'THERMO KING', (1.963, 3.28, 0), .068, alloy, front=True)

for group in parts.values():
    for ob in list(group.children):
        if ob.type != 'MESH':
            continue
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        # Shorter day-cab greenhouse reveals the reefer above it. This changes
        # the visual shell only; wheel axes, sensor and simulation rig are fixed.
        if group.name == 'astra-cab':
            for vertex in ob.data.vertices:
                if vertex.co.z > 2.1:
                    # Sweep the greenhouse rearward, including panes and seals,
                    # so no opaque patch is added across the window aperture.
                    vertex.co.x -= .24 * min(1, (vertex.co.z - 2.1) / 1.12)
                    vertex.co.z = 2.1 + (vertex.co.z - 2.1) * .70
            ob.data.update()

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

# Bake short-range hemispherical visibility into a separate vertex channel.
# Runtime applies it ONLY to indirect lighting, not paint/base color or sunlight.
# Opaque meshes occlude; glass must never turn the cabin into a sealed box.
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
    directions.append(Vector((radius * math.cos(angle), radius * math.sin(angle), math.sqrt(1-radius*radius))))
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

out = os.path.abspath('public/models/sompo/astra-sompo-truck.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_vertex_color='ACTIVE')
print('ASTRA_EXPORTED', out, os.path.getsize(out))
