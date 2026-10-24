import { useCallback, useEffect, useState } from 'react';
import './pista.css';

export type VeiculoSimulacao = 'trator' | 'caminhao';
const CHAVE = 'luca:simulacao-veiculo';
/** Botão △/Y do controle troca o veículo antes de partir. */
const BOTAO_TROCA = 3;

/** `?veiculo=caminhao` manda; senão a última escolha da aba; senão o trator. */
export function veiculoInicial(busca: string, guardado: string | null): VeiculoSimulacao {
  const pedido = new URLSearchParams(busca).get('veiculo');
  if (pedido === 'caminhao' || pedido === 'trator') return pedido;
  return guardado === 'caminhao' ? 'caminhao' : 'trator';
}

/**
 * Escolha do veículo da Simulação. Também ouve `luca:simulacao-veiculo` (detail
 * 'trator' | 'caminhao'): gancho para a voz da Coruja ("quero o caminhão"),
 * que é do catálogo do Roteiro.
 */
export function useVeiculoSimulacao() {
  const [veiculo, setVeiculo] = useState<VeiculoSimulacao>(() => {
    if (typeof window === 'undefined') return 'trator';
    let guardado: string | null = null;
    try { guardado = sessionStorage.getItem(CHAVE); } catch { /* sem storage */ }
    return veiculoInicial(window.location.search, guardado);
  });
  const escolher = useCallback((v: VeiculoSimulacao) => {
    setVeiculo(v);
    try { sessionStorage.setItem(CHAVE, v); } catch { /* sem storage */ }
  }, []);
  useEffect(() => {
    const ouvir = (ev: Event) => { const d = (ev as CustomEvent).detail; if (d === 'trator' || d === 'caminhao') escolher(d); };
    window.addEventListener('luca:simulacao-veiculo', ouvir);
    return () => window.removeEventListener('luca:simulacao-veiculo', ouvir);
  }, [escolher]);
  return [veiculo, escolher] as const;
}

/** Seletor Trator | Caminhão: visível só antes de partir (CSS esconde com a corrida em `dirigindo` ou com diálogo aberto). */
export function SeletorVeiculo({ veiculo, escolher }: { veiculo: VeiculoSimulacao; escolher(v: VeiculoSimulacao): void }) {
  useEffect(() => {
    let segurado = false, quadro = 0;
    const trocar = () => escolher(veiculo === 'trator' ? 'caminhao' : 'trator');
    const visivel = () => {
      const raiz = document.querySelector('[data-gameplay]');
      return !!raiz && raiz.getAttribute('data-fase') === 'pronto' && !document.querySelector('.circuito-dialogo');
    };
    const laco = () => {
      quadro = requestAnimationFrame(laco);
      const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p?.mapping === 'standard');
      const agora = !!pad?.buttons[BOTAO_TROCA]?.pressed;
      if (agora && !segurado && visivel()) trocar();
      segurado = agora;
    };
    const tecla = (ev: KeyboardEvent) => { if (!ev.repeat && ev.key.toLowerCase() === 't' && !ev.ctrlKey && !ev.metaKey && visivel()) trocar(); };
    quadro = requestAnimationFrame(laco);
    window.addEventListener('keydown', tecla);
    return () => { cancelAnimationFrame(quadro); window.removeEventListener('keydown', tecla); };
  }, [veiculo, escolher]);
  return <div className="simulacao-veiculo" role="group" aria-label="Escolha o veículo">
    <button aria-pressed={veiculo === 'trator'} data-veiculo="trator" onClick={() => escolher('trator')}>Trator no talhão</button>
    <button aria-pressed={veiculo === 'caminhao'} data-veiculo="caminhao" onClick={() => escolher('caminhao')}>Caminhão na serra</button>
    <kbd aria-hidden="true">△ / T</kbd>
  </div>;
}
