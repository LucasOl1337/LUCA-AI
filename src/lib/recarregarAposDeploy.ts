/**
 * Chunk sumido depois de uma publicação (achado A5): a aba aberta antes do deploy pede
 * `/assets/<hash antigo>.js`, recebe o fallback SPA e o `import()` quebra (tela branca).
 * O Vite avisa com `vite:preloadError`; aqui recarregamos UMA vez para pegar o index novo.
 * A marca no sessionStorage impede loop; um boot que fica de pé a apaga, para o próximo
 * deploy poder recarregar de novo. Marca velha (além da janela) não segura o reload.
 */
export const CHAVE_RECARGA = 'luca:recarregou-apos-deploy';
export const JANELA_RECARGA_MS = 5 * 60_000;

type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function criarRecarregarAposDeploy({
  storage,
  recarregar,
  agora = () => Date.now(),
}: {
  storage: Armazenamento | null;
  recarregar: () => void;
  agora?: () => number;
}) {
  function ler(): number | null {
    try {
      const bruto = storage?.getItem(CHAVE_RECARGA);
      return bruto ? Number(bruto) : null;
    } catch {
      return null;
    }
  }

  return {
    /** Ouvinte de `vite:preloadError`. Devolve true quando pediu o reload. */
    aoFalharPreload(evento: Pick<Event, 'preventDefault'>): boolean {
      if (!storage) return false;
      const marca = ler();
      if (marca !== null && Number.isFinite(marca) && agora() - marca < JANELA_RECARGA_MS) return false;
      try {
        storage.setItem(CHAVE_RECARGA, String(agora()));
      } catch {
        return false; // sem onde marcar, recarregar arriscaria loop
      }
      evento.preventDefault();
      recarregar();
      return true;
    },
    /** Boot que ficou de pé: libera o próximo deploy para recarregar de novo. */
    aoBootOk() {
      try {
        storage?.removeItem(CHAVE_RECARGA);
      } catch {
        /* sessionStorage indisponível: nada a limpar */
      }
    },
  };
}
