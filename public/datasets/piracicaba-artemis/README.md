# Piracicaba · Artemis (demonstração)

## O que é real
A superfície do rio Piracicaba vem da [relação OSM 2708872](https://www.openstreetmap.org/relation/2708872)
(`natural=water`, `water=river`), consultada em 2026-09-11 via `api.openstreetmap.org`, licença
[ODbL](https://www.openstreetmap.org/copyright) — © OpenStreetMap contributors. O MultiPolygon foi montado
encadeando os 7 ways externos e a ilha interna pelos ids de nós, sem simplificar nem inventar pontos.
O talhão de cana usado como referência é o way OSM 201798960 (`landuse=farmland`, `crop=sugarcane`).

## O que é fictício
Limite de propriedade, área permitida, o polígono de declive (`hazard/slope`, `declive-01`) e o percurso das
duas colheitas são inventados para demonstração; não representam uma fazenda, propriedade ou evento reais.
Toda feição fictícia traz `properties.synthetic: true` e uma nota em português.

## Como foi gerado
`node scripts/generate-piracicaba-dataset.mjs` — determinístico (sem `Math.random`, sem relógio do sistema
na geometria; ruído de atitude vem de senos com fase fixa), lê a fonte OSM bruta e escreve todo o conteúdo
desta pasta. Duas execuções produzem os mesmos bytes.

## Licença
Água: ODbL (OpenStreetMap contributors). Demais arquivos desta pasta: mesma licença do repositório LUCA-AI.

## Aviso
Os valores de `rules.hazards` (5/15/35 m para água; 0/10 m para declive) são exemplos de demonstração,
não distâncias de segurança calibradas para operação real.
