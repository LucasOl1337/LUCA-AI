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
      grassland *= .64 + macro * .48;
      diffuseColor.rgb = mix(diffuseColor.rgb, grassland, pasture);
      #include <roughnessmap_fragment>`);
  };
  material.customProgramCacheKey = () => `sompo-pasture-albedo-v1-${field}`;
  return { dispose() { disposed = true; texture.dispose(); } };
}
