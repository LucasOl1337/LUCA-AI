import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { EnviarBancada, envioDoCircuito } from './EnviarBancada';
import type { CanalGameplay } from './estadoGameplay';
import { decimalCircuito, metricasCircuito, REGRAS_CIRCUITO_TELA, riscosCircuito, textoResultadoCircuito } from './circuito';
import { COMANDOS_CABINE } from './comandosCabine';
import { useEntradaCabine } from './useEntradaCabine';
import type { SessaoCircuito, RelatorioCircuito } from './sessaoCircuito';
import { useSonoCabine } from './sonoCabine';
import './circuito.css';
import { MapaTalhao } from './MapaTalhao';
import { SensoresCircuito } from './SensoresCircuito';
import { geofenceTalhao } from './geofenceTalhao';
import { criarAudioCircuito } from './audioCircuito';
import { somCompartilhado } from './somCompartilhado';
import { alertaCabine, rotuloCerca } from './alertaCabine';
import { useBipeCabine } from './bipeCabine';
import { useSegurancaCabine } from './useSegurancaCabine';
import { IconePad } from '../stand/IconePad';
const Webcam = lazy(() => import('./WebcamSonoCabine'));
const ROTULOS = { feno: 'Obstáculo à frente · reduza e desvie', agua: 'Área alagada · contorne', encosta: 'Encosta · reduza a velocidade', sonolencia: 'Olhos fechados · pare em segurança' };
/**
 * Webcam de sonolência da Simulação: liga sozinha quando há câmera e vive
 * acima da corrida (quem monta é o GameplayKiosk, fora do `key` de cada
 * corrida). Assim "Nova corrida" não fecha e reabre câmera e detector.
 */
export function useWebcamCircuito() {
  const [webcam, setWebcam] = useState(false);
  useEffect(() => {
    let viva = true;
    void navigator.mediaDevices?.enumerateDevices().then((dispositivos) => {
      if (viva && dispositivos.some((d) => d.kind === 'videoinput')) setWebcam(true);
    }).catch(() => { /* Sem câmera/permissão: a corrida segue sem aviso. */ });
    return () => { viva = false; };
  }, []);
  return [webcam, setWebcam] as const;
}

/** Cartão da webcam: some (visibility, o vídeo segue tocando pro detector) no resultado e na pausa, sem fechar a câmera. */
export function WebcamCircuito({ motor, sessao, menu, ligada }: { motor: CanalGameplay; sessao: SessaoCircuito; menu: boolean; ligada: boolean }) {
  useSyncExternalStore(motor.assinar, motor.ler, motor.ler);
  if (!ligada) return null;
  const fim = !!sessao.registro.resultado;
  return <Suspense fallback={null}><div className="circuito-webcam" data-config-aberta={menu || fim}><Webcam silenciosa /></div></Suspense>;
}

export function CircuitoHud({ motor, sessao, menu, aoMenu, aoAnalisar, aoNovo, touch, webcam = false, aoWebcam = () => undefined }: {
  motor: CanalGameplay; sessao: SessaoCircuito; menu: boolean; aoMenu(aberto: boolean): void;
  aoAnalisar(relatorio: RelatorioCircuito): void; aoNovo(): void;
  touch(tecla: string, ligada: boolean): void;
  /** Estado da webcam (de quem monta o cartão, `useWebcamCircuito`): a pausa liga e desliga. */
  webcam?: boolean; aoWebcam?(ligada: boolean): void;
}) {
  const e = useSyncExternalStore(motor.assinar, motor.ler, motor.ler);
  const sono = useSonoCabine();
  const [som, setSom] = useState(true);
  // Sair da simulação pede confirmação dentro da pausa (o window.confirm travava o controle).
  const [confirmaSaida, setConfirmaSaida] = useState(false);
  useEffect(() => { if (!menu) setConfirmaSaida(false); }, [menu]);
  const audio = useMemo(() => criarAudioCircuito(), [motor]);
  useEffect(() => somCompartilhado.ligarDestravas(window, document), []);
  useEffect(() => () => audio.parar(), [audio]);
  useEffect(() => { audio.habilitar(som); }, [audio, som]);
  useEffect(() => {
    const atualizar = () => {
      const estado = motor.ler();
      // Um som por vez: proximidade usa o sensor progressivo, não o tom finito de feno.
      audio.atualizar(estado, performance.now(), menu || document.hidden || estado.sensor.eco || estado.contato, sono?.status === 'alarm');
    };
    atualizar();
    const cancelar = motor.assinar(atualizar);
    document.addEventListener('visibilitychange', atualizar);
    return () => { cancelar(); document.removeEventListener('visibilitychange', atualizar); audio.parar(); };
  }, [audio, motor, menu, sono]);
  const painel = alertaCabine(e, sono);
  const tocando = som && !menu && !(typeof document !== 'undefined' && document.hidden) && !sessao.registro.resultado;
  useBipeCabine(tocando && (e.sensor.eco || e.contato) ? painel.bipe : null);
  useSegurancaCabine(tocando && e.fase === 'dirigindo' && (e.sensor.alerta || e.contato));
  const r = sessao.registro, m = metricasCircuito(r);
  const fim = r.resultado;
  const entrada = useEntradaCabine();
  const confirmar = entrada === 'teclado' ? 'Enter' : COMANDOS_CABINE.confirmar[entrada];
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape' || ev.key === 'F1') { ev.preventDefault(); ev.stopImmediatePropagation(); if (!fim) aoMenu(!menu); } };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [aoMenu, menu, fim]);
  return <div className="circuito-hud" data-circuito-hud data-run-id={r.runId} data-resultado={fim?.motivo ?? 'dirigindo'}>
    <div className="circuito-estado" aria-label="Estado do circuito">
      <span>SIMULAÇÃO</span><b>{e.maquina.velocidadeKph.toFixed(0)} km/h</b>
      <span>{Math.round(r.progresso * 100)}% · {decimalCircuito(m.elapsedMs / 1000)} s</span>
    </div>
    {!fim && <><SensoresCircuito estado={e} /><MapaTalhao estado={e} geofence={geofenceTalhao(e.maquina)} circuito /></>}
    {!fim && <button className="circuito-menu-botao" data-pad-voltar="" onClick={() => aoMenu(!menu)}><IconePad botao="bola" />Pausa / opções · Esc</button>}
    {!fim && !menu && e.fase === 'pronto' && <p className="circuito-partida" role="status">
      <kbd>{entrada === 'teclado' ? 'W / ↑' : COMANDOS_CABINE.acelerar[entrada]}</kbd> para partir · siga as estacas até a chegada</p>}
    {!fim && <div className="circuito-avisos" aria-live="polite">{[...riscosCircuito(e, sono?.status === 'alarm')].map(([s, gravidade]) => <p key={s} data-gravidade={gravidade}>{ROTULOS[s]}</p>)}
      {/* Preso na cerca (Lupa, observação da Lixa): só texto; não é risco, não entra nas métricas nem toca. */}
      {painel.cerca && <p data-gravidade="atencao" data-cerca="">{rotuloCerca(entrada)}</p>}</div>}
    {!menu && !fim && <div className="circuito-touch" aria-label="Controles de toque" data-foco-pular="">{[['ArrowLeft', '←'], ['ArrowDown', 'Freio'], ['ArrowUp', 'Acelerar'], ['ArrowRight', '→']].map(([key, label]) => <button key={key} aria-label={label} onPointerDown={(ev) => { ev.currentTarget.setPointerCapture(ev.pointerId); touch(key, true); }} onPointerUp={() => touch(key, false)} onPointerCancel={() => touch(key, false)} onLostPointerCapture={() => touch(key, false)}>{label}</button>)}</div>}
    {menu && !fim && <section className="circuito-dialogo" role="dialog" aria-modal="true" aria-label="Opções do circuito">
      <h2>Corrida pausada</h2>
      <p>Siga as estacas até a chegada, desviando dos obstáculos e da água; reduza na encosta. O tempo parado não conta.</p>
      <label><input type="checkbox" checked={som} onChange={(ev) => { setSom(ev.target.checked); if (ev.target.checked) void audio.liberar(); }} /> Sons de risco {som ? 'ligados' : 'desligados'}</label>
      <label><input type="checkbox" checked={webcam} onChange={(ev) => aoWebcam(ev.target.checked)} /> Webcam e alerta de sonolência</label>
      <details><summary>Comandos e privacidade</summary>
        <p>Controle: R2 acelera · L2 freia e dá ré · analógico esquerdo vira · ✕ troca a câmera · Options pausa · PS volta à Coruja. Teclado: W/↑ acelera · S/↓/espaço freia · A D/← → viram · C troca a câmera · Esc pausa.</p>
        <p>Sons de risco são tons curtos, sem voz. A imagem da webcam fica só neste navegador; o alerta de sonolência é experimental, não é sistema de segurança.</p>
      </details>
      <button data-pad-voltar="" onClick={() => { void audio.liberar(); aoMenu(false); }} autoFocus>Continuar <kbd>{confirmar}</kbd> <IconePad botao="bola" /></button>
      <button onClick={() => { sessao.terminar('abandono', new Date().toISOString()); motor.encerrar('abandono'); aoMenu(false); }}>Abandonar esta corrida</button>
      {confirmaSaida
        ? <div className="circuito-confirma-saida" role="group" aria-label="Confirmar saída"><p>Abandonar a corrida e sair da simulação?</p>
          <button data-acao="confirmar-saida" onClick={() => window.dispatchEvent(new Event('luca:circuito-sair'))} autoFocus>Sim, sair pra Coruja</button>
          <button onClick={() => setConfirmaSaida(false)}>Não, ficar</button></div>
        : <button data-acao="sair-simulacao" onClick={() => setConfirmaSaida(true)}><IconePad botao="ps" />Sair da simulação</button>}
    </section>}
    {fim && <section className="circuito-dialogo circuito-resultado" role="region" aria-label="Resultado da corrida" data-motivo={fim.motivo} data-foco-escopo="">
      <small>SIMULAÇÃO · CORRIDA</small><h2>{textoResultadoCircuito(r).titulo}</h2>
      <p>{textoResultadoCircuito(r).resumo}</p>
      <details><summary>Como a corrida é avaliada</summary><ul>{REGRAS_CIRCUITO_TELA.map((t) => <li key={t}>{t}</li>)}</ul>{r.pausas.length > 0 && <p>Pausas nesta corrida: {r.pausas.length}.</p>}</details>
      <button data-acao="nova-corrida" onClick={aoNovo} autoFocus>Nova corrida <kbd>{confirmar}</kbd></button>
      <button data-acao="analisar-circuito" onClick={() => { aoWebcam(false); aoAnalisar(sessao.relatorio()); }}>Analisar relatório · abrir chat dos agentes</button>
      <EnviarBancada montar={() => envioDoCircuito(sessao.relatorio())} />
      <button data-acao="voltar-coruja" data-pad-voltar="" onClick={() => window.dispatchEvent(new Event('luca:circuito-sair'))}><IconePad botao="bola" />Voltar pra Coruja</button>
    </section>}
  </div>;
}
