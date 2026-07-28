# Patch Notes — LUCA-AI

## 2026-07-27 — comercial “uma missão, uma equipe”

**Comparação:** PC e `origin/codex/restore-current-luca` partiam de `71fa5b7`; a diferença local inclui `package.json`, lockfile e o novo pacote `promo/` (2.598 inserções e 65 remoções nos arquivos rastreados, além dos ativos novos).  
**Branch:** `codex/restore-current-luca`, preservada por já ser uma branch de trabalho.  
**Conflitos:** nenhum após `fetch`.

### Entrega

- Comercial de 42 segundos em 1920×1080/30 fps, dividido entre dor de orquestração, escolha de personas, fluxo de responsabilidades, entrega e chamada final.
- Capturas reais das telas de autenticação, home, personas, fluxo 5/5, missão pronta e entrega final.
- Composição Remotion com movimentos, cursor, transições, tipografia JetBrains Mono, coruja/ícone canônicos e identidade azul/verde do produto.
- Novo comando `npm run promo`, que primeiro constrói o produto, captura as telas e então renderiza o MP4.
- Dependências de Remotion e Playwright registradas no pacote e lockfile principal.
- A descoberta de catálogos irmãos aceita `LUCA_TARS_CATALOG_DIR`/`LUCA_YUME_CATALOG_DIR` e a pasta organizacional `Em espera`, sem perder o layout irmão tradicional.
- O teste de integração acompanha o ID vigente `nexarq.agenda` do Yume, mantendo-o apenas advisory e não executável pelo LUCA.

### Impacto

O runtime, Worker e schema do LUCA não mudam por causa do filme. O ciclo acrescenta um pipeline reprodutível de demonstração baseado na interface real, com a promessa “Sua missão. Uma equipe inteira.”

### Segurança

`.codex-tmp/` foi adicionado ao `.gitignore`. Essa pasta contém perfil de captura, imagens intermediárias e estado efêmero que pode carregar sessão; ela permanece no PC e não entra no GitHub. Apenas os ativos sanitizados copiados para `promo/public/` serão versionados. Nenhum deploy para `app.luca-ai.com.br` faz parte deste commit.

---

**Data:** 2026-07-24
**Estado do commit:** `(2026-07-24)+(producao-vm) safe commit`
**Repositório:** https://github.com/LucasOl1337/LUCA-AI (público)
**Branch:** `codex/restore-current-luca` — sincronizado com o upstream homônimo

---

## Resumo executivo

Dia de **migração de produção**. O LUCA saiu de um arranjo dependente de recursos locais
e passou a rodar em VM própria, com instalação automatizada, publicação direta via
9Router, painel administrativo e tracking de uso. Foram **11 commits em ~6 horas**.

Este é o repositório com maior densidade de commits do ciclo, e o único cujo trabalho já
está inteiramente commitado — a árvore de trabalho tem apenas artefatos de build.

⚠️ **Atenção:** este repositório é **público**. Ver a seção de riscos ao final.

---

## Linha do tempo dos commits

| Commit | Hora | Descrição |
|---|---|---|
| `58538b1` | 13:58 | corrige cadastro e adiciona tracking de uso |
| `747f7f0` | 13:48 | remove dependência local da produção |
| `fb6dd3c` | 13:42 | corrige instalador da VM do LUCA |
| `35a62e3` | 13:27 | automatiza instalação do LUCA na VM |
| `5a1dada` | 13:25 | migra produção do LUCA para a VM |
| `93f8803` | 13:17 | adiciona contas e painel administrativo |
| `9898997` | 13:06 | corrige marca para LUCA |
| `626858f` | 12:56 | publica LUCA-AI diretamente com 9Router |
| `d0e7fcd` | 12:41 | usa API de mesma origem no domínio |
| `2e6e922` | 12:39 | restaura versão completa do LUCA-AI |
| `faceac4` | 08:07 | reforma da documentacao |

### Leitura da sequência

A ordem conta uma história coerente de estabilização:

1. **`2e6e922` restaura versão completa** — o ponto de partida foi uma recuperação; a
   própria branch se chama `codex/restore-current-luca`.
2. **`d0e7fcd` API de mesma origem** — elimina CORS e a dependência de apontar para host
   externo, pré-requisito para publicar em domínio próprio.
3. **`626858f` publicação via 9Router** e **`5a1dada` migração para VM** — a mudança de
   infraestrutura propriamente dita.
4. **`35a62e3` → `fb6dd3c`** — automatiza e depois corrige o instalador; sinal saudável
   de que a automação foi de fato exercitada.
5. **`747f7f0` remove dependência local** — corta o cordão umbilical com esta máquina.
6. **`93f8803` + `58538b1`** — contas, painel admin, correção de cadastro e tracking de uso.

---

## Estado da árvore de trabalho

Diferente dos outros projetos deste ciclo, **não há alteração de código pendente**.
Os únicos arquivos não versionados são artefatos de build:

```
tmp-live-ui/index-BcaQCBBA.js
tmp-live-ui/index-CgGeI_KV.css
tmp-live-ui/index.html
```

São bundles com hash de conteúdo (`index-BcaQCBBA.js`), típicos de saída de Vite/Rollup,
num diretório prefixado por `tmp-`. **Não entram no commit** — são derivados, não fonte.

---

## Comparação PC local × GitHub

| Aspecto | GitHub | PC local |
|---|---|---|
| Branch | `origin/codex/restore-current-luca` | mesma |
| Divergência | — | **0 atrás / 0 à frente** |
| Último commit | `58538b1` | `58538b1` |
| Árvore de trabalho | — | limpa (só `tmp-live-ui/`) |

O `pushedAt` do repositório no GitHub (16:58) é posterior ao último commit local (13:58),
o que é consistente com push já realizado.

---

## Riscos e pendências honestas

- **Repositório público com painel administrativo e contas.** Os commits `93f8803`
  (contas + painel admin) e `58538b1` (cadastro + tracking) tocam autenticação num repo
  público. Vale uma auditoria dedicada procurando token, string de conexão ou credencial
  de VM commitada por engano — este documento **não** fez essa varredura.
- **Nenhum teste foi executado** neste ciclo para este projeto.
- `tmp-live-ui/` deveria estar no `.gitignore` para não reaparecer como ruído a cada build.
- A migração para VM foi feita hoje; o comportamento em produção ainda tem pouca
  quilometragem.
