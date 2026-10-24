import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, FlaskConical, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAppLocation } from '@/hooks/useAppLocation';
import { downloadFile } from '@/lib/lab-client';
import {
  csvDaFila, diaBrasilia, listarFila, ordenarFila, quandoBrasilia, ROTULO_ESTADO, textoDesfecho, textoNota, textoPosicao,
  type ColunaFila, type EstadoFila, type ItemFila, type LimitesFila,
} from '@/lib/bancada-fila';
import './filaBancadaPage.css';

const ATUALIZAR_MS = 10_000;
// Acima disso o resumo pode passar das 3 linhas cortadas na largura de 1366.
const LIMITE_RESUMO = 90;
const COLUNAS: { id: ColunaFila; rotulo: string }[] = [
  { id: 'quando', rotulo: 'Enviada' }, { id: 'veiculo', rotulo: 'Veículo · cenário' }, { id: 'desfecho', rotulo: 'Desfecho' },
  { id: 'nota', rotulo: 'Nota · avisos' }, { id: 'estado', rotulo: 'Estado' },
];
const VEICULOS: Record<string, string> = { trator: 'Trator MAX', caminhao: 'Caminhão' };
const CENARIOS: Record<string, string> = { circuito: 'Circuito do talhão', percurso: 'Percurso guiado', 'serra-sem-freio': 'Serra sem freio' };

/**
 * Fila da bancada (`/bancada/fila`): todas as corridas enviadas do resultado do simulador,
 * para conferir os pareceres em massa depois que várias pessoas dirigiram.
 */
export default function FilaBancadaPage() {
  const { user } = useAuth();
  const { navigate } = useAppLocation();
  const [itens, setItens] = useState<ItemFila[] | null>(null);
  const [limites, setLimites] = useState<LimitesFila | null>(null);
  const [erro, setErro] = useState('');
  const [estado, setEstado] = useState<EstadoFila | ''>('');
  const [dia, setDia] = useState('');
  const [coluna, setColuna] = useState<ColunaFila>('quando');
  const [crescente, setCrescente] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await listarFila({ estado, dia });
      setItens(r.itens); setLimites(r.limites); setErro('');
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível ler a fila.'); }
  }, [estado, dia]);
  useEffect(() => { void carregar(); }, [carregar]);
  // Só atualiza sozinha enquanto há corrida esperando ou processando.
  const andando = !!itens?.some((i) => i.estado === 'na_fila' || i.estado === 'processando');
  useEffect(() => {
    if (!andando) return;
    const relogio = window.setInterval(() => { if (!document.hidden) void carregar(); }, ATUALIZAR_MS);
    return () => window.clearInterval(relogio);
  }, [andando, carregar]);

  const linhas = useMemo(() => ordenarFila(itens ?? [], coluna, crescente), [itens, coluna, crescente]);
  const ordenar = (id: ColunaFila) => { if (id === coluna) setCrescente(!crescente); else { setColuna(id); setCrescente(id !== 'quando'); } };
  const abrirCaso = (item: ItemFila) => {
    // O Laboratório recupera o caso ativo da conta ao abrir (mesma chave do LaboratorioPage).
    try { localStorage.setItem(`luca.lab.${user?.id}.active`, item.caseId); } catch { /* sem localStorage o Laboratório abre na lista */ }
    navigate({ page: 'laboratorio' }, 'push');
  };
  const exportar = () => downloadFile(csvDaFila(linhas), `fila-bancada-${dia || diaBrasilia(new Date().toISOString())}.csv`, 'text/csv;charset=utf-8');
  const contagem = (e: EstadoFila) => (itens ?? []).filter((i) => i.estado === e).length;

  return (
    <div className="fila-bancada">
      <header className="fila-topo">
        <div>
          <p className="fila-olho">Bancada de agentes</p>
          <h1>Fila da bancada</h1>
          <p className="fila-sub">Corridas enviadas do simulador. Cada uma passa pelos três eixos do Laboratório e pela revisão, uma de cada vez.</p>
        </div>
        {limites && (
          <dl className="fila-limites" aria-label="Limites da fila">
            <div><dt>Hoje</dt><dd>{limites.enviadosHoje} de {limites.tetoDia}</dd></div>
            <div><dt>Na fila</dt><dd>{limites.naFila}</dd></div>
            <div><dt>Processando</dt><dd>{limites.processando} de {limites.concorrencia}</dd></div>
          </dl>
        )}
      </header>

      <div className="fila-filtros" role="group" aria-label="Filtros">
        <label>Dia<input type="date" value={dia} onChange={(e) => setDia(e.target.value)} /></label>
        <label>Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoFila | '')}>
            <option value="">Todos</option>
            {(Object.keys(ROTULO_ESTADO) as EstadoFila[]).map((e) => <option key={e} value={e}>{ROTULO_ESTADO[e]}</option>)}
          </select>
        </label>
        {(dia || estado) && <button type="button" className="fila-botao-texto" onClick={() => { setDia(''); setEstado(''); }}>Limpar filtros</button>}
        <span className="fila-espaco" />
        <button type="button" className="fila-botao" onClick={() => void carregar()}><RefreshCw size={15} aria-hidden />Atualizar</button>
        <button type="button" className="fila-botao" onClick={exportar} disabled={!linhas.length}><Download size={15} aria-hidden />Exportar CSV</button>
      </div>

      {erro && <p className="fila-erro" role="alert">{erro}</p>}
      {itens === null && !erro && <p className="fila-vazio" role="status">Carregando a fila…</p>}
      {itens && !itens.length && (
        <div className="fila-vazio">
          <h2>{dia || estado ? 'Nenhuma corrida com esses filtros' : 'Nenhuma corrida enviada ainda'}</h2>
          <p>No fim de uma corrida no simulador, toque em <b>Enviar pra bancada</b>. A pessoa pode sair na hora; o parecer aparece aqui.</p>
        </div>
      )}
      {itens && itens.length > 0 && (
        <>
          <p className="fila-resumo" aria-live="polite">
            {itens.length} {itens.length === 1 ? 'corrida' : 'corridas'} · {contagem('pronto')} prontas · {contagem('na_fila') + contagem('processando')} em andamento · {contagem('falhou')} com falha
          </p>
          <div className="fila-painel"><table className="fila-tabela">
            <thead>
              <tr>
                {COLUNAS.map((c) => (
                  <th key={c.id} scope="col" aria-sort={coluna === c.id ? (crescente ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => ordenar(c.id)}>{c.rotulo}{coluna === c.id && (crescente ? <ArrowUp size={13} aria-hidden /> : <ArrowDown size={13} aria-hidden />)}</button>
                  </th>
                ))}
                <th scope="col">Parecer dos agentes</th>
                <th scope="col"><span className="fila-oculto">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((i) => (
                <tr key={i.id} data-estado={i.estado}>
                  <td data-rotulo="Enviada"><div><time dateTime={i.criadoEm}>{quandoBrasilia(i.criadoEm)}</time>{i.conta && !i.proprio && <small>{i.conta}</small>}</div></td>
                  <td data-rotulo="Veículo"><div><b>{VEICULOS[i.corrida.veiculo] ?? i.corrida.veiculo}</b><small>{CENARIOS[i.corrida.cenario] ?? i.corrida.cenario}</small></div></td>
                  <td data-rotulo="Desfecho"><div>{textoDesfecho(i.corrida)}{i.corrida.tempoMs !== null && <small>{(i.corrida.tempoMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s</small>}</div></td>
                  <td data-rotulo="Nota"><div>{textoNota(i.corrida)}</div></td>
                  <td data-rotulo="Estado"><div><span className="fila-estado" data-estado={i.estado}>{textoPosicao(i)}</span>{i.tentativas > 1 && <small>{i.tentativas}ª tentativa</small>}</div></td>
                  <td data-rotulo="Parecer" className="fila-parecer"><div>
                    {i.parecer ? (
                      <>
                        <p className={aberto === i.id ? '' : 'fila-corte'}>{i.parecer.status === 'parcial' && <b>Parcial ({i.parecer.eixos} eixos). </b>}{i.parecer.resumo || 'Sem resumo.'}</p>
                        {i.parecer.principal && <small>Hipótese principal: {i.parecer.principal}{i.parecer.hipoteses > 1 ? ` (+${i.parecer.hipoteses - 1})` : ''}</small>}
                        {i.parecer.resumo.length > LIMITE_RESUMO && <button type="button" className="fila-botao-texto" onClick={() => setAberto(aberto === i.id ? null : i.id)}>{aberto === i.id ? 'Menos' : 'Ler tudo'}</button>}
                      </>
                    ) : i.estado === 'falhou' ? <p className="fila-falha">{i.erro}</p> : <p className="fila-espera">{i.estado === 'processando' ? 'Os agentes estão analisando.' : 'Aguardando a vez.'}</p>}
                  </div></td>
                  <td className="fila-acoes"><button type="button" className="fila-botao" onClick={() => abrirCaso(i)}><FlaskConical size={15} aria-hidden />Abrir caso</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
    </div>
  );
}
