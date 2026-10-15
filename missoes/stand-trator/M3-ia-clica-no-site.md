# M3 — IA opera o próprio site durante a conversa

**Status:** aguardando execução. **Paralela a:** M1, M2, M4–M7.

**Leia antes:** [README das missões](README.md) (contexto do stand, contratos e regras comuns) e [transcrição](TRANSCRICAO.md).

## Pedido (áudio)

- [03:48] "o que eu acho que vai ser a grande sacada é tanto essa conversação com a IA, que faz as ações de human click no site mesmo…"

## Entrega

1. Um conjunto **fechado** de ações que a IA pode pedir, definido em `shared/stand/acoes-site.ts`, cada uma com nome, descrição pro modelo e argumentos. Sugestão inicial, a validar no app: `abrir_aba(inicio|safra|telemetria|carteira|frota|veiculos)`, `abrir_caso(id)`, `rodar_cenario(id)` (usa os cenários da M4), `gravar_episodio()`, `analisar_na_bancada()`, `abrir_perfil_segurado(id)`, `voltar_inicio()`. Leia `src/pages/SompoPage.tsx` (função `navigate`, `SOMPO_*_ABA`) pra mapear o que já existe.
2. Um executor no próprio front: uma segunda janela/aba do app, ou um painel lateral da página do stand, que recebe `acao_site` e executa como se fosse uma pessoa. Cursor visível se movendo até o alvo, destaque no elemento e clique de verdade no DOM, ou navegação por rota quando clicar for frágil. O público precisa **ver** a mão da IA mexendo no site.
3. Conta e dados de demonstração. Nada de dado real de cliente. Nada de chamada mutante contra a produção: o stand roda contra a demo local (`npm run demo:sompo`) ou contra uma instância própria.
4. Ação fora da lista é recusada, e a IA explica que não pode.

## Aceite

- Na bancada, um script dispara a sequência `abrir_aba('telemetria')` → `rodar_cenario(<um da M4>)` → `analisar_na_bancada()`. Um vídeo curto gravado na bancada mostra o cursor animado fazendo os três passos.
- Teste unitário do validador de ações (ação desconhecida e argumento inválido).

## Arquivos seus

`shared/stand/acoes-site.ts`, `src/components/stand/executor/**` e hooks pequenos nos componentes alvo (só `data-stand-alvo="..."` como atributo; sem mudar comportamento).
