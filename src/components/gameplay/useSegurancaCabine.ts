import { useEffect, useRef } from 'react';
import { perigoCabine } from './perigoCabine';

export function useSegurancaCabine(ativo: boolean) {
  const fonte = useRef(Symbol('perigo cabine'));
  useEffect(() => {
    const id = fonte.current;
    perigoCabine.definir(id, ativo);
    return () => perigoCabine.definir(id, false);
  }, [ativo]);
}
