# 0001 · Simulação dentro do stand

19/10/2026 · aceita

## Contexto

O totem precisa mostrar três coisas no mesmo monitor: a coruja que conversa, os vídeos do projeto e o simulador do Trator MAX jogado com o DualSense. O simulador já existia dentro de `/sompo`, uma página de mouse com cabeçalho, abas, painel de telemetria e botões que gravam episódios ou abrem a bancada. Havia duas saídas:

- navegar de `/stand` para `/sompo` e voltar;
- montar o simulador direto dentro de `/stand`.

Navegar para `/sompo` levaria para o totem a interface de mouse, os botões que escrevem e uma recarga de página a cada troca. Também tiraria do `/stand` o controle do repouso e do DualSense.

## Decisão

A Simulação é um Modo do stand, ao lado da Coruja e da Vitrine, e roda dentro de `/stand`. `src/components/stand/SimuladorKiosk.tsx` monta `SompoTruckSimulator` com `kiosk`. Nesse modo o simulador:

- some com o cabeçalho e a barra de ferramentas;
- abre na cabine;
- liga a qualidade automática;
- mostra o relógio do ESP32 virtual como Tempo do ensaio.

O código do simulador é carregado sob demanda, e `preCarregarSimulador` adianta o carregamento quando a página está ociosa. O `/stand` cuida da troca de modo (barra por toque ou mouse, voz, PS volta à Coruja) e da saída depois de 90 s sem uso (`modoStand.ts`). Desde 21/10, L1/R1 não trocam de aba (quem joga apertava sem querer) e a Simulação abre o Gameplay por padrão; o simulador clássico é a reserva automática (`GameplayOuClassico`) e pode ser forçado com `?simulacao=classica`. Fora do kiosk, `/sompo` não muda.

## Consequências

- Toda mudança no `SompoTruckSimulator` aparece nos dois lugares. O que vale só para o totem fica atrás da prop `kiosk`.
- O totem nunca chega a `/sompo` nem aos botões dele que escrevem. As Telas do app da Vitrine seguem a mesma regra: componentes só de leitura em `src/components/stand/`, sem iframe nem navegação.
- Montar o simulador dentro do `/stand` não bastava para isso. Até `9e2f5eb`, no kiosk, □ △ ○ abriam episódio, e o histórico ia para `/api/sompo/telemetry/simulation` a cada 2 s. Toda escrita do simulador agora passa por `sompoTelemetryWriter` (`src/components/sompo/sompoTelemetryWriter.ts`), que devolve `null` no kiosk. Sem a porta, □ △ ○ só tocam o cenário. `tests/stand-kiosk-sem-escrita.test.js` falha se o simulador voltar a chamar `lucaApi` direto.
- O modo Site abre o `/sompo` normal dentro do iframe do `/stand`, sem `kiosk`, e lá a aba Telemetria ligava o histórico a cada 2 s com a conta do totem. Por isso a porta também é `null` quando `EMBUTIDO_NO_STAND` (`src/components/stand/executor/embutido.ts`). Quem roda é o totem, não a página. Pelo mesmo motivo, o painel de risco do `/sompo` embutido troca "Registrar avaliação" por um aviso de demonstração, porque o visitante toca a tela (`tests/stand-site-risco-sem-registro.test.js`).
- O pacote do `/stand` passa a depender do Three.js. O carregamento sob demanda mantém Coruja e Vitrine leves, mas a primeira entrada na Simulação pode levar alguns segundos num aparelho fraco.
- Sem sessão, os modos que leem a API não têm o que mostrar. O `/stand` sem login (401) abre `StandSemLogin` no lugar da tela de login: só Coruja sem voz e Vitrine com os vídeos públicos, sem Simulação, Site nem Telas do app, e um aviso para a equipe (Shift+Q entra ali mesmo). Assim o público nunca vê um formulário de senha (`tests/stand-sem-login.test.js`).
- Para tirar a Simulação do `/stand`, basta trocar o modo por um link. O que dá trabalho desfazer são os ajustes presos à prop `kiosk` no simulador.

## Queda de rede no totem

Depois de uma abertura online, `/stand/` instala um service worker com escopo apenas nessa rota. O build injeta o commit da release e a lista de JS/CSS públicos. A casca usa a rede primeiro e só usa o cache se a rede falhar ou devolver HTML no lugar de um asset. Os três vídeos públicos usam cache primeiro e aceitam Range para tocar e buscar trechos offline. São 48.761.384 bytes de vídeo, mais cerca de 3,3 MB de JS/CSS e a imagem da Coruja. O cache pode ser removido pelo navegador ou falhar por falta de espaço. Não há promessa de primeiro acesso offline.

Sem rede, inclusive com sessão viva, a tela troca para Coruja sem voz e Vitrine local. Não monta Simulação, Site, Telas do app ou voz. O teste GET `/api/health` a cada 5 s detecta a volta e recarrega a página, que consulta a sessão real. Nenhum payload de API, cookie, resposta de voz ou WebSocket entra no cache.

O novo worker apaga caches antigos deste stand no activate. A remoção de `/stand/sw.js` no deploy desregistra o worker e remove seus caches no próximo load online. Tanto 404 quanto HTML do fallback SPA são tratados como remoção. O worker não tem escopo sobre outras páginas. Para publicar, sempre gerar um build com o commit final antes de empacotar. Testes em `tests/stand-offline.test.js`.
