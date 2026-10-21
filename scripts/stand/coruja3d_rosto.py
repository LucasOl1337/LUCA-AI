"""Pálpebras e bico inferior da Coruja 3D, como malha extra com shape keys.

Importado por `package-coruja-3d.py` depois do decimate. O rig avian do Tripo
não tem osso de bico nem de pálpebra, e a malha não tem geometria para isso:
os olhos são pintados na textura do visor e o bico é uma peça só, em gancho.
Deformar a malha original borraria a textura. Por isso esta etapa cria uma
malha pequena à parte (`CorujaRosto`) com o mesmo material e a mesma skin,
100% no osso da cabeça (`tripo::Head_2`), e duas shape keys:

- `piscar`: uma cortina por olho na corda das bordas do olho (o olho é uma concha funda), 1,2 mm à frente e com bojo de 3 mm, na cor lisa do
  visor logo acima do olho (desce como a pena da Coruja A) e uma borda escura
  de cílio. O visor é recortado em várias ilhas do atlas, então a cortina usa
  um texel só: o ponto mais uniforme da faixa acima do olho na base color
  (projetar o UV ponto a ponto puxava trechos de outras ilhas). Em repouso
  ela fica comprimida numa faixa fina 0,8 mm atrás da superfície, escondida.
- `bico_abre`: uma mandíbula inferior (cunha) que em repouso fica dentro do
  bico superior e gira 45° para baixo numa dobradiça atrás. O topo é escuro
  (interior da boca), o resto tem o azul do bico. A mesma chave existe na
  malha principal (`abrir_bico_superior`): só os ~47 vértices do bico de cima
  (azul escuro na textura) sobem 10° pela base, um giro rígido que não estica
  a textura do bico. As penas ficam paradas e, com influência 0, a malha é a
  do #16 byte a byte.

Coordenadas do Blender: frente +X, cima +Z, asa direita em -Y. Contornos dos
olhos medidos por raycast na textura do GLB do #16 (simétricos em |y|).
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

OSSO = 'tripo::Head_2'
# |y| -> (topo, base) do olho em z, com margem; cantos fecham.
CONTORNO_OLHO = [
    (0.040, 0.756, 0.752), (0.050, 0.761, 0.739), (0.060, 0.765, 0.726),
    (0.070, 0.769, 0.721), (0.080, 0.774, 0.720), (0.090, 0.779, 0.721),
    (0.100, 0.782, 0.724), (0.110, 0.784, 0.730), (0.120, 0.783, 0.745),
    (0.128, 0.775, 0.770),
]
LINHAS_PELE = (0.0, 0.2, 0.4, 0.6, 0.8, 0.9)  # fração do topo até a base
FRENTE_M, ATRAS_M, PASSO_REPOUSO_M, BOJO_M = 0.0012, 0.0008, 0.0003, 0.0030
DOBRADICA_X, PONTA_X, MEIA_LARGURA = 0.189, 0.232, 0.015
# O gancho do bico de cima desce até z≈0,634 em x≈0,235: com menos de ~40° a
# mandíbula fica escondida atrás dele na vista de frente do totem.
ABERTURA_GRAUS = 45.0
# Bico de cima (malha principal): caixa (x mínimo, |y| máximo, z mínimo, z máximo)
# onde procurar o azul escuro do bico, e a dobradiça na base de cima, atrás.
CAIXA_BICO = (0.165, 0.05, 0.60, 0.745)
DOBRADICA_SUPERIOR = (0.198, 0.0, 0.728)
SUBIDA_GRAUS = 10.0
JANELA_PX = 4  # meia janela (px) para medir o quanto o texel é liso


class Superficie:
    """Raycast na malha decimada em repouso (mundo), com UV do ponto atingido."""

    def __init__(self, malha):
        me = malha.data
        self.mw = malha.matrix_world.copy()
        self.vs = [self.mw @ v.co for v in me.vertices]
        me.calc_loop_triangles()
        self.tris = list(me.loop_triangles)
        self.bvh = BVHTree.FromPolygons(self.vs, [t.vertices[:] for t in self.tris])
        self.uv = me.uv_layers.active.data

    def frente(self, y, z):
        """Ponto mais à frente (+X) em (y, z): (ponto, normal, uv)."""
        p, n, i, _ = self.bvh.ray_cast(Vector((1.0, y, z)), Vector((-1.0, 0.0, 0.0)))
        if p is None:
            raise RuntimeError(f'sem superfície em y={y:.3f} z={z:.3f}')
        return p, (n if n.x > 0 else -n), self.uv_em(p, i)

    def de_baixo(self, x, y, z0=0.55):
        p, _, i, _ = self.bvh.ray_cast(Vector((x, y, z0)), Vector((0.0, 0.0, 1.0)))
        if p is None:
            raise RuntimeError(f'sem bico em x={x:.3f} y={y:.3f}')
        return p

    def textura_base(self, malha):
        nt = malha.material_slots[0].material.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        img = bsdf.inputs['Base Color'].links[0].from_node.image
        w, h = img.size
        self.base = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., :3]

    def aspereza(self, uv):
        h, w, _ = self.base.shape
        x = min(max(int(uv[0] % 1 * w), JANELA_PX), w - JANELA_PX - 1)
        y = min(max(int(uv[1] % 1 * h), JANELA_PX), h - JANELA_PX - 1)
        bloco = self.base[y - JANELA_PX:y + JANELA_PX + 1, x - JANELA_PX:x + JANELA_PX + 1]
        return float(bloco.reshape(-1, 3).std(0).max())

    def uv_em(self, p, i):
        t = self.tris[i]
        a, b, c = (self.vs[k] for k in t.vertices)
        uvs = [Vector((*self.uv[l].uv, 0.0)) for l in t.loops]
        u = barycentric_transform(p, a, b, c, *uvs)
        return (u.x, u.y)


def _contorno(ay):
    ys = [c[0] for c in CONTORNO_OLHO]
    return float(np.interp(ay, ys, [c[1] for c in CONTORNO_OLHO])), float(np.interp(ay, ys, [c[2] for c in CONTORNO_OLHO]))


class Construtor:
    """Acumula vértices (repouso, aberto, uv por canto) e faces quadradas."""

    def __init__(self):
        self.base, self.chaves, self.faces = [], {'piscar': [], 'bico_abre': []}, []

    def vertice(self, repouso, **abertos):
        self.base.append(Vector(repouso))
        for nome, lista in self.chaves.items():
            lista.append(Vector(abertos.get(nome, repouso)))
        return len(self.base) - 1

    def grade(self, ids, uvs):
        for r in range(len(ids) - 1):
            for c in range(len(ids[r]) - 1):
                quad = (ids[r][c], ids[r + 1][c], ids[r + 1][c + 1], ids[r][c + 1])
                self.faces.append((quad, [uvs[r][c], uvs[r + 1][c], uvs[r + 1][c + 1], uvs[r][c + 1]]))


def _uv_visor(sup, lado):
    """Texel mais liso do visor numa faixa de 3 a 12 mm acima do olho."""
    candidatos = []
    for ay, topo, _ in CONTORNO_OLHO[2:-1]:
        for dz in (0.003, 0.006, 0.009, 0.012):
            _, _, uv = sup.frente(lado * ay, topo + dz)
            candidatos.append((sup.aspereza(uv), uv))
    return min(candidatos)[1]


def _palpebra(cons, sup, lado, uv_escuro):
    """Cortina de um olho. lado: -1 olho na asa direita (y<0), +1 na esquerda."""
    colunas = np.linspace(CONTORNO_OLHO[0][0], CONTORNO_OLHO[-1][0], 13)
    uv_pele = _uv_visor(sup, lado)
    linhas = list(LINHAS_PELE) + [1.0]
    ids, uvs = [], []
    for t in linhas:
        ids.append([]), uvs.append([])
    for ay in colunas:
        y = lado * ay
        topo, base = _contorno(ay)
        # O olho é uma concha funda no visor: seguir a superfície deixa a pupila
        # furar a cortina. Fechada, ela vai na corda entre a borda de cima e a de
        # baixo, à frente das duas, com um bojo convexo como uma pálpebra.
        p_topo, n_topo, _ = sup.frente(y, topo)
        p_base, n_base, _ = sup.frente(y, base)
        normal = (n_topo + n_base).normalized()
        for r, t in enumerate(linhas):
            bojo = BOJO_M * math.sin(math.pi * t)
            fechado = p_topo.lerp(p_base, t) + normal * (FRENTE_M + bojo)
            q, m, _ = sup.frente(y, topo - PASSO_REPOUSO_M * r)
            aberto_repouso = q - m * ATRAS_M
            ids[r].append(cons.vertice(aberto_repouso, piscar=fechado))
            uvs[r].append(uv_pele)
    pele = len(LINHAS_PELE)
    # Cílio: faixa escura das duas últimas linhas, com vértices próprios (UV separado).
    cilio_ids = [[cons.vertice(cons.base[i], piscar=cons.chaves['piscar'][i]) for i in ids[pele - 1]], ids[pele]]
    cilio_uvs = [[uv_escuro] * len(colunas)] * 2
    pele_ids, pele_uvs = ids[:pele], uvs[:pele]
    if lado < 0:  # colunas andam para -Y: inverte para a frente das faces apontar para +X
        pele_ids = [list(reversed(l)) for l in pele_ids]
        pele_uvs = [list(reversed(l)) for l in pele_uvs]
        cilio_ids = [list(reversed(l)) for l in cilio_ids]
    cons.grade(pele_ids, pele_uvs)
    cons.grade(cilio_ids, cilio_uvs)


def _mandibula(cons, sup, uv_bico, uv_escuro):
    """Cunha sob o bico: fundo e laterais azuis, topo escuro; gira na dobradiça."""
    us = np.linspace(0, 1, 7)
    vs = np.linspace(-1, 1, 7)
    z_dob = sup.de_baixo(DOBRADICA_X, 0.0).z + 0.002
    giro = (Matrix.Translation((DOBRADICA_X, 0, z_dob)) @ Matrix.Rotation(math.radians(ABERTURA_GRAUS), 4, 'Y')
            @ Matrix.Translation((-DOBRADICA_X, 0, -z_dob)))
    fundo, topo = [], []
    for u in us:
        x = DOBRADICA_X + u * (PONTA_X - DOBRADICA_X)
        lf, lt = [], []
        for v in vs:
            y = v * MEIA_LARGURA * (1 - 0.6 * u * u)
            zb = sup.de_baixo(x, y).z + 0.0012
            espessura = 0.008 * (1 - 0.6 * u)  # cresce para dentro do bico de cima (cabe: ele tem 7–20 cm de altura ali)
            pb, pt = Vector((x, y, zb)), Vector((x, y, zb + espessura))
            lf.append(cons.vertice(pb, bico_abre=giro @ pb))
            lt.append(cons.vertice(pt, bico_abre=giro @ pt))
        fundo.append(lf), topo.append(lt)
    n_u, n_v = len(us), len(vs)
    cons.grade([list(reversed(l)) for l in fundo], [[uv_bico] * n_v] * n_u)  # normal para baixo
    cons.grade(topo, [[uv_escuro] * n_v] * n_u)  # normal para cima
    # Laterais e frente: vértices próprios com o azul do bico.
    borda = [(u, 0) for u in range(n_u)] + [(n_u - 1, v) for v in range(1, n_v)] + \
        [(u, n_v - 1) for u in range(n_u - 2, -1, -1)]
    dup = lambda i: cons.vertice(cons.base[i], bico_abre=cons.chaves['bico_abre'][i])
    anel_f = [dup(fundo[u][v]) for u, v in borda]
    anel_t = [dup(topo[u][v]) for u, v in borda]
    cons.grade([anel_t, anel_f], [[uv_bico] * len(borda)] * 2)


def _azul_escuro(cor):
    return cor[2] - cor[0] > 0.28 and cor[0] < 0.42


def abrir_bico_superior(malha, sup):
    """Shape key `bico_abre` na malha principal: o bico de cima sobe pela base.

    Só os vértices do bico (mais da metade dos cantos no azul escuro da
    textura, numa caixa em volta dele) giram; penas vizinhas ficam paradas.
    Peso 1 nos vértices do bico e 0 no resto: com influência 0 a malha é a
    mesma do #16. Devolve quantos vértices se movem.
    """
    me = malha.data
    h, w, _ = sup.base.shape
    uv = me.uv_layers.active.data
    cantos = {}
    for loop in me.loops:
        u, v = uv[loop.index].uv
        cor = sup.base[min(int(v % 1 * h), h - 1), min(int(u % 1 * w), w - 1)]
        cantos.setdefault(loop.vertex_index, []).append(_azul_escuro(cor))
    x0, ay, z0, z1 = CAIXA_BICO
    bico = [i for i, p in enumerate(sup.vs)
            if p.x > x0 and abs(p.y) < ay and z0 < p.z < z1 and np.mean(cantos.get(i, [False])) > 0.5]
    if not bico:
        raise RuntimeError('bico superior não encontrado na textura')
    giro = (Matrix.Translation(DOBRADICA_SUPERIOR) @ Matrix.Rotation(-math.radians(SUBIDA_GRAUS), 4, 'Y')
            @ Matrix.Translation(-Vector(DOBRADICA_SUPERIOR)))
    if not me.shape_keys:
        malha.shape_key_add(name='Basis')
    chave = malha.shape_key_add(name='bico_abre', from_mix=False)
    inv = sup.mw.inverted()
    for i in bico:
        chave.data[i].co = inv @ (giro @ sup.vs[i])
    return len(bico)


def adicionar_rosto(malha, arm):
    sup = Superficie(malha)
    sup.textura_base(malha)
    # Texel escuro (pupila) para cílio e boca; azul do bico na frente do bico.
    _, _, uv_escuro = sup.frente(-0.081, 0.752)
    _, _, uv_bico = sup.frente(0.0, 0.69)
    cons = Construtor()
    _palpebra(cons, sup, -1, uv_escuro)
    _palpebra(cons, sup, +1, uv_escuro)
    _mandibula(cons, sup, uv_bico, uv_escuro)

    inv = sup.mw.inverted()
    me = bpy.data.meshes.new('CorujaRosto')
    bm = bmesh.new()
    vb = [bm.verts.new(inv @ p) for p in cons.base]
    camada = bm.loops.layers.uv.new('UVMap')
    for quad, uvs in cons.faces:
        f = bm.faces.new([vb[i] for i in quad])
        f.smooth = True
        for loop, uv in zip(f.loops, uvs):
            loop[camada].uv = uv
    bm.to_mesh(me)
    bm.free()
    rosto = bpy.data.objects.new('CorujaRosto', me)
    bpy.context.scene.collection.objects.link(rosto)
    rosto.parent = arm
    rosto.matrix_world = sup.mw
    me.materials.append(malha.material_slots[0].material)
    grupo = rosto.vertex_groups.new(name=OSSO)
    grupo.add(range(len(cons.base)), 1.0, 'REPLACE')
    mod = rosto.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    rosto.shape_key_add(name='Basis')
    for nome, pontos in cons.chaves.items():
        chave = rosto.shape_key_add(name=nome, from_mix=False)
        for i, p in enumerate(pontos):
            chave.data[i].co = inv @ p
    n_bico = abrir_bico_superior(malha, sup)
    print(f'ROSTO {len(cons.base)} vértices, {len(cons.faces)} faces, chaves {list(cons.chaves)}; '
          f'bico de cima: {n_bico} vértices na malha principal')
    return rosto
