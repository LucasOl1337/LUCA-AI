/**
 * Painel da cabine em textura, para a tela `tela-luca-ai` do console da Visual.
 * Mesma regra do painel HTML (`alertaCabine`), com número dominante, estado curto,
 * velocidade e selo SIMULADO. O HTML mantém os detalhes e a acessibilidade.
 * Redesenha só quando o que aparece muda, não a cada quadro.
 *
 * Uso na Visual: `const tela = criarTelaPainel()`; `material.map = tela.textura`
 * (MeshBasicMaterial, toneMapped=false); no `quadro()`, `tela.desenhar(dados.estado)`;
 * no `desmontar()`, `tela.descartar()`. Desligado por padrão: só existe se a Visual chamar.
 */
import * as THREE from 'three';
import { alertaCabine, rotuloInclinacaoCabine, type FaixaCabine } from './alertaCabine';
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
  valorTexto: string;
  estadoTexto: 'LIVRE' | 'ATENÇÃO' | 'FREIE';
  velocidadeTexto: string;
  alerta: boolean;
}

export function vistaTela(estado: EstadoGameplay): VistaTela {
  const painel = alertaCabine(estado);
  // O rótulo escolhido pela fonte única já resolve os riscos simultâneos.
  const inclinacaoDominante = painel.inclinacao.ligada
    && painel.rotuloAlerta === rotuloInclinacaoCabine(painel.inclinacao.graus);
  const alerta = painel.alerta || painel.faixa === 'perigo';
  return {
    faixa: alerta ? 'perigo' : painel.faixa,
    valorTexto: inclinacaoDominante ? `${painel.inclinacao.graus}°` : painel.distanciaTexto,
    estadoTexto: alerta ? 'FREIE' : painel.faixa === 'atencao' ? 'ATENÇÃO' : 'LIVRE',
    velocidadeTexto: painel.velocidadeTexto,
    alerta,
  };
}

const mesmaVista = (a: VistaTela | null, b: VistaTela) => a !== null
  && a.faixa === b.faixa && a.valorTexto === b.valorTexto && a.estadoTexto === b.estadoTexto
  && a.velocidadeTexto === b.velocidadeTexto && a.alerta === b.alerta;

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

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Um único estado curto, sem competir com a medida principal.
  ctx.fillStyle = vista.alerta ? CORES_TELA.alerta : cor;
  ctx.fillRect(12 * u, 12 * u, largura - 24 * u, 58 * u);
  ctx.fillStyle = vista.alerta ? '#ffffff' : CORES_TELA.fundo;
  ctx.font = `800 ${40 * u}px ${FONTE}`;
  ctx.fillText(vista.estadoTexto, largura / 2, 41 * u);

  ctx.fillStyle = cor;
  ctx.font = `800 ${112 * u}px ${FONTE}`;
  ctx.fillText(vista.valorTexto, largura / 2, 152 * u);

  ctx.fillStyle = CORES_TELA.texto;
  ctx.font = `800 ${40 * u}px ${FONTE}`;
  ctx.fillText(vista.velocidadeTexto, largura / 2, 230 * u);

  // Selo permanente, separado da velocidade e do estado.
  ctx.fillStyle = CORES_TELA.selo;
  ctx.fillRect(largura / 2 - 100 * u, 268 * u, 200 * u, 40 * u);
  ctx.fillStyle = CORES_TELA.seloTexto;
  ctx.font = `800 ${30 * u}px ${FONTE}`;
  ctx.fillText('SIMULADO', largura / 2, 288 * u);
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
