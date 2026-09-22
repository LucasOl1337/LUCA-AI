import * as THREE from 'three';

/** Generated albedo is a surface input; geometry, light and shadows remain live. */
export function createSompoPastureSurface(material: THREE.MeshStandardMaterial, field = false) {
  let disposed = false;
  // TextureLoader precisa de DOM (createElementNS); nos testes node fica a
  // textura vazia e o shader segue pelo caminho de fallback (ready = 0).
  const canLoad = typeof document !== 'undefined' && typeof document.createElementNS === 'function';
  const load = (url: string, onReady: (map: THREE.Texture) => void) =>
    canLoad ? new THREE.TextureLoader().load(url, onReady) : new THREE.Texture();
  const ready = { value: 0 };
  const texture = load(field ? '/sompo/gen/pasto-albedo.webp' : '/environments/sompo/grass-color-2k.jpg', map => {
    if (disposed) { map.dispose(); return; }
    ready.value = 1;
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.anisotropy = 8;
  const soilReady = { value: 0 };
  const soilTexture = load('/sompo/gen/solo-barro.webp', map => {
    if (disposed) { map.dispose(); return; }
    soilReady.value = 1;
  });
  soilTexture.colorSpace = THREE.SRGBColorSpace;
  soilTexture.wrapS = soilTexture.wrapT = THREE.MirroredRepeatWrapping;
  soilTexture.anisotropy = 8;
  const tilledReady = { value: 0 };
  const tilledTexture = field ? load('/sompo/gen/solo-talhado.webp', map => {
    if (disposed) { map.dispose(); return; }
    tilledReady.value = 1;
  }) : soilTexture;
  if (field) {
    tilledTexture.colorSpace = THREE.SRGBColorSpace;
    tilledTexture.wrapS = tilledTexture.wrapT = THREE.MirroredRepeatWrapping;
    tilledTexture.anisotropy = 8;
  }
  const bladeReady = { value: 0 };
  const bladeTexture = load('/sompo/gen/grama-laminas.webp', map => {
    if (disposed) { map.dispose(); return; }
    bladeReady.value = 1;
  });
  bladeTexture.colorSpace = THREE.SRGBColorSpace;
  bladeTexture.wrapS = bladeTexture.wrapT = THREE.MirroredRepeatWrapping;
  bladeTexture.anisotropy = 8;
  const canopyReady = { value: 0 };
  const canopyTexture = field ? soilTexture : load('/sompo/gen/lavoura-densa.webp', map => {
    if (disposed) { map.dispose(); return; }
    canopyReady.value = 1;
  });
  if (!field) {
    canopyTexture.colorSpace = THREE.SRGBColorSpace;
    canopyTexture.wrapS = canopyTexture.wrapT = THREE.MirroredRepeatWrapping;
    canopyTexture.anisotropy = 8;
  }
  const compile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.uniforms.pastureMap = { value: texture }; shader.uniforms.pastureReady = ready;
    shader.uniforms.soilMap = { value: soilTexture }; shader.uniforms.soilReady = soilReady;
    shader.uniforms.tilledMap = { value: tilledTexture }; shader.uniforms.tilledReady = tilledReady;
    shader.uniforms.bladeMap = { value: bladeTexture }; shader.uniforms.bladeReady = bladeReady;
    shader.uniforms.canopyMap = { value: canopyTexture }; shader.uniforms.canopyReady = canopyReady;
    shader.fragmentShader = 'uniform sampler2D pastureMap; uniform float pastureReady;\nuniform sampler2D soilMap; uniform float soilReady;\nuniform sampler2D tilledMap; uniform float tilledReady;\nuniform sampler2D bladeMap; uniform float bladeReady;\nuniform sampler2D canopyMap; uniform float canopyReady;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      float pasture = ${field ? 'smoothstep(11.0,18.0,abs(ruralWorld.z))' : 'smoothstep(4.1,7.2,abs(ruralWorld.z+2.05))'};
      vec3 grassland = mix(vec3(.10,.135,.04), texture2D(pastureMap,ruralWorld.xz*.23).rgb, pastureReady);
      // Oitava fina com foto de lâminas: só perto da câmera, senão o horizonte suja.
      float bladeNear = (1.0 - smoothstep(9.0, 34.0, distance(cameraPosition, ruralWorld))) * bladeReady;
      grassland = mix(grassland, grassland * texture2D(bladeMap, ruralWorld.xz*1.63 + 7.7).rgb * 2.1, ${field ? '.3' : '.08'} * bladeNear);
      grassland *= .64 + macro * .48;
      // Solo de preparo sob a lavoura em fileiras (z −15…−42): terra escura
      // faz o verde das fileiras saltar, como na referência.
      ${field ? '' : `
      float fieldSoil = smoothstep(11.4, 14.5, -ruralWorld.z) * (1.0 - smoothstep(31.0, 36.0, -ruralWorld.z));
      vec3 tilled = mix(vec3(.28, .21, .125), texture2D(soilMap, ruralWorld.xz * .38).rgb * vec3(.82, .72, .62), soilReady);
      // Sombra de copa: sob milho denso o chão lê verde-escuro, não barro claro.
      vec3 canopyFloor = mix(tilled, texture2D(canopyMap, ruralWorld.xz * .14).rgb * vec3(.42, .5, .38), .55 * canopyReady);
      tilled = mix(tilled, canopyFloor, .6);
      tilled *= .72 + macro * .56;
      grassland = mix(grassland, tilled, fieldSoil * .85);`}
      // Broad continuous vegetation variation; no square colour tiles on hills.
      float corridorZ = ${field ? 'abs(ruralWorld.z)' : 'abs(ruralWorld.z+2.05)'};
      float hills = smoothstep(38.0, 72.0, corridorZ);
      // Gramado do lado da câmera (z > 18): fora do alcance do capim 3D, era
      // um tapete liso na visão aberta. Recebe as mesmas touceiras pintadas.
      float lawn = ${field ? '0.0' : 'smoothstep(17.0, 24.0, ruralWorld.z) * (1.0 - hills)'};
      if (lawn > 0.001) {
        float lawnFade = 1.0 - smoothstep(20.0, 110.0, distance(cameraPosition, ruralWorld));
        float lawnTuft = ruralNoise(ruralWorld.xz * 1.9 + 3.1) * .6 + ruralNoise(ruralWorld.xz * 4.7 + 8.7) * .4;
        grassland *= mix(1.0, .78 + lawnTuft * .46, lawn * lawnFade);
        float lawnStraw = smoothstep(.5, .82, ruralNoise(ruralWorld.xz / 13.0 + 41.0));
        grassland = mix(grassland, grassland * vec3(1.3, 1.15, .76), lawnStraw * lawn * .5);
      }
      if (hills > 0.001) {
        float moisture = ruralNoise(ruralWorld.xz / 26.0 + .5);
        float cover = ruralNoise(ruralWorld.xz / 7.0 + 19.31);
        vec3 vegetationTint = mix(vec3(.70,.64,.47), vec3(.60,.76,.52), smoothstep(.22,.78,moisture));
        grassland *= mix(vec3(1.), vegetationTint * (1.0 + cover * .18), hills * .55);
        // Touceiras pintadas no chão: duas oitavas de claro/escuro que somem
        // com a distância antes de cintilar. Substituem a malha de capim que
        // virava pontilhado preto no morro.
        float tuftFade = 1.0 - smoothstep(28.0, 150.0, distance(cameraPosition, ruralWorld));
        float tuft = ruralNoise(ruralWorld.xz * 1.9 + 3.1) * .6 + ruralNoise(ruralWorld.xz * 4.7 + 8.7) * .4;
        grassland *= mix(1.0, .8 + tuft * .42, hills * tuftFade);
        // Manchas de palha seca da braquiária, maiores que as de umidade.
        float straw = smoothstep(.5, .82, ruralNoise(ruralWorld.xz / 13.0 + 41.0));
        grassland = mix(grassland, grassland * vec3(1.32, 1.16, .74), straw * hills * .55);
      }
      // Keep foreground grass in shade and distant hills muted in the cream haze.
      ${field ? '' : 'grassland *= vec3(.45,.58,.29);'}
      diffuseColor.rgb = mix(diffuseColor.rgb, grassland, pasture);
      // Talhão do agri: sulcos na direção das fileiras (o v da textura segue
      // o x do mundo) com resteva nas valetas, escurecido sob a copa. A faixa
      // |z|<~12 fica fora da máscara do pasto, então aplica direto no diffuse.
      ${field ? `
      float fieldZone = 1.0 - smoothstep(11.5, 15.5, abs(ruralWorld.z));
      vec3 tilled = mix(vec3(.24, .17, .1), texture2D(tilledMap, vec2(ruralWorld.z * .36, ruralWorld.x * .16)).rgb * vec3(.9, .8, .7), tilledReady);
      tilled *= .68 + macro * .5;
      diffuseColor.rgb = mix(diffuseColor.rgb, tilled, fieldZone);` : ''}
      #include <roughnessmap_fragment>`);
    // Sombra de nuvem: manchas largas de luz direta a menos no morro e no pasto,
    // o que dá escala e profundidade ao relevo. Só a luz do sol, o céu continua.
    if (!field) shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      float cloudShade = smoothstep(.42, .7, ruralNoise(ruralWorld.xz / 46.0 + vec2(3.7, 11.2)) * .7 + ruralNoise(ruralWorld.xz / 17.0 + 5.1) * .3);
      reflectedLight.directDiffuse *= 1.0 - cloudShade * .55 * smoothstep(9.0, 30.0, abs(ruralWorld.z + 2.05));`);
  };
  material.customProgramCacheKey = () => `sompo-pasture-albedo-v9-${field}`;
  return { dispose() { disposed = true; texture.dispose(); soilTexture.dispose(); bladeTexture.dispose(); if (field) tilledTexture.dispose(); else canopyTexture.dispose(); } };
}
