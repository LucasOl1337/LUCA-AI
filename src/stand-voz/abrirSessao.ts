/**
 * Abre a sessão de voz do stand pelo provedor que o servidor escolheu:
 * `conexao.transporte === 'scribe'` (elevenlabs, padrão) vira `SessaoTurnos`;
 * `'websocket'` (xai, reserva) vira a `SessaoVoz` Realtime.
 */
import { SessaoTurnos, type SessaoServidorTurnos } from './sessaoTurnos';
import { postar, SessaoVoz, type FimSessao, type SessaoDeVoz, type SessaoServidor } from './sessaoVoz';

type RespostaSessao = (SessaoServidor | SessaoServidorTurnos) & { error?: string; motivo?: string };

export async function abrirSessaoDeVoz(aoTerminar: (motivo: FimSessao, detalhe?: string) => void): Promise<SessaoDeVoz | null> {
  let resposta: { status: number; dados: RespostaSessao };
  try {
    resposta = await postar<RespostaSessao>('/api/stand/sessao', {});
  } catch {
    aoTerminar('erro', 'servidor_indisponivel');
    return null;
  }
  const { status, dados } = resposta;
  if (status === 503) { aoTerminar('desligado', dados.motivo || dados.error); return null; }
  if (status !== 200 || !dados.conexao) { aoTerminar('erro', dados.error || `HTTP ${status}`); return null; }
  if (dados.conexao.transporte === 'scribe') {
    const sessao = new SessaoTurnos(aoTerminar);
    void sessao.iniciar(dados as SessaoServidorTurnos);
    return sessao;
  }
  const sessao = new SessaoVoz(aoTerminar);
  void sessao.iniciar(dados as SessaoServidor);
  return sessao;
}
