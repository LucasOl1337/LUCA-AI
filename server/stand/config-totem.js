import fs from 'node:fs';
import path from 'node:path';
import { VOZES_STAND, VOZ_STAND_PADRAO } from './provedor-elevenlabs.js';

/** Configuração global: nunca usa o workspace de uma conta. */
export function criarConfigTotem({ arquivo = path.join(process.env.LUCA_DATA_DIR || '.luca', 'totem-config.json') } = {}) {
  let padrao = VOZ_STAND_PADRAO;
  try {
    const salvo = JSON.parse(fs.readFileSync(arquivo, 'utf8')).totemDefaultVoice;
    if (Object.hasOwn(VOZES_STAND, salvo)) padrao = salvo;
  } catch (erro) {
    if (erro.code !== 'ENOENT') throw erro;
  }
  return {
    obter: () => padrao,
    salvar(chave) {
      if (!Object.hasOwn(VOZES_STAND, chave)) throw new Error('voz_invalida');
      fs.mkdirSync(path.dirname(arquivo), { recursive: true });
      const tmp = `${arquivo}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ totemDefaultVoice: chave }, null, 2));
      fs.renameSync(tmp, arquivo);
      padrao = chave;
      return padrao;
    },
  };
}
