import { geofenceTalhao } from './geofenceTalhao';
import { decimalCircuito as d } from './circuito';
import type { EstadoGameplay } from './estadoGameplay';

export function SensoresCircuito({ estado: e }: { estado: EstadoGameplay }) {
  const agua = geofenceTalhao(e.maquina);
  const roll = Math.abs(e.atitude.rolagemGraus);
  return <section className="circuito-sensores" aria-label="Sensores simulados">
    <small>LEITURAS SIMULADAS</small>
    <div data-sensor="colisao" data-nivel={e.sensor.alerta ? 'critico' : e.sensor.eco ? 'atencao' : 'livre'}>
      <span>◉ Sensor frontal</span><strong>{e.sensor.eco ? `${d(e.sensor.distanciaCm / 100)} m` : '> 4 m'}</strong>
      <small>{e.sensor.eco ? 'Colisão · alerta ≤ 1,5 m' : 'Sem obstáculo no alcance de 4 m'}</small>
    </div>
    <div data-sensor="inclinacao" data-nivel={roll >= 20 ? 'critico' : roll >= 12 ? 'atencao' : 'livre'}>
      <span>◴ Inclinação lateral</span><strong>{d(e.atitude.rolagemGraus)}°</strong>
      <small>Atenção 12° · perigo 20° · tombo 30°</small>
    </div>
    <div data-sensor="velocidade" data-nivel={e.maquina.velocidadeKph > 7 && roll >= 20 ? 'critico' : 'livre'}>
      <span>↗ Velocidade{e.maquina.re ? ' · ré' : ''}</span><strong>{d(e.maquina.velocidadeKph)} km/h</strong>
      <small>Máx. {e.tetoKph} km/h · encosta &lt; 7 km/h</small>
    </div>
    <div data-sensor="agua" data-nivel={agua.nivel === 'dentro' ? 'critico' : agua.nivel === 'rumo' ? 'atencao' : 'livre'}>
      <span>≈ Área alagada</span><strong>{agua.nivel === 'dentro' ? 'Dentro' : agua.nivel === 'rumo' ? 'Chegando' : 'Longe'}</strong>
      <small>{agua.nivel === 'fora' ? 'Avisa 3 s antes de entrar' : agua.nivel === 'dentro' ? 'Saia · 2 s dentro encerra a corrida' : 'Entrada prevista em até 3 s · desvie'}</small>
    </div>
  </section>;
}
