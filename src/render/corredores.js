// [Flume Frenzy] Desenho dos corredores: boia de tras, personagem e boia da frente (a borda de perto
// da boia cobre a cintura do bicho), em billboard esferico com o giro da parede da calha. O angulo do
// sprite (de costas, costas-esquerda, costas-direita) sai do rumo do corredor em relacao a camera.
// Mais a espuma de rastro, a sombra em bolha e as moedas do evento.
//
// 2.0.0 (sem tremor): posicao, rumo e angulo na calha interpolados entre o passo anterior e o atual
// (fracao `alfa` do laco); troca de angulo do sprite com histerese; giro suavizado; quem passa colado na
// camera encolhe e some aos poucos (antes sumia de um quadro para o outro). Nada e alocado por quadro.
//
// 3.1.0 (manobras): no voo final boia e bicho giram juntos em volta do meio do corpo. Com a camera de lado, o
// mortal e um giro na tela; o giro (360) estreita e espelha o sprite e troca para o angulo de lado; o superman
// solta a boia (fica para tras) e deita o bicho com a cabeca para a frente. Na piscina, quem caiu afunda e boia.
import * as THREE from 'three';
import { DS } from '../jogo/constantes.js';
import { MANOBRA } from '../jogo/manobras.js';
import { celulaPers, ICONE } from './arte.js';
import { criarBillboards } from './billboard.js';

const TAM_BOIA = 2.1;
const TAM_PERS = 1.75;
/** fracao da celula da boia que forma a borda de perto (a parte de baixo da imagem) */
const FRENTE = 0.36;
/** histerese do angulo do sprite: entra de lado acima de ENTRA, volta de costas abaixo de SAI */
const ENTRA = 0.3;
const SAI = 0.16;

function texSombraEspuma() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  // celula 0: espuma (branca, macia, com gotas)
  let gr = g.createRadialGradient(64, 76, 4, 64, 76, 58);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)');
  gr.addColorStop(0.6, 'rgba(235,252,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(64, 80, 60, 40, 0, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI;
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(64 + Math.cos(a) * 52, 70 - Math.sin(a) * 40, 4 + (i % 3) * 2, 0, Math.PI * 2);
    g.fill();
  }
  // celula 1: sombra
  gr = g.createRadialGradient(192, 64, 2, 192, 64, 60);
  gr.addColorStop(0, 'rgba(10,40,60,0.55)');
  gr.addColorStop(1, 'rgba(10,40,60,0)');
  g.fillStyle = gr;
  g.fillRect(128, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {import('./arte.js').Arte} arte
 * @param {number} max corredores
 */
export function criarDesenhoCorredores(arte, max) {
  const grupo = new THREE.Group();
  const pers = criarBillboards(arte.atlasPers.textura, max, { nevoa: true, corte: 0.45 });
  const boias = criarBillboards(arte.atlasBoias.textura, max * 2, { nevoa: true, corte: 0.45 });
  const texSE = texSombraEspuma();
  const espuma = criarBillboards(texSE, max, { transparente: true, corte: 0.02 });
  const moedas = criarBillboards(arte.atlasIcones.textura, 400, { corte: 0.45 });
  pers.malha.renderOrder = 4;
  boias.malha.renderOrder = 4;
  espuma.malha.renderOrder = 5;
  grupo.add(pers.malha, boias.malha, espuma.malha, moedas.malha);
  const celEspuma = { u0: 0, v0: 0, du: 0.5, dv: 1 };

  // sombras: decalques chatos (InstancedMesh) deitados na superficie
  const gSombra = new THREE.PlaneGeometry(1, 1);
  gSombra.rotateX(-Math.PI / 2);
  const uvS = gSombra.getAttribute('uv');
  for (let i = 0; i < uvS.count; i++) uvS.setX(i, 0.5 + uvS.getX(i) * 0.5);
  const mSombra = new THREE.MeshBasicMaterial({ map: texSE, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const sombras = new THREE.InstancedMesh(gSombra, mSombra, max);
  sombras.frustumCulled = false;
  sombras.renderOrder = 3;
  grupo.add(sombras);

  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const esc = new THREE.Vector3();
  const cimaMundo = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  /** posicoes de desenho (interpoladas), para rotulos e camera, por id */
  const pos = Array.from({ length: max }, () => new THREE.Vector3());
  /** s interpolado por id (camera) */
  const sDesenho = new Float64Array(max);
  const visivel = new Array(max).fill(false);
  /** estado de desenho por corredor: angulo do sprite (histerese) e giro suavizado */
  const angSprite = new Int8Array(max);
  const giroS = new Float64Array(max);
  const giroIni = new Uint8Array(max);

  /**
   * Boia e bicho numa manobra do voo final: os dois giram juntos em volta do meio do corpo (no plano da tela).
   * @param {import('../jogo/corrida.js').Corredor} k
   * @param {number} x @param {number} y @param {number} z pe (interpolado)
   * @param {number} hx @param {number} hz rumo
   * @param {number} giro giro base do sprite @param {number} ang angulo do sprite (0 costas, 1, 2 de lado)
   * @param {number} tamB @param {number} tamP @param {number} assento
   * @param {import('./arte.js').Celula} cb celula da boia @param {number} fade
   * @param {THREE.PerspectiveCamera} camera
   */
  function desenharManobra(k, x, y, z, hx, hz, giro, ang, tamB, tamP, assento, cb, fade, camera) {
    const m = /** @type {import('../jogo/manobras.js').EstadoManobras} */ (k.man);
    // sentido da frente na tela: o mortal (para tras) gira a cabeca para tras
    v1.set(x, y, z).project(camera);
    v2.set(x + hx * 3, y, z + hz * 3).project(camera);
    const fs = v2.x >= v1.x ? 1 : -1;
    const rot = giro + m.m * fs;
    // giro (360): estreita e espelha; de lado troca para o angulo de lado
    const cg = Math.cos(m.g);
    const sg = Math.sin(m.g);
    let angG = ang;
    let larg;
    if (Math.abs(sg) > 0.72) {
      angG = sg > 0 ? 1 : 2;
      larg = 0.78 + 0.22 * Math.abs(sg);
    } else larg = (cg < 0 ? -1 : 1) * (0.35 + 0.65 * Math.abs(cg));
    const pose = m.pose;
    const hc = assento + tamP * 0.42;
    // eixos da camera no mundo (direita e cima da tela)
    const e = camera.matrixWorld.elements;
    const cxw = x + e[4] * hc;
    const cyw = y + e[5] * hc;
    const czw = z + e[6] * hc;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    // deslocamento (na tela, relativo ao meio do corpo) -> ponto do mundo, girado junto com o corpo
    const por = (/** @type {any} */ b, /** @type {number} */ ox, /** @type {number} */ oy, /** @type {number} */ w, /** @type {number} */ h,
      /** @type {any} */ cel, /** @type {number} */ r, /** @type {number} */ desloc, /** @type {number} */ corta) => {
      const rx = ox * cs - oy * sn;
      const ry = ox * sn + oy * cs;
      b.por(cxw + e[0] * rx + e[4] * ry, cyw + e[1] * rx + e[5] * ry, czw + e[2] * rx + e[6] * ry, w, h, cel, r, desloc, corta, fade);
    };
    // superman: a boia fica para tras (e inclina), o bicho vai para a frente e deita com a cabeca adiante
    const rotB = rot + fs * 0.5 * pose;
    por(boias, -fs * 0.6 * pose, -hc + 0.2 * pose, tamB * larg, tamB, cb, rotB, -0.25, 1);
    const cp = arte.atlasPers.celulas[celulaPers(k.personagem, angG)];
    por(pers, fs * 0.8 * pose, assento - hc - 0.1 * pose, tamP * larg * (1 + 0.12 * pose), tamP * (1 + 0.12 * pose), cp, rot - fs * (Math.PI / 2) * pose, 0, 1);
    if (pose < 0.5) por(boias, -fs * 0.6 * pose, -hc + 0.2 * pose, tamB * larg, tamB, cb, rotB, 0.25, FRENTE);
  }

  /**
   * @param {import('../jogo/corrida.js').Corrida} c
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} t tempo (balanco)
   * @param {import('../jogo/corrida.js').Corredor} jogador
   * @param {number} a fracao de interpolacao (0..1)
   * @param {number} dt s de desenho
   */
  function atualizar(c, camera, t, jogador, a, dt) {
    pers.limpar();
    boias.limpar();
    espuma.limpar();
    const p = c.pista;
    const fx = -camera.matrixWorld.elements[8];
    const fz = -camera.matrixWorld.elements[10];
    const fl = Math.hypot(fx, fz) || 1;
    const dirX = -fz / fl;
    const dirZ = fx / fl;
    const kg = Math.min(1, dt * 14);
    let ns = 0;
    for (const k of c.corredores) {
      visivel[k.id] = false;
      if (k.estado === 'fora') continue;
      // interpolacao entre o passo anterior e o atual (teletransporte: sem interpolar)
      const f = k.salto ? 1 : a;
      let x = k.px + (k.x - k.px) * f;
      let y = k.py + (k.y - k.py) * f;
      let z = k.pz + (k.z - k.pz) * f;
      const hx = k.phx + (k.hx - k.phx) * f;
      const hz = k.phz + (k.hz - k.phz) * f;
      const alfa = k.palfa + (k.alfa - k.palfa) * f;
      sDesenho[k.id] = k.ps + (k.s - k.ps) * f;
      // normal da superficie (o "para cima" do corredor)
      if (k.estado === 'calha' || k.estado === 'pronto') {
        const i = Math.min(p.n - 1, Math.round(sDesenho[k.id] / DS));
        const rx = -p.hz[i];
        const rz = p.hx[i];
        normal.set(-rx * Math.sin(alfa), Math.cos(alfa), -rz * Math.sin(alfa));
      } else normal.copy(cimaMundo);
      if (k.estado === 'chegou') {
        // mergulhou na piscina: afunda um pouco e volta boiando
        const afunda = Math.max(0, 1 - k.tEstado * 1.6);
        y = MANOBRA.agua - 0.3 - 1.1 * afunda * afunda + Math.sin(t * 2 + k.id) * 0.06;
      } else if (k.estado === 'agua') {
        y = -Math.min(1.4, k.tEstado * 1.6);
      }
      pos[k.id].set(x, y, z);
      // quem esta atras do jogador e colado na camera encolhe aos poucos (nada de sumir de repente)
      let escala = 1;
      if (k !== jogador) {
        const dc = Math.sqrt((x - camera.position.x) ** 2 + (y - camera.position.y) ** 2 + (z - camera.position.z) ** 2);
        // atras do jogador (entre ele e a camera) some antes; na frente, so colado na lente
        const atras = sDesenho[k.id] < sDesenho[jogador.id] - 0.5;
        const ini = atras ? 4.5 : 3;
        const fim = atras ? 12 : 7;
        if (dc < fim) escala = Math.max(0, Math.min(1, (dc - ini) / (fim - ini)));
        if (escala <= 0.02) continue;
      }
      visivel[k.id] = true;
      // giro: a normal projetada na tela, suavizado
      v1.set(x, y, z).project(camera);
      v2.set(x + normal.x * 2, y + normal.y * 2, z + normal.z * 2).project(camera);
      const giroAlvo = v1.z < 1 && v2.z < 1 ? -Math.atan2((v2.x - v1.x) * camera.aspect, v2.y - v1.y) : 0;
      if (!giroIni[k.id] || k.salto) {
        giroS[k.id] = giroAlvo;
        giroIni[k.id] = 1;
      } else giroS[k.id] += (giroAlvo - giroS[k.id]) * kg;
      const giro = giroS[k.id];
      // angulo do sprite pelo rumo em relacao a camera, com histerese
      const lado = hx * dirX + hz * dirZ;
      let ang = angSprite[k.id];
      if (ang === 0) ang = lado > ENTRA ? 1 : lado < -ENTRA ? 2 : 0;
      else if (ang === 1 && lado < SAI) ang = lado < -ENTRA ? 2 : 0;
      else if (ang === 2 && lado > -SAI) ang = lado > ENTRA ? 1 : 0;
      angSprite[k.id] = ang;
      // pe da boia na superficie; o personagem senta no furo
      const cb = arte.atlasBoias.celulas[k.boia];
      // perto da camera: some pontilhado e encolhe so um pouco (nada de boneco minusculo)
      const fade = escala;
      const enc = 0.85 + 0.15 * escala;
      const tamB = TAM_BOIA * k.peso * enc;
      const tamP = TAM_PERS * k.peso * enc;
      const assento = tamB * cb.alt * 0.42;
      if (k.man && k.final && k.estado === 'ar') {
        desenharManobra(k, x, y, z, hx, hz, giro, ang, tamB, tamP, assento, cb, fade, camera);
      } else {
        boias.por(x, y, z, tamB, tamB, cb, giro, -0.25, 1, fade);
        const cp = arte.atlasPers.celulas[celulaPers(k.personagem, ang)];
        pers.por(x + normal.x * assento, y + normal.y * assento, z + normal.z * assento, tamP, tamP, cp, giro, 0, 1, fade);
        boias.por(x, y, z, tamB, tamB, cb, giro, 0.25, FRENTE, fade);
      }
      if ((k.estado === 'calha' && k.v > 6) || k.estado === 'chegou') {
        const e = (k === jogador ? 2.6 : 2) * k.peso * enc * escala * (0.85 + Math.sin(t * 17 + k.id) * 0.08);
        espuma.por(x, y - 0.25, z, e, e * 0.75, celEspuma, giro, -0.6);
      }
      // sombra
      if (k.estado !== 'agua') {
        const ys = k.estado === 'ar' ? (k.final ? MANOBRA.agua + 0.04 : Math.max(0.05, y - 30)) : y + 0.06;
        q.setFromUnitVectors(cimaMundo, k.estado === 'ar' ? cimaMundo : normal);
        const sm = (k.estado === 'ar' ? 1.8 : 2) * k.peso * enc * escala;
        m4.compose(v1.set(x, ys, z), q, esc.set(sm, 1, sm));
        sombras.setMatrixAt(ns++, m4);
      }
    }
    sombras.count = ns;
    sombras.instanceMatrix.needsUpdate = true;
    pers.fechar();
    boias.fechar();
    espuma.fechar();
    // moedas do evento
    moedas.limpar();
    if (c.moedas.length) {
      const cm = arte.atlasIcones.celulas[ICONE.moeda];
      for (let j = 0; j < c.moedas.length; j++) {
        const m = c.moedas[j];
        if (m.pega) continue;
        const i = Math.min(p.n - 1, Math.round(m.s / DS));
        const lat = m.u * p.raio[i] * 0.9;
        const giroM = Math.abs(Math.cos(t * 3 + j * 0.7));
        moedas.por(p.x[i] - p.hz[i] * lat, p.y[i] + 0.9 + Math.sin(t * 3 + j) * 0.1, p.z[i] + p.hx[i] * lat, 1.3 * Math.max(0.15, giroM), 1.3, cm);
      }
    }
    moedas.fechar();
  }

  return {
    grupo,
    atualizar,
    pos,
    sDesenho,
    visivel,
    /** a rodada nova comeca sem estado de desenho antigo */
    reiniciar() {
      angSprite.fill(0);
      giroIni.fill(0);
    },
    descartar() {
      pers.descartar();
      boias.descartar();
      espuma.descartar();
      moedas.descartar();
      gSombra.dispose();
      mSombra.dispose();
      texSE.dispose();
    },
  };
}
