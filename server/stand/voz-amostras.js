import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

export const FRASE_AMOSTRA = 'Olá! Eu sou a coruja do LUCA. Posso explicar como o sensor ajuda a proteger quem trabalha no campo.';

function converterMp3(pcm) {
  return new Promise((resolve, reject) => {
    const processo = spawn('ffmpeg', ['-v', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0', '-f', 'mp3', 'pipe:1']);
    const saida = [];
    processo.stdout.on('data', (p) => saida.push(p));
    processo.stderr.resume();
    processo.on('error', reject);
    processo.on('close', (code) => code === 0 ? resolve(Buffer.concat(saida)) : reject(new Error('conversao_amostra_falhou')));
    processo.stdin.on('error', () => {});
    processo.stdin.end(pcm);
  });
}

/** Cache persistente e single-flight: pedidos concorrentes não duplicam síntese. */
export function criarAmostras({ diretorio = path.join(process.env.LUCA_DATA_DIR || '.luca', 'voz-amostras'), converter = converterMp3 } = {}) {
  const pendentes = new Map();
  return async (chave, identidade, sintetizar) => {
    const hash = createHash('sha256').update(`${FRASE_AMOSTRA}:${identidade}`).digest('hex').slice(0, 16);
    const arquivo = path.join(diretorio, `${chave}-${hash}.mp3`);
    try { return await fs.readFile(arquivo); } catch (erro) { if (erro.code !== 'ENOENT') throw erro; }
    if (!pendentes.has(arquivo)) {
      const gerar = async () => {
        const pcm = [];
        for await (const p of sintetizar({ texto: FRASE_AMOSTRA })) pcm.push(p);
        const mp3 = await converter(Buffer.concat(pcm));
        if (!mp3.length) throw new Error('amostra_vazia');
        await fs.mkdir(diretorio, { recursive: true });
        const tmp = `${arquivo}.${process.pid}.tmp`;
        await fs.writeFile(tmp, mp3);
        await fs.rename(tmp, arquivo);
        return mp3;
      };
      pendentes.set(arquivo, gerar().finally(() => pendentes.delete(arquivo)));
    }
    return pendentes.get(arquivo);
  };
}
