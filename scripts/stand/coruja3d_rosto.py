"""Olhos de visor e bico da Coruja 3D (v2), chamados por `package-coruja-3d.py`.

O modelo do Tripo traz os olhos pintados no visor, com sobrancelha baixa (cara
de brava) e sem como piscar. Esta etapa:

- `apagar_olhos_pintados`: tira os olhos da cor base e do mapa normal (o visor
  é liso nessa região, sem concha), preenchendo de dentro da borda para o meio
  (Laplace), para o visor ficar de vidro limpo;
- `malha_olhos`: cria `CorujaOlhos`, uma tela fina 1,5 mm à frente do visor em
  cada olho, 100% no osso da cabeça, com UV plano (olho direito da coruja na
  metade esquerda do UV, esquerdo na direita) e material próprio
  `coruja-3d-olhos` sem textura. No three.js essa tela recebe um canvas que
  desenha íris, pupila, brilho e pálpebras a cada quadro (piscar, olhar,
  feliz, pensando), então a expressão não depende de shape key;
- `bico`: shape key `bico_abre` na malha principal (o bico de cima sobe numa
  dobradiça atrás da ponta) e a malha `CorujaRosto`, com a boca escura e o bico
  de baixo que nascem recolhidos atrás da ponta e se abrem com a mesma chave.

Coordenadas do Blender: frente +X, cima +Z, asa direita da coruja em -Y.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

OSSO = 'tripo::Head_2'
# Olhos pintados no visor do Tripo (medidos em vista ortográfica de frente).
OLHO_Y, OLHO_Z = 0.0805, 0.739
OLHO_RAIO = (0.050, 0.037)  # meia largura e meia altura do olho pintado, com a sombra e os traços de sobrancelha
BORDA_SUAVE = 0.008
# Tela dos olhos: quadrado de 9 cm por olho, centrado no olho pintado.
TELA_MEIA = 0.045
TELA_GRADE = 24
TELA_FRENTE_M = 0.004
# Bico de cima: caixa (x mínimo, |y| máximo, z mínimo, z máximo) e dobradiça.
CAIXA_BICO = (0.15, 0.04, 0.612, 0.725)
PONTA_Z = 0.622
DOBRADICA = (0.14, 0.0, 0.628)
SUBIDA_GRAUS = 20.0
BASE_FIXA_Z, PESO_CHEIO_Z = 0.708, 0.668
# Boca aberta: logo abaixo da ponta erguida; bico de baixo na frente dela.
# A ponta sobe de 0,628 a ~0,662 com o bico aberto: a boca vai até logo abaixo dela.
BOCA_TOPO, BOCA_BASE, BOCA_MEIA = 0.658, 0.596, 0.026
BOCA_TETO_X = 0.21
QUEIXO_TOPO, QUEIXO_PONTA, QUEIXO_MEIA = 0.628, 0.602, 0.018
COR_BOCA = (0.012, 0.003, 0.006, 1.0)


class Superficie:
    """Raycast de frente (+X para -X) numa malha em repouso, em coordenadas do mundo."""

    def __init__(self, malha):
        dg = bpy.context.evaluated_depsgraph_get()
        self.mw = malha.matrix_world.copy()
        me = malha.data
        self.vs = [self.mw @ v.co for v in me.vertices]
        me.calc_loop_triangles()
        self.bvh = BVHTree.FromPolygons(self.vs, [t.vertices[:] for t in me.loop_triangles])

    def frente(self, y, z):
        for dy, dz in ((0, 0), (0.0007, 0), (-0.0007, 0), (0, 0.0007), (0, -0.0007)):
            p, n, _, _ = self.bvh.ray_cast(Vector((1.0, y + dy, z + dz)), Vector((-1.0, 0.0, 0.0)))
            if p is not None:  # fresta entre triângulos: desloca um tico e tenta de novo
                p.y, p.z = y, z
                return p, (n if n.x > 0 else -n)
        raise RuntimeError(f'sem superfície em y={y:.3f} z={z:.3f}')


def _peso_olho(y, z):
    """1 dentro da elipse de cada olho pintado, caindo a 0 em BORDA_SUAVE."""
    peso = np.zeros_like(y)
    for lado in (-1, 1):
        d = np.sqrt(((y - lado * OLHO_Y) / OLHO_RAIO[0]) ** 2 + ((z - OLHO_Z) / OLHO_RAIO[1]) ** 2)
        borda = 1 + BORDA_SUAVE / min(OLHO_RAIO)
        peso = np.maximum(peso, np.clip((borda - d) / (borda - 1), 0, 1))
    return peso


def mascara_uv(malha, tamanho):
    """Rasteriza, no espaço UV (tamanho x tamanho), o peso dos olhos pintados."""
    me = malha.data
    me.calc_loop_triangles()
    uv = me.uv_layers.active.data
    mw = malha.matrix_world
    mascara = np.zeros((tamanho, tamanho), np.float32)
    for t in me.loop_triangles:
        ps = [mw @ me.vertices[i].co for i in t.vertices]
        c = sum(ps, Vector()) / 3
        if c.x < 0.1 or abs(abs(c.y) - OLHO_Y) > 0.07 or abs(c.z - OLHO_Z) > 0.06:
            continue
        uvs = np.array([uv[l].uv[:] for l in t.loops]) * tamanho
        x0, y0 = np.floor(uvs.min(0)).astype(int)
        x1, y1 = np.ceil(uvs.max(0)).astype(int)
        xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1 + 1, tamanho)), np.arange(max(y0, 0), min(y1 + 1, tamanho)))
        px = np.stack([xs.ravel() + 0.5, ys.ravel() + 0.5], 1)
        a, b, cc = uvs
        m = np.array([[b[0] - a[0], cc[0] - a[0]], [b[1] - a[1], cc[1] - a[1]]])
        if abs(np.linalg.det(m)) < 1e-9:
            continue
        l12 = np.linalg.solve(m, (px - a).T).T
        l0 = 1 - l12.sum(1)
        dentro = (l0 >= -0.02) & (l12[:, 0] >= -0.02) & (l12[:, 1] >= -0.02)
        if not dentro.any():
            continue
        bary = np.column_stack([l0, l12])[dentro]
        p3 = bary @ np.array([p[:] for p in ps])
        w = _peso_olho(p3[:, 1], p3[:, 2])
        xi, yi = xs.ravel()[dentro], ys.ravel()[dentro]
        mascara[yi, xi] = np.maximum(mascara[yi, xi], w)
    return mascara


def preencher(pixels, mascara, iteracoes=600):
    """Laplace dentro da máscara (> 0), com a borda fixa; mistura pelo peso suave."""
    alvo = mascara > 0.001
    if not alvo.any():
        return pixels
    ys, xs = np.nonzero(alvo)
    y0, y1 = max(ys.min() - 2, 0), min(ys.max() + 3, pixels.shape[0])
    x0, x1 = max(xs.min() - 2, 0), min(xs.max() + 3, pixels.shape[1])
    bloco = pixels[y0:y1, x0:x1].copy()
    m = alvo[y0:y1, x0:x1]
    # Partida: média da borda, para convergir rápido.
    borda = np.zeros_like(m)
    borda[1:-1, 1:-1] = m[1:-1, 1:-1] & ~(m[:-2, 1:-1] & m[2:, 1:-1] & m[1:-1, :-2] & m[1:-1, 2:])
    fora = ~m
    vizinho_fora = np.zeros_like(m)
    vizinho_fora[1:-1, 1:-1] = fora[:-2, 1:-1] | fora[2:, 1:-1] | fora[1:-1, :-2] | fora[1:-1, 2:]
    anel = fora.copy()
    anel[1:-1, 1:-1] &= (m[:-2, 1:-1] | m[2:, 1:-1] | m[1:-1, :-2] | m[1:-1, 2:])
    if anel.any():
        bloco[m] = bloco[anel].mean(0)
    for _ in range(iteracoes):
        media = (np.roll(bloco, 1, 0) + np.roll(bloco, -1, 0) + np.roll(bloco, 1, 1) + np.roll(bloco, -1, 1)) / 4
        bloco[m] = media[m]
    peso = mascara[y0:y1, x0:x1, None]
    saida = pixels.copy()
    saida[y0:y1, x0:x1] = pixels[y0:y1, x0:x1] * (1 - peso) + bloco * peso
    return saida


def apagar_olhos_pintados(malha, base, normal):
    """base/normal: imagens do Blender já assadas no UV da malha. Altera os pixels no lugar."""
    w, h = base.size
    mascara = mascara_uv(malha, w)
    # Alarga a máscara 2 px (a borda do olho pintado no atlas tem antisserrilhado).
    alargada = mascara.copy()
    for _ in range(2):
        alargada = np.maximum.reduce([alargada, np.roll(alargada, 1, 0), np.roll(alargada, -1, 0),
                                      np.roll(alargada, 1, 1), np.roll(alargada, -1, 1)])
    px = np.array(base.pixels[:], np.float32).reshape(h, w, 4)
    px = preencher(px, alargada)
    base.pixels = px.ravel()
    assert normal.size[:] == base.size[:], 'normal e cor base no mesmo tamanho'
    pn = np.array(normal.pixels[:], np.float32).reshape(h, w, 4)
    plano = np.array([0.5, 0.5, 1.0, 1.0], np.float32)
    pn = pn * (1 - alargada[..., None]) + plano * alargada[..., None]
    normal.pixels = pn.ravel()
    print('OLHOS apagados: pixels', int((alargada > 0.5).sum()))
    return alargada


def _material(nome, cor, aspereza=0.6):
    mat = bpy.data.materials.new(nome)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = cor
    bsdf.inputs['Roughness'].default_value = aspereza
    bsdf.inputs['Metallic'].default_value = 0.0
    return mat


def _objeto(nome, bm, arm, materiais, mw):
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = arm
    obj.matrix_world = mw
    for mat in materiais:
        me.materials.append(mat)
    grupo = obj.vertex_groups.new(name=OSSO)
    grupo.add(range(len(me.vertices)), 1.0, 'REPLACE')
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    return obj


def malha_olhos(malha, arm):
    """Tela dos olhos: grade conformada ao visor, 1,5 mm à frente, UV plano por olho."""
    sup = Superficie(malha)
    inv = sup.mw.inverted()
    bm = bmesh.new()
    camada = bm.loops.layers.uv.new('UVMap')
    n = TELA_GRADE
    for metade, lado in enumerate((-1, 1)):  # olho direito da coruja (y<0) na metade esquerda do UV
        grade = []
        for r in range(n + 1):
            linha = []
            for c in range(n + 1):
                y = lado * OLHO_Y + TELA_MEIA * (2 * c / n - 1)
                z = OLHO_Z + TELA_MEIA * (2 * r / n - 1)
                p, normal = sup.frente(y, z)
                linha.append((bm.verts.new(inv @ (p + normal * TELA_FRENTE_M)), (metade + c / n) / 2, r / n))
            grade.append(linha)
        for r in range(n):
            for c in range(n):
                cantos = [grade[r][c], grade[r][c + 1], grade[r + 1][c + 1], grade[r + 1][c]]
                f = bm.faces.new([v for v, _, _ in cantos])  # +y depois +z: normal para +X
                f.smooth = True
                for loop, (_, u, v) in zip(f.loops, cantos):
                    loop[camada].uv = (u, v)
    bm.normal_update()
    mat = _material('coruja-3d-olhos', (1, 1, 1, 1), 0.25)
    olhos = _objeto('CorujaOlhos', bm, arm, [mat], sup.mw)
    print('OLHOS tela', len(olhos.data.vertices), 'vértices')
    return olhos


def _azul_escuro(cor):
    return cor[2] - cor[0] > 0.28 and cor[0] < 0.42


def bico(malha, arm, base_px):
    """Shape key `bico_abre`: bico de cima (malha principal) e boca + bico de baixo (CorujaRosto)."""
    me = malha.data
    h, w, _ = base_px.shape
    uv = me.uv_layers.active.data
    sup = Superficie(malha)
    cantos = {}
    for loop in me.loops:
        u, v = uv[loop.index].uv
        cor = base_px[min(int(v % 1 * h), h - 1), min(int(u % 1 * w), w - 1)]
        cantos.setdefault(loop.vertex_index, []).append(_azul_escuro(cor))
    x0, ay, z0, z1 = CAIXA_BICO
    ids = [i for i, p in enumerate(sup.vs)
           if p.x > x0 and abs(p.y) < ay and z0 < p.z < z1 and np.mean(cantos.get(i, [False])) > 0.5]
    if not ids:
        raise RuntimeError('bico superior não encontrado na textura')
    if not me.shape_keys:
        malha.shape_key_add(name='Basis')
    chave = malha.shape_key_add(name='bico_abre', from_mix=False)
    chave.value = 0.0
    inv = sup.mw.inverted()
    dob = Vector(DOBRADICA)
    for i in ids:
        p = sup.vs[i]
        peso = min(1.0, max(0.0, (BASE_FIXA_Z - p.z) / (BASE_FIXA_Z - PESO_CHEIO_Z)))
        giro = Matrix.Translation(dob) @ Matrix.Rotation(-math.radians(SUBIDA_GRAUS * peso), 4, 'Y') @ Matrix.Translation(-dob)
        chave.data[i].co = inv @ (giro @ p)
    ponta = max((sup.vs[i] for i in ids), key=lambda p: -p.z)

    # Boca e bico de baixo: grade aberta conformada à superfície; em repouso, recolhida
    # na linha de cima e 8 mm para dentro (some atrás da ponta do bico).
    # Cor do bico de baixo: média dos texels azuis do bico de cima (um texel só saía quase preto).
    no_bico = set(ids)
    amostras = [base_px[min(int(uv[l.index].uv[1] % 1 * h), h - 1), min(int(uv[l.index].uv[0] % 1 * w), w - 1)][:3]
                for l in me.loops if l.vertex_index in no_bico]
    # .pixels de imagem sRGB vem em sRGB; o fator de cor do material é linear.
    cor_bico = np.mean(amostras, axis=0) ** 2.2
    print('BICO cor de baixo', [round(float(x), 3) for x in cor_bico])
    bm = bmesh.new()
    base_co, aberto = [], []

    def placa(topo, fundo, meia, frente, material, forma, teto_x=9.0):
        n_u, n_v = 8, 6
        grade = []
        for r in range(n_v + 1):
            t = r / n_v
            z = topo + (fundo - topo) * t
            linha = []
            ys = [(2 * c / n_u - 1) * meia * forma(t) for c in range(n_u + 1)]
            acertos = [sup.frente(y, z)[0] for y in ys]
            # As penas são pontudas: conformar vértice a vértice deixa pontas furarem
            # a placa (a boca sumia atrás delas). A fileira fica plana, na frente da
            # pena mais saliente.
            x_max = max(a.x for a in acertos)
            for c, y in enumerate(ys):
                a = Vector((min(teto_x, x_max + frente), y, z))
                atras, _ = sup.frente(y * 0.6, topo)
                fechado = Vector((atras.x - 0.008, y * 0.6, topo))
                linha.append(bm.verts.new(inv @ fechado))
                base_co.append(fechado), aberto.append(a)
            grade.append(linha)
        for r in range(n_v):
            for c in range(n_u):
                f = bm.faces.new([grade[r][c], grade[r + 1][c], grade[r + 1][c + 1], grade[r][c + 1]])
                f.material_index = material
                f.smooth = True

    # Acima da ponta em repouso o raio acerta o próprio bico; com o bico erguido ali fica o
    # vão da boca, então a placa recua para BOCA_TETO_X (atrás do bico, rente à cara).
    placa(BOCA_TOPO, BOCA_BASE, BOCA_MEIA, 0.003, 0, lambda t: 0.55 + 0.45 * math.sin(math.pi * min(1, 0.25 + t)), BOCA_TETO_X)
    placa(QUEIXO_TOPO, QUEIXO_PONTA, QUEIXO_MEIA, 0.01, 1, lambda t: max(0.08, 1 - t ** 1.4))
    bm.normal_update()
    boca = _material('coruja-3d-boca', COR_BOCA, 0.9)
    queixo = _material('coruja-3d-bico', (*[float(x) for x in cor_bico[:3]], 1.0), 0.35)
    rosto = _objeto('CorujaRosto', bm, arm, [boca, queixo], sup.mw)
    rosto.shape_key_add(name='Basis')
    k = rosto.shape_key_add(name='bico_abre', from_mix=False)
    k.value = 0.0
    for i, p in enumerate(aberto):
        k.data[i].co = inv @ p
    print(f'BICO {len(ids)} vértices no bico de cima (ponta z={ponta.z:.3f}); rosto {len(base_co)} vértices')
    return rosto
