import * as THREE from 'three';

/** Generated albedo is a surface input; geometry, light and shadows remain live. */
export function createSompoPastureSurface(material: THREE.MeshStandardMaterial, field = false) {
  let disposed = false;
  const ready = { value: 0 };
  const texture = new THREE.TextureLoader().load('/sompo/gen/pasto-albedo.webp', map => {
    if (disposed) { map.dispose(); return; }
    ready.value = 1;
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.anisotropy = 8;
  const soilReady = { value: 0 };
  const soilTexture = new THREE.TextureLoader().load('/sompo/gen/solo-barro.webp', map => {
    if (disposed) { map.dispose(); return; }
    soilReady.value = 1;
  });
  soilTexture.colorSpace = THREE.SRGBColorSpace;
  soilTexture.wrapS = soilTexture.wrapT = THREE.MirroredRepeatWrapping;
  soilTexture.anisotropy = 8;
  const compile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.uniforms.pastureMap = { value: texture }; shader.uniforms.pastureReady = ready;
    shader.uniforms.soilMap = { value: soilTexture }; shader.uniforms.soilReady = soilReady;
    shader.fragmentShader = 'uniform sampler2D pastureMap; uniform float pastureReady;\nuniform sampler2D soilMap; uniform float soilReady;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      float pasture = ${field ? 'smoothstep(11.0,18.0,abs(ruralWorld.z))' : 'smoothstep(4.1,7.2,abs(ruralWorld.z+2.05))'};
      vec3 grassland = mix(vec3(.10,.135,.04), texture2D(pastureMap,ruralWorld.xz*.23).rgb, pastureReady);
      // Segunda oitava de detalhe: de perto a trama fina segura a textura.
      grassland = mix(grassland, grassland * texture2D(pastureMap, ruralWorld.xz*1.63 + 7.7).rgb * 2.1, .28 * pastureReady);
      grassland *= .64 + macro * .48;
      // Solo de preparo sob a lavoura em fileiras (z −15…−42): terra escura
      // faz o verde das fileiras saltar, como na referência.
      ${field ? '' : `
      float fieldSoil = smoothstep(11.4, 14.5, -ruralWorld.z) * (1.0 - smoothstep(48.0, 54.0, -ruralWorld.z));
      vec3 tilled = mix(vec3(.28, .21, .125), texture2D(soilMap, ruralWorld.xz * .38).rgb * vec3(.82, .72, .62), soilReady);
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
      diffuseColor.rgb = mix(diffuseColor.rgb, grassland, pasture);
      #include <roughnessmap_fragment>`);
  };
  material.customProgramCacheKey = () => `sompo-pasture-albedo-v2-${field}`;
  return { dispose() { disposed = true; texture.dispose(); soilTexture.dispose(); } };
}
