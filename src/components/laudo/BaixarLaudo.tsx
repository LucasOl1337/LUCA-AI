import { useState } from 'react';
import { FileDown, Share2 } from 'lucide-react';
import './laudo.css';

/** Endereço do laudo em PDF de um caso do Laboratório (mesma conta; o servidor gera na hora, sem modelo). */
export function urlLaudo(casoId: string, analiseId?: string | null) {
  return `/api/lab/cases/${encodeURIComponent(casoId)}/laudo.pdf${analiseId ? `?analise=${encodeURIComponent(analiseId)}` : ''}`;
}

const nomeDoCabecalho = (cabecalho: string | null) => cabecalho?.match(/filename="([^"]+)"/)?.[1] ?? 'LUCA-laudo.pdf';

/**
 * "Baixar PDF" e, onde o navegador compartilha arquivo (celular), "Compartilhar" pelo menu do
 * sistema (WhatsApp incluso). Pedido do Lucas, 24/10: o laudo vai pronto para mandar no WhatsApp.
 */
export function BaixarLaudo({ casoId, analiseId, compacto = false }: { casoId: string; analiseId?: string | null; compacto?: boolean }) {
  const [estado, setEstado] = useState<'parado' | 'gerando' | 'erro'>('parado');
  const [mensagem, setMensagem] = useState('');
  const url = urlLaudo(casoId, analiseId);
  const podeCompartilhar = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [new File([new Blob(['%PDF'])], 'teste.pdf', { type: 'application/pdf' })] });

  async function compartilhar() {
    setEstado('gerando'); setMensagem('');
    try {
      const resposta = await fetch(url, { credentials: 'same-origin' });
      if (!resposta.ok) throw new Error(resposta.status === 401 ? 'Entre na conta para gerar o laudo.' : `O servidor respondeu ${resposta.status}.`);
      const arquivo = new File([await resposta.blob()], nomeDoCabecalho(resposta.headers.get('content-disposition')), { type: 'application/pdf' });
      await navigator.share({ files: [arquivo], title: 'Laudo LUCA-AI' });
      setEstado('parado');
    } catch (erro) {
      if ((erro as Error).name === 'AbortError') { setEstado('parado'); return; }
      setEstado('erro'); setMensagem((erro as Error).message || 'Não foi possível compartilhar.');
    }
  }

  return (
    <div className="laudo-acoes" data-compacto={compacto || undefined}>
      <a className="laudo-botao" href={url} download data-acao="baixar-laudo"><FileDown size={16} aria-hidden />Baixar PDF</a>
      {podeCompartilhar && (
        <button type="button" className="laudo-botao" data-acao="compartilhar-laudo" onClick={() => void compartilhar()} disabled={estado === 'gerando'}>
          <Share2 size={16} aria-hidden />{estado === 'gerando' ? 'Gerando…' : 'Compartilhar'}
        </button>
      )}
      {estado === 'erro' && <p role="alert">{mensagem}</p>}
    </div>
  );
}
