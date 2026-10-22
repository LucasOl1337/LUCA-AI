"""Olhos de visor e bico da Coruja 3D (v3), chamados por `package-coruja-3d.py`.

O Tripo pinta no visor os olhos da Coruja A (íris radial, cavidade escura,
anéis do HUD). A v2 apagava esses olhos por Laplace e desenhava olhos de
desenho por cima: o visor ficava leitoso e o olho, chapado. Esta etapa mantém
o olho pintado e só o anima:

- `recorte_olhos`: projeta de frente a cor base 4K da malha alta num quadrado
  de 9 cm por olho e grava `coruja-3d-olhos.jpg` (olho direito da coruja na
  metade esquerda). No three.js o canvas da tela usa o recorte para mover a
  íris (olhar) e desenhar as pálpebras; no resto a tela é transparente e
  aparece o olho pintado do modelo, com a cavidade esculpida;
- `malha_olhos`: `CorujaOlhos`, grade 2 mm à frente do visor (em +X, a mesma
  projeção de frente do recorte), 100% no osso da cabeça, UV plano por olho e
  material próprio `coruja-3d-olhos` sem textura;
- `bico`: shape key `bico_abre` na malha principal (o bico de cima sobe numa
  dobradiça na base, com peso suave, sem rasgo) e a malha `CorujaRosto`: o
  bico de baixo, uma cunha azul com o interior da boca escuro em cima, que nasce
  dentro do bico de cima e desce com a mesma chave.

Coordenadas do Blender: frente +X, cima +Z, asa direita da coruja em -Y.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

OSSO = 'tripo::Head_2'
# Tela dos olhos: quadrado de 9 cm por olho, centrado no olho pintado.
OLHO_Y, OLHO_Z = 0.0805, 0.739
TELA_MEIA = 0.045
TELA_GRADE = 24
TELA_FRENTE_M = 0.002
RECORTE_PX = 512  # por olho: ~5700 px/m, acima da cor base 4K do Tripo no visor
# Bico de cima (medido na malha alta): ponta em (0,239, 0, 0,628), base no visor
# em z ~0,71, junta com a cara em x ~0,20. Gira na base, peso suave em z e em x.
BICO_CAIXA = (0.199, 0.052, 0.615, 0.712)  # x mínimo, |y| máximo, z mínimo, z máximo
BICO_DOBRADICA = (0.205, 0.0, 0.700)
BICO_SUBIDA_GRAUS = 8.0
BICO_PESO_Z = (0.704, 0.684)  # peso 0 acima do primeiro, 1 abaixo do segundo
BICO_PESO_X = (0.201, 0.211)  # peso 0 na junta com a cara, 1 no bico
# Bico de baixo: cunha com dobradiça na base do bico de cima (1 mm acima da face
# de baixo dele, plana em z 0,651). Aberto, desce MANDIBULA_ABERTO_GRAUS abaixo da
# horizontal e a ponta passa ~2,8 cm abaixo da ponta do bico de cima (o gancho
# esconde uma boca curta de quem olha de frente). Fechado, encolhe para
# MANDIBULA_RECOLHIDA do comprimento, gira MANDIBULA_RECOLHE_GRAUS para cima e
# fica dentro do bico. Boca escura no meio da face de cima, borda azul nos lados.
MANDIBULA_DOBRADICA = (0.198, 0.652)
MANDIBULA_COMPRIMENTO = 0.064
MANDIBULA_ABERTO_GRAUS = 54.0
MANDIBULA_RECOLHE_GRAUS = 58.0
MANDIBULA_RECOLHIDA = 0.5
MANDIBULA_MEIA = 0.013
MANDIBULA_ESPESSURA = 0.0045
MANDIBULA_BORDA = 0.17  # fração da largura, de cada lado, com a cor do bico
COR_BOCA = (0.012, 0.003, 0.010, 1.0)


class Superficie:
    """Raycast de frente (+X para -X) numa malha em repouso, em coordenadas do mundo."""

    def __init__(self, malha):
        self.mw = malha.matrix_world.copy()
        me = malha.data
        self.vs = [self.mw @ v.co for v in me.vertices]
        me.calc_loop_triangles()
        self.tris = me.loop_triangles
        self.bvh = BVHTree.FromPolygons(self.vs, [t.vertices[:] for t in self.tris])

    def frente(self, y, z):
        for dy, dz in ((0, 0), (0.0007, 0), (-0.0007, 0), (0, 0.0007), (0, -0.0007)):
            p, n, i, _ = self.bvh.ray_cast(Vector((1.0, y + dy, z + dz)), Vector((-1.0, 0.0, 0.0)))
            if p is not None:  # fresta entre triângulos: desloca um tico e tenta de novo
                p.y, p.z = y, z
                return p, (n if n.x > 0 else -n), i
        raise RuntimeError(f'sem superfície em y={y:.3f} z={z:.3f}')


def _pixels(img):
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)


def recorte_olhos(malha_alta, base, caminho, qualidade):
    """Cor base vista de frente nos dois olhos -> JPEG (2*RECORTE_PX x RECORTE_PX).

    Coluna c da metade de um olho = y crescente; linha 0 = topo (z alto), como o
    canvas da tela (UV do glTF com v=0 no topo).
    """
    sup = Superficie(malha_alta)
    me = malha_alta.data
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers.active.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    tex = _pixels(base)
    th, tw, _ = tex.shape
    n = RECORTE_PX
    passo = 2 * TELA_MEIA / n
    uvs = np.zeros((n, 2 * n, 2), np.float64)  # linha 0 = topo
    for metade, lado in enumerate((-1, 1)):
        for linha in range(n):
            z = OLHO_Z + TELA_MEIA - (linha + 0.5) * passo
            for c in range(n):
                y = lado * OLHO_Y - TELA_MEIA + (c + 0.5) * passo
                _, _, i = sup.frente(y, z)
                t = sup.tris[i]
                a, b, d = (sup.vs[v] for v in t.vertices)
                # Baricêntricas em (y, z): a projeção é de frente.
                det = (b.y - a.y) * (d.z - a.z) - (d.y - a.y) * (b.z - a.z)
                if abs(det) < 1e-14:
                    l1 = l2 = 0.0
                else:
                    l1 = ((y - a.y) * (d.z - a.z) - (d.y - a.y) * (z - a.z)) / det
                    l2 = ((b.y - a.y) * (z - a.z) - (y - a.y) * (b.z - a.z)) / det
                uvs[linha, metade * n + c] = ((1 - l1 - l2) * uv[t.loops[0]] + l1 * uv[t.loops[1]]
                                              + l2 * uv[t.loops[2]])
    # Bilinear no atlas 4K (pixels do Blender: linha 0 embaixo, como v=0).
    fx, fy = (uvs[..., 0] % 1) * tw - 0.5, (uvs[..., 1] % 1) * th - 0.5
    x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
    ax, ay = (fx - x0)[..., None], (fy - y0)[..., None]
    x1, y1 = np.clip(x0 + 1, 0, tw - 1), np.clip(y0 + 1, 0, th - 1)
    x0, y0 = np.clip(x0, 0, tw - 1), np.clip(y0, 0, th - 1)
    cor = ((tex[y0, x0] * (1 - ax) + tex[y0, x1] * ax) * (1 - ay)
           + (tex[y1, x0] * (1 - ax) + tex[y1, x1] * ax) * ay)
    saida = np.ones((n, 2 * n, 4), np.float32)
    saida[..., :3] = cor[::-1, :, :3]  # imagem nova do Blender também tem a linha 0 embaixo
    img = bpy.data.images.new('coruja-3d-olhos', 2 * n, n)
    img.colorspace_settings.name = 'sRGB'
    img.pixels.foreach_set(saida.ravel())
    cena = bpy.context.scene
    cena.render.image_settings.file_format = 'JPEG'
    cena.render.image_settings.quality = qualidade
    img.save_render(str(caminho), scene=cena)
    bpy.data.images.remove(img)
    print('OLHOS recorte', caminho, f'{2 * n}x{n}')


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
    """Tela dos olhos: grade conformada ao visor, TELA_FRENTE_M à frente em +X, UV plano por olho.

    O deslocamento é em +X e não na normal: a normal da malha decimada é ruidosa e
    o recorte do olho pintado é de frente, então a tela fica registrada com ele.
    """
    sup = Superficie(malha)
    inv = sup.mw.inverted()
    bm = bmesh.new()
    camada = bm.loops.layers.uv.new('UVMap')
    n = TELA_GRADE
    frente = Vector((TELA_FRENTE_M, 0.0, 0.0))
    for metade, lado in enumerate((-1, 1)):  # olho direito da coruja (y<0) na metade esquerda do UV
        grade = []
        for r in range(n + 1):
            linha = []
            for c in range(n + 1):
                y = lado * OLHO_Y + TELA_MEIA * (2 * c / n - 1)
                z = OLHO_Z + TELA_MEIA * (2 * r / n - 1)
                p, _, _ = sup.frente(y, z)
                linha.append((bm.verts.new(inv @ (p + frente)), (metade + c / n) / 2, r / n))
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


def _degrau(a, b, x):
    """smoothstep de a para b (a > b vale: peso cresce quando x desce)."""
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _giro_y(centro, graus):
    """Giro no eixo Y em torno de `centro`; graus > 0 levanta a frente (+X sobe)."""
    c = Vector(centro)
    return Matrix.Translation(c) @ Matrix.Rotation(-math.radians(graus), 4, 'Y') @ Matrix.Translation(-c)


def _peso_bico(p):
    x0, ay, z0, z1 = BICO_CAIXA
    if not (p.x > x0 and abs(p.y) < ay and z0 < p.z < z1):
        return 0.0
    return (_degrau(*BICO_PESO_Z, p.z) * _degrau(*BICO_PESO_X, p.x)
            * _degrau(ay, ay * 0.7, abs(p.y)))


def _dentro(bvh, p):
    """Paridade do raio em +X: ímpar = dentro da malha fechada."""
    n, o = 0, Vector(p)
    for _ in range(40):
        acerto, _, _, d = bvh.ray_cast(o, Vector((1.0, 0.0, 0.0)))
        if acerto is None:
            break
        n += 1
        o = acerto + Vector((1e-5, 0.0, 0.0))
    return n % 2 == 1


def _cunha(bm, sup, inv):
    """Bico de baixo + véu escuro do meio. Devolve (vértices em repouso, aberto) em mundo."""
    n_t, n_s = 8, 8
    hx, hz = MANDIBULA_DOBRADICA
    aberto = math.radians(-MANDIBULA_ABERTO_GRAUS)
    fecha = _giro_y((hx, 0.0, hz), MANDIBULA_RECOLHE_GRAUS)
    eixo = Vector((math.cos(aberto), 0.0, math.sin(aberto)))
    baixo = Vector((math.sin(aberto), 0.0, -math.cos(aberto)))
    pares = []  # (posição aberta, posição fechada)
    dobra = Vector((hx, 0.0, hz))

    def recolher(p):
        rel = p - dobra
        ao_longo = rel.dot(eixo)
        return fecha @ (dobra + rel + eixo * (ao_longo * (MANDIBULA_RECOLHIDA - 1)))

    def novo(p_aberto, p_fechado=None):
        p_fechado = recolher(p_aberto) if p_fechado is None else p_fechado
        v = bm.verts.new(inv @ p_fechado)
        pares.append((p_aberto, p_fechado))
        return v

    topo, fundo = [], []
    for i in range(n_t + 1):
        t = i / n_t
        meio = Vector((hx, 0.0, hz)) + eixo * (t * MANDIBULA_COMPRIMENTO)
        meia = MANDIBULA_MEIA * (1 - t) ** 0.55 + 0.0018
        esp = MANDIBULA_ESPESSURA * (1 - 0.55 * t)
        lt, lf = [], []
        for j in range(n_s + 1):
            s = 2 * j / n_s - 1
            lado = Vector((0.0, s * meia, 0.0))
            lt.append(novo(meio + lado + baixo * (0.0012 * (1 - s * s))))
            lf.append(novo(meio + lado + baixo * (esp * (0.55 + 0.45 * (1 - s * s)))))
        topo.append(lt), fundo.append(lf)

    def face(vs, material, liso=True):
        f = bm.faces.new(vs)
        f.material_index = material
        f.smooth = liso

    for i in range(n_t):
        for j in range(n_s):
            borda = abs(2 * (j + 0.5) / n_s - 1) > 1 - 2 * MANDIBULA_BORDA
            face([topo[i][j], topo[i][j + 1], topo[i + 1][j + 1], topo[i + 1][j]], 1 if borda else 0)
            face([fundo[i][j], fundo[i + 1][j], fundo[i + 1][j + 1], fundo[i][j + 1]], 1)
        for j in (0, n_s):  # laterais
            face([topo[i][j], topo[i + 1][j], fundo[i + 1][j], fundo[i][j]], 1, False)
    for i in (0, n_t):  # base e ponta
        for j in range(n_s):
            face([topo[i][j], fundo[i][j], fundo[i][j + 1], topo[i][j + 1]], 1, False)

    # Véu do meio (y=0): da boca até a face de baixo do bico de cima, para quem
    # olha de lado ver a boca escura e não o fundo através dela.
    cima, chao = [], []
    for i in range(n_t + 1):
        p_ab, p_fe = pares[(i * (n_s + 1) + n_s // 2) * 2]
        teto_ab = _teto(sup, p_ab.x)
        teto_fe = _teto(sup, p_fe.x)
        teto_ab = _giro_y(BICO_DOBRADICA, BICO_SUBIDA_GRAUS * _peso_bico(teto_ab)) @ teto_ab
        cima.append(novo(teto_ab + Vector((0, 0, 0.0015)), teto_fe + Vector((0, 0, 0.0015))))
        chao.append(novo(p_ab, p_fe))
    for i in range(n_t):
        face([chao[i], chao[i + 1], cima[i + 1], cima[i]], 0)
    return pares


def _teto(sup, x):
    """Ponto da face de baixo do bico de cima em y=0 na coluna x (raio de baixo para cima)."""
    acerto, _, _, _ = sup.bvh.ray_cast(Vector((x, 0.0, 0.615)), Vector((0.0, 0.0, 1.0)))
    if acerto is None or not 0.62 < acerto.z < 0.70:
        return Vector((x, 0.0, 0.651))
    return acerto


def bico(malha, arm, base_px):
    """Shape key `bico_abre`: bico de cima (malha principal) e bico de baixo (CorujaRosto)."""
    me = malha.data
    h, w, _ = base_px.shape
    uv = me.uv_layers.active.data
    sup = Superficie(malha)
    pesos = {i: _peso_bico(p) for i, p in enumerate(sup.vs)}
    pesos = {i: k for i, k in pesos.items() if k > 1e-3}
    if not pesos:
        raise RuntimeError('bico superior não encontrado na malha')
    if not me.shape_keys:
        malha.shape_key_add(name='Basis')
    chave = malha.shape_key_add(name='bico_abre', from_mix=False)
    chave.value = 0.0
    inv = sup.mw.inverted()
    for i, k in pesos.items():
        chave.data[i].co = inv @ (_giro_y(BICO_DOBRADICA, BICO_SUBIDA_GRAUS * k) @ sup.vs[i])
    cheios = {i for i, k in pesos.items() if k > 0.8}
    ponta = min((sup.vs[i] for i in cheios), key=lambda p: p.z)

    # Cor do bico de baixo: média dos texels do bico de cima.
    # .pixels de imagem sRGB vem em sRGB; o fator de cor do material é linear.
    amostras = [base_px[min(int(uv[l.index].uv[1] % 1 * h), h - 1), min(int(uv[l.index].uv[0] % 1 * w), w - 1)][:3]
                for l in me.loops if l.vertex_index in cheios]
    cor_bico = np.mean(amostras, axis=0) ** 2.2
    print('BICO cor de baixo', [round(float(x), 3) for x in cor_bico])

    bm = bmesh.new()
    pares = _cunha(bm, sup, inv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    boca = _material('coruja-3d-boca', COR_BOCA, 0.9)
    baixo = _material('coruja-3d-bico', (*[float(x) for x in cor_bico[:3]], 1.0), 0.35)
    rosto = _objeto('CorujaRosto', bm, arm, [boca, baixo], sup.mw)
    rosto.shape_key_add(name='Basis')
    k = rosto.shape_key_add(name='bico_abre', from_mix=False)
    k.value = 0.0
    for i, (p_aberto, _) in enumerate(pares):
        k.data[i].co = inv @ p_aberto
    escondidos = sum(_dentro(sup.bvh, p) for _, p in pares)
    print(f'BICO {len(pesos)} vértices no bico de cima ({len(cheios)} cheios, ponta z={ponta.z:.3f}); '
          f'bico de baixo {len(pares)} vértices, {escondidos} dentro do bico fechado')
    return rosto
