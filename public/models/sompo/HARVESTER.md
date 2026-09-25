# Colheitadeira agrícola

`generated-agri-harvester.glb` é modelada localmente no Blender 5.2 por
`scripts/sompo/build-agri-harvester.py`. Não usa geometria baixada, comprada ou
reconstruída por IA. A imagem `generated-agri-harvester-source.png` serve apenas
como referência visual de proporção e cor.

Rebuild a partir da raiz do repositório:

```sh
blender -b --factory-startup --python scripts/sompo/build-agri-harvester.py
```

O asset usa metros, +X para a frente, +Y para cima e +Z para a esquerda. Seu
envelope nominal é 9,2 × 7,6 × 4,0 m (comprimento, largura com plataforma,
altura). Os pivôs das rodas e da plataforma seguem `rigSompoAgriAsset.ts`, que
continua responsável por esterçamento, giro das rodas, levante da plataforma,
molinete e poeira de trabalho.

A malha inclui casco em degraus, tanque graneleiro com abas abertas, cabine
panorâmica vazada, pneus com cravos em chevron, aros com cubo e porcas, tubo
descarregador dobrado, tela rotativa do radiador, passarela, escada inclinada,
corrimãos e plataforma de milho com doze divisores, barra, sem-fim e molinete.

O GLB exporta sete partes rígidas nomeadas: corpo, quatro rodas, plataforma e
molinete. Cada parte opaca é um único draw; o corpo acrescenta só a lâmina de
vidro. Cor, AO de cavidade, poeira por altura e variação de roughness são
gravados no atributo de vértice `CavityAO`, consolidando a paleta em dois
materiais. O vidro usa alpha PBR sem transmissão física, porque a transmissão
forçaria um passe completo de refração da cena. O asset dispensa imagens; por isso
`generated-agri-harvester.textures.json` contém um manifesto vazio válido para
o restaurador CSP.

O script grava junto o manifesto e `generated-agri-harvester.provenance.json`,
incluindo triângulos, materiais, bytes e SHA-256 do GLB exportado.
