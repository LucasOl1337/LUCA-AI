# Roteiro: painel-segurado (visão do produtor)

**Id:** `painel-segurado` · **Duração alvo:** 40–50 s · **Público:** investidor e fundo de crédito, sem jargão.
**Regra:** o segurado não tem tela própria hoje. O vídeo mostra o que o produtor já vê **dentro do painel SOMPO**, e a narração diz isso. Nada de desconto, franquia ou prêmio.
**Captura:** demo local isolada (`promo/src/stand/sompo/capturar-paineis.mjs --roteiro segurado`), 1920×1080, só com o simulador.

| # | Tempo | Narração (voz oficial) | Tela capturada | Prova no código | Rótulo |
|---|---|---|---|---|---|
| 1 | 0–4 s | O que o seu trator conta sobre você? | Aba Veículos com o card "John Deere 6110J · TRT0001 · exemplo" | `src/components/sompo/SompoVehiclesPanel.tsx:107-136`; `shared/sompo-vehicles.js:19` | demonstrativo |
| 2 | 4–11 s | Hoje, dentro do painel, o produtor cadastra a máquina dele e abre no simulador. | Clique em "Usar no simulador" no trator → aba Telemetria com o Trator MAX carregado | `SompoVehiclesPanel.tsx:136`; `src/pages/SompoPage.tsx:249-251` | real (fluxo) + demonstrativo (cadastro de exemplo) |
| 3 | 11–24 s | Numa curva em ladeira, o sensor percebe a inclinação e o alerta acende antes do tombamento. O operador reduz e o trator estabiliza. Aqui, simulado. | Cenário "Trator MAX em curva inclinada", desfecho de parada controlada ("Velocidade cai a tempo e o trator estabiliza na pendente"), com "Alerta de inclinação" acendendo. Selo "Telemetria sintética" visível | `shared/sompo-max-tractor-scenarios.js:230-238`; `shared/sompo-agri-scenarios.js:148-156`; `src/components/SompoTruckSimulator.tsx:1103-1108,1160-1161` | simulado |
| 4 | 24–34 s | Esse momento vira um episódio gravado, com imagens datadas de cada fase. | "Gravar episódio deste cenário" → "Gravando episódio… frames n/5" → "Episódio registrado" | `SompoTruckSimulator.tsx:1278-1311` | real (gravação) + simulado (telemetria) |
| 5 | 34–42 s | A parada a tempo deixa de ser invisível: a boa prática vira evidência a favor do segurado. | Aba Safra, "Último episódio gravado" aberto com as imagens do episódio que acabou de ser gravado | `src/lib/sompo-stories.ts:74-80`; `src/components/sompo/SompoFleetPanel.tsx:37-55,108` | real |
| 6 | 42–48 s | Uma tela só do produtor, ligada à apólice dele, é o próximo passo. | Fechamento com a marca LUCA-AI (sem tela de produto) | Lacuna declarada no relatório da M6 | — |

## Termos

- **Segurado/produtor:** titular da apólice. **Operador:** quem dirige a máquina, que pode ser o próprio produtor ou um funcionário (ver `GLOSSARY.md`).

## O que não se diz

- Desconto, franquia, prêmio menor ou renovação garantida: nada disso está implementado.
- "Painel do segurado" como tela pronta: só "hoje, dentro do painel".
- Que o alerta comanda o trator: o painel não comanda o veículo (`SompoTelemetryPanel.tsx:175`).

## Lacunas de produto (vão para a proposta M9 — portal do segurado)

1. Não há login nem visão própria do segurado. As contas são `admin | user` e veem o mesmo painel SOMPO (`server/auth-store.js:271`).
2. Não há vínculo entre veículo, apólice e segurado: o cadastro de veículos é por conta (`shared/sompo-vehicles.js`).
3. Não há efeito no seguro (prêmio, franquia, bônus) e nenhuma regra transforma episódio preventivo em benefício. A "evidência a favor do segurado" é qualitativa (`sompo-stories.ts:79`).
4. O alerta ao operador existe só no painel. Não há notificação ao produtor fora dele.
