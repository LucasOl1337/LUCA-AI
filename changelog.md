# Changelog — LUCA-AI

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [2026-07-27] — promo Remotion segura

### Added

- `promo/src/Promo.tsx`, estilos e entrypoint para o comercial de 42 segundos.
- Roteiro, documentação, seis capturas sanitizadas, fontes e ativos de marca.
- `promo/scripts/capture-product.mjs` para produzir as telas usadas pelo render.
- Script raiz `npm run promo` e dependências Remotion/Playwright.
- Resolução configurável/fallback do catálogo TARS/Yume quando um projeto irmão está em `Em espera/`.
- Contrato de teste atualizado do ID legado `agendar_consulta` para `nexarq.agenda`.

### Changed

- `package.json` e `package-lock.json` passam a descrever o pipeline audiovisual junto ao build existente.
- `.gitignore` agora exclui `.codex-tmp/`, protegendo estado local de captura e autenticação.
- `server/tool-catalog.js` deixa de depender de uma única topologia de pastas para carregar catálogos advisory locais.

### Security

- `auth.json`, `system-state.json` e screenshots intermediários do perfil temporário não serão versionados.
- Nenhuma migration, escrita em Yume, alteração de Worker ou deploy de produção foi executada.

### Repository state

- Base auditada: `origin/codex/restore-current-luca@71fa5b7`.
- Divergência inicial: zero à frente/atrás; conflitos: nenhum.

### Validation

- `npm test`: 179/179 testes aprovados após alinhar descoberta/ID dos catálogos irmãos.
- `npm run typecheck` e `npm run build`: aprovados.

## [2026-07-24] — safe commit (migração de produção para VM)

### Added
- Instalação automatizada do LUCA na VM (`35a62e3`), com correção subsequente do
  instalador (`fb6dd3c`).
- Contas de usuário e painel administrativo (`93f8803`).
- Tracking de uso (`58538b1`).
- Publicação direta via 9Router (`626858f`).

### Changed
- Produção migrada para VM própria (`5a1dada`).
- Frontend passa a consumir a API de **mesma origem** no domínio (`d0e7fcd`), eliminando
  dependência de host externo e configuração de CORS.
- Marca corrigida para "LUCA" em toda a interface (`9898997`).
- Documentação reformada (`faceac4`).

### Fixed
- Fluxo de cadastro corrigido (`58538b1`).
- Instalador da VM corrigido após primeira execução real (`fb6dd3c`).

### Removed
- Dependência de recursos locais desta máquina na produção (`747f7f0`).

### Notes
- Versão completa do LUCA-AI restaurada em `2e6e922`; a branch de trabalho é
  `codex/restore-current-luca`.
- `tmp-live-ui/` contém apenas bundles derivados e permanece fora do versionamento.
- Repositório é **público**: recomenda-se auditoria de segredos nos commits de contas e
  painel administrativo.
