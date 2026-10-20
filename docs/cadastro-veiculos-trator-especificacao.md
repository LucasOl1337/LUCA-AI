# Missão: cadastro de veículos e trator físico no LUCA-AI

**Status:** especificação histórica preservada em 20/10/2026. O cadastro já existe em `server/sompo-vehicles.js` e o modelo MAX TRATOR em `public/models/sompo/max-tractor.glb`. Os critérios abaixo registram o pedido original, não atestam nem negam sua conclusão atual. Operação corrente em [SOMPO](sompo.md).
**Projeto:** LUCA-AI, módulo SOMPO.
**Pedido do Lucas:** criar uma aba de cadastro de veículos e fazer para o trator das fotos o mesmo trabalho que já existe para o caminhão: modelo 3D, cases/cenários e fluxo de uso.
**Referências:** [fotos originais e índice](../missoes/trator-referencias/README.md).

## Resultado esperado

Ter caminhão e trator como veículos distintos, cadastráveis e selecionáveis. Ao selecionar o trator, o app usa um modelo fiel ao equipamento azul das fotos e oferece cases com a mesma integração do caminhão: cena, telemetria, reprodução, gravação de episódio e análise na bancada, onde esses recursos já existem. O caminhão continua funcionando.

Não basta trocar o nome de caminhão para trator ou selecionar o trator agrícola genérico que o projeto já possui.

## 1. Aba de cadastro de veículos

Criar uma aba chamada **Veículos** no módulo SOMPO, seguindo a navegação atual. Permitir listar, cadastrar, editar e selecionar veículos, com os campos pedidos: `veiculo`, `id`, `placa` e `modelo`.

O Lucas deu este exemplo de estrutura. Preservar os identificadores e valores abaixo no exemplo de contrato:

```json
{
  "veiculos": [
    {
      "veiculo": "Caminhão",
      "id": "caminhao-scania0001",
      "placa": "ABC1D23",
      "modelo": "Scania R450"
    },
    {
      "veiculo": "Trator",
      "id": "trator-0001",
      "placa": "TRT0001",
      "modelo": "John Deere 6110J"
    }
  ]
}
```

**Atenção:** o JSON é o exemplo fornecido pelo usuário. As fotos mostram uma miniatura azul com a inscrição "MAX TRATOR". Elas não comprovam que o equipamento é um John Deere 6110J, nem comprovam placas reais. Não apresentar esses dados exemplificativos como identificação física confirmada. `modelo` é informação de cadastro; a referência visual desta missão é o trator fotografado.

Decisões técnicas propostas para tornar o cadastro utilizável:

- Persistir no servidor usando o padrão de armazenamento e autorização do projeto. A biblioteca local de variações da oficina não é um cadastro de frota.
- Validar ID único e campos vazios; não restringir placa de máquina agrícola à máscara de automóvel sem necessidade.
- Associar veículo cadastrado, modelo visual e cases por uma referência explícita. O ID do cadastro não deve ser confundido com ID do asset, do caso ou do sensor.
- Manter a identidade do veículo em novos episódios, reabertura e análise. Editar o cadastro não pode reescrever a identidade histórica de episódios anteriores.
- Preservar a leitura de casos e presets antigos. Definir compatibilidade explícita para registros sem veículo associado.
- Não conectar `trator-0001` ao feed físico `001` por semelhança de nome. A associação com dispositivo precisa ser explícita; sem associação, mostrar a situação em vez de dados de outra máquina.

## 2. Modelo 3D do trator das fotos

Criar e integrar um modelo próprio desta miniatura, reutilizando o pipeline de assets/modelos do caminhão quando couber. Conferir o render contra frente, traseira, laterais e vista superior das fotos, não só uma imagem de apresentação.

Características visíveis que precisam ser preservadas:

- Carroceria e capô azuis, chassi e estrutura da cabine pretos.
- Rodas traseiras maiores que as dianteiras, pneus pretos com sulcos largos e aros azuis.
- Cabine aberta com pilares pretos, teto cinza/prateado, banco e volante visíveis. Não acrescentar vidros fechados que as fotos não mostram.
- Escapamento alto cinza/prateado ao lado do capô, degraus laterais e para-lamas azuis traseiros.
- Grade frontal preta, dois faróis inferiores e conjuntos de luzes sobre o teto.
- Inscrição lateral "MAX TRATOR", sem inventar marca de fabricante real.
- Módulo ultrassônico frontal com dois transdutores circulares, suporte preto e fios visíveis.
- Conjunto circular e cabeamento visíveis atrás, a conferir nas fotos traseiras. Sua função não foi informada; não inventar sensor ou capacidade para ele.

A escala física exata não foi fornecida. Preservar as proporções observáveis e documentar a escala usada na cena como configuração, não como medição. As dimensões nominais do trator agrícola genérico existente não são medidas desta miniatura.

Separar corpo, rodas e pivôs para animação. Rodas precisam girar com o deslocamento e as dianteiras esterçar coerentemente. Frente, eixos e apoio no solo devem seguir o contrato da cena. Evitar pneu atravessando piso, rotação da carroceria no lugar de esterço e sensor apontando para trás.

O modelo deve estar disponível no produto, inclusive onde o caminhão aparece nos fluxos contemplados. Um GLB solto ou uma imagem renderizada fora do app não fecha a missão. Preservar o trator agrícola genérico quando outros cenários dependerem dele.

## 3. Cases e cenários do trator

Primeiro inventariar os cases/cenários atuais do caminhão e mapear cada fluxo: catálogo, desfechos, telemetria sintética, replay, episódios, quadros e análise. Registrar no relatório final quais foram reaproveitados, adaptados ou considerados incompatíveis.

Adaptar os casos aplicáveis para o trator fotografado, usando seu novo modelo. Ajustar ambiente, velocidade, proporções e movimentos para um trator; não copiar automaticamente velocidades de rodovia ou a geometria do caminhão.

Cobertura proposta a validar contra o catálogo existente:

- Operação normal e deslocamento no campo.
- Obstáculo frontal, com distância e alerta coerentes com o módulo frontal.
- Inclinação lateral e risco de tombamento, com desfechos existentes adaptados.
- Piso irregular, aclive, declive e frenagem/parada quando houver equivalência no fluxo atual.
- Aproveitar os cenários agrícolas de trator já existentes, sem misturar cenários exclusivos de colheitadeira ou acrescentar implementos como se estivessem nas fotos.

Preservar o mesmo relógio para movimento, sinais, pausa, velocidade de reprodução, seek e captura de quadros. Cada case deve identificar o veículo. Os quadros gravados e o briefing da análise precisam corresponder ao modelo selecionado, não a um caminhão residual.

Dados de demonstração devem continuar identificados como **sintéticos**. Cases agrícolas simulados não comprovam operação da miniatura, sinistro real ou capacidade de detecção do equipamento.

## 4. Telemetria física e limites

Preservar o contrato ESP32/Firebase existente. O LUCA só lê o Firebase e não envia comandos ao equipamento. Não alterar firmware, escrever no Firebase/Mosquitto, criar feed paralelo ou inferir novos sensores nesta missão.

A seleção visual do trator não valida sua montagem física. Manter calibração de eixos e documentar eventual teste físico pendente. Sem GNSS, não inventar trajetória geográfica do veículo. Evidência sintética, leitura física e metadados cadastrais devem continuar separados.

## Pontos de entrada registrados na preparação original

- `AGENTS.md` e `INDEX.md`: regras e mapa do projeto.
- `src/pages/SompoPage.tsx`: abas, seleção de fonte, telemetria, episódios e lançamento de análise.
- `src/components/SompoTruckSimulator.tsx`: equipamento, cenários, relógio e gravação.
- `src/components/sompo/SompoStudio.tsx` e `sompoStudioConfig.ts`: oficina e biblioteca de variações local. O preset já aceita `tractor`, mas isso não cadastra um veículo físico.
- `src/components/sompo/createSompoTruckModel.ts`, `loadSompoTruckAsset.ts` e `refineSompoTruck.ts`: pipeline atual do caminhão.
- `src/components/sompo/loadSompoAgriAsset.ts` e `rigSompoAgriAsset.ts`: carga e articulação dos assets agrícolas existentes.
- `shared/sompo-telemetry-simulator.js`: catálogo e sinais dos cenários do caminhão.
- `shared/sompo-agri-scenarios.js`: catálogo agrícola. Já contém `tractor`, asset `/models/sompo/generated-agri-tractor.glb` e cenário `agri-tractor-rollover`. Isso não é o modelo personalizado das fotos.
- `src/lib/sompo-cases.ts` e `sompo-case.ts`: cases didáticos SOMPO e lançamento de missão. Conferir quais entram no pedido sem duplicar catálogo indiscriminadamente.
- `src/pages/LaboratorioPage.tsx`, `server/lab-cases.js` e `docs/laboratorio-fazendas.md`: casos/replay do Laboratório e demonstração do caminhão na fazenda, quando aplicáveis à paridade.
- `server/sompo-telemetry-source.js`, `shared/sompo-telemetry.js` e `shared/sompo-fleet.js`: fonte, normalização e agregação. Não confundir frota derivada de amostras com cadastro persistente.
- `docs/sompo.md` e `docs/sompo-oficina.md`: contratos de telemetria, eixos, episódios e oficina.

Na preparação original havia alterações alheias e assets não commitados no checkout. Este documento não os modificou. Para trabalho novo, releia `AGENTS.md` e o estado atual do Git.

## Critérios de aceite

1. A aba Veículos permite cadastrar caminhão e trator, editar dados e reencontrá-los após recarregar o app. IDs duplicados e formulários inválidos dão erro compreensível.
2. Selecionar cada veículo troca o modelo e os cases correspondentes, sem confundir identidade, telemetria ou episódios. O caminhão mantém os fluxos atuais.
3. O trator renderizado é reconhecível como o azul das referências em frente, traseira e laterais, incluindo rodas desiguais, cabine aberta, escapamento e módulo frontal.
4. Os cases de trator contemplados funcionam em cena com sinais coerentes, pausa/replay e desfechos. Não usam velocidades de caminhão por cópia acidental.
5. Um episódio sintético do trator pode ser gravado, finalizado, reaberto e analisado na bancada com sua identidade e seus quadros preservados. Nenhum dado simulado é apresentado como medição física.
6. Casos, episódios, presets e modelos anteriores continuam legíveis. O feed Firebase não sofreu escrita nem alteração de contrato.
7. Cadastro, seleção e cases foram verificados em desktop e viewport móvel; screenshots vêm do app executado, não de imagem gerada. Verificação visual só em agent-bench, conforme a política de convivência; render pesado usa a fila da bancada.
8. Testes de cadastro/persistência, seleção/associação, compatibilidade e movimento passaram. Rodar `npm run typecheck`, testes SOMPO/Laboratório relevantes e `npm run build`; registrar falhas preexistentes separadamente.
9. Na execução futura, seguir o fluxo de entrega de `AGENTS.md`: commit/push e deploy real na `sennin-kvm`, quando a implementação estiver concluída e validada. Verificar a release pública e ler de volta as operações realizadas. Não declarar publicação só porque houve push.

## Entrega do executor

Entregar cadastro funcional, modelo integrado e cases do trator no produto. Reportar arquivos alterados, matriz de paridade com o caminhão, testes realmente executados, renders comparativos com as fotos, identificação da release e qualquer validação física ainda pendente.

**Escopo da preparação original:** somente missão e preservação das fotos. A consolidação de 20/10 recupera estas referências para que os caminhos e hashes da provenance do MAX TRATOR sejam verificáveis no repositório. Não altera cadastro, cena ou telemetria.
