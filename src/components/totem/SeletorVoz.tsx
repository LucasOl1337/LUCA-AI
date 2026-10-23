import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { gravarVozEscolhida, lerVozEscolhida } from '@/stand-voz/vozEscolhida';
import './seletor-voz.css';

type VozStatus = { chave: string; rotulo: string; detalhe: string; padrao: boolean; disponivel: boolean | null };

/** Catálogo e padrão pertencem ao servidor; só um clique cria preferência local. */
export function SeletorVoz() {
  const { user } = useAuth();
  const [escolhida, setEscolhida] = useState(() => lerVozEscolhida());
  const [vozes, setVozes] = useState<VozStatus[]>([]);
  const [padrao, setPadrao] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch('/api/stand/status', { credentials: 'same-origin' })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((dados: { vozes?: VozStatus[]; totemDefaultVoice: string }) => {
        if (!vivo) return;
        setVozes(dados.vozes || []);
        setPadrao(dados.totemDefaultVoice);
      })
      .catch(() => { if (vivo) setMensagem('Não foi possível carregar as vozes. Recarregue para tentar de novo.'); });
    return () => { vivo = false; };
  }, []);

  const ativa = escolhida && vozes.some((v) => v.chave === escolhida) ? escolhida : padrao;
  const escolher = (chave: string | null) => {
    setEscolhida(chave);
    gravarVozEscolhida(chave);
  };
  const salvarPadrao = async () => {
    setSalvando(true);
    try {
      const resposta = await fetch('/api/stand/voz-padrao', {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totemDefaultVoice: ativa }),
      });
      if (!resposta.ok) throw new Error();
      const dados = await resposta.json();
      setPadrao(dados.totemDefaultVoice);
      setMensagem('Padrão salvo para todos os totens sem escolha própria.');
    } catch {
      setMensagem('Não foi possível salvar o padrão. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <fieldset className="totem-voz" data-voz={ativa}>
      <legend>Voz da coruja</legend>
      <div className="totem-voz-opcoes">
        {vozes.map((voz) => {
          const fora = voz.disponivel === false;
          return (
            <label key={voz.chave} className="totem-voz-opcao" data-indisponivel={fora || undefined}>
              <input type="radio" name="totem-voz" value={voz.chave} checked={ativa === voz.chave}
                disabled={fora} onChange={() => escolher(voz.chave)} />
              <span className="totem-voz-nome">{voz.rotulo}{voz.chave === padrao ? ' · Padrão do LUCA' : ''}</span>
              <span className="totem-voz-detalhe">{fora ? 'Indisponível agora: a conversa usa a voz padrão' : voz.detalhe}</span>
            </label>
          );
        })}
      </div>
      {escolhida && <button type="button" onClick={() => escolher(null)}>Seguir o padrão do LUCA</button>}
      {user?.role === 'admin' && <button type="button" disabled={salvando || !ativa || vozes.find((v) => v.chave === ativa)?.disponivel === false}
        onClick={salvarPadrao}>{salvando ? 'Salvando…' : 'Definir voz selecionada como padrão do LUCA'}</button>}
      <p role="status">{mensagem}</p>
    </fieldset>
  );
}
