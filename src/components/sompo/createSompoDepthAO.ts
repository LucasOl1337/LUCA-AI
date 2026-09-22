import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

const vertexShader = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const viewPosition = `
  uniform sampler2D tDepth; uniform mat4 projInv;
  vec3 viewPos(vec2 uv) {
    float depth = texture2D(tDepth, uv).x;
    vec4 p = projInv * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }`;

/**
 * Ambient occlusion from the depth the main render already produced: no second
 * geometry pass (GTAOPass re-renders the whole 6M-triangle scene for normals).
 * Half-resolution scalable AO with a spiral kernel, then a depth-aware 3x3
 * resolve that darkens the HDR colour before bloom. Grounds the truck, tree
 * bases, maize rows and grass where they meet the terrain.
 */
export class SompoDepthAOPass extends Pass {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly aoTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  private readonly aoMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, proj: { value: new THREE.Matrix4() },
      aspect: { value: 1 }, texel: { value: new THREE.Vector2() }, radius: { value: 0.8 },
    },
    vertexShader,
    fragmentShader: `varying vec2 vUv; uniform mat4 proj; uniform float aspect, radius; uniform vec2 texel;
      ${viewPosition}
      float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
      void main() {
        if (texture2D(tDepth, vUv).x >= .99999) { gl_FragColor = vec4(1.0); return; }
        vec3 P = viewPos(vUv);
        vec3 N = normalize(cross(dFdx(P), dFdy(P)));
        float rUv = radius * proj[1][1] * .5 / -P.z;
        if (rUv < texel.y * 1.5) { gl_FragColor = vec4(1.0); return; }
        rUv = min(rUv, .1);
        float spin = ign(gl_FragCoord.xy) * 6.2831853, occlusion = 0.0;
        for (int i = 0; i < 12; i++) {
          float f = (float(i) + .5) / 12.0, a = spin + float(i) * 2.3999632;
          vec2 offset = vec2(cos(a) / aspect, sin(a)) * rUv * sqrt(f);
          vec3 v = viewPos(vUv + offset) - P;
          float vv = dot(v, v);
          occlusion += max(0.0, dot(v, N) - .004 * -P.z) / (vv + .02) * (1.0 - smoothstep(radius * radius, 4.0 * radius * radius, vv));
        }
        float ao = clamp(1.0 - occlusion * radius * 2.2 / 12.0, 0.0, 1.0);
        gl_FragColor = vec4(vec3(mix(ao, 1.0, smoothstep(60.0, 140.0, -P.z))), 1.0);
      }`,
  });
  private readonly compositeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null }, tAO: { value: null }, tDepth: { value: null }, projInv: { value: new THREE.Matrix4() },
      aoTexel: { value: new THREE.Vector2() }, strength: { value: 0.75 },
    },
    vertexShader,
    fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse, tAO; uniform vec2 aoTexel; uniform float strength;
      ${viewPosition}
      void main() {
        vec4 color = texture2D(tDiffuse, vUv);
        float z = viewPos(vUv).z, sum = 0.0, weight = 0.0;
        for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
          vec2 uv = vUv + vec2(float(x), float(y)) * aoTexel;
          float w = exp(-abs(viewPos(uv).z - z) / (.04 * -z + .05));
          sum += texture2D(tAO, uv).r * w; weight += w;
        }
        color.rgb *= mix(1.0, sum / max(weight, 1e-4), strength);
        gl_FragColor = color;
      }`,
  });
  private readonly aoQuad = new FullScreenQuad(this.aoMaterial);
  private readonly compositeQuad = new FullScreenQuad(this.compositeMaterial);

  constructor(camera: THREE.PerspectiveCamera) {
    super();
    this.camera = camera;
  }

  setSize(width: number, height: number) {
    const w = Math.max(1, Math.floor(width / 2)), h = Math.max(1, Math.floor(height / 2));
    this.aoTarget.setSize(w, h);
    this.aoMaterial.uniforms.texel.value.set(1 / w, 1 / h);
    this.aoMaterial.uniforms.aspect.value = width / Math.max(1, height);
    this.compositeMaterial.uniforms.aoTexel.value.set(1 / w, 1 / h);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const depth = readBuffer.depthTexture;
    this.compositeMaterial.uniforms.strength.value = depth ? .75 : 0;
    for (const material of [this.aoMaterial, this.compositeMaterial]) {
      material.uniforms.tDepth.value = depth;
      material.uniforms.projInv.value.copy(this.camera.projectionMatrixInverse);
    }
    this.aoMaterial.uniforms.proj.value.copy(this.camera.projectionMatrix);
    renderer.setRenderTarget(this.aoTarget);
    this.aoQuad.render(renderer);
    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMaterial.uniforms.tAO.value = this.aoTarget.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.compositeQuad.render(renderer);
  }

  dispose() {
    this.aoTarget.dispose(); this.aoMaterial.dispose(); this.compositeMaterial.dispose();
    this.aoQuad.dispose(); this.compositeQuad.dispose();
  }
}
