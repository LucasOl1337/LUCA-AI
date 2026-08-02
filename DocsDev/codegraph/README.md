# DocsDev/codegraph — HISTÓRICO / SUPERSEDED

**Não é fonte de verdade da produção atual.**

Este diretório guarda um inventário CodeGraph gerado **antes** da migração de produção para Express na VM (`2026-07-24`). O material ainda descreve o runtime Cloudflare Worker + Durable Object em `worker/` como caminho cloud ativo (`runtimeMode=cloud`).

## O que usar em vez disso

| Precisa de | Abra |
| --- | --- |
| Produção / borda / VM | `AGENTS.md`, `docs/*` (Express VM + `deploy/luca-ai-vm-proxy.js` + Tunnel) |
| Onde abrir código | `INDEX.md` (`deploy/` = publicação; `worker/` = legado) |
| Stack de entrada | `README.md` |

## Conteúdo deste diretório

| Arquivo | Papel |
| --- | --- |
| `inventory.md` | Snapshot de inventário (pré-VM); banner SUPERSEDED no topo |
| `codegraph-context.md` | Dump de query CodeGraph (história) |
| `codegraph-visual.html` | Diagrama que ainda mostra “Cloud Worker” |
| `codegraph-files.json` / `codegraph-status.txt` | Artefatos brutos do índice |

Não reindexe daqui para “atualizar produção”. Se precisar de mapa vivo, rode CodeGraph no checkout atual e trate o resultado como rascunho — a verdade de publicação continua em `docs/*` e `deploy/`.
