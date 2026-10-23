# Props rurais Scenario no Gameplay

`criarPropsRurais.ts` é montado somente por `GameplayKiosk` (inclui Simulação/circuito do stand); as apresentações agrícolas roteirizadas não mudam. Quatro colocações de três modelos reais: dois barris no pátio, um carrinho rústico e uma rocha natural na margem. As coordenadas são compartilhadas por render, motor e minimapa em `propsRurais.ts`. O corredor, a água, a encosta e a linha de chegada ficam livres.

## Recursos e física

- Cache por montagem: um download/parse/textura por modelo; clones do barril compartilham geometria/material. Sem cache global com recursos descartados.
- Placeholder baixo em PBR enquanto carrega/na falha; permanece visível e sólido se faltar rede.
- Chão por `groundHeight`; centro/altura/raio normalizados depois do parse, sem flutuar. Colisor conservador de círculo inclui o volume inteiro; sensor usa o sistema existente e corpo impede aproximação frontal/lateral/ré.
- Na desmontagem aborta fetch, tira a camada antes do descarte global e libera cada template uma vez.
- MAX TRATOR, cabine, Coruja, vegetação, sons, UI de pausa e chat não são substituídos.

## Fonte e licença

`public/models/scenario/provenance.json` registra três URLs fixadas na revisão `55b4c002b4c1529fc48da3dff98516c3069bfa3f`, autor Scenario Labs, CC-BY-4.0, hashes antes/depois, tamanhos, redução e alterações. `CREDITOS.html` também é acessível pela UI.

Somente GLB auditado foi importado. Nunca executar arquivos `.blend` de terceiros. O script confiável `scripts/optimize-scenario-assets.py` roda em Blender headless com `--factory-startup --disable-autoexec`, CPU3; requer PIL. Exemplo com a pasta de fontes auditadas:

```sh
env -u PYTHONHOME -u PYTHONPATH PATH=/usr/bin:/bin taskset -c 0-2 nice -n 15 blender -b -t 3 --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/optimize-scenario-assets.py -- --sources /caminho/fontes-auditadas
```

A pasta recebe `amostras/{729,834,354}.glb` e `implementacao/sources.json` (campos e hashes do manifest). Barril/carrinho: 5000 triângulos cada, mapa emissivo original vira albedo PBR. Rochas: selecionado apenas o subobjeto 06 natural, 782 triângulos, paleta mineral sem emissão/runas. Texturas externas JPEG 1K/512px compatíveis com CSP sem blob.

## Testes

`tests/scenario-rural.test.js`: GLTFLoader real, SHA/bytes/material/textura, chão, cache/clones, descarte, rede falha, desmontagem durante carga, distância de percurso/spawn/destino, colisão no motor e ré. Rodar junto com `tests/gameplay*.test.js tests/sompo-agri*.test.js`, typecheck/build.

Prints de aceite devem vir do app local real na bancada/fila, não de um renderer de catálogo. A pasta de evidências conserva `prove-scenario-local.mjs`, específico da missão e alvo CDP previamente validados. Ele usa a autenticação real de uma conta descartável no runtime local isolado, nunca respostas API fabricadas. O hook THREE_DEVTOOLS observa cena e renderer do app; as imagens `inspecao-camera` reposicionam somente a câmera para mostrar todos os props, sem trocar cenário/material/modelo. As outras imagens usam os controles normais. Não usar essa rotina em produção.

Publicação desta frente está pendente de liberação legítima: negação prévia de sudo/deploy não foi revogada. Não executar deploy com outra rota/usuário/comando para contornar isso.
