// [Flume Frenzy] IA dos rivais (bots locais, sem servidor). Cada bot tem um perfil (cauteloso, ousado,
// brigao, veloz, distraido) que vira numeros: habilidade (quanto olha a frente, quanto compensa a curva e quao
// rapido reage), risco (mira cedo o lado de fora dos atalhos), agressao (procura encostar para dar tranco),
// ruido (balanco na linha) e uma linha preferida. A dificuldade da rodada escala tudo. Puro: o sorteio vem do
// rng da rodada.
//
// 3.0.0: o bot pilota como o jogador, com a MESMA forca limitada de direcao (`dir`). Escolhe uma linha
// (dentro da curva que vem, desviar, encostar num rival, o lado de fora antes do atalho) e um controlador
// leva o corredor ate ela, compensando a forca centrifuga na medida da habilidade. Bot ruim compensa pouco e
// atrasado: na curva fechada sobe a parede e as vezes voa. Decisoes de ultrapassar e de empurrar duram um
// tempo minimo (histerese): no pelotao ninguem fica tremendo.
// 3.1.0: no voo da rampa final, o bot faz manobras pelo plano de manobras.js (os bons fecham em pe a tempo).
import { DS, ALFA_MAX, FISICA } from './constantes.js';
import { noPonto } from './pista.js';
import { manobrarBot } from './manobras.js';

export const PERFIS = Object.freeze({
  cauteloso: { habilidade: 0.8, risco: 0.5, agressao: 0.05, ruido: 0.08, vel: 0 },
  ousado: { habilidade: 0.65, risco: 0.95, agressao: 0.2, ruido: 0.12, vel: 0.01 },
  brigao: { habilidade: 0.6, risco: 0.6, agressao: 0.9, ruido: 0.1, vel: 0 },
  veloz: { habilidade: 0.9, risco: 0.8, agressao: 0.15, ruido: 0.06, vel: 0.03 },
  distraido: { habilidade: 0.35, risco: 0.5, agressao: 0.1, ruido: 0.22, vel: -0.01 },
});
const NOMES_PERFIS = /** @type {(keyof typeof PERFIS)[]} */ (Object.keys(PERFIS));

/**
 * @typedef {object} Dificuldade
 * @property {[number, number]} botVel faixa do fator de velocidade
 * @property {number} habilidade multiplicador
 * @property {number} risco multiplicador
 * @property {number} agressao multiplicador
 * @property {number} elastico 0 sem, 1 cheio (bots perto do jogador)
 */

/**
 * @param {() => number} r rng da rodada
 * @param {Dificuldade} dif
 * @param {number} nAtalhos
 * @param {number} indice ordem do bot (varia os perfis)
 */
export function criarIa(r, dif, nAtalhos, indice) {
  const nome = NOMES_PERFIS[(indice + Math.floor(r() * 5)) % NOMES_PERFIS.length];
  const p = PERFIS[nome];
  const habilidade = Math.min(1, p.habilidade * dif.habilidade * (0.85 + r() * 0.3));
  const risco = Math.min(1, p.risco * dif.risco);
  return {
    perfil: nome,
    habilidade,
    risco,
    agressao: Math.min(1, p.agressao * dif.agressao),
    ruido: p.ruido * (0.7 + r() * 0.6),
    freq: 0.35 + r() * 0.6,
    fase: r() * 6.28,
    linha: (r() - 0.5) * 0.5,
    velBase: dif.botVel[0] + r() * (dif.botVel[1] - dif.botVel[0]) + p.vel,
    elastico: dif.elastico,
    /** decide uma vez por atalho se mira cedo o lado de fora (voo bom) */
    arrisca: Array.from({ length: nAtalhos }, () => r() < risco),
    /** os distraidos as vezes chegam no atalho pelo lado de dentro (voo tardio, e caem) */
    louco: nome === 'distraido' && r() < 0.5,
    /** estado da decisao (histerese) */
    alvoS: 0,
    desvio: 0,
    tDesvio: 0,
    alvoRival: -1,
    tRival: 0,
  };
}

const tmp = {};
const tmp2 = {};
const tmp3 = {};

/**
 * Angulo (rad, para fora da curva, >= 0) em que a forca centrifuga A = v^2*|k| fica em equilibrio com a gravidade
 * da calha e uma direcao B para dentro: A cos a - g sin a = B.
 * @param {number} A @param {number} B
 */
export function linhaDeEquilibrio(A, B) {
  const g = FISICA.gCalha;
  const r0 = Math.hypot(A, g);
  if (B >= r0) return 0;
  return Math.max(0, Math.acos(B / r0) - Math.atan2(g, A));
}

/**
 * Forca de direcao (-1..1) que leva o corredor ate a linha `alvo`, compensando a centrifuga.
 * @param {import('./corrida.js').Corrida} c @param {import('./corrida.js').Corredor} k
 * @param {number} alvo linha (u) @param {number} hab 0..1
 * @param {boolean} [compensa] compensar a centrifuga (no atalho nao: a ideia e voar)
 */
export function pilotar(c, k, alvo, hab, compensa = true) {
  const F = FISICA;
  // compensa a curva de agora (a antecipacao fica na escolha da linha)
  const a = noPonto(c.pista, k.s + k.v * 0.04, tmp3);
  const al = k.u * ALFA_MAX;
  const ml = a.raio * ALFA_MAX;
  const fisica = -F.gCalha * Math.sin(al) + k.v * k.v * a.k * c.cfg.cf * Math.cos(al);
  const ff = -fisica / F.direcao;
  // leva ate a linha: rigidez e amortecimento em m e m/s na parede
  const erro = (alvo - k.u) * ml;
  const pd = (erro * (1.4 + 1.6 * hab) - k.vu * ml * (0.5 + 0.5 * hab)) / F.direcao;
  // reflexo: subindo para a borda, o bom piloto pede tudo para dentro
  const limiar = 0.8 + (1 - hab) * 0.15;
  if (Math.abs(k.u) > limiar && k.vu * k.u > 0 && (compensa || Math.sign(k.u) !== Math.sign(alvo))) return -Math.sign(k.u);
  return Math.max(-1, Math.min(1, (compensa ? ff * (0.55 + 0.45 * hab) : 0) + pd));
}

/**
 * Decide o controle de um bot neste passo.
 * @param {import('./corrida.js').Corrida} c
 * @param {import('./corrida.js').Corredor} k
 * @param {import('./corrida.js').Corredor | null} jogador
 * @param {number} [dt]
 */
export function decidir(c, k, jogador, dt = 1 / 60) {
  const ia = k.ia;
  if (!ia) return;
  if (k.estado === 'ar') {
    k.dir = 0;
    // voo final: manobras pelo plano do bot
    if (k.final) manobrarBot(k, FISICA.gAr, dt);
    return;
  }
  if (k.estado !== 'calha') {
    ia.alvoS = k.u;
    k.dir = 0;
    return;
  }
  // elastico leve: quem esta muito longe do jogador anda um pouco diferente
  let f = 1;
  if (jogador && (jogador.estado === 'calha' || jogador.estado === 'ar') && ia.elastico > 0) {
    const d = k.s - jogador.s;
    if (d > 50) f = 1 - 0.06 * ia.elastico;
    else if (d < -80) f = 1 + 0.04 * ia.elastico;
  }
  k.vel = ia.velBase * f;

  const p = c.pista;
  const olhar = 6 + k.v * (0.25 + 0.35 * ia.habilidade);
  const a = noPonto(p, k.s + olhar, tmp);
  // linha base: na curva que vem, a altura da parede em que meia direcao segura o corredor (quem e bom chega
  // nela suave; quem nao e chega atrasado e balanca), mais a linha preferida e um balanco lento
  const A = Math.abs(a.k) * k.v * k.v * c.cfg.cf;
  const forte = A / FISICA.gCalha;
  let alvo = Math.sign(a.k) * Math.min(0.85, linhaDeEquilibrio(A, 0.5 * FISICA.direcao) / ALFA_MAX);
  alvo += ia.linha * (1 - Math.min(1, forte));
  alvo += Math.sin(c.t * ia.freq + ia.fase) * ia.ruido;

  let atalho = 0;
  let fora = 0;
  for (let j = 0; j < p.atalhos.length; j++) {
    const at = p.atalhos[j];
    const s0 = at.i0 * DS - 46;
    const s1 = at.i1 * DS;
    if (k.s < s0 || k.s > s1) continue;
    if (ia.louco && !ia.arrisca[j]) {
      // chega pelo lado de dentro: o voo sai tarde e torto
      alvo = -at.dir * 0.4;
      break;
    }
    const rapido = k.v > FISICA.velProjeto * c.cfg.vmax * 0.85;
    if (k.s >= at.i0 * DS - 4 && ((ia.arrisca[j] && rapido) || k.v > 31)) {
      // na zona: quem arrisca, ou quem vem rapido demais para segurar a curva do R1, empurra para fora
      atalho = 2;
      fora = at.dir;
      alvo = at.dir * 1.2;
    } else if (ia.arrisca[j] && rapido) {
      // quem arrisca chega cedo no lado de fora e voa logo no comeco da curva (voo bom); quem nao arrisca chega
      // pelo meio e decola mais tarde, torto (as vezes cai)
      atalho = 1;
      alvo = at.dir * 0.72;
    }
  }

  if (!atalho) {
    ia.tDesvio -= dt;
    ia.tRival -= dt;
    const ml = ALFA_MAX * a.raio;
    // empurrar: escolhe um rival por perto e fica nele por um tempo
    if (ia.agressao > 0.3) {
      if (ia.tRival <= 0) {
        ia.alvoRival = -1;
        let melhor = 1e9;
        for (const o of c.corredores) {
          if (o === k || o.estado !== 'calha') continue;
          const ds = o.s - k.s;
          if (ds < -1 || ds > 6) continue;
          const dl = Math.abs((o.u - k.u) * ml);
          if (dl > 3.5) continue;
          const peso = ds + dl + (o.bot ? 1.5 : 0);
          if (peso < melhor) {
            melhor = peso;
            ia.alvoRival = o.id;
          }
        }
        ia.tRival = 0.9;
      }
      const o = ia.alvoRival >= 0 ? c.corredores[ia.alvoRival] : null;
      if (o && o.estado === 'calha' && Math.abs(o.s - k.s) < 8) {
        // encosta pelo lado de dentro: o outro vai para a borda de fora
        const agora = noPonto(p, k.s, tmp2);
        const fora = Math.sign(agora.k) || Math.sign(o.u) || 1;
        const mira = o.u - fora * 0.2;
        alvo = alvo * (1 - ia.agressao) + mira * ia.agressao;
      }
    } else {
      // ultrapassagem: quem esta logo a frente e mais lento; o lado escolhido vale por um tempo
      if (ia.tDesvio <= 0) {
        ia.desvio = 0;
        for (const o of c.corredores) {
          if (o === k || o.estado !== 'calha') continue;
          const ds = o.s - k.s;
          if (ds < 0.5 || ds > 9 || o.v >= k.v + 0.3) continue;
          if (Math.abs((o.u - k.u) * ml) > 2) continue;
          const lado = o.u > 0.15 ? -1 : o.u < -0.15 ? 1 : (k.u >= o.u ? 1 : -1);
          ia.desvio = Math.max(-0.6, Math.min(0.6, o.u + lado * 0.6));
          break;
        }
        ia.tDesvio = ia.desvio ? 0.9 : 0.25;
      }
      if (ia.desvio) alvo = ia.desvio * 0.7 + alvo * 0.3;
    }
  }

  // suavizacao: a linha anda no maximo 2,2 u/s (o atalho reage mais rapido)
  const vel = atalho ? 5 : 2.2;
  const d = alvo - ia.alvoS;
  ia.alvoS += Math.max(-vel * dt, Math.min(vel * dt, d));
  const lim = atalho ? 1.2 : 0.75;
  const linha = Math.max(-lim, Math.min(lim, ia.alvoS));
  k.dir = fora || pilotar(c, k, linha, ia.habilidade, !atalho);
}
