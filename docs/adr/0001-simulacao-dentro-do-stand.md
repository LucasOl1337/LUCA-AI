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

O código do simulador é carregado sob demanda, e `preCarregarSimulador` adianta o carregamento quando a página está ociosa. O `/stand` cuida da troca de modo (L1/R1, PS, toque) e da saída depois de 90 s sem uso (`modoStand.ts`). Fora do kiosk, `/sompo` não muda.

## Consequências

- Toda mudança no `SompoTruckSimulator` aparece nos dois lugares. O que vale só para o totem fica atrás da prop `kiosk`.
- O totem nunca chega a `/sompo` nem aos botões dele que escrevem. As Telas do app da Vitrine seguem a mesma regra: componentes só de leitura em `src/components/stand/`, sem iframe nem navegação.
- Montar o simulador dentro do `/stand` não bastava para isso. Até `9e2f5eb`, no kiosk, □ △ ○ abriam episódio, e o histórico ia para `/api/sompo/telemetry/simulation` a cada 2 s. Toda escrita do simulador agora passa por `sompoTelemetryWriter` (`src/components/sompo/sompoTelemetryWriter.ts`), que devolve `null` no kiosk. Sem a porta, □ △ ○ só tocam o cenário. `tests/stand-kiosk-sem-escrita.test.js` falha se o simulador voltar a chamar `lucaApi` direto.
- O modo Site abre o `/sompo` normal dentro do iframe do `/stand`, sem `kiosk`, e lá a aba Telemetria ligava o histórico a cada 2 s com a conta do totem. Por isso a porta também é `null` quando `EMBUTIDO_NO_STAND` (`src/components/stand/executor/embutido.ts`). Quem roda é o totem, não a página. Pelo mesmo motivo, o painel de risco do `/sompo` embutido troca "Registrar avaliação" por um aviso de demonstração, porque o visitante toca a tela (`tests/stand-site-risco-sem-registro.test.js`).
- O pacote do `/stand` passa a depender do Three.js. O carregamento sob demanda mantém Coruja e Vitrine leves, mas a primeira entrada na Simulação pode levar alguns segundos num aparelho fraco.
- Para tirar a Simulação do `/stand`, basta trocar o modo por um link. O que dá trabalho desfazer são os ajustes presos à prop `kiosk` no simulador.
