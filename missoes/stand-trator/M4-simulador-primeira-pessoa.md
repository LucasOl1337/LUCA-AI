# M4 — Simulador em primeira pessoa com controle de PS5

**Status:** aguardando execução. **Paralela a:** M1–M3, M5–M7.

**Leia antes:** [README das missões](README.md) (contexto do stand, contratos e regras comuns) e [transcrição](TRANSCRICAO.md).

## Pedido (áudio)

- [00:57] "criar dentro do nosso simulador já a visão em primeira pessoa e com o controle de um videogame de Play 5, controlando essa visão de primeira pessoa para a gente ver, por exemplo, como que um operador em campo se sentiria e meio que simular as ações dele."
- [01:10] "a gente já poderia deixar três cenários pré-programados, tanto com a interface de clique…"

## Onde está o simulador

`src/components/SompoTruckSimulator.tsx` e `src/components/sompo/*` (palcos rural e agrícola: `createSompoRuralStage.ts`, `createSompoAgriStage.ts`, `sompoPlayback.ts`, `sompoStage.ts`). Contexto em `docs/sompo.md` (seções do simulador e da oficina) e `docs/sompo-demo.md`. A missão irmã `MISSAO-CADASTRO-VEICULOS-TRATOR.md` (na raiz) trata do modelo do trator: não duplique, mas deixe a câmera funcionando com o veículo que estiver selecionado.

## Entrega

1. **Câmera de cabine (primeira pessoa):** um modo novo, ao lado do atual. A posição fica no assento do operador, com o painel/capô visível na parte de baixo e o olhar livre limitado (yaw ±100°, pitch ±35°).
2. **Controle de PS5 (DualSense) pela Gamepad API do navegador:** analógico esquerdo acelera/ré/direção, analógico direito olha, R2/L2 são acelerador e freio progressivos, X liga/desliga o modo cabine e os botões de face disparam os cenários. Teclado e mouse continuam funcionando como alternativa. Vibração (`vibrationActuator`) em colisão e alerta, quando o navegador suportar.
3. **Três cenários pré-programados**, que rodam com um clique ou um botão do controle e registram telemetria pelo fluxo de episódio que já existe. Proposta, a confirmar com o Lucas no relatório: (a) obstáculo à frente com alerta a tempo; (b) inclinação perigosa em terreno; (c) colisão com o alerta atrasado. Cada um precisa ter uma pergunta associada que a M7 possa usar.
4. HUD mínimo na primeira pessoa: velocidade, alerta de distância e inclinação, e um selo "SIMULADO".
5. Desempenho: 60 fps estáveis no PC do stand. O WebGL pesado roda pela fila da bancada.

## Aceite

- Vídeo curto gravado na bancada mostrando o modo cabine e os três cenários. Pro controle, teste com a Gamepad API simulada (stub de `navigator.getGamepads`) e anote no relatório que o DualSense físico ainda precisa ser testado pelo Lucas, caso não tenha sido.
- Teste unitário do mapeamento eixo/botão → comando, com casos concretos.
- O simulador atual (modo câmera livre) continua igual.

## Arquivos seus

`src/components/sompo/firstPerson*.ts`, `src/components/sompo/gamepad*.ts`, `src/components/sompo/standScenarios.ts` e mudanças pontuais em `SompoTruckSimulator.tsx`.
