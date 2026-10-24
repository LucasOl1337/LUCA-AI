import { ROTA_CIRCUITO } from './circuito';
import type { EstadoGameplay } from './estadoGameplay';
import { GEOFENCE_HORIZONTE_S, GEOFENCE_MIN_KPH, TALHAO, ZONAS_TALHAO, type GeofenceTalhao } from './geofenceTalhao';
import { encostaPorFaixa, obstaculosDoMapa, TRATOR_MAX_MAPA, type CenarioMapa, type CelulaEncosta } from './zonasOperador';
import { GAMEPLAY_ECO_MAXIMO_CM } from './estadoGameplay';
import './mapaOperador.css';

/**
 * Mapa do painel do operador (tablet): o talhão inteiro com o Trator MAX em
 * escala e no rumo, as zonas de sinistro em vermelho e o possível sinistro em
 * amarelo. Mesmo referencial do minimapa da cabine: para cima = frente da
 * partida (+X), direita = +Z. Só desenha o que vem do retrato e das regras do
 * jogo (zonasOperador.ts); sem retrato atual o mapa fica marcado como velho.
 */
const tela = (p: { x: number; z: number }) => `${p.z},${-p.x}`;
const caminho = (aneis: { x: number; z: number }[][]) => aneis.map((anel) => `M${anel.map(tela).join('L')}Z`).join('');
/** Células de 1 m viram faixas: as vizinhas na mesma linha (mesmo x) se juntam num retângulo só. */
function celulas(lista: CelulaEncosta[]) {
  const linhas = new Map<number, number[]>();
  for (const c of lista) linhas.set(c.x, [...(linhas.get(c.x) ?? []), c.z]);
  let d = '';
  for (const [x, zs] of linhas) {
    zs.sort((a, b) => a - b);
    for (let i = 0; i < zs.length;) {
      let j = i;
      while (j + 1 < zs.length && zs[j + 1] === zs[j] + 1) j += 1;
      d += `M${zs[i]},${-x - 1}h${zs[j] - zs[i] + 1}v1H${zs[i]}Z`;
      i = j + 1;
    }
  }
  return d;
}
let caminhosEncosta: { atencao: string; critica: string } | null = null;
const encostaDesenhada = () => {
  if (!caminhosEncosta) { const e = encostaPorFaixa(); caminhosEncosta = { atencao: celulas(e.atencao), critica: celulas(e.critica) }; }
  return caminhosEncosta;
};
const num = (v: number) => v.toFixed(2);

export type EstadoMapa = 'atual' | 'pausado' | 'velho';

export function MapaOperador({ estado, geofence, cenario, situacao }: {
  estado: EstadoGameplay; geofence: GeofenceTalhao; cenario: CenarioMapa; situacao: EstadoMapa;
}) {
  const { x0, x1, z0, z1 } = TALHAO;
  const { x, z, rumoGraus, velocidadeKph, re } = estado.maquina;
  const encosta = encostaDesenhada();
  const obstaculos = obstaculosDoMapa(cenario);
  const atual = situacao !== 'velho';
  // Faixa amarela da água: até onde a projeção de 3 s do geofence alcança no teto de velocidade deste desafio.
  const faixaAguaM = estado.tetoKph / 3.6 * GEOFENCE_HORIZONTE_S;
  // Linha amarela: onde a máquina estará em 3 s no rumo e na velocidade atuais (a mesma projeção do aviso "rumo").
  const projetaM = atual && velocidadeKph >= GEOFENCE_MIN_KPH ? velocidadeKph / 3.6 * GEOFENCE_HORIZONTE_S * (re ? -1 : 1) : 0;
  const ecoM = estado.sensor.eco ? estado.sensor.distanciaCm / 100 : null;
  const alcanceM = GAMEPLAY_ECO_MAXIMO_CM / 100;
  const t = TRATOR_MAX_MAPA, meioC = t.comprimentoM / 2, meioL = t.larguraM / 2;
  const foraDoMapa = x < x0 || x > x1 || z < z0 || z > z1;
  return (
    <figure className="mapa-operador" data-situacao={situacao} data-geofence={atual ? geofence.nivel : 'sem-dado'} aria-label="Mapa do talhão com o trator em escala">
      <svg viewBox={`${z0} ${-x1} ${z1 - z0} ${x1 - x0}`} role="img" aria-labelledby="mapa-operador-titulo">
        <title id="mapa-operador-titulo">{`Trator em x ${x.toFixed(1)} m, z ${z.toFixed(1)} m, rumo ${Math.round(rumoGraus)}°`}</title>
        <defs>
          <pattern id="mapa-operador-grade" width="10" height="10" patternUnits="userSpaceOnUse" x={z0} y={-x1}>
            <path d="M10,0H0V10" className="mapa-operador-grade" />
          </pattern>
          <pattern id="mapa-operador-hachura" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0,0V3" className="mapa-operador-hachura" />
          </pattern>
        </defs>
        <rect className="mapa-operador-talhao" x={z0} y={-x1} width={z1 - z0} height={x1 - x0} />
        <rect x={z0} y={-x1} width={z1 - z0} height={x1 - x0} fill="url(#mapa-operador-grade)" />
        {cenario === 'circuito' && <polyline className="mapa-operador-rota" points={ROTA_CIRCUITO.map(tela).join(' ')} />}

        {/* Possível sinistro (amarelo): encosta de 12° a 20° e a faixa onde o aviso "rumo à área alagada" pode acender. */}
        <path className="mapa-operador-atencao" data-zona="encosta" d={encosta.atencao} />
        {ZONAS_TALHAO.map((zona) => {
          const anel = zona.poligono.rings[0], xs = anel.map((a) => a.x), zs = anel.map((a) => a.z);
          const ax0 = Math.min(...xs), ax1 = Math.max(...xs), az0 = Math.min(...zs), az1 = Math.max(...zs);
          return <rect key={`faixa-${zona.id}`} className="mapa-operador-atencao" data-zona={`${zona.id}-faixa`}
            x={az0 - faixaAguaM} y={-ax1 - faixaAguaM} width={az1 - az0 + 2 * faixaAguaM} height={ax1 - ax0 + 2 * faixaAguaM} rx={faixaAguaM} />;
        })}

        {/* Zona de sinistro (vermelho): área alagada (atola em 2 s), encosta de 20° ou mais e o raio de colisão dos obstáculos. */}
        <path className="mapa-operador-perigo" data-zona="encosta-critica" d={encosta.critica} />
        {ZONAS_TALHAO.map((zona) => (
          <path key={zona.id} className="mapa-operador-perigo" data-zona={zona.id}
            data-ativa={atual && geofence.zona?.id === zona.id ? geofence.nivel : undefined} d={caminho(zona.poligono.rings)} />
        ))}
        {obstaculos.map((o, i) => (
          <g key={i} data-obstaculo={o.tipo}>
            <circle className="mapa-operador-perigo" cx={o.z} cy={-o.x} r={o.raioM + o.folgaM} />
            <circle className="mapa-operador-obstaculo" cx={o.z} cy={-o.x} r={o.raioM} />
          </g>
        ))}

        <text className="mapa-operador-rotulo" x={16.5} y={-27}>Área alagada</text>
        <text className="mapa-operador-rotulo" x={-24} y={-35} transform="rotate(-90 -24 -35)">Encosta</text>

        {projetaM !== 0 && (
          <line className="mapa-operador-projecao" x1={z} y1={-x} x2={z - Math.sin(rumoGraus * Math.PI / 180) * projetaM} y2={-x - Math.cos(rumoGraus * Math.PI / 180) * projetaM} />
        )}

        {/* Trator MAX em escala (metros) e no rumo: corpo 4,5 × 2,7 m, rodas e eixos do rig, corredor do HC-SR04. */}
        <g className="mapa-operador-trator" data-x={x.toFixed(2)} data-z={z.toFixed(2)} data-heading={rumoGraus.toFixed(2)}
          data-comprimento-m={t.comprimentoM} data-largura-m={t.larguraM} transform={`translate(${num(z)} ${num(-x)}) rotate(${num(-rumoGraus)})`}>
          <circle className="mapa-operador-halo" r={6} />
          <rect className="mapa-operador-sensor" x={-t.bitolaM / 2} y={-t.sensorFrenteM - alcanceM} width={t.bitolaM} height={alcanceM} />
          {ecoM !== null && <line className="mapa-operador-eco" data-alerta={estado.sensor.alerta} x1={-t.bitolaM / 2} x2={t.bitolaM / 2} y1={-t.sensorFrenteM - ecoM} y2={-t.sensorFrenteM - ecoM} />}
          {t.rodas.flatMap((roda) => [-1, 1].map((lado) => (
            <rect key={`${roda.x}${lado}`} className="mapa-operador-roda" x={lado * roda.z - 0.25} y={-roda.x - roda.raio} width={0.5} height={roda.raio * 2} />
          )))}
          <rect className="mapa-operador-corpo" x={-meioL} y={-meioC} width={t.larguraM} height={t.comprimentoM} rx={0.5} />
          <path className="mapa-operador-frente" d={`M0,${-meioC + 0.2}L${meioL - 0.4},${-meioC + 1.4}H${-meioL + 0.4}Z`} />
          <circle className="mapa-operador-emissor" cy={-t.sensorFrenteM} r={0.3} />
        </g>

        <g className="mapa-operador-escala" transform={`translate(${z0 + 3} ${-x0 - 3})`}>
          <rect x={-1.5} y={-5.5} width={15} height={7} rx={1} />
          <path d="M0,0H10M0,-1V1M10,-1V1" />
          <text x={11} y={0.8}>10 m</text>
        </g>
        {situacao === 'velho' && <rect className="mapa-operador-velho" x={z0} y={-x1} width={z1 - z0} height={x1 - x0} fill="url(#mapa-operador-hachura)" />}
      </svg>
      <figcaption>
        <span>{situacao === 'velho' ? 'Última posição conhecida' : 'Posição atual'} · rumo {Math.round(((rumoGraus % 360) + 360) % 360)}°{foraDoMapa && <b> · fora do mapa</b>}</span>
        <span className="mapa-operador-legenda">
          <i data-cor="perigo" /> zona de sinistro <i data-cor="atencao" /> possível sinistro <i data-cor="trator" /> trator em escala
        </span>
        {cenario !== 'circuito' && <small>Os fardos de cada desafio não aparecem no mapa; o sensor frontal mostra a distância deles.</small>}
      </figcaption>
    </figure>
  );
}
