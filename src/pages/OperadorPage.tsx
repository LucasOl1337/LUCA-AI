import { useEffect, useState } from 'react';
import { alertaCabine } from '@/components/gameplay/alertaCabine';
import { MapaTalhao } from '@/components/gameplay/MapaTalhao';
import { useBipeCabine } from '@/components/gameplay/bipeCabine';
import { sinalAoVivo, useRetratoAoVivo, type RetratoAoVivo } from '@/lib/gameplayAoVivo';
import './operadorPage.css';

/**
 * Painel do operador (inventário #3, Lucas s880): o tablet ao lado do totem
 * mostra o gameplay ao vivo, mapeado no talhão. Mesma conta do totem; o
 * retrato chega pelo /ws (src/lib/gameplayAoVivo.ts). Tudo é SIMULADO.
 */
export default function OperadorPage() {
  const retrato = useRetratoAoVivo();
  const [agora, setAgora] = useState(() => Date.now());
  const [som, setSom] = useState(false);
  const visivel = useDocumentoVisivel();
  // O relógio só serve ao "sem sinal há N s": 1 s basta e para com a aba oculta.
  useEffect(() => {
    if (!visivel) return;
    setAgora(Date.now());
    const relogio = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(relogio);
  }, [visivel]);
  const vivo = sinalAoVivo(retrato, agora).nivel === 'ao-vivo';
  // Mudo por padrão: o som é do totem; o tablet só bipa se o operador pedir.
  useBipeCabine(som && vivo && retrato ? alertaCabine(retrato.estado).bipe : null);
  return <OperadorVista retrato={retrato} agora={agora} som={som} oculto={!visivel} aoTrocarSom={() => setSom(!som)} />;
}

function useDocumentoVisivel() {
  const [visivel, setVisivel] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const trocar = () => setVisivel(!document.hidden);
    document.addEventListener('visibilitychange', trocar);
    return () => document.removeEventListener('visibilitychange', trocar);
  }, []);
  return visivel;
}

const FASE = { pronto: 'Parado · esperando R2', dirigindo: 'Dirigindo', fim: 'Desafio encerrado' } as const;
const relogio = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

/** Só desenho: serve ao teste SSR e ao print. */
export function OperadorVista({ retrato, agora, som, oculto = false, aoTrocarSom }: { retrato: RetratoAoVivo | null; agora: number; som: boolean; oculto?: boolean; aoTrocarSom?: () => void }) {
  const sinal = sinalAoVivo(retrato, agora);
  const selo = sinal.nivel === 'ao-vivo' ? 'Ao vivo' : sinal.nivel === 'sem-sinal' ? `Sem sinal há ${sinal.segundos} s` : 'Aguardando o totem';
  const painel = retrato ? alertaCabine(retrato.estado) : null;
  return (
    <section className="operador" data-sinal={sinal.nivel} data-oculto={oculto || undefined} aria-labelledby="operador-titulo">
      <header className="operador-topo">
        <div>
          <p className="operador-olho">Painel do operador · Trator MAX</p>
          <h1 id="operador-titulo">Gameplay ao vivo</h1>
        </div>
        <div className="operador-selos">
          <span className="operador-sinal" role="status">{selo}</span>
          <span className="operador-simulado">SIMULADO</span>
          <button type="button" className="operador-som" aria-pressed={som} onClick={aoTrocarSom}>{som ? 'Som ligado' : 'Som mudo'}</button>
        </div>
      </header>
      {!retrato || !painel ? (
        <div className="operador-vazio">
          <h2>Nenhum gameplay rodando nesta conta</h2>
          <p>Abra o Gameplay no totem logado com a mesma conta deste tablet. O mapa aparece aqui assim que a máquina se mexer.</p>
        </div>
      ) : (
        <div className="operador-corpo" data-faixa={painel.faixa}>
          <div className="operador-mapa"><MapaTalhao estado={retrato.estado} geofence={painel.geofence} /></div>
          <div className="operador-cards">
            <div className="operador-alerta" role="alert" hidden={!painel.alerta}>{painel.rotuloAlerta}</div>
            <article className="operador-card" data-destaque="true">
              <span>Sensor frontal</span><strong>{painel.distanciaTexto}</strong><small>{painel.rotulo}</small>
            </article>
            <article className="operador-card"><span>Velocidade</span><strong>{painel.velocidadeTexto}</strong></article>
            <article className="operador-card" data-alerta={painel.inclinacao.ligada}>
              <span>Inclinação</span><strong>{painel.inclinacao.graus}°</strong>
            </article>
            <article className="operador-card" data-alerta={painel.geofence.nivel !== 'fora'}>
              <span>Zona de risco</span><strong>{painel.geofence.zona?.rotulo ?? 'Fora das zonas'}</strong>
            </article>
            <article className="operador-card">
              <span>Fase</span><strong>{FASE[retrato.estado.fase]}</strong><small>{relogio(retrato.estado.tempoMs)}</small>
            </article>
          </div>
        </div>
      )}
    </section>
  );
}
