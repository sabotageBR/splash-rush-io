// [Flume Frenzy] Cenario de cada parque: lagoa (plano grande com textura e UV animado), ilhas
// (InstancedMesh de esferas achatadas), props em billboard cilindrico (um draw call por atlas), ceu em
// degrade numa esfera e o panorama do Grok num cilindro que acompanha a camera. Nada fica embaixo do
// tobogan: quem cai, cai na agua.
import * as THREE from 'three';
import { criarRng } from '../core/rng.js';
import { vizinhas, RAMPA_FINAL } from '../jogo/pista.js';
import { texturaRepetida, emCinza } from './arte.js';
import { criarBillboards } from './billboard.js';

/** Altura (m) e peso de sorteio de cada um dos 9 props de cada parque (ordem das grades do Grok). */
const PROPS = {
  tropical: [[10, 3], [10, 2], [2.8, 2], [3.4, 1.4], [3.6, 0.8], [6, 0.5], [3.8, 0.4], [2.6, 1.5], [12, 0.15]],
  doces: [[8, 3], [7, 2], [3, 1.6], [4, 1], [5, 1], [8, 2], [4, 0.8], [3, 0.8], [2.8, 0.8]],
  gelo: [[10, 3], [3.4, 1.4], [4, 0.9], [4.4, 0.6], [3.4, 1.4], [4.6, 0.6], [2.8, 1.4], [12, 2], [5, 0.3]],
};

const VERT_CEU = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG_CEU = /* glsl */ `
uniform vec3 topo;
uniform vec3 horizonte;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y * 1.6, 0.0, 1.0);
  gl_FragColor = vec4(mix(horizonte, topo, pow(h, 0.7)), 1.0);
  #include <colorspace_fragment>
}`;

/**
 * @param {import('../jogo/pista.js').Pista} pista
 * @param {string} parque
 * @param {import('./temas.js').Tema} tema
 * @param {import('./arte.js').Arte} arte
 * @param {import('./motor.js').Motor} motor
 * @param {number} semente
 */
export function criarCenario(pista, parque, tema, arte, motor, semente) {
  const grupo = new THREE.Group();
  const r = criarRng(semente ^ 0x5eed);
  /** @type {(() => void)[]} */
  const lixo = [];
  const g = (/** @type {any} */ x) => {
    lixo.push(() => x.dispose());
    return x;
  };

  // ------------------------------------------------------------------ lagoa
  const texLagoa = g(texturaRepetida(tema.cinza ? emCinza(arte.tex.agua) : arte.tex.agua, '#2ec4e6'));
  texLagoa.repeat.set(180, 180);
  const lagoa = new THREE.Mesh(g(new THREE.PlaneGeometry(6000, 6000)), g(new THREE.MeshBasicMaterial({ map: texLagoa, color: tema.lagoa })));
  lagoa.rotation.x = -Math.PI / 2;
  lagoa.position.set(pista.x[Math.floor(pista.n / 2)], 0, pista.z[Math.floor(pista.n / 2)]);
  grupo.add(lagoa);

  // ------------------------------------------------------------------ ilhas
  /** @type {{ x: number, z: number, r: number, h: number }[]} */
  const ilhas = [];
  // a piscina do pouso (na frente do labio da rampa final) fica livre de ilhas
  const iF = pista.n - 1;
  const PI = RAMPA_FINAL.piscina;
  const naPiscina = (x, z, raio) => {
    const dx = x - pista.x[iF];
    const dz = z - pista.z[iF];
    const ao = dx * pista.hx[iF] + dz * pista.hz[iF];
    const lat = -dx * pista.hz[iF] + dz * pista.hx[iF];
    return ao > PI.ini - 20 - raio && ao < PI.fim + 16 + raio && Math.abs(lat) < PI.meia + 14 + raio;
  };
  const livre = (x, z, raio) => {
    if (naPiscina(x, z, raio)) return false;
    let ok = true;
    vizinhas(pista, x, z, (i) => {
      if (ok && (pista.x[i] - x) ** 2 + (pista.z[i] - z) ** 2 < (raio + 9) ** 2) ok = false;
    });
    // a grade cobre 3x3 celulas de 12 m: confere tambem uma volta maior
    for (let i = 0; ok && i < pista.n; i += 4) if ((pista.x[i] - x) ** 2 + (pista.z[i] - z) ** 2 < (raio + 9) ** 2) ok = false;
    for (const o of ilhas) if (ok && (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + raio + 4) ** 2) ok = false;
    return ok;
  };
  for (let i = 0; i < pista.n; i += 16) {
    for (const lado of [-1, 1]) {
      if (r() < 0.25) continue;
      const dist = 16 + r() * 70;
      const raio = 6 + r() * 16;
      const x = pista.x[i] - pista.hz[i] * lado * dist + (r() - 0.5) * 20;
      const z = pista.z[i] + pista.hx[i] * lado * dist + (r() - 0.5) * 20;
      if (livre(x, z, raio)) ilhas.push({ x, z, r: raio, h: 2 + r() * 3 });
    }
  }
  // anel distante (profundidade)
  for (let k = 0; k < 40; k++) {
    const i = Math.floor(r() * pista.n);
    const ang = r() * Math.PI * 2;
    const dist = 160 + r() * 260;
    const x = pista.x[i] + Math.cos(ang) * dist;
    const z = pista.z[i] + Math.sin(ang) * dist;
    const raio = 14 + r() * 26;
    if (livre(x, z, raio)) ilhas.push({ x, z, r: raio, h: 3 + r() * 5 });
  }
  const texAreia = g(texturaRepetida(tema.cinza ? emCinza(arte.tex.areia) : arte.tex.areia, '#f6d8a0'));
  texAreia.repeat.set(4, 2);
  const instIlha = new THREE.InstancedMesh(g(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
    g(new THREE.MeshToonMaterial({ map: texAreia, color: tema.areia, gradientMap: motor.degraus })), ilhas.length);
  ilhas.forEach((il, k) => {
    instIlha.setMatrixAt(k, new THREE.Matrix4().compose(new THREE.Vector3(il.x, -0.6, il.z), new THREE.Quaternion(),
      new THREE.Vector3(il.r, il.h, il.r)));
  });
  grupo.add(instIlha);

  // ------------------------------------------------------------------ props em billboard
  const atlas = arte.props[parque] || arte.props.tropical;
  const tabela = PROPS[parque] || PROPS.tropical;
  const pesoTotal = tabela.reduce((a, b) => a + b[1], 0);
  const sortear = () => {
    let x = r() * pesoTotal;
    for (let i = 0; i < tabela.length; i++) {
      x -= tabela[i][1];
      if (x <= 0) return i;
    }
    return 0;
  };
  const props = criarBillboards(atlas.textura, 1400, { cilindrico: true });
  for (const il of ilhas) {
    const qtd = Math.min(14, Math.round(il.r * il.r * 0.025) + 1);
    for (let q = 0; q < qtd; q++) {
      const t = sortear();
      const ang = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * il.r * 0.75;
      const x = il.x + Math.cos(ang) * d;
      const z = il.z + Math.sin(ang) * d;
      const y = -0.6 + il.h * Math.sqrt(Math.max(0, 1 - (d / il.r) ** 2)) - 0.15;
      const cel = atlas.celulas[t];
      const alt = tabela[t][0] * (0.8 + r() * 0.4);
      const lado = alt / Math.max(0.2, cel.alt);
      props.por(x, y, z, lado, lado, cel);
    }
  }
  props.fechar();
  props.malha.renderOrder = 0;
  grupo.add(props.malha);
  lixo.push(() => props.descartar());

  // ------------------------------------------------------------------ ceu
  const ceuMat = g(new THREE.ShaderMaterial({
    uniforms: { topo: { value: new THREE.Color(tema.ceuTopo) }, horizonte: { value: new THREE.Color(tema.ceuHorizonte) } },
    vertexShader: VERT_CEU, fragmentShader: FRAG_CEU, side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  const ceu = new THREE.Mesh(g(new THREE.SphereGeometry(2200, 24, 12)), ceuMat);
  ceu.renderOrder = -2;
  grupo.add(ceu);
  const imgPano = arte.ceu[parque] || arte.ceu.tropical;
  /** @type {THREE.Mesh | null} */
  let pano = null;
  if (imgPano) {
    const t = g(new THREE.Texture(imgPano));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.MirroredRepeatWrapping;
    t.repeat.set(4, 1);
    t.needsUpdate = true;
    pano = new THREE.Mesh(g(new THREE.CylinderGeometry(2000, 2000, 1500, 48, 1, true)),
      g(new THREE.MeshBasicMaterial({ map: t, color: tema.pano || '#ffffff', side: THREE.BackSide, depthWrite: false, fog: false })));
    pano.renderOrder = -1;
    grupo.add(pano);
  }

  let tempo = 0;
  return {
    grupo,
    ilhas,
    ceuMat,
    /** @param {number} dt @param {THREE.Vector3} cam */
    atualizar(dt, cam) {
      tempo += dt;
      texLagoa.offset.set((tempo * 0.004) % 1, (tempo * 0.006) % 1);
      ceu.position.copy(cam);
      if (pano) {
        // o horizonte da imagem (~20% de baixo) fica na altura do olho
        pano.position.set(cam.x, cam.y + 750 - 0.2 * 1500, cam.z);
      }
    },
    descartar() {
      for (const f of lixo) f();
    },
  };
}
/** @typedef {ReturnType<typeof criarCenario>} Cenario */
