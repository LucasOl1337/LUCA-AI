# SwarmLedger-bugs — LUCA-AI

## Em andamento
_(nenhum — sessão fechou)_

## Concluído
### 2026-08-02T05:25:00Z — NX-LUCA-AI-bugs
- Área: recovery UX — ToolsPage catálogo falhou sem retry
- Escopo: `src/pages/ToolsPage.tsx`, `server/tools-error-cta.test.js`, `SwarmLedger-bugs.md`
- Base: `b14f395` → HEAD: `8b57dd3`
- Evidência: `node --test server/tools-error-cta.test.js` → 2/2 pass; `git diff --numstat` ToolsPage 36/3 (sem flip EOL, CRLF preservado)
- Resultado: falha de `/api/catalog/tools` agora é `role=alert` com `data-tone=error`, texto de orientação e CTA primário `data-tools-retry` ("Tentar novamente") que recarrega o catálogo via `reloadKey`

## Livre
- Histórico empty sem CTA (`src/pages/HistoricoPage.tsx`)
- GlobalChat empty sem ação (`src/components/GlobalChat.tsx`)
- Admin empty/error tones se ainda colapsados
- ToolsPage empty “Nenhuma ferramenta” sem CTA de retry/navegação (após error retry)
