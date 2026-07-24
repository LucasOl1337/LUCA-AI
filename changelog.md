# Changelog — LUCA-AI

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

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
