// Gameplay ao vivo (inventário #3): o totem manda o retrato do gameplay pelo
// /ws e o tablet do operador, logado na mesma conta, recebe. Só um tipo de
// mensagem entra; o retrato é remontado campo a campo (nunca repassa o cru),
// com teto de tamanho e de taxa por socket. Nada é gravado: fica só o último
// retrato de cada conta na memória, para o tablet que abre depois.

export const TIPO_RETRATO = 'gameplay:retrato';
export const RETRATO_MAX_BYTES = 2048;
/** ≤5 Hz por socket; o excesso é descartado sem fechar a conexão. */
export const RETRATO_INTERVALO_MIN_MS = 200;
/** Quem conecta depois recebe o último retrato se ele tiver até 60 s. */
export const RETRATO_RECENTE_MS = 60_000;

const FASES = new Set(['pronto', 'dirigindo', 'fim']);

const numero = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined);
const booleano = (v) => (typeof v === 'boolean' ? v : undefined);
const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/**
 * O /ws antes só lia; agora aceita escrita. Só escreve quem abriu a conexão
 * da própria origem (mesma regra do `sameOriginRequest` do auth.js), para
 * página de outro site não injetar retrato falso no tablet.
 */
export function conexaoDaMesmaOrigem(headers = {}) {
  if (String(headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return false;
  const origem = String(headers.origin || '').trim();
  if (!origem) return true;
  const encaminhado = String(headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = encaminhado && headers['cf-ray'] ? encaminhado : String(headers.host || '');
  try { return new URL(origem).host === host; } catch { return false; }
}

/** Remonta o EstadoGameplay (versao 1) só com os campos conhecidos; `null` se faltar ou sobrar tipo. */
export function normalizarRetrato(bruto) {
  const e = objeto(bruto);
  const m = objeto(e.maquina), c = objeto(e.comandos), s = objeto(e.sensor), a = objeto(e.atitude);
  const estado = {
    versao: 1,
    fase: FASES.has(e.fase) ? e.fase : undefined,
    tempoMs: numero(e.tempoMs, 0, 86_400_000),
    maquina: {
      x: numero(m.x, -5000, 5000),
      z: numero(m.z, -5000, 5000),
      rumoGraus: numero(m.rumoGraus, -36_000, 36_000),
      velocidadeKph: numero(m.velocidadeKph, 0, 200),
      re: booleano(m.re),
    },
    comandos: { esterco: numero(c.esterco, -1, 1), acelerador: numero(c.acelerador, 0, 1), freio: numero(c.freio, 0, 1) },
    sensor: { distanciaCm: numero(s.distanciaCm, 0, 1000), eco: booleano(s.eco), alerta: booleano(s.alerta) },
    atitude: { rolagemGraus: numero(a.rolagemGraus, -180, 180), arfagemGraus: numero(a.arfagemGraus, -180, 180) },
    contato: booleano(e.contato),
    tetoKph: numero(e.tetoKph, 0, 200),
  };
  const faltou = (o) => Object.values(o).some((v) => v === undefined || (v && typeof v === 'object' && faltou(v)));
  return faltou(estado) ? null : estado;
}

/**
 * Estado do repasse de um servidor. `receber` devolve o motivo para log e
 * teste: 'repassado', ou 'descartado:<motivo>'.
 */
export function criarGameplayAoVivo({ agora = Date.now } = {}) {
  const ultimos = new Map();
  const ultimoEnvio = new WeakMap();

  // `idadeMs` em vez da hora do servidor: o tablet não depende do próprio relógio.
  const enviar = (socket, ultimo) => {
    if (socket.readyState !== 1) return;
    socket.send(JSON.stringify({ kind: TIPO_RETRATO, estado: ultimo.estado, idadeMs: Math.max(0, agora() - ultimo.recebidoEm) }));
  };

  return {
    receber(socket, dados, { isBinary = false, clientes = [] } = {}) {
      const userId = socket.userId;
      if (!userId) return 'descartado:sem-conta';
      if (socket.mesmaOrigem === false) return 'descartado:origem';
      if (isBinary) return 'descartado:binario';
      const tamanho = typeof dados === 'string' ? Buffer.byteLength(dados) : dados?.length ?? Infinity;
      if (tamanho > RETRATO_MAX_BYTES) return 'descartado:tamanho';
      const instante = agora();
      const anterior = ultimoEnvio.get(socket);
      if (anterior !== undefined && instante - anterior < RETRATO_INTERVALO_MIN_MS) return 'descartado:taxa';
      // Toda mensagem gasta a vaga, válida ou não: lixo em rajada também para no teto.
      ultimoEnvio.set(socket, instante);
      let mensagem;
      try { mensagem = JSON.parse(String(dados)); } catch { return 'descartado:json'; }
      if (objeto(mensagem).kind !== TIPO_RETRATO) return 'descartado:tipo';
      const estado = normalizarRetrato(mensagem.estado);
      if (!estado) return 'descartado:formato';
      const ultimo = { estado, recebidoEm: instante };
      ultimos.set(userId, ultimo);
      for (const outro of clientes) {
        if (outro !== socket && outro.userId === userId) enviar(outro, ultimo);
      }
      return 'repassado';
    },
    /** Tablet que abre depois do totem já começa com o último retrato da conta. */
    aoConectar(socket) {
      const ultimo = ultimos.get(socket.userId);
      if (ultimo && agora() - ultimo.recebidoEm <= RETRATO_RECENTE_MS) enviar(socket, ultimo);
    },
  };
}
