/**
 * Retrato da tela: o que a página dentro do iframe do `/stand` mostra agora,
 * em uma linha curta que volta ao cérebro como contexto `Tela:` (proposta
 * Totem-Site item 1). Lê só seletores fixos das 6 páginas públicas; nada de
 * admin, formulário ou texto livre. No máximo `RETRATO_MAX` caracteres.
 */
export const RETRATO_MAX = 200;

/** O que a leitura do DOM precisa: um seletor vira texto (ou nada). */
export interface LeitorTela {
  texto(seletor: string): string | null;
  atributo(seletor: string, nome: string): string | null;
  /** Atributo de todos os elementos visíveis do seletor (opcional). */
  todos?(seletor: string, nome: string): string[];
}

/** Uma linha só, sem quebra nem espaço repetido, cortada em `max`. */
export function limparLinha(texto: string, max = RETRATO_MAX): string {
  const linha = texto.replace(/\s+/g, ' ').trim();
  return linha.length > max ? `${linha.slice(0, max - 1).trimEnd()}…` : linha;
}

const juntar = (partes: Array<string | null | false | undefined>) => partes.filter(Boolean).join('. ');

const ESTADO_SONO: Record<string, string> = { idle: 'webcam desligada', starting: 'webcam ligando', running: 'monitor pronto e som liberado', error: 'webcam com erro' };
const SENSIBILIDADE: Record<string, string> = { low: 'baixa', normal: 'normal', high: 'alta' };

export function retratoDaPagina(caminho: string, ler: LeitorTela): string {
  switch (caminho) {
    case '/sonolencia': {
      const estado = ler.atributo('.drowsiness-page', 'data-state') ?? '';
      const sens = ler.atributo('.drowsiness-sensitivity select', 'value');
      return limparLinha(juntar([
        'Página sonolência',
        ESTADO_SONO[estado] ?? null,
        estado === 'running' && ler.texto('.drowsiness-panel h2'),
        estado === 'idle' && 'demonstração ainda inativa; toque em Ativar webcam',
        estado === 'error' && ler.texto('.drowsiness-panel .drowsiness-message'),
        sens && `sensibilidade ${SENSIBILIDADE[sens] ?? sens}`,
      ]));
    }
    case '/sensor': {
      const pausado = ler.atributo('.sensor-operation-controls button[aria-label="Continuar"]', 'aria-label') !== null;
      return limparLinha(juntar([
        'Página laboratório do sensor',
        ler.texto('.sensor-choice[aria-label="Veículo da bancada"] button[aria-pressed="true"]'),
        (() => { const e = ler.texto('.sensor-essay-select select option:checked'); return e && `ensaio ${e}`; })(),
        ler.texto('.sensor-operation-slider span'),
        pausado ? 'pausado' : 'rodando',
        (() => { const v = ler.texto('.sensor-operation-views button[aria-pressed="true"]'); return v && `vista ${v}`; })(),
      ]));
    }
    case '/laboratorio': {
      const demo = ler.texto('.lab-demo-badge');
      const tocando = ler.atributo('.lab-play', 'aria-label');
      const camera = ler.texto('.lab-camera-control button[aria-pressed="true"]');
      return limparLinha(juntar([
        'Página laboratório',
        demo ? 'demonstração da fazenda aberta' : 'demonstração fechada',
        demo && tocando && (tocando === 'Pausar reprodução' ? 'replay rodando' : 'replay pausado'),
        camera && `câmera ${camera}`,
      ]));
    }
    case '/sompo': {
      const aba = ler.texto('[data-stand-alvo^="aba-"][aria-pressed="true"] strong');
      return limparLinha(juntar(['Página SOMPO', aba && `aba ${aba}`]));
    }
    case '/luca-ai': {
      // Só os rótulos dos templates prontos (galeria pública da bancada); nada de missão, chat ou persona.
      const galeria = ler.atributo('[data-luca-preset-gallery]', 'data-luca-preset-gallery');
      const nomes = ler.todos?.('[data-luca-preset-gallery] button[aria-label^="Aplicar preset "]', 'aria-label')
        .map((rotulo) => rotulo.replace(/^Aplicar preset /, '')) ?? [];
      return limparLinha(juntar(['Página LUCA AI', galeria && nomes.length ? `${galeria}: ${nomes.join(', ')}` : null]));
    }
    case '/':
      return 'Página inicial do site';
    default:
      return '';
  }
}

/** Leitor do documento real: só elementos visíveis contam. */
export function leitorDoDocumento(doc: Document): LeitorTela {
  const visiveis = (seletor: string): Element[] => {
    try {
      return Array.from(doc.querySelectorAll(seletor)).filter((el) => {
        const r = (el as HTMLElement).getBoundingClientRect?.();
        return !r || r.width > 0 || r.height > 0 || el instanceof HTMLOptionElement;
      });
    } catch { return []; }
  };
  const achar = (seletor: string): Element | null => visiveis(seletor)[0] ?? null;
  return {
    texto: (seletor) => {
      const t = achar(seletor)?.textContent?.replace(/\s+/g, ' ').trim();
      return t || null;
    },
    atributo: (seletor, nome) => {
      const el = achar(seletor);
      if (!el) return null;
      if (nome === 'value' && 'value' in el) return String((el as HTMLSelectElement).value);
      return el.getAttribute(nome);
    },
    todos: (seletor, nome) => visiveis(seletor).map((el) => el.getAttribute(nome)).filter((v): v is string => Boolean(v)),
  };
}
