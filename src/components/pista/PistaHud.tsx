import { useEffect, useState } from 'react';
import { Atalho, IconePad } from '../stand/IconePad';
import { decimalCircuito as d, metricasCircuito, textoResultadoCircuito } from '../gameplay/circuito';
import { COMANDOS_CABINE } from '../gameplay/comandosCabine';
import { EnviarBancada, envioDoCircuito } from '../gameplay/EnviarBancada';
import { useEntradaCabine } from '../gameplay/useEntradaCabine';
import type { RelatorioCircuito } from '../gameplay/sessaoCircuito';
import { CAMINHAO } from './fisicaCaminhao';
import { SERRA } from './pistaSerra';
import { REGRAS_PISTA_TELA, type SessaoPista } from './sessaoPista';
import type { RetratoPista } from './corridaPista';
import '../gameplay/circuito.css';
import './pista.css';

const ROTULOS = { animal: 'Animal na pista · freie ou desvie', freio: 'FREIO SEM RESPOSTA · freio-motor e área de escape', curva: 'Curva rápida · reduza ou o caminhão tomba' } as const;
const nivel = (r: RetratoPista, s: keyof typeof ROTULOS) => r.riscos.get(s) ?? 'livre';
export const BOTAO_FREIO_MOTOR = { botao: 1, botaoAlt: 5, ps: '○ ou R1', xbox: 'B ou RB', teclas: ['e', 'shift'] } as const;

/** Mapinha da serra: traçado em perfil (descida) com o caminhão, o animal e a área de escape. */
function PerfilSerra({ r }: { r: RetratoPista }) {
  const x = (s: number) => 4 + (s / SERRA.chegadaS) * 152;
  return <svg className="pista-perfil" viewBox="0 0 160 40" role="img" aria-label={`Descida: ${Math.round(r.caminhao.s)} de ${SERRA.chegadaS} m`}>
    <path d="M4 8 L50 11 L65 13 L95 25 L135 34 L156 35" />
    <rect x={x(SERRA.escape.s0)} y={20} width={x(SERRA.escape.s1) - x(SERRA.escape.s0)} height={5} data-escape="" />
    <circle cx={x(SERRA.animalS)} cy={10} r={2} data-animal="" />
    <circle cx={x(Math.min(SERRA.chegadaS, r.caminhao.s))} cy={8 + 27 * Math.max(0, Math.min(1, (r.caminhao.s - 300) / 1100))} r={3} data-caminhao="" />
  </svg>;
}

export function PistaHud({ r, sessao, menu, aoMenu, aoNovo, aoAnalisar, aoTrocar, touch }: {
  r: RetratoPista; sessao: SessaoPista; menu: boolean; aoMenu(aberto: boolean): void; aoNovo(): void;
  aoAnalisar(relatorio: RelatorioCircuito): void; aoTrocar(): void; touch(tecla: string, ligada: boolean): void;
}) {
  const entrada = useEntradaCabine();
  const reg = sessao.registro, m = metricasCircuito(reg), fim = reg.resultado;
  const c = r.caminhao, kph = c.velocidade * 3.6;
  const confirmar = entrada === 'teclado' ? 'Enter' : COMANDOS_CABINE.confirmar[entrada];
  const freioMotor = entrada === 'teclado' ? 'E' : BOTAO_FREIO_MOTOR[entrada];
  // Sair pede confirmação na própria pausa (window.confirm travava o controle).
  const [confirmaSaida, setConfirmaSaida] = useState(false);
  useEffect(() => { if (!menu) setConfirmaSaida(false); }, [menu]);
  return <div className="circuito-hud pista-hud" data-circuito-hud data-pista-hud data-run-id={reg.runId} data-resultado={fim?.motivo ?? 'dirigindo'} data-freio={r.falhaFreio ? 'falhou' : 'ok'}>
    <div className="circuito-estado" aria-label="Estado da corrida">
      <span>SIMULAÇÃO · CAMINHÃO</span><b>{kph.toFixed(0)} km/h</b>
      <span>{Math.round(reg.progresso * 100)}% · {d(m.elapsedMs / 1000)} s</span>
    </div>
    {r.falhaFreio && !fim && <p className="pista-freio-falhou" role="alert">FREIO SEM RESPOSTA <small>segure {freioMotor} (freio-motor) · área de escape à direita</small></p>}
    {!fim && <section className="circuito-sensores" aria-label="Sensores simulados">
      <small>LEITURAS SIMULADAS</small>
      <div data-sensor="colisao" data-nivel={nivel(r, 'animal')}>
        <span>◉ Radar frontal</span><strong>{r.radar ? `${d(r.radar.distanciaM)} m` : `> ${70} m`}</strong>
        <small>{r.radar ? `Animal · colisão em ${Number.isFinite(r.radar.ttcS) ? d(r.radar.ttcS) : '–'} s` : 'Sem obstáculo no alcance'}</small>
      </div>
      <div data-sensor="freio" data-nivel={r.falhaFreio ? (r.riscos.get('freio') ?? 'atencao') : 'livre'}>
        <span>◎ Freio de serviço</span><strong>{Math.round(r.eficienciaFreio * 100)}%</strong>
        <small>{r.falhaFreio ? `Sem resposta · freio-motor ${c.freioMotor ? 'LIGADO' : 'desligado'}` : 'Pressão normal'}</small>
      </div>
      <div data-sensor="inclinacao" data-nivel={nivel(r, 'curva')}>
        <span>◴ Força lateral</span><strong>{d(c.aLatG, 2)} g{c.derrapando ? " · derrapando" : ""}</strong>
        <small>Atenção {d(CAMINHAO.latAvisoG, 2)} · perigo {d(CAMINHAO.latPerigoG, 2)} · tombo {d(CAMINHAO.latTomboG, 2)}{r.curva && r.curva.distanciaM < 150 ? ` · curva em ${Math.round(r.curva.distanciaM)} m, ${Math.round(r.curva.seguraKph)} km/h` : ''}</small>
      </div>
      <div data-sensor="velocidade" data-nivel={kph > 75 ? 'critico' : 'livre'}>
        <span>↗ Velocidade · {c.marcha}ª</span><strong>{d(kph)} km/h</strong>
        <small>{c.rpm} rpm · descida {d(Math.max(0, -c.rampa * 100))}%</small>
      </div>
    </section>}
    {!fim && <aside className="gameplay-mapa pista-mapa"><small>SERRA SEM FREIO · {Math.round(c.s)} / {SERRA.chegadaS} m</small><PerfilSerra r={r} /></aside>}
    {!fim && <button className="circuito-menu-botao" data-pad-voltar="" onClick={() => aoMenu(!menu)}><Atalho entrada={entrada} botao="bola" tecla="Esc" xbox="Menu" />Pausa / opções</button>}
    {!fim && !menu && r.fase === 'pronto' && <p className="circuito-partida" role="status">
      <Atalho entrada={entrada} botao="r2" tecla="W / ↑" xbox={COMANDOS_CABINE.acelerar.xbox} /> para partir · desça a serra até o pé</p>}
    {!fim && <div className="circuito-avisos" aria-live="polite">{[...r.riscos].map(([s, g]) => <p key={s} data-gravidade={g}>{ROTULOS[s]}</p>)}</div>}
    {!menu && !fim && <div className="circuito-touch" aria-label="Controles de toque" data-foco-pular="">{[['ArrowLeft', '←'], ['ArrowDown', 'Freio'], ['e', 'Freio-motor'], ['ArrowUp', 'Acelerar'], ['ArrowRight', '→']].map(([key, label]) => <button key={key} aria-label={label} onPointerDown={(ev) => { ev.currentTarget.setPointerCapture(ev.pointerId); touch(key, true); }} onPointerUp={() => touch(key, false)} onPointerCancel={() => touch(key, false)} onLostPointerCapture={() => touch(key, false)}>{label}</button>)}</div>}
    {menu && !fim && <section className="circuito-dialogo" role="dialog" aria-modal="true" aria-label="Opções da corrida">
      <h2>Corrida pausada</h2>
      <p>Desça a serra até o pé. O freio vai falhar na descida forte: use o freio-motor e, se precisar, a área de escape à direita. Cuidado com o animal na reta.</p>
      <details open><summary>Comandos</summary>
        <p>Controle: R2 acelera · L2 freia · analógico esquerdo vira · ○/B ou R1/RB freio-motor · ✕ troca a câmera · Options pausa · PS volta à Coruja. Teclado: W/↑ acelera · S/↓/espaço freia · A D/← → viram · E freio-motor · C câmera · Esc pausa.</p>
      </details>
      <button data-pad-voltar={confirmaSaida ? undefined : ''} onClick={() => aoMenu(false)} autoFocus>Continuar <Atalho entrada={entrada} botao="cruz" tecla={confirmar} xbox={confirmar} />{entrada === 'ps' && <IconePad botao="bola" />}</button>
      <button data-acao="trocar-veiculo" onClick={aoTrocar}>Trocar para o trator</button>
      <button onClick={() => { sessao.terminar('abandono', new Date().toISOString()); aoMenu(false); }}>Abandonar esta corrida</button>
      {confirmaSaida
        ? <div className="circuito-confirma-saida" role="group" aria-label="Confirmar saída"><p>Abandonar a corrida e sair da simulação?</p>
          <button data-acao="confirmar-saida" onClick={() => window.dispatchEvent(new Event('luca:circuito-sair'))} autoFocus>Sim, sair pra Coruja</button>
          <button data-pad-voltar="" onClick={() => setConfirmaSaida(false)}><IconePad botao="bola" />Não, ficar</button></div>
        : <button data-acao="sair-simulacao" onClick={() => setConfirmaSaida(true)}><IconePad botao="ps" />Sair da simulação</button>}
    </section>}
    {fim && <section className="circuito-dialogo circuito-resultado" role="region" aria-label="Resultado da corrida" data-motivo={fim.motivo} data-foco-escopo="">
      <small>SIMULAÇÃO · CAMINHÃO NA SERRA</small><h2>{textoResultadoCircuito(reg).titulo}</h2>
      <p>{textoResultadoCircuito(reg).resumo}</p>
      <details><summary>Como a corrida é avaliada</summary><ul>{REGRAS_PISTA_TELA.map((t) => <li key={t}>{t}</li>)}</ul>{reg.pausas.length > 0 && <p>Pausas nesta corrida: {reg.pausas.length}.</p>}</details>
      <button data-acao="nova-corrida" onClick={aoNovo} autoFocus>Nova corrida <Atalho entrada={entrada} botao="cruz" tecla={confirmar} xbox={confirmar} /></button>
      <button data-acao="analisar-circuito" onClick={() => aoAnalisar(sessao.relatorio())}>Analisar na bancada de agentes</button>
      <EnviarBancada montar={() => envioDoCircuito(sessao.relatorio(), { veiculo: 'caminhao', cenario: 'serra-sem-freio' })} />
      <button data-acao="trocar-veiculo" onClick={aoTrocar}>Dirigir o trator</button>
      <button data-acao="voltar-coruja" data-pad-voltar="" onClick={() => window.dispatchEvent(new Event('luca:circuito-sair'))}><IconePad botao="bola" />Voltar pra Coruja</button>
    </section>}
  </div>;
}
