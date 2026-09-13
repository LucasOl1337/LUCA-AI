import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** GPU ribbon bending adapted from ThreeUI Landscape (Meng To, MIT).
 * Source: github.com/MengTo/threeui/blob/main/public/landscape.html
 * License: public/sompo/studio/THREEUI-LICENSE.txt. Seeded, tiled and episode-clock driven here.
 *
 * Cada pé é um leque de 3 planos com textura real de folha de milho
 * (alfa recorta a silhueta): 6 triângulos por planta mantém ~20 mil pés
 * dentro do orçamento do teste de recursos: densidade de lavoura de verdade.
 */
export function createSompoCropRows(groundHeight: (x: number, z: number) => number, compact: boolean, height = 1, operation = false) {
  const root = new THREE.Group(); root.name = 'sompo-agri-crop-rows';
  const leaf = (lean: number, spread: number) => {
    const quad = new THREE.PlaneGeometry(0.78, 1, 1, 1);
    quad.translate(0, 0.5, 0);
    quad.rotateX(lean); quad.rotateY(spread);
    return quad;
  };
  const geometry = mergeGeometries([leaf(0.3, 0), leaf(-0.18, Math.PI / 3), leaf(0.42, -Math.PI / 3)])!;
  geometry.computeVertexNormals();
  const time = { value: 0 }, wind = { value: .65 }, cut = { value: new THREE.Vector3(-1000, 0, 0) };
  const harvestTime = { value: 0 };
  const path = { value: Array.from({ length: 8 }, (_, i) => new THREE.Vector2(-100 + i * 200 / 7, 0)) };
  const leafTexture = { value: null as THREE.Texture | null };
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, alphaTest: 0 });
  if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') new THREE.TextureLoader().load('/sompo/gen/folha-milho.webp', (map) => {
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    map.repeat.set(0.98, 1);
    leafTexture.value = map;
    material.map = map; material.alphaTest = 0.5; material.needsUpdate = true;
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { cropTime: time, cropWind: wind, cropCut: cut, cropPath: path, harvestTime });
    shader.vertexShader = `${operation ? 'attribute float harvestAt; uniform float harvestTime;' : ''} uniform float cropTime,cropWind; uniform vec3 cropCut; uniform vec2 cropPath[8]; varying float cropHeight; varying float cropTint; varying float cropStubble;\n` + shader.vertexShader
      .replace('#include <beginnormal_vertex>', `
        vec3 field=instanceMatrix[3].xyz; float phase=field.x*1.73+field.z*2.41;
        float angle=phase*2.4,ca=cos(angle),sa=sin(angle),h=position.y;
        float w1=sin(cropTime*1.7+phase+field.x*.14+field.z*.11);
        float w2=sin(cropTime*.4+field.x*.02+field.z*.017);
        // Bases com guarda: pow() de base zero/negativa pode virar NaN no driver
        // e um único NaN contamina o mip chain do bloom até o frame inteiro.
        float bend=(.05+cropWind*.14*(.55+.45*w2)*(.55+.45*w1))*pow(max(h,.001),1.55)*${height.toFixed(2)};
        float centerZ=cropPath[0].y;
        for(int i=1;i<8;i++) {
          if(field.x>=cropPath[i-1].x) centerZ=mix(cropPath[i-1].y,cropPath[i].y,clamp((field.x-cropPath[i-1].x)/max(.001,cropPath[i].x-cropPath[i-1].x),0.,1.));
        }
        float harvested=(1.-smoothstep(cropCut.x-.18,cropCut.x+.18,field.x))*step(abs(field.z-centerZ),2.72)*step(.001,cropCut.z);
        ${operation ? 'harvested=step(harvestAt,harvestTime);' : ''}
        cropHeight=h; cropTint=fract(sin(phase)*43758.5453); cropStubble=harvested;
        vec3 objectNormal=normalize(vec3(-sa,.25+.55*h,ca));`)
      .replace('#include <begin_vertex>', `
        // Os dois quads trazem a largura em eixos diferentes (x num, z no outro):
        // afunila e gira o par inteiro como uma folha dupla do pé.
        float leafW=(.6+.16*fract(phase*.731))*max(.3,1.-h*.42)*max(.35,${height.toFixed(2)});
        vec2 flatPos=position.xz*leafW;
        vec2 spun=vec2(flatPos.x*ca-flatPos.y*sa,flatPos.x*sa+flatPos.y*ca);
        vec3 transformed=vec3(spun.x+bend,h*(1.-harvested*.74),spun.y+bend*.54);
        transformed.xz*=1.-harvested*.3;`);
    shader.fragmentShader = 'varying float cropHeight; varying float cropTint; varying float cropStubble;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      #ifdef USE_MAP
        diffuseColor.rgb*=mix(vec3(.5,.64,.38),vec3(.86,.8,.5),pow(max(cropHeight,.001),1.1));
      #else
        diffuseColor.rgb*=mix(vec3(.12,.2,.05),vec3(.55,.52,.2),pow(max(cropHeight,.001),1.2));
      #endif
      diffuseColor.rgb*=.78+cropTint*.44;
      // Faixa colhida vira resteva seca e baixa, não terra nua.
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.56,.44,.24)*(.75+cropTint*.5),cropStubble*.9);`);
  };
  material.customProgramCacheKey = () => `sompo-threeui-leafpair-v1-${height}-${operation}`;
  const tiles: THREE.InstancedMesh[] = [];
  const dummy = new THREE.Object3D();
  const columns = compact ? 30 : 46, rows = compact ? 38 : 54;
  for (let tile = 0; tile < 8; tile++) {
    const tileGeometry = operation ? geometry.clone() : geometry;
    if (operation) tileGeometry.setAttribute('harvestAt', new THREE.InstancedBufferAttribute(new Float32Array(columns * rows).fill(1e9), 1));
    const mesh = new THREE.InstancedMesh(tileGeometry, material, columns * rows);
    mesh.name = `crop-strip-${tile}`; mesh.receiveShadow = true;
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const seed = tile * 719 + row * 31 + col * 17;
      const x = operation ? -80 + tile * 20 + col * 20 / columns + Math.sin(seed * 1.7) * .1 : -64 + tile * 16 + col * 16 / columns + Math.sin(seed * 1.7) * .1;
      // A máquina deixa uma faixa de restolho; a lavoura começa inteira.
      const z = operation ? -50 + row * 96 / rows + Math.sin(seed * 2.1) * .09 : -12 + row * 24 / rows + Math.sin(seed * 2.1) * .09;
      const girth = 1.15 + (Math.sin(seed * 3.7) * .5 + .5) * .5;
      dummy.position.set(x, groundHeight(x, z), z);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(girth, height * (1.3 + (Math.sin(seed) * .5 + .5) * .6), girth); dummy.updateMatrix();
      mesh.setMatrixAt(row * columns + col, dummy.matrix);
    }
    mesh.computeBoundingSphere(); mesh.boundingSphere!.radius += 1;
    root.add(mesh); tiles.push(mesh);
  }
  return {
    root,
    setHarvestPath(points: readonly { x: number; z: number; atMs?: number; yaw?: number; harvesting?: boolean }[]) {
      points.slice(0, 8).forEach((point, i) => path.value[i].set(point.x + 4.28, point.z));
      if (operation) {
        const cuts = points.filter(p => p.harvesting).map(p => ({
          x: p.x + 4.28 * Math.cos((p.yaw ?? 0) * Math.PI / 180),
          z: p.z - 4.28 * Math.sin((p.yaw ?? 0) * Math.PI / 180), at: (p.atMs ?? 0) / 1000,
        }));
        // ponytail: busca O(plantas × amostras) uma vez na montagem; índice espacial se a densidade crescer.
        for (const mesh of tiles) {
          const times = mesh.geometry.getAttribute('harvestAt');
          for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, dummy.matrix);
            const x = dummy.matrix.elements[12], z = dummy.matrix.elements[14];
            const hit = cuts.find(p => (p.x - x) ** 2 + (p.z - z) ** 2 <= 3.8 ** 2);
            times.setX(i, hit?.at ?? 1e9);
          }
          times.needsUpdate = true;
        }
      }
    },
    update(elapsedMs: number, camera: THREE.Vector3, reducedMotion: boolean, strength = .65, machine?: THREE.Vector3, cropCut = 0) {
      time.value = reducedMotion ? 0 : elapsedMs / 1000; wind.value = strength;
      harvestTime.value = elapsedMs / 1000;
      cut.value.set(machine ? machine.x + 4.28 : -1000, machine?.z ?? 0, cropCut);
      for (const mesh of tiles) mesh.visible = operation || mesh.boundingSphere!.center.distanceTo(camera) < 85;
    },
    dispose() { if (operation) geometry.dispose(); leafTexture.value?.dispose(); material.dispose(); },
  };
}
