# Direção visual do 3D

Leia SOMENTE ao trabalhar na qualidade visual das cenas 3D (SOMPO rodovia e agro, `/sensor`).
O log vivo das passadas fica em [`PROGRESS.md`](./PROGRESS.md).

## Método

Mesmo método de uma produção de curta em tempo real, aplicado ao produto:

1. Baseline: captura de todos os 28 cenários do simulador e do `/sensor` na mesma resolução.
2. Revisão por três leitores ao mesmo tempo: diretor (a cena conta o que o cenário quer contar?),
   fotografia (composição, luz, cor, profundidade) e engenharia gráfica (artefato, serrilhado, custo).
3. Cada falha vira item numerado no `PROGRESS.md`, com passada de origem.
4. Corrige, recaptura, relê. Um item só fecha com captura nova que prove a correção.
5. Pelo menos cinco passadas; para quando uma passada inteira não acha nada relevante.

## Captura

Com a prévia do simulador rodando (`SOMPO_PREVIEW_PORT=5261 node scripts/sompo-preview/serve.mjs`)
e um Chromium com GPU real exposto por CDP, `node scripts/visual-3d/shoot.mjs <pasta> [ids] [ms]`
grava um PNG por cenário mais `report.json` com intervalo de quadro, draw calls e triângulos.
`CDP_URL` troca o endereço do navegador (padrão `http://127.0.0.1:19081`).

## Orçamento

Referência: RTX 4070 Ti SUPER, canvas ~1040×990, DPR 1. O rAF da máquina trava em 16,7 ms.

| Palco | Baseline (mediana do intervalo) | Draw calls | Triângulos | Meta |
|---|---|---|---|---|
| Rodovia | 21–28 ms | ~320 | ~6,9 M | não piorar |
| Agro | 19–21 ms | 54–100 | ~0,17–0,23 M | ≤ +1 ms, ≤ +20 draw calls |

Toda técnica nova entra primeiro no palco agro, que tem folga, e só vai para a rodovia medida.

## Medir custo sem se enganar

O intervalo de quadro nesta máquina oscila ±3 ms entre rodadas (outros processos na GPU).
Captura isolada não prova regressão nem ganho. Compare sempre em A/B intercalado: um worktree
da `main` servindo a prévia em outra porta (`SOMPO_PREVIEW_PORT=5263`) e o branch em 5261,
alternando as capturas por rodada e tirando a mediana. Foi assim que o grão animado (+3 ms)
apareceu e o fixo (+0,2 ms) passou.
