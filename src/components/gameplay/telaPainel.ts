/**
 * Painel da cabine em textura, para a tela `tela-luca-ai` do console da Visual.
 * Mesma regra do painel HTML (`alertaCabine`): distância na cor da faixa,
 * faixa vermelha de alerta, km/h, inclinação e selo SIMULADO sempre à vista.
 * Redesenha só quando o que aparece muda, não a cada quadro.
 *
 * Uso na Visual: `const tela = criarTelaPainel()`; `material.map = tela.textura`
 * (MeshBasicMaterial, toneMapped=false); no `quadro()`, `tela.desenhar(dados.estado)`;
 * no `desmontar()`, `tela.descartar()`. Desligado por padrão: só existe se a Visual chamar.
 */
import * as THREE from 'three';
import { alertaCabine, type FaixaCabine } from './alertaCabine';
import type { EstadoGameplay } from './estadoGameplay';

export const TELA_LARGURA = 512;
export const TELA_ALTURA = 320;

/** As cores do `painelCabine.css`, para a tela e o HTML não divergirem. */
export const CORES_TELA = {
  livre: '#4fbf7a', atencao: '#f2c14e', perigo: '#e5483b',
  fundo: '#07110e', texto: '#edf3ed', rotulo: '#b9cdbf', alerta: '#c4291f', selo: '#e8c96a', seloTexto: '#1d1a0d',
} as const;

/** O que a tela mostra; duas vistas iguais desenham a mesma coisa. */
export interface VistaTela {
  faixa: FaixaCabine;
  distanciaTexto: string;
  rotulo: string;
  velocidadeTexto: string;
  rotuloAlerta: string;
  inclinacaoGraus: number | null;
}

export function vistaTela(estado: EstadoGameplay): VistaTela {
  const painel = alertaCabine(estado);
  return {
    faixa: painel.faixa,
    distanciaTexto: painel.distanciaTexto,
    rotulo: painel.rotulo,
    velocidadeTexto: painel.velocidadeTexto,
    rotuloAlerta: painel.alerta ? painel.rotuloAlerta : '',
    inclinacaoGraus: painel.inclinacao.ligada ? painel.inclinacao.graus : null,
  };
}

const mesmaVista = (a: VistaTela | null, b: VistaTela) => a !== null
  && a.faixa === b.faixa && a.distanciaTexto === b.distanciaTexto && a.rotulo === b.rotulo
  && a.velocidadeTexto === b.velocidadeTexto && a.rotuloAlerta === b.rotuloAlerta && a.inclinacaoGraus === b.inclinacaoGraus;

/** O pedaço do CanvasRenderingContext2D que a tela usa; o teste passa um falso. */
export type ContextoTela = Pick<CanvasRenderingContext2D,
  'fillStyle' | 'strokeStyle' | 'lineWidth' | 'font' | 'textAlign' | 'textBaseline'
  | 'fillRect' | 'strokeRect' | 'fillText'>;

const FONTE = 'system-ui, "Segoe UI", sans-serif';

/** Desenha a vista inteira no contexto, de fundo a frente. Puro em relação ao estado. */
export function desenharVista(ctx: ContextoTela, vista: VistaTela, largura = TELA_LARGURA, altura = TELA_ALTURA) {
  const u = altura / 320;
  const cor = CORES_TELA[vista.faixa];
  ctx.fillStyle = CORES_TELA.fundo;
  ctx.fillRect(0, 0, largura, altura);
  ctx.strokeStyle = cor;
  ctx.lineWidth = 6 * u;
  ctx.strokeRect(3 * u, 3 * u, largura - 6 * u, altura - 6 * u);

  // Selo SIMULADO no alto à esquerda e marca à direita, sempre.
  ctx.fillStyle = CORES_TELA.selo;
  ctx.fillRect(16 * u, 16 * u, 120 * u, 28 * u);
  ctx.fillStyle = CORES_TELA.seloTexto;
  ctx.font = `800 ${16 * u}px ${FONTE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SIMULADO', 76 * u, 30 * u);
  ctx.fillStyle = CORES_TELA.rotulo;
  ctx.font = `700 ${16 * u}px ${FONTE}`;
  ctx.textAlign = 'right';
  ctx.fillText('LUCA-AI', largura - 18 * u, 30 * u);

  // Faixa vermelha de alerta logo abaixo do selo.
  let topo = 56 * u;
  if (vista.rotuloAlerta) {
    ctx.fillStyle = CORES_TELA.alerta;
    ctx.fillRect(12 * u, topo, largura - 24 * u, 40 * u);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${22 * u}px ${FONTE}`;
    ctx.textAlign = 'center';
    ctx.fillText(vista.rotuloAlerta, largura / 2, topo + 20 * u);
    topo += 48 * u;
  }

  // Distância do sensor frontal, grande, na cor da faixa.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = CORES_TELA.rotulo;
  ctx.font = `600 ${15 * u}px ${FONTE}`;
  ctx.fillText('SENSOR FRONTAL', 24 * u, topo + 22 * u);
  ctx.fillStyle = cor;
  ctx.font = `800 ${(vista.rotuloAlerta ? 72 : 96) * u}px ${FONTE}`;
  ctx.fillText(vista.distanciaTexto, 22 * u, topo + (vista.rotuloAlerta ? 94 : 116) * u);
  ctx.fillStyle = CORES_TELA.texto;
  ctx.font = `650 ${20 * u}px ${FONTE}`;
  ctx.fillText(vista.rotulo, 24 * u, altura - 24 * u);

  // Coluna da direita: velocidade e, se houver risco, inclinação.
  ctx.textAlign = 'right';
  ctx.fillStyle = CORES_TELA.rotulo;
  ctx.font = `600 ${15 * u}px ${FONTE}`;
  ctx.fillText('VELOCIDADE', largura - 24 * u, topo + 22 * u);
  ctx.fillStyle = CORES_TELA.texto;
  ctx.font = `800 ${30 * u}px ${FONTE}`;
  ctx.fillText(vista.velocidadeTexto, largura - 24 * u, topo + 56 * u);
  if (vista.inclinacaoGraus !== null) {
    ctx.fillStyle = CORES_TELA.rotulo;
    ctx.font = `600 ${15 * u}px ${FONTE}`;
    ctx.fillText('INCLINAÇÃO', largura - 24 * u, topo + 86 * u);
    ctx.fillStyle = CORES_TELA.perigo;
    ctx.font = `800 ${30 * u}px ${FONTE}`;
    ctx.fillText(`${vista.inclinacaoGraus}°`, largura - 24 * u, topo + 120 * u);
  }
}

export interface TelaPainel {
  textura: THREE.CanvasTexture;
  /** Redesenha se o que aparece mudou; devolve true quando redesenhou. */
  desenhar(estado: EstadoGameplay): boolean;
  descartar(): void;
}

interface CanvasTela { width: number; height: number; getContext(tipo: '2d'): ContextoTela | null }

function novoCanvas(largura: number, altura: number): CanvasTela {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    return canvas as unknown as CanvasTela;
  }
  return new OffscreenCanvas(largura, altura) as unknown as CanvasTela;
}

export function criarTelaPainel({ largura = TELA_LARGURA, altura = TELA_ALTURA, canvas }: { largura?: number; altura?: number; canvas?: CanvasTela } = {}): TelaPainel {
  const alvo = canvas ?? novoCanvas(largura, altura);
  const ctx = alvo.getContext('2d');
  if (!ctx) throw new Error('Tela do painel: canvas sem contexto 2d.');
  const textura = new THREE.CanvasTexture(alvo as unknown as HTMLCanvasElement);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  let ultima: VistaTela | null = null;
  return {
    textura,
    desenhar(estado) {
      const vista = vistaTela(estado);
      if (mesmaVista(ultima, vista)) return false;
      ultima = vista;
      desenharVista(ctx, vista, alvo.width, alvo.height);
      textura.needsUpdate = true;
      return true;
    },
    descartar() {
      textura.dispose();
      ultima = null;
    },
  };
}
