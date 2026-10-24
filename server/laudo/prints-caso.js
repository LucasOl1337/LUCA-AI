// Prints da corrida (screenshots do momento crítico) guardados ao lado do caso do Laboratório.
// Chegam junto do caso (`body.prints`, fora do hash do conteúdo) e só servem ao laudo em PDF:
// não entram no prompt dos agentes. JPEG validado pelos bytes; no máximo 4 por caso.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { dimensoesJpeg } from './pdf-simples.js';

export const MAX_PRINTS = 4;
const MAX_BYTES = 400 * 1024;

/** Valida `body.prints` e devolve [{ buffer, elapsedMs, rotulo, momento }]. Erro lança com a mensagem do campo. */
export function lerPrints(raw, erro) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_PRINTS) throw erro(`Prints: envie até ${MAX_PRINTS} imagens.`);
  return raw.map((print, i) => {
    const match = typeof print?.dataUrl === 'string' && print.dataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw erro(`Print ${i + 1}: use data:image/jpeg;base64.`);
    const buffer = Buffer.from(match[1], 'base64');
    const dim = dimensoesJpeg(buffer);
    if (!dim || buffer.length > MAX_BYTES || dim.largura > 1920 || dim.altura > 1920) throw erro(`Print ${i + 1}: JPEG inválido ou acima de 400 KB / 1920 px.`);
    if (!Number.isFinite(print.elapsedMs) || print.elapsedMs < 0) throw erro(`Print ${i + 1}: informe elapsedMs (ms desde o início).`);
    const rotulo = typeof print.rotulo === 'string' ? print.rotulo.trim().slice(0, 80) : '';
    const momento = ['desfecho', 'aviso'].includes(print.momento) ? print.momento : 'aviso';
    return { buffer, elapsedMs: Math.round(print.elapsedMs), rotulo, momento };
  });
}

/** Grava os prints em `<dir>/<caseId>.prints/` e devolve os metadados para o registro do caso. */
export function gravarPrints(directory, caseId, prints) {
  if (!prints.length) return [];
  const pasta = path.join(directory, `${caseId}.prints`);
  fs.mkdirSync(pasta, { recursive: true });
  return prints.map((print, i) => {
    const arquivo = `${i + 1}.jpg`;
    const temporario = path.join(pasta, `${arquivo}.${randomUUID()}.tmp`);
    fs.writeFileSync(temporario, print.buffer, { mode: 0o600 });
    fs.renameSync(temporario, path.join(pasta, arquivo));
    return { arquivo, elapsedMs: print.elapsedMs, rotulo: print.rotulo, momento: print.momento, bytes: print.buffer.length };
  });
}

/** Print principal do laudo: o do desfecho (batida, atolou, tombou); senão o mais perto do instante crítico. */
export function escolherPrint(directory, record, elapsedMs) {
  const lista = Array.isArray(record.prints) ? record.prints : [];
  if (!lista.length) return null;
  const desfecho = lista.find((p) => p.momento === 'desfecho');
  const alvo = desfecho ?? [...lista].sort((a, b) => Math.abs(a.elapsedMs - (elapsedMs ?? 0)) - Math.abs(b.elapsedMs - (elapsedMs ?? 0)))[0];
  if (!/^\d+\.jpg$/.test(alvo.arquivo)) return null;
  try {
    return { buffer: fs.readFileSync(path.join(directory, `${record.id}.prints`, alvo.arquivo)), elapsedMs: alvo.elapsedMs, rotulo: alvo.rotulo || 'Print da corrida' };
  } catch { return null; }
}
