import { useEffect, useRef, useState } from 'react';
import {
  ABERTURA_MS, DESAFIO_FARDO, MOTIVO_FIM, RASTRO_VAZIO, RESULTADO_MS,
  eventoDesafio, passoDesafio, type Desafio, type ResultadoDesafio as Resultado, type RastroDesafio,
} from './desafios';
import type { CanalGameplay } from './estadoGameplay';
import { PainelCabine } from './PainelCabine';
import { AberturaDesafio, ResultadoDesafio } from './ResultadoDesafio';

type Etapa = { tipo: 'abertura' } | { tipo: 'dirigindo' } | { tipo: 'resultado'; resultado: Resultado; ate: number };

/**
 * Desafio na cabine: monta o mundo pelo `reiniciar`, mostra a abertura por
 * 4 s, acompanha o estado da Direção e, no fim, encerra e mostra o Resultado
 * do desafio por 10 s antes de recomeçar. Não grava nada.
 */
export function DesafioCabine({ canal, desafio = DESAFIO_FARDO, som = true }: { canal: CanalGameplay; desafio?: Desafio; som?: boolean }) {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'abertura' });
  const [agora, setAgora] = useState(() => Date.now());
  const rastro = useRef<RastroDesafio>(RASTRO_VAZIO);
  const rodada = useRef(0);

  // Abertura: posiciona o desafio e some depois de 4 s ou na primeira aceleração.
  useEffect(() => {
    if (etapa.tipo !== 'abertura') return;
    rastro.current = RASTRO_VAZIO;
    rodada.current += 1;
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
      setEtapa({ tipo: 'resultado', resultado, ate: Date.now() + RESULTADO_MS });
    };
    const semMudanca = canal.assinar(() => {
      rastro.current = passoDesafio(rastro.current, canal.ler(), desafio);
      avaliar();
    });
    const semEvento = canal.aoEvento((evento) => {
      rastro.current = eventoDesafio(rastro.current, evento, canal.ler());
    });
    return () => { semMudanca(); semEvento(); };
  }, [etapa.tipo, canal, desafio]);

  // Resultado: 10 s com contagem e volta para a abertura.
  useEffect(() => {
    if (etapa.tipo !== 'resultado') return;
    const relogio = window.setInterval(() => {
      const t = Date.now();
      setAgora(t);
      if (t >= etapa.ate) setEtapa({ tipo: 'abertura' });
    }, 250);
    return () => window.clearInterval(relogio);
  }, [etapa]);

  return (
    <div className="gameplay-desafio" data-etapa={etapa.tipo} data-desafio={desafio.id} data-rodada={rodada.current}>
      <PainelCabine canal={canal} som={som && etapa.tipo !== 'resultado'} />
      {etapa.tipo === 'abertura' && <AberturaDesafio texto={desafio.abertura} />}
      {etapa.tipo === 'resultado' && <ResultadoDesafio resultado={etapa.resultado} restanteS={(etapa.ate - agora) / 1000} />}
    </div>
  );
}
