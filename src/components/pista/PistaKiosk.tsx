import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { comandoDesejado, setaDaTecla, SETAS_SOLTAS, bordaReiniciar, type SetasVolante } from '../gameplay/volante';
import { COMANDOS_CABINE } from '../gameplay/comandosCabine';
import { applyDeadZone, type GamepadLike } from '../sompo/gamepadMapping';
import { firstStandardPad, rumble } from '../sompo/gamepadLoop';
import { stepLook } from '../sompo/firstPersonLook';
import { somCompartilhado } from '../gameplay/somCompartilhado';
import { registrarContextoCorrida } from '../gameplay/contextoCorrida';
import { useSegurancaCabine } from '../gameplay/useSegurancaCabine';
import type { RelatorioCircuito } from '../gameplay/sessaoCircuito';
import SeloFps from '../gameplay/SeloFps';
import { criarCorridaPista, type RetratoPista } from './corridaPista';
import { PISTA_SERRA, pontoLateral } from './pistaSerra';
import { criarSessaoPista } from './sessaoPista';
import { montarPalcoSerra } from './palcoSerra';
import { criarAudioPista } from './audioPista';
import { BOTAO_FREIO_MOTOR, PistaHud } from './PistaHud';
import type { VistaPista } from './atoresSerra';
import './pista.css';

const ESPERA_RESULTADO_MS = 1200;
const TECLAS_FREIO_MOTOR = new Set(['e', 'shift']);

/**
 * Caminhão na serra sem freio (pedido do Lucas, 24/10): mesmo controle e HUD do
 * trator, corrida contínua com registro no formato do circuito. Uma corrida por
 * `volta`; "Nova corrida" monta motor e sessão novos, o palco fica.
 */
export default function PistaKiosk({ seloFps = false, aoAnalisar, aoTrocar }: { seloFps?: boolean; aoAnalisar?(relatorio: RelatorioCircuito): void; aoTrocar?(): void }) {
  const [volta, setVolta] = useState(0);
  const corrida = useMemo(() => criarCorridaPista(), [volta]);
  const sessao = useMemo(() => criarSessaoPista(), [volta]);
  const [retrato, setRetrato] = useState<RetratoPista>(() => corrida.ler());
  const [menu, setMenu] = useState(false);
  const [vista, setVista] = useState<VistaPista>('externa');
  const [falhaWebgl, setFalhaWebgl] = useState(false);
  const raizRef = useRef<HTMLDivElement>(null), palcoRef = useRef<HTMLDivElement>(null);
  const setas = useRef<SetasVolante>({ ...SETAS_SOLTAS }), freioMotorTecla = useRef(false);
  const estado = useRef({ corrida, sessao, menu, vista, pausaInicio: null as number | null });
  estado.current.corrida = corrida; estado.current.sessao = sessao; estado.current.menu = menu; estado.current.vista = vista;
  const audio = useMemo(() => criarAudioPista(), []);
  useEffect(() => somCompartilhado.ligarDestravas(window, document), []);
  useEffect(() => () => audio.desmontar(), [audio]);

  const alterarMenu = useCallback((aberto: boolean) => {
    const e = estado.current;
    if (aberto === e.menu || e.sessao.registro.resultado) { setMenu(false); return; }
    if (aberto) e.pausaInicio = performance.now();
    else if (e.pausaInicio !== null) { e.sessao.pausa(e.sessao.registro.elapsedMs, performance.now() - e.pausaInicio, 'menu'); e.pausaInicio = null; }
    e.menu = aberto; setMenu(aberto);
  }, []);
  const novaCorrida = useCallback(() => { estado.current.pausaInicio = null; setMenu(false); setVolta((n) => n + 1); }, []);
  const novaRef = useRef(novaCorrida); novaRef.current = novaCorrida;
  const trocarVista = useCallback(() => setVista((v) => (v === 'externa' ? 'cabine' : 'externa')), []);

  // Contexto para a voz da Coruja (mesmo canal do trator).
  useEffect(() => registrarContextoCorrida(() => {
    const r = estado.current.corrida.ler();
    return { velocidadeKph: r.caminhao.velocidade * 3.6, distanciaCm: r.radar ? r.radar.distanciaM * 100 : null,
      fase: estado.current.sessao.registro.resultado ? 'fim' : estado.current.menu || document.hidden ? 'pausa' : 'dirigindo' };
  }), []);

  // Palco único: o laço de jogo roda dentro do rAF do palco.
  useEffect(() => {
    const mount = palcoRef.current; if (!mount) return;
    let look = { yaw: 0, pitch: 0 }, opcoesSeguro = false, cameraSegura = false, fmSeguro = false, fimAte: number | null = null;
    let sessaoVista: unknown = null;
    let ultimoHud = 0, inicioOculto: number | null = null;
    const oculto = () => {
      const s = estado.current.sessao;
      if (document.hidden) inicioOculto = performance.now();
      else if (inicioOculto !== null) { s.pausa(s.registro.elapsedMs, performance.now() - inicioOculto, 'aba oculta'); inicioOculto = null; }
    };
    document.addEventListener('visibilitychange', oculto);
    const palco = montarPalcoSerra({
      mount,
      aoErroWebgl: () => setFalhaWebgl(true),
      aoStats: (s) => { const raiz = raizRef.current; if (raiz) { raiz.dataset.fps = String(s.fps); raiz.dataset.calls = String(s.calls); raiz.dataset.cpuMs = s.cpuMs.toFixed(1); } },
      aoModelo: (status) => { if (raizRef.current) raizRef.current.dataset.modelo = status; },
      passo(dt) {
        const e = estado.current, { corrida: c, sessao: s } = e;
        if (sessaoVista !== s) { sessaoVista = s; fimAte = null; palco.reiniciar(); }
        const pad = firstStandardPad() as GamepadLike | null;
        const opcoes = bordaReiniciar(pad, opcoesSeguro); opcoesSeguro = opcoes.segurado;
        const fim = s.registro.resultado;
        if (fim && fimAte === null) fimAte = performance.now() + ESPERA_RESULTADO_MS;
        if (opcoes.reiniciar && !fim) alterarMenu(!e.menu);
        const cameraAgora = !!pad?.buttons[COMANDOS_CABINE.camera.botao]?.pressed;
        if (fim) { if (cameraAgora && !cameraSegura && fimAte !== null && performance.now() >= fimAte) novaRef.current(); }
        else if (e.menu && cameraAgora && !cameraSegura) alterarMenu(false);
        else if (cameraAgora && !cameraSegura && c.ler().fase === 'dirigindo') trocarVista();
        cameraSegura = cameraAgora;
        const fmPad = !!pad && pad.mapping === 'standard' && (!!pad.buttons[BOTAO_FREIO_MOTOR.botao]?.pressed || !!pad.buttons[BOTAO_FREIO_MOTOR.botaoAlt]?.pressed);
        const freioMotor = fmPad || freioMotorTecla.current;
        if (freioMotor && !fmSeguro && !fim) rumble('alert');
        fmSeguro = freioMotor;
        look = stepLook(look, pad ? { yaw: -applyDeadZone(pad.axes[2] ?? 0), pitch: -applyDeadZone(pad.axes[3] ?? 0) } : { yaw: 0, pitch: 0 }, dt, { recenter: !!pad });
        const congelado = e.menu || document.hidden || !!fim;
        const r = congelado ? c.ler() : c.quadro(dt, comandoDesejado(pad, setas.current), freioMotor);
        if (!congelado) {
          s.quadro(r, new Date().toISOString()); s.registrar(r);
          if (s.registro.resultado && r.fase !== 'fim') c.encerrar(s.registro.resultado.motivo);
          for (const ev of r.eventos) {
            if (ev.tipo === 'falha-freio' || ev.tipo === 'animal') rumble('alert');
            if (ev.tipo === 'raspou' || ev.tipo === 'fim') rumble('contact');
            if (ev.tipo === 'fim' && ev.motivo !== 'chegada' && ev.motivo !== 'area_escape' && raizRef.current) raizRef.current.dataset.impacto = 'sim';
          }
        }
        audio.atualizar(c.ler(), congelado);
        const raiz = raizRef.current;
        if (raiz) {
          const atual = c.ler(), k = atual.caminhao;
          // Leitura para provas (só leitura): posição na pista e erro de rumo até um ponto à frente na faixa `data-alvo-lateral` (padrão 1,8 m).
          const alvo = pontoLateral(PISTA_SERRA, k.s + 6 + k.velocidade * 0.6, Number(raiz.dataset.alvoLateral ?? 1.8) || 0);
          raiz.dataset.fase = atual.fase; raiz.dataset.vista = e.vista;
          raiz.dataset.s = k.s.toFixed(1); raiz.dataset.lateral = k.lateral.toFixed(2); raiz.dataset.kph = (k.velocidade * 3.6).toFixed(1);
          const erro = Math.atan2(-(alvo.z - k.z), alvo.x - k.x) - k.rumo;
          raiz.dataset.erroRumo = Math.atan2(Math.sin(erro), Math.cos(erro)).toFixed(3);
          raiz.dataset.riscos = [...atual.riscos.keys()].join(' ');
        }
        const agora = performance.now();
        if (agora - ultimoHud > 66 || r.eventos.length) { ultimoHud = agora; setRetrato(c.ler()); }
        return { retrato: c.ler(), vista: e.vista, olhar: look };
      },
    });
    return () => { document.removeEventListener('visibilitychange', oculto); palco.dispose(); audio.parar(); };
    // Palco único por montagem: a corrida nova entra pelo `estado` (ref), sem refazer a cena.
  }, [alterarMenu, audio, trocarVista]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setRetrato(corrida.ler()); if (raizRef.current) delete raizRef.current.dataset.impacto; }, [corrida]);
  useSegurancaCabine(!menu && retrato.fase === 'dirigindo' && retrato.riscos.size > 0);

  // Teclado: setas/WASD (volante), E/Shift (freio-motor), C (câmera), Esc/F1 (pausa), Enter no resultado.
  useEffect(() => {
    const tecla = (ev: KeyboardEvent, valor: boolean) => {
      const k = ev.key.toLowerCase();
      if (TECLAS_FREIO_MOTOR.has(k)) { freioMotorTecla.current = valor; return; }
      if (valor && (ev.key === 'Escape' || ev.key === 'F1')) { ev.preventDefault(); ev.stopImmediatePropagation(); alterarMenu(!estado.current.menu); return; }
      if (valor && !ev.repeat && COMANDOS_CABINE.camera.teclas.some((t) => t === k) && !estado.current.menu && estado.current.corrida.ler().fase === 'dirigindo') { trocarVista(); return; }
      const seta = setaDaTecla(ev.key);
      if (seta) { setas.current = { ...setas.current, [seta]: valor }; if (ev.key === ' ') ev.preventDefault(); }
    };
    const descer = (ev: KeyboardEvent) => tecla(ev, true), subir = (ev: KeyboardEvent) => tecla(ev, false);
    const soltar = () => { setas.current = { ...SETAS_SOLTAS }; freioMotorTecla.current = false; };
    window.addEventListener('keydown', descer, true); window.addEventListener('keyup', subir); window.addEventListener('blur', soltar);
    return () => { window.removeEventListener('keydown', descer, true); window.removeEventListener('keyup', subir); window.removeEventListener('blur', soltar); };
  }, [alterarMenu, trocarVista]);

  const touch = useCallback((tecla: string, ligada: boolean) => {
    if (tecla === 'e') { freioMotorTecla.current = ligada; return; }
    const seta = setaDaTecla(tecla); if (seta) setas.current = { ...setas.current, [seta]: ligada };
  }, []);

  if (falhaWebgl) return <div className="experience-game-status" role="alert"><h2>Não foi possível abrir o caminhão</h2><p>O navegador não liberou WebGL. Volte para o trator.</p>{aoTrocar && <button onClick={aoTrocar}>Dirigir o trator</button>}</div>;
  return <div ref={raizRef} className="pista-kiosk gameplay-kiosk" data-pista="" data-gameplay="" data-fase="pronto" data-vista={vista} data-veiculo="caminhao">
    <div ref={palcoRef} className="pista-kiosk-palco" />
    {seloFps && <SeloFps palcoRef={raizRef} />}
    <PistaHud key={volta} r={retrato} sessao={sessao} menu={menu} aoMenu={alterarMenu} aoNovo={novaCorrida} aoAnalisar={(rel) => aoAnalisar?.(rel)} aoTrocar={() => aoTrocar?.()} touch={touch} />
    {retrato.fase === 'dirigindo' && <p className="pista-vista">{vista === 'externa' ? 'Câmera externa' : 'Cabine'} · ✕/A ou C troca</p>}
  </div>;
}
