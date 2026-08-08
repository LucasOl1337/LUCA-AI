# Fluxo de personas: como o LUCA-AI transforma uma missão em equipe coordenada

Abrir cinco abas de chat, copiar o contexto, colar a mesma pergunta em modelos diferentes e depois decidir sozinho o que presta: esse é o padrão silencioso de quem tenta orquestrar agentes “na mão”. O custo não é só tempo. É ausência de dono, de critério e de fim.

O [LUCA-AI](https://app.luca-ai.com.br) existe para inverter essa ordem. Em vez de conversas soltas, o produto organiza **missões** com **personas**, papéis explícitos e uma entrega única. A promessa do comercial do repositório resume o encaixe: *“Sua missão. Uma equipe inteira.”* (`promo/roteiro.md`).

Este draft SEO descreve o que o repositório realmente expõe — painel React, runtime Express, integração com 9Router/Kamui/Yume e o fluxo 5/5 de personas — sem inventar features.

## O problema não é “mais IA”. É orquestração sem dono

Quando cada resposta vive em uma conversa isolada, ninguém sabe quem decide, quem executa e quem aprova. O roteiro do produto nomeia exatamente essa dor: “Uma missão. Cinco conversas. Nenhuma conclusão.” (`promo/roteiro.md`).

No LUCA-AI, a unidade de trabalho é a **missão**. O painel serve para criar, acompanhar e revisar o que agentes de IA executam (`README.md`). A interface principal é React + TypeScript + Vite + Tailwind; o runtime ativo de aplicação é Express com WebSocket, persistindo estado local em `.luca/` e servindo o build em `dist/` (`docs/arquitetura.md`, `package.json`).

Em produção, o navegador chega em `app.luca-ai.com.br` via proxy mínimo Cloudflare e Tunnel da VM. O PC de desenvolvimento **não** participa do tráfego de produção (`README.md`, `AGENTS.md`, `docs/arquitetura.md`). Frontend e API falam na **mesma origem** no domínio — o commit `d0e7fcd` remove a dependência de host externo e o atrito de CORS (`changelog.md`).

Isso importa para SEO e para o usuário: o produto não é um “wrapper de chat genérico”. É um painel de missão com borda, autenticação e runtime próprios.

## Personas reais e fluxo 5/5: papéis visíveis, não vibes

O diferencial documentado no comercial e nas capturas sanitizadas de `promo/public/captures/` é o **Fluxo de personas**:

1. Supervisor  
2. Decisor da missão  
3. Executores  
4. Aprovação  
5. Exibição final  

Quando as cinco etapas estão preenchidas, a bancada mostra **5/5 — pronto para executar** (`promo/roteiro.md`, captura `03-team-flow.png`). A linguagem de produto é direta: “CADA ETAPA TEM DONO”.

As personas não são avatares inventados no marketing. O LUCA lista personas do **Yume** via **Kamui** apenas com GET (`server/kamui-client.js`, `docs/integracoes.md`). A regra de operação é explícita: *nunca escrever direto no Yume*; ler personas pelo cliente GET do Kamui (`AGENTS.md`). Na importação, o painel preserva nome, prompt e versão lidos do Yume, mas normaliza a rota de modelo apenas no estado local — o modelo remoto do Yume não vira configuração do provider (`docs/integracoes.md`).

No catálogo de Personas, o enquadramento real é grade de cards com especialidades e estado “NO LUCA” (`promo/roteiro.md`, captura `02-personas.png`). Expertise deixa de ser “qual modelo eu chuto” e vira “quem pensa este problema”.

Para executar a equipe, a API documentada `POST /api/luca-ai/persona-team/run` oferece dois modos visíveis (`docs/integracoes.md`):

- **`workflow`** — encadeia os papéis da equipe.  
- **`individual`** — roda de uma a cinco personas em contextos isolados e depois chama uma persona juíza com todas as respostas (a juíza pode repetir uma participante, mas sempre em chamada separada).

Isso é o núcleo multi-agent real do produto: papéis, modos de execução e rastro — não um slogan de “agents everywhere”.

## Runtime, borda e o que a missão devolve

O fluxo local é simples de localizar no código:

```text
src -> /api e /ws -> server -> shared -> .luca
```

Em produção:

```text
navegador -> cadastro/login LUCA -> cookie HttpOnly
  -> Worker de borda (proxy) -> Tunnel da VM
  -> server (VM) -> 9Router / Kamui / Yume
```

(`docs/arquitetura.md`)

O roteador LLM padrão fala API compatível com OpenAI em `http://127.0.0.1:20128/v1` na máquina de runtime; o catálogo fechado do 9Router expõe 14 perfis visuais que resolvem para 12 IDs de rota. Rotas externas não são encaminhadas ao provider (`docs/integracoes.md`).

Autenticação: `server/auth-store.js` com scrypt; cadastro cria sessão imediatamente; WebSocket `/ws` só com sessão válida; e-mails em `LUCA_ADMIN_EMAILS` recebem papel admin (`docs/arquitetura.md`). O changelog de 2026-07-24 registra contas, painel administrativo, tracking de uso e a migração da produção para VM própria com instalação automatizada e publicação via 9Router (`changelog.md`, git log).

Na ponta da experiência, a missão entra pelo composer e a conversa única reúne contribuições da equipe até a **Entrega final**, com rastro na aba Atividade (`promo/roteiro.md`, capturas `04-mission-ready.png` e `05-delivery.png`). A frase de produto fecha o loop: “UMA MISSÃO ENTRA → UMA ENTREGA SAI”.

Identidade visual canônica (para qualquer asset futuro): fundo void `#090c11`, azul de ação `#0a84ff`, realce `#64d2ff`, verde de conclusão `#30d158`, tipografia Inter + JetBrains Mono, marca da coruja em `public/icon-512.png` / `public/cyber-owl.jpg` (`promo/roteiro.md`).

## CTA

Se o seu fluxo ainda é “cinco chats e zero dono”, o próximo passo é abrir o painel e montar o **fluxo 5/5** com personas reais do Yume.

- App: [https://app.luca-ai.com.br](https://app.luca-ai.com.br)  
- Código: [https://github.com/LucasOl1337/LUCA-AI](https://github.com/LucasOl1337/LUCA-AI)  
- Tagline: **Sua missão. Uma equipe inteira.**

*Draft only. Não publicado. Fatos citados de README, AGENTS, docs/arquitetura, docs/integracoes, changelog, patchnotes, promo/roteiro e capturas em promo/public/captures.*
