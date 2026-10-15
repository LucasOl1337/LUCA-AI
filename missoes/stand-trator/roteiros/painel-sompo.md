# Roteiro: painel-sompo (visão da seguradora)

**Id:** `painel-sompo` · **Duração alvo:** 40–50 s · **Público:** investidor e fundo de crédito, sem jargão.
**Captura:** demo local isolada (`promo/src/stand/sompo/capturar-paineis.mjs --roteiro sompo`) em 1920×1080. A telemetria vem do simulador e não há carteira real. A bancada de agentes roda com o 9Router real, numa corrida só. Se essa corrida falhar, o vídeo mostra só o envio e nunca uma resposta inventada.

Rótulos: **real** = a tela e o comportamento existem no app e rodaram de verdade na captura. **simulado** = telemetria sintética do simulador. **demonstrativo** = dado de exemplo rotulado no próprio app. **público** = dado setorial com a fonte na tela.

| # | Tempo | Narração (voz oficial) | Tela capturada | Prova no código | Rótulo |
|---|---|---|---|---|---|
| 1 | 0–4 s | E se a seguradora enxergasse o risco antes do sinistro? | Welcome SOMPO: "Antecipar riscos. Proteger o agro." e o mapa do Brasil | `src/components/sompo/SompoWelcome.tsx:35` | real |
| 2 | 4–13 s | No painel do LUCA, a seguradora começa pelos casos de exemplo do campo: seca, granizo, geada, penhor de máquinas. Ao lado, dados públicos do setor, com a fonte. | Aba Casos agrícolas: cards de contexto setorial (87% seca, granizo e geada; ~79% seca; ZARC) e a grade de 8 casos. Cursor no card de seca com a fonte | `src/pages/SompoPage.tsx:137-139,1000-1007`; `src/lib/sompo-cases.ts:66-108,111-421` | demonstrativo + público |
| 3 | 13–23 s | Na safra, ela compara a frota. Esta frota é de demonstração: três máquinas, quatro meses, e o que foi prevenção ou dano em cada uma. | Aba Safra: selo "Frota demonstrativa", gráficos por máquina e mês e desfechos preventivos por tipo | `src/components/sompo/SompoFleetPanel.tsx:111`; `shared/sompo-fleet-demo.js:52` | demonstrativo |
| 4 | 23–30 s | Cada episódio gravado chega com as imagens datadas do momento do risco. Este foi gravado agora, no simulador. | "Último episódio gravado" aberto, mostrando as imagens do episódio que a captura gravou antes (trator em curva inclinada) | `SompoFleetPanel.tsx:37-55,108` | real (gravação) + simulado (telemetria) |
| 5 | 30–42 s | Com um clique, as evidências vão para a bancada de agentes de IA, que discute e devolve uma recomendação para a próxima safra. | Clique em "Decidir a próxima safra na bancada" → sessão LUCA-AI com o Conselho de Estratégia rodando → trecho da entrega final | `SompoFleetPanel.tsx:84-99,113`; `src/pages/LucaAiPage.tsx:4074` | real (parecer gerado na captura) |
| 6 | 42–48 s | Valores e apólices ainda não entram nesta versão. O que a seguradora vê é a evidência, organizada para decidir. | Recorte do rodapé "Valores financeiros e vínculo com apólices continuam pendentes" e encerramento com a marca | `SompoFleetPanel.tsx:113` | real |

**Plano B do bloco 5:** se o 9Router falhar, a narração passa a ser "Com um clique, as evidências seguem para a bancada de agentes de IA analisar." e a tela fica na sessão aberta, sem o trecho de parecer.

## O que não se diz

- "Carteira da Sompo": o app não tem apólices reais. Falamos em "casos de exemplo" e "dados públicos do setor".
- Nenhum número de sinistralidade além dos cards visíveis, que já trazem a fonte.
- O parecer da bancada é citado só pelo que aparecer na tela capturada.

## Lacunas de produto

- Não há carteira de apólices nem prêmio por cliente: os casos são exemplos fixos (`sompo-cases.ts`).
- O vínculo entre episódio, apólice e valor financeiro está pendente, e o próprio painel declara isso (`SompoFleetPanel.tsx:113`).
- Não existe perfil "seguradora" separado: toda conta vê o mesmo painel SOMPO (papéis `admin | user`, `server/auth-store.js:271`).
