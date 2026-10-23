import { useSyncExternalStore } from 'react';
import { useSegurancaCabine } from './useSegurancaCabine';
import { alertaCabine, type AlertaCabine } from './alertaCabine';
import { useBipeCabine } from './bipeCabine';
import { ComandosSimulacao } from './ComandosSimulacao';
import type { CanalGameplay, EstadoGameplay } from './estadoGameplay';
import { MapaTalhao } from './MapaTalhao';
import { useSonoCabine } from './sonoCabine';
import './painelCabine.css';

// O bipe mora em bipeCabine.ts (sem CSS) para o operador usá-lo sem herdar as
// animações infinitas da cabine; fica reexportado aqui para quem já importava.
export { criarMotorBipe, useBipeCabine } from './bipeCabine';

/**
 * Painel da cabine: o que o operador vê do LUCA-AI no gameplay.
 * Faixa de baixo no centro (altura do capô), faixa vermelha no alto do
 * para-brisa quando o alerta de 150 cm acende, selo SIMULADO sempre à vista.
 * Quem monta é o GameplayKiosk da Direção; o painel só lê o canal.
 */
export function PainelCabine({ canal, som = true }: { canal: CanalGameplay; som?: boolean }) {
  const estado = useSyncExternalStore(canal.assinar, canal.ler, canal.ler);
  // Webcam de sonolência (/gameplay?webcam=1); sem ela `sono` é null e nada muda.
  const sono = useSonoCabine();
  const painel = alertaCabine(estado, sono);
  useSegurancaCabine(som && estado.fase === 'dirigindo' && (estado.contato || estado.sensor.alerta));
  useBipeCabine(som ? painel.bipe : null);
  return <PainelCabineVista painel={painel} estado={estado} />;
}

/** Só desenho, sem canal nem áudio: serve ao teste e ao print. */
export function PainelCabineVista({ painel, estado }: { painel: AlertaCabine; estado: EstadoGameplay }) {
  return (
    <div className="gameplay-painel" data-faixa={painel.faixa} data-alerta={painel.alerta} data-fase={estado.fase} data-sono={painel.sono || undefined}>
      <div className="gameplay-painel-vinheta" data-nivel={painel.vinheta} aria-hidden="true" />
      <div className="gameplay-painel-alerta" role="alert" hidden={!painel.alerta}>
        {painel.rotuloAlerta}
      </div>
      <section className="gameplay-painel-cabine" aria-label="Painel da cabine" aria-live="polite">
        <span className="gameplay-painel-selo">SIMULADO</span>
        <div className="gameplay-painel-distancia">
          <span>Sensor frontal</span>
          <strong>{painel.distanciaTexto}</strong>
          <small>{painel.rotulo}</small>
        </div>
        <div className="gameplay-painel-lado">
          <div><span>Velocidade</span><strong>{painel.velocidadeTexto}</strong></div>
          {painel.inclinacao.ligada && (
            <div data-alerta="true"><span>Inclinação</span><strong>{painel.inclinacao.graus}°</strong></div>
          )}
        </div>
        <span className="gameplay-painel-marca">LUCA-AI</span>
        {/* Ancorada no painel: sobe junto com ele (retrato, percurso) e nunca cobre os selos. */}
        <ComandosSimulacao />
      </section>
      <MapaTalhao estado={estado} geofence={painel.geofence} />
    </div>
  );
}
