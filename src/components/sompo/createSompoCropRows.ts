import * as THREE from 'three';

/** GPU ribbon bending adapted from ThreeUI Landscape (Meng To, MIT).
 * Source: github.com/MengTo/threeui/blob/main/public/landscape.html
 * License: public/sompo/studio/THREEUI-LICENSE.txt. Seeded, tiled and episode-clock driven here.
 */
export function createSompoCropRows(groundHeight: (x: number, z: number) => number, compact: boolean) {
  const root = new THREE.Group(); root.name = 'sompo-agri-crop-rows';
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5,0,0,.5,0,0,-.5,.55,0,.5,.55,0,0,1,0], 3));
  geometry.setIndex([0,1,2,1,3,2,2,3,4]); geometry.computeVertexNormals();
  const time = { value: 0 }, wind = { value: .65 }, cut = { value: new THREE.Vector3(-1000, 0, 0) };
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { cropTime: time, cropWind: wind, cropCut: cut });
    shader.vertexShader = `uniform float cropTime,cropWind; uniform vec3 cropCut; varying float cropHeight; varying float cropTint;\n` + shader.vertexShader
      .replace('#include <beginnormal_vertex>', `
        vec3 field=instanceMatrix[3].xyz; float phase=field.x*1.73+field.z*2.41;
        float angle=phase*2.4,ca=cos(angle),sa=sin(angle),h=position.y;
        float w1=sin(cropTime*1.7+phase+field.x*.14+field.z*.11);
        float w2=sin(cropTime*.4+field.x*.02+field.z*.017);
        float bend=(.14+cropWind*.22*(.55+.45*w2)*(.55+.45*w1))*pow(h,1.55);
        float harvested=step(field.x,cropCut.x)*step(abs(field.z-cropCut.y),3.1)*cropCut.z;
        cropHeight=h; cropTint=fract(sin(phase)*43758.5453);
        vec3 objectNormal=normalize(vec3(-sa,.25+.55*h,ca));`)
      .replace('#include <begin_vertex>', `
        float width=.22*max(.02,1.-h*.92);
        vec3 transformed=vec3(position.x*ca*width+bend,h*(1.-harvested*.9),position.x*sa*width+bend*.54);
        transformed.xz*=1.-harvested*.8;`);
    shader.fragmentShader = 'varying float cropHeight; varying float cropTint;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 base=vec3(.055,.082,.024),tip=vec3(.38,.35,.12);
      diffuseColor.rgb*=mix(base,tip,pow(cropHeight,1.2))*(.78+cropTint*.44);`);
  };
  material.customProgramCacheKey = () => 'sompo-threeui-ribbon-v3';
  const tiles: THREE.InstancedMesh[] = [];
  const dummy = new THREE.Object3D();
  const columns = compact ? 40 : 80, rows = compact ? 44 : 60;
  for (let tile = 0; tile < 8; tile++) {
    const mesh = new THREE.InstancedMesh(geometry, material, columns * rows);
    mesh.name = `crop-strip-${tile}`; mesh.receiveShadow = true;
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const seed = tile * 719 + row * 31 + col * 17;
      const x = -64 + tile * 16 + col * 16 / columns + Math.sin(seed * 1.7) * .1;
      // A máquina deixa uma faixa de restolho; a lavoura começa inteira.
      const z = -12 + row * 24 / rows + Math.sin(seed * 2.1) * .09;
      dummy.position.set(x, groundHeight(x, z), z);
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(.78 + (Math.sin(seed) * .5 + .5) * .45); dummy.updateMatrix();
      mesh.setMatrixAt(row * columns + col, dummy.matrix);
    }
    mesh.computeBoundingSphere(); mesh.boundingSphere!.radius += 1;
    root.add(mesh); tiles.push(mesh);
  }
  return {
    root,
    update(elapsedMs: number, camera: THREE.Vector3, reducedMotion: boolean, strength = .65, machine?: THREE.Vector3, cropCut = 0) {
      time.value = reducedMotion ? 0 : elapsedMs / 1000; wind.value = strength;
      cut.value.set(machine ? machine.x + 3 : -1000, machine?.z ?? 0, cropCut);
      for (const mesh of tiles) mesh.visible = mesh.boundingSphere!.center.distanceTo(camera) < 85;
    },
    dispose() {},
  };
}
