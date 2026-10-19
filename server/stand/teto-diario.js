// Teto diário de créditos ElevenLabs do stand (Q5 do grill, 19/10). Conta no
// servidor o que o stand gasta (TTS por caractere, STT por minuto de sessão),
// guarda em `LUCA_DATA_DIR/stand/creditos-dia.json` para sobreviver a restart
// e zera à meia-noite de Brasília.
import fs from 'node:fs';
import path from 'node:path';

export const TETO_DIARIO_PADRAO = 25_000;

/** Data YYYY-MM-DD em Brasília. */
export function diaBrasilia(ms = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

export function tetoDiarioDoEnv(env = process.env) {
  const valor = Number(env.STAND_TETO_DIARIO_CREDITOS);
  return Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : TETO_DIARIO_PADRAO;
}

export function arquivoPadrao(env = process.env) {
  return path.join(env.LUCA_DATA_DIR || path.resolve(process.cwd(), '.luca'), 'stand', 'creditos-dia.json');
}

export function criarTetoDiario({ teto = TETO_DIARIO_PADRAO, arquivo = null, agora = () => Date.now() } = {}) {
  let estado = { dia: diaBrasilia(agora()), creditos: 0 };
  if (arquivo) {
    try {
      const salvo = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      if (typeof salvo?.dia === 'string' && Number.isFinite(salvo.creditos)) estado = { dia: salvo.dia, creditos: salvo.creditos };
    } catch { /* sem arquivo ou ilegível: começa do zero */ }
  }

  function atual() {
    const hoje = diaBrasilia(agora());
    if (estado.dia !== hoje) estado = { dia: hoje, creditos: 0 };
    return estado;
  }

  function salvar() {
    if (!arquivo) return;
    try {
      fs.mkdirSync(path.dirname(arquivo), { recursive: true });
      const temporario = `${arquivo}.${process.pid}.tmp`;
      fs.writeFileSync(temporario, JSON.stringify(estado));
      fs.renameSync(temporario, arquivo);
    } catch (erro) {
      console.warn('[stand] não salvou o contador de créditos:', erro.code || erro.message);
    }
  }

  return {
    teto,
    usados: () => atual().creditos,
    restantes: () => Math.max(0, teto - atual().creditos),
    estourou: () => atual().creditos >= teto,
    somar(creditos) {
      const valor = Number(creditos);
      if (!Number.isFinite(valor) || valor <= 0) return atual().creditos;
      const hoje = atual();
      hoje.creditos = Math.round((hoje.creditos + valor) * 100) / 100;
      salvar();
      return hoje.creditos;
    },
    resumo: () => ({ dia: atual().dia, usados: Math.round(estado.creditos), teto }),
  };
}
