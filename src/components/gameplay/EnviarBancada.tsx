import { useEffect, useRef, useState } from 'react';
import { enviarParaFila, lerItemFila, textoPosicao, type EnvioFila, type ItemFila } from '@/lib/bancada-fila';
import { metricasCircuito, textoResultadoCircuito } from './circuito';
import { focoCircuito, PERGUNTA_PADRAO_CIRCUITO } from './ChatCircuito';
import type { RelatorioCircuito } from './sessaoCircuito';
import './circuito.css';

type Estado = { tipo: 'parado' } | { tipo: 'enviando' } | { tipo: 'enviado'; item: ItemFila } | { tipo: 'erro'; mensagem: string };
const ATUALIZAR_MS = 5000;

/** Envio da corrida contínua (Circuito). Caminhão da Pista passa o próprio veículo/cenário no mesmo formato. */
export function envioDoCircuito(relatorio: RelatorioCircuito, { veiculo = 'trator', cenario = 'circuito' }: { veiculo?: string; cenario?: string } = {}): EnvioFila {
  const r = relatorio.registro;
  return {
    caso: relatorio.caso,
    corrida: { veiculo, cenario, desfecho: r.resultado?.motivo ?? null, desfechoTitulo: textoResultadoCircuito(r).titulo, tempoMs: metricasCircuito(r).elapsedMs, avisos: r.episodios.length, runId: r.runId },
    foco: focoCircuito(relatorio, PERGUNTA_PADRAO_CIRCUITO),
  };
}

/**
 * "Enviar pra bancada" no resultado da corrida (pedido do Lucas, 24/10): o caso vai para a
 * fila e a pessoa pode sair na hora; o parecer aparece na tabela `/bancada/fila`.
 * `montar` é chamado só no toque, para levar o registro final da corrida (trator ou caminhão).
 */
export function EnviarBancada({ montar }: { montar: () => EnvioFila | null }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'parado' });
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  // Enquanto a tela está aberta, a posição anda sozinha (GET leve; sair não cancela nada).
  const itemId = estado.tipo === 'enviado' && (estado.item.estado === 'na_fila' || estado.item.estado === 'processando') ? estado.item.id : null;
  useEffect(() => {
    if (!itemId) return;
    const relogio = window.setInterval(() => {
      void lerItemFila(itemId).then(({ item }) => { if (vivo.current) setEstado({ tipo: 'enviado', item }); }, () => undefined);
    }, ATUALIZAR_MS);
    return () => window.clearInterval(relogio);
  }, [itemId]);

  async function enviar() {
    if (estado.tipo === 'enviando' || estado.tipo === 'enviado') return;
    const envio = montar();
    if (!envio) { setEstado({ tipo: 'erro', mensagem: 'A corrida não gravou amostras suficientes para enviar.' }); return; }
    setEstado({ tipo: 'enviando' });
    try {
      const { item } = await enviarParaFila(envio);
      if (vivo.current) setEstado({ tipo: 'enviado', item });
    } catch (erro) {
      if (vivo.current) setEstado({ tipo: 'erro', mensagem: erro instanceof Error ? erro.message : 'Não foi possível enviar à bancada.' });
    }
  }

  return (
    <div className="gameplay-enviar-bancada" data-fila={estado.tipo === 'enviado' ? estado.item.estado : estado.tipo}>
      <button type="button" data-acao="enviar-bancada" onClick={() => void enviar()} disabled={estado.tipo === 'enviando' || estado.tipo === 'enviado'}>
        {estado.tipo === 'enviando' ? 'Enviando…' : estado.tipo === 'enviado' ? 'Enviada pra bancada' : 'Enviar pra bancada'}
      </button>
      {estado.tipo === 'enviado' && (
        <p role="status"><b>{textoPosicao(estado.item)}</b> · pode sair: o parecer fica na Fila da bancada (luca-ai.com.br/bancada/fila).</p>
      )}
      {estado.tipo === 'erro' && <p role="alert">{estado.mensagem}</p>}
    </div>
  );
}
