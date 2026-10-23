import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { gravarVozEscolhida, lerVozEscolhida } from '@/stand-voz/vozEscolhida';
import './seletor-voz.css';

type VozStatus = { chave: string; rotulo: string; detalhe: string; padrao: boolean; disponivel: boolean | null };

/** Catálogo e padrão pertencem ao servidor; só um clique cria preferência local. */
export function SeletorVoz({ abrirTotem }: { abrirTotem: () => void }) {
  const { user } = useAuth();
  const [escolhida, setEscolhida] = useState(() => lerVozEscolhida());
  const [vozes, setVozes] = useState<VozStatus[]>([]);
  const [padrao, setPadrao] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [preview, setPreview] = useState<{ chave: string; estado: 'carregando' | 'tocando' } | null>(null);
  useEffect(() => () => { audio.current?.pause(); audio.current = null; }, []);
  const ouvir = (chave: string) => {
    const anterior = audio.current;
    anterior?.pause();
    audio.current = null;
    if (preview?.chave === chave) { setPreview(null); return; }
    const atual = new Audio(`/api/stand/voz-amostra/${encodeURIComponent(chave)}`);
    audio.current = atual;
    setPreview({ chave, estado: 'carregando' });
    atual.onplaying = () => { if (audio.current === atual) setPreview({ chave, estado: 'tocando' }); };
    atual.onended = () => { if (audio.current === atual) { audio.current = null; setPreview(null); } };
    atual.play().catch(() => {
      if (audio.current !== atual) return;
      audio.current = null; setPreview(null); setMensagem('Não foi possível ouvir esta amostra. Tente novamente.');
    });
  };

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
            <div key={voz.chave} className="totem-voz-opcao" data-indisponivel={fora || undefined}>
              <label className="totem-voz-selecao">
                <input type="radio" name="totem-voz" value={voz.chave} checked={ativa === voz.chave}
                  disabled={fora} onChange={() => escolher(voz.chave)} />
                <span className="totem-voz-textos">
                  <span className="totem-voz-nome">{voz.rotulo}</span>
                  <span className="totem-voz-selo">{voz.chave === padrao ? 'Padrão do LUCA' : '\u00a0'}</span>
                  <span className="totem-voz-detalhe">{fora ? 'Indisponível agora' : voz.detalhe}</span>
                </span>
              </label>
              <button type="button" className="totem-voz-ouvir" disabled={fora} aria-label={`${preview?.chave === voz.chave ? 'Parar' : 'Ouvir'} ${voz.rotulo}`}
                onClick={() => ouvir(voz.chave)}>
                {preview?.chave === voz.chave ? (preview.estado === 'carregando' ? '◌ Carregando…' : '■ Parar') : '▶ Ouvir'}
              </button>
            </div>
          );
        })}
      </div>
      <div className="totem-voz-acoes">
        <button type="button" className="experience-primary" onClick={abrirTotem}>Abrir Totem</button>
        {user?.role === 'admin' && <button type="button" className="experience-secondary" disabled={salvando || !ativa || ativa === padrao || vozes.find((v) => v.chave === ativa)?.disponivel === false}
          onClick={salvarPadrao}>{salvando ? 'Salvando…' : 'Definir como padrão'}</button>}
        {escolhida && <button type="button" className="totem-voz-seguir" onClick={() => escolher(null)}>Seguir o padrão do LUCA</button>}
      </div>
      <p role="status">{mensagem}</p>
    </fieldset>
  );
}
