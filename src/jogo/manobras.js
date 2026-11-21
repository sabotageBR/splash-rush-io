// [Flume Frenzy] Manobras no voo da rampa final (3.1.0). Puro e deterministico (passo fixo).
//
// O corpo gira de verdade. Cada eixo tem angulo e velocidade angular:
// - giro: em volta do eixo vertical (360, 720...);
// - mortal: para tras, cabeca por cima (o loop).
// A entrada e um TORQUE (o corpo se joga) que so age enquanto pedida; um deslize rapido vira uma rajada curta
// de torque (o corpo se joga por um instante). Soltou, a rotacao continua pela inercia e o corpo "fecha" em pe: mira a posicao em pe mais perto de
// onde a inercia levaria (passou da metade, completa a volta; senao volta) e freia com um torque LIMITADO.
// Quem roda rapido demais perto da agua nao tem tempo de fechar e cai torto.
// Superman: solta da boia e estica o corpo. Esticado, o momento de inercia cresce e a rotacao freia (L = I w
// se conserva); cair na agua esticado e barrigada.
//
// Pontos: cada manobra completa vale pontos (repetir a mesma vale metade) e o combo multiplica (1 + 0,5 por
// manobra a mais, ate x3). Pouso limpo (em pe e encolhido) vale x1,5; torto vale o que fez; barrigada perde
// tudo. Moedas = pontos / ptsPorMoeda.
//
// Os bots (e o piloto automatico) planejam as manobras pelo tempo de voo que sobra: os bons deixam folga para
// fechar; os ruins apostam alem da conta e as vezes caem de barriga.
import { NIVEL_AGUA } from './constantes.js';

const VOLTA = Math.PI * 2;

export const MANOBRA = Object.freeze({
  /** aceleracao angular com o corpo encolhido (rad/s2) */
  torqueGiro: 36,
  torqueMortal: 28,
  /** velocidade angular maxima pedindo (rad/s) */
  wGiroMax: 14,
  wMortalMax: 11,
  /** deslize rapido: o corpo se joga com o torque inteiro por este tempo (s), mesmo depois de soltar o dedo
   * (o bastante para passar da metade da volta: a inercia completa) */
  rajadaGiro: 0.32,
  rajadaMortal: 0.4,
  /** fechar em pe: aceleracao maxima (rad/s2); o corpo segue a curva de freio (sem passar do ponto) com este
   * ganho (1/s), e perto do fim a aproximacao e linear com kFechar (1/s) */
  fechar: 34,
  ganhoFechar: 30,
  kFechar: 14,
  /** momento de inercia esticado (superman), relativo ao encolhido */
  inerciaSuperman: 2.4,
  /** velocidade da pose (1/s) */
  poseVel: 7,
  /** a volta conta um pouco antes de fechar (rad) */
  folga: 0.45,
  /** giro e mortal fechados com ate isso de diferenca (s) viram parafuso */
  dupla: 0.7,
  /** superman: tempo esticado para contar e para o longo (s) */
  tSuperman: 0.3,
  tLongo: 1.1,
  /** pouso limpo: erros maximos (rad) e pose */
  limpoMortal: 0.5,
  limpoGiro: 0.7,
  limpoPose: 0.2,
  /** barrigada: acima disto */
  barrigaMortal: 1.15,
  barrigaGiro: 1.75,
  barrigaPose: 0.45,
  pontos: Object.freeze({ giro: 100, mortal: 150, superman: 120, longo: 80, parafuso: 150 }),
  multMax: 3,
  limpoMult: 1.5,
  ptsPorMoeda: 100,
  /** altura da agua da piscina final (m) */
  agua: NIVEL_AGUA + 0.35,
});

/**
 * @typedef {object} EstadoManobras
 * @property {number} g angulo do giro (rad)
 * @property {number} wg
 * @property {number} m angulo do mortal (rad)
 * @property {number} wm
 * @property {number} pose 0 encolhido, 1 esticado (superman)
 * @property {number} alvoG posicao em pe mirada ao soltar (NaN pedindo)
 * @property {number} alvoM
 * @property {number} bG posicao em pe onde a sequencia de giro atual comecou (as voltas contam dali)
 * @property {number} bM
 * @property {number} nG voltas de giro contadas na sequencia atual
 * @property {number} nM
 * @property {number} tG instante da ultima volta de giro
 * @property {number} tM
 * @property {number} tPose s esticado sem parar
 * @property {boolean} sup superman desta esticada ja contou
 * @property {boolean} longo
 * @property {string[]} lista manobras feitas
 * @property {number} pts soma dos pontos
 * @property {number} t s de voo
 * @property {number} rajG rajada de giro de um deslize rapido: s restantes vezes o sentido (+/-)
 * @property {number} rajM
 * @property {any} [plano] plano do bot
 */

/** @returns {EstadoManobras} */
export function novasManobras() {
  return { g: 0, wg: 0, m: 0, wm: 0, pose: 0, alvoG: NaN, alvoM: NaN, bG: 0, bM: 0, nG: 0, nM: 0, tG: -9, tM: -9, tPose: 0,
    sup: false, longo: false, lista: [], pts: 0, t: 0, rajG: 0, rajM: 0 };
}

/** Distancia do angulo ate a posicao em pe mais perto (rad, 0..pi). @param {number} a */
export const erroEmPe = (a) => Math.abs(a - Math.round(a / VOLTA) * VOLTA);

/**
 * Um eixo: torque enquanto pedido, inercia e o fechamento em pe quando solto.
 * @param {number} th @param {number} w @param {number} alvo NaN pedindo
 * @param {number} entrada -1..1 @param {number} torque @param {number} wMax @param {number} I
 * @param {number} dt
 * @returns {[number, number, number]} th, w, alvo
 */
function eixo(th, w, alvo, entrada, torque, wMax, I, dt) {
  const M = MANOBRA;
  if (Math.abs(entrada) > 0.15) {
    alvo = NaN;
    const a = (entrada * torque) / I;
    // pedindo no sentido do giro: acelera ate o maximo; contra: freia e inverte
    if (w * Math.sign(entrada) < wMax / Math.sqrt(I)) w += a * dt;
  } else {
    if (Number.isNaN(alvo)) {
      // onde a inercia levaria com o freio maximo, e a posicao em pe mais perto dali (travada)
      const amax = M.fechar / I;
      const para = th + (w * Math.abs(w)) / (2 * amax);
      alvo = Math.round(para / VOLTA) * VOLTA;
    }
    // curva de freio: a velocidade que ainda para no alvo com 80% do freio maximo (sem passar do ponto)
    const amax = M.fechar / I;
    const e = alvo - th;
    const wDes = Math.sign(e) * Math.min(Math.sqrt(1.6 * amax * Math.abs(e)), M.kFechar * Math.abs(e));
    w += Math.max(-amax, Math.min(amax, M.ganhoFechar * (wDes - w))) * dt;
  }
  th += w * dt;
  return [th, w, alvo];
}

/**
 * Um passo das manobras de quem esta no voo final.
 * @param {{ man: EstadoManobras | null, manX: number, manY: number, impX: number, impY: number }} k
 * @param {number} dt
 * @param {(nome: string, pts: number) => void} emitir manobra completa
 */
export function passoManobras(k, dt, emitir) {
  const s = k.man;
  if (!s) return;
  const M = MANOBRA;
  s.t += dt;
  // pose: baixo estica (superman); conserva o momento angular ao mudar a inercia
  const iAntes = 1 + (M.inerciaSuperman - 1) * s.pose;
  const alvoPose = k.manY < -0.4 ? 1 : 0;
  s.pose += Math.max(-M.poseVel * dt, Math.min(M.poseVel * dt, alvoPose - s.pose));
  const I = 1 + (M.inerciaSuperman - 1) * s.pose;
  if (I !== iAntes) {
    s.wg *= iAntes / I;
    s.wm *= iAntes / I;
  }
  // deslize rapido: o corpo se joga por um instante (rajada de torque), mesmo depois de soltar o dedo
  if (k.impX) {
    s.rajG = Math.sign(k.impX) * M.rajadaGiro;
    k.impX = 0;
  }
  if (k.impY > 0) s.rajM = M.rajadaMortal;
  k.impY = 0;
  let ex = k.manX;
  let ey = Math.max(0, k.manY);
  if (s.rajG) {
    if (!ex) ex = Math.sign(s.rajG);
    s.rajG = Math.sign(s.rajG) * Math.max(0, Math.abs(s.rajG) - dt);
  }
  if (s.rajM > 0) {
    if (!ey) ey = 1;
    s.rajM = Math.max(0, s.rajM - dt);
  }
  [s.g, s.wg, s.alvoG] = eixo(s.g, s.wg, s.alvoG, ex, M.torqueGiro, M.wGiroMax, I, dt);
  [s.m, s.wm, s.alvoM] = eixo(s.m, s.wm, s.alvoM, ey, M.torqueMortal, M.wMortalMax, I, dt);

  const contar = (/** @type {string} */ nome, /** @type {number} */ base) => {
    const rep = s.lista.includes(nome);
    const pts = Math.round(base * (rep ? 0.5 : 1));
    s.lista.push(nome);
    s.pts += pts;
    emitir(nome, pts);
  };
  // fechou em pe e parou: a proxima volta e uma manobra nova (dois mortais separados nao sao um duplo)
  if (!Number.isNaN(s.alvoG) && Math.abs(s.g - s.alvoG) < 0.12 && Math.abs(s.wg) < 1) {
    s.bG = s.alvoG;
    s.nG = 0;
  }
  if (!Number.isNaN(s.alvoM) && Math.abs(s.m - s.alvoM) < 0.12 && Math.abs(s.wm) < 1) {
    s.bM = s.alvoM;
    s.nM = 0;
  }
  // voltas completas da sequencia (contam um pouco antes de fechar)
  const nG = Math.floor((Math.abs(s.g - s.bG) + M.folga) / VOLTA);
  while (s.nG < nG) {
    s.nG++;
    s.tG = s.t;
    contar(s.nG === 1 ? 'giro360' : s.nG === 2 ? 'giro720' : s.nG === 3 ? 'giro1080' : 'giroMais', M.pontos.giro + 50 * (s.nG - 1));
    if (s.t - s.tM < M.dupla) contar('parafuso', M.pontos.parafuso);
  }
  const nM = Math.floor((Math.abs(s.m - s.bM) + M.folga) / VOLTA);
  while (s.nM < nM) {
    s.nM++;
    s.tM = s.t;
    contar(s.nM === 1 ? 'mortal' : s.nM === 2 ? 'mortal2' : 'mortal3', M.pontos.mortal + 50 * (s.nM - 1));
    if (s.t - s.tG < M.dupla && s.tG > -9) contar('parafuso', M.pontos.parafuso);
  }
  // superman: esticado por tSuperman; longo depois de tLongo; encolher libera a proxima
  if (s.pose > 0.9) {
    s.tPose += dt;
    if (!s.sup && s.tPose >= M.tSuperman) {
      s.sup = true;
      contar('superman', M.pontos.superman);
    }
    if (!s.longo && s.tPose >= M.tLongo) {
      s.longo = true;
      contar('supermanLongo', M.pontos.longo);
    }
  } else if (s.pose < 0.3) {
    s.tPose = 0;
    s.sup = false;
    s.longo = false;
  }
}

/**
 * Multiplicador do combo. @param {number} n manobras
 */
export const multCombo = (n) => Math.min(MANOBRA.multMax, 1 + 0.5 * Math.max(0, n - 1));

/**
 * Como bateu na agua: limpo (em pe e encolhido), torto, ou barrigada (deitado, de lado ou esticado).
 * @param {EstadoManobras} s
 * @returns {{ qualidade: 'limpo'|'torto'|'barrigada', n: number, base: number, mult: number, total: number, moedas: number }}
 */
export function avaliarPouso(s) {
  const M = MANOBRA;
  const em = erroEmPe(s.m);
  const eg = erroEmPe(s.g);
  let qualidade = /** @type {'limpo'|'torto'|'barrigada'} */ ('torto');
  if (s.pose > M.barrigaPose || em > M.barrigaMortal || eg > M.barrigaGiro) qualidade = 'barrigada';
  else if (s.pose < M.limpoPose && em < M.limpoMortal && eg < M.limpoGiro) qualidade = 'limpo';
  const n = s.lista.length;
  const mult = multCombo(n);
  const total = qualidade === 'barrigada' ? 0 : Math.round(s.pts * mult * (qualidade === 'limpo' ? M.limpoMult : 1));
  return { qualidade, n, base: s.pts, mult, total, moedas: Math.round(total / M.ptsPorMoeda) };
}

/**
 * Tempo ate a agua da piscina num voo balistico. @param {number} y @param {number} vy @param {number} g
 */
export function tempoAteAgua(y, vy, g) {
  const h = Math.max(0, y - MANOBRA.agua);
  return (vy + Math.sqrt(vy * vy + 2 * g * h)) / g;
}

/** Repertorio dos bots: tipo, voltas, tempo estimado (s) do comeco ate fechar em pe. */
const REPERTORIO = /** @type {const} */ ([
  ['giro', 1, 0.87], ['mortal', 1, 0.93], ['superman', 0, 0.7], ['parafuso', 1, 0.95], ['giro', 2, 1.3],
]);

/**
 * Plano de manobras de um bot para o tempo de voo: os bons deixam folga para fechar em pe; os ruins apostam
 * alem da conta (folga negativa) e as vezes caem de barriga.
 * @param {{ habilidade: number, risco: number }} ia
 * @param {number} tVoo s ate a agua
 * @param {number} semente
 */
export function planejarBot(ia, tVoo, semente) {
  // folga (s) que o bot deixa antes da agua: os bons sobram ~0,4 s; os ruins contam com tempo que nao tem
  const folga = -0.9 + 1.3 * ia.habilidade + (((semente >>> 3) % 7) - 3) * 0.05;
  const max = 2 + Math.round(ia.risco * 2);
  /** @type {{ tipo: string, n: number, dir: number }[]} */
  const plano = [];
  let t = 0.15;
  let h = (semente >>> 0) || 1;
  for (let tentativa = 0; tentativa < 8 && plano.length < max; tentativa++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const r = REPERTORIO[(h >>> 8) % REPERTORIO.length];
    if (t + r[2] > tVoo - folga) continue;
    plano.push({ tipo: r[0], n: r[1], dir: (h >>> 20) & 1 ? 1 : -1 });
    t += r[2];
  }
  return plano;
}

/**
 * Entrada de manobra de um bot (ou do piloto automatico) neste passo. Segue o plano: pede o giro ate passar
 * da metade da ultima volta e solta (a inercia e o fechamento completam), espera assentar e vai para a proxima.
 * @param {{ man: EstadoManobras | null, manX: number, manY: number, ia?: any, id: number, y: number, vy: number }} k
 * @param {number} g gravidade @param {number} dt
 */
export function manobrarBot(k, g, dt) {
  const s = k.man;
  k.manX = 0;
  k.manY = 0;
  if (!s || !k.ia) return;
  if (!s.plano) {
    const tVoo = tempoAteAgua(k.y, k.vy, g);
    s.plano = { lista: planejarBot(k.ia, tVoo, k.id * 977 + Math.floor((k.ia.fase || 0) * 1000) + 1), i: 0, t: 0, g0: 0, m0: 0 };
  }
  const p = s.plano;
  const it = p.lista[p.i];
  if (!it) return;
  if (p.t === 0) {
    p.g0 = Math.round(s.g / VOLTA) * VOLTA;
    p.m0 = Math.round(s.m / VOLTA) * VOLTA;
  }
  p.t += dt;
  // reacao: o bot ruim demora para emendar a proxima manobra (e nao conta com isso no plano)
  const espera = (1 - k.ia.habilidade) * 0.5;
  if (p.t < espera) return;
  const tm = p.t - espera;
  const assentou = Math.abs(s.wg) < 0.8 && Math.abs(s.wm) < 0.8 && erroEmPe(s.g) < 0.2 && erroEmPe(s.m) < 0.2 && s.pose < 0.05;
  const giro = Math.abs(s.g - p.g0) / VOLTA;
  const mortal = Math.abs(s.m - p.m0) / VOLTA;
  let pedindo = false;
  if (it.tipo === 'giro' && giro < it.n - 0.5) {
    k.manX = it.dir;
    pedindo = true;
  } else if (it.tipo === 'mortal' && mortal < 0.5) {
    k.manY = 1;
    pedindo = true;
  } else if (it.tipo === 'parafuso' && (giro < 0.5 || mortal < 0.5)) {
    if (giro < 0.5) k.manX = it.dir;
    if (mortal < 0.5) k.manY = 1;
    pedindo = true;
  } else if (it.tipo === 'superman' && tm < 0.55) {
    k.manY = -1;
    pedindo = true;
  }
  if (!pedindo && tm > 0.2 && assentou) {
    p.i++;
    p.t = 0;
  }
}
