/**
 * Casos de exemplo SOMPO (foco agrícola).
 *
 * São cenários didáticos construídos a partir de padrões públicos do seguro
 * rural brasileiro e dos produtos/comunicados da Sompo — não são sinistros
 * reais de apólices confidenciais. Use-os para treinar a bancada LUCA-AI.
 */

export type SompoCaseSeverity = 'critica' | 'alta' | 'media' | 'baixa';
export type SompoCaseStage =
  | 'aviso'
  | 'regulacao'
  | 'indenizacao'
  | 'underwriting'
  | 'renovacao'
  | 'negativa';

export type SompoProductLine =
  | 'agricola-produtividade'
  | 'agricola-custeio'
  | 'penhor-rural'
  | 'equipamentos'
  | 'carteira';

export interface SompoIndustryFact {
  id: string;
  label: string;
  value: string;
  detail: string;
  source: string;
}

export interface SompoExampleCase {
  id: string;
  title: string;
  subtitle: string;
  culture: string;
  region: string;
  product: SompoProductLine;
  productLabel: string;
  severity: SompoCaseSeverity;
  stage: SompoCaseStage;
  stageLabel: string;
  riskEvent: string;
  /** Cover image under public/sompo — visual do caso na grade e no launch. */
  image: string;
  tags: string[];
  situation: string;
  signals: string[];
  questions: string[];
  claimsCsv: string;
  telemetry: string;
  finance: string;
  decisionGoal: string;
  patternNote: string;
  sources: string[];
  suggestedPresetId: 'risco-agro' | 'comite-risco-agro';
  suggestedMode: 'team' | 'individual';
}

/** Fundo agrícola da página SOMPO. */
export const SOMPO_PAGE_BACKGROUND = '/sompo/bg-agro.jpg';

export const SOMPO_INDUSTRY_CONTEXT: SompoIndustryFact[] = [
  {
    id: 'triade-climatica',
    label: 'Causas dominantes',
    value: '87%',
    detail: 'Seca, granizo e geada concentraram a maior parte dos sinistros agrícolas em ~11 anos de série setorial.',
    source: 'Globo Rural / Forbes Agro (levantamento setorial 2012–2023)',
  },
  {
    id: 'seca',
    label: 'Peso da seca',
    value: '~79%',
    detail: 'Estiagem é o evento que mais gera acionamento de seguro agrícola no Brasil em séries publicadas.',
    source: 'Embrapa / publicações de contratação de seguro agrícola',
  },
  {
    id: 'volume-ocorrencias',
    label: 'Volume histórico',
    value: '139 mil',
    detail: 'Eventos climáticos geraram dezenas de milhares de ocorrências no seguro agrícola em cerca de 12 anos.',
    source: 'Globo Rural (dez/2023)',
  },
  {
    id: 'sompo-sinistralidade',
    label: 'Sompo agrícola 2023',
    value: '46% sinistralidade',
    detail: 'Carteira agrícola da Sompo com prêmios de R$ 82,8 mi; penhor/máquinas com prêmios de R$ 362,3 mi no mesmo recorte publicado.',
    source: 'Valor Econômico — especiais Seguros e Resseguros (abr/2024)',
  },
  {
    id: 'zarc',
    label: 'ZARC',
    value: 'Gate de cobertura',
    detail: 'Plantar fora da janela do ZARC eleva risco de indeferimento em Proagro/seguro rural e subvenção PSR.',
    source: 'CNA — Guia dos Seguros Rurais; MAPA/ZARC',
  },
  {
    id: 'vistoria-digital',
    label: 'Vistoria Sompo',
    value: '100% digital',
    detail: 'Sompo comunicou vistoria de campo mobile com geolocalização e imagens para agilizar indenização agrícola.',
    source: 'Sompo Seguros / Sincor-AM (mar/2020)',
  },
];

export const SOMPO_EXAMPLE_CASES: SompoExampleCase[] = [
  {
    id: 'seca-milho-safrinha-pr',
    title: 'Seca severa no milho safrinha',
    subtitle: 'Produtividade abaixo do nível segurado em talhões do Oeste do Paraná',
    culture: 'Milho 2ª safra',
    region: 'Oeste do Paraná (PR)',
    product: 'agricola-produtividade',
    productLabel: 'Agrícola Produtividade',
    severity: 'critica',
    stage: 'aviso',
    stageLabel: 'Aviso de sinistro',
    riskEvent: 'Estiagem prolongada no enchimento de grãos',
    image: '/sompo/seca-milho-safrinha-pr.jpg',
    tags: ['seca', 'safrinha', 'produtividade', 'ZARC'],
    situation:
      'Produtor com apólice de produtividade em milho safrinha aciona sinistro após estiagem no Oeste do PR. NDVI e chuva acumulada nos 60 dias críticos ficam bem abaixo da média histórica da mesorregião. Colheita parcial já aponta kg/ha abaixo da produtividade segurada em 3 de 5 talhões. Corretor pergunta se a unidade segurada será apurada por talhão ou por consolidado da fazenda.',
    signals: [
      'Chuva acumulada 45–60 dias críticos: 38% da média climatológica local',
      'NDVI médio dos talhões sinistrados 22% abaixo da média dos 5 anos',
      'Plantio dentro da janela ZARC da cultura/município (a validar no laudo)',
      'Produtividade obtida parcial: 3.100 kg/ha vs. 4.800 kg/ha segurados',
    ],
    questions: [
      'A apuração é por talhão ou por consolidado da unidade segurada?',
      'Há franquia, participação obrigatória ou nível de cobertura que mude o cálculo?',
      'Telemetria/imagens de satélite bastam para triagem ou a vistoria de campo é mandatória?',
    ],
    claimsCsv:
      'talhao,cultura,evento,prod_segurada_kg_ha,prod_obtida_kg_ha,area_ha,zarc_ok\nT01,milho-safrinha,seca,4800,2900,42,sim\nT02,milho-safrinha,seca,4800,3100,38,sim\nT03,milho-safrinha,seca,4800,3350,51,sim\nT04,milho-safrinha,sem_perda,4800,5100,29,sim\nT05,milho-safrinha,seca,4800,2800,44,sim',
    telemetry:
      'Estação INMET regional: 21 dias sem chuva efetiva no enchimento de grãos. Sensor de umidade de solo (0–20 cm) em T01/T02 abaixo do limiar de estresse hídrico por 18 dias consecutivos. Previsão de chuva útil só após colheita do talhão crítico.',
    finance:
      'LMIR e prêmio da apólice ainda não anexados ao dossiê; marcar valores de indenização como pendentes até o laudo fechar a produtividade obtida e a área elegível.',
    decisionGoal:
      'Montar canvas executivo para underwriting/sinistros agrícolas: priorizar talhões, estimar exposição, listar lacunas (ZARC, apuração, LMIR), plano de vistoria e critério de sucesso para a Sompo — sem inventar números financeiros.',
    patternNote:
      'Seca é o evento que mais aciona seguro agrícola no Brasil; safrinha de milho no Sul/Centro-Oeste é carteira clássica de exposição climática.',
    sources: [
      'Embrapa — peso da seca nos acionamentos',
      'Globo Rural/Forbes — seca+granizo+geada ~87% dos sinistros',
      'Sompo Agrícola Produtividade (comunicação de produto)',
    ],
    suggestedPresetId: 'risco-agro',
    suggestedMode: 'team',
  },
  {
    id: 'granizo-soja-rs',
    title: 'Granizo em soja no enchimento',
    subtitle: 'Dano mecânico localizado com risco de perda total em glebas',
    culture: 'Soja',
    region: 'Noroeste do Rio Grande do Sul (RS)',
    product: 'agricola-produtividade',
    productLabel: 'Agrícola Produtividade',
    severity: 'alta',
    stage: 'regulacao',
    stageLabel: 'Regulação',
    riskEvent: 'Granizo de alta intensidade',
    image: '/sompo/granizo-soja-rs.jpg',
    tags: ['granizo', 'soja', 'vistoria', 'dano-direto'],
    situation:
      'Célula de tempestade com granizo atinge parte da lavoura de soja em R5–R6. Imagens de drone mostram faixas com desfolha severa e vagens danificadas; áreas vizinhas sem dano. Segurado pede regulação urgente porque a colheita começa em 12 dias e teme perda de prova. Perito precisa decidir amostragem e se a perda será parcial por gleba.',
    signals: [
      'Radar e alertas meteorológicos no horário do evento',
      'Mapa de danos por gleba (drone) com % de desfolha e vagens comprometidas',
      'Histórico de granizo da carteira na mesma microregião',
      'Prazo de colheita em 12 dias — risco de perda de evidência',
    ],
    questions: [
      'Qual protocolo de amostragem por gleba minimiza disputa pós-colheita?',
      'Há cobertura de danos diretos nomeados além da quebra de produtividade?',
      'Como priorizar fila de vistoria mobile da Sompo nestas janelas curtas?',
    ],
    claimsCsv:
      'gleba,evento,estagio,desfolha_pct,vagens_danificadas_pct,area_ha,urgencia_colheita_dias\nG-A,granizo,R5,70,55,18,12\nG-B,granizo,R6,40,28,22,12\nG-C,sem_dano,R6,5,2,31,12\nG-D,granizo,R5,85,72,9,10',
    telemetry:
      'Célula de granizo confirmada por radar entre 16h20–16h55. Umidade foliar alta e vento >60 km/h no pico. Imagens georreferenciadas disponíveis; nuvem coberta impede satélite óptico por 48h.',
    finance:
      'Estimativa preliminar de área severamente afetada ~27 ha; valor indenizável depende da produtividade obtida e da franquia — marcar R$ como pendente.',
    decisionGoal:
      'Priorizar regulação de granizo: plano de amostragem, evidências mínimas antes da colheita, ranking de glebas e risco de contestação — canvas acionável para sinistros agrícolas.',
    patternNote:
      'Granizo está entre as três principais causas de sinistro agrícola no Brasil e exige prova rápida de campo.',
    sources: [
      'Levantamentos setoriais seca/granizo/geada',
      'Sompo — vistoria de campo digital para agilizar indenização',
    ],
    suggestedPresetId: 'risco-agro',
    suggestedMode: 'team',
  },
  {
    id: 'geada-trigo-sc',
    title: 'Geada em trigo no espigamento',
    subtitle: 'Quebra de produtividade com possível reclassificação de risco da praça',
    culture: 'Trigo',
    region: 'Meio-Oeste de Santa Catarina (SC)',
    product: 'agricola-produtividade',
    productLabel: 'Agrícola Produtividade',
    severity: 'alta',
    stage: 'underwriting',
    stageLabel: 'Underwriting',
    riskEvent: 'Geada tardia',
    image: '/sompo/geada-trigo-sc.jpg',
    tags: ['geada', 'trigo', 'pricing', 'carteira'],
    situation:
      'Após geada no espigamento, vários avisos de trigo sobem na mesma praça. Underwriting pergunta se a taxa e o nível de cobertura da renovação da carteira da cooperativa local ainda fazem sentido, ou se é preciso restringir produtividade garantida e exigir práticas de manejo/janelas mais conservadoras.',
    signals: [
      'Mínimas noturnas ≤ 0 °C por 2 noites consecutivas no espigamento',
      'Frequência de geada na série 10 anos da mesorregião',
      'Sinistralidade da carteira cooperativa nos últimos 3 ciclos',
      'Adesão dos segurados às recomendações de época de plantio',
    ],
    questions: [
      'Quais alavancas de pricing e de nível de cobertura cabem sem perder competitividade?',
      'A geada deve entrar como carga de risco estrutural da praça ou evento excepcional?',
      'Que evidências de manejo (cultivar, adubação, época) condicionam renovação?',
    ],
    claimsCsv:
      'apolice,cultura,evento,prod_segurada_kg_ha,prod_obtida_kg_ha,area_ha,ano_safra\nA-118,trigo,geada,3200,1800,60,2025\nA-119,trigo,geada,3000,2100,44,2025\nA-120,trigo,geada,3400,1600,72,2025\nA-121,trigo,sem_perda,3200,3600,38,2025',
    telemetry:
      'INMET: mínimas -1,2 °C e -0,4 °C em noites consecutivas. Índice de risco de geada da região classificado como elevado no mês do evento. Cultivares mistas na carteira (ciclo precoce e médio).',
    finance:
      'Prêmio e sinistralidade da carteira cooperativa em consolidação; não inventar taxa — listar premissas e lacunas para o comitê de underwriting.',
    decisionGoal:
      'Canvas de underwriting: impacto da geada na praça, opções de reprecificação/nível de cobertura, condições de renovação e métricas de acompanhamento da carteira de trigo.',
    patternNote:
      'Geada é um dos três eventos que dominam a sinistralidade agrícola nacional e pesa especialmente no Sul em grãos de inverno.',
    sources: [
      'Séries setoriais de sinistros (geada no top 3)',
      'ZARC e guias CNA sobre manejo de risco',
    ],
    suggestedPresetId: 'risco-agro',
    suggestedMode: 'team',
  },
  {
    id: 'chuva-replantio-mt',
    title: 'Chuva excessiva e janela de replantio',
    subtitle: 'Emergência comprometida na soja; decisão entre replantio e perda de stand',
    culture: 'Soja',
    region: 'Médio-Norte de Mato Grosso (MT)',
    product: 'agricola-custeio',
    productLabel: 'Agrícola Custeio',
    severity: 'alta',
    stage: 'aviso',
    stageLabel: 'Aviso de sinistro',
    riskEvent: 'Chuva excessiva / encharcamento pós-plantio',
    image: '/sompo/chuva-replantio-mt.jpg',
    tags: ['chuva-excessiva', 'replantio', 'custeio', 'stand'],
    situation:
      'Chuvas concentradas logo após o plantio de soja reduzem o stand em vários talhões. Segurado avalia replantio, mas a janela ZARC está no limite. Apólice de custeio pode cobrir reembolso de despesas de plantio em perda total da unidade — a equipe precisa distinguir falha de emergência coberta de manejo inadequado e de risco excluído.',
    signals: [
      'Precipitação >120 mm em 72h após plantio em parte da fazenda',
      'Stand médio 48% do alvo nos talhões alagados',
      'Dias restantes na janela ZARC do município: 6',
      'Custo de sementes/defensivos da 1ª operação ainda não conciliado',
    ],
    questions: [
      'A cobertura de replantio/custeio exige perda total da unidade ou admite parcial?',
      'Replantar fora do ZARC compromete indenização futura da mesma safra?',
      'Quais evidências fotográficas e de stand fecham o laudo em 48h?',
    ],
    claimsCsv:
      'talhao,evento,stand_pct,chuva_72h_mm,dias_zarc_restantes,area_ha,decisao_preliminar\nN1,chuva_excessiva,42,138,6,55,avaliar_replantio\nN2,chuva_excessiva,51,125,6,40,avaliar_replantio\nN3,sem_dano,92,48,6,60,manter\nS1,chuva_excessiva,35,151,5,33,perda_provavel',
    telemetry:
      'Sensores de umidade saturados por 4 dias; drenagem natural lenta em N1/S1. Previsão de nova instabilidade em 72h. Imagens de drone de stand disponíveis.',
    finance:
      'Custo de replantio e valor de custeio da operação original ainda em planilha do produtor — marcar R$ como pendente; focar elegibilidade e processo.',
    decisionGoal:
      'Decisão operacional: elegibilidade de custeio/replantio, risco ZARC, plano de evidências e recomendação para o segurado e para a Sompo em 48h.',
    patternNote:
      'Chuva excessiva e replantio são coberturas/temas recorrentes no seguro agrícola multirrisco e em produtos de custeio.',
    sources: [
      'Condições gerais de seguros agrícolas (riscos cobertos: chuva excessiva)',
      'Comunicações de mercado sobre cobertura de replantio',
    ],
    suggestedPresetId: 'risco-agro',
    suggestedMode: 'team',
  },
  {
    id: 'zarc-fora-janela',
    title: 'Plantio fora do ZARC e risco de negativa',
    subtitle: 'Aviso de sinistro com possível descumprimento de janela oficial',
    culture: 'Milho 1ª safra',
    region: 'Sudoeste de Goiás (GO)',
    product: 'agricola-produtividade',
    productLabel: 'Agrícola Produtividade',
    severity: 'critica',
    stage: 'negativa',
    stageLabel: 'Risco de negativa',
    riskEvent: 'Estiagem + plantio fora da janela ZARC',
    image: '/sompo/zarc-fora-janela.jpg',
    tags: ['ZARC', 'compliance', 'negativa', 'governanca'],
    situation:
      'Segurado aciona sinistro por seca, mas o caderno de campo e as imagens de satélite sugerem plantio 9 dias após o fim da janela ZARC do município/cultura. Corretor alega atraso de insumos; underwriting e jurídico precisam de um dossiê objetivo: o que a apólice e as regras de subvenção/Proagro costumam exigir, e como a Sompo deve responder sem improviso.',
    signals: [
      'Data de plantio estimada por satélite: D+9 após fim da janela ZARC',
      'Nota fiscal de sementes com data compatível com atraso',
      'Evento climático (seca) de fato materializado na fase crítica',
      'Apólice com cláusula de observância de boas práticas / ZARC a confirmar',
    ],
    questions: [
      'Quais documentos fecham se houve ou não cumprimento de ZARC?',
      'Como comunicar negativa parcial/total com trilha auditável?',
      'Há precedente de endosso ou exceção comercial que deva ser explicitado?',
    ],
    claimsCsv:
      'item,cultura,data_plantio_estimada,fim_janela_zarc,dias_fora,evento,prod_obtida_kg_ha\nUS-01,milho,2025-11-28,2025-11-19,9,seca,2400\nUS-02,milho,2025-11-21,2025-11-19,2,seca,3100',
    telemetry:
      'Série Sentinel com início de vigor vegetativo compatível com plantio tardio. Déficit hídrico confirmado 40–70 DAS. Nenhum sensor IoT na propriedade.',
    finance:
      'Indenização potencial e subvenção PSR não calculadas — não inventar; mapear se a negativa elimina 100% da cobertura ou só o benefício público.',
    decisionGoal:
      'Dossiê de governança: elegibilidade ZARC, matriz de decisão (indenizar / parcial / negar), evidências mínimas e texto-base de resposta ao corretor.',
    patternNote:
      'ZARC é gate conhecido de Proagro, PSR e boa prática de underwriting rural; descumprimento é causa clássica de disputa.',
    sources: [
      'CNA — Guia dos Seguros Rurais (ZARC e indenização)',
      'MAPA/ZARC — janelas de plantio',
    ],
    suggestedPresetId: 'risco-agro',
    suggestedMode: 'team',
  },
  {
    id: 'penhor-trator-incendio',
    title: 'Penhor rural — trator sinistrado',
    subtitle: 'Incêndio em pátio com gravame bancário e salvados',
    culture: 'Patrimônio rural',
    region: 'Triângulo Mineiro (MG)',
    product: 'penhor-rural',
    productLabel: 'Penhor Rural',
    severity: 'media',
    stage: 'indenizacao',
    stageLabel: 'Indenização',
    riskEvent: 'Incêndio em máquina agrícola',
    image: '/sompo/penhor-trator-incendio.jpg',
    tags: ['penhor', 'maquinas', 'incendio', 'credito-rural'],
    situation:
      'Trator financiado (penhor) sofre incêndio no pátio da fazenda. Banco é beneficiário da apólice; produtor quer reposição rápida para não parar o plantio. Regulador precisa cruzar laudo de bombeiros, valor de mercado, salvados e saldo devedor — linha de negócio relevante na carteira rural da Sompo.',
    signals: [
      'Boletim de ocorrência e laudo do corpo de bombeiros',
      'Número de série / gravame no sistema do credor',
      'Fotos do chassi e do pátio antes/depois',
      'Cotação de reposição e valor de salvados',
    ],
    questions: [
      'Quem recebe a indenização (segurado vs. credor) e em que ordem?',
      'Há subseguro ou depreciação que altere o valor?',
      'Qual SLA interno evita atraso de plantio do cliente?',
    ],
    claimsCsv:
      'bem,evento,ano,valor_segurado,saldo_devedor,salvados,docs_ok\ntrator-7.500h,incendio,2019,pendente,pendente,parcial,boletim_ok',
    telemetry:
      'Sem telemetria embarcada ativa no momento do fogo. Câmera do pátio com falha de gravação entre 02h–04h. Testemunhas do caseiro.',
    finance:
      'Valor de mercado, saldo devedor e salvados ainda em cotação — marcar todos os R$ como pendentes e listar documentos faltantes.',
    decisionGoal:
      'Roteiro de indenização de penhor: partes, documentos, ordem de pagamento, riscos de fraude e próximos passos com prazos.',
    patternNote:
      'Em recorte público de 2023, penhor/máquinas da Sompo superou em prêmios a carteira agrícola pura — caso típico de operação rural além da lavoura.',
    sources: [
      'Valor Econômico — prêmios penhor rural Sompo 2023',
      'Sompo Penhor Rural (comunicação de produto)',
    ],
    suggestedPresetId: 'risco-agro',
    suggestedMode: 'team',
  },
  {
    id: 'irrigacao-alagamento-aurora',
    title: 'Alagamento e falha de irrigação',
    subtitle: 'Fazenda Santa Aurora — briefing clássico de sprint com telemetria mista',
    culture: 'Culturas irrigadas (misto)',
    region: 'Bacia irrigada (Centro-Sul)',
    product: 'agricola-produtividade',
    productLabel: 'Agrícola Produtividade',
    severity: 'alta',
    stage: 'regulacao',
    stageLabel: 'Regulação',
    riskEvent: 'Alagamento + falha de irrigação + pressão de pragas',
    image: '/sompo/irrigacao-alagamento-aurora.jpg',
    tags: ['alagamento', 'irrigacao', 'telemetria', 'csv'],
    situation:
      'Fazenda com histórico de alagamento no talhão norte, oscilação de vazão na irrigação leste e picos de pragas. CSV de sinistros recentes + telemetria em tempo quase real pedem um canvas executivo para a Sompo: o que é risco coberto, o que é manutenção, e qual plano preventivo reduz sinistralidade antes da renovação.',
    signals: [
      '12 eventos de alagamento, 7 falhas de irrigação, 5 de pragas no CSV',
      'Umidade do talhão norte acima do limite operacional',
      'Previsão de 42 mm de chuva em 24h',
      'Sensor de vazão da irrigação leste oscilando',
    ],
    questions: [
      'Quais eventos são climáticos cobertos vs. falha operacional?',
      'Que plano preventivo de 30 dias corta a recorrência?',
      'Quais lacunas de dados bloqueiam precificação da renovação?',
    ],
    claimsCsv: 'tipo_evento,quantidade\nalagamento,12\nfalha_irrigacao,7\npragas,5',
    telemetry:
      'Talhão norte com umidade acima do limite operacional; previsão de chuva 42 mm nas próximas 24h; sensor de vazão da irrigação leste oscilando.',
    finance:
      'Valor de apólice, custo de reparo e produtividade financeira ainda não enviados; marcar valores financeiros como pendentes.',
    decisionGoal:
      'Canvas executivo para underwriting rural com riscos priorizados, premissas explícitas, lacunas, plano preventivo, valor para a seguradora e critério de sucesso.',
    patternNote:
      'Caso-base já usado no LUCA (briefing Sompo Sprint 2) — mantido como referência de telemetria + CSV + decisão.',
    sources: [
      'Briefing interno LUCA-AI (Santa Aurora)',
      'Padrões de sinistro agrícola com múltiplos perigos',
    ],
    suggestedPresetId: 'risco-agro',
    suggestedMode: 'team',
  },
  {
    id: 'carteira-renovacao-cooperativa',
    title: 'Renovação de carteira cooperativa',
    subtitle: 'Concentração geográfica e piora de sinistralidade em três safras',
    culture: 'Soja + milho safrinha',
    region: 'MS / PR (carteira multi-município)',
    product: 'carteira',
    productLabel: 'Carteira / renovação',
    severity: 'alta',
    stage: 'renovacao',
    stageLabel: 'Renovação',
    riskEvent: 'Concentração de risco climático',
    image: '/sompo/carteira-renovacao-cooperativa.jpg',
    tags: ['renovacao', 'portfolio', 'sinistralidade', 'cooperativa'],
    situation:
      'Cooperativa renova pacote de apólices agrícolas com sinistralidade em alta após duas safrinhas secas. Sompo precisa decidir: manter capacidade, cortar municípios, elevar franquia, ou exigir pacote de mitigação (ZARC, sementes, irrigação parcial). Há pressão comercial para não perder o canal.',
    signals: [
      'Sinistralidade da carteira subiu nas últimas 3 safras (série interna a consolidar)',
      '60% da exposição em 4 municípios vizinhos',
      'Correlação alta entre avisos de seca de milho safrinha',
      'Pedido comercial de manter prêmio estável',
    ],
    questions: [
      'Qual é o top 5 de exposição por município e cultura?',
      'Que alavancas (franquia, nível, exclusão, capacidade) equilibram resultado e retenção?',
      'Que critérios de sucesso medir na safra seguinte?',
    ],
    claimsCsv:
      'municipio,cultura,apolices,sinistros_3safras,exposicao_relativa\nMun-A,milho-safrinha,42,29,alta\nMun-B,milho-safrinha,37,24,alta\nMun-C,soja,55,11,media\nMun-D,milho-safrinha,28,21,alta\nMun-E,soja,33,8,baixa',
    telemetry:
      'Mapa de calor de avisos por município (últimas 3 safras). Índice de seca SPEI regional negativo no enchimento do milho safrinha por 2 ciclos consecutivos.',
    finance:
      'Prêmio total, comissão e resultado técnico da carteira ainda não consolidados neste briefing — marcar como pendente e focar priorização e desenho de ação.',
    decisionGoal:
      'Canvas de renovação de carteira: ranking de risco, opções comerciais/técnicas, plano de mitigação e métricas de acompanhamento para a diretoria agrícola.',
    patternNote:
      'Depois de safras secas, renovação com cooperativas concentra decisões de capacidade — padrão recorrente no agrosegurador brasileiro.',
    sources: [
      'Padrões de concentração de risco em safrinha',
      'Sompo — papel do seguro na mitigação de riscos no agro (eventos/setor)',
    ],
    suggestedPresetId: 'risco-agro',
    suggestedMode: 'team',
  },
];

export const SOMPO_PRODUCT_LABELS: Record<SompoProductLine, string> = {
  'agricola-produtividade': 'Agrícola Produtividade',
  'agricola-custeio': 'Agrícola Custeio',
  'penhor-rural': 'Penhor Rural',
  equipamentos: 'Equipamentos',
  carteira: 'Carteira',
};

export const SOMPO_SEVERITY_LABELS: Record<SompoCaseSeverity, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

/** Chaves de handoff SOMPO → bancada LUCA-AI. */
export const SOMPO_LAUNCH_KEY = 'luca.lucaAi.sompoLaunch';
export const SOMPO_PENDING_MISSION_KEY = 'luca.lucaAi.pendingMission';
export const SOMPO_PENDING_PRESET_KEY = 'luca.lucaAi.pendingTeamPresetId';
export const SOMPO_ENTRY_MODE_KEY = 'luca.lucaAi.entryMode';

export type SompoLaunchMode = 'team' | 'individual';

/** Pacote completo: caso + equipe escolhida + auto-run. */
export interface SompoLaunchPayload {
  caseId: string;
  mission: string;
  mode: SompoLaunchMode;
  presetId: string;
  presetLabel: string;
  autoRun: boolean;
}

export function buildSompoCaseMission(caseItem: SompoExampleCase, teamLabel?: string): string {
  const teamLine = teamLabel
    ? `Equipe selecionada para avaliar: ${teamLabel}`
    : null;
  return [
    `Caso SOMPO: ${caseItem.title}`,
    `Cultura/região: ${caseItem.culture} — ${caseItem.region}`,
    `Produto: ${caseItem.productLabel} | Estágio: ${caseItem.stageLabel} | Evento: ${caseItem.riskEvent}`,
    teamLine,
    '',
    'Situação:',
    caseItem.situation,
    '',
    'Sinais observados:',
    ...caseItem.signals.map((item) => `- ${item}`),
    '',
    'Perguntas abertas:',
    ...caseItem.questions.map((item) => `- ${item}`),
    '',
    'Entrada de sinistros (CSV do briefing):',
    caseItem.claimsCsv.trim(),
    '',
    `Telemetria / evidências de campo: ${caseItem.telemetry.trim()}`,
    '',
    `Dados financeiros: ${caseItem.finance.trim()}`,
    '',
    `Objetivo executivo: ${caseItem.decisionGoal.trim()}`,
    '',
    'Regras: não invente dados financeiros; marque como pendente quando faltar. Não use linguagem de material fictício. Trate como caso operacional realista de seguro agrícola/rural.',
    `Nota de padrão setorial: ${caseItem.patternNote}`,
  ].filter((line) => line !== null).join('\n');
}

export function queueSompoLaunch(payload: SompoLaunchPayload): void {
  try {
    window.sessionStorage.setItem(SOMPO_LAUNCH_KEY, JSON.stringify(payload));
    window.sessionStorage.setItem(SOMPO_ENTRY_MODE_KEY, payload.mode);
    // Compat com leitores legados da bancada.
    window.sessionStorage.setItem(SOMPO_PENDING_MISSION_KEY, payload.mission);
    window.sessionStorage.setItem(SOMPO_PENDING_PRESET_KEY, payload.presetId);
  } catch {
    // sessionStorage pode falhar em modo restrito.
  }
}

/** @deprecated Prefira queueSompoLaunch com equipe escolhida pelo usuário. */
export function queueSompoCaseForLuca(caseItem: SompoExampleCase): void {
  queueSompoLaunch({
    caseId: caseItem.id,
    mission: buildSompoCaseMission(caseItem),
    mode: caseItem.suggestedMode,
    presetId: caseItem.suggestedPresetId,
    presetLabel: caseItem.suggestedPresetId,
    autoRun: false,
  });
}

export function consumeSompoLaunch(): SompoLaunchPayload | null {
  try {
    const raw = window.sessionStorage.getItem(SOMPO_LAUNCH_KEY);
    window.sessionStorage.removeItem(SOMPO_LAUNCH_KEY);
    // Limpa espelhos legados para não reaplicar em outra sessão.
    window.sessionStorage.removeItem(SOMPO_PENDING_MISSION_KEY);
    window.sessionStorage.removeItem(SOMPO_PENDING_PRESET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SompoLaunchPayload>;
    const mission = String(parsed.mission || '').trim();
    const mode = parsed.mode === 'individual' ? 'individual' : parsed.mode === 'team' ? 'team' : null;
    const presetId = String(parsed.presetId || '').trim();
    if (!mission || !mode || !presetId) return null;
    return {
      caseId: String(parsed.caseId || '').trim(),
      mission,
      mode,
      presetId,
      presetLabel: String(parsed.presetLabel || presetId).trim(),
      autoRun: parsed.autoRun !== false,
    };
  } catch {
    return null;
  }
}

export function consumePendingSompoMission(): string | null {
  try {
    const value = window.sessionStorage.getItem(SOMPO_PENDING_MISSION_KEY);
    window.sessionStorage.removeItem(SOMPO_PENDING_MISSION_KEY);
    const text = String(value || '').trim();
    return text || null;
  } catch {
    return null;
  }
}

export function consumePendingSompoPresetId(): string | null {
  try {
    const value = window.sessionStorage.getItem(SOMPO_PENDING_PRESET_KEY);
    window.sessionStorage.removeItem(SOMPO_PENDING_PRESET_KEY);
    const id = String(value || '').trim();
    return id || null;
  } catch {
    return null;
  }
}
