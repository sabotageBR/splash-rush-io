// [Flume Frenzy] Billboards instanciados num draw call so por atlas: cada instancia tem posicao do pe,
// tamanho, retangulo no atlas, giro (roll) e um deslocamento para a camera (empilhar boia de tras,
// personagem e boia da frente sem briga de profundidade). Dois modos: "cilindrico" (cenario: gira so
// em volta do eixo Y) e "esferico" (corredores: sempre de frente para a camera). Recorte por alfa (os
// sprites tem contorno escuro: o recorte duro fica limpo e a profundidade resolve a ordem).
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec2 aTam;
attribute vec4 aUV;
attribute float aGiro;
attribute float aDesloc;
attribute float aFade;
varying vec2 vUv;
varying float vFade;
#include <fog_pars_vertex>
void main() {
  vec2 q = vec2(position.x * aTam.x, (position.y + 0.5) * aTam.y);
  float cs = cos(aGiro);
  float sn = sin(aGiro);
  q = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
#ifdef CILINDRICO
  vec3 dir = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  dir.y = 0.0;
  dir = normalize(dir);
  vec4 mvPosition = viewMatrix * vec4(aPos + dir * q.x + vec3(0.0, q.y, 0.0), 1.0);
#else
  vec4 mvPosition = viewMatrix * vec4(aPos, 1.0);
  mvPosition.xy += q;
  mvPosition.z += aDesloc;
#endif
  gl_Position = projectionMatrix * mvPosition;
  vUv = vec2(aUV.x + uv.x * aUV.z, aUV.y + uv.y * aUV.w);
  vFade = aFade;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 tinta;
uniform float corte;
varying vec2 vUv;
varying float vFade;
#include <fog_pars_fragment>
void main() {
  vec4 c = texture2D(map, vUv);
  if (c.a < corte) discard;
  // esmaecer sem ordenar transparencia: pontilhado ordenado 4x4 (some aos poucos, sem encolher)
  if (vFade < 0.999) {
    vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
    float b = mod(q.x * 2.0 + q.y * 3.0 + floor(q.x * 0.5) * 5.0 + floor(q.y * 0.5) * 7.0, 16.0) / 16.0;
    if (b >= vFade) discard;
  }
#ifdef TRANSPARENTE
  gl_FragColor = vec4(c.rgb * tinta, c.a);
#else
  gl_FragColor = vec4(c.rgb * tinta, 1.0);
#endif
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/**
 * @param {THREE.Texture} map
 * @param {number} max instancias
 * @param {{ cilindrico?: boolean, nevoa?: boolean, corte?: number, transparente?: boolean, aditivo?: boolean }} [o]
 */
export function criarBillboards(map, max, o = {}) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('uv', base.getAttribute('uv'));
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  const aTam = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
  const aUV = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  const aGiro = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  const aDesloc = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  const aFade = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(1), 1);
  for (const a of [aPos, aTam, aUV, aGiro, aDesloc, aFade]) a.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aPos', aPos);
  g.setAttribute('aTam', aTam);
  g.setAttribute('aUV', aUV);
  g.setAttribute('aGiro', aGiro);
  g.setAttribute('aDesloc', aDesloc);
  g.setAttribute('aFade', aFade);
  g.instanceCount = 0;
  const nevoa = o.nevoa !== false;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: map }, tinta: { value: new THREE.Color(1, 1, 1) }, corte: { value: o.corte ?? 0.5 } }]),
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: Object.assign(o.cilindrico ? { CILINDRICO: '' } : {}, o.transparente ? { TRANSPARENTE: '' } : {}),
    fog: nevoa,
    side: THREE.DoubleSide,
    transparent: !!o.transparente,
    depthWrite: !o.transparente,
    blending: o.aditivo ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  mat.uniforms.map.value = map;
  const malha = new THREE.Mesh(g, mat);
  malha.frustumCulled = false;
  let n = 0;
  return {
    malha,
    material: mat,
    limpar() { n = 0; },
    /**
     * @param {number} x @param {number} y @param {number} z pe do sprite
     * @param {number} w @param {number} h tamanho do quadro (m)
     * @param {{ u0: number, v0: number, du: number, dv: number }} c celula
     * @param {number} [giro] rad @param {number} [desloc] m para a camera
     * @param {number} [cortaAlt] fracao de baixo da celula mostrada (1 = inteira)
     * @param {number} [fade] 1 = inteiro, 0 = sumido (pontilhado)
     */
    por(x, y, z, w, h, c, giro = 0, desloc = 0, cortaAlt = 1, fade = 1) {
      if (n >= max) return;
      aPos.setXYZ(n, x, y, z);
      aTam.setXY(n, w, h * cortaAlt);
      aUV.setXYZW(n, c.u0, c.v0, c.du, c.dv * cortaAlt);
      aGiro.setX(n, giro);
      aDesloc.setX(n, desloc);
      aFade.setX(n, fade);
      n++;
    },
    fechar() {
      g.instanceCount = n;
      for (const a of [aPos, aTam, aUV, aGiro, aDesloc, aFade]) a.needsUpdate = true;
    },
    get quantos() { return n; },
    descartar() {
      g.dispose();
      base.dispose();
      mat.dispose();
    },
  };
}
