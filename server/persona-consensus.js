export const CONSENSUS_MAX_CYCLES = 5;
export const CONSENSUS_PRESSURE_FROM_CYCLE = 3;

function clip(value, maxChars) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function anonymizeReply(reply) {
  const secrets = [reply?.model, reply?.name, reply?.slug]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  let content = reply?.ok
    ? String(reply.content || '').trim()
    : `FALHA: ${String(reply?.error || 'sem resposta').trim()}`;
  for (const secret of secrets) {
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(new RegExp(escaped, 'gi'), '[identidade removida]');
  }
  return { ok: Boolean(reply?.ok), content };
}

export function participantSeatLabel(index) {
  return String.fromCharCode(65 + Number(index || 0));
}

export function parseConsensusTurn(content) {
  const text = String(content || '');
  let vote = 'hold';
  const voteMatch = text.match(/\b(?:voto|vote)\s*:\s*(converg\w*|dissen\w*|hold)\b/i);
  if (voteMatch) {
    const token = voteMatch[1].toLowerCase();
    vote = token.startsWith('converg') ? 'converge' : token.startsWith('dissen') ? 'dissent' : 'hold';
  } else if (/\b(converjo|concordo com o quadro|voto (?:por )?consenso)\b/i.test(text)) {
    vote = 'converge';
  } else if (/\b(registro dissenso|discordo e mantenho)\b/i.test(text)) {
    vote = 'dissent';
  }

  const stanceMatch = text.match(/\b(?:posicao|posição|stance)\s*:\s*(.+)/i);
  const dissentMatch = text.match(/\b(?:motivo do dissenso|dissentReason)\s*:\s*(.+)/i);
  const stripped = text
    .replace(/\b(?:voto|vote)\s*:\s*\S+/ig, '')
    .replace(/\b(?:posicao|posição|stance)\s*:\s*/ig, '')
    .replace(/\b(?:motivo do dissenso|dissentReason)\s*:\s*/ig, '')
    .trim();

  return {
    vote,
    stance: clip(stanceMatch?.[1] || stripped, 800),
    dissentReason: vote === 'dissent' ? clip(dissentMatch?.[1] || stripped, 400) : '',
  };
}

export function snapshotNegotiationBoard(seats = []) {
  return {
    seats: seats.map((seat) => ({
      label: String(seat?.label || ''),
      vote: seat?.vote === 'converge' || seat?.vote === 'dissent' ? seat.vote : 'hold',
      stance: clip(seat?.stance, 800),
      dissentReason: clip(seat?.dissentReason, 400),
    })),
  };
}

export function boardReachedConsensus(seats = []) {
  if (!Array.isArray(seats) || seats.length === 0) return false;
  return seats.every((seat) => seat?.vote === 'converge');
}

export function formatNegotiationBoard(board = {}) {
  const seats = Array.isArray(board?.seats) ? board.seats : [];
  if (!seats.length) return 'Quadro vazio.';
  return seats.map((seat) => {
    const vote = seat.vote || 'hold';
    const dissent = vote === 'dissent' && seat.dissentReason ? ` | dissenso: ${seat.dissentReason}` : '';
    return `Contribuicao ${seat.label} [${vote}]: ${seat.stance || '(sem posicao)'}${dissent}`;
  }).join('\n');
}

export function buildConsensusTurnPrompt({
  mission,
  personaName,
  personaSlug,
  systemPrompt,
  runtimeModel = '',
  originalReply,
  contributions = [],
  board = {},
  cycle = 1,
  pressure = false,
  conversationContext = '',
}) {
  const name = String(personaName || personaSlug || 'Participante').trim();
  const original = originalReply?.ok
    ? String(originalReply.content || '').trim()
    : `FALHA: ${String(originalReply?.error || 'sem resposta original').trim()}`;
  const anonymous = contributions.map((contribution) => (
    `${String(contribution?.label || 'Contribuicao anonima')}: ${contribution?.ok
      ? String(contribution.content || '').trim()
      : `FALHA: ${String(contribution?.error || contribution?.content || 'sem resposta').trim()}`}`
  )).join('\n\n');
  const history = String(conversationContext || '').trim();
  const historyAppendix = history
    ? `\n\nContexto de turnos anteriores desta conversa (gerado pela bancada — nao e sua resposta anterior):\n${history}`
    : '';
  const pressureBlock = pressure
    ? `A partir deste ciclo, voce DEVE convergir para a posicao majoritaria do quadro OU registrar dissenso em um paragrafo. Nao repita a mesma objecao sem evidencia nova.`
    : `Atualize sua posicao com base no quadro. Voce pode manter, ceder ou divergir — justifique com evidencia.`;

  return {
    name,
    system: `${String(systemPrompt || '').trim() || `Voce e a persona ${name}.`}

---
Motor LLM desta execucao (fonte de verdade do LUCA-AI via 9Router): ${String(runtimeModel || '').trim() || 'nao declarado'}
Voce participa de um consenso round-robin anonimo. Nao tente identificar os outros autores. Responda em pt-BR.
${pressureBlock}
Comece o turno com exatamente estas linhas:
voto: converge|dissent|hold
posicao: <sua posicao atual em uma frase>
motivo do dissenso: <somente se voto for dissent>
Depois entregue a argumentacao (3 a 6 bullets).`,
    user: `Missao original:
${mission}${historyAppendix}

Ciclo ${cycle} de no maximo ${CONSENSUS_MAX_CYCLES}.

Sua resposta original (cega):
${original}

Quadro de negociacao:
${formatNegotiationBoard(board)}

Contribuicoes anonimas atuais:
${anonymous || 'Nenhuma contribuicao anonima utilizavel foi recebida.'}`,
  };
}

export async function runConsensusRounds({
  participantSlugs = [],
  blindReplies = [],
  runTurn,
  maxCycles = CONSENSUS_MAX_CYCLES,
  pressureFrom = CONSENSUS_PRESSURE_FROM_CYCLE,
} = {}) {
  const seats = participantSlugs.map((slug, index) => {
    const blind = blindReplies[index] || { ok: false, slug, error: 'missing_blind_reply' };
    const redacted = anonymizeReply(blind);
    return {
      slug,
      label: participantSeatLabel(index),
      vote: 'hold',
      stance: redacted.content,
      dissentReason: '',
      reply: { ...blind, phase: 'blind' },
    };
  });

  const cycles = [];
  let outcome = 'dissent';
  const cycleLimit = Number.isInteger(maxCycles) && maxCycles > 0
    ? Math.min(maxCycles, CONSENSUS_MAX_CYCLES)
    : CONSENSUS_MAX_CYCLES;

  for (let cycle = 1; cycle <= cycleLimit; cycle += 1) {
    const pressure = cycle >= pressureFrom;
    const cycleReplies = [];
    for (let index = 0; index < seats.length; index += 1) {
      const board = snapshotNegotiationBoard(seats);
      const contributions = seats
        .filter((_, other) => other !== index)
        .map((seat) => ({
          label: `Contribuicao ${seat.label}`,
          ok: true,
          content: seat.stance,
        }));
      const reply = await runTurn({
        slug: seats[index].slug,
        cycle,
        pressure,
        board,
        originalReply: blindReplies[index],
        contributions,
        seatLabel: seats[index].label,
      });
      const parsed = parseConsensusTurn(reply?.ok ? reply.content : '');
      const redacted = anonymizeReply(reply);
      seats[index] = {
        ...seats[index],
        vote: parsed.vote,
        stance: parsed.stance || redacted.content,
        dissentReason: parsed.dissentReason,
        reply: {
          ...reply,
          phase: 'consensus',
          cycle,
          vote: parsed.vote,
        },
      };
      cycleReplies.push(seats[index].reply);
    }
    const board = snapshotNegotiationBoard(seats);
    cycles.push({ cycle, pressure, replies: cycleReplies, board });
    if (boardReachedConsensus(seats)) {
      outcome = 'consensus';
      break;
    }
  }

  return {
    replies: seats.map((seat) => seat.reply),
    cycles,
    board: snapshotNegotiationBoard(seats),
    outcome,
    cycleCount: cycles.length,
  };
}
