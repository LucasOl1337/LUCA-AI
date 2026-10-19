import { useEffect, useRef, useState } from 'react';
import {
  ABERTURA_MS, MOTIVO_FIM, RASTRO_VAZIO, RESULTADO_MS,
  desafioDaRodada, eventoDesafio, passoDesafio, type Desafio, type ResultadoDesafio as Resultado, type RastroDesafio,
} from './desafios';
import type { CanalGameplay } from './estadoGameplay';
import { PainelCabine } from './PainelCabine';
import { AberturaDesafio, ResultadoDesafio } from './ResultadoDesafio';

type Etapa = { tipo: 'abertura' } | { tipo: 'dirigindo' } | { tipo: 'resultado'; resultado: Resultado; ate: number };

/**
 * Desafio na cabine: monta o mundo pelo `reiniciar`, mostra a abertura por
 * 4 s, acompanha o estado da Direção e, no fim, encerra e mostra o Resultado
 * do desafio por 10 s antes de recomeçar. Não grava nada. Sem `desafio`
 * fixo, as rodadas alternam pela lista `DESAFIOS` (fardo, pendente, fardo…).
 */
export function DesafioCabine({ canal, desafio: fixo, som = true }: { canal: CanalGameplay; desafio?: Desafio; som?: boolean }) {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'abertura' });
  const [agora, setAgora] = useState(() => Date.now());
  const rastro = useRef<RastroDesafio>(RASTRO_VAZIO);
  // Estado, não ref: `data-rodada` precisa sair no mesmo render da abertura nova.
  const [rodada, setRodada] = useState(1);
  const desafio = fixo ?? desafioDaRodada(rodada);

  // Abertura: posiciona o desafio e some depois de 4 s ou na primeira aceleração.
  useEffect(() => {
    if (etapa.tipo !== 'abertura') return;
    rastro.current = RASTRO_VAZIO;
    canal.reiniciar(desafio.inicio);
    const saida = window.setTimeout(() => setEtapa({ tipo: 'dirigindo' }), ABERTURA_MS);
    const cancelar = canal.assinar(() => { if (canal.ler().fase === 'dirigindo') setEtapa({ tipo: 'dirigindo' }); });
    return () => { window.clearTimeout(saida); cancelar(); };
  }, [etapa.tipo, canal, desafio]);

  // Condução: passo a cada aviso do canal, bordas exatas pelos eventos.
  useEffect(() => {
    if (etapa.tipo === 'resultado') return;
    const avaliar = () => {
      if (!rastro.current.resultado) return;
      const { resultado } = rastro.current;
      canal.encerrar(MOTIVO_FIM[resultado.desfecho]);
      const t = Date.now();
      setAgora(t);
      setEtapa({ tipo: 'resultado', resultado, ate: t + RESULTADO_MS });
    };
    const semMudanca = canal.assinar(() => {
      rastro.current = passoDesafio(rastro.current, canal.ler(), desafio);
      avaliar();
    });
    const semEvento = canal.aoEvento((evento) => {
      rastro.current = eventoDesafio(rastro.current, evento, canal.ler(), desafio);
    });
    return () => { semMudanca(); semEvento(); };
  }, [etapa.tipo, canal, desafio]);

  // Resultado: 10 s com contagem e volta para a abertura.
  useEffect(() => {
    if (etapa.tipo !== 'resultado') return;
    const relogio = window.setInterval(() => {
      const t = Date.now();
      setAgora(t);
      if (t >= etapa.ate) { setRodada((n) => n + 1); setEtapa({ tipo: 'abertura' }); }
    }, 250);
    return () => window.clearInterval(relogio);
  }, [etapa]);

  return (
    <div className="gameplay-desafio" data-etapa={etapa.tipo} data-desafio={desafio.id} data-rodada={rodada}>
      <PainelCabine canal={canal} som={som && etapa.tipo !== 'resultado'} />
      {etapa.tipo === 'abertura' && <AberturaDesafio texto={desafio.abertura} />}
      {etapa.tipo === 'resultado' && <ResultadoDesafio resultado={etapa.resultado} restanteS={(etapa.ate - agora) / 1000} />}
    </div>
  );
}
