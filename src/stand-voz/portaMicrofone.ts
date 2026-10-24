/** Na corrida, só o gesto PTT deixa PCM entrar. Fora dela preserva voz livre. */
let simulacao = false;
let pressionado = false;
export function configurarPortaMicrofone(naSimulacao: boolean, segurando: boolean) {
  simulacao = naSimulacao;
  pressionado = segurando;
}
export function microfonePermitido() { return !simulacao || pressionado; }

/**
 * PTT no Totem inteiro (Lucas, 24/10, feira com música e gente falando em volta):
 * só L1 apertado deixa o áudio sair, e o microfone é o do DualSense, perto da
 * boca. Liga em `/stand?ptt=1` ou no /totem e fica guardado no quiosque;
 * `?ptt=0` desliga.
 */
export const CHAVE_PTT = 'luca:totem:ptt';

export function pttDoTotem(busca = typeof window === 'undefined' ? '' : window.location.search): boolean {
  const pedido = new URLSearchParams(busca).get('ptt');
  if (pedido === '1' || pedido === '0') {
    guardarPtt(pedido === '1');
    return pedido === '1';
  }
  try { return localStorage.getItem(CHAVE_PTT) === '1'; } catch { return false; }
}

export function guardarPtt(ligado: boolean): void {
  try { localStorage.setItem(CHAVE_PTT, ligado ? '1' : '0'); } catch { /* quiosque sem armazenamento: vale a URL */ }
}

/** Microfone do DualSense (só no cabo USB; pelo Bluetooth o PC não recebe o áudio dele). */
export const MICROFONE_DO_CONTROLE = /dualsense|wireless controller|sony interactive/i;

export function microfoneDoControle(dispositivos: readonly Pick<MediaDeviceInfo, 'kind' | 'label' | 'deviceId'>[]): string | null {
  // O Chrome no Windows repete o padrão como "default"/"communications": prefere o id do aparelho.
  const doControle = dispositivos.filter((d) => d.kind === 'audioinput' && MICROFONE_DO_CONTROLE.test(d.label));
  return (doControle.find((d) => d.deviceId !== 'default' && d.deviceId !== 'communications') ?? doControle[0])?.deviceId ?? null;
}

/** Botões que podem virar o PTT: nenhum deles dirige a Simulação nem troca de modo. */
export const BOTOES_PTT = [
  { botao: 4, nome: 'L1' },
  { botao: 5, nome: 'R1' },
  { botao: 10, nome: 'L3' },
  { botao: 11, nome: 'R3' },
] as const;
export const CHAVE_BOTAO_PTT = 'luca:totem:ptt-botao';

export function botaoPtt(): number {
  try {
    const n = Number(localStorage.getItem(CHAVE_BOTAO_PTT));
    return BOTOES_PTT.some((b) => b.botao === n) ? n : BOTOES_PTT[0].botao;
  } catch { return BOTOES_PTT[0].botao; }
}
export function guardarBotaoPtt(botao: number): void {
  try { localStorage.setItem(CHAVE_BOTAO_PTT, String(botao)); } catch { /* sem armazenamento: fica o L1 */ }
}
export function nomeBotaoPtt(botao = botaoPtt()): string {
  return BOTOES_PTT.find((b) => b.botao === botao)?.nome ?? 'L1';
}

/** Microfone escolhido no /totem (`deviceId`); vazio é automático: DualSense no PTT, senão o padrão. */
export const CHAVE_MICROFONE = 'luca:totem:microfone';
export function microfoneEscolhido(): string {
  try { return localStorage.getItem(CHAVE_MICROFONE) ?? ''; } catch { return ''; }
}
export function guardarMicrofone(id: string): void {
  try { localStorage.setItem(CHAVE_MICROFONE, id); } catch { /* sem armazenamento: automático */ }
}
