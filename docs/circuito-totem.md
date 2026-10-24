# Circuito único do Totem

O modo Simulação do `/stand` dirige uma única run desde a partida até a chegada geométrica, sinistro ou abandono explícito. Não há relógio de expulsão por inatividade nem teto de três minutos. O circuito não altera assets aprovados ou modelo de cabine.

- ↑/W acelera; ↓/S/espaço freia; ←/→ ou A/D dirigem; arrastar olha. Controle standard: R2/L2, analógico esquerdo e direito. Options ou Esc abre pausa/opções; ✕ continua. Toque tem controles em telas com ponteiro coarse.
- As estacas e a faixa baixa da chegada são objetos no mundo. Marcos geométricos são sequenciais e não reposicionam a máquina. Água e encosta usam as mesmas geometrias/relevo do palco.
- Colisão por contato ou corpo do trator próximo ao feno; atolamento por 2s contínuos dentro da água; tombamento por 1s em rolagem≥30° ou≥20° a mais de7km/h. São regras cinemáticas didáticas, não física certificada.
- Sonolência é opt-in dentro da pausa, OFF em cada run. O monitor existente processa a webcam local; erro/negação só aparece nas configurações e não pede permissão repetidamente. A captura da Coruja é desligada enquanto o simulador está aberto.

## Instrumentos e áudio

Leituras simuladas à esquerda mostram distância frontal em metros, ausência de eco acima de4m, rolagem em graus e seus limiares12/20/30°, velocidade cinemática emkm/h e previsão de entrada na água em3s. O mapa à direita usa os polígonos de água/encosta do mundo e a mesma rota/fardos do circuito. Área100×100m, +X para cima, +Z para direita, rumo da física convertido em rotação do ponteiro. Fora dos limites o ponteiro sai do mapa e aparece aviso, nunca é reposicionado.

Sons ligados por padrão, liberados por gesto. Quatro tons distintos curtos usam o mesmo riscosCircuito do aviso/registro: obstáculo880Hz, encosta660Hz, água990Hz, sono520Hz. Envelope200ms,pico0.12,cooldown1s crítico/1.8s atenção, rearmamento600ms fora. Pausa, aba oculta, fim, mute e desmontagem param áudio; nenhuma medição física é prometida. Controle explícito na pausa mantém telemetria/visual ativos mesmo sem som. Vitrine toca narração aprovada, fecha Escuta e sessão anterior, e oferece botão de som quando autoplay é recusado.

## Registro e métricas

`circuito.ts` controla runId, horários, tempo ativo monotônico, pausas declaradas, marcos e episódios por sensor. Um episódio só conta como evitado quando houve exposição real, mudança de frenagem/esterço **depois** do aviso e saída segura por1s. Antecipação e comando já mantido não são reação zero. Ausência de reação é N/A. Contagem não é por frame. O resultado é sempre rotulado SIMULAÇÃO e não representa risco de seguro ou acidente físico evitado.

`sessaoCircuito.ts` amostra a física em5Hz no formato do Laboratório. O manifesto contém o registro completo. `shared/circuito-context.js` faz whitelist e recalcula métricas para o prompt, sem confiar em contadores declarados.

## Análise fora do WebGL

“Analisar relatório” desmonta o componente de gameplay e abre uma página de conversa com os agentes do Laboratório, sem canvas, rAF, controle do jogo ou webcam. A run fica em memória e `sessionStorage` da aba (sobrevive a recarregar); o totem voltar ao repouso (palco após 45 s sem ninguém, ou Vitrine; fim de visita) apaga essa conversa, para o próximo visitante não cair nela. No repouso a Coruja também esquece as experiências abertas e a vista do trator volta à cabine (`src/components/stand/fimDeVisita.ts`). Nenhuma análise paga acontece nessa transição: o visitante confirma “Enviar para análise”.

A página reutiliza `POST /api/lab/cases`, `POST /api/lab/cases/:id/analyses` e `GET /api/lab/cases/:id`; sem novo endpoint ou tabela. IDs de análise/caso são preservados, respostas persistidas são recuperadas, e análises em andamento não são reenviadas automaticamente. A conta é obrigatória. Nenhum parecer é simulado no produto quando a API falha. O botão de nova run limpa o estado da conversa ativa sem apagar casos da conta. A conversa da Coruja permanece no estado do stand.

## Verificação

`node --test tests/gameplay-circuito.test.js` dirige o motor real, verificando chegada sem saltos, colisão, água, tombamento, reação e ausência de idle. `server/lab-cases.test.js` verifica gravação/reabertura e payload recebido pelos quatro agentes com mock local.

Fixture de interface local (nunca produção):

```
LUCA_CIRCUITO_FIXTURE_DIR=/home/lol/relatorios/luca-circuito-20261022/prova-local node tests/support/circuito-fixture-server.mjs
```

`http://127.0.0.1:4317/circuito-fixture` usa o app real e APIs locais persistentes com agente explicitamente rotulado FIXTURE LOCAL. Browser exige bancada/cofre, janela própria e vaga pesada. Isso não certifica hardware físico do Totem.
