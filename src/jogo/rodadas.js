// [Flume Frenzy] Roteiro das rodadas: parque, modulos do tobogan, rivais, dificuldade, evento e a
// novidade de cada rodada (uma a cada ~2 min, a primeira antes do minuto 2). Puro.
//
// Rodada 1: tobogan curto, dois atalhos marcados com voo assistido, 11 rivais lentos (o jogador quase
// sempre ganha). Rodadas 1-3: quem cai volta logo ao tobogan (sem derrota nos ~3 primeiros minutos).
// Rodadas 4-6: a primeira queda volta mais atras (perde posicoes); depois, cair tira da rodada.
// 3.0.0: mais rapido (vmax e a velocidade terminal no declive normal) e com quedas no perfil.
import { criarRng, hashTexto } from '../core/rng.js';

/** @typedef {'tropical'|'doces'|'gelo'} Parque */
/** @typedef {null|'moedas'|'gigantes'|'por-do-sol'|'turbo'} Evento */

export const PARQUES = /** @type {Parque[]} */ (['tropical', 'doces', 'gelo']);
/** Rodada em que cada parque abre. */
export const ABRE_PARQUE = Object.freeze({ tropical: 1, doces: 4, gelo: 7 });

/** @param {number} n */
export function parqueDaRodada(n) {
  if (n <= 3) return 'tropical';
  if (n <= 6) return 'doces';
  if (n <= 8) return 'gelo';
  return PARQUES[n % 3];
}

/** @param {number} n */
export function eventoDaRodada(n) {
  if (n === 5) return 'moedas';
  if (n === 8) return 'gigantes';
  if (n < 9 || n % 2 === 0) return null;
  return /** @type {Evento} */ (['moedas', 'gigantes', 'por-do-sol', 'turbo'][Math.floor((n - 9) / 2) % 4]);
}

/** Chave de texto da novidade da rodada (null quando nao ha). @param {number} n */
export function novidadeDaRodada(n) {
  return ({ 2: 'novRampa', 3: 'novTunel', 4: 'novDoces', 5: 'novMoedas', 6: 'novParede', 7: 'novGelo', 8: 'novGigantes' })[n]
    || (n >= 9 && eventoDaRodada(n) ? `ev-${eventoDaRodada(n)}` : null);
}

/**
 * @param {number} n rodada (1..)
 * @param {number} sementeBase semente da sessao
 */
export function configRodada(n, sementeBase) {
  const semente = hashTexto(`rodada-${n}-${sementeBase}`);
  const r = criarRng(semente);
  const parque = parqueDaRodada(n);
  const evento = eventoDaRodada(n);
  /** @type {import('./pista.js').Modulo[]} */
  const modulos = [{ tipo: 'largada' }];
  if (n === 1) {
    modulos.push({ tipo: 'reta', len: 34 }, { tipo: 'ondas' }, { tipo: 'atalho', marcado: true }, { tipo: 'queda' },
      { tipo: 'atalho', marcado: true }, { tipo: 'ondas' }, { tipo: 'curva' }, { tipo: 'queda' },
      { tipo: 'atalho' }, { tipo: 'curva' }, { tipo: 'chegada' });
  } else if (n === 2) {
    modulos.push({ tipo: 'reta', len: 30 }, { tipo: 'rampa' }, { tipo: 'atalho', marcado: true },
      { tipo: 'queda' }, { tipo: 'curva' }, { tipo: 'ondas' }, { tipo: 'atalho' }, { tipo: 'curva' },
      { tipo: 'queda' }, { tipo: 'atalho' }, { tipo: 'rampa' }, { tipo: 'curva' }, { tipo: 'chegada' });
  } else if (n === 3) {
    modulos.push({ tipo: 'reta', len: 30 }, { tipo: 'tunel' }, { tipo: 'atalho' }, { tipo: 'queda' }, { tipo: 'turbo' },
      { tipo: 'curva' }, { tipo: 'atalho' }, { tipo: 'queda' }, { tipo: 'tunel' }, { tipo: 'turbo' },
      { tipo: 'curva' }, { tipo: 'atalho' }, { tipo: 'ondas' }, { tipo: 'rampa' }, { tipo: 'curva' }, { tipo: 'turbo' }, { tipo: 'chegada' });
  } else {
    // rodadas abertas: sorteio com garantias (3 ou 4 atalhos, a novidade da rodada presente)
    const pool = ['ondas', 'curva', 'rampa', 'tunel', 'turbo', 'ondas', 'curva', 'queda', 'queda'];
    const total = Math.min(16, 10 + Math.floor((n - 4) / 3));
    const nAtalhos = n >= 10 ? 5 : 4;
    const posAtalhos = new Set();
    while (posAtalhos.size < nAtalhos) posAtalhos.add(1 + Math.floor(r() * (total - 1)));
    let paredes = n >= 6 ? 1 + (n >= 12 ? 1 : 0) : 0;
    modulos.push({ tipo: 'reta', len: 28 });
    for (let j = 0; j < total; j++) {
      if (posAtalhos.has(j)) {
        const parede = paredes > 0 && (n === 6 || r() < 0.6);
        if (parede) paredes--;
        modulos.push({ tipo: 'atalho', parede, marcado: n === 6 && parede });
      } else {
        let t = pool[Math.floor(r() * pool.length)];
        if (evento === 'turbo' && r() < 0.5) t = 'turbo';
        modulos.push({ tipo: t });
      }
    }
    modulos.push({ tipo: 'chegada' });
  }

  const nBots = n === 1 ? 11 : n <= 3 ? 15 : 19;
  /** @type {import('./bots.js').Dificuldade} */
  const dif = {
    botVel: n === 1 ? [0.7, 0.79] : n === 2 ? [0.79, 0.9] : n === 3 ? [0.84, 0.95]
      : [Math.min(0.9, 0.8 + (n - 4) * 0.01), Math.min(0.98, 0.9 + (n - 4) * 0.008)],
    habilidade: n === 1 ? 0.6 : n <= 3 ? 0.8 : Math.min(1.15, 0.9 + (n - 4) * 0.03),
    risco: n === 1 ? 0 : n === 2 ? 0.4 : n === 3 ? 0.6 : Math.min(1, 0.7 + (n - 4) * 0.03),
    agressao: n === 1 ? 0 : n === 2 ? 0.3 : n === 3 ? 0.5 : Math.min(1, 0.6 + (n - 4) * 0.04),
    elastico: n === 1 ? 0 : 1,
  };
  return {
    n,
    semente,
    parque,
    evento,
    novidade: novidadeDaRodada(n),
    modulos,
    nBots,
    dif,
    vmax: n === 1 ? 34 : n === 2 ? 35 : n === 3 ? 36 : 37 + Math.min(4, (n - 4) * 0.4),
    cf: 1,
    volta: n <= 3,
    voltas: n <= 6 ? 1 : 0,
    imaJogador: n === 1 ? 1 : n === 2 ? 0.8 : n === 3 ? 0.65 : 0.5,
    gelo: parque === 'gelo' ? 1 : 0,
    peso: evento === 'gigantes' ? 1.6 : 1,
    rng: r,
  };
}
/** @typedef {ReturnType<typeof configRodada>} CfgRodada */

/**
 * Moedas espalhadas no tobogan (evento "moedas"): fileiras de 5 em trechos retos.
 * @param {import('./pista.js').Pista} pista
 * @param {() => number} r
 */
export function moedasDoEvento(pista, r) {
  /** @type {{ s: number, u: number }[]} */
  const m = [];
  const DSx = pista.comprimento / (pista.n - 1);
  for (let i = pista.iLargada + 30; i < pista.n - 20; i += 12) {
    if (Math.abs(pista.k[i]) > 0.01) continue;
    const u = (r() - 0.5) * 1.2;
    for (let j = 0; j < 5; j++) m.push({ s: (i + j * 1.5) * DSx, u });
  }
  return m;
}
