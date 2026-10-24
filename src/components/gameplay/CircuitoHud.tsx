import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { CanalGameplay } from './estadoGameplay';
import { decimalCircuito, metricasCircuito, riscosCircuito, textoResultadoCircuito } from './circuito';
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
import { alertaCabine } from './alertaCabine';
import { useBipeCabine } from './bipeCabine';
import { useSegurancaCabine } from './useSegurancaCabine';
const Webcam = lazy(() => import('./WebcamSonoCabine'));
const ROTULOS = { feno: 'Obstáculo à frente · reduza e desvie', agua: 'Área alagada · contorne', encosta: 'Encosta · reduza a velocidade', sonolencia: 'Olhos fechados · pare em segurança' };
export function CircuitoHud({ motor, sessao, menu, aoMenu, aoAnalisar, aoNovo, touch }: {
  motor: CanalGameplay; sessao: SessaoCircuito; menu: boolean; aoMenu(aberto: boolean): void;
  aoAnalisar(relatorio: RelatorioCircuito): void; aoNovo(): void;
  touch(tecla: string, ligada: boolean): void;
}) {
  const e = useSyncExternalStore(motor.assinar, motor.ler, motor.ler);
  const sono = useSonoCabine();
  const [webcam, setWebcam] = useState(false);
  const [som, setSom] = useState(true);
  useEffect(() => {
    let viva = true;
    void navigator.mediaDevices?.enumerateDevices().then((dispositivos) => {
      if (viva && dispositivos.some((d) => d.kind === 'videoinput')) setWebcam(true);
    }).catch(() => { /* Sem câmera/permissão: a corrida segue sem aviso. */ });
    return () => { viva = false; };
  }, []);
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
  const tocando = som && !menu && !document.hidden && !sessao.registro.resultado;
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
    {!fim && <button className="circuito-menu-botao" onClick={() => aoMenu(!menu)}>Pausa / opções · Esc</button>}
    {!fim && <div className="circuito-avisos" aria-live="polite">{[...riscosCircuito(e, sono?.status === 'alarm')].map(([s, gravidade]) => <p key={s} data-gravidade={gravidade}>{ROTULOS[s]}</p>)}</div>}
    {!menu && !fim && <div className="circuito-touch" aria-label="Controles de toque">{[['ArrowLeft', '←'], ['ArrowDown', 'Freio'], ['ArrowUp', 'Acelerar'], ['ArrowRight', '→']].map(([key, label]) => <button key={key} aria-label={label} onPointerDown={(ev) => { ev.currentTarget.setPointerCapture(ev.pointerId); touch(key, true); }} onPointerUp={() => touch(key, false)} onPointerCancel={() => touch(key, false)} onLostPointerCapture={() => touch(key, false)}>{label}</button>)}</div>}
    {webcam && !fim && <Suspense fallback={null}><div className="circuito-webcam" data-config-aberta={menu}><Webcam silenciosa /></div></Suspense>}
    {menu && !fim && <section className="circuito-dialogo" role="dialog" aria-modal="true" aria-label="Opções do circuito">
      <h2>Corrida pausada</h2><p>Siga as estacas até a chegada. Desvie dos obstáculos e da água; reduza na encosta. Parar para decidir não encerra a corrida.</p>
      <p>↑/W acelera · ↓/S/espaço freia · ←/→ dirigem. R2/L2 e analógicos no controle. Options pausa; ✕/A continua na pausa. Durante a corrida, ✕/A ou C alterna a vista. Arraste para olhar.</p>
      <label><input type="checkbox" checked={som} onChange={(ev) => { setSom(ev.target.checked); if (ev.target.checked) void audio.liberar(); }} /> Sons de risco {som ? 'ligados' : 'desligados'} · tons curtos, sem voz</label>
      <p>Áudio liberado por toque, tecla ou Continuar. Sem som, os sensores e o mapa continuam ativos.</p>
      <label><input type="checkbox" checked={webcam} onChange={(ev) => setWebcam(ev.target.checked)} /> Webcam e detector de sonolência (imagem só neste navegador)</label>
      <p>Liga automaticamente quando há câmera. Você pode desligar aqui. Detector experimental, não sistema de segurança; sem câmera ou permissão a corrida segue normalmente.</p>
      <button onClick={() => { void audio.liberar(); aoMenu(false); }} autoFocus>Continuar</button>
      <button onClick={() => { sessao.terminar('abandono', new Date().toISOString()); motor.encerrar('abandono'); aoMenu(false); }}>Abandonar esta corrida</button>
      <button onClick={() => { if (window.confirm('Abandonar a corrida e sair da simulação?')) window.dispatchEvent(new Event('luca:circuito-sair')); }}>Sair da simulação</button>
    </section>}
    {fim && <section className="circuito-dialogo circuito-resultado" role="region" aria-label="Resultado da corrida" data-motivo={fim.motivo}>
      <small>SIMULAÇÃO · CORRIDA</small><h2>{textoResultadoCircuito(r).titulo}</h2>
      <p>{textoResultadoCircuito(r).resumo}</p>
      <details><summary>Regras e limites</summary><p>{r.regras}</p><p>Pausas: {r.pausas.length}. Não avalia risco de seguro ou máquina real.</p></details>
      <button data-acao="nova-corrida" onClick={aoNovo} autoFocus>Nova corrida <kbd>{confirmar}</kbd></button>
      <button data-acao="analisar-circuito" onClick={() => { setWebcam(false); aoAnalisar(sessao.relatorio()); }}>Analisar relatório · abrir chat dos agentes</button>
    </section>}
  </div>;
}
