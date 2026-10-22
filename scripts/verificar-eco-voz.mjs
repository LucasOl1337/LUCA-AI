// Prova offline de UM par fixo de vozes. PCM16 mono24k, sem captura/reprodução.
// node scripts/verificar-eco-voz.mjs luca.pcm visitante.pcm
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ReferenciaEco } from '../src/stand-voz/ecoPcm.ts';

const [arquivoLuca, arquivoVisitante] = process.argv.slice(2);
if (!arquivoLuca || !arquivoVisitante) throw new Error('Informe dois PCM16 mono24k: luca.pcm visitante.pcm');
const ler = (arquivo) => {
  const bytes = readFileSync(arquivo);
  return { sha256: createHash('sha256').update(bytes).digest('hex'), pcm: Int16Array.from({ length: bytes.length / 2 }, (_, i) => bytes.readInt16LE(2 * i)) };
};
const luca = ler(arquivoLuca);
const visitante = ler(arquivoVisitante);
const referencia = Float32Array.from(luca.pcm, (x) => x / 32768);
const atraso = 2883; //120,125ms, não alinhado à grade3kHz.
const bloco = 1200;
const rms = (dados) => Math.sqrt(dados.reduce((s, x) => s + (x / 32768) ** 2, 0) / dados.length);
const resultados = [];
for (const modo of ['eco', 'dupla', 'humana_sem_tts']) {
  const detector = new ReferenciaEco();
  if (modo !== 'humana_sem_tts') detector.agendar(referencia, 1);
  let blocosEco = 0;
  let blocosVoz = 0;
  let humanosIntactos = 0;
  let ativos = 0;
  for (let pos = atraso; pos + bloco <= Math.min(luca.pcm.length, visitante.pcm.length); pos += bloco) {
    const voz = visitante.pcm.subarray(pos, pos + bloco);
    const entrada = Int16Array.from({ length: bloco }, (_, i) => Math.max(-32768, Math.min(32767, Math.round(
      (modo === 'humana_sem_tts' ? 0 : luca.pcm[pos + i - atraso] * 0.5)
      + (modo === 'eco' ? 0 : voz[i] * 0.6)))));
    const analise = detector.analisar(entrada, 1 + (pos + bloco) / 24000);
    const saida = analise.eco ? new Int16Array(bloco) : entrada;
    if (analise.eco) blocosEco++;
    if (rms(entrada) >= 0.003) {
      ativos++;
    }
    if (modo !== 'eco' && rms(voz) * 0.6 >= 0.015) {
      blocosVoz++;
      if (!analise.eco && saida.every((v, i) => v === entrada[i])) humanosIntactos++;
    }
  }
  if (modo === 'eco') assert.ok(blocosEco >= ativos * 0.95, `eco: ${blocosEco}/${ativos} blocos ativos`);
  else {
    assert.ok(blocosVoz >= 10, 'fixture deve conter fala humana sustentada');
    assert.equal(humanosIntactos, blocosVoz, `${modo}: fala humana não pode ser silenciada`);
  }
  resultados.push({ modo, blocosEco, ativos, blocosVoz, humanosIntactos });
}
console.log(JSON.stringify({ luca: { arquivo: arquivoLuca, sha256: luca.sha256 }, visitante: { arquivo: arquivoVisitante, sha256: visitante.sha256 }, atraso_amostras: atraso, resultados, limite: 'Mistura offline de trechos do vídeo; não prova AEC nem equipamento físico.' }, null, 2));
