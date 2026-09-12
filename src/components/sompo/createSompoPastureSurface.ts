import * as THREE from 'three';

/** Generated albedo is a surface input; geometry, light and shadows remain live. */
export function createSompoPastureSurface(material: THREE.MeshStandardMaterial, field = false) {
  let disposed = false;
  const ready = { value: 0 };
  const texture = new THREE.TextureLoader().load('/sompo/studio/pasture-albedo.webp', map => {
    if (disposed) { map.dispose(); return; }
    ready.value = 1;
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.anisotropy = 8;
  const compile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.uniforms.pastureMap = { value: texture }; shader.uniforms.pastureReady = ready;
    shader.fragmentShader = 'uniform sampler2D pastureMap; uniform float pastureReady;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      float pasture = ${field ? 'smoothstep(11.0,18.0,abs(ruralWorld.z))' : 'smoothstep(5.7,9.5,abs(ruralWorld.z+2.05))'};
      vec3 grassland = mix(vec3(.10,.135,.04), texture2D(pastureMap,ruralWorld.xz*.23).rgb, pastureReady);
      // Segunda oitava de detalhe: de perto a trama fina segura a textura.
      grassland = mix(grassland, grassland * texture2D(pastureMap, ruralWorld.xz*1.63 + 7.7).rgb * 2.1, .28 * pastureReady);
      grassland *= .64 + macro * .48;
      // Solo de preparo sob a lavoura em fileiras (z −15…−42): terra escura
      // faz o verde das fileiras saltar, como na referência.
      ${field ? '' : `
      float fieldSoil = smoothstep(13.5, 16.5, -ruralWorld.z) * (1.0 - smoothstep(40.0, 44.0, -ruralWorld.z));
      grassland = mix(grassland, vec3(.28, .21, .125) * (.75 + macro * .5), fieldSoil * .82);`}
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
  return { dispose() { disposed = true; texture.dispose(); } };
}
