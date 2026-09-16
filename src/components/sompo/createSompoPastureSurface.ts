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
  const texture = load('/sompo/gen/pasto-albedo.webp', map => {
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
      grassland = mix(grassland, grassland * texture2D(bladeMap, ruralWorld.xz*1.63 + 7.7).rgb * 2.1, .3 * bladeNear);
      grassland *= .64 + macro * .48;
      // Solo de preparo sob a lavoura em fileiras (z −15…−42): terra escura
      // faz o verde das fileiras saltar, como na referência.
      ${field ? '' : `
      float fieldSoil = smoothstep(11.4, 14.5, -ruralWorld.z) * (1.0 - smoothstep(48.0, 54.0, -ruralWorld.z));
      vec3 tilled = mix(vec3(.28, .21, .125), texture2D(soilMap, ruralWorld.xz * .38).rgb * vec3(.82, .72, .62), soilReady);
      // Sombra de copa: sob milho denso o chão lê verde-escuro, não barro claro.
      vec3 canopyFloor = mix(tilled, texture2D(canopyMap, ruralWorld.xz * .14).rgb * vec3(.42, .5, .38), .55 * canopyReady);
      tilled = mix(tilled, canopyFloor, .6);
      tilled *= .72 + macro * .56;
      grassland = mix(grassland, tilled, fieldSoil * .85);`}
      // Mosaic de talhões nas encostas: parcelas de trigo, verde e terra virada.
      float corridorZ = ${field ? 'abs(ruralWorld.z)' : 'abs(ruralWorld.z+2.05)'};
      float hills = smoothstep(38.0, 72.0, corridorZ);
      if (hills > 0.001) {
        float cell = ruralNoise(floor(ruralWorld.xz / 17.0) + .5);
        float cell2 = ruralNoise(floor(ruralWorld.xz / 17.0) + 19.31);
        vec3 parcela = cell < .28 ? vec3(.46,.40,.16)      // trigo/amarelo
          : cell < .60 ? vec3(.20,.345,.115)                // verde escuro
          : cell < .82 ? vec3(.30,.225,.125)                // terra virada
          : vec3(.26,.42,.15);                              // pasto claro
        parcela *= .75 + cell2 * .5;
        grassland = mix(grassland, parcela, hills * .72);
      }
      // Keep foreground grass in shade and distant hills muted in the cream haze.
      ${field ? '' : 'grassland *= mix(vec3(.23,.25,.22), vec3(.68,.58,.54), smoothstep(16., 75., abs(ruralWorld.z)));'}
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
  };
  material.customProgramCacheKey = () => `sompo-pasture-albedo-v4-${field}`;
  return { dispose() { disposed = true; texture.dispose(); soilTexture.dispose(); bladeTexture.dispose(); if (field) tilledTexture.dispose(); else canopyTexture.dispose(); } };
}
