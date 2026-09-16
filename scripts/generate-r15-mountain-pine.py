"""Generate the reusable R15 lodgepole pine as a compact Blender-authored GLB."""

from pathlib import Path
import math
import random

import bpy
from mathutils import Quaternion, Vector


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/models/sompo/r15-mountain-pine.glb"
random.seed(1515)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def frame_for(direction):
    axis = Vector(direction).normalized()
    reference = Vector((0, 0, 1)) if abs(axis.z) < 0.88 else Vector((0, 1, 0))
    right = axis.cross(reference).normalized()
    up = right.cross(axis).normalized()
    return axis, right, up


def tapered_segment(vertices, faces, start, end, radius_a, radius_b, sides=7):
    start = Vector(start)
    end = Vector(end)
    _, right, up = frame_for(end - start)
    base = len(vertices)
    for point, radius in ((start, radius_a), (end, radius_b)):
        for index in range(sides):
            angle = math.tau * index / sides
            vertex = point + right * math.cos(angle) * radius + up * math.sin(angle) * radius
            vertices.append(tuple(vertex))
    for index in range(sides):
        nxt = (index + 1) % sides
        faces.append((base + index, base + nxt, base + sides + nxt, base + sides + index))
    faces.append(tuple(base + index for index in reversed(range(sides))))
    faces.append(tuple(base + sides + index for index in range(sides)))


def foliage_card(vertices, faces, uvs, start, end, width, roll=0.0):
    start = Vector(start)
    end = Vector(end)
    axis = (end - start).normalized()
    width_axis = Vector((0, 0, 1)) - axis * axis.dot(Vector((0, 0, 1)))
    if width_axis.length < 0.1:
        width_axis = Vector((0, 1, 0))
    width_axis.normalize()
    width_axis.rotate(Quaternion(axis, roll))
    base = len(vertices)
    root_half = width_axis * width * 0.52
    tip_half = width_axis * width * 0.34
    vertices.extend((tuple(start - root_half), tuple(end - tip_half), tuple(end + tip_half), tuple(start + root_half)))
    uvs.extend(((0, 0), (1, 0), (1, 1), (0, 1)))
    faces.append((base, base + 1, base + 2, base + 3))


def make_mesh_object(name, vertices, faces, uvs=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(verbose=False)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    if uvs:
        layer = mesh.uv_layers.new(name="UVMap")
        for polygon in mesh.polygons:
            for loop_index in polygon.loop_indices:
                vertex_index = mesh.loops[loop_index].vertex_index
                layer.data[loop_index].uv = uvs[vertex_index]
    else:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=1.05, island_margin=0.018)
        bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)
    return obj


reset_scene()

wood_vertices = []
wood_faces = []
foliage_dark_vertices = []
foliage_dark_faces = []
foliage_dark_uvs = []
foliage_light_vertices = []
foliage_light_faces = []
foliage_light_uvs = []

# Slightly irregular tapered trunk with visible crown leader.
trunk_points = [
    (0.00, 0.00, 0.00),
    (0.04, -0.02, 1.8),
    (-0.03, 0.04, 3.8),
    (0.06, 0.01, 5.9),
    (-0.02, -0.03, 7.8),
    (0.02, 0.00, 9.8),
]
for index in range(len(trunk_points) - 1):
    start = trunk_points[index]
    end = trunk_points[index + 1]
    tapered_segment(
        wood_vertices,
        wood_faces,
        start,
        end,
        0.34 * (1 - index * 0.145),
        0.34 * (1 - (index + 1) * 0.145),
        10,
    )

# Lodgepole branch whorls: lower levels are long and broken, crown becomes compact.
for level in range(9):
    z = 1.35 + level * 0.88
    crown = level / 8
    branch_count = 7 if level < 6 else 6
    reach = 2.9 * (1 - crown * 0.69) + random.uniform(-0.16, 0.20)
    for branch in range(branch_count):
        angle = math.tau * branch / branch_count + level * 0.67 + random.uniform(-0.14, 0.14)
        start = Vector((math.cos(angle) * 0.18, math.sin(angle) * 0.18, z))
        droop = -0.25 * (1 - crown) + 0.34 * crown + random.uniform(-0.08, 0.12)
        elbow = start + Vector((math.cos(angle) * reach * 0.58, math.sin(angle) * reach * 0.58, droop * 0.45))
        end = start + Vector((math.cos(angle) * reach, math.sin(angle) * reach, droop))
        tapered_segment(wood_vertices, wood_faces, start, elbow, 0.085 * (1 - crown * 0.45), 0.045, 6)
        tapered_segment(wood_vertices, wood_faces, elbow, end, 0.046, 0.012, 5)
        spray_start = start.lerp(elbow, 0.12)
        width = 1.28 - crown * 0.52 + random.uniform(-0.08, 0.12)
        if (level + branch) % 4 == 0:
            target_vertices, target_faces, target_uvs = foliage_light_vertices, foliage_light_faces, foliage_light_uvs
        else:
            target_vertices, target_faces, target_uvs = foliage_dark_vertices, foliage_dark_faces, foliage_dark_uvs
        foliage_card(target_vertices, target_faces, target_uvs, spray_start, end, width, 0)
        foliage_card(target_vertices, target_faces, target_uvs, spray_start, end, width * 0.88, math.pi / 2)

# Broken, narrow leader characteristic of the target's alpine pines.
for index in range(5):
    z = 8.1 + index * 0.36
    reach = 0.78 - index * 0.09
    for branch in range(5):
        angle = math.tau * branch / 5 + index * 0.71
        start = Vector((0, 0, z))
        end = Vector((math.cos(angle) * reach, math.sin(angle) * reach, z + 0.18 + index * 0.03))
        target_vertices = foliage_light_vertices if index % 2 else foliage_dark_vertices
        target_faces = foliage_light_faces if index % 2 else foliage_dark_faces
        target_uvs = foliage_light_uvs if index % 2 else foliage_dark_uvs
        foliage_card(target_vertices, target_faces, target_uvs, start, end, 0.62 - index * 0.06, branch % 2 * math.pi / 2)

trunk = make_mesh_object("r15_pine_trunk_and_branches", wood_vertices, wood_faces)
dark = make_mesh_object("r15_pine_needles_dark", foliage_dark_vertices, foliage_dark_faces, foliage_dark_uvs)
light = make_mesh_object("r15_pine_needles_sunlit", foliage_light_vertices, foliage_light_faces, foliage_light_uvs)
trunk["asset_role"] = "pine_bark"
dark["asset_role"] = "pine_needles_dark"
light["asset_role"] = "pine_needles_light"

bpy.ops.object.select_all(action="SELECT")
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_materials="NONE",
)
print(f"wrote {OUTPUT}")
