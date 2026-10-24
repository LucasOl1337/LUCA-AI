# Glossário

Termos de domínio do LUCA-AI. Um termo, um significado; código e interface seguem estes nomes.

## Laboratório do sensor

**Ensaio do sensor**:
Demonstração controlada de um fenômeno que ajuda a entender uma leitura e sua interpretação na operação.
_Evitar_: Case, quando não há um cenário com desfechos.

**Leitura simulada**:
Valor produzido por um ensaio, não uma medição do equipamento físico.
_Evitar_: Leitura ao vivo, dado medido.

**Limite didático**:
Referência configurada para uma demonstração, não uma certificação de estabilidade ou segurança do equipamento.
_Evitar_: Limite seguro do veículo.

## SOMPO: cadastro de veículos

- **Veículo**: máquina cadastrada na aba Veículos do SOMPO, por conta. Campos: `id` (minúsculas, números e hífen, imutável e único), `veiculo` (o Tipo), `placa` (placa ou, em máquina agrícola, identificação interna como `TRT0001`), `modelo` (o modelo comercial, rotulado "Modelo (cadastro)" na tela), `modelo3d` e `dispositivo` (opcional). Contrato em `shared/sompo-vehicles.js`.
- **Tipo**: `Caminhão` ou `Trator`, o campo `veiculo` do cadastro. Define quais cases o simulador oferece.
- **Modelo 3D**: a malha usada no simulador, campo `modelo3d` do cadastro e coluna `model3d_id` do episódio. Hoje: `caminhao-sompo` (caminhão atual) e `trator-max` (o trator de brinquedo das fotos em `missoes/trator-referencias`, equipamento `max-tractor` na cena agrícola). Não confundir com o "Modelo (cadastro)", que é texto livre.
- **Dispositivo**: o ESP32 que manda telemetria, identificado por `tractorId`/`trator` (`001` no Firebase, `SIM-001` no simulador). Não é o Veículo: a associação é explícita, pelo campo `dispositivo` do cadastro (vazio = sem dispositivo; um dispositivo por veículo na conta). Nome parecido não associa: `trator-0001` só vira o feed `001` se alguém gravar `001` no campo. Com associação, o modo físico mostra o Modelo 3D do veículo; sem ela, mostra a situação.
- **Case**: um cenário do simulador com seus desfechos (ex. obstáculo frontal com parada segura ou toque leve). Os dados de case são sintéticos e aparecem rotulados assim na tela. Um episódio gravado guarda o case (`scenario_id`, `outcome_id`) e, desde o cadastro, o veículo (`vehicle_id`, `vehicle_snapshot`, `model3d_id`).

## Stand do trator

**Stand**:
O quiosque em volta do trator, com o monitor, o microfone e a página `/stand` em tela cheia. Quem opera o quiosque é a equipe do stand; Operador é quem dirige o trator.
_Evitar_: Operador (para a equipe do stand), totem (para o quiosque inteiro).

**Totem**:
O aparelho do quiosque: monitor, computador e controle DualSense, com a página `/stand` aberta em tela cheia na conta `totem`. É o equipamento, não a página nem o stand.
_Evitar_: Stand (para o aparelho), kiosk.

**Modo do stand**:
O que a página `/stand` está mostrando: Coruja, Vitrine ou Simulação. Troca pela barra de modos (aparece 5 s depois de um toque) ou por L1/R1 no controle; PS volta para Coruja. Lógica pura em `src/components/stand/modoStand.ts`.
_Evitar_: Tela (Tela é Atração, Conversa ou Vídeo, dentro de Coruja), cena.

**Coruja**:
O Modo do stand em que o Avatar LUCA atende o público por voz, com as telas Atração, Conversa e Vídeo. Sem voz no servidor, a Atração não promete microfone e o toque leva à Vitrine.
_Evitar_: Modo voz, assistente.

**Vitrine**:
O Modo do stand que toca em carrossel os Vídeos do stand intercalados com Telas do app (vídeo, Lab, vídeo, Trator agora, vídeos restantes), com o título numa linha. No controle, setas trocam o item e ✕ pausa (o replay congela). Os vídeos tocam com a narração aprovada. Durante a Vitrine a Escuta e a sessão anterior são encerradas para não ouvir a própria narração. Se o navegador bloquear autoplay com som, o botão "Ativar som da Vitrine" libera por gesto; também permite silenciar explicitamente. Legendas queimadas e `.srt` permanecem disponíveis. Ordem e pulos em `src/components/stand/vitrineStand.ts`.
_Evitar_: Playlist, demo.

**Tela do app**:
Um item da Vitrine que mostra o app de verdade, só lendo: o replay do Laboratório (tombamento em declive de Piracicaba, dados sintéticos, a 4x até o fim ou 45 s) ou o Trator agora (leitura do sensor do trator do stand, 20 s, com "Ao vivo" só com sinal fresco do Firebase). Não grava caso, não sobe arquivo e só faz GET. Sem WebGL, dado que não chega em 6 s, sinal velho, 401 ou 502: sai da volta sem buraco, e o motivo fica em `data-pulada` para a equipe.
_Evitar_: Iframe, demo do app, print.

**Simulação**:
O Modo do stand com o simulador do Trator MAX em tela cheia, sem cabeçalho nem painel, jogado no controle. Nunca entra sozinho; sem uso por 90 s avisa e volta para Coruja. Não grava nada no servidor: □ △ ○ tocam o cenário sem abrir episódio (`sompoTelemetryWriter` devolve `null` no kiosk e também no `/sompo` aberto pelo modo Site dentro do `/stand`). Não é a página `/sompo`.
_Evitar_: Simulador (para o modo), jogo.

**Qualidade automática**:
Na Simulação do totem, o render desce degraus (pixel ratio, pós, sombras) quando o FPS fica abaixo de 40 por 3 s, e só mantém a descida se ela render 15 % de FPS; sem ganho, volta e trava (o gargalo é CPU). Lógica pura em `src/components/sompo/qualidadeAdaptativa.ts`; o degrau atual aparece em `data-qualidade` no palco. Só no kiosk; `/sompo` não muda.
_Evitar_: Modo leve, low-spec.

**Tempo do ensaio**:
O relógio do ESP32 virtual na Simulação (segundos desde o início do cenário), no canto de cima à direita. Em `/sompo` continua em ms.
_Evitar_: Latência (não é latência).

**Repouso**:
O ciclo sem ninguém por perto: Coruja na Atração, depois de 60 s sem toque, controle ou voz vai para a Vitrine, e no fim de cada volta da Vitrine sem ninguém retorna à Coruja.
_Evitar_: Ocioso, standby (termo do supervisor).

**Stand sem login**:
O `/stand` quando o navegador do totem não tem sessão (401). No lugar da tela de login mostra a Coruja sem voz e a Vitrine só com os vídeos públicos; Simulação, Site, voz, escuta e Telas do app ficam de fora, porque leem a API. O aviso "sem login" no canto é para a equipe: Shift+Q abre o login ali mesmo e, ao entrar, o stand completo volta (`src/components/stand/StandSemLogin.tsx`).
_Evitar_: Modo offline, modo de demonstração (a internet pode estar ok; o que falta é a sessão).

**Avatar LUCA**:
O personagem que fala pela IA do stand (`src/components/stand/AvatarLuca.tsx`). O padrão é a `coruja-a`: a arte aprovada da coruja tech branca e azul com headset, animada em camadas SVG (piscar, olhar, respiração, visor), e a voz aparece no halo e nas luzes do headset, sem boca. Na tela aparece só como "LUCA". Variações vetoriais antigas por `?variante=`: `coruja`, `operario` e `robo`.
_Evitar_: Mascote, bot, Sompo (a Sompo só aparece como texto).

**Atração / Conversa / Vídeo**:
As três telas do modo Coruja. Atração chama o público e volta sozinha após 10 s de voz ociosa. Conversa mostra o Avatar LUCA grande, o indicador ouvindo/pensando/falando e a legenda. Vídeo toca um Vídeo do stand em tela cheia com o avatar pequeno no canto e, ao terminar ou ser pulado (tecla N), volta para Conversa.
_Evitar_: Modo (Modo é Coruja, Vitrine ou Simulação), cena.

**Turno de voz**:
Uma pergunta do público e a resposta falada do LUCA: o Scribe transcreve no navegador, o servidor pensa com Claude e devolve frases com áudio por `POST /api/stand/turno`. Detalhes em `docs/stand-voz.md`.
_Evitar_: Mensagem, request.

**Escuta**:
Na Coruja, na Vitrine e no Site, o microfone aberto esperando alguém falar. Só o volume é medido no aparelho, e nada sai dele até um Despertar. Na Simulação fica fechada. A equipe pode desligar a Escuta, e aí a conversa volta a abrir só por toque.
_Evitar_: Wake word, hotword (não há palavra de ativação), modo sempre ouvindo.

**Despertar**:
A Escuta ouve voz perto do microfone e abre uma conversa sem toque e sem saudação, porque a pessoa já está falando. A tela só muda quando a primeira palavra é entendida: aí a Coruja aparece na Conversa, venha de onde vier. Um Despertar falso é o que abre a conversa e não ouve fala de verdade em 6 s: a conversa fecha sem a tela mudar, e falsos seguidos pausam a Escuta por um tempo.
_Evitar_: Ativação, gatilho.

**Interrupção**:
O público fala por cima do LUCA: a voz abaixa na hora e, se a transcrição parcial tiver palavras de verdade que não sejam eco, a fala para e o turno anterior é abortado.
_Evitar_: Barge-in (só no código e nas docs técnicas), corte.

**Teto diário de créditos**:
Limite de créditos ElevenLabs (TTS + Scribe) gastos pela voz do stand num dia de Brasília, contado no servidor. Estourado, a voz pausa até a meia-noite e o status diz `teto_diario`.
_Evitar_: Cota, franquia.

**Vídeo do stand**:
Resposta pré-gravada a uma pergunta central do público do stand, identificada por um id (`pipeline-completo`, `painel-sompo`, `painel-segurado`).
_Evitar_: Clipe, demo, apresentação.

**Resumo falado**:
Uma ou duas frases que a IA diz antes de tocar um Vídeo do stand.
_Evitar_: Legenda, descrição.

**Roteamento de pergunta**:
Decisão sobre uma pergunta do público: tocar um Vídeo do stand, oferecê-lo ou responder ao vivo.
_Evitar_: Classificação (termo da bancada de agentes), intent.

**Fora de escopo**:
Pergunta que pede resposta ao vivo, sem vídeo, mesmo quando cita trator ou Sompo.
_Evitar_: Pergunta inválida.

**Cenário do stand**:
Um Case com desfecho fixo, disparado por um clique ou por um botão do controle, que grava um episódio e tem uma pergunta associada que o Roteamento de pergunta usa para achar o vídeo. Hoje: obstáculo com alerta a tempo, inclinação perigosa e reação atrasada.
_Evitar_: Cenário pré-programado, roteiro.

**Reação atrasada**:
O alerta toca no mesmo instante de um desfecho seguro, mas o operador freia tarde e há contato. O atraso é humano, não do sistema.
_Evitar_: Alerta atrasado.

**Modo cabine**:
Câmera em primeira pessoa no assento do operador, com olhar livre limitado. É uma câmera, não muda os dados do cenário.
_Evitar_: Simulador em primeira pessoa (quando se refere só à câmera).

**Condução livre**:
O operador dirige com o controle, sem roteiro. Não grava episódio, e o que aparece na tela é rotulado SIMULADO.
_Evitar_: Case livre, desfecho manual.

**Desafio**:
Um trecho curto da Simulação, de até 90 s, com começo, objetivo e fim, jogado no Modo cabine com teto de 6 km/h (fora dele a Condução livre segue a 12 km/h). Hoje há dois desafios, que se alternam a cada rodada:

- o fardo à frente: parar antes do fardo com o alerta tocando;
- o pendente lateral: atravessar 30 m da rampa lateral de 22° e frear quando tocar o alerta de inclinação de 20°.

O fardo termina ao parar perto do obstáculo, ao encostar nele ou ao estourar o tempo. O pendente termina ao parar depois do alerta, ao atravessar, ao Tombar ou ao estourar o tempo. Não grava episódio. Lista em `src/components/gameplay/desafios.ts`.
_Evitar_: Missão, fase, nível.

**Corrida**:
Uma passada do circuito de estacas no Modo Simulação do `/stand`, do primeiro R2 até a chegada, colisão, atolamento, tombamento ou abandono. O relógio só anda a partir da primeira aceleração, e as pausas ficam de fora. O resultado mostra o desfecho em português ("Percurso concluído", "Colisão com obstáculo", "Atolou na área alagada", "Tombou na encosta", "Corrida abandonada"), o tempo, os avisos respondidos e a reação média. ✕/A começa outra corrida; "Analisar relatório" só no toque. Lógica em `src/components/gameplay/circuito.ts`.
_Evitar_: Run, missão, Desafio (o Desafio é o trecho curto do `/gameplay`).

**Painel da cabine**:
O que o operador vê do sistema LUCA-AI dentro da cabine durante a Simulação: distância do sensor frontal na cor da faixa (verde a partir de 200 cm, amarelo abaixo, vermelho até 100 cm ou com alerta), a faixa vermelha "Obstáculo a 1,5 m · freie" no alto do para-brisa quando o alerta de 150 cm acende, o bipe e o selo SIMULADO sempre visível. A regra de cor é a mesma do `/sompo` (`physicalRiskBands` em `shared/sompo-physical-interactions.js`); a tradução do estado em cor, rótulo e bipe está em `src/components/gameplay/alertaCabine.ts`.
_Evitar_: HUD (só no código antigo `firstPersonHud`), dashboard.

**Tombou**:
Desfecho do pendente lateral quando a rolagem ou a arfagem passa de 35°. O número vem do cenário de tombamento do `/sompo`, em que a parada controlada para em 27° e o tombamento passa por 33° e 39°. É limite de jogo, não medido nem certificado. O alerta continua sendo o de 20° do painel.
_Evitar_: Capotou.

**Resultado do desafio**:
A tela de 10 s no fim de um Desafio: distância em que o alerta acendeu, tempo de reação (do alerta ao primeiro freio) e quanto sobrou até o obstáculo, mais uma frase (parou a tempo ou Reação atrasada). No pendente lateral: inclinação em que o alerta acendeu, tempo de reação e grau máximo que a máquina atingiu. Sem ranking, sem nome e sem gravar nada.
_Evitar_: Placar, score (o score 0–100 do `/sompo` mede outra coisa).

**Veredito da bancada**:
O que a bancada de agentes devolve sobre um episódio gravado: o que aconteceu, a severidade para a seguradora e o que fazer agora. É um parecer de agentes de IA, citado só pelo que a sessão mostra.
_Evitar_: Classificação, laudo, decisão da seguradora.

**Vitrine offline**:
Coruja sem voz e os três vídeos públicos salvos no próprio navegador, depois de uma abertura online do `/stand/`. Só a casca estática e os vídeos entram no cache versionado pelo commit. API, voz, Site e Simulação ficam de fora. A conversa volta sozinha quando o servidor responde novamente e a sessão continua válida.
_Evitar_: App offline, voz offline, sessão em cache.

## Pessoas do seguro rural

**Segurado**:
O produtor rural titular da apólice. É dono da máquina e do resultado, mesmo quando não a dirige. Hoje não tem visão própria no LUCA-AI: vê o mesmo painel SOMPO que qualquer conta.
_Evitar_: Cliente, usuário, operador (quando se refere ao titular).

**Operador**:
Quem dirige a máquina no campo. Pode ser o próprio segurado ou um funcionário. É quem recebe o alerta na cabine.
_Evitar_: Segurado, motorista (em máquina agrícola).

**Seguradora**:
A Sompo vendo o painel: casos de exemplo, dados públicos do setor, frota e episódios. Não há carteira real de apólices no app.
_Evitar_: Carteira da Sompo (para os casos de exemplo).

**Ação do site**:
Pedido da IA do stand para operar o próprio app, escolhido de uma lista fechada (abrir aba, abrir caso, rodar Cenário do stand, gravar episódio, analisar na bancada, voltar ao início). Pedido fora da lista é recusado e a IA explica que não pode.
_Evitar_: Comando, automação, macro.

**Executor do stand**:
A camada do app que realiza uma Ação do site na tela como uma pessoa: cursor visível indo até o Alvo, destaque e clique de verdade.
_Evitar_: Bot, robô, piloto automático.

**Alvo**:
O elemento da tela que uma Ação do site clica ou escolhe. Se não aparece, a ação falha com mensagem, sem atalho invisível.
_Evitar_: Botão (quando é um seletor), seletor CSS.
