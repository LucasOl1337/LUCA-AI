import { COMANDOS_CABINE as C, rotuloTecla, type EntradaCabine } from '../gameplay/comandosCabine';

export function ComandosCabineVisual({ entrada }: { entrada: EntradaCabine }) {
  const controle = entrada !== 'teclado';
  const comandos = [
    ['acelerar', 'Acelerar'], ['frear', 'Frear'], ['esquerda', 'Virar'],
    ['camera', 'Trocar câmera'], ['pausa', 'Pausa'], ['coruja', 'Coruja'],
  ] as const;
  return <div className="cabine-comandos" data-entrada={entrada}>
    <div className="cabine-desenho">
      {controle ? <svg viewBox="0 0 480 260" role="img" aria-label={`Controle ${entrada === 'ps' ? 'PlayStation' : 'Xbox'}`}>
        <path className="cabine-pad-corpo" d="M110 62 Q145 45 240 48 Q335 45 370 62 Q410 90 427 191 Q438 245 399 238 Q377 233 337 180 H143 Q103 233 81 238 Q42 245 53 191 Q70 90 110 62Z" />
        <rect x="104" y="22" width="76" height="37" rx="12" /><text x="142" y="47">{C.frear[entrada]}</text>
        <rect x="300" y="22" width="76" height="37" rx="12" /><text x="338" y="47">{C.acelerar[entrada]}</text>
        <path className="cabine-pad-detalhe" d="M105 111h42m-21-21v42" />
        <circle cx="181" cy="157" r="29" /><text x="181" y="165">↔</text>
        <circle className="cabine-pad-detalhe" cx="292" cy="157" r="25" />
        <circle cx="357" cy="123" r="20" /><text x="357" y="131">{C.camera[entrada]}</text>
        <circle className="cabine-pad-detalhe" cx="333" cy="97" r="9" /><circle className="cabine-pad-detalhe" cx="381" cy="97" r="9" />
        <rect x="215" y="124" width="50" height="29" rx="10" /><text className="cabine-svg-pequeno" x="240" y="144">{C.coruja[entrada]}</text>
        <rect x="267" y="73" width="53" height="26" rx="8" /><text className="cabine-svg-pequeno" x="293" y="91">{entrada === 'ps' ? '≡' : '☰'}</text>
      </svg> : <div className="cabine-teclado" aria-label="Teclas de direção">
        <div><kbd>{rotuloTecla(C.acelerar.teclas[0])}</kbd></div>
        <div><kbd>{rotuloTecla(C.esquerda.teclas[0])}</kbd><kbd>{rotuloTecla(C.frear.teclas[0])}</kbd><kbd>{rotuloTecla(C.direita.teclas[0])}</kbd></div>
        <div className="cabine-setas">↑ &nbsp; ← ↓ →</div>
        <kbd className="cabine-espaco">{rotuloTecla(C.frear.teclas[2])} · freio</kbd>
      </div>}
    </div>
    <dl className="cabine-mapa">{comandos.map(([id, nome]) => {
      const c = C[id];
      let teclas: readonly string[] = c.teclas;
      if (id === 'esquerda') teclas = [...C.esquerda.teclas.slice(0, 1), ...C.direita.teclas.slice(0, 1)];
      return <div key={id}><dt>{nome}</dt><dd>{controle
        ? <kbd>{id === 'esquerda' ? 'Analógico L ↔' : 'ps' in c ? c[entrada] : ''}</kbd>
        : teclas.length ? teclas.map(t => <kbd key={t}>{rotuloTecla(t)}</kbd>) : <span>Menu da pausa</span>}</dd></div>;
    })}</dl>
  </div>;
}
