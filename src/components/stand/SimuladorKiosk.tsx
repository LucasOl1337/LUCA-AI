import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import BancadaCircuito from '../gameplay/BancadaCircuito';
import { esquecerBancadaCircuito, guardarBancadaCircuito, missaoDaCorrida, PRESET_BANCADA_CIRCUITO, recuperarBancadaCircuito, type BancadaCircuito as SessaoBancada } from '../gameplay/missaoCircuito';
import type { RelatorioCircuito } from '../gameplay/sessaoCircuito';
import SompoTruckSimulator from '../SompoTruckSimulator';
import { SOMPO_VEHICLE_SEED, type SompoVehicle } from '../../../shared/sompo-vehicles.js';
import { ComandosSimulacao } from '../gameplay/ComandosSimulacao';
import { GameplayOuClassico } from '../gameplay/GameplayOuClassico';
import { useChatLibrary } from '@/hooks/useChatLibrary';
import { lucaApi } from '@/lib/api';
import { queueSompoLaunch } from '@/lib/sompo-cases';
import '@/sompo-page.css';
import { SeletorVeiculo, useVeiculoSimulacao } from '../pista/veiculoSimulacao';

/** Pedaço carregado sob demanda pela Simulação do stand: simulador + CSS do SOMPO, só quando precisa. */
const TRATOR_DO_STAND = SOMPO_VEHICLE_SEED.find((v) => v.id === 'trator-0001') as SompoVehicle;
// Gameplay com a cabine da Visual (src/components/gameplay/visual/); o kiosk segue recebendo criarCabine.
const carregarGameplay = () => import('../gameplay/visual/GameplayComCabine');
const GameplayKiosk = lazy(carregarGameplay);
// Caminhão na serra (Pista, 24/10): chunk próprio, só baixa quando escolhido.
const PistaKiosk = lazy(() => import('../pista/PistaKiosk'));

/** Baixa o chunk do gameplay junto com o do simulador (a Simulação abre sem espera). */
export function preCarregarGameplay() {
  void carregarGameplay().catch(() => undefined);
}

export type VarianteSimulacao = 'classica' | 'gameplay';

/**
 * `?simulacao=classica|gameplay`. Padrão: o Gameplay (cabine, mapinha do talhão,
 * HUD do sensor), pedido do Lucas em 21/10. O clássico fica de reserva: forçado
 * com `?simulacao=classica` ou automático quando o gameplay cai (`GameplayOuClassico`).
 */
export function varianteSimulacao(busca: string): VarianteSimulacao {
  return new URLSearchParams(busca).get('simulacao') === 'classica' ? 'classica' : 'gameplay';
}

type EstadoBancada = { tipo: 'parada' } | { tipo: 'abrindo' } | { tipo: 'aberta'; sessao: SessaoBancada } | { tipo: 'erro'; mensagem: string };

export default function SimuladorKiosk() {
  const { createSession } = useChatLibrary();
  const [bancada, setBancada] = useState<EstadoBancada>(() => {
    const sessao = recuperarBancadaCircuito();
    return sessao ? { tipo: 'aberta', sessao } : { tipo: 'parada' };
  });
  const [veiculo, escolherVeiculo] = useVeiculoSimulacao();
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  /**
   * "Analisar na bancada" (Lucas, 24/10): a corrida vai para a bancada de agentes do
   * LUCA-AI, do mesmo jeito que a simulação do SOMPO: sessão nova, registro da corrida
   * como anexo, missão + equipe na fila de handoff e a página da bancada aberta já
   * rodando. Nada vai para o Laboratório.
   */
  const analisar = async (relatorio: RelatorioCircuito) => {
    if (bancada.tipo === 'abrindo' || bancada.tipo === 'aberta') return;
    setBancada({ tipo: 'abrindo' });
    try {
      const { caseId, mission, anexo } = missaoDaCorrida(relatorio);
      const session = await createSession();
      if (!session) throw new Error('Não foi possível abrir uma sessão na bancada. O totem precisa estar com a conta entrada.');
      const arquivo = new File([anexo.conteudo], anexo.nome, { type: anexo.tipo });
      const upload = await lucaApi.uploadChatAttachment(session.id, arquivo);
      if (!upload?.ok || !upload.attachment) throw new Error('O registro da corrida não subiu para a bancada. Nada foi enviado; tente de novo.');
      queueSompoLaunch({ caseId, mission, mode: 'team', presetId: PRESET_BANCADA_CIRCUITO.id, presetLabel: PRESET_BANCADA_CIRCUITO.label, autoRun: true, attachments: [upload.attachment] });
      const sessao: SessaoBancada = { sessao: session.id, runId: relatorio.registro.runId };
      guardarBancadaCircuito(sessao);
      if (vivo.current) setBancada({ tipo: 'aberta', sessao });
    } catch (erro) {
      if (vivo.current) setBancada({ tipo: 'erro', mensagem: erro instanceof Error ? erro.message : 'Não foi possível abrir a bancada. Tente de novo.' });
    }
  };
  const aoNovo = () => { esquecerBancadaCircuito(); setBancada({ tipo: 'parada' }); };

  if (bancada.tipo === 'aberta') return <BancadaCircuito sessao={bancada.sessao} aoNovo={aoNovo} />;
  const classico = (
    <>
      <SompoTruckSimulator source="simulation" vehicle={TRATOR_DO_STAND} kiosk />
      <ComandosSimulacao />
    </>
  );
  if (varianteSimulacao(typeof window === 'undefined' ? '' : window.location.search) === 'classica') return classico;
  const aoAnalisar = (relatorio: RelatorioCircuito) => { void analisar(relatorio); };
  return (
    <div className="simulacao-com-veiculo" data-veiculo={veiculo} data-bancada={bancada.tipo}>
      <GameplayOuClassico classico={classico}>
        {veiculo === 'caminhao'
          ? <Suspense fallback={<p className="stand-simulacao-carregando" role="status">Ligando o caminhão…</p>}>
            <PistaKiosk key="caminhao" aoAnalisar={aoAnalisar} aoTrocar={() => escolherVeiculo('trator')} />
          </Suspense>
          : <Suspense fallback={<p className="stand-simulacao-carregando" role="status">Ligando o trator…</p>}>
            <GameplayKiosk key="trator" experiencia="circuito" aoAnalisarCircuito={aoAnalisar} />
          </Suspense>}
      </GameplayOuClassico>
      <SeletorVeiculo veiculo={veiculo} escolher={escolherVeiculo} />
      {bancada.tipo === 'abrindo' && <p className="circuito-bancada-aviso" role="status">Abrindo a bancada de agentes com o registro da corrida…</p>}
      {bancada.tipo === 'erro' && <p className="circuito-bancada-aviso" role="alert" data-falha="">{bancada.mensagem} <button type="button" onClick={() => setBancada({ tipo: 'parada' })}>Fechar</button></p>}
    </div>
  );
}
