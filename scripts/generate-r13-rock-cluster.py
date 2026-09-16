"""Generate the reusable R13 mountain rock cluster as an embedded-texture GLB."""

from pathlib import Path
import math

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
ALBEDO = ROOT / "public/sompo/gen/r13-mountain-ground.webp"
OUTPUT = ROOT / "public/models/sompo/r13-mountain-rock-cluster.glb"


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def make_material():
    material = bpy.data.materials.new("weathered mountain granite")
    material.use_nodes = True
    material.diffuse_color = (0.36, 0.35, 0.31, 1)
    material.roughness = 0.96
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    principled.inputs["Roughness"].default_value = 0.96
    image_node = nodes.new("ShaderNodeTexImage")
    image_node.name = "R13 granite and lichen albedo"
    image_node.image = bpy.data.images.load(str(ALBEDO), check_existing=True)
    image_node.interpolation = "Linear"
    links.new(image_node.outputs["Color"], principled.inputs["Base Color"])
    return material


def roughen(mesh, seed):
    for vertex in mesh.vertices:
        direction = vertex.co.normalized()
        p = vertex.co
        broad = math.sin(p.x * 3.17 + seed) * math.sin(p.y * 2.71 - seed * 0.7)
        medium = math.sin((p.x + p.z) * 7.3 + seed * 1.9) * 0.45
        fine = math.sin((p.y - p.z) * 15.1 + seed * 2.3) * 0.16
        vertical = 0.88 + 0.12 * max(-0.3, min(1.0, direction.z))
        vertex.co *= (1.0 + (broad * 0.12 + medium * 0.08 + fine * 0.035)) * vertical


def add_rock(name, location, scale, rotation, seed, material):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1, location=location)
    rock = bpy.context.object
    rock.name = name
    rock.scale = scale
    rock.rotation_euler = rotation
    roughen(rock.data, seed)
    bpy.context.view_layer.objects.active = rock
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    rock.data.materials.append(material)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.025)
    bpy.ops.object.mode_set(mode="OBJECT")
    rock["asset_role"] = "mountain_boulder"
    return rock


reset_scene()
material = make_material()

specs = [
    ("anchor", (-0.4, 0.2, 1.15), (2.8, 1.85, 1.55), (0.08, -0.18, 0.22)),
    ("right slab", (2.55, -0.1, 0.78), (1.65, 1.15, 1.05), (-0.22, 0.12, -0.38)),
    ("left face", (-2.85, 0.4, 0.72), (1.8, 1.3, 1.0), (0.19, 0.08, 0.31)),
    ("front wedge", (0.85, -1.55, 0.46), (1.2, 0.8, 0.62), (-0.1, 0.21, -0.16)),
    ("rear cap", (-0.7, 1.65, 0.58), (1.45, 0.92, 0.78), (0.27, -0.08, 0.12)),
    ("talus a", (3.35, 1.15, 0.31), (0.72, 0.55, 0.42), (0.2, 0.1, 0.45)),
    ("talus b", (-3.55, -0.8, 0.28), (0.65, 0.48, 0.38), (-0.1, 0.24, -0.3)),
]
for index, (name, location, scale, rotation) in enumerate(specs):
    add_rock(name, location, scale, rotation, 2.7 + index * 1.37, material)

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
