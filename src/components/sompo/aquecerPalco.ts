import * as THREE from 'three';

/** Camada que nenhuma câmera do palco enxerga (nem a da sombra): o objeto existe, só não é desenhado. */
export const CAMADA_AQUECENDO = 31;
/** Teto de espera por lote: driver sem resposta não deixa objeto sumido. */
export const AQUECIMENTO_MAX_MS = 2500;
/** Quanto de upload de textura cabe num quadro antes de soltar o resto para o próximo. */
export const UPLOAD_POR_QUADRO_MS = 10;

type Desenhavel = THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
interface Lote { objetos: Map<THREE.Object3D, number>; materiais: Set<THREE.Material>; texturas: THREE.Texture[]; desde: number }
interface Programa { isReady?(): boolean; program?: WebGLProgram; name?: string }

const desenhavel = (o: THREE.Object3D) => (o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite;
const materiaisDe = (o: Desenhavel) => (o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []);

function texturasDe(material: THREE.Material) {
  const lista: THREE.Texture[] = [];
  for (const valor of Object.values(material)) {
    const t = valor as THREE.Texture | null;
    if (t?.isTexture && !(t as THREE.Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture) lista.push(t);
  }
  const uniforms = (material as THREE.ShaderMaterial).uniforms;
  if (uniforms) for (const u of Object.values(uniforms)) if ((u?.value as THREE.Texture | null)?.isTexture) lista.push(u.value as THREE.Texture);
  return lista;
}

/**
 * Tira do quadro a compilação de shader e a subida de textura (as travadas da largada).
 *
 * A cada quadro, antes do render: todo mesh com material ainda não liberado sai da
 * camada da câmera, o palco pede os programas ao driver de uma vez (`renderer.compile`,
 * que com KHR_parallel_shader_compile só enfileira o link) e as texturas sobem com
 * orçamento por quadro. O lote volta à cena inteiro quando todos os programas dizem
 * `isReady()` (consulta que não bloqueia). Sem a extensão, não esconde nada: o
 * custo cai no primeiro uso, como antes.
 *
 * Só esconde o que nunca apareceu. Material que muda de programa depois (troca de
 * mapa, sombra do regulador) ou objeto já visto que ganha material novo seguem na
 * tela: sumir com o chão ou a cabine por uns quadros seria pior que o tranco.
 */
export function criarAquecedorDePalco(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, {
  alvoDaCena = () => null as THREE.WebGLRenderTarget | null,
  agora = () => performance.now(),
  aoMudar,
}: { alvoDaCena?: () => THREE.WebGLRenderTarget | null; agora?: () => number; aoMudar?: (aquecendo: number) => void } = {}) {
  const ligado = renderer.extensions.has('KHR_parallel_shader_compile');
  const liberados = new WeakSet<THREE.Material>();
  const emLote = new WeakSet<THREE.Object3D>();
  const mostrados = new WeakSet<THREE.Object3D>();
  const lotes: Lote[] = [];
  const subidas = new WeakSet<THREE.Texture>();
  let avisado = false;

  function pronto(material: THREE.Material) {
    const programa = (renderer.properties.get(material) as { currentProgram?: Programa }).currentProgram;
    if (!programa) return true; // nada compilado para ele (ex.: invisível no compile): o render resolve
    if (programa.isReady && !programa.isReady()) return false;
    // Com checkShaderErrors desligado em produção, o three não lê o log; o link pronto
    // custa só um getProgramParameter. Falha vira um aviso com o nome do material.
    const gl = renderer.getContext();
    if (programa.program && gl.getProgramParameter(programa.program, gl.LINK_STATUS) === false) {
      console.error(`Palco: shader não ligou (${material.name || material.type}, ${programa.name ?? '?'}).`, gl.getProgramInfoLog(programa.program));
    }
    return true;
  }

  function subirTexturas(lote: Lote, prazo: number) {
    while (lote.texturas.length) {
      if (agora() > prazo) return false;
      const textura = lote.texturas.shift()!;
      const imagem = textura.image as { width?: number; complete?: boolean } | null;
      if (subidas.has(textura) || !imagem || imagem.complete === false || !(imagem.width! > 0) || textura.version === 0) continue;
      renderer.initTexture(textura);
      subidas.add(textura);
    }
    return true;
  }

  function soltar(lote: Lote) {
    for (const [objeto, mascara] of lote.objetos) { objeto.layers.mask = mascara; emLote.delete(objeto); mostrados.add(objeto); }
    for (const material of lote.materiais) liberados.add(material);
  }

  return {
    /** Objetos fora da cena agora, esperando programa ou textura. */
    get aquecendo() { return lotes.reduce((n, l) => n + l.objetos.size, 0); },
    quadro() {
      if (!ligado) return;
      const novo: Lote = { objetos: new Map(), materiais: new Set(), texturas: [], desde: agora() };
      scene.traverse((objeto) => {
        if (!desenhavel(objeto) || emLote.has(objeto) || mostrados.has(objeto)) return;
        const materiais = materiaisDe(objeto as Desenhavel);
        if (!materiais.length || materiais.every((m) => liberados.has(m))) { mostrados.add(objeto); return; }
        novo.objetos.set(objeto, objeto.layers.mask);
        for (const m of materiais) if (!liberados.has(m)) novo.materiais.add(m);
      });
      const antes = this.aquecendo;
      if (novo.objetos.size) {
        // O programa depende do alvo (tone mapping e espaço de cor do pós): compila para o mesmo do render.
        const alvoAnterior = renderer.getRenderTarget();
        renderer.setRenderTarget(alvoDaCena());
        try { renderer.compile(scene, camera); } finally { renderer.setRenderTarget(alvoAnterior); }
        for (const objeto of novo.objetos.keys()) { objeto.layers.set(CAMADA_AQUECENDO); emLote.add(objeto); }
        const vistas = new Set<THREE.Texture>();
        for (const m of novo.materiais) for (const t of texturasDe(m)) if (!vistas.has(t)) { vistas.add(t); novo.texturas.push(t); }
        lotes.push(novo);
      }
      const prazo = agora() + UPLOAD_POR_QUADRO_MS;
      for (let i = 0; i < lotes.length; i += 1) {
        const lote = lotes[i];
        const venceu = agora() - lote.desde > AQUECIMENTO_MAX_MS;
        if (venceu && !avisado) { avisado = true; console.warn('Palco: aquecimento passou do teto; mostra o que tiver.'); }
        const programas = venceu || [...lote.materiais].every(pronto);
        const texturas = venceu || (programas && subirTexturas(lote, prazo));
        if (programas && texturas) { soltar(lote); lotes.splice(i, 1); i -= 1; }
      }
      if (aoMudar && this.aquecendo !== antes) aoMudar(this.aquecendo);
    },
    dispose() {
      for (const lote of lotes) soltar(lote);
      lotes.length = 0;
    },
  };
}
