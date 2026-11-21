// [kit multiportal] Armazenamento com reserva em memoria (porte do solitaire-soccer, que veio do
// 2048_cards), mais a fonte de dados do portal (o modulo data da CrazyGames, obrigatorio no Full Launch).
//
// O jogo continua jogavel em janela anonima, com cookies bloqueados e com o disco cheio: o localStorage
// lanca em qualquer acesso, inclusive no getter, por isso ate a obtencao do objeto fica dentro de try.
// Nada aqui lanca. Todos os jogos do californiagames.io dividem a mesma origem: toda chave leva o prefixo
// do jogo, e nada aqui apaga o que nao e dele (nunca clear()).
//
// Fonte do portal (usarFonte): quando existe, ela e lida primeiro e toda gravacao vai para as duas. Na
// primeira troca, o que so existe no navegador sobe para a fonte (o jogador nao perde o progresso).
//
// Unico modulo do jogo que toca o localStorage (test/estilo.test.js).

/**
 * @typedef {Object} StorageMinimo
 * @property {(k: string) => string|null} getItem
 * @property {(k: string, v: string) => void} setItem
 */

/**
 * @param {{ prefixo: string, obterLs?: () => StorageMinimo|null|undefined }} opcoes
 */
export function criarArmazem({ prefixo, obterLs = () => globalThis.localStorage }) {
  if (!prefixo || !/^[a-z0-9-]+\.$/.test(prefixo)) throw new Error('prefixo do armazenamento: "<jogo>." em minusculas');
  /** @type {Map<string, string>} */
  const memoria = new Map();
  /** @type {StorageMinimo|null} */
  let ls = null;
  /** @type {StorageMinimo|null} */
  let fonte = null;
  /** chaves gravadas nesta sessao (para subir para a fonte) */
  const conhecidas = new Set();
  try {
    const c = obterLs();
    if (c && typeof c.getItem === 'function' && typeof c.setItem === 'function') ls = c;
  } catch {
    ls = null;
  }

  /** @param {StorageMinimo|null} s @param {string} k */
  function lerDe(s, k) {
    if (!s) return null;
    try {
      const v = s.getItem(k);
      return typeof v === 'string' ? v : null;
    } catch {
      return null;
    }
  }

  /** @param {StorageMinimo|null} s @param {string} k @param {string} v */
  function gravarEm(s, k, v) {
    if (!s) return false;
    try {
      s.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  }

  /** @param {string} chave @param {any} [padrao] */
  function ler(chave, padrao) {
    const k = prefixo + chave;
    conhecidas.add(chave);
    let bruto = memoria.has(k) ? memoria.get(k) : null;
    if (bruto === null || bruto === undefined) bruto = lerDe(fonte, k) ?? lerDe(ls, k);
    if (bruto === null || bruto === undefined) return padrao;
    try {
      return JSON.parse(bruto);
    } catch {
      return padrao;
    }
  }

  /** @param {string} chave @param {any} valor @returns {boolean} gravou em algum lugar persistente */
  function gravar(chave, valor) {
    let bruto;
    try {
      bruto = JSON.stringify(valor);
    } catch {
      return false;
    }
    if (typeof bruto !== 'string') return false;
    const k = prefixo + chave;
    conhecidas.add(chave);
    memoria.set(k, bruto);
    const a = gravarEm(fonte, k, bruto);
    const b = gravarEm(ls, k, bruto);
    return a || b;
  }

  /**
   * Liga a fonte do portal (ou null). As chaves ja conhecidas que so existem no navegador sobem para ela.
   * @param {StorageMinimo|null} nova
   * @param {string[]} [chaves] chaves do jogo para migrar (alem das ja lidas ou gravadas)
   */
  function usarFonte(nova, chaves = []) {
    if (!nova || typeof nova.getItem !== 'function' || typeof nova.setItem !== 'function') return;
    fonte = nova;
    for (const c of new Set([...conhecidas, ...chaves])) {
      const k = prefixo + c;
      if (lerDe(fonte, k) !== null) {
        memoria.delete(k); // a nuvem manda
        continue;
      }
      const local = memoria.get(k) ?? lerDe(ls, k);
      if (local !== null && local !== undefined) gravarEm(fonte, k, local);
    }
  }

  return { ler, gravar, usarFonte, get temFonte() { return !!fonte; } };
}
