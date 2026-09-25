"""Utilidades de UV e PBR compartilhadas pelas maquinas agricolas.

Os mapas ficam externos para o carregador CSP, mas entram no GLB durante a
exportacao para manter o contrato glTF verificavel. Depois da exportacao, os
bytes embutidos sao extraidos de volta sem recompressao.
"""

import json
import os
import re
import struct

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
    links.new(base.outputs['Color'], shader.inputs['Base Color'])
    links.new(normal.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], shader.inputs['Normal'])
    links.new(orm.outputs['Color'], separate.inputs['Color'])
    links.new(separate.outputs['Green'], shader.inputs['Roughness'])
    links.new(separate.outputs['Blue'], shader.inputs['Metallic'])


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
