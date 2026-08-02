# SwarmLedger-bugs — LUCA-AI

## Em andamento
_(nenhum — sessão fechou)_

## Concluído
### 2026-08-02T16:20:00Z — NX-LUCA-AI-bugs
- Área: recovery UX — falha de runMission limpa missão + retry só recarrega personas
- Escopo: `src/pages/LucaAiPage.tsx`, `server/luca-chat-run-error-cta.test.js`, `SwarmLedger-bugs.md`
- Base: `e8ee1d6` → HEAD: `45ea5ae`
- Evidência: `node --test server/luca-chat-run-error-cta.test.js` (+ chat/activity/canvas/picker/admin/tools) → 16/16 pass; `git diff --numstat` LucaAiPage 35/9 (CRLF preservado)
- Resultado: `runMission` só limpa o draft da missão quando `data.ok`; falha marca `errorRetry='run'` e o notice mid-session passa a `data-luca-chat-error-kind=run` com CTA `Reenviar missão` → `runMission()` (personas load continua no kind personas); draft permanece no composer para reenvio
### 2026-08-02T13:25:00Z — NX-LUCA-AI-bugs
- Área: recovery UX — Atividade empty sem CTA
- Escopo: `src/pages/LucaAiPage.tsx`, `server/luca-activity-empty-cta.test.js`, `SwarmLedger-bugs.md`
- Base: `b3cf2bc` → HEAD: `1c2b4b7`
- Evidência: `node --test server/luca-activity-empty-cta.test.js` (+ chat/canvas/picker/admin/tools) → 13/13 pass; `git diff --numstat` LucaAiPage 27/4 (CRLF preservado)
- Resultado: empty da aba Atividade deixa de ser só ícone+texto; agora `data-luca-activity-empty` + título + hint contextual + CTA `data-luca-activity-focus-mission` (“Escrever missão” → foca `#luca-ai-mission`) quando idle; durante run só status de espera

### 2026-08-02T12:35:00Z — NX-LUCA-AI-bugs
- Área: recovery UX — chat notice mid-session sem CTA
- Escopo: `src/pages/LucaAiPage.tsx`, `server/luca-chat-error-cta.test.js`, `SwarmLedger-bugs.md`
- Base: `7401bdd` → HEAD: `1c567c3`
- Evidência: `node --test server/luca-chat-error-cta.test.js` (+ canvas/picker/admin/tools locks) → 11/11 pass; `git diff --numstat` LucaAiPage 61/6 (CRLF preservado)
- Resultado: notice mid-session `Atenção` deixa de ser só warning; agora shell `data-luca-chat-error` + `role=alert` + Notice com CTA primário `data-luca-chat-retry` (“Tentar novamente” → `loadPersonas`) e secundário `data-luca-chat-dismiss` (“Dispensar” → `setError(null)`); chrome error quando recuperável

### 2026-08-02T10:55:00Z — NX-LUCA-AI-bugs
- Área: recovery UX — chat canvas empty sem CTA
- Escopo: `src/pages/LucaAiPage.tsx`, `server/luca-canvas-empty-cta.test.js`, `SwarmLedger-bugs.md`
- Base: `2ab6ca0` → HEAD: `0b349a3`
- Evidência: `node --test server/luca-canvas-empty-cta.test.js` (+ picker/admin/tools locks) → 9/9 pass; `git diff --numstat` LucaAiPage 21/3 (CRLF preservado)
- Resultado: empty do `LucaMissionCanvas` deixa de ser só copy; agora `data-luca-canvas-empty` + CTA primário `data-luca-canvas-focus-mission` ("Escrever missão") foca `#luca-ai-mission`

### 2026-08-02T09:42:54Z — NX-LUCA-AI-bugs
- Área: recovery UX — picker de personas no LUCA-AI empty sem CTA
- Escopo: `src/pages/LucaAiPage.tsx`, `server/luca-picker-empty-cta.test.js`, `SwarmLedger-bugs.md`
- Base: `263d679` → HEAD: `aabcde0`
- Evidência: `node --test server/luca-picker-empty-cta.test.js` (+ admin/tools locks) → 7/7 pass; `git diff --numstat` LucaAiPage 38/1 (CRLF preservado)
- Resultado: lista vazia do `PersonaPickerSheet` deixa de ser parágrafo morto; agora `data-luca-picker-empty` + hint contextual + CTA `data-luca-picker-clear` ("Limpar busca" com termo) e `data-luca-picker-close` ("Fechar")

### 2026-08-02T08:27:03Z — NX-LUCA-AI-bugs
- Área: recovery UX — Admin empty sem CTA primário
- Escopo: `src/pages/AdminPage.tsx`, `src/index.css`, `server/admin-empty-cta.test.js`, `SwarmLedger-bugs.md`
- Base: `6e02cda` → HEAD: `05bb20b`
- Evidência: `node --test server/admin-empty-cta.test.js` → 3/3 pass; `git diff --numstat` AdminPage 36/1 + index.css 32/0 (sem flip EOL, CRLF preservado)
- Resultado: lista de contas vazia deixa de ser texto morto; agora `data-admin-empty` + hint contextual + CTA primário `data-admin-empty-clear` ("Limpar busca" quando há filtro) ou `data-admin-empty-retry` ("Atualizar lista")

### 2026-08-02T05:25:00Z — NX-LUCA-AI-bugs
- Área: recovery UX — ToolsPage catálogo falhou sem retry
- Escopo: `src/pages/ToolsPage.tsx`, `server/tools-error-cta.test.js`, `SwarmLedger-bugs.md`
- Base: `b14f395` → HEAD: `8b57dd3`
- Evidência: `node --test server/tools-error-cta.test.js` → 2/2 pass; `git diff --numstat` ToolsPage 36/3 (sem flip EOL, CRLF preservado)
- Resultado: falha de `/api/catalog/tools` agora é `role=alert` com `data-tone=error`, texto de orientação e CTA primário `data-tools-retry` ("Tentar novamente") que recarrega o catálogo via `reloadKey`

## Livre
- Histórico empty sem CTA (`src/pages/HistoricoPage.tsx`) — página órfã sem route no App atual
- GlobalChat empty sem ação (`src/components/GlobalChat.tsx`) — shell Operacional legado
- ToolsPage empty “Nenhuma ferramenta” sem CTA de navegação (após error retry; página órfã no App)
- Admin error retry ainda só no tip contínuo (`158adde`); não reabrir empty daqui
- Picker empty CTA shipped — não reabrir `PersonaPickerSheet`
- Canvas empty CTA shipped (`0b349a3`) — não reabrir `LucaMissionCanvas` empty
- Chat notice mid-session retry shipped (`1c567c3`) + run re-send (`45ea5ae`) — não reabrir `Notice` / `data-luca-chat-error` / `errorRetry` run path
- Activity empty CTA shipped (`1c2b4b7`) — não reabrir `LucaProcessTerminal` empty / `data-luca-activity-*`
- residual live luca-ai friction only if disjunct of start-state/picker/canvas/chat-notice/activity-empty/run-retry
