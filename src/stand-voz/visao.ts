/**
 * O que a coruja "vê" pela webcam do Totem (Lucas, 21/10). É pouco e de
 * propósito: o detector de rosto roda no navegador (o mesmo Face Landmarker da
 * /sonolencia) e daqui só sai se há um rosto de frente para o totem agora.
 * Nenhuma imagem, foto, descrição de aparência ou identidade vai ao servidor;
 * o cérebro recebe uma linha de texto rotulada como dado (`Câmera do totem:`).
 *
 * Histerese: o rosto precisa aparecer por `ROSTO_MS` para contar e sumir por
 * `AUSENCIA_MS` para deixar de contar (quem vira a cabeça um instante não
 * "sai" do totem).
 */
export type Presenca = 'desconhecida' | 'rosto' | 'ninguem';

export const ROSTO_MS = 1000;
export const AUSENCIA_MS = 3000;

export interface DetectorPresenca {
  /** Uma leitura do detector (`temRosto` = havia rosto no frame). Devolve a presença atual. */
  observar(temRosto: boolean, agora: number): Presenca;
  /** Câmera parou: volta a `desconhecida`. */
  zerar(): void;
  ler(): Presenca;
}

export function criarDetectorPresenca({ rostoMs = ROSTO_MS, ausenciaMs = AUSENCIA_MS } = {}): DetectorPresenca {
  let atual: Presenca = 'desconhecida';
  /** Desde quando o frame diz o contrário do estado atual (`null` = concorda). */
  let desde: number | null = null;
  let ultimoVisto: boolean | null = null;
  return {
    observar(temRosto, agora) {
      if (ultimoVisto !== temRosto) { desde = agora; ultimoVisto = temRosto; }
      const alvo: Presenca = temRosto ? 'rosto' : 'ninguem';
      if (alvo === atual) return atual;
      const espera = temRosto ? rostoMs : atual === 'desconhecida' ? rostoMs : ausenciaMs;
      if (desde !== null && agora - desde >= espera) atual = alvo;
      return atual;
    },
    zerar() { atual = 'desconhecida'; desde = null; ultimoVisto = null; },
    ler: () => atual,
  };
}

export type FaseCameraTotem = 'desligada' | 'abrindo' | 'ligada' | 'pausada' | 'erro';

/** Linha curta que vai ao cérebro junto de cada pergunta. */
export function linhaCamera(fase: FaseCameraTotem, presenca: Presenca): string {
  if (fase !== 'ligada') return 'webcam desligada agora; a coruja não está vendo ninguém.';
  if (presenca === 'rosto') return 'há uma pessoa de frente para o totem (rosto detectado agora).';
  if (presenca === 'ninguem') return 'nenhum rosto de frente para o totem agora (a pessoa pode estar de lado ou afastada).';
  return 'webcam ligada, detector de rosto ainda começando.';
}

/**
 * Última linha da câmera, escrita pelo /stand (`useCameraTotem`) e lida pela
 * sessão de voz a cada pergunta. Vazia fora do Totem (nada vai ao cérebro).
 */
let linhaAtual = '';
export const visaoTotem = {
  definir(linha: string) { linhaAtual = linha; },
  ler: () => linhaAtual,
};
