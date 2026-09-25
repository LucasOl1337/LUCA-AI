"""Utilidades de UV e PBR compartilhadas pelas maquinas agricolas.

Os mapas ficam externos para o carregador CSP, mas entram no GLB durante a
exportacao para manter o contrato glTF verificavel. Depois da exportacao, os
bytes embutidos sao extraidos de volta sem recompressao.
"""

import json
import math
import os
import re
import struct
import subprocess
import tempfile

import bpy


TEXTURE_ROOT = os.path.abspath('public/models/sompo')


def _image(filename, color):
    image = bpy.data.images.load(os.path.join(TEXTURE_ROOT, filename), check_existing=True)
    image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    return image


def attach_tiled_pbr(material, family, normal_strength=0.45):
    """Liga albedo, normal e ORM 2K a um material sem criar outro draw."""
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes.get('Principled BSDF')
    uv = nodes.new('ShaderNodeUVMap')
    uv.name = f'{family} UV repetivel'
    uv.uv_map = 'UVMap'
    base = nodes.new('ShaderNodeTexImage')
    base.name = f'{family} albedo 2K'
    base.image = _image(f'agri-machine-{family}-albedo.jpg', True)
    base.extension = 'REPEAT'
    normal = nodes.new('ShaderNodeTexImage')
    normal.name = f'{family} normal 2K'
    normal.image = _image(f'agri-machine-{family}-normal.jpg', False)
    normal.extension = 'REPEAT'
    normal_map = nodes.new('ShaderNodeNormalMap')
    normal_map.inputs['Strength'].default_value = normal_strength
    orm = nodes.new('ShaderNodeTexImage')
    orm.name = f'{family} ORM 2K'
    orm.image = _image(f'agri-machine-{family}-orm.jpg', False)
    orm.extension = 'REPEAT'
    separate = nodes.new('ShaderNodeSeparateColor')
    for texture in (base, normal, orm):
        links.new(uv.outputs['UV'], texture.inputs['Vector'])
    links.new(base.outputs['Color'], shader.inputs['Base Color'])
    links.new(normal.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], shader.inputs['Normal'])
    links.new(orm.outputs['Color'], separate.inputs['Color'])
    links.new(separate.outputs['Green'], shader.inputs['Roughness'])
    links.new(separate.outputs['Blue'], shader.inputs['Metallic'])


def _gltf_settings_group():
    """Cria a saida especial que o exportador glTF reconhece como oclusao."""
    name = 'glTF Material Output'
    if name in bpy.data.node_groups:
        return bpy.data.node_groups[name]
    group = bpy.data.node_groups.new(name, 'ShaderNodeTree')
    group.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    group.nodes.new('NodeGroupInput')
    group.nodes.new('NodeGroupOutput')
    return group


def bake_ao_atlas(material, objects, filename, size=2048):
    """Assa AO no Cycles em UV2 unica, sem mexer no UV repetivel do microdetalhe."""
    objects = [obj for obj in objects if obj.type == 'MESH']
    if not objects:
        return None
    columns = math.ceil(math.sqrt(len(objects)))
    rows = math.ceil(len(objects) / columns)
    padding = .018
    for index, obj in enumerate(objects):
        bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode != 'OBJECT' else None
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        uv = obj.data.uv_layers.get('AOUV') or obj.data.uv_layers.new(name='AOUV')
        obj.data.uv_layers.active = uv
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.012)
        bpy.ops.object.mode_set(mode='OBJECT')
        col, row = index % columns, index // columns
        width, height = 1 / columns, 1 / rows
        for loop in uv.data:
            loop.uv.x = col * width + padding + loop.uv.x * (width - padding * 2)
            loop.uv.y = row * height + padding + loop.uv.y * (height - padding * 2)

    path = os.path.join(TEXTURE_ROOT, filename)
    image = bpy.data.images.new(filename, width=size, height=size, alpha=False, float_buffer=False)
    image.colorspace_settings.name = 'Non-Color'
    image.generated_color = (1, 1, 1, 1)
    image.filepath_raw = path
    image.file_format = 'JPEG'

    nodes = material.node_tree.nodes
    links = material.node_tree.links
    uv_node = nodes.new('ShaderNodeUVMap')
    uv_node.name = 'UV2 do AO assado'
    uv_node.uv_map = 'AOUV'
    ao_node = nodes.new('ShaderNodeTexImage')
    ao_node.name = 'AO Cycles 2K'
    ao_node.image = image
    ao_node.extension = 'CLIP'
    links.new(uv_node.outputs['UV'], ao_node.inputs['Vector'])
    separate = nodes.new('ShaderNodeSeparateColor')
    links.new(ao_node.outputs['Color'], separate.inputs['Color'])
    settings = nodes.new('ShaderNodeGroup')
    settings.name = 'Saida glTF do AO'
    settings.node_tree = _gltf_settings_group()
    links.new(separate.outputs['Red'], settings.inputs['Occlusion'])
    nodes.active = ao_node
    ao_node.select = True

    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.render.bake.margin = 8
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 93
    bpy.ops.object.bake(type='AO', use_clear=True, margin=8)
    image.save()
    return image


def compress_packed_orm(glb_path, quality=68):
    """Troca o PNG ORM que o exportador empacota por JPEG 2K dentro do GLB."""
    with open(glb_path, 'rb') as handle:
        data = handle.read()
    json_length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + json_length].decode('utf-8'))
    binary_header = 20 + json_length
    binary_length = struct.unpack_from('<I', data, binary_header)[0]
    binary = data[binary_header + 8:binary_header + 8 + binary_length]
    replacements = {}
    with tempfile.TemporaryDirectory(prefix='luca-agri-orm-') as temporary:
        for image in document.get('images', []):
            name = image.get('name', '')
            if image.get('mimeType') != 'image/png' or '-ao-agri-machine-' not in name:
                continue
            view_index = image['bufferView']
            view = document['bufferViews'][view_index]
            start = view.get('byteOffset', 0)
            source = os.path.join(temporary, name + '.png')
            target = os.path.join(temporary, name + '.jpg')
            with open(source, 'wb') as handle:
                handle.write(binary[start:start + view['byteLength']])
            subprocess.run([
                '/usr/bin/magick', source, '-sampling-factor', '4:4:4',
                '-quality', str(quality), target,
            ], check=True)
            with open(target, 'rb') as handle:
                replacements[view_index] = handle.read()
            family = 'body' if '-body-' in name else 'wheel'
            asset = name.split(f'-{family}-ao-', 1)[0]
            image['name'] = f'{asset}-{family}-orm'
            image['mimeType'] = 'image/jpeg'

    if not replacements:
        return []
    rebuilt = bytearray()
    for index, view in enumerate(document.get('bufferViews', [])):
        while len(rebuilt) % 4:
            rebuilt.append(0)
        start = view.get('byteOffset', 0)
        payload = replacements.get(index, binary[start:start + view['byteLength']])
        view['byteOffset'] = len(rebuilt)
        view['byteLength'] = len(payload)
        rebuilt.extend(payload)
    while len(rebuilt) % 4:
        rebuilt.append(0)
    document['buffers'][0]['byteLength'] = len(rebuilt)
    encoded = json.dumps(document, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * ((4 - len(encoded) % 4) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(rebuilt)
    output = bytearray(struct.pack('<III', 0x46546C67, 2, total))
    output.extend(struct.pack('<II', len(encoded), 0x4E4F534A))
    output.extend(encoded)
    output.extend(struct.pack('<II', len(rebuilt), 0x004E4942))
    output.extend(rebuilt)
    with open(glb_path, 'wb') as handle:
        handle.write(output)
    asset_name = os.path.splitext(os.path.basename(glb_path))[0]
    for family in ('body', 'wheel'):
        standalone_ao = os.path.join(TEXTURE_ROOT, f'{asset_name}-{family}-ao.jpg')
        if os.path.exists(standalone_ao):
            os.remove(standalone_ao)
    return [document['images'][index]['name'] for index in range(len(document['images']))]


def project_box_uv(obj, metres_per_tile=0.72):
    """Projecao triplanar simples e repetivel, preservada quando as pecas juntam."""
    mesh = obj.data
    uv = mesh.uv_layers.get('UVMap') or mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        normal = polygon.normal
        axis = max(range(3), key=lambda index: abs(normal[index]))
        for loop_index in polygon.loop_indices:
            point = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if axis == 0:
                u, v = point.y, point.z
            elif axis == 1:
                u, v = point.x, point.z
            else:
                u, v = point.x, point.y
            uv.data[loop_index].uv = (u / metres_per_tile, v / metres_per_tile)


def extract_external_images(glb_path, manifest_path):
    """Extrai imagens do GLB e grava o manifesto na mesma ordem do glTF."""
    with open(glb_path, 'rb') as handle:
        data = handle.read()
    json_length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + json_length].decode('utf-8'))
    binary_offset = 28 + json_length
    names = []
    for index, image in enumerate(document.get('images', [])):
        mime = image.get('mimeType', 'image/jpeg')
        extension = '.png' if mime == 'image/png' else '.jpg'
        raw_name = image.get('name') or f'agri-texture-{index}'
        filename = re.sub(r'[^A-Za-z0-9_.-]+', '-', raw_name)
        if not filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            filename += extension
        view = document['bufferViews'][image['bufferView']]
        start = binary_offset + view.get('byteOffset', 0)
        payload = data[start:start + view['byteLength']]
        with open(os.path.join(os.path.dirname(glb_path), filename), 'wb') as handle:
            handle.write(payload)
        names.append(filename)
    with open(manifest_path, 'w', encoding='utf-8') as handle:
        json.dump({'images': names}, handle, indent=2)
        handle.write('\n')
    # O exportador pode deixar um ORM PNG intermediario ao empacotar canais.
    # O GLB e o manifesto ja guardam os bytes finais; nao deixe sobra no repo.
    for family in ('body', 'wheel'):
        intermediate = os.path.join(os.path.dirname(glb_path), f'agri-machine-{family}-orm.png')
        if os.path.exists(intermediate) and os.path.basename(intermediate) not in names:
            os.remove(intermediate)
    return names
