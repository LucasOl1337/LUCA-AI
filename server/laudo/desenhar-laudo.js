// Desenho do laudo A4 retrato: cabeçalho, "O que aconteceu", veredicto em destaque,
// duas imagens (frame do episódio ou mapa do trajeto + gráfico de velocidade), evidências,
// prevenção, impacto financeiro e rodapé. Cabe em 1 página no caso comum; o que sobrar
// vai para a 2ª, nunca para uma 3ª (o texto já chega cortado de dados-laudo.js).
import { A4, criarPdf, larguraTexto, quebrarLinhas } from './pdf-simples.js';
import { formatLabTime } from '../../shared/lab-telemetry.js';

const M = 34; // margem
const L = A4.largura - 2 * M;
const COR = {
  tinta: [22, 27, 36], suave: [92, 101, 116], linha: [214, 219, 226], fundo: [244, 246, 249],
  marinho: [14, 34, 58], ouro: [196, 150, 36], alerta: [190, 60, 40], ok: [40, 130, 80], agua: [120, 170, 220], encosta: [214, 170, 110],
};
const BASE_RODAPE = A4.altura - 30;

export function desenharLaudo(d) {
  const pdf = criarPdf({ titulo: `Laudo LUCA-AI · ${d.titulo}`, autor: 'LUCA-AI' });
  let y = 0;
  const paginaNova = () => { pdf.novaPagina(); y = cabecalho(pdf, d, pdf.paginas > 0 && y > 0); };
  const cabe = (altura) => { if (y + altura > BASE_RODAPE - 26 && pdf.paginas < 2) { rodape(pdf, d); paginaNova(); } };
  pdf.novaPagina(); y = cabecalho(pdf, d, false);

  // Linha 1: hipótese (esquerda) + veredicto (direita)
  const colV = 196; const colH = L - colV - 14;
  const linhasH = quebrarLinhas(d.hipotese, 10.5, colH);
  titulo(pdf, M, y, 'O que provavelmente aconteceu');
  let yh = y + 16;
  for (const linha of linhasH.slice(0, 9)) { pdf.texto(M, yh + 9, linha, { tamanho: 10.5 }); yh += 13.6; }
  const fonte = { veredicto: 'Hipótese do veredicto final dos agentes de IA.', revisao: 'Hipótese da revisão dos agentes (análise anterior ao veredicto).', eventos: 'Sem análise dos agentes: só eventos calculados.' }[d.origemHipotese];
  pdf.texto(M, yh + 8, fonte, { tamanho: 7.5, rgb: COR.suave }); yh += 14;
  const yv = caixaVeredicto(pdf, M + colH + 14, y, colV, d.veredicto);
  y = Math.max(yh, yv) + 12;

  // Linha 2: imagens. Com print/frame do momento crítico, ele é a imagem principal (Lucas, 24/10)
  // e mapa + gráfico ficam empilhados ao lado; sem print, mapa e gráfico lado a lado.
  if (d.frame) {
    const largF = L * 0.56; const altF = largF * 9 / 16; const xD = M + largF + 12; const largD = L - largF - 12;
    const altD = (altF - 18) / 2;
    cabe(altF + 30);
    titulo(pdf, M, y, 'Momento crítico');
    const yi = y + 16;
    pdf.retangulo(M, yi, largF, altF, { preencher: [12, 16, 22] });
    if (!pdf.jpeg(d.frame.buffer, M, yi, largF, altF)) mapa(pdf, d, M, yi, largF, altF);
    pdf.texto(M, yi + altF + 9, quebrarLinhas(d.frame.rotulo, 7, largF)[0] ?? '', { tamanho: 7, rgb: COR.suave });
    titulo(pdf, xD, y, 'Trajeto e velocidade');
    pdf.retangulo(xD, yi, largD, altD, { preencher: COR.fundo, contorno: COR.linha });
    mapa(pdf, d, xD, yi, largD, altD);
    grafico(pdf, d, xD, yi + altD + 18 - 0, largD, altD);
    y = yi + altF + 18;
  } else {
    const alturaImg = 150; const largImg = (L - 12) / 2;
    cabe(alturaImg + 24);
    titulo(pdf, M, y, 'Trajeto no mapa');
    titulo(pdf, M + largImg + 12, y, d.graficos.secundaria ? `Velocidade e ${d.graficos.secundaria.rotulo.toLowerCase()}` : 'Velocidade ao longo do tempo');
    const yi = y + 16;
    pdf.retangulo(M, yi, largImg, alturaImg, { preencher: COR.fundo, contorno: COR.linha });
    mapa(pdf, d, M, yi, largImg, alturaImg);
    grafico(pdf, d, M + largImg + 12, yi, largImg, alturaImg);
    y = yi + alturaImg + 18;
  }

  // Evidências
  if (d.evidencias.length) {
    const blocos = d.evidencias.map((e) => quebrarLinhas(e.texto, 9.2, L - 52));
    cabe(20 + blocos.reduce((s, b) => s + b.length * 11.6 + 3, 0));
    titulo(pdf, M, y, 'Evidências');
    y += 16;
    d.evidencias.forEach((e, i) => {
      pdf.retangulo(M, y + 1.5, 40, 11, { preencher: e.tempo ? COR.marinho : COR.suave });
      pdf.texto(M + 4, y + 10, e.tempo ?? '—', { tamanho: 7.8, estilo: 'negrito', rgb: [255, 255, 255] });
      blocos[i].forEach((linha) => { pdf.texto(M + 48, y + 10, linha, { tamanho: 9.2 }); y += 11.6; });
      y += 3;
    });
    y += 6;
  }

  // Prevenção + impacto financeiro, lado a lado
  const meia = (L - 14) / 2;
  const prevLinhas = d.prevencao.map((p) => quebrarLinhas(`${p.acao} (${p.responsavel}${p.prazo ? `, ${p.prazo}` : ''})`, 9, meia - 12));
  const altPrev = 18 + (prevLinhas.length ? prevLinhas.reduce((s, l) => s + l.length * 11.2 + 3, 0) : 14);
  const altImp = d.impacto ? 46 + d.impacto.componentes.length * 22 + d.impacto.premissas.reduce((s, p) => s + quebrarLinhas(p, 7.4, meia - 16).length * 9, 0) : 32;
  cabe(Math.max(altPrev, altImp) + 6);
  titulo(pdf, M, y, 'Como prevenir');
  let yp = y + 16;
  if (!prevLinhas.length) { pdf.texto(M, yp + 9, 'Sem recomendação: o veredicto final não foi gerado para esta análise.', { tamanho: 8.6, rgb: COR.suave }); yp += 14; }
  prevLinhas.forEach((linhas) => {
    pdf.circulo(M + 3, yp + 6.5, 2, { preencher: COR.ouro });
    linhas.forEach((linha) => { pdf.texto(M + 10, yp + 9.5, linha, { tamanho: 9 }); yp += 11.2; });
    yp += 3;
  });
  const xi = M + meia + 14;
  titulo(pdf, xi, y, 'Impacto financeiro possível');
  pdf.retangulo(xi + larguraTexto('Impacto financeiro possível', 10, 'negrito') + 8, y + 1, 52, 11, { preencher: COR.ouro });
  pdf.texto(xi + larguraTexto('Impacto financeiro possível', 10, 'negrito') + 12, y + 9.6, 'ESTIMATIVA', { tamanho: 7, estilo: 'negrito', rgb: [255, 255, 255] });
  let yf = y + 16;
  if (!d.impacto) { pdf.texto(xi, yf + 9, 'Sem estimativa: depende do veredicto final.', { tamanho: 8.6, rgb: COR.suave }); yf += 14; }
  else {
    pdf.texto(xi, yf + 14, d.impacto.faixa, { tamanho: 15, estilo: 'negrito', rgb: COR.marinho }); yf += 22;
    for (const c of d.impacto.componentes) {
      pdf.texto(xi, yf + 9, `${c.item}: ${c.valor}`, { tamanho: 8.4, estilo: 'negrito' });
      pdf.texto(xi, yf + 18.5, c.base, { tamanho: 7.2, rgb: COR.suave }); yf += 22;
    }
    for (const p of d.impacto.premissas) for (const linha of quebrarLinhas(p, 7.4, meia - 16)) { pdf.texto(xi, yf + 8, linha, { tamanho: 7.4, rgb: COR.suave }); yf += 9; }
  }
  y = Math.max(yp, yf) + 6;
  rodape(pdf, d);
  return pdf.gerar();
}

function titulo(pdf, x, y, texto) {
  pdf.texto(x, y + 10, texto, { tamanho: 10, estilo: 'negrito', rgb: COR.marinho });
}

function cabecalho(pdf, d, continuacao) {
  pdf.retangulo(0, 0, A4.largura, 74, { preencher: COR.marinho });
  pdf.retangulo(0, 74, A4.largura, 3, { preencher: COR.ouro });
  pdf.texto(M, 27, 'LUCA-AI', { tamanho: 17, estilo: 'negrito', rgb: [255, 255, 255] });
  pdf.texto(M + larguraTexto('LUCA-AI', 17, 'negrito') + 8, 27, continuacao ? 'Laudo da ocorrência (continuação)' : 'Laudo da ocorrência', { tamanho: 12, rgb: [232, 210, 150] });
  const nome = quebrarLinhas(d.titulo, 10, L - 120, 'negrito')[0] ?? '';
  pdf.texto(M, 46, nome, { tamanho: 10, estilo: 'negrito', rgb: [255, 255, 255] });
  const meta = [d.dataCaso, d.veiculo, d.cenario, d.desfecho, `duração ${d.duracao}`].filter(Boolean).join('  ·  ');
  pdf.texto(M, 62, quebrarLinhas(meta, 8.6, L)[0] ?? '', { tamanho: 8.6, rgb: [200, 210, 225] });
  if (d.sintetico) {
    const w = larguraTexto('DADOS SIMULADOS', 8, 'negrito') + 14;
    pdf.retangulo(A4.largura - M - w, 16, w, 16, { preencher: COR.ouro });
    pdf.texto(A4.largura - M - w + 7, 27, 'DADOS SIMULADOS', { tamanho: 8, estilo: 'negrito', rgb: COR.marinho });
  }
  return 90;
}

function caixaVeredicto(pdf, x, y, l, v) {
  const porque = quebrarLinhas(v.porque, 8.4, l - 20);
  const fatores = v.fatores.flatMap((f) => quebrarLinhas(`• ${f}`, 7.8, l - 20)).slice(0, 5);
  const altura = 74 + porque.length * 10.4 + (fatores.length ? 6 + fatores.length * 9.6 : 0);
  pdf.retangulo(x, y, l, altura, { preencher: COR.marinho });
  pdf.retangulo(x, y, 4, altura, { preencher: COR.ouro });
  pdf.texto(x + 12, y + 15, 'VEREDICTO · PROVÁVEL RESPONSÁVEL', { tamanho: 7.2, estilo: 'negrito', rgb: [232, 210, 150] });
  const nomeTam = larguraTexto(v.culpado, 17, 'negrito') > l - 22 ? 13 : 17;
  pdf.texto(x + 12, y + 36, v.culpado, { tamanho: nomeTam, estilo: 'negrito', rgb: [255, 255, 255] });
  if (v.confianca !== null) {
    const barra = l - 24 - 70;
    pdf.retangulo(x + 12, y + 46, barra, 6, { preencher: [52, 72, 98] });
    pdf.retangulo(x + 12, y + 46, Math.max(2, barra * v.confianca), 6, { preencher: COR.ouro });
    pdf.texto(x + 18 + barra, y + 52.5, `confiança ${Math.round(v.confianca * 100)}%`, { tamanho: 7.6, rgb: [255, 255, 255] });
  } else pdf.texto(x + 12, y + 52, 'confiança não estimada', { tamanho: 7.6, rgb: [200, 210, 225] });
  let yy = y + 68;
  for (const linha of porque) { pdf.texto(x + 12, yy, linha, { tamanho: 8.4, rgb: [235, 240, 248] }); yy += 10.4; }
  if (fatores.length) { yy += 4; for (const linha of fatores) { pdf.texto(x + 12, yy, linha, { tamanho: 7.8, rgb: [200, 210, 225] }); yy += 9.6; } }
  return y + altura;
}

function mapa(pdf, d, x, y, l, a) {
  const pontos = [...d.mapa.trajeto.map(([px, pz]) => [px, pz]), ...d.mapa.poligonos.filter((p) => p.papel !== 'property_boundary').flatMap((p) => p.aneis[0])];
  if (pontos.length < 2) { pdf.texto(x + 10, y + a / 2, 'Sem posição registrada: trajeto indisponível.', { tamanho: 8.4, rgb: COR.suave }); return; }
  const xs = pontos.map((p) => p[0]); const zs = pontos.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const esc = Math.min((l - 20) / Math.max(1, x1 - x0), (a - 26) / Math.max(1, z1 - z0));
  const ox = x + (l - (x1 - x0) * esc) / 2; const oy = y + 6 + (a - 20 - (z1 - z0) * esc) / 2;
  const P = ([px, pz]) => [ox + (px - x0) * esc, oy + (pz - z0) * esc];
  const estilo = { allowed_area: { contorno: [120, 150, 120] }, water: { preencher: COR.agua }, hazard: { preencher: COR.encosta } };
  for (const p of d.mapa.poligonos) if (estilo[p.papel]) pdf.poligono(p.aneis[0].map(P), { ...estilo[p.papel], espessura: 0.8 });
  pdf.linha(d.mapa.trajeto.map(P), { rgb: COR.marinho, espessura: 1.4 });
  const ini = d.mapa.trajeto[0];
  if (ini) pdf.circulo(...P(ini), 2.6, { preencher: COR.ok });
  const t = d.critico.elapsedMs;
  const alvo = t == null ? d.mapa.trajeto.at(-1) : d.mapa.trajeto.reduce((m, p) => (Math.abs(p[2] - t) < Math.abs(m[2] - t) ? p : m));
  if (alvo) { pdf.circulo(...P(alvo), 4.2, { preencher: COR.alerta, contorno: [255, 255, 255], espessura: 1 }); }
  const leg = [['início', COR.ok], [t == null ? 'fim' : `momento crítico ${formatLabTime(t)}`, COR.alerta], ...(d.mapa.poligonos.some((p) => p.papel === 'water') ? [['água', COR.agua]] : []), ...(d.mapa.poligonos.some((p) => p.papel === 'hazard') ? [['encosta/perigo', COR.encosta]] : [])];
  let lx = x + 6;
  for (const [texto, c] of leg) { pdf.retangulo(lx, y + a - 11, 6, 6, { preencher: c }); pdf.texto(lx + 9, y + a - 5.5, texto, { tamanho: 6.8, rgb: COR.suave }); lx += 16 + larguraTexto(texto, 6.8); }
}

function grafico(pdf, d, x, y, l, a) {
  pdf.retangulo(x, y, l, a, { preencher: [255, 255, 255], contorno: COR.linha });
  const { velocidade, secundaria, duracaoMs } = d.graficos;
  const area = { x: x + 30, y: y + 10, l: l - 40, a: a - 34 };
  const desenhar = (pontos, rgb, eixoDireito, unidade) => {
    const vals = pontos.map((p) => p[1]).filter((v) => v !== null);
    const [min, max] = [Math.min(0, ...vals), Math.max(...vals, 1)];
    const X = (t) => area.x + (t / Math.max(1, duracaoMs)) * area.l;
    const Yv = (v) => area.y + area.a - ((v - min) / (max - min || 1)) * area.a;
    let trecho = [];
    for (const [t, v] of pontos) { if (v === null) { pdf.linha(trecho, { rgb, espessura: 1.3 }); trecho = []; } else trecho.push([X(t), Yv(v)]); }
    pdf.linha(trecho, { rgb, espessura: 1.3 });
    const fmt = (v) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toString().replace('.', ',');
    const xr = eixoDireito ? area.x + area.l + 2 : x + 3;
    pdf.texto(xr, area.y + 6, fmt(max), { tamanho: 6.6, rgb });
    pdf.texto(xr, area.y + area.a, fmt(min), { tamanho: 6.6, rgb });
    return unidade;
  };
  pdf.linha([[area.x, area.y + area.a], [area.x + area.l, area.y + area.a]], { rgb: COR.linha, espessura: 0.6 });
  if (velocidade) desenhar(velocidade, COR.marinho, false, 'km/h');
  if (secundaria) desenhar(secundaria.pontos, COR.ouro, true, secundaria.unidade);
  if (!velocidade && !secundaria) pdf.texto(x + 10, y + a / 2, 'Sem série numérica para desenhar.', { tamanho: 8.4, rgb: COR.suave });
  const t = d.critico.elapsedMs;
  if (t != null) {
    const xc = area.x + (t / Math.max(1, duracaoMs)) * area.l;
    pdf.linha([[xc, area.y - 4], [xc, area.y + area.a]], { rgb: COR.alerta, espessura: 1, tracejado: [3, 2] });
  }
  pdf.texto(area.x, y + a - 13, '0:00', { tamanho: 6.6, rgb: COR.suave });
  pdf.texto(area.x + area.l - 22, y + a - 13, formatLabTime(duracaoMs).slice(0, 5), { tamanho: 6.6, rgb: COR.suave });
  const leg = [...(velocidade ? [['velocidade (km/h)', COR.marinho]] : []), ...(secundaria ? [[`${secundaria.rotulo.toLowerCase()} (${secundaria.unidade})`, COR.ouro]] : []), ...(t != null ? [['momento crítico', COR.alerta]] : [])];
  let lx = x + 6;
  for (const [texto, c] of leg) { pdf.retangulo(lx, y + a - 7.5, 8, 2.5, { preencher: c }); pdf.texto(lx + 11, y + a - 4, texto, { tamanho: 6.6, rgb: COR.suave }); lx += 18 + larguraTexto(texto, 6.6); }
}

function rodape(pdf, d) {
  pdf.linha([[M, BASE_RODAPE - 8], [A4.largura - M, BASE_RODAPE - 8]], { rgb: COR.linha, espessura: 0.6 });
  const aviso = d.sintetico ? `Protótipo · dados simulados: não é sinistro real. ${d.aviso}` : d.aviso;
  pdf.texto(M, BASE_RODAPE + 2, quebrarLinhas(aviso, 7.2, L)[0] ?? '', { tamanho: 7.2, estilo: 'negrito', rgb: COR.suave });
  const tecnica = [`Gerado em ${d.geradoEm} (Brasília)`, d.analise ? `análise v${d.analise.versao} de ${d.analise.data}` : 'sem análise', d.modelo ? `modelo ${d.modelo}` : null, `caso ${d.casoId}`].filter(Boolean).join(' · ');
  pdf.texto(M, BASE_RODAPE + 12, quebrarLinhas(tecnica, 6.8, L)[0] ?? '', { tamanho: 6.8, rgb: COR.suave });
}
