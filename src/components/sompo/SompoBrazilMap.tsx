import { useId } from 'react';
import geometry from './brazilMapGeometry.json';

// Conexões ilustrativas entre regiões agrícolas do país, sem vínculo com dispositivos ou apólices.
const regions = [
  { x: 287.1, y: 275.5 }, { x: 360.9, y: 314.2 },
  { x: 334.3, y: 406.2 }, { x: 431.1, y: 258.5 },
  { x: 405.6, y: 338.4 }, { x: 313.7, y: 467.9 },
  { x: 294.3, y: 359 },
];
const connections = [
  'M287.1,275.5 Q330,270 360.9,314.2',
  'M360.9,314.2 Q398,263 431.1,258.5',
  'M360.9,314.2 Q392,308 405.6,338.4',
  'M360.9,314.2 Q362,365 334.3,406.2',
  'M334.3,406.2 Q335,439 313.7,467.9',
  'M287.1,275.5 Q270,325 294.3,359',
  'M294.3,359 Q309,393 334.3,406.2',
];

// viewBox justo ao contorno (bbox 62..536 × 48..520) para o mapa ocupar a coluna inteira.
const VIEW_BOX = '48 34 502 500';

export default function SompoBrazilMap() {
  const id = useId().replace(/:/g, '');
  return (
    <figure className="sompo-brazil-map" aria-label="Mapa do Brasil com conexões entre regiões agrícolas">
      <svg viewBox={VIEW_BOX} aria-hidden="true" className="sompo-brazil-map-svg">
        <defs>
          <linearGradient id={`${id}-land`} x1="0" y1="0" x2="0.8" y2="1">
            <stop stopColor="#122d4c" /><stop offset="1" stopColor="#0a1629" />
          </linearGradient>
          <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#3d79b7" stopOpacity="0.35" /><stop offset="0.6" stopColor="#82c7ff" /><stop offset="1" stopColor="#1b5eaa" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id={`${id}-scan`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#64d2ff" stopOpacity="0" /><stop offset="1" stopColor="#64d2ff" stopOpacity="0.13" />
          </linearGradient>
          <pattern id={`${id}-dots`} width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.7" fill="#82c7ff" opacity="0.35" /></pattern>
          <clipPath id={`${id}-brazil`}><path d={geometry.outline} /></clipPath>
        </defs>
        <path d={geometry.outline} transform="translate(0 8)" fill="#060c16" stroke="#2e6ba2" strokeOpacity="0.18" strokeWidth="1" />
        <path d={geometry.outline} fill={`url(#${id}-land)`} stroke={`url(#${id}-edge)`} strokeWidth="1.4" />
        <g clipPath={`url(#${id}-brazil)`}>
          <rect x="0" y="0" width="620" height="570" fill={`url(#${id}-dots)`} />
          <g fill="none" stroke="#82c7ff" strokeOpacity="0.18" strokeWidth="0.65">{geometry.states.map(state => <path key={state.id} d={state.path} />)}</g>
          <rect className="sompo-brazil-scan" x="0" y="-140" width="620" height="140" fill={`url(#${id}-scan)`} />
          <g fill="none" stroke="#82c7ff" strokeWidth="1.1" strokeOpacity="0.6">{connections.map(path => <path key={path} d={path} />)}</g>
        </g>
        {regions.map(({ x, y }, index) => (
          <g key={index} transform={`translate(${x} ${y})`}>
            <circle className="sompo-brazil-signal" r="9" fill="none" stroke="#64d2ff" strokeWidth="0.7" style={{ animationDelay: `${index * -0.7}s` }} />
            <circle r="4.5" fill="#0d253d" stroke="#8ed7ff" strokeWidth="1" />
            <circle r="1.6" fill="#d9f0ff" />
          </g>
        ))}
      </svg>
    </figure>
  );
}
