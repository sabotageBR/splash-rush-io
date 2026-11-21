// [Flume Frenzy] Carga da arte (WebP recortados do Grok em src/arte/) e montagem dos atlas em canvas:
// personagens (18 x 3 angulos), boias (9) e cenario de cada parque (9). Cada sprite vai para uma celula
// quadrada, ajustado por inteiro e apoiado no fundo da celula (o "pe" do billboard fica embaixo).
// Sem a imagem (falha de rede), a celula ganha um circulo colorido: o jogo nunca trava por arte.
import * as THREE from 'three';

const dois = (i) => String(i + 1).padStart(2, '0');
export const ANGULOS = /** @type {const} */ (['costas', 'esq', 'dir']);

export const ARQ = {
  pers: (/** @type {string} */ ang, /** @type {number} */ i) => `src/arte/pers/${ang}-${dois(i)}.webp`,
  boia: (/** @type {number} */ i) => `src/arte/boias/boia-${dois(i)}.webp`,
  prop: (/** @type {string} */ parque, /** @type {number} */ i) => `src/arte/props/${parque}-${dois(i)}.webp`,
  tex: (/** @type {string} */ nome) => `src/arte/tex/${nome}.webp`,
  ceu: (/** @type {string} */ parque) => `src/arte/ceu/${parque}.webp`,
  icone: (/** @type {number} */ i) => `src/arte/icones/icone-${dois(i)}.webp`,
};

/** @param {string} url @returns {Promise<HTMLImageElement|null>} */
export function carregarImagem(url) {
  return new Promise((ok) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = url;
  });
}

/**
 * @typedef {object} Celula
 * @property {number} u0
 * @property {number} v0
 * @property {number} du
 * @property {number} dv
 * @property {number} larg fracao da celula ocupada na largura
 * @property {number} alt fracao ocupada na altura (a partir de baixo)
 */

/**
 * Atlas em canvas a partir de imagens (null vira um circulo).
 * @param {(HTMLImageElement|null)[]} imgs
 * @param {number} cel lado da celula (px)
 * @param {number} colunas
 * @returns {{ textura: THREE.CanvasTexture, celulas: Celula[], canvas: HTMLCanvasElement }}
 */
export function montarAtlas(imgs, cel, colunas) {
  const linhas = Math.ceil(imgs.length / colunas);
  const W = cel * colunas;
  const H = cel * linhas;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  /** @type {Celula[]} */
  const celulas = [];
  imgs.forEach((img, i) => {
    const cx = (i % colunas) * cel;
    const cy = Math.floor(i / colunas) * cel;
    let w = cel * 0.8;
    let h = cel * 0.8;
    if (img) {
      const e = Math.min((cel - 2) / img.width, (cel - 2) / img.height);
      w = img.width * e;
      h = img.height * e;
      g.drawImage(img, cx + (cel - w) / 2, cy + cel - h - 1, w, h);
    } else {
      g.fillStyle = `hsl(${(i * 67) % 360} 80% 60%)`;
      g.beginPath();
      g.arc(cx + cel / 2, cy + cel - h / 2, h / 2, 0, Math.PI * 2);
      g.fill();
    }
    celulas.push({ u0: cx / W, v0: 1 - (cy + cel) / H, du: cel / W, dv: cel / H, larg: w / cel, alt: (h + 1) / cel });
  });
  const textura = new THREE.CanvasTexture(cv);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  textura.generateMipmaps = true;
  textura.minFilter = THREE.LinearMipmapLinearFilter;
  return { textura, celulas, canvas: cv };
}

/**
 * Textura repetida a partir de uma imagem (ou cor chapada sem a imagem).
 * @param {HTMLImageElement|HTMLCanvasElement|null} img
 * @param {string} reserva cor
 */
export function texturaRepetida(img, reserva = '#7fd3ff') {
  /** @type {THREE.Texture} */
  let t;
  if (img) t = new THREE.Texture(img);
  else {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 4;
    const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
    g.fillStyle = reserva;
    g.fillRect(0, 0, 4, 4);
    t = new THREE.CanvasTexture(cv);
  }
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/**
 * Versao em tons de cinza (clareada) de uma imagem, para tingir com a cor de cada parque (rosa dos Doces, neve do
 * Gelo). Guarda em cache na propria imagem.
 * @param {HTMLImageElement|null} img
 * @returns {HTMLCanvasElement|HTMLImageElement|null}
 */
export function emCinza(img) {
  if (!img) return null;
  const im = /** @type {any} */ (img);
  if (im._cinza) return im._cinza;
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const l = Math.min(255, (px[i] * 0.3 + px[i + 1] * 0.55 + px[i + 2] * 0.15) * 1.15 + 20);
    px[i] = l;
    px[i + 1] = l;
    px[i + 2] = l;
  }
  g.putImageData(d, 0, 0);
  im._cinza = cv;
  return cv;
}

/**
 * Carrega tudo o que a primeira rodada precisa (e o resto dos parques sob demanda).
 * @param {(f: number) => void} progresso 0..1
 */
export async function carregarArteInicial(progresso) {
  const pedidos = [];
  for (const ang of ANGULOS) for (let i = 0; i < 18; i++) pedidos.push(ARQ.pers(ang, i));
  for (let i = 0; i < 9; i++) pedidos.push(ARQ.boia(i));
  for (let i = 0; i < 9; i++) pedidos.push(ARQ.prop('tropical', i));
  for (const n of ['agua', 'correnteza', 'areia']) pedidos.push(ARQ.tex(n));
  pedidos.push(ARQ.ceu('tropical'));
  for (let i = 0; i < 9; i++) pedidos.push(ARQ.icone(i));
  let feitos = 0;
  const imgs = await Promise.all(pedidos.map((u) => carregarImagem(u).then((im) => {
    feitos++;
    progresso(feitos / pedidos.length);
    return im;
  })));
  let k = 0;
  const pers = imgs.slice(k, (k += 54));
  const boias = imgs.slice(k, (k += 9));
  const props = imgs.slice(k, (k += 9));
  const [agua, correnteza, areia] = imgs.slice(k, (k += 3));
  const ceu = imgs[k++];
  const icones = imgs.slice(k, (k += 9));
  return {
    atlasPers: montarAtlas(pers, 256, 8),
    atlasBoias: montarAtlas(boias, 256, 3),
    atlasIcones: montarAtlas(icones, 128, 3),
    /** @type {Record<string, ReturnType<typeof montarAtlas>>} */
    props: { tropical: montarAtlas(props, 256, 3) },
    /** @type {Record<string, HTMLImageElement|null>} */
    ceu: { tropical: ceu },
    tex: { agua, correnteza, areia },
  };
}
/** @typedef {Awaited<ReturnType<typeof carregarArteInicial>>} Arte */

/**
 * Carrega o cenario de um parque (props e ceu) se ainda nao veio.
 * @param {Arte} arte @param {string} parque
 */
export async function garantirParque(arte, parque) {
  if (arte.props[parque]) return;
  const imgs = await Promise.all([...Array(9).keys()].map((i) => carregarImagem(ARQ.prop(parque, i))));
  arte.props[parque] = montarAtlas(imgs, 256, 3);
  arte.ceu[parque] = await carregarImagem(ARQ.ceu(parque));
}

/** Indice da celula de um personagem num angulo, no atlas de personagens. @param {number} p @param {number} ang 0 costas, 1 esq, 2 dir */
export const celulaPers = (p, ang) => ang * 18 + p;

/** Icones (ordem da grade do Grok). */
export const ICONE = Object.freeze({ moeda: 0, coroa: 1, presente: 2, trofeu: 3, estrela: 4, gota: 5, cadeado: 6, boia: 7, bandeira: 8 });
