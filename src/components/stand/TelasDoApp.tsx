import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Tractor } from 'lucide-react';
import type { LabCase } from '../../../shared/lab-telemetry.js';
import type { SompoTelemetrySnapshot } from '../../../shared/sompo-telemetry';
import { carregarCasoLab, lerTrator, temWebgl } from './dadosTelasDoApp';
import { LAB_TETO_MS, LAB_VELOCIDADE, TRATOR_MS, tratorAoVivo, type Prontidao } from './vitrineStand';
import '@/laboratorio-page.css';

/**
 * Telas do app na Vitrine (Q3 b): replay do Laboratório e o Trator agora.
 * Só leitura: nada daqui grava caso, sobe arquivo ou mexe na bancada.
 */

const carregarCena = () => import('@/components/lab/LabScene');
const LabScene = lazy(carregarCena);

export const TRATOR_A_CADA_MS = 2_000;

/** Prontidão das Telas do app. O Lab carrega uma vez; o trator só é lido com a Vitrine na tela. */
export function useTelasDoApp(vitrineAtiva: boolean) {
  const [prontidao, setProntidao] = useState<Prontidao>({ lab: 'carregando', trator: 'carregando' });
  const [caso, setCaso] = useState<LabCase | null>(null);
  const [trator, setTrator] = useState<SompoTelemetrySnapshot | null>(null);

  useEffect(() => {
    if (!temWebgl()) { setProntidao((p) => ({ ...p, lab: 'sem_webgl' })); return undefined; }
    let vivo = true;
    void Promise.all([carregarCasoLab(), carregarCena().then(() => true, () => false)]).then(([r, cena]) => {
      if (!vivo) return;
      if (!r.ok) { setProntidao((p) => ({ ...p, lab: r.motivo })); return; }
      if (!cena) { setProntidao((p) => ({ ...p, lab: 'dados_indisponiveis' })); return; }
      setCaso(r.valor);
      setProntidao((p) => ({ ...p, lab: true }));
    });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!vitrineAtiva) return undefined;
    let vivo = true;
    let timer = 0;
    // Uma leitura por vez: a próxima só sai 2 s depois da anterior responder (ou estourar os 6 s).
    const ler = () => {
      void lerTrator().then((r) => {
        if (!vivo) return;
        if (!r.ok) { setTrator(null); setProntidao((p) => ({ ...p, trator: r.motivo })); }
        else {
          setTrator(r.valor);
          setProntidao((p) => ({ ...p, trator: tratorAoVivo(r.valor) ? true : 'sem_sinal' }));
        }
        timer = window.setTimeout(ler, TRATOR_A_CADA_MS);
      });
    };
    ler();
    return () => {
      vivo = false;
      window.clearTimeout(timer);
      // Fora da Vitrine ninguém lê o sensor: leitura velha não volta como "ao vivo".
      setTrator(null);
      setProntidao((p) => ({ ...p, trator: 'carregando' }));
    };
  }, [vitrineAtiva]);

  /** 3D caiu com o Lab já na volta: sai da volta até a página recarregar. */
  const labFalhou = useCallback(() => setProntidao((p) => ({ ...p, lab: 'sem_webgl' })), []);

  return { prontidao, caso, trator, labFalhou };
}

/** Relógio de parede que congela com a pausa: devolve ms tocados desde que a tela entrou. */
function useTempoTocado(pausado: boolean) {
  const [tocado, setTocado] = useState(0);
  const acumulado = useRef(0);
  useEffect(() => {
    if (pausado) return undefined;
    let raf = 0;
    let antes = performance.now();
    const tique = (agora: number) => {
      acumulado.current += agora - antes;
      antes = agora;
      setTocado(acumulado.current);
      raf = requestAnimationFrame(tique);
    };
    raf = requestAnimationFrame(tique);
    return () => cancelAnimationFrame(raf);
  }, [pausado]);
  return tocado;
}

/** Replay do tombamento em declive (Piracicaba, dados sintéticos) a 4x, até o fim do caso ou 45 s. */
export function TelaLab({ caso, pausado, aoTerminar, aoFalhar }: { caso: LabCase; pausado: boolean; aoTerminar(): void; aoFalhar(): void }) {
  const tocado = useTempoTocado(pausado);
  const decorrido = Math.min(caso.durationMs, tocado * LAB_VELOCIDADE);
  const acabou = decorrido >= caso.durationMs || tocado >= LAB_TETO_MS;
  const terminar = useRef(aoTerminar); terminar.current = aoTerminar;
  useEffect(() => { if (acabou) terminar.current(); }, [acabou]);

  return (
    <div className="stand-tela-app stand-tela-lab" data-tela-app="lab" data-decorrido={Math.round(decorrido)}>
      <Suspense fallback={null}>
        {/* 3D caiu: a prontidão muda e a página pula o item (um caminho só pra avançar). */}
        <LabScene labCase={caso} elapsedMs={decorrido} cameraMode="follow" onWebglError={aoFalhar} />
      </Suspense>
    </div>
  );
}

const numero = (v: number | null | undefined, casas = 0) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(casas).replace('.', ',') : '—');

/** Trator agora: a leitura do sensor do trator do stand, 20 s. Sinal caiu: a página pula o item. */
export function TelaTrator({ trator, pausado, aoTerminar }: { trator: SompoTelemetrySnapshot | null; pausado: boolean; aoTerminar(): void }) {
  const tocado = useTempoTocado(pausado);
  const acabou = tocado >= TRATOR_MS;
  const terminar = useRef(aoTerminar); terminar.current = aoTerminar;
  useEffect(() => { if (acabou) terminar.current(); }, [acabou]);
  if (!trator || !tratorAoVivo(trator)) return null;
  const { roll, pitch, distance, temperature } = trator.readings;
  const alerta = trator.risks.inclination || trator.risks.collision || trator.risks.proximity;

  return (
    <div className="stand-tela-app stand-tela-trator" data-tela-app="trator" data-alerta={alerta || undefined}>
      <p className="stand-ao-vivo"><i aria-hidden />Ao vivo</p>
      <div className="stand-trator-figura" aria-hidden>
        <Tractor style={{ transform: `rotate(${typeof roll === 'number' ? Math.max(-45, Math.min(45, roll)) : 0}deg)` }} />
      </div>
      <dl className="stand-trator-leituras">
        <div><dt>Inclinação lateral</dt><dd>{numero(roll, 1)}<small>°</small></dd></div>
        <div><dt>Inclinação frontal</dt><dd>{numero(pitch, 1)}<small>°</small></dd></div>
        <div><dt>Obstáculo à frente</dt><dd>{numero(distance)}<small>cm</small></dd></div>
        <div><dt>Temperatura</dt><dd>{numero(temperature, 1)}<small>°C</small></dd></div>
      </dl>
      {alerta && <p className="stand-trator-alerta" role="status">{trator.risks.inclination ? 'Alerta de inclinação' : trator.risks.collision ? 'Alerta de colisão' : 'Perto de uma área de risco'}</p>}
    </div>
  );
}
