import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { CanalGameplay } from './estadoGameplay';
import { metricasCircuito, riscosCircuito } from './circuito';
import type { SessaoCircuito, RelatorioCircuito } from './sessaoCircuito';
import { useSonoCabine } from './sonoCabine';
import './circuito.css';
import { MapaTalhao } from './MapaTalhao';
import { SensoresCircuito } from './SensoresCircuito';
import { geofenceTalhao } from './geofenceTalhao';
import { criarAudioCircuito } from './audioCircuito';
import { somCompartilhado } from './somCompartilhado';
const Webcam = lazy(() => import('./WebcamSonoCabine'));
const ROTULOS = { feno: 'Feno à frente · reduza e desvie', agua: 'Área alagada · contorne', encosta: 'Encosta · reduza a velocidade', sonolencia: 'Olhos fechados · pare em segurança' };
export function CircuitoHud({ motor, sessao, menu, aoMenu, aoAnalisar, aoNovo, touch }: {
  motor: CanalGameplay; sessao: SessaoCircuito; menu: boolean; aoMenu(aberto: boolean): void;
  aoAnalisar(relatorio: RelatorioCircuito): void; aoNovo(): void;
  touch(tecla: string, ligada: boolean): void;
}) {
  const e = useSyncExternalStore(motor.assinar, motor.ler, motor.ler);
  // Só o alarme importa ao áudio; o objeto do sono muda a cada 100 ms de olhos fechados.
  const alarme = useSonoCabine()?.status === 'alarm';
  const [webcam, setWebcam] = useState(false);
  const [som, setSom] = useState(true);
  const audio = useMemo(() => criarAudioCircuito(), [motor]);
  useEffect(() => somCompartilhado.ligarDestravas(window, document), []);
  useEffect(() => () => audio.parar(), [audio]);
  useEffect(() => { audio.habilitar(som); }, [audio, som]);
  useEffect(() => {
    const atualizar = () => audio.atualizar(motor.ler(), performance.now(), menu || document.hidden, alarme);
    atualizar();
    const cancelar = motor.assinar(atualizar);
    document.addEventListener('visibilitychange', atualizar);
    return () => { cancelar(); document.removeEventListener('visibilitychange', atualizar); audio.parar(); };
  }, [audio, motor, menu, alarme]);
  const r = sessao.registro, m = metricasCircuito(r);
  const fim = r.resultado;
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape' || ev.key === 'F1') { ev.preventDefault(); ev.stopImmediatePropagation(); aoMenu(!menu); } };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [aoMenu, menu]);
  return <div className="circuito-hud" data-circuito-hud data-run-id={r.runId} data-resultado={fim?.motivo ?? 'dirigindo'}>
    <div className="circuito-estado" aria-label="Estado do circuito">
      <span>SIMULAÇÃO</span><b>{e.maquina.velocidadeKph.toFixed(0)} km/h</b>
      <span>{Math.round(r.progresso * 100)}% · {(m.elapsedMs / 1000).toFixed(1)} s</span>
    </div>
    {!fim && <><SensoresCircuito estado={e} /><MapaTalhao estado={e} geofence={geofenceTalhao(e.maquina)} circuito /></>}
    <button className="circuito-menu-botao" onClick={() => aoMenu(!menu)}>Pausa / opções · Esc</button>
    {!fim && <div className="circuito-avisos" aria-live="polite">{[...riscosCircuito(e, alarme)].map(([s, gravidade]) => <p key={s} data-gravidade={gravidade}>{ROTULOS[s]}</p>)}</div>}
    {!menu && !fim && <div className="circuito-touch" aria-label="Controles de toque">{[['ArrowLeft', '←'], ['ArrowDown', 'Freio'], ['ArrowUp', 'Acelerar'], ['ArrowRight', '→']].map(([key, label]) => <button key={key} aria-label={label} onPointerDown={(ev) => { ev.currentTarget.setPointerCapture(ev.pointerId); touch(key, true); }} onPointerUp={() => touch(key, false)} onPointerCancel={() => touch(key, false)} onLostPointerCapture={() => touch(key, false)}>{label}</button>)}</div>}
    {webcam && !fim && <Suspense fallback={null}><div className="circuito-webcam" data-config-aberta={menu}><Webcam /></div></Suspense>}
    {menu && !fim && <section className="circuito-dialogo" role="dialog" aria-modal="true" aria-label="Opções do circuito">
      <h2>Simulação pausada</h2><p>Um percurso: siga as estacas até a chegada. Desvie dos fenos e da água; reduza na encosta. Parar para decidir não encerra a missão.</p>
      <p>↑/W acelera · ↓/S/espaço freia · ←/→ dirigem. R2/L2 e analógicos no controle. Options pausa; ✕ continua. Arraste para olhar.</p>
      <label><input type="checkbox" checked={som} onChange={(ev) => { setSom(ev.target.checked); if (ev.target.checked) void audio.liberar(); }} /> Sons de risco {som ? 'ligados' : 'desligados'} · tons curtos, sem voz</label>
      <p>Áudio liberado por toque, tecla ou Continuar. Sem som, os sensores e o mapa continuam ativos.</p>
      <label><input type="checkbox" checked={webcam} onChange={(ev) => setWebcam(ev.target.checked)} /> Ativar webcam de sonolência (opcional, imagem só neste navegador)</label>
      <p>Desligada por padrão. Detector experimental, não sistema de segurança. Permissão negada só pode ser tentada de novo por sua ação.</p>
      <button onClick={() => { void audio.liberar(); aoMenu(false); }} autoFocus>Continuar</button>
      <button onClick={() => { sessao.terminar('abandono', new Date().toISOString()); motor.encerrar('abandono'); aoMenu(false); }}>Abandonar esta run</button>
      <button onClick={() => { if (window.confirm('Abandonar a run e sair da simulação?')) window.dispatchEvent(new Event('luca:circuito-sair')); }}>Sair da simulação</button>
    </section>}
    {fim && <section className="circuito-dialogo circuito-resultado" role="region" aria-label="Resultado do circuito">
      <small>SIMULAÇÃO · {r.runId}</small><h2>{fim.motivo === 'chegada' ? 'Percurso concluído' : fim.motivo === 'abandono' ? 'Run abandonada' : `Sinistro: ${fim.motivo}`}</h2>
      <p>Tempo ativo: {(m.elapsedMs / 1000).toFixed(1)} s · Sinistros evitados (heurística): {m.sinistrosEvitados}</p>
      <p>Reação média após aviso: {m.reacaoMediaMs === null ? 'N/A — nenhuma resposta medida' : `${m.reacaoMediaMs} ms`} · Sem resposta: {m.semResposta}</p>
      <details><summary>Regras e limites</summary><p>{r.regras}</p><p>Pausas: {r.pausas.length}. Não avalia risco de seguro ou máquina real.</p></details>
      <button data-acao="analisar-circuito" onClick={() => { setWebcam(false); aoAnalisar(sessao.relatorio()); }}>Analisar relatório · abrir chat dos agentes</button>
      <button onClick={aoNovo}>Iniciar nova run</button>
    </section>}
  </div>;
}
