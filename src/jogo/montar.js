// [Flume Frenzy] Monta uma rodada a partir da configuracao: tobogan, rivais (nome, bichinho, boia e
// IA), a grade de largada com o jogador no meio do pelotao e as moedas do evento. Mais o piloto
// automatico do jogador (?auto, gravacao de video e simulacao dos testes). Puro.
import { embaralhar } from '../core/rng.js';
import { gerarPista } from './pista.js';
import { criarCorredor, criarCorrida, alinhar } from './corrida.js';
import { criarIa, decidir } from './bots.js';
import { moedasDoEvento } from './rodadas.js';
import { NOMES_BOTS, PERSONAGENS, BOIAS } from './elenco.js';

/**
 * @param {import('./rodadas.js').CfgRodada} cfg
 * @param {{ personagem: number, boia: number }} escolha
 * @param {string} [nomeJogador]
 */
export function montarRodada(cfg, escolha, nomeJogador = '') {
  const r = cfg.rng;
  const pista = gerarPista({ semente: cfg.semente, modulos: cfg.modulos, vmax: cfg.vmax });
  const nomes = embaralhar([...NOMES_BOTS], r).slice(0, cfg.nBots);
  const outrosPers = embaralhar(PERSONAGENS.map((_, i) => i).filter((i) => i !== escolha.personagem), r);
  const outrasBoias = embaralhar(BOIAS.map((_, i) => i), r);
  const total = cfg.nBots + 1;
  // o jogador larga no meio da ultima fileira (ninguem atras tapa a camera; passar o pelotao e o gosto)
  const posJog = (Math.ceil(total / 3) - 1) * 3;
  /** @type {import('./corrida.js').Corredor[]} */
  const corredores = [];
  let b = 0;
  let jogador = null;
  for (let j = 0; j < total; j++) {
    if (j === posJog) {
      jogador = criarCorredor(j, { nome: nomeJogador, bot: false, personagem: escolha.personagem, boia: escolha.boia,
        vel: 1, ima: cfg.imaJogador, peso: cfg.peso });
      jogador.ajudaDecolagem = cfg.n === 1;
      corredores.push(jogador);
      continue;
    }
    const ia = criarIa(r, cfg.dif, 0, b);
    const k = criarCorredor(j, { nome: nomes[b], bot: true, personagem: outrosPers[b % outrosPers.length],
      boia: outrasBoias[b % outrasBoias.length], vel: ia.velBase, ima: 0.25 + ia.habilidade * 0.35, peso: cfg.peso });
    ia.arrisca = pista.atalhos.map(() => r() < ia.risco);
    ia.alvoS = k.u;
    k.ia = ia;
    corredores.push(k);
    b++;
  }
  alinhar(pista, corredores);
  const moedas = cfg.evento === 'moedas' ? moedasDoEvento(pista, r) : [];
  const corrida = criarCorrida(pista, { vmax: cfg.vmax, cf: cfg.cf, volta: cfg.volta, voltas: cfg.voltas, gelo: cfg.gelo }, corredores, moedas);
  return { pista, corrida, jogador: /** @type {import('./corrida.js').Corredor} */ (jogador) };
}

/**
 * Liga o piloto automatico do jogador: um bot bom que tenta todos os atalhos.
 * @param {import('./corrida.js').Corredor} k
 * @param {number} nAtalhos
 * @param {number} [habilidade]
 */
export function ligarPiloto(k, nAtalhos, habilidade = 1) {
  k.ia = { perfil: 'piloto', habilidade, risco: 1, agressao: 0, ruido: 0.03, freq: 0.5, fase: 0, linha: 0, velBase: 1,
    elastico: 0, arrisca: Array.from({ length: nAtalhos }, () => true), louco: false,
    alvoS: k.u, desvio: 0, tDesvio: 0, alvoRival: -1, tRival: 0 };
}

/**
 * Controle de todos os bots (e do piloto) neste passo.
 * @param {import('./corrida.js').Corrida} c @param {import('./corrida.js').Corredor} jogador @param {number} [dt]
 */
export function controlarBots(c, jogador, dt = 1 / 60) {
  for (const k of c.corredores) if (k.ia) decidir(c, k, jogador, dt);
}
