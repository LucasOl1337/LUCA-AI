/** Sinal local de segurança; não contém áudio nem depende do canal do stand. */
export function criarPerigoCabine() {
  const fontes = new Set<symbol>();
  const assinantes = new Set<() => void>();
  return {
    ler: () => fontes.size > 0,
    definir(fonte: symbol, ativo: boolean) {
      const antes = fontes.size > 0;
      if (ativo) fontes.add(fonte); else fontes.delete(fonte);
      if (antes !== (fontes.size > 0)) for (const fn of assinantes) fn();
    },
    assinar(fn: () => void) { assinantes.add(fn); return () => { assinantes.delete(fn); }; },
  };
}
export const perigoCabine = criarPerigoCabine();
