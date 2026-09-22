import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SompoTruckModel } from './createSompoTruckModel';
import type { SompoStudioConfig } from './sompoStudioConfig';

/** Bake static subparts per material, keeping assemblies and wheel pivots editable. */
function batchAssembly(parent: THREE.Object3D) {
  parent.updateMatrixWorld(true);
  const inverse = parent.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const removed: THREE.Mesh[] = [];
  const matrix = new THREE.Matrix4();
  parent.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (node === parent || !mesh.isMesh || Array.isArray(mesh.material)) return;
    let ancestor: THREE.Object3D | null = mesh;
    while (ancestor && ancestor !== parent) { if (ancestor.userData.articulated || ancestor.userData.batchSeparately) return; ancestor = ancestor.parent; }
    const geometries = batches.get(mesh.material) || [];
    const instance = mesh as THREE.InstancedMesh;
    const count = instance.isInstancedMesh ? instance.count : 1;
    for (let i = 0; i < count; i++) {
      matrix.multiplyMatrices(inverse, mesh.matrixWorld);
      if (instance.isInstancedMesh) { const local = new THREE.Matrix4(); instance.getMatrixAt(i, local); matrix.multiply(local); }
      let geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(matrix);
      // All built-in vehicle surfaces use the same standard attribute layout.
      for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
      if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
      geometries.push(geometry);
    }
    batches.set(mesh.material, geometries); removed.push(mesh);
  });
  for (const mesh of removed) { mesh.removeFromParent(); if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).dispose(); }
  for (const [material, geometries] of batches) {
    const combined = mergeGeometries(geometries);
    geometries.forEach(geometry => geometry.dispose());
    const mesh = new THREE.Mesh(combined, material); mesh.name = `${parent.name}-${material.name || 'surface'}`;
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
  }
  // Several source parts share a geometry. They have all been baked at this point.
  new Set(removed.map(mesh => mesh.geometry)).forEach(geometry => geometry.dispose());
}

function toCabinGlass(material: THREE.MeshStandardMaterial) {
  const glass = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(glass, material);
  glass.name = material.name;
  // Blender exports this pane at ~10% alpha. Transmission refraction also
  // compiles an invalid IBL shader on WebGL/SwiftShader, so the windscreen
  // disappears and the cab reads as a solid block with no window.
  glass.color.set(0xb6cbd2);
  glass.metalness = 0;
  glass.roughness = 0.055;
  glass.transmission = 0;
  glass.thickness = 0;
  glass.ior = 1.45;
  glass.transparent = true;
  glass.opacity = 0.36;
  glass.alphaMap = null;
  glass.clearcoat = 0.72;
  glass.clearcoatRoughness = 0.08;
  glass.envMapIntensity = 1.25;
  glass.attenuationColor = new THREE.Color(0x1a3344);
  glass.attenuationDistance = 0.8;
  glass.side = THREE.DoubleSide;
  glass.depthWrite = false;
  glass.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float viewFresnel = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 5.0);
      diffuseColor.a = mix(0.10, 0.72, viewFresnel);
      #include <opaque_fragment>`);
  };
  glass.customProgramCacheKey = () => 'sompo-cabin-fresnel-v1';
  return glass;
}

function assignVisualMaps(root: THREE.Object3D, isDisposed: () => boolean) {
  if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return;
  const loader = new THREE.TextureLoader();
  const paint = (url: string, names: string[]) => {
    loader.load(url, map => {
      if (isDisposed()) { map.dispose(); return; }
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
      map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
      root.traverse(node => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
          if (!(material instanceof THREE.MeshStandardMaterial) || !names.includes(material.name)) continue;
          material.map = map;
          material.bumpMap = null;
          material.roughnessMap = null;
          material.color.set('#ffffff');
          material.roughness = 0.48;
          material.metalness = 0.02; // Painted metal reflects as paint, not bare aluminium.
          material.needsUpdate = true;
        }
      });
    });
  };
  // Lateral inteira do baú num único mapa: escorrido da chuva sob o perfil de
  // cima e poeira de estrada de terra concentrada no quarto de baixo.
  paint('/sompo/gen/reefer-side-grime.jpg', ['Painéis do baú']);
  loader.load('/sompo/gen/truck-rubber-albedo.jpg', map => {
    if (isDisposed()) { map.dispose(); return; }
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(3, 2); map.anisotropy = 8;
    root.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material instanceof THREE.MeshStandardMaterial && material.name === 'Sompo tire rubber') {
          material.map = map;
          material.color.set(0xaeb4ba);
          material.roughness = .88;
          material.needsUpdate = true;
        }
      }
    });
  });
}

export function refineSompoTruck(model: SompoTruckModel) {
  let disposed = false;
  const root = model.root;
  const cab = root.getObjectByName('cab-assembly')!;
  const cargo = root.getObjectByName('cargo-assembly')!;
  const chassis = root.getObjectByName('chassis-assembly')!;
  const shell = root.getObjectByName('cab-shell') as THREE.Mesh;
  (shell.material as THREE.Material).name = 'Pintura da cabine';
  const body = root.getObjectByName('cargo-body') as THREE.Mesh;
  (body.material as THREE.Material).name = 'Painéis do baú';
  const cap = root.getObjectByName('cargo-front-cap') as THREE.Mesh;
  (cap.material as THREE.Material).name = 'Acabamentos da cabine';
  const rib = root.getObjectByName('cargo-horizontal-corrugation') as THREE.Mesh;
  (rib.material as THREE.Material).name = 'Alumínio do baú';
  // Vestimenta do chassi que a pele Blender substitui (tanque, degraus, protetor,
  // lanternas, para-choque traseiro, escape). Assada à parte para poder sumir
  // inteira sem mexer em longarinas, eixos, feixes de mola e cardã.
  const dress = new THREE.Group(); dress.name = 'chassis-dress'; dress.userData.batchSeparately = true;
  const dressParts = /^(fuel-tank|tank-strap|side-guard|guard-bracket|cab-step|step-grip|rear-mudflap|rear-underrun|rear-light|rear-brake|rear-indicator|exhaust)/;
  for (const child of [...chassis.children]) if (dressParts.test(child.name)) dress.add(child);
  chassis.add(dress);
  const wipers: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const blade = root.getObjectByName(`wiper-${side}`)!;
    const pivot = new THREE.Group(); pivot.name = `wiper-pivot-${side}`; pivot.userData.articulated = true;
    pivot.position.set(4.28, 2.46, side * 0.43); cab.add(pivot); root.updateMatrixWorld(true); pivot.attach(blade); wipers.push(pivot);
  }
  const sensorLabel = model.sensorGroup.getObjectByName('sensor-label');
  if (sensorLabel) {
    sensorLabel.visible = true;
    sensorLabel.position.set(-1.9, 4.9, 0);
    sensorLabel.scale.set(3.0, 0.75, 1);
  }
  // Keep the measurement aperture at FRONT_X, with a compact real-world enclosure.
  model.sensorGroup.scale.setScalar(0.5);
  model.sensorGroup.position.set(4.51, 0.78, 0); model.rayGroup.position.y = 0.78; model.rayGroup.scale.z = 0.5;
  root.userData.cargoBody = cargo; root.userData.asset = 'SompoModularTruck';
  const wheels = model.wheels.map(wheel => ({ wheel, position: wheel.position.clone(), spin: 0 }));
  for (const { wheel } of wheels) batchAssembly(wheel);
  for (const assembly of [cab, cargo, chassis, dress]) batchAssembly(assembly);
  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const supportPoints: THREE.Vector3[] = [];
  for (const part of [cab, cargo, chassis, ...model.wheels]) part.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const matrix = new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld);
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) supportPoints.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix));
  });
  const hullPoints = new Set<THREE.Vector3>();
  for (const face of new ConvexHull().setFromPoints(supportPoints).faces) {
    let edge = face.edge;
    do { hullPoints.add(edge.head().point); edge = edge.next; } while (edge !== face.edge);
  }
  root.userData.groundSupport = Float32Array.from([...hullPoints].flatMap(point => point.toArray()));
  // Remove editor references to parts that have been baked and retired.
  delete root.userData.sculptRuntime;
  const materials = new Set<THREE.MeshStandardMaterial>();
  root.traverse(node => { const mesh = node as THREE.Mesh; if (mesh.isMesh && mesh.material instanceof THREE.MeshStandardMaterial) materials.add(mesh.material); });
  // Altura sobre o chão por vértice, na pose de repouso e a partir do contato
  // dos pneus. A sujeira fica presa à peça em rampa, rolagem ou giro; peças
  // articuladas (rodas, limpadores) recebem um valor único, sem gradiente girando.
  const groundY = supportPoints.reduce((low, point) => Math.min(low, point.y), Infinity);
  const articulated = new Set<THREE.Object3D>();
  for (const wheel of model.wheels) wheel.traverse(node => articulated.add(node));
  for (const wiper of wipers) wiper.traverse(node => articulated.add(node));
  const bakeHeights = () => {
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert(), matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    root.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || mesh.geometry.getAttribute('sompoHeight')) return;
      const positions = mesh.geometry.attributes.position;
      const heights = new Float32Array(positions.count);
      if (articulated.has(mesh)) heights.fill(.45);
      else {
        matrix.multiplyMatrices(inverse, mesh.matrixWorld);
        for (let i = 0; i < positions.count; i++) heights[i] = point.fromBufferAttribute(positions, i).applyMatrix4(matrix).y - groundY;
      }
      mesh.geometry.setAttribute('sompoHeight', new THREE.BufferAttribute(heights, 1));
    });
  };
  bakeHeights();
  // Película de estrada: poeira que sobe do chão, respingo de pista perto das
  // rodas e filetes no baú. Intensidade por família de material; interior,
  // vidro, faróis e refletores ficam limpos.
  const wearFamily = (name: string) =>
    ['Painéis do baú', 'Alumínio do baú', 'Astra box shell', 'Astra box seam'].includes(name) ? 'box'
      : ['Pintura da cabine', 'Acabamentos da cabine', 'SOMPO painted metal', 'Astra cab trim', 'Astra bumper plastic', 'Astra black plastic'].includes(name) ? 'paint'
        : ['', 'Astra polished chrome', 'Astra grille face', 'Astra grille recess', 'Astra chassis black', 'Astra tank aluminium', 'Sompo wheel steel'].includes(name) ? 'metal'
          : ['Sompo tire rubber', 'Astra mudflap rubber'].includes(name) ? 'rubber' : null;
  const wearTruck = (material: THREE.MeshStandardMaterial) => {
    const family = wearFamily(material.name);
    if (!family) return;
    const panel = material.name === 'Painéis do baú';
    const chrome = material.name === 'Astra polished chrome';
    const amount = { box: [.3, .18], paint: [.42, .3], metal: [chrome ? .3 : .55, chrome ? .2 : .38], rubber: [.2, 0] }[family];
    const compile = material.onBeforeCompile;
    // Metal ganha piso de rugosidade: cromo polido com o sol baixo virava ponto
    // branco de um pixel no tanque e nos aros.
    material.onBeforeCompile = (shader, renderer) => {
      compile?.call(material, shader, renderer);
      shader.vertexShader = 'attribute float sompoHeight; varying float truckH; varying vec3 truckW;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        truckW = transformed; truckH = sompoHeight;`);
      if (panel) shader.vertexShader = shader.vertexShader.replace('#include <shadowmap_vertex>', `#include <shadowmap_vertex>
        #if NUM_DIR_LIGHT_SHADOWS > 0
          vDirectionalShadowCoord[0].z -= .0006 * vDirectionalShadowCoord[0].w;
        #endif`);
      shader.fragmentShader = `varying float truckH; varying vec3 truckW;
        float truckHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float truckNoise(vec2 p){vec2 i=floor(p),f=fract(p);f*=f*(3.-2.*f);
          return mix(mix(truckHash(i),truckHash(i+vec2(1,0)),f.x),mix(truckHash(i+vec2(0,1)),truckHash(i+vec2(1,1)),f.x),f.y);}\n` + shader.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          ${family === 'rubber' ? `float truckDust = .6 + .4 * truckNoise(truckW.xy * 7.0 + truckW.z * 3.0);
          float truckSpray = 0.0;` : `float truckDust = (1.0 - smoothstep(.2, 1.7, truckH)) * (.45 + .55 * truckNoise(truckW.xz * 1.9 + truckW.y * .7));
          // Respingo de pista: pintas finas concentradas no primeiro metro.
          float truckSpray = smoothstep(.7, .9, truckNoise(truckW.xz * 9.0 + truckW.y * 7.0)) * (1.0 - smoothstep(.05, 1.0, truckH));`}
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.46, .38, .27), clamp(truckDust * ${amount[0].toFixed(2)} + truckSpray * ${amount[1].toFixed(2)}, 0., .8));
          ${family === 'box' ? `float streak = truckNoise(vec2(truckW.z * 14.0 + truckW.x * 9.0, truckW.y * .6));
          diffuseColor.rgb *= 1.0 - smoothstep(.55, .95, streak) * .1 * (1.0 - smoothstep(2.4, 3.7, truckH));` : ''}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, .92, clamp(truckDust * .6 + truckSpray * .4, 0., 1.) * ${family === 'rubber' ? '.3' : '.6'});
          ${family === 'metal' ? 'roughnessFactor = max(roughnessFactor, .34);' : ''}`);
    };
    material.customProgramCacheKey = () => `sompo-truck-wear-v5-${family}-${panel}-${chrome}`;
  };
  materials.forEach(wearTruck);
  const axisY = new THREE.Vector3(0, 1, 0), axle = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const steering = new THREE.Quaternion(), spin = new THREE.Quaternion();
  let finishKey = '';
  return {
    /** Replace only the skin; wheel pivots, ground support and sensor stay on the rig. */
    replaceVisual(visual: THREE.Group) {
      if (!visual.getObjectByName('astra-cab') || !visual.getObjectByName('astra-cargo')) throw new Error('Incomplete Astra truck');
      // O chassi vestido é opcional: sem ele a vestimenta procedural continua.
      const dressed = !!visual.getObjectByName('astra-chassis');
      const replacements: [string, THREE.Object3D][] = [['astra-cab', cab], ['astra-cargo', cargo]];
      if (dressed) {
        replacements.push(['astra-chassis', dress]);
        // Para-lamas toroidais e cromo de brinquedo saem junto: rodas de aço
        // pintado e amortecedores escuros, como num caminhão de frota.
        const wheelSteel = new THREE.MeshStandardMaterial({ name: 'Sompo wheel steel', color: 0xb3b7b9, metalness: .55, roughness: .42 });
        const darkSteel = new THREE.MeshStandardMaterial({ name: 'Astra chassis black', color: 0x1b1f22, metalness: .45, roughness: .55 });
        const polished = (item: THREE.Material) => item instanceof THREE.MeshStandardMaterial && !item.name && item.metalness > .8;
        root.getObjectByName('wheel-system')?.children.forEach(node => { if (node.name.startsWith('fender-')) node.visible = false; });
        for (const wheel of model.wheels) wheel.traverse(node => { const mesh = node as THREE.Mesh; if (mesh.isMesh && !Array.isArray(mesh.material) && polished(mesh.material)) mesh.material = wheelSteel; });
        for (const node of chassis.children) { const mesh = node as THREE.Mesh; if (mesh.isMesh && !Array.isArray(mesh.material) && polished(mesh.material)) mesh.material = darkSteel; }
        for (const material of [wheelSteel, darkSteel]) { materials.add(material); wearTruck(material); }
        // O defletor de teto da cara-chata sobe até 3,7 m: a etiqueta do sensor
        // passa para cima dele em vez de ser cortada pela carenagem.
        sensorLabel?.position.set(-2.2, 6.5, 0);
      }
      for (const [name, assembly] of replacements) {
        for (const child of assembly.children) child.visible = false;
        const skin = visual.getObjectByName(name)!;
        assembly.add(skin);
        skin.traverse(node => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = mesh.receiveShadow = true;
          // The insulated body beneath these millimetre-deep ribs already casts
          // the box silhouette. Let ribs receive other shadows without a second
          // nearly coincident depth surface producing a chequerboard of acne.
          if (mesh.name.startsWith('astra-reefer-side-skin')) mesh.castShadow = false;
          if (mesh.geometry.hasAttribute('color')) {
            mesh.geometry.setAttribute('sompoCavity', mesh.geometry.getAttribute('color'));
            mesh.geometry.deleteAttribute('color');
          }
          const apply = (item: THREE.Material) => {
            if (!(item instanceof THREE.MeshStandardMaterial)) return item;
            // Window gaskets and wipers also contain "window/windscreen" in
            // their mesh names. Only the authored optical material is glass.
            const converted = item.name === 'Astra cabin glass'
              ? toCabinGlass(item) : item;
            if (converted !== item) mesh.renderOrder = 3;
            if (converted.name === 'Astra cabin glass') {
              // Transparent panes must not cast an opaque sheet across the cabin
              // or self-shadow into striped glass at shallow light angles.
              mesh.castShadow = false;
              mesh.receiveShadow = false;
            }
            if (!materials.has(converted)) {
              materials.add(converted); wearTruck(converted);
              if (mesh.geometry.hasAttribute('sompoCavity')) {
                converted.vertexColors = false;
                const compile = converted.onBeforeCompile;
                const cacheKey = converted.customProgramCacheKey();
                converted.onBeforeCompile = (shader, renderer) => {
                  compile.call(converted, shader, renderer);
                  shader.vertexShader = 'attribute vec4 sompoCavity; varying float vSompoCavity;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSompoCavity = sompoCavity.r;');
                  shader.fragmentShader = 'varying float vSompoCavity;\n' + shader.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
                    reflectedLight.indirectDiffuse *= vSompoCavity;
                    reflectedLight.indirectSpecular *= vSompoCavity;
                    #ifdef USE_CLEARCOAT
                      clearcoatSpecularIndirect *= vSompoCavity;
                    #endif`);
                };
                converted.customProgramCacheKey = () => `${cacheKey}-baked-cavity-v1`;
              }
            }
            return converted;
          };
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(apply) : apply(mesh.material);
        });
      }
      bakeHeights();
      finishKey = '';
      assignVisualMaps(root, () => disposed);
      root.userData.visualAsset = 'AstraSompoTruck';
    },
    update(config: SompoStudioConfig, elapsed: number, wheelTravel: number, steerAngle: number, roughness: number, rain: number, reduced: boolean, speedKph = 0) {
      const key = `${config.paint}:${config.cargo}:${config.roughness}:${config.wireframe}`;
      if (key !== finishKey) {
        finishKey = key;
        for (const material of materials) {
          material.wireframe = config.wireframe;
          if (material.name === 'Pintura da cabine') { material.color.set(config.paint); material.roughness = Math.min(0.28, config.roughness * 0.55); material.metalness = 0.38; }
          if (material.name === 'Acabamentos da cabine') { material.color.set(config.paint).multiplyScalar(0.62); material.roughness = Math.min(0.4, config.roughness * 0.7 + 0.08); }
          if (material.name === 'Painéis do baú' || material.name === 'Alumínio do baú' || material.name === 'Astra box shell') {
            const bareMetal = material.name === 'Alumínio do baú';
            material.color.set(material.map ? '#ffffff' : '#f2f0ea');
            material.roughness = bareMetal ? 0.32 : 0.48;
            material.metalness = bareMetal ? 0.8 : 0.02;
          }
          if (material instanceof THREE.MeshPhysicalMaterial && material.name === 'Pintura da cabine') { material.clearcoat = 0.9; material.clearcoatRoughness = 0.12; }
        }
      }
      const explode = config.exploded;
      cab.position.set(explode * 1.8, explode * 0.7 + (reduced ? 0 : (Math.sin(wheelTravel * 2.7) + Math.sin(wheelTravel * 5.1) * .35) * roughness * .008 * Math.min(1, Math.abs(speedKph) / 3)), 0);
      cargo.position.x = -explode * 1.2; cargo.position.y = explode * 2;
      for (const { wheel, position } of wheels) {
        wheel.position.copy(position); wheel.position.z += Math.sign(position.z) * explode * 1.3;
        const steer = position.x > 2 ? steerAngle : 0;
        steering.setFromAxisAngle(axisY, steer); spin.setFromAxisAngle(axisY, reduced ? 0 : -wheelTravel / .58);
        wheel.quaternion.copy(steering).multiply(axle).multiply(spin);
      }
      for (const pivot of wipers) pivot.rotation.x = reduced || !rain ? 0 : (1 - Math.cos(elapsed * .0055)) * .42 * Math.min(1, rain * 2);
    },
    // Stage disposal owns existing resources; late image callbacks must not
    // attach newly allocated textures to already retired materials.
    dispose() { disposed = true; },
  };
}

export async function exportSompoModel(root: THREE.Object3D): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  // Runtime references (Object3Ds in sculptRuntime) must not enter glTF JSON extras.
  const metadata = new Map<THREE.Object3D, Record<string, unknown>>();
  root.traverse(node => { metadata.set(node, node.userData); node.userData = {}; });
  let clone: THREE.Object3D;
  try { clone = root.clone(true); }
  finally { metadata.forEach((data, node) => { node.userData = data; }); }
  clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0); clone.updateMatrixWorld(true);
  return new GLTFExporter().parseAsync(clone, { binary: true, onlyVisible: true }) as Promise<ArrayBuffer>;
}
