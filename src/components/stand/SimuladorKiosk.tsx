import { lazy, Suspense, useState } from 'react';
import ChatCircuito, { CHAVE_CHAT_CIRCUITO, guardarConversaCircuito, recuperarConversaCircuito } from '../gameplay/ChatCircuito';
import SompoTruckSimulator from '../SompoTruckSimulator';
import { SOMPO_VEHICLE_SEED, type SompoVehicle } from '../../../shared/sompo-vehicles.js';
import { ComandosSimulacao } from '../gameplay/ComandosSimulacao';
import { GameplayOuClassico } from '../gameplay/GameplayOuClassico';
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

export default function SimuladorKiosk() {
  const [conversa, setConversa] = useState(recuperarConversaCircuito);
  const [veiculo, escolherVeiculo] = useVeiculoSimulacao();
  if (conversa) return <ChatCircuito inicial={conversa} aoNovo={() => { sessionStorage.removeItem(CHAVE_CHAT_CIRCUITO); setConversa(null); }} />;
  const classico = (
    <>
      <SompoTruckSimulator source="simulation" vehicle={TRATOR_DO_STAND} kiosk />
      <ComandosSimulacao />
    </>
  );
  if (varianteSimulacao(typeof window === 'undefined' ? '' : window.location.search) === 'classica') return classico;
  const analisar = (relatorio: Parameters<typeof guardarConversaCircuito>[0]['relatorio']) => {
    const chat = { relatorio, casoId: null, turnos: [] };
    guardarConversaCircuito(chat); setConversa(chat);
  };
  return (
    <div className="simulacao-com-veiculo" data-veiculo={veiculo}>
      <GameplayOuClassico classico={classico}>
        {veiculo === 'caminhao'
          ? <Suspense fallback={<p className="stand-simulacao-carregando" role="status">Ligando o caminhão…</p>}>
            <PistaKiosk key="caminhao" aoAnalisar={analisar} aoTrocar={() => escolherVeiculo('trator')} />
          </Suspense>
          : <Suspense fallback={<p className="stand-simulacao-carregando" role="status">Ligando o trator…</p>}>
            <GameplayKiosk key="trator" experiencia="circuito" aoAnalisarCircuito={analisar} />
          </Suspense>}
      </GameplayOuClassico>
      <SeletorVeiculo veiculo={veiculo} escolher={escolherVeiculo} />
    </div>
  );
}
