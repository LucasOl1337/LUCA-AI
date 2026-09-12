# Fazenda real no Laboratório Virtual

## Distribuição pública e pacote local opcional

O repositório público contém o código, os exemplos sintéticos, o manifesto de referência e a imagem NAIP de domínio público. Os vetores e arquivos de elevação de Fairfax County **não são distribuídos**, devido às condições de uso da fonte. Sem esse pacote, o Laboratório abre os controles para escolher um exemplo ou importar outra área; a demonstração do caminhão na fazenda fica indisponível.

As descrições e validações da fazenda abaixo correspondem ao pacote local completo. Para reproduzi-las, obtenha os dados de acordo com a licença e coloque os arquivos nos caminhos descritos, ou use o importador com outra fonte autorizada. Não remova as exclusões de `.gitignore` sem resolver os direitos de redistribuição. Sete testes específicos desse pacote ficam explicitamente ignorados quando ele está ausente; os testes gerais de replay, geometria e elevação continuam executando. `scripts/lab-farm-browser-check.mjs` requer o pacote local completo.

O `/sompo` abre a **Frying Pan Farm Park**, fazenda pública em atividade em Herndon, Virgínia, EUA. A ortofoto georreferenciada acompanha o relevo LiDAR de solo, com opção de mapa plano. A área foi escolhida pela disponibilidade de limites, hidrografia, imagem e elevação com fontes identificadas, sem serviço pago. Consulta das fontes: 10/09/2026 UTC.

## Como usar

**UI revisada em 11/09/2026:** a cena ocupa a área principal. **Dados do caso** abre/fecha o painel de eventos e análises; **Carregar caso** abre importações e exemplos; **Camadas e fontes** revela legenda, escala, sensores e metadados. Esses detalhes começam recolhidos. A linha do tempo permanece disponível quando existe um caso.

**Ver caminhão em movimento** abre uma demonstração de 90 segundos com o mesmo modelo de caminhão do monitoramento, câmera próxima e percurso explicitamente sintético. Também está em **Carregar caso → Caminhão na fazenda**. Roda do mouse ou setas acima/abaixo ajustam a distância em **Acompanhar**; pause e use **Livre** para orbitar. O roteiro é independente do ESP32, não representa operação ocorrida ou área autorizada e só é salvo se você usar **Salvar demonstração**. O relevo apenas orienta visualmente a arfagem dessa demonstração; não substitui atitudes de casos registrados.

1. Rode `npm run build` e `npm run dev:full`; entre na conta e abra `/sompo`.
2. Na etapa **Carregar caso**, use as câmeras **Superior** e **Livre** para explorar a fazenda. Arraste/role ou foque o mapa e use as setas. A régua representa a escala no centro da vista; uma unidade da cena equivale a um metro. A seta N acompanha o norte geográfico.
3. **Área do laboratório → Área para associar** define a área dos próximos arquivos. O JSON exportado de `/monitoramento` e um CSV sem mapa/manifesto recebem a área selecionada. CSV com seus próprios arquivos associados preserva essas geometrias e metadados.
4. Para um caso já aberto, **Associar área ao caso** associa o mapa selecionado, recalcula eventos e salva outro caso quando os dados associados mudam. O CSV, os horários, os sinais, a origem física/sintética e os casos anteriores ficam preservados. Coordenadas registradas não são deslocadas para caber na fazenda.
5. No ESP32, alterne **Mapa da área / Sensores ESP32**. O mapa, os sensores e a linha do tempo usam o mesmo caso. Sem GNSS, o trator e sua trajetória não aparecem e **Acompanhar** fica indisponível; as câmeras de exploração continuam funcionando. Associar o mapa não comprova que o equipamento esteve nessa fazenda.
6. O salvamento existente inclui manifesto, GeoJSON e dicionário. Reabrir o caso restaura a mesma associação. A imagem é um asset local de URL estável. O relatório HTML inclui a origem geográfica e suas limitações.
7. No mapa, **Relevo LiDAR ativado/desativado** alterna entre o DTM e a superfície plana. Use **Livre** e aproxime para observar as encostas. Escala vertical 1:1, sem exagero. O caso guarda URL, SHA-256, bbox, datum, resolução e atribuição da grade; o arquivo permanece em `public/datasets/`. Falha de download, checksum ou validação mantém o mapa plano com aviso. Casos antigos sem referência de relevo continuam planos até reassociar a área; a preferência visual do botão não altera o caso salvo.

Os três exemplos de dez minutos continuam com seus dados e mapas fictícios originais, independentemente da área selecionada. A legenda identifica seus percursos como **sintéticos**. A demonstração adicional na fazenda real também mantém `synthetic: true` em todas as amostras e identificação permanente na cena.

## Dados incluídos e direitos de uso

Arquivos em [`public/datasets/frying-pan-farm/`](../public/datasets/frying-pan-farm/). `manifest.json` registra fontes, processamento, datas, coordenadas, atribuição e hashes. Os dois `source-*.geojson` preservam as respostas originais; `mapa.geojson` acrescenta somente propriedades de papel, identificador e fonte. Não houve conversão de KML nem simplificação dos vértices.

| Camada | Fonte e significado | Limitações |
| --- | --- | --- |
| `property_boundary` | Fairfax County Parks, OBJECTID 419; 135,6 acres estimados no GIS, 284 posições no anel | Limite administrativo cartográfico do parque/fazenda; não é levantamento cadastral certificado ou autorização de operação. Não participa da regra de cerca. |
| `allowed_area` | **Não fornecida** | Não se iguala ao limite da propriedade. Eventos de cerca indisponíveis até o operador fornecer a geometria autorizada. |
| `water` | Quatro lagoas oficiais, OBJECTID 12765–12768, provenientes de modelos estéreo de 2017; data efetiva 25/07/2018 | Cobertura parcial: cursos estreitos podem existir na camada de linhas, e água temporária pode não estar cadastrada. Não foi inferida da imagem. |
| Ortofoto | USDA NAIP / USGS The National Map, aquisição 11/10/2023, resolução nativa 0,6 m | RGB reamostrado bilinear e JPEG com perdas; serve à visualização, sem alturas ou garantia de precisão cadastral. |
| Relevo | Fairfax County DTM LiDAR, dezembro/2022; grade original de 2 pés (0,6096 m), visualização reamostrada a ~5,1 m | Solo interpolado e hidroachatado; não contém árvores, edifícios, batimetria ou altura medida da máquina. |

Fontes: [fazenda oficial](https://www.fairfaxcounty.gov/parks/frying-pan-park/on-your-own), [limite em GeoJSON](https://services1.arcgis.com/ioennV6PpG5Xodq0/ArcGIS/rest/services/OpenData_A1/FeatureServer/5/query?where=OBJECTID%3D419&outFields=OBJECTID,PARK_NAME,GIS_ESTIMATED_ACREAGE&outSR=4326&f=geojson), [quatro lagoas em GeoJSON](https://services1.arcgis.com/ioennV6PpG5Xodq0/arcgis/rest/services/Water_Features_polys/FeatureServer/0/query?objectIds=12765,12766,12767,12768&outFields=OBJECTID,NAME,TYPE,VISIBLE,SOURCE,EFFECTIVE_DATE&outSR=4326&f=geojson), [catálogo NAIP](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer).

**Licença:** a imagem USDA/USGS é de domínio público. Os vetores e o LiDAR são © Fairfax County, Virginia; seus [termos](https://www.fairfaxcounty.gov/maps/disclaimer) permitem reprodução para uso interno/pessoal e reservam os demais direitos. Este pacote destina-se ao uso local solicitado. Antes de publicar ou redistribuir esses dados, obtenha permissão ou substitua a fonte. Acesso público ao serviço não significa domínio público. Não houve commit, push, deploy, assinatura ou ativação de cobrança.

## Georreferência e escala

- Coordenadas GeoJSON: longitude, latitude WGS84. A API do condado reprojetou o limite de EPSG:2283 para EPSG:4326 via `outSR=4326`; o cliente preserva esses valores recebidos. A transformação do servidor não torna a fonte um levantamento certificado.
- Imagem: 2195 × 2115 pixels, norte para cima, exportada em EPSG:4326. `bbox = [-77.4145, 38.9318, -77.3993, 38.9432]`, na ordem **oeste, sul, leste, norte**, confirmado na resposta `exportImage`.
- Origem local: `[-77.4069, 38.9375]`. X cresce para leste; Z cresce para sul. A projeção local aproxima distâncias sobre plano tangente: cerca de 1316 × 1269 m no recorte, aproximadamente 0,600 m/pixel. Serve a esta extensão de aproximadamente 1,3 km; não usar como projeção topográfica para regiões extensas/polares ou medidas certificadas.
- A imagem cobre o recorte inteiro e todos os vértices fornecidos. A régua muda com zoom e câmera; sua referência é o plano no centro da vista, não todas as profundidades de uma vista inclinada.
- A URL de exportação, cenas NAIP travadas (`202373`, `202375`), parâmetros RGB e checksum estão no manifesto. O JPEG é servido localmente, sem depender do `href` temporário do serviço.
- Alinhamento visual entre margens das lagoas/foto e contornos é uma verificação cartográfica. A foto de 2023 e os vetores de 2017 não devem ser tratados como medidos simultaneamente. Não houve levantamento de pontos de controle em campo.

## Relevo LiDAR implementado

Existe um [DTM LiDAR oficial de 2022](https://www.fairfaxcounty.gov/gisimagery/rest/services/LiDAR/2022_LiDAR_Digital_Terrain_Model/ImageServer), com campanha de 9 a 28 de dezembro. A grade original é de 2 pés; o serviço anuncia pixel de 0,609601 unidades métricas em EPSG:3857. Espaçamento de grade não é precisão vertical, e a escala Web Mercator não é a mesma distância no solo.

O [relatório técnico oficial](https://www.arcgis.com/sharing/rest/content/items/33a4f317ae464b158814a9c7bb8508da/data), §3.2, informa NAD83(2011)/Virginia North, vertical NAVD88, GEOID18 e unidades em pés. Uma consulta pontual no centro retornou valor bruto 356,661254883, que **não pode ser interpretado como metros**. O relatório apresenta RMSEz global de 0,159 pé em pontos não vegetados e 0,286 pé em vegetados; esses resultados não certificam a precisão nesta fazenda.

O script `scripts/prepare-farm-elevation.py` consulta os metadados do raster 1 e exporta o recorte GeoTIFF F32 em EPSG:4326, com o **mesmo bbox da foto**, `adjustAspectRatio=false`, interpolação bilinear e grade de 257 × 249 amostras (~5,1 m). Ele requer Python com Pillow e numpy; usa bibliotecas já disponíveis no ambiente, sem novas dependências no frontend. O `source-elevation-metadata.xml` identifica `Foot_US` e NAVD88/GEOID18: as alturas são convertidas para metros por **1200/3937**. A reprojeção horizontal de EPSG:6593 é feita pelo serviço; o datum vertical NAVD88/GEOID18 é preservado, sem alegar conversão para alturas elipsoidais WGS84.

`dtm-2022-5m.tif` guarda o recorte recebido; `terrain-2022-5m.json` guarda os metros em ordem norte→sul, oeste→leste. O bbox descreve as **bordas**, enquanto os valores são registrados nos **centros dos pixels**. O amostrador bilinear respeita esse deslocamento de meio pixel; só estende a amostra extrema até a borda do próprio pixel. Fora do recorte, a altura é desconhecida e marcadores/trechos não são posicionados em uma cota inventada.

O recorte tem mínimo **89,348 m** e máximo **118,524 m** no datum indicado e nenhuma célula NoData. A cena subtrai o mínimo de todas as cotas apenas para posicionar a malha, mantendo escala vertical 1:1. Os contornos e os percursos GNSS acompanham o solo; no relevo, as zonas usam contornos em vez de preenchimentos planos. As regras de cerca/água continuam usando distâncias horizontais e seus papéis originais. DTM não mede inclinação, posição ou altura do ESP32 e não entra como evidência de sensor nas análises.

`elevation-validation.json` registra parâmetros, extensão retornada, tags GeoTIFF, metadados, hashes e cinco consultas independentes ao serviço em centros de pixels. As diferenças após conversão foram **inferiores a 0,07 m**. Isso verifica o processamento em relação à mesma fonte, **não** a precisão de campo; não houve pontos de controle locais. O parser rejeita NoData, unidades/datum incompatíveis, dimensões inválidas e bbox divergente; não preenche lacunas por IA.

O DTM representa solo interpolado, com água hidroachatada; não fornece árvores, edifícios, equipamentos ou batimetria. Reconstrução fiel desses objetos exige DSM/nuvem de pontos ou levantamento fotogramétrico adequado e atual, além de controle geodésico local. GNSS e sincronização temporal continuam faltando para a trajetória real do ESP32. As camadas de água, foto e LiDAR têm épocas diferentes.

## Carregar outra fazenda

### Para reconstruir o ambiente inteiro em 3D

A ortofoto e o DTM atuais fornecem aparência vista de cima e altura do solo. Não representam fachadas, copas, cercas ou máquinas como objetos tridimensionais. O caminho adequado para uma cena próxima é um levantamento fotogramétrico: muitas fotos sobrepostas, incluindo ângulos oblíquos, processadas numa malha com textura, escala e georreferência verificadas. O [OpenDroneMap](https://docs.opendronemap.org/outputs/) gera nuvem de pontos e modelo 3D texturizado; o [Cesium](https://cesium.com/platform/cesium-ion/3d-tiling-pipeline/photogrammetry/) pode preparar modelos grandes para visualização em 3D Tiles. Nenhum desses serviços foi contratado ou integrado nesta revisão.

Comece por um trecho pequeno do percurso, obtenha a malha e pontos de controle e só então integre o asset à cena Three.js já existente. A trajetória temporal da máquina é outro conjunto de dados: exige posição GNSS ou levantamento equivalente, relógio sincronizado e montagem/orientação calibrada. Não se reconstrói automaticamente a trajetória a partir da foto do mapa ou dos sinais atuais do ESP32. Para a fazenda escolhida ainda não temos esse levantamento de superfície com textura; não foram adicionados galpões ou árvores fictícios como se fossem medições.

### Manifesto e limites

Prepare um `manifest.json` e um `mapa.geojson` em WGS84. Clique **Carregar outra área** e selecione os dois juntos; depois **Explorar área sem telemetria**, importe o caso ou use **Associar área ao caso**. Um `manifest.json` de área mínimo:

```json
{
  "version": "1.0",
  "site": { "id": "minha-fazenda-v1", "name": "Minha fazenda" },
  "coordinate_reference": "WGS84 / GeoJSON longitude,latitude",
  "local_origin": [-47.65, -22.7],
  "map_warning": "Informe aqui a fonte, a data e as limitações dos limites.",
  "satellite": {
    "url": "/datasets/minha-fazenda/ortofoto.jpg",
    "bbox": [-47.66, -22.71, -47.64, -22.69],
    "crs": "EPSG:4326",
    "attribution": "Titular, licença e data da imagem"
  }
}
```

As coordenadas acima são apenas exemplo de formato, não dados de uma fazenda. Não invente limites ou escala. `satellite` é opcional: sem imagem o GeoJSON continua explorável. Acrescente `resolution_m`, data, licença, fonte e processamento quando conhecidos. Coloque a imagem em `public/datasets/minha-fazenda/` e rode o build, ou use uma URL HTTPS estável com CORS e licença adequada. URLs `blob:`, arquivos da máquina e imagens sem atribuição não são persistíveis; um print isolado não fornece georreferência confiável.

Relevo é opcional. Para outra área, prepare uma grade JSON no formato de `terrain-2022-5m.json`: `version: 1`, `crs: "EPSG:4326"`, `unit: "m"`, `registration: "pixel-center"`, `vertical_datum`, `bbox`, `width`, `height` e `values` em ordem de linhas do norte para o sul. Máximo 512 × 512, sem células ausentes. Documente a fonte, unidades e conversões; não use o script Fairfax em outra fonte sem adaptar e verificar seus metadados. Inclua `manifest.terrain` com `url`, `sha256` do arquivo exato, `bbox` **igual ao da imagem**, `vertical_datum`, `resolution_m` e `attribution`, como no pacote incluído. O upload associa os metadados: imagem e grade devem estar hospedadas em caminhos estáveis e versionados; mantenha os arquivos antigos para replay. GeoTIFF não é carregado diretamente pelo navegador. Se houver NoData, escolha um recorte com cobertura válida ou mantenha o mapa plano.

O GeoJSON deve ser `FeatureCollection`, com `Polygon` ou `MultiPolygon`, anéis fechados e `properties.role` igual a `property_boundary`, `allowed_area` ou `water`. Cada papel requer sua própria feição e origem documentada. Não duplique o limite como área permitida sem confirmação do operador. Buracos e multipolígonos são preservados. Campos desconhecidos continuam nos arquivos, mas não participam das regras. Altitudes eventualmente presentes continuam no GeoJSON salvo, com aviso de que a cena usa apenas longitude/latitude.

Para KML, faça a conversão geográfica antes do upload, por exemplo no QGIS: carregar KML → Exportar feições → GeoJSON → CRS EPSG:4326. Preserve os vértices, anéis e multipolígonos, sem simplificar, e confira a ordem longitude/latitude. Acrescente os papéis por feição. Estilos KML, pastas, overlays, `altitudeMode`, extrusão e animações não têm equivalência direta neste importador. Mesmo que a terceira coordenada seja preservada no GeoJSON, a cena não a usa para relevo. Não converta altitudes relativas ao solo em absolutas sem uma fonte vertical válida. O pacote incluído usa GeoJSON direto, portanto não sofreu essas perdas de KML.

As regras do caso têm prioridade sobre `rules` da área ao associar. Na ausência delas, permanece o padrão didático já existente (água ≤20 m, arrefecimento ≥105 °C). Água só é avaliada com posição GNSS e polígonos `water`; cerca só com GNSS e `allowed_area`. Distância ultrassônica frontal do ESP32 não é distância à água.

## Verificação local

```powershell
npm run typecheck
npm run build
node --test server/lab-farm-demo.test.js server/lab-telemetry.test.js server/lab-terrain.test.js server/lab-site.test.js server/lab-cases.test.js server/sompo-lab-export.test.js
$env:LUCA_DEMO_PORT = '4245'
node scripts/sompo-demo.mjs
# Em outro terminal:
node scripts/lab-farm-browser-check.mjs
```

O servidor de demonstração usa estado temporário e bloqueia conexões externas. O teste de navegador usa Edge/Playwright instalado, cria uma conta e dados de teste locais, verifica imagem, exploração, importação ESP32, posição ausente, alternância sensores/mapa, salvamento/reabertura, importação de outra área, exemplo antigo e layout móvel. Capturas e relatório ficam em `docs/audit/farm/`. Testes geométricos verificam preservação das coordenadas, orientação, escala, imagem/bbox, separação das regras, GNSS ausente e validação de entrada; os polígonos operacionais sintéticos desses testes nunca são carregados no pacote real.
