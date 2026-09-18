"""Maize with curved leaf surfaces, authored in Blender for instanced runtime use.

Run from repo root: blender --background --factory-startup --python scripts/sompo/build-maize.py
Asset is normalized to one metre high; instance height is the plant height in metres.
"""
import bpy
import math
import os
import json
import struct
from pathlib import Path
from mathutils import Vector

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, roughness=.86):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*color,1)
    m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=roughness
    return m

leaf=material('Maize leaf',(.35,.43,.17))
image=bpy.data.images.load(os.path.abspath('public/sompo/gen/maize-leaf-albedo.png'))
tex=leaf.node_tree.nodes.new('ShaderNodeTexImage')
tex.image=image
p=leaf.node_tree.nodes.get('Principled BSDF')
leaf.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
leaf.node_tree.links.new(tex.outputs['Alpha'],p.inputs['Alpha'])
leaf.surface_render_method='DITHERED'
leaf.use_backface_culling=False
stem=material('Maize stalk',(.16,.23,.055))
tassel=material('Maize tassel',(.31,.25,.12))

def rod(name,a,b,r,mat):
    a,b=Vector(a),Vector(b)
    bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=r,radius2=r*.66,depth=(b-a).length,location=(a+b)*.5)
    ob=bpy.context.object
    ob.name=name
    ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    ob.data.materials.append(mat)
    for poly in ob.data.polygons: poly.use_smooth=True

rod('stalk',(0,0,0),(.015,0,.9),.009,stem)
for index in range(12):
    base=.15+index*.057
    length=.31+.10*math.sin(index*.31+1)
    if index>8: length*=.76
    angle=index*2.43+.2*math.sin(index)
    direction=Vector((math.cos(angle),math.sin(angle),0))
    across=Vector((-math.sin(angle),math.cos(angle),0))
    origin=Vector((base*.016,0,base))
    vs=[]
    segments=12
    # Flat UV width covers the complete leaf silhouette; alpha trims its fine edge.
    for step in range(segments+1):
        t=step/segments
        center=origin+direction*(length*t)
        center.z+=length*(.72*t-.87*t*t)
        for column in range(3):
            cross=column-1
            v=center+across*(cross*.053)
            v.z+=abs(cross)*.010*math.sin(math.pi*t)
            vs.append(v)
    faces=[]
    for step in range(segments):
        for col in range(2):
            a=step*3+col
            faces.append((a,a+1,a+4,a+3))
    me=bpy.data.meshes.new('curved-leaf')
    me.from_pydata(vs,[],faces);me.update()
    ob=bpy.data.objects.new('maize-leaf',me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(leaf)
    uv=me.uv_layers.new(name='UVMap').data
    for face in me.polygons:
        face.use_smooth=True
        for li in face.loop_indices:
            vi=me.loops[li].vertex_index
            uv[li].uv=((vi%3)*.5,(vi//3)/segments)

rod('tassel-core',(.015,0,.85),(.018,0,1),.003,tassel)
for i in range(10):
    angle=i*2.4
    h=.87+i*.007
    rod('tassel-arm',(.016,0,h),(.016+math.cos(angle)*.065,math.sin(angle)*.065,h+.045),.0018,tassel)

# One mesh per material keeps runtime draw calls bounded across hundreds of plants.
for mat in [leaf,stem,tassel]:
    bpy.ops.object.select_all(action='DESELECT')
    obs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active=obs[0]
    bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    obs[0].name=mat.name

bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('.dream-loop/maize.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.abspath('public/models/sompo/maize-curved.glb'),export_format='GLB',export_yup=True,export_apply=True)

# Keep the embedded atlas for portability, and export byte-identical images for
# the production CSP-safe TextureLoader path shared with agricultural assets.
asset_path = Path('public/models/sompo/maize-curved.glb')
data = asset_path.read_bytes()
json_length = struct.unpack_from('<I', data, 12)[0]
document = json.loads(data[20:20 + json_length])
binary = data[28 + json_length:]
images = []
for index, image_def in enumerate(document.get('images', [])):
    view = document['bufferViews'][image_def['bufferView']]
    extension = 'png' if image_def['mimeType'] == 'image/png' else 'jpg'
    name = f'maize-curved-image-{index}.{extension}'
    offset = view.get('byteOffset', 0)
    asset_path.with_name(name).write_bytes(binary[offset:offset + view['byteLength']])
    images.append(name)
asset_path.with_suffix('.textures.json').write_text(json.dumps({'images': images}, indent=2) + '\n')
