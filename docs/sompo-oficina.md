# Oficina 3D SOMPO

No produto: **SOMPO → Telemetria → Simulador 3D → Oficina 3D** (`/sompo/?aba=telemetria`). A oficina usa o mesmo palco e o mesmo relógio do simulador. Não exige abrir outro aplicativo.

## O que é possível criar

- Caminhão modular com pintura da cabine, cor do baú, acabamento, inspeção de malha e separação de cabine, baú, chassi e rodas. As rodas giram pelo deslocamento; as dianteiras esterçam e os limpadores acompanham a chuva.
- Variações com nome, equipamento e luz (dia, fim de tarde, nublado), exposição e intensidade do vento. A biblioteca fica no `localStorage` deste navegador; **não é uma biblioteca compartilhada no servidor**.
- Preset JSON importável/exportável, PNG do render atual e GLB do equipamento na pose atual. O GLB contém geometria e materiais; não contém o cenário, o shader de vegetação nem clipes de animação.
- Caminhão reconstruído, trator e colheitadeira originais continuam acessíveis na seleção de equipamentos. Seus atlas são preservados; pintura por peças está disponível no caminhão modular.

Ao sair da oficina, a montagem e a visualização de malha voltam ao modo normal; pintura e luz permanecem na sessão. **Salvar variação** também define a configuração inicial para a próxima visita. JSON aceita somente valores conhecidos, cores hexadecimais e números limitados; não aceita scripts ou URLs de assets.

Pausa, reprodução a 0,5×/1×/2× e controle de instante usam um relógio compartilhado entre cena e telemetria sintética. Durante gravações, os controles de edição/replay ficam bloqueados e o episódio usa tempo real. Edição, pausa, velocidades alternativas e replay por busca não acrescentam amostras comuns ao histórico. Gravações mantêm o fluxo de episódios existente. O Firebase mantém seu modelo e calibração físicos.

## Aproveitamento das referências

| Referência filtrada | Uso concreto |
| --- | --- |
| [ThreeUI Landscape](https://github.com/MengTo/threeui/blob/main/public/landscape.html) | Adaptação do mecanismo de lâminas instanciadas e vento no vertex shader em `createSompoCropRows.ts`: raízes fixas, fase espacial, flexão crescente até a ponta, variação de cor. Adaptado ao relógio do episódio, orçamento móvel e restolho após passagem. Licença MIT preservada em `public/sompo/studio/THREEUI-LICENSE.txt`. |
| [Dream Loop](https://github.com/achimala/dream-loop) / referência de Anshu | Imagem-alvo → render real → inspeção → correções de composição e materiais. Nesta rodada, revisão feita pessoalmente, sem agente avaliador. A imagem-alvo é identificada como referência e nunca conta como evidência do simulador. |
| [Tripo 3D Prompts](https://www.tripo3d.ai/3d-prompts) | Seleção de técnicas úteis às cenas agrícolas: luz/céu/névoa coerentes, vento controlável e reprodução. Sem importar o catálogo inteiro ou conectar um gerador pago à interface. |
| Image generation | `pasture-albedo.webp`: textura nova de pastagem usada no terreno, 1254×1254, WebP qualidade 82. Metadados e hash em arquivo `.provenance.json`. A textura fornece cor; relevo, perspectiva, luz e sombra continuam sendo calculados em Three.js. |

Os GLBs existentes e as texturas PBR/HDRI Poly Haven mantêm seus arquivos e créditos. A oficina de geração por scripts (`scripts/sompo-agri/`) continua separada da criação de variações no produto. Esta interface não promete gerar um GLB novo a partir de texto.

## Estrutura e custo

- `SompoStudio.tsx` e `sompoStudioConfig.ts`: interface, biblioteca e formato de preset.
- `sompoPlayback.ts`: relógio de reprodução.
- `refineSompoTruck.ts`: agrupamento de peças estáticas por material, pivôs de animação, acabamento e exportação.
- `createSompoAtmosphere.ts`: céu, nuvens, sol, névoa e exposição coordenados.
- `createSompoPastureSurface.ts`: textura de pastagem aplicada no espaço do mundo, transição de solo e variação em escala maior.
- `createSompoCropRows.ts`: lavoura instanciada, vento na GPU e corte visual determinístico. Corte visual não é simulação de produtividade nem contato físico de lâminas.
- Os dois módulos `*Stage.ts` continuam donos do renderer, câmera e descarte. `SompoTruckSimulator.tsx` continua dono dos dados e episódios.

O caminhão modular é o padrão na simulação, dispensando baixar o GLB reconstruído para iniciar. Subpeças estáticas são agrupadas por material. Postes só reenviam matrizes quando são reciclados; árvores distantes usam impostores e árvores que ocultam o veículo são retiradas da linha de visão. O render usa um passe de cor com PBR e sombras, sem os passes adicionais de AO/bloom. Desktop: DPR máximo 1,5 e sombra 2048; móvel: DPR máximo 1 e sombra 1024. A lavoura reduz instâncias em telas compactas.

## Verificação técnica

```bash
npm run typecheck
node --test server/sompo-*.test.js
npm run build
node scripts/sompo-preview/studio-check.mjs
```

Os testes gráficos desta sessão abrem com a classe `sompo-studio-qa`, encaminhada silenciosamente ao workspace 7. Não abrem no monitor do jogo nem mudam a janela ativa.

O último comando executa uma fixture técnica com APIs em memória e Chrome dedicado, fecha os processos ao terminar e grava renders/JSONs em `.scratch/sompo-round2/evidence`. Não é uma publicação nem faz requisições autenticadas ao produto. Requer Chrome com GPU NVIDIA no ambiente usado na rodada; `SOMPO_CHROME` altera o executável e `SOMPO_QA_OUTPUT` altera a saída.

Para execução no workspace oculto, `offscreen=1` mantém o render ativo por um timer de 16 ms apenas na fixture: não permite concluir FPS de apresentação. A rodada nativa anterior e a rodada por timer são identificadas nos JSONs; não compare CPU entre agendadores.

A medição usa cache desligado, uma aba, GPU identificada, aquecimento e avanço de 2 a 10 segundos no relógio lógico. Cada callback medido movimenta a cena. CPU é duração do callback, não tempo de GPU; viewport móvel no PC não substitui telefone físico. Scripts anteriores que mediam frames depois de congelar o relógio não são prova de desempenho em movimento.

Limites: os arquivos GLB agrícolas originais não contêm rig; a articulação visual é construída na carga, conforme a revisão abaixo. Defeitos de reconstrução permanecem nos atlas e nas malhas. O cereal é estilizado. Não foram validadas colisões em todas as poses extremas. A exportação GLB não comprime a malha com Draco/Meshopt e pode ser maior que os arquivos da biblioteca original.

## Animações e articulação — revisão de 12/09/2026

- A colheitadeira usa a orientação própria do seu GLB (frente original −X), diferente da frente do trator (+Y antes da transformação do nó). Ambas avançam em +X na cena.
- `shared/sompo-motion.js` integra a rotação das rodas e do molinete pelo relógio do cenário. Rodas seguem `wheelSpeedKph`, incluindo patinagem; marcha é discreta. Pausa, seek e taxas de reprodução não acumulam rotação.
- `rigSompoAgriAsset.ts` particiona os triângulos dos GLBs existentes em corpo, quatro rodas e implemento/plataforma. Preserva UVs e atlas. Acrescenta molinete aberto e cilindros hidráulicos articulados. Os arquivos originais continuam intactos.
- O percurso agrícola integra velocidade e guinada. Apoio no terreno usa vértices dos envoltórios convexos das peças articuladas, com afundamento explícito para lama. É uma aproximação visual de contato; não é solver de colisão.
- A pose sintética e a distância visual são amostradas por quadro, separadas da atualização de 250 ms do painel. O gêmeo Firebase mantém suavização das leituras físicas.
- Poeira ganha envelhecimento por partícula, rastros respeitam a ré e o corte segue o percurso da colheitadeira. O bovino usa passada por distância, sem reinicializar patas em pausa.

Regressões: `node --test server/sompo-motion.test.js server/sompo-agri-assets.test.js`. Verificação de movimento no navegador: `node scripts/sompo-preview/motion-check.mjs`, que mantém seu Chrome no workspace 7 e usa APIs locais em memória. Vídeos são buffers WebGL reais amostrados a 30 quadros lógicos/s; não medem FPS de apresentação no workspace oculto.
