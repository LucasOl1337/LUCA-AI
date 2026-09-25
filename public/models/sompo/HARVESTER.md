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

A malha inclui corpo e tanque graneleiro chanfrados, cabine panorâmica vazada
com interior, pneus com cravos geométricos, aros amarelos, tubo descarregador
dobrado, grades, escada, corrimãos, espelhos, luzes e plataforma de milho com
doze divisores, barra de corte, sem-fim e molinete. As onze superfícies PBR usam
cores por material e dispensam imagens; por isso
`generated-agri-harvester.textures.json` contém um manifesto vazio válido para
o restaurador CSP.

O script grava junto o manifesto e `generated-agri-harvester.provenance.json`,
incluindo triângulos, materiais, bytes e SHA-256 do GLB exportado.
