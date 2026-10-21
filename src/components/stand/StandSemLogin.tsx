import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { useAppLocation } from '@/hooks/useAppLocation';
import { VARIANTE_PADRAO, VARIANTES_AVATAR } from '@/components/stand/AvatarLuca';
import { Atracao } from '@/components/stand/Telas';
import { chamadaSemVoz } from '@/components/stand/avisos';
import { VIDEOS_VITRINE } from '@/components/stand/videosStand';
import { montarItens } from '@/components/stand/vitrineStand';
import { modoInicial, reduzirModo, type EntradaModo, type EstadoModo, type Modo } from '@/components/stand/modoStand';
import type { AcaoNavegacao } from '@/components/stand/navegacaoPad';
import { usePadStand } from '@/components/stand/usePadStand';
import { BarraModos, VitrineStand } from '@/components/stand/Modos';
import AuthPage from '@/pages/AuthPage';
import '@/stand.css';

/**
 * /stand sem sessão (401): em vez da tela de login, a Coruja sem voz e a Vitrine
 * só com os vídeos locais (`/stand/videos`, arquivos públicos). Nada aqui chama
 * `/api`: voz, escuta, Telas do app, Simulação e Site ficam de fora até a equipe
 * entrar de novo. Shift+Q abre o login ali mesmo, sem sair de /stand: ao entrar, o
 * stand completo volta sozinho; Esc fecha o login. Ver ADR 0001 e o GLOSSARY ("Stand sem login").
 */

const MARGEM_PADRAO = 6;
/** Só os vídeos: Lab e Trator agora leem a API. */
export const ITENS_SEM_LOGIN = montarItens(VIDEOS_VITRINE).filter((item) => item.tipo === 'video');
export const MODOS_SEM_LOGIN: readonly Modo[] = ['coruja', 'vitrine'];
export const AVISO_SEM_LOGIN = 'sem login · equipe: Shift+Q e entre com a conta do totem';

const reduzirAgora = (atual: EstadoModo, entrada: EntradaModo) => reduzirModo(atual, entrada, Date.now(), ITENS_SEM_LOGIN.length);

/** Pad e barra só alternam entre Coruja e Vitrine; ✕ na Coruja mostra a Vitrine (não há voz). */
export function entradaSemLogin(acao: AcaoNavegacao, modo: Modo): EntradaModo | null {
  if (acao.tipo === 'conversar') return modo === 'coruja' ? { tipo: 'ir', modo: 'vitrine' } : { tipo: 'atividade' };
  if (acao.tipo === 'ir') return MODOS_SEM_LOGIN.includes(acao.modo) ? acao : { tipo: 'atividade' };
  return acao;
}

export default function StandSemLogin({ offline = false }: { offline?: boolean }) {
  const { location } = useAppLocation();
  const [entrando, setEntrando] = useState(false);
  const margem = location.margem ? Number(location.margem) : MARGEM_PADRAO;
  const variante = VARIANTES_AVATAR.find((v) => v === location.variante) ?? VARIANTE_PADRAO;
  const [modo, despachar] = useReducer(reduzirAgora, undefined, () => modoInicial(Date.now()));
  const [agora, setAgora] = useState(() => Date.now());
  const modoAtual = useRef(modo.modo);
  modoAtual.current = modo.modo;

  useEffect(() => {
    const relogio = window.setInterval(() => {
      despachar({ tipo: 'relogio', corujaOcupada: false, falando: false });
      setAgora(Date.now());
    }, 500);
    return () => window.clearInterval(relogio);
  }, []);

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      despachar({ tipo: 'atividade' });
      if (evento.key === 'Escape') setEntrando(false);
      else if (evento.shiftKey && evento.key.toLowerCase() === 'q' && !(evento.target instanceof HTMLInputElement)) {
        evento.preventDefault();
        setEntrando(true);
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  const agirNoPad = useCallback((acao: AcaoNavegacao) => {
    const entrada = entradaSemLogin(acao, modoAtual.current);
    if (entrada) despachar(entrada);
    despachar({ tipo: 'atividade' });
  }, []);
  const mexeuNoPad = useCallback(() => despachar({ tipo: 'atividade' }), []);
  const { conectado } = usePadStand({ modo: modo.modo, aoAgir: agirNoPad, aoMexer: mexeuNoPad });
  const chamada = chamadaSemVoz(conectado);
  const nivel = useRef(0);
  const barraVisivel = agora < modo.barraAte;

  // Login só quando a equipe pede (AuthPage); ao entrar, o main.tsx troca para o StandPage em /stand.
  if (entrando) return <AuthPage />;

  const tocar = () => {
    despachar({ tipo: 'atividade', toque: true });
    if (modo.modo === 'coruja') despachar({ tipo: 'ir', modo: 'vitrine' });
  };

  return (
    <main
      className="stand"
      style={{ '--stand-margem': `${margem}%` } as CSSProperties}
      data-margem={`${margem}%`}
      data-modo={modo.modo}
      data-tela="atracao"
      data-voz-stand="desligada"
      data-motivo="sem_login"
      data-sem-login
      data-offline={offline || undefined}
      onPointerDown={tocar}
    >
      {modo.modo === 'coruja' && (
        <div className="stand-seguro">
          <Atracao variante={variante} nivel={nivel} titulo={chamada.titulo} chamada={chamada.sub} />
        </div>
      )}
      {modo.modo === 'vitrine' && (
        <VitrineStand item={ITENS_SEM_LOGIN[modo.video]} pausado={modo.pausado} aoTerminar={() => despachar({ tipo: 'video_terminou' })} />
      )}
      <div className="stand-seguro stand-camada">
        {/* Só na Coruja: na Vitrine o canto de cima é do selo queimado no vídeo. O repouso volta à Coruja a cada volta. */}
        {modo.modo === 'coruja' && <p className="stand-aviso-equipe stand-aviso-sem-login" role="status">{offline ? 'sem rede · vídeos salvos neste aparelho · a conversa volta quando reconectar' : AVISO_SEM_LOGIN}</p>}
        <BarraModos modo={modo.modo} modos={MODOS_SEM_LOGIN} visivel={barraVisivel} aoEscolher={(m) => { despachar({ tipo: 'atividade', toque: true }); despachar({ tipo: 'ir', modo: m }); }} />
      </div>
    </main>
  );
}
