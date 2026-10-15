# Roteiro: pipeline-completo (do risco no campo ao veredito)

**Id:** `pipeline-completo` · **Duração alvo:** 90–110 s · **Público:** visitante do stand, investidor e Sompo, sem jargão.
**Captura:** demo local isolada (`promo/src/stand/capturar-pipeline.mjs`) em 1920×1080, numa bancada `agent-bench`. A telemetria vem do simulador. A bancada de agentes roda com o 9Router real e personas lidas por GET no Kamui, numa corrida só. Se essa corrida falhar, o vídeo mostra só o envio e nunca uma resposta inventada.

Rótulos (selo no canto do vídeo): **real** = a tela e o comportamento existem no app e rodaram de verdade na captura. **simulado** = telemetria sintética do simulador. **esquema** = desenho explicativo feito para o vídeo, não é tela do app.

## Escolha do cenário

Cenário do stand `stand-obstaculo-a-tempo` (case `max-front-obstacle`, desfecho `safe-stop`): Trator MAX com obstáculo frontal, alerta a 150 cm e parada a cerca de 40 cm do fardo.

- Usa o mesmo sensor que o equipamento físico do stand tem na frente (ultrassônico, alcance de 400 cm), então o esquema do bloco 2 e a tela do bloco 3 falam da mesma coisa.
- O episódio tem quatro fases curtas e legíveis (aproximação, detecção, alerta, desfecho), cabe em 14 s de simulação e mostra a prevenção dando certo.
- O `agri-tractor-rollover` foi descartado: a inclinação depende da IMU sem calibração confirmada e o tombamento é mais difícil de ler em poucos segundos.

## Blocos

| # | Tempo | Narração (voz oficial) | Tela | Prova no código | Rótulo |
|---|---|---|---|---|---|
| 1 | 0–8 s | No campo, um trator pode bater ou tombar em segundos. E se desse para ver o risco antes do acidente? | Trator MAX andando em linha, com o fardo à frente | `shared/sompo-max-tractor-scenarios.js:168-192` | simulado |
| 2 | 8–20 s | Na frente do trator, um sensor mede a distância até o que vem pela frente. O equipamento manda essas leituras para o painel do LUCA. | Esquema animado: sensor na frente do trator → placa do equipamento → nuvem → painel. Sem fotos da maquete | `src/components/lab/LabEsp32Replay.tsx`; `shared/sompo-max-tractor-scenarios.js:17` | esquema |
| 3 | 20–34 s | No painel, o mesmo caso aparece no simulador. O obstáculo entra no alcance, o alerta acende a um metro e meio e o operador para a tempo. | Aba Telemetria, cenário "Trator MAX com obstáculo frontal", desfecho "Parada segura", com o selo de telemetria sintética visível. Zoom no alerta | `shared/sompo-max-tractor-scenarios.js:185-192`; `src/components/SompoTruckSimulator.tsx:1103-1108` | simulado |
| 4 | 34–46 s | Esse momento vira um episódio gravado, com imagens datadas de cada fase. | Clique em "Gravar episódio deste cenário" → "Gravando episódio… frames n/5" → "Episódio registrado" | `src/components/SompoTruckSimulator.tsx:1278-1311` | real (gravação) + simulado (telemetria) |
| 5 | 46–58 s | Com um clique, o episódio inteiro vai para a bancada: uma equipe de agentes de IA que lê os dados e as imagens. | Clique em "Analisar episódio na bancada" → sessão LUCA-AI com o Conselho de Estratégia rodando, etapa por etapa | `src/pages/SompoPage.tsx:554-657,936`; `shared/luca-preset-seed.js:49-70` | real |
| 6 | 58–76 s | A bancada devolve um veredito: o que aconteceu, quão grave foi e o que fazer agora. | Trecho da entrega final com veredito e severidade, citado só pelo que estiver na tela. Marca "minutos depois" no corte de tempo | `shared/sompo-telemetry.js:322,598` | real (parecer gerado na captura) |
| 7 | 76–90 s | A seguradora e o segurado olham a mesma evidência: o episódio gravado, com as imagens, lado a lado com a frota. | Aba Safra, "Último episódio gravado" com as imagens do episódio que a captura gravou | `src/components/sompo/SompoFleetPanel.tsx:37-55,107` | real |
| 8 | 90–100 s | Hoje, dentro do painel, isso já funciona com casos de exemplo. Quer ver um caso? Pergunta pro LUCA. | Fechamento com a marca LUCA-AI | — | — |

**Plano B do bloco 6:** se o 9Router ou o Kamui falharem, a narração do bloco 5 termina em "...que lê os dados e as imagens." e o bloco 6 vira "O parecer da bancada fica registrado na sessão, para quem precisa decidir.", com a tela na sessão aberta e sem trecho de parecer.

**Plano B do bloco 2:** se o equipamento físico estiver mandando leituras novas na hora da captura (Firebase, só leitura), o esquema ganha um recorte da última leitura rotulado "equipamento físico". Na preparação deste roteiro o feed estava parado (mesmo `timestamp` em leituras seguidas), então o padrão é só o esquema.

## O que não se diz

- Nenhum número de sinistralidade, prêmio, desconto ou franquia: nada disso está implementado.
- "Carteira da Sompo": falamos em "casos de exemplo".
- "Classificação" para o resultado da bancada: o termo é **Veredito da bancada** (ver `GLOSSARY.md`).
- "Operador LUCA": o avatar é o LUCA; operador é quem dirige o trator.
- O veredito é citado só pelo que aparecer na tela capturada; a narração não inventa conclusão.

## Lacunas de produto

- O equipamento físico não alimenta episódios gravados: a gravação de episódio só existe no simulador (`SompoTruckSimulator.tsx:1278`).
- Não há visão própria do segurado: a "visão do segurado" do bloco 7 é o mesmo painel SOMPO (ver `painel-segurado.md`).
- A IMU do equipamento não tem calibração confirmada (`SompoFleetPanel.tsx:107`), por isso o vídeo não usa inclinação.
