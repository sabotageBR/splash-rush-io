// [Flume Frenzy] Gerador do tobogan, puro e deterministico pela semente.
//
// O tobogan e uma polilinha de amostras a cada DS metros (horizontais). Cada amostra guarda o fundo da
// calha (x, y, z), o rumo horizontal (hx, hz), o declive (inc, negativo descendo), a curvatura de rumo
// (k, rad/m, positivo = vira a esquerda), o raio da calha e um tipo (bits de T).
//
// Convencao: y para cima; rumo h = (sin t, 0, cos t); direita = (-hz, 0, hx); t crescente vira a
// esquerda. Na calha, a posicao lateral u vai de -1 (borda esquerda) a +1 (borda direita).
//
// Modulos: largada (plataforma + queda), reta, ondas (S), curva, tunel (S fechado), rampa, turbo, queda
// (despenca e sobe um pouco), atalho e chegada. O ATALHO e um desvio em quatro curvas de 90 graus que volta
// para a mesma linha la na frente e mais abaixo: quem sai voando pela borda de fora da primeira curva (a mais
// fechada, de raio R1) segue reto e pousa na pista de pouso, pulando o desvio. As outras tres curvas (raio
// R2) dao para segurar corrigindo. A queda do desvio e calculada para o voo na velocidade de projeto caber.
//
// 3.0.0: curvas maiores (a velocidade subiu) e quedas de verdade no perfil (ganho forte na descida).
// 3.1.0: a CHEGADA e uma rampa grande: uma reta de embalo que desce e uma rampa que sobe e lanca todo mundo
// alto no ar sobre a piscina (o voo das manobras). A chegada conta na borda da rampa (labio).
import { criarRng } from '../core/rng.js';
import { DS, RAIO, ALFA_MAX, ALTURA_FIM, FISICA, alturaBorda } from './constantes.js';

export const T = Object.freeze({
  TUNEL: 1, RAMPA: 2, TURBO: 4, ATALHO: 8, PAREDE: 16, POUSO: 32, LARGADA: 64, CHEGADA: 128, DESVIO: 256, FINAL: 512,
});

/** Rampa final: comprimento da reta de embalo e da rampa (m), o declive que a rampa busca (sobe) e a piscina
 * do pouso (m a partir do labio, ao longo do rumo: comeco e fim; meia largura de lado). */
export const RAMPA_FINAL = Object.freeze({ embalo: 30, incEmbalo: -0.14, rampa: 12, incRampa: 0.75,
  piscina: Object.freeze({ ini: 3, fim: 150, meia: 30 }) });

const GRAU = Math.PI / 180;
/** Raio da curva de decolagem do atalho (fechada: sem corrigir, voa) e das outras curvas do desvio (m). */
const R1 = 16;
const R2 = 24;
/** Celula da grade espacial (m). */
const CELULA = 12;

/**
 * @typedef {object} Atalho
 * @property {number} i0 amostra onde a curva de decolagem comeca
 * @property {number} i1 fim da zona de decolagem
 * @property {number} iPouso comeco da pista de pouso
 * @property {number} dir +1 primeira curva para a esquerda (decola pela direita), -1 o contrario
 * @property {number} pulo metros de tobogan que o voo pula
 * @property {boolean} marcado setas de "voe" (atalho ensinado)
 * @property {boolean} parede tem rampa de parede na borda de fora
 */

/**
 * @typedef {object} Pista
 * @property {number} n
 * @property {number} comprimento m (horizontal)
 * @property {Float64Array} x
 * @property {Float64Array} y
 * @property {Float64Array} z
 * @property {Float64Array} hx
 * @property {Float64Array} hz
 * @property {Float64Array} inc
 * @property {Float64Array} k
 * @property {Float64Array} raio
 * @property {Int32Array} tipo
 * @property {Atalho[]} atalhos
 * @property {number[]} rampas amostras onde a rampa de salto lanca
 * @property {number} iLargada fim da plataforma de largada
 * @property {number} iFinal comeco da rampa final (fundo da reta de embalo)
 * @property {Map<number, number[]>} grade
 * @property {number} vmax
 */

/**
 * @typedef {object} Modulo
 * @property {string} tipo largada | reta | ondas | curva | tunel | rampa | turbo | atalho | chegada
 * @property {number} [len]
 * @property {boolean} [marcado]
 * @property {boolean} [parede]
 * @property {number} [raio] curva com raio fixo (m)
 * @property {number} [ang] curva com angulo fixo (graus)
 */

function construtor() {
  /** @type {number[]} */ const k = [];
  /** @type {number[]} */ const alvo = [];
  /** @type {number[]} */ const tipo = [];
  /** @type {number[]} */ const raio = [];
  /** @type {number[]} */ const desvio = [];
  let rumo = 0;
  /**
   * @param {number} len m @param {number} curv rad/m @param {number} inc declive alvo
   * @param {number} [flags] @param {number} [d] id do desvio (-1 nenhum) @param {number} [r] raio
   */
  const add = (len, curv, inc, flags = 0, d = -1, r = RAIO) => {
    const n = Math.max(1, Math.round(len / DS));
    for (let j = 0; j < n; j++) {
      k.push(curv); alvo.push(inc); tipo.push(flags); raio.push(r); desvio.push(d);
    }
    rumo += curv * n * DS;
    return n;
  };
  /** arco com o angulo exato (a curvatura absorve o arredondamento do numero de amostras) */
  const arco = (ang, r, dir, inc, flags = 0, d = -1) => {
    const n = Math.max(1, Math.round((ang * r) / DS));
    return add(n * DS, (dir * ang) / (n * DS), inc, flags, d);
  };
  return { k, alvo, tipo, raio, desvio, add, arco, get n() { return k.length; }, get rumo() { return rumo; } };
}

/**
 * Curvatura amostra a amostra de uma curva de angulo `ang` e raio `r` (n amostras de DS). Suave: a curvatura
 * sobe e desce em rampa (clotoide) nas pontas, com o mesmo angulo total.
 * @param {number} ang @param {number} r @param {number} dir @param {boolean} suave
 */
function curvaturas(ang, r, dir, suave) {
  const n = Math.max(1, Math.round((ang * r) / DS));
  const m = suave ? Math.min(5, Math.floor(n / 3)) : 0;
  const w = [];
  for (let j = 0; j < n; j++) w.push(m ? Math.min(1, (j + 0.5) / m, (n - j - 0.5) / m) : 1);
  const soma = w.reduce((x, y) => x + y, 0);
  return w.map((x) => (dir * ang * x) / (DS * soma));
}

/** @param {number} n */
const zeros = (n) => new Array(Math.max(0, n)).fill(0);

/**
 * Deslocamento lateral (perpendicular ao rumo inicial) depois de uma sequencia de curvaturas, integrada como o
 * gerador integra (ponto medio).
 * @param {number[]} ks
 */
function lateralFinal(ks) {
  let th = 0;
  let x = 0;
  for (const kc of ks) {
    x += DS * Math.sin(th + (kc * DS) / 2);
    th += kc * DS;
  }
  return x;
}

/** Lado da proxima curva: puxa o rumo de volta para perto de zero (o tobogan nao da volta em si). */
function lado(rumo, r) {
  if (rumo > 0.35) return -1;
  if (rumo < -0.35) return 1;
  return r() < 0.5 ? 1 : -1;
}

/**
 * Gera o tobogan.
 * @param {{ semente: number, modulos: Modulo[], vmax: number }} cfg
 * @returns {Pista}
 */
export function gerarPista(cfg) {
  const r = criarRng(cfg.semente);
  const b = construtor();
  const inc0 = -0.08;
  /** @type {{ i0: number, i1: number, iPouso: number, dir: number, marcado: boolean, parede: boolean, id: number }[]} */
  const desvios = [];
  /** @type {number[]} */
  const rampas = [];
  let iLargada = 0;
  let iFinal = -1;

  let anterior = '';
  for (const m of cfg.modulos) {
    const tipoAntes = anterior;
    anterior = m.tipo;
    switch (m.tipo) {
      case 'largada':
        iLargada = b.n + b.add(26, 0, -0.015, T.LARGADA) - 1;
        b.add(30, 0, -0.4);
        b.add(12, 0, -0.16);
        break;
      case 'reta':
        b.add(m.len || 40, 0, inc0 - r() * 0.02);
        break;
      case 'ondas': {
        const ang = (30 + r() * 24) * GRAU;
        const raio = 52 + r() * 24;
        const d = lado(b.rumo, r);
        b.arco(ang, raio, d, inc0);
        b.add(6, 0, inc0);
        b.arco(ang, raio, -d, inc0);
        break;
      }
      case 'curva': {
        const ang = (m.ang ?? 55 + r() * 35) * GRAU;
        // depois de uma queda chega-se mais rapido: a curva abre um pouco
        const raio = (m.raio ?? 28 + r() * 12) + (tipoAntes === 'queda' ? 8 : 0);
        b.arco(ang, raio, lado(b.rumo, r), inc0 - 0.01);
        break;
      }
      case 'tunel': {
        const d = lado(b.rumo, r);
        b.add(6, 0, -0.1);
        b.arco(32 * GRAU, 56, d, -0.11, T.TUNEL);
        b.add(10, 0, -0.11, T.TUNEL);
        b.arco(32 * GRAU, 56, -d, -0.11, T.TUNEL);
        b.add(6, 0, -0.1);
        break;
      }
      case 'rampa':
        b.add(16, 0, -0.1);
        b.add(4, 0, -0.1, T.RAMPA);
        rampas.push(b.n - 1);
        // reta de pouso do tamanho do salto (cresce com o quadrado da velocidade)
        b.add(40 + 0.07 * cfg.vmax * cfg.vmax, 0, -0.1);
        break;
      case 'queda':
        // despenca (ganho forte), depois sobe um pouco (perde) e volta ao normal
        b.add(8, 0, inc0);
        b.add(24 + r() * 12, 0, -0.34 - r() * 0.06);
        b.add(16, 0, 0.07);
        b.add(10, 0, inc0);
        break;
      case 'turbo':
        b.add(10, 0, -0.08);
        b.add(10, 0, -0.08, T.TURBO);
        b.add(24, 0, -0.08);
        break;
      case 'atalho': {
        const id = desvios.length;
        const dir = r() < 0.5 ? 1 : -1;
        const a = 30 + r() * 12;
        const bb = 8 + r() * 6;
        // reta de aproximacao (mais longa logo depois de outro atalho: quem pousa longe ainda se ajeita)
        b.add(tipoAntes === 'atalho' ? 80 : 46, 0, inc0);
        const i0 = b.n;
        const zona = 7;
        // curva de decolagem: arco seco de raio R1 (a centrifuga chega de uma vez: sem corrigir, voa)
        const k1 = curvaturas(Math.PI / 2, R1, dir, false);
        // as outras tres entram e saem suaves (da para segurar corrigindo); a perna de volta (a2) fecha o
        // desvio na mesma linha: calcula o desvio lateral sem ela e acha o comprimento que zera
        const k2 = curvaturas(Math.PI / 2, R2, -dir, true);
        const k4 = curvaturas(Math.PI / 2, R2, dir, true);
        const nA = Math.max(1, Math.round(a / DS));
        const nB = Math.max(1, Math.round(bb / DS));
        const semA2 = [...k1, ...zeros(nA), ...k2, ...zeros(nB), ...k2, ...k4];
        const lat0 = lateralFinal(semA2);
        const nA2 = Math.max(1, Math.round((lat0 * dir) / DS));
        k1.forEach((kc, j) => {
          let f = T.DESVIO;
          if (j < zona) f |= T.ATALHO;
          if (m.parede && j >= 1 && j <= 3) f |= T.PAREDE;
          b.add(DS, kc, inc0, f, id);
        });
        const resto = [...zeros(nA), ...k2, ...zeros(nB), ...k2, ...zeros(nA2), ...k4];
        for (const kc of resto) b.add(DS, kc, inc0, T.DESVIO, id);
        const iPouso = b.n;
        b.add(76, 0, inc0, T.POUSO);
        desvios.push({ i0, i1: i0 + zona - 1, iPouso, dir, marcado: !!m.marcado, parede: !!m.parede, id });
        break;
      }
      case 'chegada':
        // reta de embalo descendo forte, depois a rampa que sobe ate o labio (lanca sobre a piscina)
        b.add(RAMPA_FINAL.embalo, 0, RAMPA_FINAL.incEmbalo);
        iFinal = b.n;
        b.add(RAMPA_FINAL.rampa, 0, RAMPA_FINAL.incRampa, T.CHEGADA | T.FINAL);
        break;
      default:
        throw new Error(`modulo desconhecido: ${m.tipo}`);
    }
  }

  const n = b.n + 1;
  // curvatura suavizada (entrada de curva em ~20 m, como um tobogan de verdade: o pendulo nao leva um degrau)
  // o desvio do atalho fica sem suavizar: os arcos exatos fazem a pista de pouso cair na mesma linha
  const kS = new Float64Array(n);
  const SUAVE = 5;
  for (let i = 0; i < n; i++) {
    if (i >= b.n) continue;
    if (b.desvio[i] >= 0) {
      kS[i] = b.k[i];
      continue;
    }
    let soma = 0;
    for (let j = -SUAVE; j <= SUAVE; j++) {
      const q = Math.max(0, Math.min(b.n - 1, i + j));
      if (b.desvio[q] < 0) soma += b.k[q];
    }
    kS[i] = soma / (2 * SUAVE + 1);
  }
  // horizontal (independe do declive)
  const x = new Float64Array(n);
  const z = new Float64Array(n);
  const hx = new Float64Array(n);
  const hz = new Float64Array(n);
  let th = 0;
  for (let i = 0; i < n; i++) {
    hx[i] = Math.sin(th);
    hz[i] = Math.cos(th);
    if (i + 1 < n) {
      const tm = th + (kS[i] * DS) / 2;
      x[i + 1] = x[i] + DS * Math.sin(tm);
      z[i + 1] = z[i] + DS * Math.cos(tm);
      th += kS[i] * DS;
    }
  }

  // declive dos desvios: a queda que faz o voo na velocidade de projeto pousar na pista de pouso
  const alvo = b.alvo.slice();
  alvo.push(alvo[alvo.length - 1]);
  const vProj = FISICA.velProjeto * cfg.vmax;
  /** @type {Atalho[]} */
  const atalhos = [];
  const y = new Float64Array(n);
  const inc = new Float64Array(n);
  const integrar = () => {
    let c = alvo[0];
    y[0] = 0;
    for (let i = 0; i < n; i++) {
      c += (alvo[i] - c) * 0.35;
      inc[i] = c;
      if (i + 1 < n) y[i + 1] = y[i] + c * DS;
    }
  };
  /** queda que o voo de projeto precisa, decolando com o declive `incDecola` */
  const quedaDoVoo = (D, incDecola) => {
    const t = D / vProj;
    // decola da borda rebaixada, subindo com o chute e o trampolim e descendo com o declive da curva
    const vy0 = FISICA.chute + FISICA.chuteAtalho + vProj * incDecola;
    const hDecola = RAIO * (1 - Math.cos(FISICA.bordaAtalho * ALFA_MAX));
    return 0.5 * FISICA.gAr * t * t - vy0 * t - hDecola + 0.5 + FISICA.margemAtalho;
  };
  const quedas = desvios.map((d) => {
    const it = d.i0 + 2;
    const D = (x[d.iPouso] - x[it]) * hx[it] + (z[d.iPouso] - z[it]) * hz[it];
    const minimo = 0.06 * (d.iPouso - d.i0) * DS;
    return { it, D, minimo, queda: Math.max(quedaDoVoo(D, inc0), minimo) };
  });
  for (const d of desvios) {
    const q = quedas[d.id];
    const len = (d.iPouso - d.i0) * DS;
    for (let i = d.i0; i < d.iPouso; i++) alvo[i] = -q.queda / len;
  }
  for (let volta = 0; volta < 4; volta++) {
    integrar();
    for (const d of desvios) {
      const q = quedas[d.id];
      const len = (d.iPouso - d.i0) * DS;
      // o declive real na decolagem (o desvio desce mais que o normal) muda o voo: recalcula
      q.queda = Math.max(quedaDoVoo(q.D, inc[q.it]), q.minimo);
      const real = y[q.it] - y[d.iPouso];
      const ajuste = (q.queda - real) / len;
      for (let i = d.i0; i < d.iPouso; i++) alvo[i] -= ajuste;
    }
  }
  integrar();
  // o fundo da reta de embalo da chegada (o ponto mais baixo antes da rampa final) fica em ALTURA_FIM
  let ref = n - 1;
  if (iFinal >= 0) for (let i = Math.max(0, iFinal - 8); i < n; i++) if (y[i] < y[ref]) ref = i;
  const desloc = ALTURA_FIM - y[ref];
  for (let i = 0; i < n; i++) y[i] += desloc;

  for (const d of desvios) {
    atalhos.push({ i0: d.i0, i1: d.i1, iPouso: d.iPouso, dir: d.dir, pulo: (d.iPouso - d.i0) * DS - quedas[d.id].D,
      marcado: d.marcado, parede: d.parede });
  }

  const tipo = new Int32Array(n);
  const raio = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    tipo[i] = b.tipo[Math.min(i, b.n - 1)];
    raio[i] = b.raio[Math.min(i, b.n - 1)];
  }

  /** @type {Map<number, number[]>} */
  const grade = new Map();
  for (let i = 0; i < n; i++) {
    const ch = chave(Math.floor(x[i] / CELULA), Math.floor(z[i] / CELULA));
    const l = grade.get(ch);
    if (l) l.push(i);
    else grade.set(ch, [i]);
  }

  return { n, comprimento: (n - 1) * DS, x, y, z, hx, hz, inc, k: kS, raio, tipo, atalhos, rampas, iLargada,
    iFinal: iFinal >= 0 ? iFinal : n - 1, grade, vmax: cfg.vmax };
}

const chave = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);

/**
 * Amostras perto de um ponto horizontal (3x3 celulas).
 * @param {Pista} p @param {number} x @param {number} z
 * @param {(i: number) => void} f
 */
export function vizinhas(p, x, z, f) {
  const cx = Math.floor(x / CELULA);
  const cz = Math.floor(z / CELULA);
  for (let a = -1; a <= 1; a++) {
    for (let c = -1; c <= 1; c++) {
      const l = p.grade.get(chave(cx + a, cz + c));
      if (l) for (const i of l) f(i);
    }
  }
}

/**
 * Estado do tobogan na distancia s (interpolado).
 * @param {Pista} p @param {number} s
 * @param {any} [o] objeto reaproveitado
 */
export function noPonto(p, s, o = {}) {
  const sc = Math.max(0, Math.min(p.comprimento, s));
  const i = Math.min(p.n - 2, Math.floor(sc / DS));
  const f = sc / DS - i;
  const g = 1 - f;
  o.i = f < 0.5 ? i : i + 1;
  o.x = p.x[i] * g + p.x[i + 1] * f;
  o.y = p.y[i] * g + p.y[i + 1] * f;
  o.z = p.z[i] * g + p.z[i + 1] * f;
  let hx = p.hx[i] * g + p.hx[i + 1] * f;
  let hz = p.hz[i] * g + p.hz[i + 1] * f;
  const l = Math.hypot(hx, hz) || 1;
  hx /= l;
  hz /= l;
  o.hx = hx;
  o.hz = hz;
  o.inc = p.inc[i] * g + p.inc[i + 1] * f;
  o.k = p.k[i] * g + p.k[i + 1] * f;
  o.raio = p.raio[i] * g + p.raio[i + 1] * f;
  o.tipo = p.tipo[o.i];
  return o;
}

/**
 * Ponto da superficie da calha na distancia s e posicao lateral u (alfa = u * ALFA_MAX).
 * @param {Pista} p @param {number} s @param {number} u @param {number} alfaMax
 * @param {any} [o]
 */
export function naSuperficie(p, s, u, alfaMax, o = {}) {
  const a = noPonto(p, s, o);
  const al = Math.max(-1, Math.min(1, u)) * alfaMax;
  const lat = a.raio * Math.sin(al);
  o.x = a.x - a.hz * lat;
  o.z = a.z + a.hx * lat;
  o.y = a.y + a.raio * (1 - Math.cos(al));
  o.alfa = al;
  return o;
}

/**
 * Procura onde um corredor no ar cruzou a superficie de cima para baixo.
 * @param {Pista} p
 * @param {number} x @param {number} y @param {number} z posicao agora
 * @param {number} yAntes altura no passo anterior
 * @param {number} sMin so amostras com s >= sMin
 * @param {number} folga multiplica o raio aceito (ima de pouso)
 * @returns {{ i: number, u: number } | null}
 */
export function buscarPouso(p, x, y, z, yAntes, sMin, folga = 1.15) {
  /** @type {{ i: number, u: number } | null} */
  let melhor = null;
  let dMelhor = Infinity;
  vizinhas(p, x, z, (i) => {
    if (i * DS < sMin) return;
    const dx = x - p.x[i];
    const dz = z - p.z[i];
    const ao = dx * p.hx[i] + dz * p.hz[i];
    if (Math.abs(ao) > DS * 0.75) return;
    const lat = -dx * p.hz[i] + dz * p.hx[i];
    const R = p.raio[i];
    if (Math.abs(lat) > R * folga) return;
    const l = Math.min(Math.abs(lat), R * 0.98);
    const ySup = p.y[i] + R - Math.sqrt(R * R - l * l);
    if (y > ySup + 0.35 || yAntes < ySup - 0.6) return;
    const d = Math.abs(ao) + Math.abs(y - ySup);
    if (d < dMelhor) {
      dMelhor = d;
      melhor = { i, u: Math.max(-0.9, Math.min(0.9, Math.asin(Math.max(-1, Math.min(1, l * Math.sign(lat) / R))) / ALFA_MAX)) };
    }
  });
  return melhor;
}

/**
 * Amostra do tobogan mais perto (na horizontal) de um ponto, abaixo dele e alinhada com o voo (ima de
 * pouso). Ignora trechos que cruzam o voo de lado (as pernas do desvio).
 * @param {Pista} p @param {number} x @param {number} z @param {number} y
 * @param {number} sMin
 * @param {number} dx @param {number} dz direcao horizontal do voo (unitaria)
 * @returns {number} indice ou -1
 */
export function alvoAbaixo(p, x, z, y, sMin, dx = 0, dz = 0) {
  let melhor = -1;
  let dMelhor = 16 * 16;
  vizinhas(p, x, z, (i) => {
    if (i * DS < sMin || p.y[i] > y) return;
    if ((dx || dz) && p.hx[i] * dx + p.hz[i] * dz < 0.8) return;
    const d = (x - p.x[i]) ** 2 + (z - p.z[i]) ** 2;
    if (d < dMelhor) {
      dMelhor = d;
      melhor = i;
    }
  });
  return melhor;
}
