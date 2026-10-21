/**
 * Abre a sessão de voz do stand pelo provedor que o servidor escolheu:
 * `conexao.transporte === 'scribe'` (elevenlabs, padrão) vira `SessaoTurnos`;
 * `'websocket'` (xai, reserva) vira a `SessaoVoz` Realtime.
 */
import { SessaoTurnos, type Emprestimo, type SessaoServidorTurnos } from './sessaoTurnos';
import { lerVozEscolhida } from './vozEscolhida';
import { postar, SessaoVoz, type FimSessao, type SessaoDeVoz, type SessaoServidor } from './sessaoVoz';

type RespostaSessao = (SessaoServidor | SessaoServidorTurnos) & { error?: string; motivo?: string };

/**
 * `emprestimo`: microfone já aberto pela escuta. A sessão em turnos o usa sem
 * saudação (a pessoa já está falando); a Grok (reserva) abre o dela.
 */
export async function abrirSessaoDeVoz(aoTerminar: (motivo: FimSessao, detalhe?: string) => void, emprestimo?: Emprestimo): Promise<SessaoDeVoz | null> {
  let resposta: { status: number; dados: RespostaSessao };
  try {
    // A origem só entra na contagem do dia no servidor (despertares e falsos).
    // A voz é a escolhida no Totem; o servidor confere na lista branca.
    resposta = await postar<RespostaSessao>('/api/stand/sessao', { origem: emprestimo && !emprestimo.saudar ? 'escuta' : 'toque', voz: lerVozEscolhida() });
  } catch {
    aoTerminar('erro', 'servidor_indisponivel');
    return null;
  }
  const { status, dados } = resposta;
  if (status === 503) { aoTerminar('desligado', dados.motivo || dados.error); return null; }
  if (status !== 200 || !dados.conexao) { aoTerminar('erro', dados.error || `HTTP ${status}`); return null; }
  if (dados.conexao.transporte === 'scribe') {
    const sessao = new SessaoTurnos(aoTerminar);
    void sessao.iniciar(dados as SessaoServidorTurnos, emprestimo);
    return sessao;
  }
  const sessao = new SessaoVoz(aoTerminar);
  void sessao.iniciar(dados as SessaoServidor);
  return sessao;
}
