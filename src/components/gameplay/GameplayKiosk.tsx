import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { criarSomMotor } from './somMotor';
import { CircuitoHud } from './CircuitoHud';
import { criarSessaoCircuito, type RelatorioCircuito } from './sessaoCircuito';
import { INICIO_CIRCUITO, ROTA_CIRCUITO } from './circuito';
import { sonoCabine } from './sonoCabine';
import type * as THREE from 'three';
import { getSompoAgriOutcomes } from '../../../shared/sompo-agri-brief.js';
import { mountSompoAgriStage, type SompoLook, type SompoLookContexto } from '../sompo/createSompoAgriStage';
import { PERFIL_GAMEPLAY } from '../sompo/qualidadeAdaptativa';
import type { SompoCameraRig, SompoDrivePose } from '../sompo/sompoStage';
import type { SompoRenderStats } from '../sompo/sompoStudioConfig';
import { createFirstPersonRig } from '../sompo/firstPersonCamera';
import { nudgeLook, stepLook, type LookState } from '../sompo/firstPersonLook';
import { applyDeadZone, type GamepadLike } from '../sompo/gamepadMapping';
import { firstStandardPad, rumble } from '../sompo/gamepadLoop';
import { DesafioCabine } from './DesafioCabine';
import { PercursoCabine } from './PercursoCabine';
import { PainelCabine } from './PainelCabine';
import SeloFps from './SeloFps';
import { criarMotorGameplay, vibracaoDoEvento, type MotorGameplay } from './motorGameplay';
import { relevoRampaLateral } from './rampaLateral';
import { ZONAS_TALHAO } from './geofenceTalhao';
import { anguloAroRad, bordaReiniciar, comandoDesejado, setaDaTecla, SETAS_SOLTAS, type SetasVolante } from './volante';
import type { CabineGameplay, CriarCabineGameplay } from './cabineGameplay';
import type { ObstaculoGameplay } from './estadoGameplay';
import { aoVivo } from '@/lib/gameplayAoVivo';
import './gameplayKiosk.css';

/** Look do mundo vindo da Visual; constante de módulo (não remonta o palco). */
export interface MundoGameplay {
  look?: (ctx: SompoLookContexto) => SompoLook;
  alturaLavoura?: number;
}

/** Lâmina d'água no palco onde o geofence marca área alagada (mesmo polígono do minimapa). */
const AGUA_DO_TALHAO = ZONAS_TALHAO.filter((zona) => zona.id === 'alagado').map((zona) => {
  const xs = zona.poligono.rings[0].map((p) => p.x), zs = zona.poligono.rings[0].map((p) => p.z);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
});

/** Palco do case do fardo: talhão diurno, Trator MAX, sem roteiro (quem move é o motor). */
const CENARIO = 'max-front-obstacle' as const;
const DESFECHO = getSompoAgriOutcomes(CENARIO)[0].id;
/** Zumbido do motor no DualSense: um pulso curto a cada intervalo, mais forte com R2. */
const MOTOR_PULSO_MS = 240;

type ObstaculoPalco = { x: number; z: number; radius: number };
export type CriarCameraGameplay = typeof createFirstPersonRig;

/** Mesma referência enquanto o motor não troca a lista: o palco só reposiciona fardos quando ela muda. */
function obstaculosDoPalco(motor: MotorGameplay) {
  let origem: readonly ObstaculoGameplay[] | null = null;
  let palco: readonly ObstaculoPalco[] = [];
  return {
    get current() {
      const atual = motor.obstaculos();
      if (atual !== origem) { origem = atual; palco = atual.map((o) => ({ x: o.x, z: o.z, radius: o.raioM })); }
      return palco;
    },
  };
}

function zumbidoMotor(acelerador: number, velocidadeKph: number) {
  const pad = firstStandardPad() as (Gamepad & { vibrationActuator?: GamepadHapticActuator | null }) | null;
  const atuador = pad?.vibrationActuator;
  if (!atuador?.playEffect || (acelerador <= 0 && velocidadeKph < 0.3)) return;
  const fraco = Math.min(0.22, 0.05 + acelerador * 0.12 + velocidadeKph * 0.006);
  void atuador.playEffect('dual-rumble', { startDelay: 0, duration: MOTOR_PULSO_MS + 20, weakMagnitude: fraco, strongMagnitude: 0 }).catch(() => undefined);
}

/**
 * Gameplay da Simulação do stand: o Trator MAX dirigido em primeira pessoa
 * com o DualSense como volante, num laço só (o rAF do palco). Não escreve
 * nada no servidor; □ △ ○ ficam livres, Options reinicia o desafio.
 * `criarCabine` é o ponto da Visual: monta sobre a máquina e recebe o ângulo do aro.
 * `modeloUrl` troca o GLB do MAX (ex.: variante com cabine); sem ele, o do catálogo.
 * `mundo` (Visual) troca o look do palco (luz, névoa, tone mapping) e a altura da lavoura.
 * `seloFps` (/gameplay?fps=1) mostra o selo de FPS no canto; sem ele nada é montado.
 */
/** `desafios`: rodadas alternadas (/gameplay). `percurso`: percurso guiado do totem, com condução livre a um toque. */
export type ExperienciaGameplay = 'desafios' | 'percurso' | 'circuito';

export default function GameplayKiosk({ criarCabine, modeloUrl, criarCamera = createFirstPersonRig, seloFps = false, experiencia = 'desafios', mundo, aoAnalisarCircuito }: { criarCabine?: CriarCabineGameplay; modeloUrl?: string; criarCamera?: CriarCameraGameplay; seloFps?: boolean; experiencia?: ExperienciaGameplay; mundo?: MundoGameplay; aoAnalisarCircuito?(relatorio: RelatorioCircuito): void }) {
  const circuito = experiencia === 'circuito';
  const [volta, setVolta] = useState(0);
  const [menu, setMenu] = useState(false);
  const pausado = useRef(false);
  const pausaInicio = useRef<number | null>(null);
  const ultimoMonotono = useRef(performance.now());
  const sessao = useMemo(() => criarSessaoCircuito(), [volta]);
  const alterarMenu = useCallback((aberto: boolean) => {
    pausado.current = aberto; setMenu(aberto);
    ultimoMonotono.current = performance.now();
    if (aberto) pausaInicio.current = performance.now();
    else if (pausaInicio.current !== null) {
      sessao.pausa(sessao.registro.elapsedMs, performance.now() - pausaInicio.current, 'menu'); pausaInicio.current = null;
    }
  }, [sessao]);
  const motor = useMemo(() => criarMotorGameplay(), [volta]);
  useEffect(() => { if (circuito) { motor.reiniciar(INICIO_CIRCUITO); sessao.registrar(motor.ler()); } }, [motor, circuito, sessao]);
  const raizRef = useRef<HTMLDivElement>(null);
  const palcoRef = useRef<HTMLDivElement>(null);
  const setasRef = useRef<SetasVolante>({ ...SETAS_SOLTAS });
  const lookRef = useRef<LookState>({ yaw: 0, pitch: 0 });
  const [rodada, setRodada] = useState(0);
  // No percurso, Options (ou o botão) recomeça o percurso; "Dirigir livre" tira o roteiro sem sair da cabine.
  const [livre, setLivre] = useState(false);
  const [falhaWebgl, setFalhaWebgl] = useState(false);
  const criarCabineRef = useRef(criarCabine);

  // Rumble pelas bordas do motor (mesmo quadro da física); o zumbido espera o efeito acabar.
  const zumbidoPausaAteRef = useRef(0);
  useEffect(() => motor.aoEvento((evento) => {
    const pedido = vibracaoDoEvento(evento);
    if (!pedido) return;
    zumbidoPausaAteRef.current = performance.now() + (pedido === 'alerta' ? 260 : 460);
    rumble(pedido === 'alerta' ? 'alert' : 'contact');
  }), [motor]);

  // Retrato no DOM para a bancada e o teste ler sem React: ~15 Hz, sem re-render.
  useEffect(() => motor.assinar(() => {
    const raiz = raizRef.current;
    if (!raiz) return;
    const estado = motor.ler();
    raiz.dataset.fase = estado.fase;
    raiz.dataset.distanciaCm = String(estado.sensor.distanciaCm);
    raiz.dataset.velocidadeKph = estado.maquina.velocidadeKph.toFixed(1);
    raiz.dataset.alerta = String(estado.sensor.alerta);
    raiz.dataset.contato = String(estado.contato);
    raiz.dataset.rumoGraus = estado.maquina.rumoGraus.toFixed(1);
    raiz.dataset.esterco = estado.comandos.esterco.toFixed(2);
    raiz.dataset.xM = String(estado.maquina.x); raiz.dataset.zM = String(estado.maquina.z);
    if (circuito) raiz.dataset.marco = String(sessao.registro.proximoMarco);
    // Tablet do operador (inventário #3): sem sessão (StandSemLogin) não há /ws e isto não faz nada.
    aoVivo.enviar(estado);
  }), [motor, circuito, sessao]);

  // Aba oculta (ensaio da feira, C3): o rAF para; o tablet troca "ao vivo" congelado por "jogo pausado".
  useEffect(() => {
    let inicioOculto: number | null = null;
    const trocar = () => {
      aoVivo.marcarOculto(document.hidden);
      ultimoMonotono.current = performance.now();
      if (document.hidden) { inicioOculto = performance.now(); setasRef.current = { ...SETAS_SOLTAS }; }
      else if (circuito && inicioOculto !== null) { sessao.pausa(sessao.registro.elapsedMs, performance.now() - inicioOculto, 'aba oculta'); inicioOculto = null; }
    };
    document.addEventListener('visibilitychange', trocar);
    return () => { document.removeEventListener('visibilitychange', trocar); aoVivo.esquecer(); };
  }, [circuito, sessao]);

  useEffect(() => {
    const mount = palcoRef.current;
    if (!mount) return undefined;
    const somMotor = criarSomMotor();
    void somMotor.carregar();
    const silenciarOculto = () => { if (document.hidden) somMotor.parar(); };
    document.addEventListener('visibilitychange', silenciarOculto);
    let cabine: CabineGameplay | null = null;
    let reiniciarSegurado = false;
    let pulsoMotor = 0;
    let ultimoDt = 0;
    ultimoMonotono.current = performance.now();
    const ativo = { current: true };
    const base = criarCamera(ativo, lookRef);
    const rig: SompoCameraRig = {
      active: () => true,
      update(camera: THREE.PerspectiveCamera, maquina: THREE.Object3D) {
        base.update(camera, maquina);
        if (!cabine && criarCabineRef.current) {
          try { cabine = criarCabineRef.current(); cabine.montar(maquina, camera); } catch (erro) { console.error('Cabine do gameplay falhou; segue sem ela.', erro); cabine = null; criarCabineRef.current = undefined; }
        }
        cabine?.quadro({ estado: motor.ler(), anguloAroRad: anguloAroRad(motor.comando().esterco), dt: ultimoDt });
      },
      // O laço único: pad e setas → volante → física → retrato → eventos, dentro do rAF do palco.
      drive(dt, cena): SompoDrivePose {
        ultimoDt = dt;
        const agoraMonotono = performance.now();
        const passoMonotonoMs = Math.max(0, agoraMonotono - ultimoMonotono.current);
        ultimoMonotono.current = agoraMonotono;
        const pad = firstStandardPad() as GamepadLike | null;
        const borda = bordaReiniciar(pad, reiniciarSegurado);
        reiniciarSegurado = borda.segurado;
        if (borda.reiniciar) {
          if (circuito) alterarMenu(!pausado.current);
          else { setLivre(false); setRodada((n) => n + 1); }
        }
        if (circuito && pausado.current && pad?.buttons[0]?.pressed) alterarMenu(false);
        const olhar = pad ? { yaw: 0 - applyDeadZone(pad.axes[2] ?? 0), pitch: 0 - applyDeadZone(pad.axes[3] ?? 0) } : { yaw: 0, pitch: 0 };
        lookRef.current = stepLook(lookRef.current, olhar, dt, { recenter: !!pad });
        const congelado = circuito && (pausado.current || document.hidden || sessao.registro.resultado !== null);
        const estado = congelado ? motor.ler() : motor.quadro(dt, comandoDesejado(pad, setasRef.current), cena.ground);
        if (circuito && !congelado) {
          sessao.quadro(estado, passoMonotonoMs, new Date().toISOString(), sonoCabine.ler()?.status === 'alarm');
          sessao.registrar(estado);
          if (sessao.registro.resultado) motor.encerrar(sessao.registro.resultado.motivo);
        }
        somMotor.atualizar(motor.ler(), congelado || document.hidden);
        const agora = performance.now();
        if (!congelado && agora >= pulsoMotor && agora >= zumbidoPausaAteRef.current) { pulsoMotor = agora + MOTOR_PULSO_MS; zumbidoMotor(estado.comandos.acelerador, estado.maquina.velocidadeKph); }
        const trator = motor.trator();
        return {
          x: trator.x, z: trator.z, heading: trator.rumo, travel: trator.percurso,
          speedKph: estado.maquina.velocidadeKph, direction: estado.maquina.re ? -1 : 1,
          yawRateDeg: trator.guinada * 180 / Math.PI,
          distanceCm: estado.sensor.distanciaCm, collision: estado.sensor.alerta, braking: estado.comandos.freio > 0.05,
          rollDeg: estado.atitude.rolagemGraus, pitchDeg: estado.atitude.arfagemGraus,
          beacon: estado.sensor.alerta || estado.contato ? 1 : 0,
        };
      },
    };
    const inicio = { current: performance.now() };
    const stage = mountSompoAgriStage({
      mount,
      scenarioId: CENARIO,
      outcomeId: DESFECHO,
      startedAtRef: inicio,
      onModelStatus: (status) => { mount.dataset.modelo = status; },
      onWebglError: () => setFalhaWebgl(true),
      onStats: (stats: SompoRenderStats) => {
        mount.dataset.fps = String(stats.fps); mount.dataset.calls = String(stats.calls);
        mount.dataset.cpuMs = stats.cpuMs.toFixed(1); mount.dataset.triangulos = String(stats.triangles);
      },
      cameraRig: rig,
      adaptiveQuality: true,
      qualityProfile: PERFIL_GAMEPLAY,
      obstaclesRef: obstaculosDoPalco(motor),
      assetUrl: modeloUrl,
      terrainRelief: relevoRampaLateral,
      look: mundo?.look,
      cropHeight: mundo?.alturaLavoura,
      waterZones: AGUA_DO_TALHAO,
      ...(circuito ? { circuitRoute: ROTA_CIRCUITO } : {}),
    });
    return () => {
      document.removeEventListener('visibilitychange', silenciarOculto);
      somMotor.desmontar();
      cabine?.desmontar();
      stage?.dispose();
    };
  }, [motor, modeloUrl, criarCamera, mundo, circuito, sessao, alterarMenu]);

  // Setas dirigem (Q9). Só as setas: as letras do stand (r, n, d, g, f) seguem com a equipe.
  useEffect(() => {
    const trocar = (evento: KeyboardEvent, valor: boolean) => {
      const seta = setaDaTecla(evento.key);
      if (!seta) return;
      evento.preventDefault();
      setasRef.current = { ...setasRef.current, [seta]: valor };
    };
    const descer = (evento: KeyboardEvent) => trocar(evento, true);
    const subir = (evento: KeyboardEvent) => trocar(evento, false);
    const soltar = () => { setasRef.current = { ...SETAS_SOLTAS }; };
    window.addEventListener('keydown', descer);
    window.addEventListener('keyup', subir);
    window.addEventListener('blur', soltar);
    return () => { window.removeEventListener('keydown', descer); window.removeEventListener('keyup', subir); window.removeEventListener('blur', soltar); };
  }, []);

  if (falhaWebgl) throw new Error('WebGL indisponível para o gameplay');

  return (
    <div ref={raizRef} className="gameplay-kiosk" data-gameplay="" data-fase="pronto">
      <div
        ref={palcoRef}
        className="gameplay-kiosk-palco"
        onPointerDown={(evento) => {
          const alvo = evento.currentTarget;
          alvo.setPointerCapture(evento.pointerId);
          let x = evento.clientX, y = evento.clientY;
          const mover = (e: PointerEvent) => { lookRef.current = nudgeLook(lookRef.current, (x - e.clientX) * 0.25, (y - e.clientY) * 0.25); x = e.clientX; y = e.clientY; };
          const parar = () => { alvo.removeEventListener('pointermove', mover); alvo.removeEventListener('pointerup', parar); alvo.removeEventListener('pointercancel', parar); };
          alvo.addEventListener('pointermove', mover);
          alvo.addEventListener('pointerup', parar);
          alvo.addEventListener('pointercancel', parar);
        }}
      />
      {experiencia === 'desafios' && <DesafioCabine key={rodada} canal={motor} />}
      {experiencia === 'percurso' && !livre && <PercursoCabine key={rodada} canal={motor} aoSair={() => setLivre(true)} />}
      {experiencia === 'percurso' && livre && <ConducaoLivre canal={motor} aoPercurso={() => { setLivre(false); setRodada((n) => n + 1); }} />}
      {circuito && <CircuitoHud key={volta} motor={motor} sessao={sessao} menu={menu} aoMenu={alterarMenu}
        aoAnalisar={(relatorio) => aoAnalisarCircuito?.(relatorio)} aoNovo={() => { alterarMenu(false); setVolta((n) => n + 1); }}
        touch={(key, ligada) => { const seta = setaDaTecla(key); if (seta) setasRef.current = { ...setasRef.current, [seta]: ligada }; }} />}
      {seloFps && <SeloFps palcoRef={palcoRef} />}
    </div>
  );
}

/** Condução livre no totem: talhão inteiro, sem roteiro nem nota; o percurso guiado volta a um toque ou com Options. */
function ConducaoLivre({ canal, aoPercurso }: { canal: MotorGameplay; aoPercurso: () => void }) {
  useEffect(() => { canal.reiniciar({}); }, [canal]);
  return (
    <div className="gameplay-desafio gameplay-percurso" data-etapa="livre">
      <PainelCabine canal={canal} />
      <div className="gameplay-percurso-acoes gameplay-percurso-livre">
        <button type="button" data-acao="percurso" onClick={aoPercurso}><kbd>Options</kbd> Percurso guiado</button>
      </div>
    </div>
  );
}
