// Gera um laudo de exemplo offline (sem servidor, sem modelo) a partir de um CSV do
// Laboratório e do veredicto de exemplo: `node scripts/laudo-molde.mjs saida.pdf [csv]`.
import fs from 'node:fs';
import path from 'node:path';
import { parseLabCase } from '../shared/lab-telemetry.js';
import { dadosDoLaudo } from '../server/laudo/dados-laudo.js';
import { desenharLaudo } from '../server/laudo/desenhar-laudo.js';
import { veredictoExemplo } from '../server/laudo/veredicto-exemplo.js';

const [saida = 'laudo-molde.pdf', csv = 'datasets/laboratorio-virtual-v1/02-cerca-e-agua.csv', semVeredicto] = process.argv.slice(2);
const dir = path.dirname(csv);
const json = (nome) => (fs.existsSync(path.join(dir, nome)) ? JSON.parse(fs.readFileSync(path.join(dir, nome), 'utf8')) : null);
const record = { id: 'lab_0123456789abcdef0123456789abcdef', name: 'Cerca e proximidade da água', createdAt: new Date().toISOString(), rawCsv: fs.readFileSync(csv, 'utf8'), sourceName: path.basename(csv), metadata: json('manifest.json'), map: json('mapa.geojson') };
const parsed = parseLabCase(record.rawCsv, { fileName: record.sourceName, manifest: record.metadata, map: record.map });
const analise = {
  id: 'a1', version: 1, status: 'completed', model: 'exemplo', createdAt: record.createdAt, completedAt: record.createdAt,
  axes: [{ id: 'review', status: 'completed', summary: 'Revisão de exemplo: a telemetria mostra saída da cerca no início e aproximação da água sem entrada.' }],
  hypotheses: [], ...(semVeredicto ? {} : { verdict: veredictoExemplo({ tema: /agua/.test(csv) ? 'agua' : 'fardo', elapsedMs: parsed.events.find((e) => e.type === 'near_water')?.elapsedMs ?? 60_000 }) }),
};
const pdf = desenharLaudo(dadosDoLaudo(record, parsed, analise));
fs.writeFileSync(saida, pdf);
console.log(saida, pdf.length, 'bytes');
