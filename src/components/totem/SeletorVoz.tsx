import { useEffect, useState } from 'react';
import { gravarVozEscolhida, lerVozEscolhida, VOZES_TOTEM, type ChaveVoz } from '@/stand-voz/vozEscolhida';
import './seletor-voz.css';

type VozStatus = { chave: string; disponivel: boolean | null };

/**
 * Escolha da voz da coruja antes de abrir o Totem. Vale para as conversas
 * seguintes neste navegador; o padrão é Lucas Oliveira. Se o servidor disser
 * que a voz não está na conta, a opção aparece desligada.
 */
export function SeletorVoz() {
  const [escolhida, setEscolhida] = useState<ChaveVoz>(() => lerVozEscolhida());
  const [indisponiveis, setIndisponiveis] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    fetch('/api/stand/status', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((dados: { vozes?: VozStatus[] } | null) => {
        if (!vivo || !dados?.vozes) return;
        setIndisponiveis(new Set(dados.vozes.filter((v) => v.disponivel === false).map((v) => v.chave)));
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const escolher = (chave: ChaveVoz) => {
    setEscolhida(chave);
    gravarVozEscolhida(chave);
  };

  return (
    <fieldset className="totem-voz" data-voz={escolhida}>
      <legend>Voz da coruja</legend>
      <div className="totem-voz-opcoes">
        {VOZES_TOTEM.map((voz) => {
          const fora = indisponiveis.has(voz.chave);
          return (
            <label key={voz.chave} className="totem-voz-opcao" data-indisponivel={fora || undefined}>
              <input
                type="radio"
                name="totem-voz"
                value={voz.chave}
                checked={escolhida === voz.chave}
                disabled={fora}
                onChange={() => escolher(voz.chave)}
              />
              <span className="totem-voz-nome">{voz.rotulo}</span>
              <span className="totem-voz-detalhe">{fora ? 'Indisponível agora: a conversa usa a voz padrão' : voz.detalhe}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
