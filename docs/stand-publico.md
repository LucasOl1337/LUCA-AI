# Stand: perguntas do público

Leia ao mudar o que a IA do `/stand` sabe responder. Este documento entra na busca `buscar_no_repo` (`server/stand/conhecimento.js`) e é falado em voz alta para visitantes, investidores e a Sompo. Cada parágrafo resume um fato que já está em outro documento do repo, indicado entre parênteses; mudou a fonte, mude aqui. Sem número, cliente ou resultado que não esteja na fonte.

## O que é o LUCA-AI

O LUCA-AI é um sistema de segurança e risco para máquinas agrícolas e caminhões. Um sensor na máquina mede a operação, o painel mostra a máquina num gêmeo digital em 3D, avisa de risco de colisão e de tombamento e dá um score de risco de 0 a 100 explicando cada fator. Uma bancada de agentes de IA analisa os episódios gravados e escreve um parecer. (README.md, docs/sompo.md)

## De onde veio o projeto

O LUCA-AI responde ao desafio que a Sompo propôs no Challenge FIAP 2026: identificar fatores ambientais e operacionais que elevam o risco em equipamentos agrícolas, com alertas, score por equipamento, explicações e trilha auditável. (docs/sompo-gap-analysis.md, hierarquia de fontes)

## Como o sensor do trator funciona

O sensor é um ESP32 preso na máquina. Ele mede a distância até um obstáculo à frente, a inclinação para os lados e para frente (roll e pitch), a aceleração e a rotação nos três eixos, a temperatura e a umidade, e marca quando vê risco de colisão ou de inclinação. (docs/sompo.md, contrato)

O caminho do dado: o ESP32 publica no broker Mosquitto, a leitura chega no Firebase, o servidor do LUCA-AI assina esse feed, guarda o histórico e entrega ao painel e ao gêmeo 3D em tempo real. O navegador nunca fala direto com o Firebase e o painel não manda comando para a máquina. (docs/sompo.md, fluxo)

No gêmeo 3D, abaixo de 2 metros do obstáculo o painel mostra atenção e até 1 metro mostra perigo; acima de 20 graus de inclinação lateral, mostra risco de tombar. (docs/sompo.md, interações físicas visuais)

## O que o alerta faz e o que não faz

O alerta avisa o operador antes do contato ou do tombamento. Quem decide é o operador ou o gestor: o aviso não controla a máquina nem garante segurança. (docs/sensor-lab.md)

## Score de risco

O score vai de 0 a 100 e mostra quanto cada fator pesou, como tipo de operação, região e clima. Os pesos são acadêmicos, ainda sem validação atuarial da Sompo; é um protótipo, não homologado em campo. (docs/sompo-gap-analysis.md, US-04; docs/sompo-demo.md)

## Simulador e episódios

Sem equipamento, um simulador 3D reproduz cenários de acidente e de boa prática, como animal na pista, tombamento lateral do trator, atolamento e pausa preventiva no calor. Cada cenário pode virar um episódio gravado, com a telemetria completa e até cinco imagens datadas. Tudo o que vem do simulador é simulado e aparece rotulado assim. (docs/sompo.md, episódios; src/lib/sompo-stories.ts; GLOSSARY.md)

## Bancada de agentes

A bancada de agentes é um grupo de agentes de IA que recebe um episódio gravado, cruza as imagens com a telemetria e devolve um veredito: o que aconteceu, a severidade para a seguradora e o que fazer agora. É um parecer de IA, citado só pelo que a sessão mostra, não um laudo nem a decisão da seguradora. (GLOSSARY.md, veredito da bancada; docs/sompo.md)

## O que a Sompo ganha

Na regulação de sinistro: quando o segurado conta uma versão e a telemetria mostra outra, o LUCA reconstitui o acidente em 3D e grava o episódio com imagens datadas. No penhor rural: um trator tombado vale cerca de R$ 400 mil e quase ninguém vê como aconteceu; a simulação ajuda a precificar o risco e orientar a perícia. Na prevenção: a decisão segura do motorista vira evidência a favor do segurado. (src/lib/sompo-stories.ts)

No curto prazo, no campo, o operador recebe o alerta antes do acidente. No longo prazo, na carteira, o gestor da frota e a seguradora comparam a telemetria de várias máquinas. Hoje não há carteira real de apólices no app: os casos são exemplos. (GLOSSARY.md, seguradora)

## Este stand

O trator do stand é uma maquete de MDF e a tela mostra o LUCA, um assistente de IA que responde por voz. Ele pode abrir o próprio painel na tela, rodar um cenário e mandar o episódio para a bancada. Se perguntarem, ele diz que é uma IA. (GLOSSARY.md, stand do trator)

## O que ainda não existe

O score não tem validação atuarial nem homologação em campo, não existe cadastro integrado de apólices e o segurado ainda não tem uma visão própria no app. (docs/sompo-gap-analysis.md; GLOSSARY.md)

## Quanto custa e quem fez

Quanto custa, preço, plano e contrato comercial não estão definidos no repositório. Os nomes de quem fez o projeto também não estão nos documentos. Nos dois casos a IA diz que não sabe e sugere falar com a equipe do stand.
