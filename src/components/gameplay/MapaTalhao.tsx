import { ROTA_CIRCUITO, INICIO_CIRCUITO } from './circuito';
import { ENCOSTA_TALHAO, TALHAO, ZONAS_TALHAO, type GeofenceTalhao } from './geofenceTalhao';
import type { EstadoGameplay } from './estadoGameplay';
import './mapaTalhao.css';

/**
 * Minimapa do talhão no canto de baixo à direita: zonas de risco, encosta e a
 * máquina com o rumo. Para cima = frente da partida (+X), direita = +Z, então
 * o mapa gira como o operador vê. Embrião do painel do operador (inventário #3).
 */
const tela = (p: { x: number; z: number }) => `${p.z},${-p.x}`;
const caminho = (aneis: { x: number; z: number }[][]) => aneis.map((anel) => `M${anel.map(tela).join('L')}Z`).join('');

export function MapaTalhao({ estado, geofence, circuito = false }: { estado: EstadoGameplay; geofence: GeofenceTalhao; circuito?: boolean }) {
  const { x0, x1, z0, z1 } = TALHAO;
  const { x, z, rumoGraus } = estado.maquina;
  return (
    <figure className="gameplay-mapa" data-geofence={geofence.nivel} aria-label="Mapa do talhão">
      <svg viewBox={`${z0} ${-x1} ${z1 - z0} ${x1 - x0}`} role="img">
        <rect className="gameplay-mapa-talhao" x={z0} y={-x1} width={z1 - z0} height={x1 - x0} />
        <path className="gameplay-mapa-encosta" d={caminho(ENCOSTA_TALHAO.rings)} />
        {ZONAS_TALHAO.map((zona) => (
          <path key={zona.id} className="gameplay-mapa-zona" data-ativa={geofence.zona?.id === zona.id} d={caminho(zona.poligono.rings)} />
        ))}
        {circuito && <><polyline className="gameplay-mapa-rota" points={ROTA_CIRCUITO.map(tela).join(' ')} />
          {INICIO_CIRCUITO.obstaculos?.map((o, i) => <circle key={i} className="gameplay-mapa-fardo" cx={o.z} cy={-o.x} r={o.raioM + 1.05} />)}</>}
        <g className="gameplay-mapa-maquina" data-x={x.toFixed(2)} data-z={z.toFixed(2)} data-heading={rumoGraus.toFixed(2)} transform={`translate(${z} ${-x}) rotate(${-rumoGraus}) scale(1.8)`}>
          <path d="M0,-4.5L3.2,3.5L0,1.8L-3.2,3.5Z" />
        </g>
      </svg>
      <figcaption>{geofence.zona ? geofence.zona.rotulo : 'Talhão · geofence'}</figcaption>
      {circuito && <small>↑ +X · 100 × 100 m<br />Vermelho: água / fardos · âmbar: encosta<br />Tracejado: rota · ▲ trator{(x < x0 || x > x1 || z < z0 || z > z1) && <b> · Fora do mapa</b>}</small>}
    </figure>
  );
}
