import type { AppLocation } from '../../shared/app-location.js';

/**
 * Funções do LUCA-AI na página Início, da mais impressionante para a mais comum.
 * Cada item descreve o que a página faz hoje no código; os prints em
 * public/home/funcoes/ foram capturados em produção (21/10/2026).
 * Admin fica fora: só aparece para administradores e não é função de visitante.
 */
export interface HomeFuncaoAcao {
  rotulo: string;
  destino: Partial<AppLocation>;
}

export interface HomeFuncao {
  id: string;
  titulo: string;
  categoria: string;
  valor: string;
  detalhes: readonly string[];
  imagem: string;
  imagemAlt: string;
  nota: string;
  acao: HomeFuncaoAcao;
  secundaria?: HomeFuncaoAcao;
}

export const HOME_FUNCOES: readonly HomeFuncao[] = [
  {
    id: 'totem',
    titulo: 'Totem',
    categoria: 'Coruja por voz · Vitrine · Simulação',
    valor: 'Pegue o microfone e pergunte: a coruja LUCA responde por voz e abre as telas do produto ali mesmo, no stand.',
    detalhes: [
      'Coruja conversa por voz e pode abrir uma página do site com ela no canto.',
      'Vitrine passa em sequência os vídeos do produto e telas do app.',
      'Simulação jogável no controle; L1 e R1 alternam os modos em tela cheia.',
    ],
    imagem: '/home/funcoes/totem.webp',
    imagemAlt: 'Tela do Totem com a coruja LUCA convidando a pegar o microfone e perguntar.',
    nota: 'A voz depende da sessão e da permissão de microfone. Sem voz, Vitrine e Simulação seguem.',
    acao: { rotulo: 'Abrir o Totem', destino: { page: 'stand' } },
    secundaria: { rotulo: 'Como usar', destino: { page: 'totem' } },
  },
  {
    id: 'gameplay',
    titulo: 'Gameplay',
    categoria: 'Trator MAX em primeira pessoa',
    valor: 'Dirija o Trator MAX na lavoura e tente parar a tempo: o sensor frontal mede a distância e acende o alerta na cabine.',
    detalhes: [
      'Teclado ou controle DualSense, com volante, freio e ré.',
      'Desafio de parada preventiva com distância, velocidade e mapa do talhão no painel.',
      'Webcam de sonolência opcional dentro da cabine.',
    ],
    imagem: '/home/funcoes/gameplay.webp',
    imagemAlt: 'Cabine do Trator MAX dirigindo na lavoura, com o painel do sensor frontal e o mapa do talhão.',
    nota: 'Simulação local. Não controla máquinas reais nem grava telemetria no servidor.',
    acao: { rotulo: 'Dirigir o Trator MAX', destino: { page: 'gameplay' } },
  },
  {
    id: 'operador',
    titulo: 'Operador',
    categoria: 'Gameplay ao vivo no tablet',
    valor: 'Enquanto alguém dirige no totem, o tablet ao lado acompanha a máquina ao vivo no mapa do talhão.',
    detalhes: [
      'Posição no talhão com as zonas de risco marcadas.',
      'Sensor frontal, velocidade, inclinação e fase do desafio em cartões.',
      'Alerta de sono quando a webcam da cabine está ligada; bipe só se o operador quiser.',
    ],
    imagem: '/home/funcoes/operador.webp',
    imagemAlt: 'Painel do operador ao vivo: mapa do talhão com a máquina e cartões de distância, velocidade e inclinação.',
    nota: 'Usa a mesma conta do totem. Tudo é simulado.',
    acao: { rotulo: 'Abrir o painel do operador', destino: { page: 'operador' } },
  },
  {
    id: 'sompo',
    titulo: 'SOMPO',
    categoria: 'Telemetria · Casos agrícolas · Safra',
    valor: 'Teste o risco da máquina num simulador 3D ou acompanhe o ESP32 real, e leve o episódio para a equipe de agentes avaliar.',
    detalhes: [
      'Simulador 3D com cenários de estrada e campo, ou leitura do ESP32 pelo Firebase.',
      'Casos agrícolas de exemplo: seca, granizo, geada, chuva e penhor.',
      'Safra compara jornadas, alertas e episódios da frota; Veículos cadastra o modelo 3D.',
    ],
    imagem: '/home/funcoes/sompo.webp',
    imagemAlt: 'Painel SOMPO com o simulador 3D da estrada rural e a telemetria do ESP32 virtual.',
    nota: 'Cenários e frota de demonstração ficam marcados como sintéticos.',
    acao: { rotulo: 'Abrir a telemetria', destino: { page: 'sompo', aba: 'telemetria' } },
    secundaria: { rotulo: 'Ver casos agrícolas', destino: { page: 'sompo', aba: 'casos' } },
  },
  {
    id: 'sensor',
    titulo: 'Sensor',
    categoria: 'O chip do ESP32 por dentro, em 3D',
    valor: 'Veja o que o sensor sente numa curva, numa encosta, numa frenada ou num buraco, e o que o painel faria com isso.',
    detalhes: [
      'Caminhão ou Trator MAX em cena 3D, com vista explodida do sensor.',
      'Distância, inclinação lateral e frente/trás lidas em tempo real.',
      'O caminho do dado, do ESP32 ao painel, passo a passo.',
    ],
    imagem: '/home/funcoes/sensor.webp',
    imagemAlt: 'Laboratório do sensor com o caminhão SOMPO em 3D e as leituras de distância e inclinação.',
    nota: 'Simulação didática, sem conexão com equipamento.',
    acao: { rotulo: 'Explorar o sensor', destino: { page: 'sensor' } },
  },
  {
    id: 'sonolencia',
    titulo: 'Sonolência',
    categoria: 'Visão computacional na webcam',
    valor: 'Feche os olhos por 1 segundo e o alarme toca: a webcam percebe o cochilo antes que ele vire acidente.',
    detalhes: [
      'Detecção dos olhos no próprio navegador.',
      'Sensibilidade ajustável e botão para testar o som.',
      'Nenhuma imagem é gravada ou enviada.',
    ],
    imagem: '/home/funcoes/sonolencia.webp',
    imagemAlt: 'Monitor de sonolência com a webcam desligada, o contador de olhos fechados e o botão Ativar webcam.',
    nota: 'Protótipo experimental. Teste com o veículo parado.',
    acao: { rotulo: 'Testar na webcam', destino: { page: 'sonolencia' } },
  },
  {
    id: 'laboratorio',
    titulo: 'Laboratório',
    categoria: 'Replay de incidentes',
    valor: 'Carregue os arquivos de um incidente e reveja a máquina sobre o mapa da área, com os agentes ligando cada hipótese ao instante da evidência.',
    detalhes: [
      'JSON ou CSV exportado do monitoramento, ou casos de exemplo.',
      'Replay sobre imagem de satélite e limites da área; relevo quando há LiDAR.',
      'Eventos por regra, análise por eixos e conclusão humana com versões.',
    ],
    imagem: '/home/funcoes/laboratorio.webp',
    imagemAlt: 'Laboratório virtual mostrando a área de demonstração em Piracicaba sobre imagem aérea.',
    nota: 'A evidência orienta. A decisão continua humana.',
    acao: { rotulo: 'Abrir o laboratório', destino: { page: 'laboratorio' } },
  },
] as const;
