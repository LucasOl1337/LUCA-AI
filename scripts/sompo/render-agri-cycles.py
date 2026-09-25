"""Render Cycles reprodutivel de um GLB agricola isolado.

Uso:
  blender -b --factory-startup --python scripts/sompo/render-agri-cycles.py -- \
    modelo.glb ambiente.hdr saida.png

CPU e intencional: a evidencia continua disponivel quando a GPU da maquina esta
ocupada pelo usuario, mantendo exatamente os mesmos parametros entre assets.
"""

import bpy
import math
import mathutils
import sys


glb, hdr, out = sys.argv[sys.argv.index('--') + 1:sys.argv.index('--') + 4]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
minimum = mathutils.Vector((1e9,) * 3)
maximum = mathutils.Vector((-1e9,) * 3)
for obj in objects:
    for corner in obj.bound_box:
        world = obj.matrix_world @ mathutils.Vector(corner)
        minimum = mathutils.Vector(map(min, minimum, world))
        maximum = mathutils.Vector(map(max, maximum, world))

scale = 10 / max(maximum - minimum)
root = bpy.data.objects.new('asset-normalizado', None)
bpy.context.scene.collection.objects.link(root)
for obj in list(bpy.context.scene.objects):
    if obj.parent is None and obj is not root:
        obj.parent = root
root.scale = (scale,) * 3
bpy.context.view_layer.update()
root.location.z = -minimum.z * scale

bpy.ops.mesh.primitive_plane_add(size=200)
ground = bpy.context.object
ground_material = bpy.data.materials.new('solo-neutro')
ground_material.use_nodes = True
ground_material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.32, 0.24, 0.15, 1)
ground_material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
ground.data.materials.append(ground_material)

world = bpy.data.worlds.new('ambiente')
bpy.context.scene.world = world
world.use_nodes = True
environment = world.node_tree.nodes.new('ShaderNodeTexEnvironment')
environment.image = bpy.data.images.load(hdr)
world.node_tree.links.new(environment.outputs['Color'], world.node_tree.nodes['Background'].inputs['Color'])

sun_data = bpy.data.lights.new('sol', 'SUN')
sun_data.energy = 3.5
sun_data.angle = math.radians(2)
sun = bpy.data.objects.new('sol', sun_data)
bpy.context.scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), 0, math.radians(35))

camera_data = bpy.data.cameras.new('camera')
camera_data.lens = 40
camera = bpy.data.objects.new('camera', camera_data)
bpy.context.scene.collection.objects.link(camera)
bpy.context.scene.camera = camera
camera.location = (12, -12, 4.5)
target = bpy.data.objects.new('alvo', None)
bpy.context.scene.collection.objects.link(target)
target.location = (0, 0, (maximum.z - minimum.z) * scale * 0.4)
track = camera.constraints.new('TRACK_TO')
track.target = target

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 128
scene.cycles.use_denoising = True
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
