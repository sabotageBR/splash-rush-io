// [Flume Frenzy] Meta longa: moedas pela colocacao, colecao que abre sozinha quando a barra enche,
// coroas (vitorias) e o presente do dia (primeira corrida do dia vale x2, sem sequencia nem perda).
// Uma moeda so, sem loja, sem energia. Puro: o dia de hoje chega de fora ('AAAA-MM-DD').
// 3.1.0: as manobras da rampa final valem moedas (estilo) e o save lembra quantas vezes a mao-guia ensinou.
import { ORDEM_COLECAO, INICIAIS, PERSONAGENS, BOIAS } from './elenco.js';

export const VERSAO_SAVE = 1;

export function saveNovo() {
  return {
    v: VERSAO_SAVE,
    /** proxima rodada a jogar */
    rodada: 1,
    /** moedas guardadas para o proximo desbloqueio */
    moedas: 0,
    total: 0,
    coroas: 0,
    corridas: 0,
    melhorLugar: 0,
    desbloqueios: 0,
    personagens: [...INICIAIS.personagens],
    boias: [...INICIAIS.boias],
    escolha: { personagem: INICIAIS.personagens[0], boia: INICIAIS.boias[0] },
    presenteUsado: '',
    tempo: 0,
    /** voos finais com a mao-guia das manobras (ensina ate o jogador fazer uma) */
    ensinoManobra: 0,
  };
}
/** @typedef {ReturnType<typeof saveNovo>} Save */

/** Aceita qualquer coisa vinda do armazenamento e devolve um save valido. @param {any} x @returns {Save} */
export function normalizarSave(x) {
  const s = saveNovo();
  if (!x || typeof x !== 'object' || x.v !== VERSAO_SAVE) return s;
  const int = (v, d, min = 0, max = 1e9) => (Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : d);
  s.rodada = int(x.rodada, 1, 1);
  s.moedas = int(x.moedas, 0);
  s.total = int(x.total, 0);
  s.coroas = int(x.coroas, 0);
  s.corridas = int(x.corridas, 0);
  s.melhorLugar = int(x.melhorLugar, 0);
  s.desbloqueios = int(x.desbloqueios, 0, 0, ORDEM_COLECAO.length);
  s.tempo = int(x.tempo, 0);
  s.ensinoManobra = int(x.ensinoManobra, 0, 0, 99);
  const lista = (v, max, base) => [...new Set([...base, ...(Array.isArray(v) ? v : []).filter((i) => Number.isInteger(i) && i >= 0 && i < max)])];
  s.personagens = lista(x.personagens, PERSONAGENS.length, INICIAIS.personagens);
  s.boias = lista(x.boias, BOIAS.length, INICIAIS.boias);
  const e = x.escolha || {};
  s.escolha = {
    personagem: s.personagens.includes(e.personagem) ? e.personagem : s.personagens[0],
    boia: s.boias.includes(e.boia) ? e.boia : s.boias[0],
  };
  s.presenteUsado = typeof x.presenteUsado === 'string' ? x.presenteUsado.slice(0, 10) : '';
  return s;
}

/** Preco do proximo desbloqueio (null quando a colecao acabou). @param {Save} s */
export function precoProximo(s) {
  if (s.desbloqueios >= ORDEM_COLECAO.length) return null;
  return Math.min(200, 70 + s.desbloqueios * 20);
}

/** @param {Save} s */
export const proximoItem = (s) => ORDEM_COLECAO[s.desbloqueios] || null;

/**
 * Moedas de uma corrida.
 * @param {{ lugar: number, fora: boolean, progresso: number, pegas: number, derrubados: number, estilo?: number }} r
 */
export function moedasDaCorrida(r) {
  let base;
  if (r.fora) base = 5 + Math.round(10 * Math.max(0, Math.min(1, r.progresso)));
  else base = r.lugar === 1 ? 60 : r.lugar === 2 ? 40 : r.lugar === 3 ? 30 : r.lugar <= 10 ? 20 : 10;
  return base + r.pegas + r.derrubados * 5 + Math.max(0, Math.round(r.estilo || 0));
}

/** O presente do dia ainda vale hoje? @param {Save} s @param {string} hoje */
export const presenteAtivo = (s, hoje) => !!hoje && s.presenteUsado !== hoje;

/**
 * Aplica o resultado de uma corrida (devolve um save novo; nao muda o recebido).
 * @param {Save} s0
 * @param {{ lugar: number, fora: boolean, progresso: number, pegas: number, derrubados: number, segundos: number, estilo?: number }} r
 * @param {string} hoje 'AAAA-MM-DD'
 */
export function aplicarCorrida(s0, r, hoje) {
  const s = normalizarSave(JSON.parse(JSON.stringify(s0)));
  let ganhos = moedasDaCorrida(r);
  const presente = presenteAtivo(s, hoje);
  if (presente) {
    ganhos *= 2;
    s.presenteUsado = hoje;
  }
  s.corridas++;
  s.rodada++;
  s.tempo += Math.max(0, Math.round(r.segundos));
  if (!r.fora && r.lugar === 1) s.coroas++;
  if (!r.fora && (s.melhorLugar === 0 || r.lugar < s.melhorLugar)) s.melhorLugar = r.lugar;
  const novos = somarMoedas(s, ganhos);
  return { save: s, ganhos, presente, novos };
}

/**
 * Soma moedas e abre o que a barra encher (o novo ja fica vestido). Muda o save.
 * @param {Save} s @param {number} m
 * @returns {{ tipo: 'personagem'|'boia', id: number }[]}
 */
export function somarMoedas(s, m) {
  s.moedas += m;
  s.total += m;
  const novos = [];
  for (;;) {
    const preco = precoProximo(s);
    const item = proximoItem(s);
    if (preco === null || !item || s.moedas < preco) break;
    s.moedas -= preco;
    s.desbloqueios++;
    if (item.tipo === 'personagem') {
      if (!s.personagens.includes(item.id)) s.personagens.push(item.id);
      s.escolha.personagem = item.id;
    } else {
      if (!s.boias.includes(item.id)) s.boias.push(item.id);
      s.escolha.boia = item.id;
    }
    novos.push(item);
  }
  return novos;
}

/**
 * Escolhe personagem ou boia (so o que ja tem).
 * @param {Save} s @param {'personagem'|'boia'} tipo @param {number} id
 */
export function escolher(s, tipo, id) {
  if (tipo === 'personagem' && s.personagens.includes(id)) s.escolha.personagem = id;
  if (tipo === 'boia' && s.boias.includes(id)) s.escolha.boia = id;
  return s;
}
