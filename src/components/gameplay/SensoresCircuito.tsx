import { geofenceTalhao } from './geofenceTalhao';
import type { EstadoGameplay } from './estadoGameplay';

export function SensoresCircuito({ estado: e }: { estado: EstadoGameplay }) {
  const agua = geofenceTalhao(e.maquina);
  const roll = Math.abs(e.atitude.rolagemGraus);
  return <section className="circuito-sensores" aria-label="Sensores simulados">
    <small>LEITURAS SIMULADAS</small>
    <div data-sensor="colisao" data-nivel={e.sensor.alerta ? 'critico' : e.sensor.eco ? 'atencao' : 'livre'}>
      <span>◉ Sensor frontal</span><strong>{e.sensor.eco ? `${(e.sensor.distanciaCm / 100).toFixed(1)} m` : '> 4 m'}</strong>
      <small>{e.sensor.eco ? 'Colisão · alerta ≤ 1,5 m' : 'Sem obstáculo no alcance de 4 m'}</small>
    </div>
    <div data-sensor="inclinacao" data-nivel={roll >= 20 ? 'critico' : roll >= 12 ? 'atencao' : 'livre'}>
      <span>◴ Inclinação lateral</span><strong>{e.atitude.rolagemGraus.toFixed(1)}°</strong>
      <small>Atenção 12° · perigo 20° · tombo 30°</small>
    </div>
    <div data-sensor="velocidade" data-nivel={e.maquina.velocidadeKph > 7 && roll >= 20 ? 'critico' : 'livre'}>
      <span>↗ Velocidade{e.maquina.re ? ' · ré' : ''}</span><strong>{e.maquina.velocidadeKph.toFixed(1)} km/h</strong>
      <small>Máx. {e.tetoKph} km/h · encosta &lt; 7 km/h</small>
    </div>
    <div data-sensor="agua" data-nivel={agua.nivel === 'dentro' ? 'critico' : agua.nivel === 'rumo' ? 'atencao' : 'livre'}>
      <span>≈ Água / Geofence</span><strong>{agua.nivel === 'dentro' ? 'DENTRO' : agua.nivel === 'rumo' ? 'APROXIMANDO' : 'FORA DA ÁGUA'}</strong>
      <small>{agua.nivel === 'fora' ? 'Projeção de movimento: 3 s' : agua.nivel === 'dentro' ? 'Saia · 2 s dentro encerra a run' : 'Entrada prevista em até 3 s · desvie'}</small>
    </div>
  </section>;
}
