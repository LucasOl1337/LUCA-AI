# Progresso visual 3D

Formato: `[passada] id · leitor · cena · falha` → estado. Leitores: D diretor, F fotografia, E engenharia.

## Passada 0 · baseline (25/09/2026, main `caab716`)

Capturas em `.cinema/shots/baseline/` (fora do git). 28 cenários, zero erro de página.

### Agro (o palco mais fraco)

- [0] A1 · D/F · todos os agro dia · o talhão termina num anel de morro verde liso e uniforme,
  sem cerca, sem vizinho, sem árvore: parece um mapa de jogo vazio. Uma fazenda de grão real tem
  talhões vizinhos em outros estágios, linha de mata, carreador.
- [0] A2 · D · colheita (harvest-dust, night, geofencing) · a colheitadeira colhe lavoura verde.
  Grão se colhe seco: a lavoura madura é palha dourada. Erro de história e de cor.
- [0] A3 · F · colheita · fileiras em verde saturado uniforme, folha larga lendo como capim alto.
- [0] A4 · F · agro noite · o morro de fundo fica iluminado quase como de dia (cinza esverdeado
  chapado); a noite não tem profundidade e os faróis não mandam na imagem.
- [0] A5 · F · silos · cilindro liso com cone grande, sem base, sem escada, sem passarela:
  lê como brinquedo. O elevador é uma caixa escura.
- [0] A6 · F · agro dia · luz direta chapada no morro: falta a sombra de nuvem que a rodovia já tem.
- [0] A7 · F · atolamento · lâmina d'água é um disco azul-acinzentado de borda dura.
- [0] A8 · F · galpão · vermelho saturado e plano, fardos amarelo-limão.

### Rodovia

- [0] R1 · F · aquaplanagem/chuva · faixa escura de mata flutuando no horizonte sobre a névoa,
  com a base lavada: parece recortada.
- [0] R2 · E · todos · 6,9 M triângulos e 21–28 ms por quadro; é o palco caro. Não piorar.

### Pós (os dois palcos)

- [0] P1 · E · céu e névoa · gradiente longo em 8 bits sem dither: risco de banding no céu e na
  névoa (visível na chuva).
- [0] P2 · F · grade · sem grão; a imagem lê como render limpo de jogo, não como câmera.

### /sensor

- [0] S1 · F · janela · árvores de fora são cones low-poly facetados, destoam do resto da sala.

## Passada 1 · lavoura madura e vizinhança

- A2, A3 → **fechado**. `createSompoCropRows` ganhou `mature`: com a colheitadeira a lavoura é
  palha seca dourada, com variação por planta; o trator continua na soja verde.
- A1 → **fechado**. Fora do talhão o chão vira colcha de talhões vizinhos (46×38 m) em estágios
  diferentes (soja, palhada, solo exposto, pasto), cada um com a sua direção de linha, carreador de
  terra entre eles e curva de nível. Linha de mata ao fundo: capões de cerrado e quebra-vento de
  eucalipto em cards cruzados instanciados (uma InstancedMesh por espécie).
- A6 → **fechado**. Sombra de nuvem andando sobre o campo (`cloudDrift`), mesmo recurso da rodovia.

## Passada 2 · silos e noite

- A5 → **fechado**. Silo com base de concreto, anéis de costura, telhado baixo com respiro,
  escada com gaiola, passarela, torre treliçada do elevador, bicas, secador e laje. As peças são
  fundidas por material (`mergeByMaterial`): o conjunto inteiro custa poucos draw calls.
- A4 → **parcial**. Névoa noturna azul-escura, ambiente e sol baixos: o morro deixou de ficar
  aceso, mas a névoa começava a 14 m e engolia a própria máquina.

## Passada 3 · lama, galpão, chuva

- A4 → **fechado**. Névoa noturna de 24 a 170 m: silhueta da mata e dos silos contra o céu,
  faróis e giroflex mandam na imagem.
- A7 → **fechado**. Lama e poça com borda orgânica em alfa (`softEdgedPatch`), sem escrita de
  profundidade: a mancha escura invade as fileiras em vez de um disco.
- A8 → **fechado**. Vermelho de galpão desbotado (`#7c4538`), fardo com palha prensada, dois fios de
  barbante e arestas estufadas (textura procedural, sem asset novo). A mata do fundo passou a
  aparecer também no cenário do galpão.
- R1 → **fechado**. A faixa escura não era geometria: vinha do HDRI nublado. Duas tentativas pela
  névoa da cena não mudaram um pixel (medido), a causa era o céu. Véu de chuva na base do domo
  (`wetSky`) e névoa de chuva fechando em 175 m.
- P2 → **fechado**. Grão IGN no grade, forte nos meios-tons (ver custo na passada 5).
- P1 → **fechado na passada 6**, com prova de captura.

## Passada 4 · /sensor e regressão de custo

- S1 → **fechado**. As árvores da janela eram icosaedros facetados; agora usam os mesmos billboards
  botânicos do simulador em cards cruzados (eucaliptal ao fundo, jacarandás perto), com luz de céu
  baixa para não virar recorte preto no contraluz. Plantas dos vasos com copa subdividida e
  sombreamento suave. Render do laboratório 3,2 → 3,3–3,8 ms (medida da própria página).
- E1 · E · todos · a captura completa mostrou +2 a +3 ms em **todos** os cenários, rodovia
  inclusive, onde quase nada mudou. Carga da máquina não explica: A/B intercalado base × branch
  (worktree da `main` servida em 5263) confirmou. Bisseção apontou o grão animado.

## Passada 5 · orçamento

- E1 → **fechado**. Grão fixo na tela, sem animação por quadro. A/B intercalado (3 rodadas,
  mediana): grão vivo +2,7 a +3,6 ms, grão fixo +0,1 a +0,3 ms, dentro do ruído.
- A/B amplo contra a `main` (3 rodadas intercaladas, mediana do intervalo de quadro):

  | Cenário | main | branch | Δ |
  |---|---|---|---|
  | rollover | 26,2 | 25,5 | −0,7 |
  | aquaplaning | 23,9 | 23,4 | −0,5 |
  | steep-descent | 23,1 | 22,3 | −0,8 |
  | agri-harvest-dust | 21,7 | 21,2 | −0,5 |
  | agri-field-bogging | 19,3 | 19,0 | −0,3 |
  | agri-barn-maneuver | 20,8 | 19,9 | −0,9 |
  | agri-night-operation | 20,9 | 20,7 | −0,2 |
  | agri-geofencing-operacao | 20,5 | 20,5 | 0,0 |

  Tudo dentro do ruído e do orçamento. Draw calls do agro: 53–69, antes 54–100.
- Releitura completa (agro, rodovia seca e chuva, `/sensor`): nenhuma falha nova relevante.
  Critério de parada do método atingido.

## Passada 6 · releitura das afirmações

- P1 → **fechado com prova**. Recorte do céu da chuva com contraste realcado
  ([`p1-ceu-dither.png`](./p1-ceu-dither.png), em cima a main, embaixo o branch): na main o
  gradiente tem degraus em faixas; com o dither o degrau some no ruído fino. Mesma região: 26 → 29
  níveis de cinza distintos.
- Restolho atrás da colheitadeira: **não era falha**. A faixa colhida já existe no shader
  (`cropStubble`, guiado por `cropCut` dos cenários); as capturas só enquadram a plataforma de
  frente. Sai da lista.
- Produção: `/sompo` e `/sensor` publicados exigem login, e a bancada de captura não tem sessão.
  O que prova a release publicada é o hash dos chunks 3D (`SompoTruckSimulator-*`,
  `SensorLabPage-*`), igual ao build capturado aqui. Nenhuma conta foi criada em produção para
  olhar.

## Em aberto (próximas passadas)

- Plantas dos vasos do `/sensor` ainda são volumes simples; baixa prioridade, estão fora de foco.
- Laboratório de geofencing visto de cima segue o mapa de calor sintético, sem trabalho de luz.
