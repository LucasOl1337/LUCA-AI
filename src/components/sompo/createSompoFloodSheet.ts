import * as THREE from 'three';

export type FloodZone = { x0: number; x1: number; z0: number; z1: number };

/** Trecho GLSL da cor da lâmina: margem rasa barrenta que some no solo, miolo fundo escuro. */
export const FLOOD_COLOR_GLSL = `vec2 floodEdge = floodHalfSize - abs(floodLocal);
float floodDistance = min(floodEdge.x, floodEdge.y);
float floodShore = (floodNoise(floodLocal * 0.32 + floodSeed) - 0.5) * 1.8 + (floodNoise(floodLocal * 1.1 + floodSeed) - 0.5) * 0.5;
float floodWet = smoothstep(0.15, 2.1, floodDistance + floodShore);
float floodDepth = smoothstep(0.8, 5.5, floodDistance + floodShore * 0.6);
diffuseColor.rgb = mix(floodShallow, floodDeep, floodDepth);
diffuseColor.a *= floodWet * mix(0.72, 1.0, floodDepth);`;

/** Ondulação leve: o gradiente de duas camadas de ruído que andam com o vento entorta a normal (mundo +y), mais no fundo que na margem. */
export const FLOOD_RIPPLE_GLSL = `vec2 floodP = floodLocal;
float floodH0 = floodWave(floodP), floodHx = floodWave(floodP + vec2(0.12, 0.0)), floodHy = floodWave(floodP + vec2(0.0, 0.12));
vec2 floodSlope = vec2(floodHx - floodH0, floodHy - floodH0) / 0.12;
float floodCalm = smoothstep(0.4, 3.0, min(floodHalfSize.x - abs(floodLocal.x), floodHalfSize.y - abs(floodLocal.y)));
normal = normalize(normal - (viewMatrix * vec4(floodSlope.x, 0.0, -floodSlope.y, 0.0)).xyz * 0.11 * floodCalm);`;

/** Reflexo do céu: em ângulo raso a lâmina funda puxa para a cor do horizonte (Fresnel de Schlick, F0 da água ~0,02). */
export const FLOOD_SKY_GLSL = `float floodView = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
float floodFresnel = 0.02 + 0.98 * pow(1.0 - floodView, 5.0);
outgoingLight = mix(outgoingLight, floodSky, clamp(floodFresnel, 0.0, 1.0) * 0.5 * floodDepth);`;

function floodMaterial(halfWidth: number, halfDepth: number, seed: number, time: { value: number }, sky: THREE.Color) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.16, metalness: 0.04, transparent: true, opacity: 0.86, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      floodHalfSize: { value: new THREE.Vector2(halfWidth, halfDepth) },
      floodSeed: { value: seed },
      floodDeep: { value: new THREE.Color(0x24505e) },
      floodShallow: { value: new THREE.Color(0x6b5a3c) },
      floodSky: { value: sky },
      floodTime: time,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 floodLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloodLocal = position.xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 floodLocal;
uniform vec2 floodHalfSize;
uniform float floodSeed;
uniform vec3 floodDeep;
uniform vec3 floodShallow;
uniform vec3 floodSky;
uniform float floodTime;
float floodHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float floodNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(floodHash(i), floodHash(i + vec2(1.0, 0.0)), f.x), mix(floodHash(i + vec2(0.0, 1.0)), floodHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float floodWave(vec2 p) {
  return floodNoise(p * 0.55 + vec2(0.31, 0.17) * floodTime + floodSeed) * 0.7 + floodNoise(p * 1.6 - vec2(0.12, 0.43) * floodTime) * 0.3;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FLOOD_COLOR_GLSL}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FLOOD_RIPPLE_GLSL}`)
      .replace('#include <opaque_fragment>', `${FLOOD_SKY_GLSL}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'sompo-flood-sheet-v2';
  return material;
}

/**
 * Lâmina d'água da área alagada. A zona do geofence continua sendo o retângulo
 * (minimapa, alerta e física não mudam); só o visual deixa de ser um polígono
 * azul liso: a margem fica rasa e barrenta, com contorno irregular que some no
 * solo em ~2 m, e o miolo fica fundo e escuro, com ondulação leve que anda
 * (`update`) e reflexo da cor do céu em ângulo raso. Um draw call por zona, sem textura.
 */
export function createSompoFloodSheets(parent: THREE.Object3D, zones: readonly FloodZone[], groundHeight: (x: number, z: number) => number, skyColor: THREE.ColorRepresentation = 0xb5cdd0) {
  const time = { value: 0 }, sky = new THREE.Color(skyColor);
  const parts = zones.map((zone, index) => {
    const width = zone.x1 - zone.x0, depth = zone.z1 - zone.z0;
    const geometry = new THREE.PlaneGeometry(width, depth);
    const material = floodMaterial(width / 2, depth / 2, index * 17.3, time, sky);
    const sheet = new THREE.Mesh(geometry, material);
    sheet.rotation.x = -Math.PI / 2;
    const cx = (zone.x0 + zone.x1) / 2, cz = (zone.z0 + zone.z1) / 2;
    sheet.position.set(cx, groundHeight(cx, cz) + 0.04, cz);
    sheet.name = 'area-alagada';
    parent.add(sheet);
    return { sheet, geometry, material };
  });
  return {
    sheets: parts.map((part) => part.sheet),
    /** Segundos de cena; 0 congela (movimento reduzido). */
    update(seconds: number) { time.value = Number.isFinite(seconds) ? seconds % 1000 : 0; },
    dispose() {
      for (const { sheet, geometry, material } of parts) { sheet.removeFromParent(); geometry.dispose(); material.dispose(); }
    },
  };
}
