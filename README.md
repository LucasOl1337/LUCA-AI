# LUCA-AI

O LUCA-AI reúne um ambiente de trabalho com agentes de inteligência artificial e ferramentas para acompanhar equipamentos, explorar telemetria e investigar incidentes. Combina histórico de sensores e visualização 3D para ajudar o usuário a entender o que aconteceu e registrar uma conclusão com as evidências disponíveis.

## O que o software faz

- **Agentes de IA:** criação e acompanhamento de missões, conversas e revisão dos resultados. As integrações com modelos dependem da configuração do servidor.
- **Monitoramento de equipamentos (`/monitoramento`):** leituras do ESP32 recebidas pela integração Firebase, histórico, alertas e gêmeo digital orientado pelos sinais disponíveis.
- **Laboratório virtual (`/sompo`):** importação de CSV e JSON do histórico SOMPO, replay temporal, exploração de eventos, investigação de causas e salvamento de conclusões.
- **Mapa e cena 3D:** associação de casos a imagens aéreas georreferenciadas, limites e corpos d'água, com relevo quando há dados adequados. Câmeras de acompanhamento, superior e livre.
- **Demonstrações:** exemplos sintéticos e simulador para explorar o sistema sem equipamento conectado. Dados simulados permanecem identificados.

## Usando o Laboratório

A cena ocupa a área principal. **Dados do caso** abre os controles de importação e análise; **Camadas e fontes** apresenta as informações geográficas. Com o pacote local da fazenda disponível, **Ver caminhão em movimento** inicia uma demonstração de 90 segundos com câmera próxima e percurso sintético. A linha do tempo permite pausar e rever a operação.

O ESP32 disponível **não tem GNSS**: suas leituras não permitem reconstruir uma trajetória geográfica real. Sem posição válida, o Laboratório mantém a localização indisponível. Limite de propriedade, área operacional permitida e água são camadas distintas; um limite de propriedade não autoriza operação.

A imagem aérea sobre uma malha de elevação representa o terreno, mas não reconstrói árvores e galpões. Uma cena completa exige malha texturizada ou nuvem de pontos obtida por levantamento adequado. Veja [como carregar outra fazenda e os limites da reconstrução 3D](docs/laboratorio-fazendas.md).

**Status:** producao na VM (`sennin-core-01`). Interface React + runtime Express. Dominio publico `https://luca-ai.com.br` via proxy de borda (`deploy/luca-ai-vm-proxy.js`) e Cloudflare Tunnel. `worker/` e legado e nao faz parte da producao.

**Stack:** React, TypeScript, Vite, Tailwind CSS, Express, WebSocket, Node Test Runner.

Consulte [`INDEX.md`](./INDEX.md) para localizar codigo e documentacao.

## Requisitos para execucao local

- Node.js 22.5 ou superior, necessario para o modulo nativo `node:sqlite`.
- npm, incluido na instalacao do Node.js.
- Acesso de rede somente quando a origem Firebase ou provedores externos forem utilizados.

## Como executar

```bash
npm ci
npm run build
npm run dev:full
```

O build gera o front-end; dev:full inicia o Express servindo esse build. Para gerar a versao de producao e iniciar o servidor:

```bash
npm start
```

Validacoes disponiveis:

```bash
npm run typecheck
npm test
npm run build
```

## Arquitetura da telemetria Sompo

```text
ESP32 -> Mosquitto -> Firebase -> Express -> SQLite -> WebSocket autenticado
                                                         |
                                                         +-> painel React e gemeo digital Three.js
```

O simulador 3D tambem pode enviar amostras ao Express para criar historico e episodios de teste. A interface identifica a origem como `firebase` ou `simulation`, evitando apresentar dados simulados como telemetria fisica.

O contrato dos sensores, os endpoints e os cuidados de operacao estao documentados em [`docs/sompo.md`](./docs/sompo.md).

## Configuracao e seguranca

- Nao versionar senhas, tokens, chaves de API ou arquivos locais de credenciais.
- Configuracoes sensiveis devem ser fornecidas pelo ambiente de execucao.
- O historico SQLite usa `LUCA_DATA_DIR` quando definido; sem essa configuracao, o padrao local e `.luca/`.
- Antes de publicar, revisar o repositorio e remover arquivos temporarios, logs privados e dados pessoais.

## Contribuições e publicação

Prepare alterações em uma branch, execute as verificações relevantes e abra um pull request descrevendo a mudança e sua validação. Preserve alterações locais e revise os arquivos antes do envio. Commit, push, merge e deploy seguem as autorizações do responsável pelo projeto; abrir um PR não autoriza deploy.

Os dados geográficos têm licenças próprias. O pacote local Frying Pan Farm Park inclui imagem USDA/USGS de domínio público e vetores/relevo de Fairfax County com restrições de redistribuição. Não publique esses dados restritos sem permissão ou substituição por uma fonte compatível. Consulte [fontes e direitos de uso](docs/laboratorio-fazendas.md).

## Organização do código

| Diretório | Conteúdo |
| --- | --- |
| `src/` | Interface React e cenas Three.js. |
| `server/` | Runtime Express, APIs, persistência e integrações. |
| `shared/` | Contratos, conversores e regras compartilhadas. |
| `public/` | Assets e pacotes geográficos locais. |
| `scripts/` | Demonstrações e verificações auxiliares. |
| `docs/` | Guias de operação, dados e validação. |
| `deploy/` | Ferramentas de publicação na VM. |

Leia o [guia de operação](docs/operacao.md) para configurar o ambiente e o [guia de integrações](docs/integracoes.md) para conectar os serviços externos. O navegador recebe telemetria pelo backend; esse fluxo não envia comandos ao equipamento.

## Auditoria e demonstração do Challenge

A jornada de equipamentos agora inclui score contextual explicável e registro auditável. Para demonstrar sem Firebase ou provedores externos, use `npm run build` seguido de `npm run demo:sompo` (porta 4243, dados temporários novos). Consulte [o roteiro local](docs/sompo-demo.md), [a matriz de lacunas](docs/sompo-gap-analysis.md) e [o log de validação](docs/sompo-execution-log.md). O score é acadêmico/experimental; cobertura permanece pendente sem apólice.
