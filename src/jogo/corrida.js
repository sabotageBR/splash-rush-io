// [Flume Frenzy] A corrida: fisica na calha, voo, pouso, queda na lagoa, trombadas, moedas do evento,
// chegada e colocacao. Puro e deterministico (passo fixo).
//
// 3.0.0 (fisica de verdade): na calha o corredor vive em (s, u): s = distancia ao longo do tobogan, u =
// posicao lateral (-1..1; alfa = u * ALFA_MAX e o angulo a partir do fundo).
// - Ao longo: a velocidade sai da descida (ganho forte nas quedas), do arrasto (teto natural em cada declive)
//   e do atrito da curva (perde um pouco nas curvas fechadas e nas subidas).
// - De lado: pendulo. Gravidade da calha para o fundo, forca centrifuga v^2 * k para fora da curva e a direcao
//   (`dir`, -1..1, do jogador ou do bot) como forca limitada que so existe enquanto alguem pede. Sem pedir, na
//   curva fechada o corredor sobe a parede e voa pela borda: atalho (pousa num trecho de baixo) ou queda.
// - Voo balistico com gravidade real, um pouco de controle e o ima de pouso; cair abaixo da lagoa = agua (volta
//   ao tobogan nas rodadas protegidas, volta atras nas rodadas com `voltas`, ou sai da rodada).
//
// Trombada: boias sao discos em (s, lateral em metros). Cada par que se sobrepoe e resolvido UMA vez por
// passo: separacao macia e, quando estao se aproximando de verdade, impulso normal mais um TRANCO lateral
// proporcional a velocidade de aproximacao (quem bate tambem leva, menos). Quem leva o tranco vai contra a
// parede e, na curva, voa para fora. Toque lento nao tem tranco (nada de vai-e-vem).
//
// Para o desenho interpolar entre passos, cada corredor guarda o estado do passo anterior (px, py, pz,
// phx, phz, palfa, ps); `salto` avisa que houve teletransporte (largada, pouso, volta).
//
// 3.1.0 (rampa final): a chegada conta na BORDA da rampa final (cruzou: o lugar fica decidido ali, pela
// ordem em que cada um passa). Dali todos voam alto sobre a piscina fazendo manobras (manobras.js) e a corrida
// de cada um acaba ao bater na agua (mergulho: limpo, torto ou barrigada; depois chegou).
//
// Eventos do passo (c.eventos, o main limpa depois de ler): decolou, pousou, atalho, caiu, voltou, fora,
// cruzou, manobra, mergulho, chegou, empurrao, derrubou, turbo, rampa, moeda.
import { DS, ALFA_MAX, NIVEL_AGUA, FISICA, DECLIVE_REF, alturaBorda } from './constantes.js';
import { T, noPonto, naSuperficie, buscarPouso, alvoAbaixo } from './pista.js';
import { MANOBRA, novasManobras, passoManobras, avaliarPouso } from './manobras.js';

/** @typedef {'pronto'|'calha'|'ar'|'agua'|'chegou'|'fora'} EstadoCorredor */

/**
 * @typedef {object} Corredor
 * @property {number} id
 * @property {string} nome
 * @property {boolean} bot
 * @property {number} personagem
 * @property {number} boia
 * @property {number} s
 * @property {number} u
 * @property {number} vu velocidade lateral (u/s)
 * @property {number} dir direcao pedida (-1..1): forca na calha, controle no ar
 * @property {number} v velocidade ao longo do tobogan (m/s)
 * @property {EstadoCorredor} estado
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} vx
 * @property {number} vy
 * @property {number} vz
 * @property {number} hx rumo horizontal do movimento (desenho)
 * @property {number} hz
 * @property {number} alfa angulo na calha (desenho)
 * @property {number} px estado do passo anterior (interpolacao do desenho)
 * @property {number} py
 * @property {number} pz
 * @property {number} phx
 * @property {number} phz
 * @property {number} palfa
 * @property {number} ps
 * @property {boolean} salto teletransporte neste passo (o desenho nao interpola)
 * @property {number} sDecola
 * @property {number} tEstado
 * @property {number} quedas
 * @property {number} protecao s sem contato (depois de voltar)
 * @property {number} chegada tempo em que cruzou a borda da rampa final (-1)
 * @property {number} lugar lugar na chegada (0 antes de cruzar)
 * @property {boolean} final no voo final (rampa da chegada)
 * @property {import('./manobras.js').EstadoManobras | null} man manobras do voo final
 * @property {number} manX entrada de manobra: giro (-1..1)
 * @property {number} manY entrada de manobra: +1 mortal, -1 superman
 * @property {number} impX impulso de giro de um deslize rapido (-1, 0, 1; consumido no passo)
 * @property {number} impY impulso de mortal
 * @property {any} pouso resultado do mergulho final (avaliarPouso) ou null
 * @property {number} sFora s em que saiu da rodada
 * @property {number} tFora
 * @property {number} atalhos
 * @property {number} vel fator de velocidade (bots)
 * @property {number} ima forca do ima de pouso (0..1)
 * @property {number} peso tamanho da boia (contato)
 * @property {number} massa na trombada (o jogador e um pouco mais pesado: empurra mais do que e empurrado)
 * @property {number} turbo s restantes do brilho de turbo
 * @property {number} empurradoPor id de quem empurrou por ultimo (-1)
 * @property {number} tEmpurrao
 * @property {number} tBatida ultima batida com tranco
 * @property {number} solto s restantes deslizando solto depois de um tranco
 * @property {number} moedas moedas pegas no tobogan
 * @property {boolean} ajudaDecolagem garante a velocidade de projeto ao decolar num atalho
 * @property {number} ultimaRampa
 * @property {number} ultimoTurbo
 * @property {any} [ia] parametros do bot (bots.js)
 */

/**
 * @typedef {object} CfgCorrida
 * @property {number} vmax
 * @property {number} cf multiplicador da forca de fora
 * @property {boolean} volta quem cai volta ao tobogan logo ali (rodadas protegidas)
 * @property {number} [voltas] quedas que ainda voltam ao tobogan (mais atras) fora da protecao
 * @property {number} [gelo] 1 no parque de gelo (mais rapido e liso)
 */

/**
 * @param {number} id
 * @param {{ nome: string, bot: boolean, personagem: number, boia: number, vel?: number, ima?: number, peso?: number }} o
 * @returns {Corredor}
 */
export function criarCorredor(id, o) {
  return {
    id, nome: o.nome, bot: o.bot, personagem: o.personagem, boia: o.boia,
    s: 0, u: 0, vu: 0, v: 0, estado: 'pronto',
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hx: 0, hz: 1, alfa: 0,
    px: 0, py: 0, pz: 0, phx: 0, phz: 1, palfa: 0, ps: 0, salto: true,
    dir: 0, sDecola: 0, tEstado: 0, quedas: 0, protecao: 0,
    chegada: -1, lugar: 0, final: false, man: null, manX: 0, manY: 0, impX: 0, impY: 0, pouso: null,
    sFora: 0, tFora: 0, atalhos: 0,
    vel: o.vel ?? 1, ima: o.ima ?? 0.3, peso: o.peso ?? 1, massa: (o.peso ?? 1) * (o.bot ? 1 : 1.35), turbo: 0,
    empurradoPor: -1, tEmpurrao: 0, tBatida: -1, solto: 0, moedas: 0, ajudaDecolagem: false, ultimaRampa: -1, ultimoTurbo: -1,
  };
}

/**
 * Posiciona os corredores na plataforma de largada, em fileiras de 3.
 * @param {import('./pista.js').Pista} pista
 * @param {Corredor[]} corredores na ordem da grade (o primeiro fica na frente)
 */
export function alinhar(pista, corredores) {
  const frente = pista.iLargada * DS - 2;
  corredores.forEach((k, j) => {
    const fila = Math.floor(j / 3);
    k.s = Math.max(1, frente - fila * 3.3);
    k.u = [0, -0.58, 0.58][j % 3];
    k.dir = 0;
    k.v = 0;
    k.vu = 0;
    k.estado = 'pronto';
    posicionarNaCalha(pista, k);
    guardarAnterior(k);
    k.salto = true;
  });
}

/**
 * @param {import('./pista.js').Pista} pista
 * @param {CfgCorrida} cfg
 * @param {Corredor[]} corredores
 * @param {{ s: number, u: number }[]} [moedas]
 */
export function criarCorrida(pista, cfg, corredores, moedas = []) {
  return {
    pista, cfg, corredores, t: 0, iniciada: false, chegados: 0, foras: 0,
    /** @type {{ tipo: string, id: number, [k: string]: any }[]} */
    eventos: [],
    moedas: moedas.map((m) => ({ s: m.s, u: m.u, pega: false })),
    /** @type {number[]} ordem por s (contato) */
    ordem: corredores.map((_, i) => i),
  };
}
/** @typedef {ReturnType<typeof criarCorrida>} Corrida */

/** @param {Corrida} c */
export function largar(c) {
  if (c.iniciada) return;
  c.iniciada = true;
  // a comporta abre com um empurrao: ninguem fica parado na plataforma
  for (const k of c.corredores) {
    k.estado = 'calha';
    k.v = 12;
  }
}

const tmp = {};
const tmp2 = {};

/** @param {Corredor} k */
function guardarAnterior(k) {
  k.px = k.x;
  k.py = k.y;
  k.pz = k.z;
  k.phx = k.hx;
  k.phz = k.hz;
  k.palfa = k.alfa;
  k.ps = k.s;
  k.salto = false;
}

/** @param {import('./pista.js').Pista} p @param {Corredor} k */
function posicionarNaCalha(p, k) {
  const a = naSuperficie(p, k.s, k.u, ALFA_MAX, tmp2);
  k.x = a.x;
  k.y = a.y;
  k.z = a.z;
  k.hx = a.hx;
  k.hz = a.hz;
  k.alfa = a.alfa;
}

/** @param {Corrida} c @param {string} tipo @param {Corredor} k @param {any} [extra] */
function evento(c, tipo, k, extra) {
  c.eventos.push(Object.assign({ tipo, id: k.id, x: k.x, y: k.y, z: k.z }, extra));
}

/**
 * Aceleracao ao longo do tobogan (m/s2). Na rampa final, a subida de verdade (ver acima). No resto: descida, arrasto (o vmax da rodada e a velocidade terminal no
 * declive de referencia; o fator `vel` dos bots muda a terminal), atrito da curva e da parede, correnteza no
 * meio da calha (quem fica baixo ganha), gelo.
 * @param {Corrida} c @param {Corredor} k @param {number} inc @param {number} kc curvatura @param {number} tipo bits T
 */
function aceleracao(c, k, inc, kc, tipo) {
  const F = FISICA;
  // rampa final: sobe com a gravidade de verdade (a mesma do voo) e lamina fina de agua (atrito forte, que
  // aproxima as velocidades: o salto de todo mundo cabe na piscina)
  if (tipo & T.FINAL) return -F.gAr * Math.sin(Math.atan(inc)) - F.arrastoRampa * k.v * k.v;
  const gelo = c.cfg.gelo ? 1 : 0;
  const vt = c.cfg.vmax * k.vel * (1 + 0.05 * gelo);
  // o desvio do atalho e um canal raso: a agua freia (quem nao voa vai mais devagar e segura as curvas)
  const raso = (tipo & T.DESVIO) && !(tipo & T.ATALHO) ? F.arrastoDesvio : 1;
  const arrasto = (raso * F.gDescida * DECLIVE_REF) / (vt * vt);
  const v2 = k.v * k.v;
  const au = Math.abs(k.u);
  const alto = Math.max(0, au - 0.5) * 2;
  const meio = Math.max(0, 1 - au / 0.45);
  return F.gDescida * -inc - arrasto * v2 - F.atritoCurva * (1 - 0.3 * gelo) * v2 * Math.abs(kc) * c.cfg.cf - F.atritoParede * alto
    + F.correnteza * meio;
}

/**
 * Sai pela borda (ou pela rampa).
 * @param {Corrida} c @param {Corredor} k @param {any} a ponto do tobogan
 * @param {number} lado -1, 0 (rampa, para cima) ou +1
 * @param {number} subida m/s extra para cima
 */
function decolar(c, k, a, lado, subida) {
  const p = c.pista;
  const sup = naSuperficie(p, k.s, lado === 0 ? k.u : lado * Math.max(Math.abs(k.u), 0.5), ALFA_MAX, tmp2);
  const rx = -a.hz;
  const rz = a.hx;
  let v = k.v;
  const at = lado === 0 ? null : p.atalhos.find((t) => a.i >= t.i0 - 2 && a.i <= t.i1 + 2) || null;
  const zonaAtalho = !!at;
  if (zonaAtalho && k.ajudaDecolagem) v = Math.max(v, FISICA.velProjeto * c.cfg.vmax * 1.04);
  const lat = lado === 0 ? 0 : lado * (FISICA.saidaLateral + Math.min(3, Math.abs(k.vu) * a.raio * ALFA_MAX * 0.2));
  k.vx = a.hx * v + rx * lat;
  k.vz = a.hz * v + rz * lat;
  // atalho: o voo sai mirando a pista de pouso (gira no maximo 34 graus; quem decola tarde ainda erra)
  if (at) {
    const ia = Math.min(p.n - 1, at.iPouso + 5);
    let mx = p.x[ia] - sup.x;
    let mz = p.z[ia] - sup.z;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    const hv = Math.hypot(k.vx, k.vz) || 1;
    const cx = k.vx / hv;
    const cz = k.vz / hv;
    const ang = Math.atan2(cx * mz - cz * mx, cx * mx + cz * mz);
    const g = Math.max(-0.6, Math.min(0.6, ang));
    const cs = Math.cos(g);
    const sn = Math.sin(g);
    k.vx = (cx * cs - cz * sn) * hv;
    k.vz = (cx * sn + cz * cs) * hv;
  }
  k.vy = v * a.inc + (lado === 0 ? 0 : FISICA.chute) + (zonaAtalho ? FISICA.chuteAtalho : 0) + subida;
  k.x = sup.x;
  k.y = sup.y + (lado === 0 ? 0.3 : 0);
  k.z = sup.z;
  k.sDecola = k.s;
  k.tEstado = 0;
  k.estado = 'ar';
  evento(c, lado === 0 ? 'rampa' : 'decolou', k, { atalho: zonaAtalho });
}

/**
 * Primeiro trecho calmo (quase reto, sem tunel, rampa ou zona de atalho) a partir de s: onde quem cai volta.
 * @param {import('./pista.js').Pista} p @param {number} s0
 */
function trechoCalmo(p, s0) {
  const i0 = Math.max(p.iLargada + 4, Math.ceil(s0 / DS));
  for (let i = i0; i < Math.min(p.n - 12, i0 + 50); i++) {
    if (Math.abs(p.k[i]) < 0.006 && !(p.tipo[i] & (T.TUNEL | T.RAMPA | T.ATALHO | T.TURBO))) return i * DS;
  }
  return Math.min(p.comprimento - 24, Math.max(p.iLargada * DS + 8, s0));
}

/** @param {Corrida} c @param {Corredor} k @param {number} dt */
function passoCalha(c, k, dt) {
  const p = c.pista;
  const F = FISICA;
  const a = noPonto(p, k.s, tmp);
  const vmax = c.cfg.vmax;
  // ao longo: descida, arrasto e atritos
  k.v += aceleracao(c, k, a.inc, a.k, a.tipo) * dt;
  if ((a.tipo & T.TURBO) && Math.abs(k.u) < 0.6 && k.ultimoTurbo !== a.i) {
    k.ultimoTurbo = a.i;
    if (k.turbo <= 0) evento(c, 'turbo', k);
    k.v = Math.max(k.v, Math.min(k.v + F.turbo / 4, vmax * F.tetoTurbo));
    k.turbo = 0.9;
  }
  k.v = Math.max(F.velMin, Math.min(vmax * (k.turbo > 0 ? F.tetoTurbo : F.teto), k.v));
  if (k.turbo > 0) k.turbo -= dt;
  if (k.protecao > 0) k.protecao -= dt;
  // de lado: pendulo. Gravidade da calha + centrifuga + direcao (so quando pedida) - amortecimento da agua
  const al = k.u * ALFA_MAX;
  const ml = a.raio * ALFA_MAX;
  const vLat = k.vu * ml;
  // logo depois de levar um tranco a boia desliza solta: menos atrito com a agua e quase sem direcao
  const solto = k.solto > 0 ? 1 : 0;
  if (solto) k.solto -= dt;
  const dir = Math.max(-1, Math.min(1, k.dir)) * (solto ? 0.25 : 1);
  const amort = F.amortece * (solto ? F.amorteceSolto : 1);
  const aLat = -F.gCalha * Math.sin(al) + k.v * k.v * a.k * c.cfg.cf * Math.cos(al) + F.direcao * dir - amort * vLat;
  let vl = vLat + aLat * dt;
  if (Math.abs(vl) > F.vLatMax) vl = Math.sign(vl) * F.vLatMax;
  k.vu = vl / ml;
  k.u += k.vu * dt;
  const tunel = (a.tipo & T.TUNEL) !== 0;
  // passou da borda indo para fora: voa (curva, tranco de um rival, ou corrigiu demais). Na curva do atalho a
  // borda de fora e mais baixa
  const baixa = (a.tipo & T.ATALHO) !== 0 && Math.sign(k.u) === Math.sign(a.k);
  const borda = baixa ? F.bordaAtalho : 1;
  if (!tunel && Math.abs(k.u) >= borda && k.vu * k.u > 0) {
    k.u = Math.sign(k.u) * borda;
    decolar(c, k, a, Math.sign(k.u), 0);
    return;
  }
  const teto = tunel ? 0.95 : 1;
  if (Math.abs(k.u) > teto) {
    k.u = Math.sign(k.u) * teto;
    if (k.vu * k.u > 0) k.vu = 0;
  }
  // rampa de parede: na zona de decolagem, a borda de fora lanca mais alto
  if ((a.tipo & T.PAREDE) && k.u * Math.sign(a.k) > 0.55 && k.ultimaRampa !== a.i) {
    k.ultimaRampa = a.i;
    k.u = Math.sign(a.k);
    decolar(c, k, a, Math.sign(a.k), F.parede);
    return;
  }
  const sAntes = k.s;
  k.s += k.v * dt;
  // rampa de salto: lanca quando passa a amostra do fim da rampa
  for (const ir of p.rampas) {
    const sr = ir * DS;
    if (sAntes < sr && k.s >= sr && Math.abs(k.u) < 0.65) {
      noPonto(p, sr, tmp);
      k.s = sr;
      k.vy = 0;
      decolar(c, k, tmp, 0, k.v * F.rampa);
      return;
    }
  }
  if (k.s >= p.comprimento) lancarFinal(c, k);
}

/**
 * Passou da borda da rampa final: a chegada conta aqui (lugar decidido) e o voo das manobras comeca. O lancamento
 * segue o angulo da rampa (velocidade inteira na direcao do labio) com um pouco da velocidade de lado.
 * @param {Corrida} c @param {Corredor} k
 */
function lancarFinal(c, k) {
  const p = c.pista;
  k.s = p.comprimento;
  const a = noPonto(p, k.s, tmp);
  const sup = naSuperficie(p, k.s, k.u, ALFA_MAX, tmp2);
  const th = Math.atan(Math.max(0, a.inc));
  const vh = k.v * Math.cos(th);
  const lat = k.vu * a.raio * ALFA_MAX * 0.25;
  k.vx = a.hx * vh - a.hz * lat;
  k.vz = a.hz * vh + a.hx * lat;
  k.vy = k.v * Math.sin(th);
  k.x = sup.x;
  k.y = sup.y + 0.2;
  k.z = sup.z;
  k.sDecola = k.s;
  k.tEstado = 0;
  k.estado = 'ar';
  k.final = true;
  k.chegada = c.t;
  c.chegados++;
  k.lugar = c.chegados;
  k.man = novasManobras();
  k.manX = 0;
  k.manY = 0;
  k.impX = 0;
  k.impY = 0;
  evento(c, 'cruzou', k, { lugar: k.lugar });
  evento(c, 'rampa', k, { final: true, v: k.v });
}

/**
 * Voo final: balistico (gravidade real, sem controle de rumo nem ima), manobras e o mergulho na piscina.
 * @param {Corrida} c @param {Corredor} k @param {number} dt
 */
function passoFinal(c, k, dt) {
  k.tEstado += dt;
  passoManobras(k, dt, (nome, pts) => {
    const m = /** @type {import('./manobras.js').EstadoManobras} */ (k.man);
    evento(c, 'manobra', k, { nome, pts, combo: m.lista.length });
  });
  k.vy -= FISICA.gAr * dt;
  k.x += k.vx * dt;
  k.y += k.vy * dt;
  k.z += k.vz * dt;
  k.alfa *= 1 - Math.min(1, 4 * dt);
  const hv = Math.hypot(k.vx, k.vz) || 1;
  k.hx = k.vx / hv;
  k.hz = k.vz / hv;
  if (k.y > MANOBRA.agua) return;
  // mergulho: como bateu na agua decide o bonus
  const impacto = Math.hypot(hv, k.vy);
  k.pouso = avaliarPouso(/** @type {import('./manobras.js').EstadoManobras} */ (k.man));
  k.y = MANOBRA.agua;
  k.estado = 'chegou';
  k.tEstado = 0;
  // desliza um pouco na piscina (barrigada para quase na hora)
  const f = k.pouso.qualidade === 'barrigada' ? 0.12 : 0.3;
  k.vx *= f;
  k.vz *= f;
  k.v = hv * f;
  evento(c, 'mergulho', k, Object.assign({ impacto, vy: -k.vy }, k.pouso));
  evento(c, 'chegou', k, { lugar: k.lugar });
}

/** @param {Corrida} c @param {Corredor} k @param {number} dt */
function passoAr(c, k, dt) {
  const p = c.pista;
  const F = FISICA;
  k.tEstado += dt;
  let hv = Math.hypot(k.vx, k.vz) || 1;
  const dx = k.vx / hv;
  const dz = k.vz / hv;
  // controle no ar (lateral em relacao ao rumo do voo)
  const ctl = Math.max(-1, Math.min(1, k.dir)) * F.controleAr * dt;
  k.vx += -dz * ctl;
  k.vz += dx * ctl;
  // ima: alinha o voo com o tobogan que esta abaixo e adiante, na mesma direcao do voo (so corrige
  // de lado, nunca freia)
  if (k.ima > 0) {
    const ah = Math.min(1.1, 0.25 + k.tEstado);
    const qx = k.x + k.vx * ah;
    const qz = k.z + k.vz * ah;
    const i = alvoAbaixo(p, qx, qz, k.y + 1, k.sDecola + 8, dx, dz);
    if (i >= 0) {
      const lat = (qx - p.x[i]) * -dz + (qz - p.z[i]) * dx;
      const acc = Math.max(-14, Math.min(14, -lat * 4.5)) * k.ima * dt;
      k.vx += -dz * acc;
      k.vz += dx * acc;
    }
  }
  hv = Math.hypot(k.vx, k.vz) || 1;
  k.hx = k.vx / hv;
  k.hz = k.vz / hv;
  k.alfa *= 1 - Math.min(1, 4 * dt);
  k.vy -= F.gAr * dt;
  const yAntes = k.y;
  k.x += k.vx * dt;
  k.y += k.vy * dt;
  k.z += k.vz * dt;
  if (k.vy < 0) {
    let pouso = buscarPouso(p, k.x, k.y, k.z, yAntes, k.sDecola + 6, 1.15 + k.ima * 0.25);
    // logo depois de decolar, raspar a propria borda nao e pouso (so voltar para dentro da calha)
    if (pouso && pouso.i * DS - k.sDecola < 30 && Math.abs(pouso.u) > 0.8) pouso = null;
    if (pouso) {
      const sNovo = pouso.i * DS;
      const pulo = sNovo - k.sDecola;
      k.s = sNovo;
      k.u = pouso.u;
      k.vu = 0;
      k.v = Math.max(8, hv * 0.96);
      k.estado = 'calha';
      posicionarNaCalha(p, k);
      evento(c, 'pousou', k, { pulo, queda: Math.max(0, -k.vy) });
      if (pulo > 40) {
        k.atalhos++;
        evento(c, 'atalho', k, { pulo });
      }
      if (k.s >= p.comprimento - 0.01) lancarFinal(c, k);
      return;
    }
  }
  if (k.y < NIVEL_AGUA + 0.2) {
    k.y = NIVEL_AGUA;
    k.estado = 'agua';
    k.tEstado = 0;
    k.quedas++;
    evento(c, 'caiu', k);
    if (k.empurradoPor >= 0 && c.t - k.tEmpurrao < 2.5) evento(c, 'derrubou', c.corredores[k.empurradoPor], { vitima: k.id });
  }
}

/** @param {Corrida} c @param {Corredor} k @param {number} dt */
function passoAgua(c, k, dt) {
  k.tEstado += dt;
  const protegida = c.cfg.volta;
  const volta = protegida || k.quedas <= (c.cfg.voltas || 0);
  if (k.tEstado < (protegida ? 1 : 1.4)) return;
  if (volta) {
    const p = c.pista;
    // protegida: volta logo adiante de onde saiu; senao, mais atras e devagar (perde posicoes)
    k.s = protegida ? trechoCalmo(p, k.sDecola + 4) : trechoCalmo(p, k.sDecola - 30);
    k.u = 0;
    k.vu = 0;
    k.dir = 0;
    k.v = c.cfg.vmax * (protegida ? 0.6 : 0.45);
    k.protecao = 2;
    k.estado = 'calha';
    k.empurradoPor = -1;
    posicionarNaCalha(p, k);
    k.salto = true;
    evento(c, 'voltou', k);
  } else {
    k.estado = 'fora';
    k.sFora = k.sDecola;
    k.tFora = c.t;
    c.foras++;
    evento(c, 'fora', k);
  }
}

/** Depois do mergulho: desliza na piscina e para. @param {Corrida} c @param {Corredor} k @param {number} dt */
function passoPiscina(c, k, dt) {
  k.tEstado += dt;
  const f = 1 - Math.min(1, 1.4 * dt);
  k.vx *= f;
  k.vz *= f;
  k.v *= f;
  k.x += k.vx * dt;
  k.z += k.vz * dt;
}

/**
 * Trombadas na calha: discos em (s, lateral), cada par resolvido uma vez por passo.
 * @param {Corrida} c
 */
function contatos(c) {
  const ks = c.corredores;
  const o = c.ordem;
  const F = FISICA;
  // insercao: a ordem quase nao muda de um passo para o outro
  for (let i = 1; i < o.length; i++) {
    const x = o[i];
    let j = i - 1;
    while (j >= 0 && ks[o[j]].s > ks[x].s) {
      o[j + 1] = o[j];
      j--;
    }
    o[j + 1] = x;
  }
  for (let i = 0; i < o.length; i++) {
    const a = ks[o[i]];
    if (a.estado !== 'calha' || a.protecao > 0) continue;
    for (let j = i + 1; j < o.length; j++) {
      const b = ks[o[j]];
      const alcance = F.raioContato * (a.peso + b.peso);
      if (b.s - a.s > alcance) break;
      if (b.estado !== 'calha' || b.protecao > 0) continue;
      const R = c.pista.raio[Math.min(c.pista.n - 1, Math.floor(a.s / DS))];
      const ml = ALFA_MAX * R;
      const ds = b.s - a.s;
      const dl = (b.u - a.u) * ml;
      let d = Math.hypot(ds, dl);
      if (d >= alcance) continue;
      let nx;
      let ny;
      if (d < 1e-4) {
        nx = 0;
        ny = a.id < b.id ? 1 : -1;
        d = 0;
      } else {
        nx = ds / d;
        ny = dl / d;
      }
      const wa = 1 / a.massa;
      const wb = 1 / b.massa;
      const wt = wa + wb;
      // separacao macia (so posicao, sem velocidade): metade da sobreposicao por passo
      const corr = (alcance - d) * F.separacao;
      a.s -= nx * corr * (wa / wt);
      b.s += nx * corr * (wb / wt);
      a.u -= (ny * corr * (wa / wt)) / ml;
      b.u += (ny * corr * (wb / wt)) / ml;
      // velocidades em m/s: ao longo (v) e de lado (vu * ml)
      const la = a.vu * ml;
      const lb = b.vu * ml;
      const vrel = (b.v - a.v) * nx + (lb - la) * ny;
      if (vrel >= 0) continue;
      // impulso normal (troca de velocidade), com quique so quando a batida e forte
      const e = vrel < -2 ? F.restituicao : 0;
      const jn = (-(1 + e) * vrel) / wt;
      // ao longo: quem bate por tras freia; quem e batido ganha pouco (o pelotao nao vira um trem)
      a.v = Math.max(F.velMin, a.v - jn * nx * wa);
      b.v += jn * nx * wb * F.repasse;
      let nla = la - jn * ny * wa;
      let nlb = lb + jn * ny * wb;
      // tranco lateral: proporcional a aproximacao; quem bate de lado leva menos do que quem e batido
      const fresco = c.t - a.tBatida > 0.2 && c.t - b.tBatida > 0.2;
      if (-vrel > F.aproximacaoMin && fresco) {
        const lado = Math.abs(ny) > 0.05 ? Math.sign(ny) : (a.id < b.id ? 1 : -1);
        // quem vinha de lado para cima do outro e o "batedor"
        const va = Math.max(0, la * lado);
        const vb = Math.max(0, -lb * lado);
        const fa = va + vb > 0.01 ? va / (va + vb) : 0.5;
        // o jogador batendo derruba de verdade; batido, tambem voa, um pouco menos; entre bots, menos
        const fator = (/** @type {Corredor} */ x, /** @type {Corredor} */ y) => (!x.bot ? F.trancoNoJogador : !y.bot ? F.tranco : F.trancoBots);
        const base = -vrel * (0.3 + 0.7 * Math.abs(ny));
        const tb = fator(b, a) * base * (0.35 + 0.65 * fa) * (2 * wb / wt);
        const ta = fator(a, b) * base * (0.35 + 0.65 * (1 - fa)) * (2 * wa / wt);
        nlb += lado * tb;
        nla -= lado * ta;
        // quem leva mais desliza solto por um instante (vai contra a parede)
        b.solto = Math.max(b.solto, F.tempoSolto * Math.min(1, tb / 10));
        a.solto = Math.max(a.solto, F.tempoSolto * Math.min(1, ta / 10));
        a.tBatida = c.t;
        b.tBatida = c.t;
        a.empurradoPor = b.id;
        a.tEmpurrao = c.t;
        b.empurradoPor = a.id;
        b.tEmpurrao = c.t;
        c.eventos.push({ tipo: 'empurrao', id: a.id, outro: b.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2,
          forca: Math.min(1, Math.max(tb, ta) / 12) });
      }
      a.vu = Math.max(-F.vLatMax, Math.min(F.vLatMax, nla)) / ml;
      b.vu = Math.max(-F.vLatMax, Math.min(F.vLatMax, nlb)) / ml;
    }
  }
}

/** @param {Corrida} c */
function pegarMoedas(c) {
  if (!c.moedas.length) return;
  const R = 4;
  // so o jogador pega (os bots da frente comiam todas antes dele chegar)
  for (const k of c.corredores) {
    if (k.estado !== 'calha' || k.bot) continue;
    for (const m of c.moedas) {
      if (m.pega || Math.abs(m.s - k.s) > 1.6 || Math.abs((m.u - k.u) * R) > 1.3) continue;
      m.pega = true;
      k.moedas++;
      evento(c, 'moeda', k);
    }
  }
}

/**
 * Um passo fixo da corrida.
 * @param {Corrida} c @param {number} dt
 */
export function passoCorrida(c, dt) {
  for (const k of c.corredores) guardarAnterior(k);
  if (!c.iniciada) return;
  c.t += dt;
  for (const k of c.corredores) {
    const antes = k.estado;
    switch (k.estado) {
      case 'calha': passoCalha(c, k, dt); break;
      case 'ar': if (k.final) passoFinal(c, k, dt); else passoAr(c, k, dt); break;
      case 'agua': passoAgua(c, k, dt); break;
      case 'chegou': passoPiscina(c, k, dt); break;
      default: break;
    }
    // pouso troca o lugar de uma vez: o desenho nao interpola essa troca
    if (antes === 'ar' && k.estado === 'calha') k.salto = true;
  }
  contatos(c);
  for (const k of c.corredores) if (k.estado === 'calha') posicionarNaCalha(c.pista, k);
  pegarMoedas(c);
}

/** @param {Corredor} k */
function nota(k) {
  if (k.chegada >= 0) return 1e7 - k.chegada * 100;
  if (k.estado === 'fora') return -1e6 + k.tFora;
  return k.s;
}

/**
 * Colocacao atual: quem cruzou a borda da rampa final pela ordem, depois quem corre (s maior primeiro), depois quem saiu (quem
 * saiu por ultimo fica na frente). Reaproveita o vetor recebido (sem alocar por quadro).
 * @param {Corrida} c
 * @param {Corredor[]} [saida]
 * @returns {Corredor[]}
 */
export function colocacao(c, saida) {
  const v = saida || [];
  v.length = 0;
  for (const k of c.corredores) v.push(k);
  v.sort((a, b) => nota(b) - nota(a) || a.id - b.id);
  return v;
}

/** Lugar (1..N) de um corredor. @param {Corrida} c @param {number} id */
export function lugarDe(c, id) {
  const k = c.corredores[id];
  const nk = nota(k);
  let lugar = 1;
  for (const o of c.corredores) {
    if (o === k) continue;
    const no = nota(o);
    if (no > nk || (no === nk && o.id < k.id)) lugar++;
  }
  return lugar;
}

/** Todos chegaram ou sairam. @param {Corrida} c */
export const corridaAcabou = (c) => c.corredores.every((k) => k.estado === 'chegou' || k.estado === 'fora');

/** Altura da borda (re-exportada para o desenho). */
export { alturaBorda };
