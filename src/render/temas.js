// [Flume Frenzy] Cores de cada parque (bible de arte do docs/GDD.md). As texturas do Grok sao as da
// Ilha Tropical; os outros parques tingem as mesmas texturas e trocam o cenario e o ceu.

/**
 * @typedef {object} Tema
 * @property {string} calha cor da calha
 * @property {string} calha2 segunda cor (listras dos Doces)
 * @property {string} borda borda da calha
 * @property {string} correnteza tinta da agua que corre na calha
 * @property {string} lagoa tinta da lagoa
 * @property {string} piscina tinta da piscina
 * @property {string} areia tinta das ilhas
 * @property {string} pilar
 * @property {string} tunel
 * @property {string} ceuTopo
 * @property {string} ceuHorizonte
 * @property {string} nevoa
 * @property {string} luz cor do sol
 * @property {string} chao cor do hemisferio de baixo
 * @property {boolean} [cinza] tinge versoes em cinza da lagoa e das ilhas (parques que nao sao o tropical)
 * @property {boolean} [cinzaCorrenteza] tambem a agua que corre na calha (Gelo)
 * @property {string} [pano] tinta do panorama do ceu
 */

/** @type {Record<string, Tema>} */
export const TEMAS = {
  tropical: {
    calha: '#ff7a3d', calha2: '#ff7a3d', borda: '#fff4e0', correnteza: '#bff6ff', lagoa: '#ffffff', piscina: '#d6fbff',
    areia: '#ffffff', pilar: '#f2efe6', tunel: '#ffd23f', ceuTopo: '#3fa9f5', ceuHorizonte: '#bfeeff', nevoa: '#bfeaf5',
    luz: '#fff6e0', chao: '#5fb8a0',
  },
  doces: {
    calha: '#ff8fc8', calha2: '#7fe8c8', borda: '#ffffff', correnteza: '#e8fbff', lagoa: '#ff9fd2', piscina: '#ffd6ef',
    areia: '#ffe2c4', pilar: '#fff3d6', tunel: '#b98cff', ceuTopo: '#c9a7ff', ceuHorizonte: '#ffe1f3', nevoa: '#f7dcf0',
    luz: '#fff0f6', chao: '#d98cc0', cinza: true,
  },
  gelo: {
    calha: '#4fb8ff', calha2: '#4fb8ff', borda: '#ffffff', correnteza: '#d8f4ff', lagoa: '#7cc6f2', piscina: '#e6faff',
    areia: '#f4fbff', pilar: '#e8f6ff', tunel: '#bdebff', ceuTopo: '#6db7f2', ceuHorizonte: '#e8f7ff', nevoa: '#dcf1fb',
    luz: '#f4fbff', chao: '#9fc8e0', cinza: true, cinzaCorrenteza: true,
  },
};

/** Por do sol (evento): so a luz e o ceu mudam. */
export const POR_DO_SOL = { ceuTopo: '#5b4bb7', ceuHorizonte: '#ffb36b', nevoa: '#f2b48c', luz: '#ffc48a', chao: '#7a5aa0',
  pano: '#ffb48c', lagoa: '#f2a0b0', cinza: true, areia: '#ffd8a0' };
