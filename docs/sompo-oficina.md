# Oficina local do simulador SOMPO

A prévia usa o **mesmo componente React e os mesmos palcos do produto**, com APIs substituídas por fixtures em memória. Não inicia Express, SQLite, WebSocket, Firebase, Mosquitto ou agentes da bancada. Nenhum dado da prévia é persistido no histórico real. Os arquivos e texturas são servidos com a CSP do produto, restringindo ainda `connect-src` a `'self'`.

```bash
node scripts/sompo-preview/serve.mjs
# Abrir http://127.0.0.1:5197/
```

O relógio normal roda por padrão. Todos os cenários, desfechos, controles e gravação funcionam na fixture; recarregar a página apaga as amostras e os episódios. `?source=firebase` usa um snapshot físico **fictício e fixo**, para verificar somente a interface de calibração, sem conexão a equipamento.

Entradas: código do checkout atual, `public/models/sompo/` e `public/environments/sompo/`. Saída: `.sompo-preview/` (bundle temporário, ignorado pelo Git). Configure `SOMPO_PREVIEW_ROOT`, `SOMPO_PREVIEW_PORT` ou `SOMPO_PREVIEW_OUTPUT` para usar outro checkout/porta/diretório. O servidor escuta exclusivamente em `127.0.0.1`, bloqueia `/api/` e métodos diferentes de GET e retorna 404 para arquivos ausentes.

Para inspecionar somente os dois GLBs agrícolas, a oficina anterior continua disponível em `node scripts/sompo-agri/preview-server.mjs`. Ela aceita as mesmas três variáveis e usa a porta 5190 por padrão. Geração e empacotamento não são disparados por nenhuma das prévias. Os scripts de geração existentes e os pesos locais permanecem independentes; suas saídas devem manter UVs, manifestos externos e proveniência antes de substituir qualquer GLB.

## Validação reproduzível

```bash
npm run typecheck
node --test server/sompo-*.test.js
npm run build
```

A captura automatizada usa uma instância Chrome dedicada com CDP em `127.0.0.1:9347` e a dependência Playwright já instalada. Exemplo de inicialização sem perfil pessoal:

```bash
google-chrome-stable --headless=new --user-data-dir=/tmp/sompo-review-chrome --remote-debugging-port=9347 --no-first-run --disable-background-networking --enable-gpu --ignore-gpu-blocklist --use-angle=gl-egl about:blank
node scripts/sompo-preview/capture.mjs after 5197
node scripts/sompo-preview/smoke.mjs
```

`smoke.mjs` espera a prévia final em **5198**, para distinguir do baseline em 5197. O script escreve evidências em `delivery/smoke/`. A captura aceita rótulo e porta e escreve `delivery/<rótulo>/`; `SOMPO_CAPTURE_CASES=normal,fire` limita a rodada. Encerre apenas a instância Chrome dedicada e os processos locais de prévia ao terminar.

`?benchmark=1` ativa exclusivamente na prévia um relógio controlado: as animações avançam em passos de 1/60 s por callback até o instante solicitado e ficam nesse estado. O relógio real mede a duração do callback e o intervalo entre frames. Após aquecimento, cada caso usa 300 frames. O cache é desativado por CDP. JSON inclui renderer, viewport, DPR, tamanho do canvas, chamadas WebGL, triângulos (incluindo sombras e pós-processamento), recursos vivos, heap e Resource Timing por URL. `loadedBytes` soma os corpos codificados; `transferBytes` inclui os cabeçalhos informados pelo navegador. Não equivalem ao tamanho de todo o diretório de assets.

Os números móveis são de **viewport móvel na GPU do PC**; não comprovam desempenho em telefone. A cadência de 60 Hz pode esconder margem de GPU: `cpuMs` mede CPU do callback, não tempo de GPU. Não use SwiftShader como benchmark de hardware. Screenshots são renders reais; não são imagens-alvo geradas.

## Responsabilidades e limites

- `SompoTruckSimulator.tsx`: controles, snapshot, histórico, gravação e frames. O hook de captura é chamado no mesmo rAF do render dos dois palcos.
- `createSompoRuralStage.ts` e `createSompoAgriStage.ts`: câmera, renderer, animação e descarte de cada ambiente.
- `sompoStage.ts`: criação do renderer, orçamento por dispositivo e descarte de geometrias, materiais, texturas, instâncias e sombras.
- `createSompoCropRows.ts`: cereal estilizado em faixas instanciadas, com disposição determinística e vento pelo tempo do episódio. Corredor central permite ler a máquina; não simula produtividade nem corte físico da cultura.
- `createSompoEnvironmentAssets.ts`: PBR/HDRI locais, fallback e propriedade dos recursos; o palco agrícola usa HDRI apenas para iluminação e preserva seu céu.

Em telas até 700 px ou ponteiro principal grosseiro, o orçamento inicial usa DPR máximo 1, sombra 1024 e cena rural direta sem AO/bloom. Demais dispositivos: DPR máximo 1,5, sombra 2048 e pós-processamento em meia resolução. O perfil é escolhido na montagem e permanece estável durante resize; abrir novamente a cena aplica o perfil correspondente ao novo dispositivo. A lavoura compacta reduz instâncias. Na estrada, copas a mais de 30 m da câmera permanecem na cena/sombra e são omitidas apenas do pré-passe de AO.

As máquinas geradas continuam sem rig agrícola. A melhoria não valida a física, implementa corte de cultura ou articula rodas/implementos. Não há novos assets binários, serviços, integrações ou dependências. Texturas/HDRIs Poly Haven mantêm os créditos CC0 em `public/environments/sompo/LICENSE.txt`; GLBs e seus manifestos não mudaram. As referências filtradas inspiraram o método e técnicas gerais, sem incorporar código de coleções externas.
