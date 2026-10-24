// Escritor de PDF mínimo, sem dependência: texto Helvetica (WinAnsi, cobre o português),
// retângulos, linhas, polígonos e imagens JPEG (DCTDecode). Serve ao laudo de uma ou duas
// páginas; não é um motor de layout genérico.
// Por que não Chromium/page.pdf: o playwright é devDependency (a VM roda `npm ci --omit=dev`)
// e o serviço luca-ai roda com NoNewPrivileges/ProtectHome e userns restrito, onde o sandbox
// do Chrome não sobe sem --no-sandbox. Um gerador em JS puro roda igual no PC e na VM.
import { LARGURAS } from './helvetica-metricas.js';

export const A4 = Object.freeze({ largura: 595.28, altura: 841.89 });
const FONTES = { normal: 'Helvetica', negrito: 'Helvetica-Bold' };
const WIN_ANSI_ALTOS = { 8364: 128, 8218: 130, 402: 131, 8222: 132, 8230: 133, 8224: 134, 8225: 135, 710: 136, 8240: 137, 352: 138, 8249: 139, 338: 140, 381: 142, 8216: 145, 8217: 146, 8220: 147, 8221: 148, 8226: 149, 8211: 150, 8212: 151, 732: 152, 8482: 153, 353: 154, 8250: 155, 339: 156, 382: 158, 376: 159 };
const TROCAS = { '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '≈': '~', '×': 'x', '−': '-', '\u00a0': ' ', '\u2009': ' ', '\u202f': ' ' };

/** Texto → bytes WinAnsi. O que não cabe na codificação vira equivalente ASCII ou some (emoji). */
export function winAnsi(texto) {
  const bytes = [];
  for (const ch of String(texto ?? '').normalize('NFC')) {
    const troca = TROCAS[ch];
    if (troca) { for (const c of troca) bytes.push(c.charCodeAt(0)); continue; }
    const cp = ch.codePointAt(0);
    if (cp === 9 || cp === 10 || cp === 13) bytes.push(32);
    else if (cp >= 32 && cp < 127) bytes.push(cp);
    else if (cp >= 160 && cp <= 255) bytes.push(cp);
    else if (WIN_ANSI_ALTOS[cp]) bytes.push(WIN_ANSI_ALTOS[cp]);
  }
  return bytes;
}

export function larguraTexto(texto, tamanho, estilo = 'normal') {
  const tabela = LARGURAS[FONTES[estilo]];
  return winAnsi(texto).reduce((soma, b) => soma + (tabela[b - 32] ?? 556), 0) * tamanho / 1000;
}

/** Quebra em linhas que cabem em `largura` (pt). Palavra maior que a linha é cortada. */
export function quebrarLinhas(texto, tamanho, largura, estilo = 'normal') {
  const linhas = [];
  for (const paragrafo of String(texto ?? '').split(/\n+/)) {
    let atual = '';
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (larguraTexto(tentativa, tamanho, estilo) <= largura) { atual = tentativa; continue; }
      if (atual) linhas.push(atual);
      let resto = palavra;
      while (larguraTexto(resto, tamanho, estilo) > largura && resto.length > 1) {
        let corte = resto.length - 1;
        while (corte > 1 && larguraTexto(resto.slice(0, corte), tamanho, estilo) > largura) corte -= 1;
        linhas.push(resto.slice(0, corte));
        resto = resto.slice(corte);
      }
      atual = resto;
    }
    if (atual) linhas.push(atual);
  }
  return linhas;
}

const n = (v) => (Math.round(v * 100) / 100).toString();
const cor = (rgb) => rgb.map((c) => n(c / 255)).join(' ');
const hex = (bytes) => `<${Buffer.from(bytes).toString('hex')}>`;

/** Dimensões de um JPEG baseline/progressivo lendo o marcador SOF. Null se não for JPEG legível. */
export function dimensoesJpeg(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buffer.length) {
    if (buffer[i] !== 0xff) { i += 1; continue; }
    const marcador = buffer[i + 1];
    const tamanho = buffer.readUInt16BE(i + 2);
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { altura: buffer.readUInt16BE(i + 5), largura: buffer.readUInt16BE(i + 7), componentes: buffer[i + 9] };
    }
    i += 2 + tamanho;
  }
  return null;
}

/** Documento: páginas com comandos de desenho em coordenadas de cima para baixo (y cresce para baixo). */
export function criarPdf({ titulo = 'Laudo', autor = 'LUCA-AI' } = {}) {
  const paginas = [];
  const imagens = [];
  let atual = null;
  const Y = (y) => A4.altura - y;
  const api = {
    novaPagina() { atual = []; paginas.push(atual); return api; },
    get paginas() { return paginas.length; },
    texto(x, y, conteudo, { tamanho = 10, estilo = 'normal', rgb = [20, 24, 31] } = {}) {
      atual.push(`BT /${estilo === 'negrito' ? 'F2' : 'F1'} ${n(tamanho)} Tf ${cor(rgb)} rg ${n(x)} ${n(Y(y))} Td ${hex(winAnsi(conteudo))} Tj ET`);
      return api;
    },
    retangulo(x, y, l, a, { preencher = null, contorno = null, espessura = 0.6 } = {}) {
      const op = preencher && contorno ? 'B' : preencher ? 'f' : 'S';
      atual.push(`q ${preencher ? `${cor(preencher)} rg ` : ''}${contorno ? `${cor(contorno)} RG ${n(espessura)} w ` : ''}${n(x)} ${n(Y(y + a))} ${n(l)} ${n(a)} re ${op} Q`);
      return api;
    },
    linha(pontos, { rgb = [20, 24, 31], espessura = 1, tracejado = null } = {}) {
      if (pontos.length < 2) return api;
      const caminho = pontos.map(([x, y], i) => `${n(x)} ${n(Y(y))} ${i ? 'l' : 'm'}`).join(' ');
      atual.push(`q ${cor(rgb)} RG ${n(espessura)} w 1 J 1 j ${tracejado ? `[${tracejado.join(' ')}] 0 d ` : ''}${caminho} S Q`);
      return api;
    },
    poligono(pontos, { preencher = null, contorno = null, espessura = 0.6 } = {}) {
      if (pontos.length < 3) return api;
      const caminho = pontos.map(([x, y], i) => `${n(x)} ${n(Y(y))} ${i ? 'l' : 'm'}`).join(' ');
      const op = preencher && contorno ? 'b' : preencher ? 'f' : 's';
      atual.push(`q ${preencher ? `${cor(preencher)} rg ` : ''}${contorno ? `${cor(contorno)} RG ${n(espessura)} w ` : ''}${caminho} h ${op} Q`);
      return api;
    },
    circulo(cx, cy, r, opcoes) {
      const k = 0.5523 * r; const y = Y(cy);
      atual.push(`q ${opcoes.preencher ? `${cor(opcoes.preencher)} rg ` : ''}${opcoes.contorno ? `${cor(opcoes.contorno)} RG ${n(opcoes.espessura ?? 1)} w ` : ''}${n(cx + r)} ${n(y)} m ${n(cx + r)} ${n(y + k)} ${n(cx + k)} ${n(y + r)} ${n(cx)} ${n(y + r)} c ${n(cx - k)} ${n(y + r)} ${n(cx - r)} ${n(y + k)} ${n(cx - r)} ${n(y)} c ${n(cx - r)} ${n(y - k)} ${n(cx - k)} ${n(y - r)} ${n(cx)} ${n(y - r)} c ${n(cx + k)} ${n(y - r)} ${n(cx + r)} ${n(y - k)} ${n(cx + r)} ${n(y)} c ${opcoes.preencher && opcoes.contorno ? 'B' : opcoes.preencher ? 'f' : 'S'} Q`);
      return api;
    },
    /** Desenha JPEG em caixa (x, y, l, a) mantendo proporção. Devolve false se o arquivo não for JPEG. */
    jpeg(buffer, x, y, l, a) {
      const dim = dimensoesJpeg(buffer);
      if (!dim || ![1, 3].includes(dim.componentes)) return false;
      const nome = `Im${imagens.length + 1}`;
      imagens.push({ nome, buffer, ...dim });
      const escala = Math.min(l / dim.largura, a / dim.altura);
      const [w, h] = [dim.largura * escala, dim.altura * escala];
      atual.push(`q ${n(w)} 0 0 ${n(h)} ${n(x + (l - w) / 2)} ${n(Y(y + (a + h) / 2))} cm /${nome} Do Q`);
      return true;
    },
    gerar() {
      const objetos = [];
      const add = (conteudo) => { objetos.push(conteudo); return objetos.length; };
      const catalogo = add(null);
      const arvore = add(null);
      const f1 = add(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
      const f2 = add(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
      const xobjs = imagens.map((im) => `/${im.nome} ${add(Buffer.concat([
        Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${im.largura} /Height ${im.altura} /ColorSpace /${im.componentes === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.buffer.length} >>\nstream\n`),
        im.buffer, Buffer.from('\nendstream')]))} 0 R`).join(' ');
      const recursos = `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /XObject << ${xobjs} >> >>`;
      const kids = paginas.map((comandos) => {
        const fluxo = Buffer.from(comandos.join('\n'), 'latin1');
        const c = add(Buffer.concat([Buffer.from(`<< /Length ${fluxo.length} >>\nstream\n`), fluxo, Buffer.from('\nendstream')]));
        return add(Buffer.from(`<< /Type /Page /Parent ${arvore} 0 R /MediaBox [0 0 ${A4.largura} ${A4.altura}] /Resources ${recursos} /Contents ${c} 0 R >>`));
      });
      objetos[catalogo - 1] = Buffer.from(`<< /Type /Catalog /Pages ${arvore} 0 R >>`);
      objetos[arvore - 1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
      const info = add(Buffer.from(`<< /Title ${hex([0xfe, 0xff, ...Buffer.from(String(titulo), 'utf16le').swap16()])} /Author ${hex(winAnsi(autor))} /Producer (LUCA-AI laudo) >>`));
      const partes = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
      const offsets = [];
      let tamanho = partes[0].length;
      objetos.forEach((conteudo, i) => {
        offsets.push(tamanho);
        const bloco = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), conteudo, Buffer.from('\nendobj\n')]);
        partes.push(bloco); tamanho += bloco.length;
      });
      const xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
      partes.push(Buffer.from(`${xref}trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${tamanho}\n%%EOF\n`));
      return Buffer.concat(partes);
    },
  };
  return api;
}
