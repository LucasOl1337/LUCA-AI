import { useCallback, useEffect, useState } from 'react';
import { Maximize2, Menu, Minimize2 } from 'lucide-react';
import { alertaCabine } from '@/components/gameplay/alertaCabine';
import { MapaOperador, type EstadoMapa } from '@/components/gameplay/MapaOperador';
import { useBipeCabine } from '@/components/gameplay/bipeCabine';
import { riscosCircuito } from '@/components/gameplay/circuito';
import { GAMEPLAY_ALERTA_CM, GAMEPLAY_ECO_MAXIMO_CM } from '@/components/gameplay/estadoGameplay';
import { ROTULO_SONO, segundosSono } from '@/components/gameplay/sonoCabine';
import { faixaVermelhaMaisPerto } from '@/components/gameplay/zonasOperador';
import { useLuca } from '@/hooks/useLucaState';
import { abrirMenuGaveta } from '@/lib/menuGaveta';
import { sinalAoVivo, useRetratoAoVivo, type RetratoAoVivo, type SinalAoVivo } from '@/lib/gameplayAoVivo';
import { SOMPO_PANEL_BANDS } from '../../shared/sompo-physical-interactions.js';
import './operadorPage.css';

/**
 * Painel do operador (inventário #3, Lucas s880; tela cheia, mapa em escala e
 * geofencing a pedido do Linz, 24/10): o tablet ao lado do totem mostra o
 * gameplay ao vivo, mapeado no talhão. Mesma conta do totem; o retrato chega
 * pelo /ws (src/lib/gameplayAoVivo.ts). Tudo é SIMULADO.
 */
export default function OperadorPage() {
  const retrato = useRetratoAoVivo();
  const { connectionState } = useLuca();
  const [agora, setAgora] = useState(() => Date.now());
  const [som, setSom] = useState(false);
  const visivel = useDocumentoVisivel();
  const tela = useTelaCheia();
  // O relógio só serve à idade da última leitura: 1 s basta e para com a aba oculta.
  useEffect(() => {
    if (!visivel) return;
    setAgora(Date.now());
    const relogio = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(relogio);
  }, [visivel]);
  const vivo = sinalAoVivo(retrato, agora).nivel === 'ao-vivo';
  // Mudo por padrão: o som é do totem; o tablet só bipa se o operador pedir.
  useBipeCabine(som && vivo && retrato ? alertaCabine(retrato.estado, retrato.sono ?? null).bipe : null);
  return (
    <OperadorVista retrato={retrato} agora={agora} som={som} oculto={!visivel} aoTrocarSom={() => setSom(!som)}
      conexao={connectionState} telaCheia={tela.ativa} aoTrocarTelaCheia={tela.trocar} aoAbrirMenu={abrirMenuGaveta} />
  );
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

/**
 * Tela cheia do tablet: pede a Fullscreen API do navegador e, com ou sem ela,
 * marca `<html data-operador-expandido>`, que esconde o menu, o cabeçalho e o
 * dock do site (index.css). Navegador sem a API (Safari do iPad) ou que recusa
 * o pedido fica só com o modo expandido; sair desfaz os dois.
 */
export const ATRIBUTO_EXPANDIDO = 'data-operador-expandido';
function useTelaCheia() {
  const [ativa, setAtiva] = useState(false);
  useEffect(() => {
    const raiz = document.documentElement;
    if (ativa) raiz.setAttribute(ATRIBUTO_EXPANDIDO, '');
    else raiz.removeAttribute(ATRIBUTO_EXPANDIDO);
    return () => raiz.removeAttribute(ATRIBUTO_EXPANDIDO);
  }, [ativa]);
  // Esc ou o gesto do sistema saem da tela cheia do navegador: sai do expandido junto.
  useEffect(() => {
    const sincronizar = () => { if (!document.fullscreenElement) setAtiva(false); };
    document.addEventListener('fullscreenchange', sincronizar);
    return () => document.removeEventListener('fullscreenchange', sincronizar);
  }, []);
  // Ao sair da página, devolve a tela cheia do navegador.
  useEffect(() => () => { if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined); }, []);
  const trocar = useCallback(() => {
    if (ativa) {
      setAtiva(false);
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
      return;
    }
    setAtiva(true);
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, [ativa]);
  return { ativa, trocar };
}

type Conexao = 'checking' | 'online' | 'offline';
const FASE = { pronto: 'Parado · esperando R2', dirigindo: 'Dirigindo', fim: 'Corrida encerrada' } as const;
const CENARIO = { circuito: 'Corrida do circuito', desafios: 'Desafios', percurso: 'Percurso guiado' } as const;
const relogio = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const decimal = (v: number, casas = 1) => v.toFixed(casas).replace('.', ',');
const idadeTexto = (ms: number) => ms < 60_000 ? `${decimal(Math.max(0, ms) / 1000)} s` : `${Math.floor(ms / 60_000)} min ${Math.floor(ms / 1000) % 60} s`;

function seloTotem(sinal: SinalAoVivo) {
  if (sinal.nivel === 'ao-vivo') return 'Totem ao vivo';
  if (sinal.nivel === 'aguardando') return 'Aguardando o totem';
  if (sinal.nivel === 'sem-sinal') return `Totem sem dados há ${idadeTexto(sinal.segundos * 1000)}`;
  return sinal.motivo === 'menu' ? 'Corrida pausada no menu' : sinal.motivo === 'resultado' ? 'Resultado na tela do totem' : 'Jogo pausado no totem';
}

/** Só desenho: serve ao teste SSR e ao print. */
export function OperadorVista({ retrato, agora, som, oculto = false, aoTrocarSom, conexao = 'online', telaCheia = false, aoTrocarTelaCheia, aoAbrirMenu }: {
  retrato: RetratoAoVivo | null; agora: number; som: boolean; oculto?: boolean; aoTrocarSom?: () => void;
  conexao?: Conexao; telaCheia?: boolean; aoTrocarTelaCheia?: () => void; aoAbrirMenu?: () => void;
}) {
  const sinal = sinalAoVivo(retrato, agora);
  const atual = sinal.nivel === 'ao-vivo';
  const situacao: EstadoMapa = atual ? 'atual' : sinal.nivel === 'pausado' ? 'pausado' : 'velho';
  // `sono` só chega com a webcam da cabine ligada no totem (/gameplay?webcam=1).
  // Só vale ao vivo: sem sinal, a última leitura é velha e não pode deixar o
  // alarme de sono aceso no tablet (soak luca-soak item 5, 21/10).
  const sono = atual ? retrato?.sono ?? null : null;
  const painel = retrato ? alertaCabine(retrato.estado, sono) : null;
  const idadeMs = retrato ? Math.max(0, agora - retrato.recebidoEm) : 0;
  return (
    <section className="operador" data-sinal={sinal.nivel} data-conexao={conexao} data-tela-cheia={telaCheia || undefined} data-oculto={oculto || undefined} aria-labelledby="operador-titulo">
      <header className="operador-topo">
        <div className="operador-titulo">
          {telaCheia && aoAbrirMenu && <button type="button" className="operador-botao operador-menu" onClick={aoAbrirMenu} aria-label="Abrir menu"><Menu aria-hidden="true" /></button>}
          <div>
            <p className="operador-olho">Painel do operador · Trator MAX</p>
            <h1 id="operador-titulo">Gameplay ao vivo</h1>
          </div>
        </div>
        <div className="operador-selos">
          {/* Dois estados que antes se confundiam: o /ws deste tablet (app) e o retrato do totem (telemetria do jogo). */}
          <span className="operador-selo operador-conexao" data-estado={conexao} title="Conexão deste tablet com o servidor (/ws)">
            {conexao === 'online' ? 'App conectado' : conexao === 'checking' ? 'App conectando' : 'App sem conexão'}
          </span>
          <span className="operador-selo operador-sinal" role="status" title="Retratos do jogo enviados pelo totem">{seloTotem(sinal)}</span>
          <span className="operador-selo operador-simulado">SIMULADO</span>
          <button type="button" className="operador-selo operador-som" aria-pressed={som} onClick={aoTrocarSom}>{som ? 'Som ligado' : 'Som mudo'}</button>
          <button type="button" className="operador-selo operador-tela-cheia" aria-pressed={telaCheia} onClick={aoTrocarTelaCheia}>
            {telaCheia ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}{telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
          </button>
        </div>
      </header>
      {!retrato || !painel ? (
        <div className="operador-vazio">
          <h2>Nenhum gameplay rodando nesta conta</h2>
          <p>Abra o Gameplay no totem logado com a mesma conta deste tablet. O mapa aparece aqui assim que a máquina se mexer.</p>
          {conexao !== 'online' && <p className="operador-vazio-rede">Este tablet está sem conexão com o servidor; o totem pode estar jogando normalmente.</p>}
        </div>
      ) : (
        <div className="operador-corpo" data-faixa={atual ? painel.faixa : 'sem-dado'}>
          <div className="operador-mapa">
            {!atual && <AvisoUltimaLeitura sinal={sinal} conexao={conexao} />}
            <MapaOperador estado={retrato.estado} geofence={painel.geofence} cenario={retrato.cenario ?? null} situacao={situacao} />
          </div>
          <CardsSensores retrato={retrato} painel={painel} atual={atual} sono={sono} idadeMs={idadeMs} />
        </div>
      )}
    </section>
  );
}

/** Sem retrato atual: a faixa diz que tudo abaixo é a última leitura e que área sem cor não quer dizer área segura. */
function AvisoUltimaLeitura({ sinal, conexao }: { sinal: SinalAoVivo; conexao: Conexao }) {
  const pausado = sinal.nivel === 'pausado';
  const causa = conexao !== 'online' ? 'Este tablet perdeu a conexão com o servidor; o totem pode continuar jogando.'
    : pausado ? 'O motor do jogo está parado no totem; os valores voltam quando a corrida seguir.'
      : 'O tablet está conectado, mas o totem parou de mandar retratos (fora do Gameplay, sem login ou desligado).';
  return (
    <div className="operador-velho" role="status" data-pausado={pausado || undefined}>
      <strong>{pausado ? seloTotem(sinal) : 'Mostrando a última leitura, não o estado agora'}</strong>
      <span>{causa} Área sem cor não quer dizer área segura.</span>
    </div>
  );
}

function CardsSensores({ retrato, painel, atual, sono, idadeMs }: {
  retrato: RetratoAoVivo; painel: NonNullable<ReturnType<typeof alertaCabine>>; atual: boolean; sono: RetratoAoVivo['sono'] | null; idadeMs: number;
}) {
  const e = retrato.estado;
  const riscos = riscosCircuito(e, painel.sono);
  const zonaNivel = riscos.get('agua') ?? riscos.get('encosta') ?? null;
  const vermelha = faixaVermelhaMaisPerto(e.maquina, retrato.cenario ?? null);
  const ecoCm = e.sensor.eco ? e.sensor.distanciaCm : null;
  const reguaPct = ecoCm === null ? 100 : Math.min(100, ecoCm / GAMEPLAY_ECO_MAXIMO_CM * 100);
  const inclinacao = Math.max(Math.abs(e.atitude.rolagemGraus), Math.abs(e.atitude.arfagemGraus));
  // Valor velho fica visível mas com "última leitura"; o que só vale ao vivo (alerta, zona, motorista) vira "sem dado atual".
  const rotuloIdade = atual ? null : 'última leitura';
  const zonaTexto = painel.geofence.nivel !== 'fora' ? painel.geofence.zona!.rotulo
    : riscos.has('encosta') ? 'Encosta' : 'Fora das zonas';
  return (
    <div className="operador-cards" data-atual={atual}>
      <div className="operador-alerta" role="alert" hidden={!atual || !painel.alerta}>{painel.rotuloAlerta}</div>
      <article className="operador-card" data-destaque="true" data-faixa={atual ? painel.faixa : undefined}>
        <span>Sensor frontal · HC-SR04</span>
        <strong>{painel.distanciaTexto}</strong>
        <small>{atual ? painel.rotulo : rotuloIdade}</small>
        <div className="operador-regua" aria-hidden="true">
          <i style={{ left: `${SOMPO_PANEL_BANDS.dangerCm / GAMEPLAY_ECO_MAXIMO_CM * 100}%` }} />
          <i style={{ left: `${SOMPO_PANEL_BANDS.attentionCm / GAMEPLAY_ECO_MAXIMO_CM * 100}%` }} />
          <b style={{ left: `${reguaPct}%` }} />
        </div>
        <small className="operador-regua-escala">0 · 1 m · 2 m · 4 m · alerta a {decimal(GAMEPLAY_ALERTA_CM / 100)} m</small>
      </article>
      <article className="operador-card">
        <span>Velocidade</span><strong>{painel.velocidadeTexto}</strong>
        <small>{rotuloIdade ?? `teto ${e.tetoKph} km/h`}</small>
      </article>
      <article className="operador-card" data-alerta={atual && painel.inclinacao.ligada}>
        <span>Inclinação</span><strong>{painel.inclinacao.graus}°</strong>
        <small>{rotuloIdade ?? `lateral ${Math.round(e.atitude.rolagemGraus)}° · frente ${Math.round(e.atitude.arfagemGraus)}° · alerta ${SOMPO_PANEL_BANDS.inclinationDeg}°`}</small>
        <div className="operador-barra" aria-hidden="true"><b style={{ width: `${Math.min(100, inclinacao / 30 * 100)}%` }} /><i style={{ left: `${SOMPO_PANEL_BANDS.inclinationDeg / 30 * 100}%` }} /></div>
      </article>
      <article className="operador-card" data-zona-nivel={atual ? zonaNivel ?? 'fora' : 'sem-dado'} data-alerta={atual && zonaNivel === 'critico'}>
        <span>Zona de risco</span>
        <strong>{atual ? zonaTexto : '—'}</strong>
        <small>{!atual ? 'sem dado atual'
          : zonaNivel === 'critico' ? 'zona de sinistro' : zonaNivel === 'atencao' ? 'possível sinistro'
            : Number.isFinite(vermelha.distanciaM) ? `${vermelha.rotulo} a ${Math.round(vermelha.distanciaM)} m` : 'nenhuma zona no mapa'}</small>
      </article>
      <article className="operador-card">
        <span>Rumo e comandos</span>
        <strong>{Math.round(((e.maquina.rumoGraus % 360) + 360) % 360)}°</strong>
        <small>{rotuloIdade ?? `acelerador ${Math.round(e.comandos.acelerador * 100)}% · freio ${Math.round(e.comandos.freio * 100)}% · volante ${e.comandos.esterco > 0.05 ? 'à direita' : e.comandos.esterco < -0.05 ? 'à esquerda' : 'reto'}`}</small>
      </article>
      <article className="operador-card" data-motorista={sono?.status} data-alerta={atual && painel.sono}>
        <span>Motorista · webcam</span>
        <strong>{sono ? ROTULO_SONO[sono.status] : atual ? 'Sem leitura' : '—'}</strong>
        <small>{sono ? (sono.closedMs > 0 ? `Olhos fechados há ${segundosSono(sono.closedMs)}` : 'webcam ligada no totem') : atual ? 'webcam desligada no totem' : 'sem dado atual'}</small>
      </article>
      <article className="operador-card">
        <span>Fase</span><strong>{FASE[e.fase]}</strong>
        <small>{relogio(e.tempoMs)}{retrato.cenario ? ` · ${CENARIO[retrato.cenario]}` : ''}</small>
      </article>
      <article className="operador-card" data-velho={!atual}>
        <span>Última leitura do totem</span><strong>há {idadeTexto(idadeMs)}</strong>
        <small>retrato do jogo pelo /ws · até 4 por segundo</small>
      </article>
    </div>
  );
}
