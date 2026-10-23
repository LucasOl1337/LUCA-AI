// Janelas técnicas reutilizam a mesma conversa e o mesmo guarda de sessões/hora.
// Nenhuma renovação refaz ações ou aumenta o orçamento de uma janela.
export const RESERVA_TTS_TURNO = 600;
const CONTEXTO_PARES = 4;

export function contextoMinimo(historico) {
  // Só pares concluídos, sem tool_calls soltas no protocolo do modelo.
  const pares = [];
  let pergunta = null;
  for (const mensagem of historico) {
    if (mensagem.role === 'user') pergunta = mensagem;
    if (pergunta && mensagem.role === 'assistant' && !mensagem.tool_calls) {
      pares.push([pergunta, { role: 'assistant', content: String(mensagem.content || '').slice(0, 600) }]);
      pergunta = null;
    }
  }
  return pares.slice(-CONTEXTO_PARES).flat();
}

export function prepararJanela(conversa, { agora, limites, tetoS, permitir, diario }) {
  conversa.janelaEm ??= conversa.criadaEm;
  conversa.eventosJanela ??= 0;
  if (diario()) return { ok: false, causa: 'diario' };
  const precisa = conversa.respostas >= limites.respostas
    || conversa.eventosJanela >= limites.respostas
    || conversa.caracteresTts > limites.caracteres_tts - RESERVA_TTS_TURNO
    || agora - conversa.janelaEm >= tetoS * 1000;
  if (!precisa) return { ok: true, renovada: false };
  // Síncrono: dois pedidos concorrentes nunca consomem a mesma vaga de janela.
  if (!permitir()) return { ok: false, causa: 'hora' };
  conversa.respostas = 0;
  conversa.caracteresTts = 0;
  conversa.eventosJanela = 0;
  conversa.janelaEm = agora;
  conversa.historico = contextoMinimo(conversa.historico);
  conversa.renovacoes = (conversa.renovacoes || 0) + 1;
  return { ok: true, renovada: true };
}

export const TEXTO_PAUSA_HORA = 'Preciso pausar porque chegamos ao limite de uso por hora. Guardei sua pergunta sem executá-la. Quando houver uma vaga, diga continuar para retomá-la.';

export function idTurno(valor) {
  return typeof valor === 'string' && /^[a-zA-Z0-9_:-]{1,100}$/.test(valor) ? valor : null;
}

export function lembrarTurno(conversa, id, estado) {
  if (!id) return;
  conversa.turnosRecebidos ??= new Map();
  conversa.turnosRecebidos.set(id, estado);
  // O número de pedidos de uma conversa também é limitado pelo guarda/hora.
  while (conversa.turnosRecebidos.size > 240) conversa.turnosRecebidos.delete(conversa.turnosRecebidos.keys().next().value);
}
