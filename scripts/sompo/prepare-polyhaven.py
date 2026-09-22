"""Compile licensed Poly Haven sources into bounded, CSP-safe runtime assets.

Sources: jacaranda_tree, shrub_02 and grass_medium_02 (CC0).
blender -b --factory-startup --disable-autoexec --python scripts/sompo/prepare-polyhaven.py -- ASSET
Source directory is .dream-loop/roadway-rebuild/sources/ASSET.
After jacaranda_tree, run scripts/sompo/prune-jacaranda-far.py: decimate cannot
reach the far branch budget while ~1300 loose twig islands remain.
"""
import bpy, bmesh, sys, os, json, struct, math, hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector

asset = sys.argv[sys.argv.index('--')+1]
root=Path.cwd()
source=root/'.dream-loop/roadway-rebuild/sources'/asset
bpy.ops.wm.open_mainfile(filepath=str(source/f'{asset}_1k.blend'))

# Reconstruct portable Principled materials from the authored PBR maps; the
# source uses Blender-only node groups and diffuse JPEGs alone lose leaf alpha.
source_maps={}
for mat in bpy.data.materials:
    if not mat.use_nodes: continue
    maps={}
    for node in mat.node_tree.nodes:
        if node.type!='TEX_IMAGE' or not node.image: continue
        name=Path(node.image.filepath).name
        if mat.name.endswith('_trunk') and '_branches_' in name: continue
        if '_dry_' in name: continue
        for channel in ['diff','rough','nor_gl','alpha']:
            if f'_{channel}_' in name: maps[channel]=node.image
    if 'diff' not in maps: continue
    source_maps[mat.name]={key:source/'textures'/Path(image.filepath).name for key,image in maps.items()}
    mat.node_tree.nodes.clear()
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    bsdf=nodes.new('ShaderNodeBsdfPrincipled');out=nodes.new('ShaderNodeOutputMaterial')
    links.new(bsdf.outputs['BSDF'],out.inputs['Surface'])
    bsdf.inputs['Metallic'].default_value=0
    bsdf.inputs['Roughness'].default_value=.82
    for channel,img in maps.items():
        img.filepath=str(source/'textures'/Path(img.filepath).name)
        node=nodes.new('ShaderNodeTexImage');node.image=img
        if channel=='diff': links.new(node.outputs['Color'],bsdf.inputs['Base Color'])
        elif channel=='alpha':
            links.new(node.outputs['Color'],bsdf.inputs['Alpha'])
            mat.surface_render_method='DITHERED';mat.use_backface_culling=False
        elif channel=='rough': links.new(node.outputs['Color'],bsdf.inputs['Roughness'])
        elif channel=='nor_gl':
            normal=nodes.new('ShaderNodeNormalMap');links.new(node.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])

if asset=='jacaranda_tree':
    selected=[bpy.data.objects['jacaranda_tree_LOD1']]
elif asset=='grass_medium_02':
    selected=[bpy.data.objects[f'grass_medium_02_{c}'] for c in ['b','d','e']]
elif asset=='grass_bermuda_01':
    bpy.ops.object.select_all(action='DESELECT');clumps=[]
    for index in range(19):
        original=bpy.data.objects[f'grass_bermuda_01_medium_{"abcdef"[index%6]}']
        item=original.copy();item.data=original.data.copy();bpy.context.collection.objects.link(item)
        item.hide_set(False);item.hide_viewport=False
        angle=index*2.39996;radius=.025*math.sqrt(index)
        item.location=(math.cos(angle)*radius,math.sin(angle)*radius,0)
        item.rotation_euler.z=angle;item.select_set(True);clumps.append(item)
    bpy.context.view_layer.objects.active=clumps[0];bpy.ops.object.join();selected=[clumps[0]]
else:
    selected=[o for o in bpy.data.objects if o.type=='MESH' and o.name=='shrub_02_a_LOD1']
    print('SHRUB_SELECTION',[(o.name,len(o.data.polygons)) for o in selected])
    selected=selected[:1]

def leaf_cards(mesh, distant=False):
    # Each photographed compound leaf is an isolated mesh island. Fit its UV
    # plane, retain the original alpha silhouette and replace interior topology
    # with two triangles. This is NOT a billboard of the whole tree: every
    # authored leaf keeps its original 3D position and orientation.
    parents=list(range(len(mesh.vertices)))
    def find(a):
        while parents[a]!=a:
            parents[a]=parents[parents[a]];a=parents[a]
        return a
    for edge in mesh.edges:
        a,b=edge.vertices;parents[find(a)]=find(b)
    islands={}
    uv=mesh.uv_layers.active.data
    for poly in mesh.polygons:
        island=islands.setdefault(find(poly.vertices[0]),{})
        for loop in poly.loop_indices:
            index=mesh.loops[loop].vertex_index
            island[index]=(*uv[loop].uv,*mesh.vertices[index].co)
    verts=[];faces=[];uvs=[]
    for ordinal,points in enumerate(islands.values()):
        if distant and ordinal%3:continue
        a=np.array(list(points.values()));xy=a[:,:2];xyz=a[:,2:]
        if len(a)<3: continue
        affine=np.column_stack((xy,np.ones(len(xy))))
        fit,_,rank,_=np.linalg.lstsq(affine,xyz,rcond=None)
        if rank<3: continue
        lo=xy.min(axis=0);hi=xy.max(axis=0)
        corners=[(lo[0],lo[1]),(hi[0],lo[1]),(hi[0],hi[1]),(lo[0],hi[1])]
        offset=len(verts)
        card=np.array([np.array([u,v,1.])@fit for u,v in corners])
        if distant:
            center=card.mean(axis=0);card=center+(card-center)*1.65
        verts.extend(card.tolist())
        faces.append(tuple(range(offset,offset+4)));uvs.extend(corners)
    result=bpy.data.meshes.new(mesh.name+'-authored-leaf-cards');result.from_pydata(verts,[],faces)
    layer=result.uv_layers.new(name='UVMap')
    for i,coord in enumerate(uvs):layer.data[i].uv=coord
    for mat in mesh.materials:result.materials.append(mat)
    print('LEAF_CARDS',len(islands),len(faces)*2)
    return result

def remove_subpixel_twigs(mesh):
    bm=bmesh.new();bm.from_mesh(mesh);seen=set();remove=[]
    for vertex in bm.verts:
        if vertex in seen:continue
        pending=[vertex];group=[];seen.add(vertex)
        while pending:
            v=pending.pop();group.append(v)
            for e in v.link_edges:
                other=e.other_vert(v)
                if other not in seen:seen.add(other);pending.append(other)
        extent=max(max(v.co[axis] for v in group)-min(v.co[axis] for v in group) for axis in range(3))
        if extent<.7:remove.extend(group)
    bmesh.ops.delete(bm,geom=remove,context='VERTS');bm.to_mesh(mesh);bm.free()

def export_model(ob,stem,budget=None):
    bpy.ops.object.select_all(action='DESELECT')
    copy=ob.copy();copy.data=ob.data.copy();bpy.context.collection.objects.link(copy)
    copy.hide_set(False);copy.hide_viewport=False;copy.hide_render=False
    copy.select_set(True);bpy.context.view_layer.objects.active=copy
    # No source scripts or geometry-node modifiers are executed for export.
    copy.modifiers.clear()
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    low=Vector((min(v.co.x for v in copy.data.vertices),min(v.co.y for v in copy.data.vertices),min(v.co.z for v in copy.data.vertices)))
    high=Vector((max(v.co.x for v in copy.data.vertices),max(v.co.y for v in copy.data.vertices),max(v.co.z for v in copy.data.vertices)))
    shift=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
    for v in copy.data.vertices:v.co-=shift
    copy.location=(0,0,0)
    copy.data.calc_loop_triangles();triangles=len(copy.data.loop_triangles)
    if asset=='jacaranda_tree':
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
        parts=list(bpy.context.selected_objects)
        for part in parts:
            bpy.context.view_layer.objects.active=part
            if 'leaves' in part.data.materials[0].name:
                old=part.data;part.data=leaf_cards(old,'far' in stem)
            else:
                if 'far' in stem and 'branches' in part.data.materials[0].name:remove_subpixel_twigs(part.data)
                part.data.calc_loop_triangles();n=len(part.data.loop_triangles)
                limit=8000 if 'near' in stem else 2800
                dec=part.modifiers.new('Woody geometry LOD','DECIMATE');dec.ratio=min(1,limit/n)
                bpy.ops.object.modifier_apply(modifier=dec.name)
            for attribute in list(part.data.color_attributes):part.data.color_attributes.remove(attribute)
    elif asset=='grass_medium_02':
        copy.data=leaf_cards(copy.data)
    elif budget and triangles>budget:
        dec=copy.modifiers.new('Runtime triangle budget','DECIMATE');dec.ratio=budget/triangles
        bpy.ops.object.modifier_apply(modifier=dec.name)
    copy.name=stem
    out=root/'public/models/sompo'/f'{stem}.glb'
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
    data=out.read_bytes();n=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+n]);binary=data[28+n:];images=[]
    def external(data,ext):
        name=f'ph-{hashlib.sha256(data).hexdigest()[:16]}.{ext}'
        out.with_name(name).write_bytes(data);return name
    for i,img in enumerate(doc.get('images',[])):
        view=doc['bufferViews'][img['bufferView']];ext='png' if img['mimeType']=='image/png' else 'jpg'
        start=view.get('byteOffset',0)
        images.append(external(binary[start:start+view['byteLength']],ext))
    alpha_maps={}
    for index,mat in enumerate(doc['materials']):
        maps=source_maps.get(mat['name'],{})
        if 'diff' in maps:
            image_index=doc['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
            images[image_index]=external(maps['diff'].read_bytes(),maps['diff'].suffix[1:])
        diffuse=maps.get('diff');raw=diffuse.read_bytes() if diffuse else b''
        has_alpha=raw.startswith(b'\x89PNG') and raw[25] in (4,6)
        if 'alpha' in maps and not has_alpha:alpha_maps[str(index)]=external(maps['alpha'].read_bytes(),maps['alpha'].suffix[1:])
    # Geometry-only GLB with deduplicated external PBR maps. Do not download the
    # same images embedded and again externally under the production CSP.
    image_views={img['bufferView'] for img in doc.get('images',[])}
    new_views=[];view_map={};parts=[];offset=0
    for index,view in enumerate(doc['bufferViews']):
        if index in image_views:continue
        block=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        view_map[index]=len(new_views);new_views.append({**view,'byteOffset':offset})
        padded=block+b'\x00'*((-len(block))%4);parts.append(padded);offset+=len(padded)
    for acc in doc['accessors']:
        if 'bufferView' in acc:acc['bufferView']=view_map[acc['bufferView']]
    doc['bufferViews']=new_views;doc['buffers'][0]['byteLength']=offset
    doc['images']=[{'uri':name} for name in images]
    blob=b''.join(parts);meta=json.dumps(doc,separators=(',',':')).encode();meta+=b' '*((-len(meta))%4)
    out.write_bytes(struct.pack('<III',0x46546c67,2,28+len(meta)+len(blob))+struct.pack('<II',len(meta),0x4e4f534a)+meta+struct.pack('<II',len(blob),0x004e4942)+blob)
    out.with_suffix('.textures.json').write_text(json.dumps({'images':images,'alphaMaps':alpha_maps},indent=2)+'\n')
    print('EXPORTED',stem,len(data),sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives']))
    for part in list(bpy.context.selected_objects):bpy.data.objects.remove(part,do_unlink=True)

for i,ob in enumerate(selected):
    if asset=='jacaranda_tree':
        export_model(ob,'ph-jacaranda-near',700000)
        export_model(ob,'ph-jacaranda-far',300000)
    else: export_model(ob,f'ph-{asset}-{i}',2400 if asset=='grass_medium_02' else 9000)
