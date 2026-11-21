// [Flume Frenzy] Malha do tobogan a partir da pista (src/jogo/pista.js): casca em meia-calha com labio
// de borda, faixa de agua correndo, teto translucido dos tuneis com aneis, pilares (InstancedMesh), setas
// de atalho na parede de fora, alvo da pista de pouso, setas de turbo, rampas, torre de largada, portal de
// chegada e piscina final.
//
// 3.0.0 (sensacao de velocidade): a calha tem textura com placas, juntas escuras a cada 8 m e a borda em
// faixas, para o olho medir a velocidade; aneis de suporte por fora a cada 6 m, postes com luz na borda e
// porticos por cima passam colados na camera; a agua corre tobogan abaixo MAIS rapido que o jogador (UV
// ligado a velocidade dele mais um fluxo proprio), com uma camada de espuma esticada que escorre junto.
// 3.1.0: rampa final com setas amarelas subindo, o portal de chegada no labio e a piscina comprida do pouso
// (estadio na direcao do salto, com borda branca e ilha de areia em volta).
import * as THREE from 'three';
import { DS, ALFA_MAX } from '../jogo/constantes.js';
import { T, RAMPA_FINAL } from '../jogo/pista.js';
import { MANOBRA } from '../jogo/manobras.js';
import { texturaRepetida, emCinza } from './arte.js';

const NA = 12;
/** fluxo proprio da agua da calha, acima da velocidade do jogador (m/s) */
const FLUXO = 7;
/** labio da borda: (para fora, para cima) a partir da borda, m */
const LABIO = [[0.2, 0.17], [0.46, 0.05]];

/** Textura desenhada em canvas. @param {number} w @param {number} h @param {(g: CanvasRenderingContext2D) => void} f */
function texCanvas(w, h, f) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  f(/** @type {CanvasRenderingContext2D} */ (cv.getContext('2d')));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Seta dupla apontando para cima (v crescente). @param {string} cor */
export function texSeta(cor) {
  return texCanvas(128, 128, (g) => {
    g.lineJoin = 'round';
    g.lineCap = 'round';
    for (const y0 of [78, 30]) {
      g.beginPath();
      g.moveTo(24, y0 + 30);
      g.lineTo(64, y0);
      g.lineTo(104, y0 + 30);
      g.strokeStyle = '#12405a';
      g.lineWidth = 26;
      g.stroke();
      g.strokeStyle = cor;
      g.lineWidth = 16;
      g.stroke();
    }
  });
}

function texAlvo() {
  return texCanvas(128, 128, (g) => {
    for (const [r, c] of [[60, '#ffffff'], [48, '#ff5a5a'], [36, '#ffffff'], [24, '#ff5a5a'], [12, '#ffffff']]) {
      g.beginPath();
      g.arc(64, 64, r, 0, Math.PI * 2);
      g.fillStyle = c;
      g.fill();
    }
  });
}

function texXadrez() {
  return texCanvas(128, 32, (g) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
      g.fillStyle = (x + y) % 2 ? '#1d2b3a' : '#ffffff';
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  });
}

/**
 * Textura da calha (u atravessa a calha, v ao longo, uma volta a cada 8 m): placas em duas cores a cada 4 m,
 * junta escura com parafusos no comeco de cada placa e a borda em faixas (cor da borda / escura).
 * @param {import('./temas.js').Tema} tema
 */
function texCalha(tema) {
  return texCanvas(256, 256, (g) => {
    g.fillStyle = tema.calha;
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = tema.calha2 !== tema.calha ? tema.calha2 : tema.calha;
    g.fillRect(0, 128, 256, 128);
    if (tema.calha2 === tema.calha) {
      // placa alternada um pouco mais clara
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(0, 128, 256, 128);
    }
    // brilho de agua escorrendo (faixas longitudinais leves)
    for (let x = 40; x < 216; x += 22) {
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(x, 0, 6, 256);
    }
    // juntas
    for (const y of [0, 128]) {
      g.fillStyle = y === 0 ? 'rgba(20,30,50,0.55)' : 'rgba(20,30,50,0.35)';
      g.fillRect(0, y, 256, y === 0 ? 7 : 4);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(0, y + (y === 0 ? 7 : 4), 256, 2);
    }
    for (let x = 44; x < 216; x += 34) {
      g.fillStyle = 'rgba(20,30,50,0.6)';
      g.beginPath();
      g.arc(x, 14, 3, 0, Math.PI * 2);
      g.fill();
    }
    // bordas em faixas: 4 m na cor da borda, 4 m escuras (o olho conta as faixas passando)
    for (const x0 of [0, 222]) {
      g.fillStyle = tema.borda;
      g.fillRect(x0, 0, 34, 128);
      g.fillStyle = '#e8413a';
      g.fillRect(x0, 128, 34, 128);
    }
  });
}

const VERT_AGUA = /* glsl */ `
#include <fog_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG_AGUA = /* glsl */ `
uniform sampler2D mapa;
uniform vec3 cor;
uniform vec2 off1;
uniform vec2 off2;
uniform float opac;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  vec3 a = texture2D(mapa, vUv + off1).rgb;
  // espuma: a mesma textura esticada ao longo (rastro) e correndo mais rapido
  vec3 b = texture2D(mapa, vec2(vUv.x * 0.8 + 0.31, vUv.y * 0.35) + off2).rgb;
  vec3 c = cor * a;
  float espuma = smoothstep(0.62, 0.9, (b.r + b.g + b.b) / 3.0);
  c = mix(c, vec3(1.0), espuma * 0.6);
  // reflexo nas beiradas da faixa
  float beira = smoothstep(0.3, 0.5, abs(vUv.x - 0.5));
  c += vec3(0.16) * beira;
  gl_FragColor = vec4(c, opac);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function texRampa() {
  return texCanvas(64, 64, (g) => {
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#ffffff' : '#3a8dff';
      g.fillRect(0, i * 16, 64, 16);
    }
  });
}

/**
 * Estadio (retangulo de cantos redondos) no plano: x de lado (meia largura W), y ao longo (meio comprimento L).
 * @param {number} L @param {number} W @param {number} R raio dos cantos (<= W)
 */
function estadio(L, W, R) {
  const r = Math.min(R, W, L);
  const s = new THREE.Shape();
  s.moveTo(-W + r, -L);
  s.lineTo(W - r, -L);
  s.absarc(W - r, -L + r, r, -Math.PI / 2, 0, false);
  s.lineTo(W, L - r);
  s.absarc(W - r, L - r, r, 0, Math.PI / 2, false);
  s.lineTo(-W + r, L);
  s.absarc(-W + r, L - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-W, -L + r);
  s.absarc(-W + r, -L + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Junta geometrias simples (posicao e uv) numa so. @param {THREE.BufferGeometry[]} gs */
function mesclar(gs) {
  const pos = [];
  const uv = [];
  for (const g of gs) {
    const gi = g.index ? g.toNonIndexed() : g;
    pos.push(...gi.getAttribute('position').array);
    uv.push(...gi.getAttribute('uv').array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/**
 * Quadrilatero de decalque numa lista de vertices (4 cantos, 2 triangulos).
 * @param {number[]} pos @param {number[]} uv @param {THREE.Vector3[]} c cantos (0: u0v0, 1: u1v0, 2: u1v1, 3: u0v1)
 */
function quad(pos, uv, c) {
  const ordem = [0, 1, 2, 0, 2, 3];
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const k of ordem) {
    pos.push(c[k].x, c[k].y, c[k].z);
    uv.push(uvs[k][0], uvs[k][1]);
  }
}

/**
 * Ponto da superficie (fundo + raio) na amostra i, angulo a, deslocado d para dentro (normal).
 * @param {import('../jogo/pista.js').Pista} p @param {number} i @param {number} a @param {number} [d]
 */
function sup(p, i, a, d = 0) {
  const R = p.raio[i] - d;
  const lat = R * Math.sin(a);
  return new THREE.Vector3(p.x[i] - p.hz[i] * lat, p.y[i] + p.raio[i] - R * Math.cos(a), p.z[i] + p.hx[i] * lat);
}

/**
 * @param {import('../jogo/pista.js').Pista} pista
 * @param {import('./temas.js').Tema} tema
 * @param {import('./arte.js').Arte} arte
 * @param {import('./motor.js').Motor} motor
 */
export function criarTobogan(pista, tema, arte, motor) {
  const grupo = new THREE.Group();
  const p = pista;
  const n = p.n;
  /** @type {(() => void)[]} */
  const descartar = [];
  const guardar = (/** @type {any} */ x) => {
    descartar.push(() => x.dispose());
    return x;
  };

  // ------------------------------------------------------------------ casca
  const nv = NA + 1 + 4;
  const pos = new Float32Array(n * nv * 3);
  const uvC = new Float32Array(n * nv * 2);
  for (let i = 0; i < n; i++) {
    const R = p.raio[i];
    const rx = -p.hz[i];
    const rz = p.hx[i];
    for (let j = 0; j < nv; j++) {
      let lat;
      let up;
      if (j < 2 || j > NA + 2) {
        const lado = j < 2 ? -1 : 1;
        const l = LABIO[j < 2 ? 1 - j : j - (NA + 3)];
        lat = lado * (R * Math.sin(ALFA_MAX) + l[0]);
        up = R * (1 - Math.cos(ALFA_MAX)) + l[1];
      } else {
        const a = -ALFA_MAX + (2 * ALFA_MAX * (j - 2)) / NA;
        lat = R * Math.sin(a);
        up = R * (1 - Math.cos(a));
      }
      const o = (i * nv + j) * 3;
      pos[o] = p.x[i] + rx * lat;
      pos[o + 1] = p.y[i] + up;
      pos[o + 2] = p.z[i] + rz * lat;
      uvC[(i * nv + j) * 2] = j / (nv - 1);
      uvC[(i * nv + j) * 2 + 1] = (i * DS) / 8;
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < nv - 1; j++) {
      const a = i * nv + j;
      const b = a + 1;
      const c = a + nv;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const gCasca = guardar(new THREE.BufferGeometry());
  gCasca.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  gCasca.setAttribute('uv', new THREE.BufferAttribute(uvC, 2));
  gCasca.setIndex(idx);
  gCasca.computeVertexNormals();
  const texC = guardar(texCalha(tema));
  texC.wrapT = THREE.RepeatWrapping;
  texC.anisotropy = 8;
  const mCasca = guardar(new THREE.MeshToonMaterial({ map: texC, gradientMap: motor.degraus, side: THREE.DoubleSide }));
  grupo.add(new THREE.Mesh(gCasca, mCasca));

  // ------------------------------------------------------------------ agua que corre
  const nw = 7;
  const aw = 0.66;
  const posA = new Float32Array(n * nw * 3);
  const uvA = new Float32Array(n * nw * 2);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < nw; j++) {
      const v = sup(p, i, -aw + (2 * aw * j) / (nw - 1), 0.08);
      const o = (i * nw + j) * 3;
      posA[o] = v.x;
      posA[o + 1] = v.y;
      posA[o + 2] = v.z;
      uvA[(i * nw + j) * 2] = j / (nw - 1);
      uvA[(i * nw + j) * 2 + 1] = (i * DS) / 9;
    }
  }
  const idxA = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < nw - 1; j++) {
      const a = i * nw + j;
      idxA.push(a, a + 1, a + nw, a + 1, a + nw + 1, a + nw);
    }
  }
  const gAgua = guardar(new THREE.BufferGeometry());
  gAgua.setAttribute('position', new THREE.BufferAttribute(posA, 3));
  gAgua.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
  gAgua.setIndex(idxA);
  const texCorr = guardar(texturaRepetida(tema.cinzaCorrenteza ? emCinza(arte.tex.correnteza) : arte.tex.correnteza, '#9feaf7'));
  texCorr.anisotropy = 8;
  const uAgua = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    mapa: { value: null }, cor: { value: new THREE.Color(tema.correnteza) }, off1: { value: new THREE.Vector2() },
    off2: { value: new THREE.Vector2() }, opac: { value: 0.9 },
  }]);
  uAgua.mapa.value = texCorr;
  const mAgua = guardar(new THREE.ShaderMaterial({
    uniforms: uAgua, vertexShader: VERT_AGUA, fragmentShader: FRAG_AGUA, fog: true,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const malhaAgua = new THREE.Mesh(gAgua, mAgua);
  malhaAgua.renderOrder = 1;
  grupo.add(malhaAgua);

  // ------------------------------------------------------------------ tuneis
  const posT = [];
  const idxT = [];
  /** @type {THREE.Matrix4[]} */
  const aneis = [];
  const ntv = 13;
  let base = -1;
  for (let i = 0; i < n; i++) {
    const tun = (p.tipo[i] & T.TUNEL) !== 0;
    if (!tun) {
      base = -1;
      continue;
    }
    const inicio = posT.length / 3;
    for (let j = 0; j < ntv; j++) {
      const a = ALFA_MAX + ((2 * Math.PI - 2 * ALFA_MAX) * j) / (ntv - 1);
      const v = sup(p, i, a);
      posT.push(v.x, v.y, v.z);
    }
    if (base >= 0) for (let j = 0; j < ntv - 1; j++) idxT.push(base + j, base + j + 1, inicio + j, base + j + 1, inicio + j + 1, inicio + j);
    base = inicio;
    if (i % 5 === 0) {
      const m = new THREE.Matrix4();
      const c = new THREE.Vector3(p.x[i], p.y[i] + p.raio[i], p.z[i]);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(p.hx[i], 0, p.hz[i]));
      m.compose(c, q, new THREE.Vector3(1, 1, 1));
      aneis.push(m);
    }
  }
  if (posT.length) {
    const g = guardar(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(posT, 3));
    g.setIndex(idxT);
    g.computeVertexNormals();
    const m = guardar(new THREE.MeshToonMaterial({ color: tema.tunel, gradientMap: motor.degraus, transparent: true, opacity: 0.26,
      side: THREE.DoubleSide, depthWrite: false }));
    const malha = new THREE.Mesh(g, m);
    malha.renderOrder = 2;
    grupo.add(malha);
    const gAnel = guardar(new THREE.TorusGeometry(p.raio[0] + 0.12, 0.16, 6, 20));
    const mAnel = guardar(new THREE.MeshToonMaterial({ color: tema.borda, gradientMap: motor.degraus }));
    const inst = new THREE.InstancedMesh(gAnel, mAnel, aneis.length);
    aneis.forEach((m2, k) => inst.setMatrixAt(k, m2));
    grupo.add(inst);
  }

  // ------------------------------------------------------------------ pilares
  const pilares = [];
  for (let i = p.iLargada + 4; i < n - 6; i += 9) {
    if (p.y[i] < 2.2) continue;
    pilares.push(i);
  }
  const gPilar = guardar(new THREE.CylinderGeometry(0.34, 0.5, 1, 8));
  const mPilar = guardar(new THREE.MeshToonMaterial({ color: tema.pilar, gradientMap: motor.degraus }));
  const instP = new THREE.InstancedMesh(gPilar, mPilar, pilares.length);
  pilares.forEach((i, k) => {
    const topo = p.y[i] - 0.05;
    const base0 = -2;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x[i], (topo + base0) / 2, p.z[i]), new THREE.Quaternion(),
      new THREE.Vector3(1, topo - base0, 1));
    instP.setMatrixAt(k, m);
  });
  grupo.add(instP);

  // ------------------------------------------------------------------ aneis de suporte, postes e porticos
  // referencias perto da camera: o olho mede a velocidade por eles
  {
    const R0 = p.raio[0];
    const eixoX = new THREE.Vector3();
    const eixoY = new THREE.Vector3();
    const eixoZ = new THREE.Vector3();
    const m = new THREE.Matrix4();
    /** base do tubo na amostra i: x = -direita, y = cima inclinado, z = tangente com declive */
    const base = (i) => {
      eixoZ.set(p.hx[i], p.inc[i], p.hz[i]).normalize();
      eixoX.set(p.hz[i], 0, -p.hx[i]);
      eixoY.crossVectors(eixoZ, eixoX).normalize();
      m.makeBasis(eixoX, eixoY, eixoZ);
      return m;
    };
    // aneis por fora da casca (meia volta, de borda a borda) a cada 6 m
    const gAnelS = guardar(new THREE.TorusGeometry(R0 + 0.16, 0.13, 4, 12, 2 * ALFA_MAX));
    gAnelS.rotateZ(-Math.PI / 2 - ALFA_MAX);
    const idsAnel = [];
    for (let i = p.iLargada + 2; i < n - 2; i += 3) if (!(p.tipo[i] & T.TUNEL)) idsAnel.push(i);
    const mSup = guardar(new THREE.MeshToonMaterial({ color: tema.pilar, gradientMap: motor.degraus }));
    const instA = new THREE.InstancedMesh(gAnelS, mSup, idsAnel.length);
    idsAnel.forEach((i, q) => {
      base(i).setPosition(p.x[i], p.y[i] + p.raio[i], p.z[i]);
      instA.setMatrixAt(q, m);
    });
    grupo.add(instA);
    // postes com luz na borda, alternando os lados, a cada 12 m
    const topoBorda = R0 * (1 - Math.cos(ALFA_MAX)) + 0.17;
    const latBorda = R0 * Math.sin(ALFA_MAX) + 0.3;
    const idsPoste = [];
    for (let i = p.iLargada + 3, q = 0; i < n - 4; i += 6, q++) if (!(p.tipo[i] & (T.TUNEL | T.ATALHO))) idsPoste.push([i, q % 2 ? 1 : -1]);
    const gPoste = guardar(new THREE.CylinderGeometry(0.07, 0.1, 2.6, 5));
    gPoste.translate(0, 1.3, 0);
    const gLuz = guardar(new THREE.SphereGeometry(0.26, 8, 6));
    gLuz.translate(0, 2.75, 0);
    const instP2 = new THREE.InstancedMesh(gPoste, mSup, idsPoste.length);
    const instL = new THREE.InstancedMesh(gLuz, guardar(new THREE.MeshBasicMaterial({ color: '#fff6c8' })), idsPoste.length);
    idsPoste.forEach(([i, lado], q) => {
      const lat = lado * latBorda;
      m.makeRotationY(Math.atan2(p.hx[i], p.hz[i])).setPosition(p.x[i] - p.hz[i] * lat, p.y[i] + topoBorda, p.z[i] + p.hx[i] * lat);
      instP2.setMatrixAt(q, m);
      instL.setMatrixAt(q, m);
    });
    grupo.add(instP2, instL);
    // porticos por cima a cada ~60 m (dois postes e uma barra listrada)
    const idsPort = [];
    for (let i = p.iLargada + 20; i < n - 30; i += 30) if (!(p.tipo[i] & (T.TUNEL | T.ATALHO | T.RAMPA))) idsPort.push(i);
    const altP = 6.2;
    const gPp = guardar(new THREE.CylinderGeometry(0.16, 0.2, altP, 6));
    gPp.translate(0, altP / 2, 0);
    const instPp = new THREE.InstancedMesh(gPp, mSup, idsPort.length * 2);
    const gBarra = guardar(new THREE.BoxGeometry(2 * latBorda + 0.6, 0.7, 0.45));
    const texB = guardar(texCanvas(128, 16, (g) => {
      for (let x = 0; x < 8; x++) {
        g.fillStyle = x % 2 ? '#ffffff' : '#e8413a';
        g.fillRect(x * 16, 0, 16, 16);
      }
    }));
    const instB = new THREE.InstancedMesh(gBarra, guardar(new THREE.MeshToonMaterial({ map: texB, gradientMap: motor.degraus })), idsPort.length);
    idsPort.forEach((i, q) => {
      const rot = Math.atan2(p.hx[i], p.hz[i]);
      for (const [lado, o] of [[-1, 0], [1, 1]]) {
        const lat = lado * (latBorda + 0.2);
        m.makeRotationY(rot).setPosition(p.x[i] - p.hz[i] * lat, p.y[i] + topoBorda, p.z[i] + p.hx[i] * lat);
        instPp.setMatrixAt(q * 2 + o, m);
      }
      m.makeRotationY(rot).setPosition(p.x[i], p.y[i] + topoBorda + altP - 0.35, p.z[i]);
      instB.setMatrixAt(q, m);
    });
    grupo.add(instPp, instB);
  }

  // ------------------------------------------------------------------ decalques (setas, alvo, turbo)
  const posD = { amarela: [], laranja: [], ciano: [], alvo: [] };
  const uvD = { amarela: [], laranja: [], ciano: [], alvo: [] };
  for (const at of p.atalhos) {
    const lado = at.dir;
    const grande = at.marcado ? 1.5 : 1;
    const qtd = at.marcado ? 5 : 3;
    for (let q = 0; q < qtd; q++) {
      const i = Math.max(1, at.i0 - (qtd - 1 - q) * 3);
      const a0 = lado * ALFA_MAX * (grande > 1 ? 0.22 : 0.34);
      const a1 = lado * ALFA_MAX * 0.92;
      const j0 = Math.max(0, i - 1);
      const j1 = Math.min(n - 1, i + 1);
      // u ao longo do tobogan, v subindo a parede (a seta aponta para a borda)
      const c = lado > 0
        ? [sup(p, j0, a0, 0.05), sup(p, j1, a0, 0.05), sup(p, j1, a1, 0.05), sup(p, j0, a1, 0.05)]
        : [sup(p, j1, a0, 0.05), sup(p, j0, a0, 0.05), sup(p, j0, a1, 0.05), sup(p, j1, a1, 0.05)];
      const cores = at.parede ? 'laranja' : 'amarela';
      quad(posD[cores], uvD[cores], c);
    }
    // alvo na pista de pouso
    const ip = Math.min(n - 2, at.iPouso + 5);
    const r = p.raio[ip] * 0.75;
    const e = (lat, ds) => {
      const i2 = Math.max(0, Math.min(n - 1, ip + Math.round(ds / DS)));
      const a = Math.asin(Math.max(-0.95, Math.min(0.95, lat / p.raio[i2])));
      return sup(p, i2, a, 0.1);
    };
    quad(posD.alvo, uvD.alvo, [e(-r, -r), e(r, -r), e(r, r), e(-r, r)].map((v, k) => v));
  }
  for (let i = 0; i < n - 1; i++) {
    if (!(p.tipo[i] & T.TURBO) || i % 2) continue;
    const e = (a, ds) => sup(p, Math.min(n - 1, i + ds), a, 0.1);
    // seta apontando para a frente: u de lado, v ao longo
    quad(posD.ciano, uvD.ciano, [e(-0.45, 0), e(0.45, 0), e(0.45, 1), e(-0.45, 1)]);
  }
  // rampa final: setas amarelas subindo ate o labio
  for (let i = Math.max(0, p.iFinal - 6); i < n - 1; i += 2) {
    const e = (a, ds) => sup(p, Math.min(n - 1, i + ds), a, 0.1);
    quad(posD.amarela, uvD.amarela, [e(-0.55, 0), e(0.55, 0), e(0.55, 1), e(-0.55, 1)]);
  }
  const texturas = {
    amarela: guardar(texSeta('#ffd23f')), laranja: guardar(texSeta('#ff5a2a')), ciano: guardar(texSeta('#5ff7ff')), alvo: guardar(texAlvo()),
  };
  for (const k of /** @type {(keyof typeof posD)[]} */ (Object.keys(posD))) {
    if (!posD[k].length) continue;
    const g = guardar(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(posD[k], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvD[k], 2));
    const m = guardar(new THREE.MeshBasicMaterial({ map: texturas[k], transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, blending: k === 'ciano' ? THREE.AdditiveBlending : THREE.NormalBlending }));
    const malha = new THREE.Mesh(g, m);
    malha.renderOrder = 3;
    grupo.add(malha);
  }

  // ------------------------------------------------------------------ rampas de salto
  if (p.rampas.length) {
    const posR = [];
    const uvR = [];
    for (const ir of p.rampas) {
      const i0 = Math.max(0, ir - 2);
      const w = 0.62;
      const ini = (a) => sup(p, i0, a * w, 0.02);
      const fim = (a, h) => sup(p, ir, a * w, 0.02).add(new THREE.Vector3(0, h, 0));
      quad(posR, uvR, [ini(-1), ini(1), fim(1, 1.1), fim(-1, 1.1)]);
      quad(posR, uvR, [fim(-1, 0), fim(1, 0), fim(1, 1.1), fim(-1, 1.1)]);
    }
    const g = guardar(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(posR, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvR, 2));
    g.computeVertexNormals();
    const m = guardar(new THREE.MeshToonMaterial({ map: guardar(texRampa()), gradientMap: motor.degraus, side: THREE.DoubleSide }));
    grupo.add(new THREE.Mesh(g, m));
  }

  // ------------------------------------------------------------------ torre de largada
  {
    const i = Math.floor(p.iLargada / 2);
    const R = p.raio[0];
    const torre = new THREE.Group();
    torre.position.set(p.x[i], 0, p.z[i]);
    torre.rotation.y = Math.atan2(p.hx[i], p.hz[i]);
    const yTopo = p.y[i] - 0.3;
    const mTorre = guardar(new THREE.MeshToonMaterial({ color: tema.pilar, gradientMap: motor.degraus }));
    const mListra = guardar(new THREE.MeshToonMaterial({ color: tema.calha, gradientMap: motor.degraus }));
    const plat = new THREE.Mesh(guardar(new THREE.BoxGeometry(2 * R + 3, 1.2, p.iLargada * DS + 6)), mListra);
    plat.position.y = yTopo - 0.6;
    torre.add(plat);
    const gPerna = guardar(new THREE.CylinderGeometry(0.6, 0.8, 1, 8));
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const perna = new THREE.Mesh(gPerna, mTorre);
      perna.scale.y = yTopo + 2;
      perna.position.set(px * (R + 1), (yTopo - 2) / 2, pz * (p.iLargada * DS * 0.4));
      torre.add(perna);
    }
    // toldo listrado
    const gToldo = guardar(new THREE.ConeGeometry(R + 4, 3.2, 12, 1, true));
    const corT = [];
    const pt = gToldo.getAttribute('position');
    for (let v = 0; v < pt.count; v++) {
      const ang = Math.atan2(pt.getZ(v), pt.getX(v));
      const c = new THREE.Color(Math.floor(((ang + Math.PI) / (2 * Math.PI)) * 12 + 0.5) % 2 ? '#ffffff' : tema.calha);
      corT.push(c.r, c.g, c.b);
    }
    gToldo.setAttribute('color', new THREE.Float32BufferAttribute(corT, 3));
    const toldo = new THREE.Mesh(gToldo, guardar(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: motor.degraus, side: THREE.DoubleSide })));
    toldo.position.set(0, yTopo + 10.5, -p.iLargada * DS * 0.25);
    torre.add(toldo);
    const gPoste = guardar(new THREE.CylinderGeometry(0.18, 0.18, 9.4, 6));
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const poste = new THREE.Mesh(gPoste, mTorre);
      poste.position.set(px * (R + 1.4), yTopo + 4.6, -p.iLargada * DS * 0.25 + pz * (R + 1.4));
      torre.add(poste);
    }
    grupo.add(torre);
  }

  // ------------------------------------------------------------------ chegada (labio) e piscina do pouso
  const iF = n - 1;
  const hx = p.hx[iF];
  const hz = p.hz[iF];
  const PI = RAMPA_FINAL.piscina;
  const meioL = (PI.fim - PI.ini) / 2;
  const centroPiscina = new THREE.Vector3(p.x[iF] + hx * (PI.ini + meioL), MANOBRA.agua, p.z[iF] + hz * (PI.ini + meioL));
  // geometria no plano: x de lado, y ao longo do salto -> deitada e girada para o rumo do labio
  const deitar = (/** @type {THREE.BufferGeometry} */ g, /** @type {number} */ y) => {
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.atan2(-hx, -hz));
    g.translate(centroPiscina.x, y, centroPiscina.z);
    return g;
  };
  {
    const areia = guardar(texturaRepetida(tema.cinza ? emCinza(arte.tex.areia) : arte.tex.areia, '#f6d8a0'));
    areia.repeat.set(1 / 14, 1 / 14);
    const ilha = new THREE.Mesh(guardar(deitar(new THREE.ExtrudeGeometry(estadio(meioL + 9, PI.meia + 9, PI.meia + 8), { depth: 1.6, bevelEnabled: false, curveSegments: 16 }), -1.3)),
      guardar(new THREE.MeshToonMaterial({ map: areia, color: tema.areia, gradientMap: motor.degraus })));
    grupo.add(ilha);
    const texP = guardar(texturaRepetida(tema.cinza ? emCinza(arte.tex.agua) : arte.tex.agua, '#7fe3f0'));
    texP.repeat.set(1 / 16, 1 / 16);
    const agua = new THREE.Mesh(guardar(deitar(new THREE.ShapeGeometry(estadio(meioL, PI.meia, PI.meia - 1), 24), MANOBRA.agua)),
      guardar(new THREE.MeshBasicMaterial({ map: texP, color: tema.piscina })));
    grupo.add(agua);
    // faixas de raia ao longo (o olho mede a distancia do salto)
    const faixas = [];
    for (const lat of [-PI.meia * 0.5, 0, PI.meia * 0.5]) {
      const f = new THREE.PlaneGeometry(0.5, (meioL - 8) * 2);
      f.translate(lat, 0, 0);
      faixas.push(f);
    }
    const gF = guardar(deitar(mesclar(faixas), MANOBRA.agua + 0.02));
    grupo.add(new THREE.Mesh(gF, guardar(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }))));
    // borda branca em volta
    const anel = estadio(meioL + 1.3, PI.meia + 1.3, PI.meia + 0.3);
    anel.holes.push(estadio(meioL, PI.meia, PI.meia - 1));
    const borda = new THREE.Mesh(guardar(deitar(new THREE.ExtrudeGeometry(anel, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.18, bevelSegments: 2, curveSegments: 20 }), MANOBRA.agua - 0.1)),
      guardar(new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: motor.degraus })));
    grupo.add(borda);
    // portal de chegada no labio da rampa (xadrez, sem texto): a chegada conta aqui
    const R = p.raio[iF];
    const portal = new THREE.Group();
    portal.position.set(p.x[iF], p.y[iF], p.z[iF]);
    portal.rotation.y = Math.atan2(hx, hz);
    const mPoste = guardar(new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: motor.degraus }));
    for (const lado of [-1, 1]) {
      const poste = new THREE.Mesh(guardar(new THREE.CylinderGeometry(0.22, 0.22, 8, 8)), mPoste);
      poste.position.set(lado * (R + 0.9), 3.6, 0);
      portal.add(poste);
    }
    const faixa = new THREE.Mesh(guardar(new THREE.PlaneGeometry(2 * R + 2.2, 1.3)),
      guardar(new THREE.MeshBasicMaterial({ map: guardar(texXadrez()), side: THREE.DoubleSide })));
    faixa.position.y = 7.2;
    portal.add(faixa);
    grupo.add(portal);
  }

  // a agua corre tobogan abaixo mais rapido que o jogador: UV = velocidade dele + fluxo proprio
  let acum1 = 0;
  let acum2 = 0;
  return {
    grupo,
    centroPiscina,
    raioPiscina: PI.meia,
    /** @param {number} dt @param {number} vJog velocidade do jogador na calha (m/s) */
    atualizar(dt, vJog) {
      acum1 = (acum1 + ((vJog + FLUXO) * dt) / 9) % 1;
      acum2 = (acum2 + ((vJog + FLUXO * 1.6) * dt) / (9 / 0.35)) % 1;
      uAgua.off1.value.y = -acum1;
      uAgua.off2.value.y = -acum2;
    },
    descartar() {
      for (const f of descartar) f();
    },
  };
}
/** @typedef {ReturnType<typeof criarTobogan>} Tobogan */
