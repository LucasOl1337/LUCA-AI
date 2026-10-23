"""Trusted pipeline: import only audited GLB, never third-party Blender files."""
import bpy, json, pathlib, struct, io, hashlib, sys, argparse
from PIL import Image, ImageOps
ROOT=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sources',type=pathlib.Path,required=True,help='Audited folder containing amostras/<index>.glb and implementacao/sources.json')
SOURCES=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []).sources
DEST=ROOT/'public/models/scenario'
DEST.mkdir(parents=True,exist_ok=True)
records=json.loads((SOURCES/'implementacao/sources.json').read_text())
for record in records:
    idx=record['index']; name=record['name']
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    source=SOURCES/'amostras'/f'{idx}.glb'
    if hashlib.sha256(source.read_bytes()).hexdigest()!=record['sourceSha256']:
        raise ValueError(f'Source hash mismatch: {idx}')
    bpy.ops.import_scene.gltf(filepath=str(source))
    if idx == 354:
        for obj in list(bpy.data.objects):
            if obj.type == 'MESH' and not obj.name.startswith('06'):
                bpy.data.objects.remove(obj, do_unlink=True)
    for obj in list(bpy.data.objects):
        if obj.type!='MESH': continue
        bpy.context.view_layer.objects.active=obj
        target=5000 if idx!=354 else 3000
        triangles=sum(len(p.vertices)-2 for p in obj.data.polygons)
        if triangles>target:
            mod=obj.modifiers.new('Scenario budget','DECIMATE'); mod.ratio=target/triangles
            bpy.ops.object.modifier_apply(modifier=mod.name)
    # Export intermediate geometry only. Materials patched losslessly below.
    temp=SOURCES/'implementacao'/f'{idx}-geometry.glb'
    bpy.ops.export_scene.gltf(filepath=str(temp),export_format='GLB',export_materials='NONE',export_yup=True)
    original=(SOURCES/'amostras'/f'{idx}.glb').read_bytes()
    jl=struct.unpack_from('<I',original,12)[0]; src=json.loads(original[20:20+jl]); binary=original[28+jl:]
    # Source emissive atlas on barrel/cart is their painted color, not a light.
    mat=src['materials'][0]; ti=mat['pbrMetallicRoughness'].get('baseColorTexture') if idx==354 else mat.get('emissiveTexture')
    image=src['images'][src['textures'][ti['index']]['source']]
    view=src['bufferViews'][image['bufferView']]; start=view.get('byteOffset',0)
    im=Image.open(io.BytesIO(binary[start:start+view['byteLength']])).convert('RGB')
    im.thumbnail((1024,1024))
    if idx==354: im=ImageOps.colorize(ImageOps.grayscale(im), '#343433','#aca697')
    filename=f'{name}-albedo.jpg'; im.save(DEST/filename,quality=88,optimize=True)
    data=temp.read_bytes(); jl=struct.unpack_from('<I',data,12)[0]; doc=json.loads(data[20:20+jl]); buf=data[28+jl:]
    doc['materials']=[{'name':name+' · Scenario Labs · PBR diffuse','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':0.88},'doubleSided':True}]
    doc['images']=[{'uri':filename}];doc['textures']=[{'source':0}]
    for mesh in doc['meshes']:
        for prim in mesh['primitives']: prim['material']=0
    doc.setdefault('asset',{})['copyright']='Scenario Labs · CC-BY-4.0; LUCA-AI: decimation, 1K diffuse PBR, neutral rock palette'
    j=json.dumps(doc,separators=(',',':')).encode(); j+=b' '*((-len(j))%4)
    final=struct.pack('<4sII',b'glTF',2,12+8+len(j)+8+len(buf))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(buf),b'BIN\0')+buf
    (DEST/f'{name}.glb').write_bytes(final)
    (DEST/f'{name}.textures.json').write_text(json.dumps({'images':[filename]}))
    record.update(assetUrl=f'/models/scenario/{name}.glb',triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives']),materials=1,textureSize=list(im.size),changes='Decimated mesh; 1K JPEG; emissive-to-diffuse PBR for barrel/cart; neutral non-emissive rock palette; pivot/metric size applied by runtime')
    record['files']=[{'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [DEST/f'{name}.glb',DEST/filename,DEST/f'{name}.textures.json']]
    print(json.dumps(record))
(DEST/'provenance.json').write_text(json.dumps(records,indent=2))
(SOURCES/'implementacao/manifest-assets.json').write_text(json.dumps(records,indent=2))
