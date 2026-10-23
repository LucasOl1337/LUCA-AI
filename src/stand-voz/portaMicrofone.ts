/** Na corrida, só o gesto PTT deixa PCM entrar. Fora dela preserva voz livre. */
let simulacao = false;
let pressionado = false;
export function configurarPortaMicrofone(naSimulacao: boolean, segurando: boolean) {
  simulacao = naSimulacao;
  pressionado = segurando;
}
export function microfonePermitido() { return !simulacao || pressionado; }
