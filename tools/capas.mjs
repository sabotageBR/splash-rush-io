// [kit multiportal] Todas as imagens de vitrine dos 3 portais a partir da arte escolhida do Grok, com o
// titulo composto por cima so onde o portal deixa (CrazyGames: so o titulo; Poki: nenhum texto).
// Le arte/capas.json:
//   { "titulo": "Quack Army", "cor": "#ffd23f", "contorno": "#1d1d2b",
//     "thumb": "arte/escolhida/thumb.jpg",          1:1 sem texto (Grok 1024x1024)
//     "fundo16x9": "arte/escolhida/capa-16x9.jpg",  cena larga (Grok 1280x720; sobe para 1920x1080)
//     "fundo9x16": "arte/escolhida/capa-9x16.jpg",  cena alta (Grok 720x1280)
//     "titulo16x9": "topo" | "esquerda" | "centro" | "alto-esquerda", "titulo9x16": "topo" | "centro" }
// Saidas (em ../distribuicao/<slug>/):
//   poki/thumb-1256.png, poki/thumb-628.png                         sem texto (e confere o contraste com #83FFE7)
//   crazygames/capa-1920x1080.png, capa-800x1200.png, capa-800x800.png   com o titulo
//   californiagames/midias/thumb.png (1024, sem texto), capa.png (1920x1080), capa-mobile.png (1080x1920)
//   y8/game-card-760x570.png, y8/promo-1920x1080.png, y8/promo-1080x1920.png        com o titulo
// Uso: node tools/capas.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { abrirChrome } from './cdp.mjs';
import { RAIZ, DISTRIBUICAO } from './servir.mjs';

const cfg = JSON.parse(readFileSync(join(RAIZ, 'arte/capas.json'), 'utf8'));
const DIST = DISTRIBUICAO;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const dataUrl = (p) => {
  const a = join(RAIZ, p);
  if (!existsSync(a)) throw new Error(`arte/capas.json aponta para arquivo ausente: ${p}`);
  return `data:${MIME[/** @type {keyof typeof MIME} */ (extname(a).toLowerCase())] || 'image/png'};base64,${readFileSync(a).toString('base64')}`;
};
const fonte = `data:font/woff2;base64,${readFileSync(join(RAIZ, 'src/ui/fontes/fredoka-latin-700-normal.woff2')).toString('base64')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param {{ fundo: string, titulo?: boolean, lugar?: string, tam: number }} o tam = altura de referencia do titulo (px)
 */
function pagina({ fundo, titulo = false, lugar = 'topo', tam }) {
  const pos = {
    topo: 'left:4%;right:4%;top:5%;text-align:center',
    esquerda: 'left:5%;top:50%;transform:translateY(-50%);width:48%;text-align:left',
    centro: 'left:4%;right:4%;top:50%;transform:translateY(-50%);text-align:center',
    // [splash-rush-io] titulo no alto a esquerda (capa 16:9 com a acao no centro-direita)
    'alto-esquerda': 'left:4.5%;top:7%;width:46%;text-align:left',
  }[lugar] || '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: F; src: url('${fonte}') format('woff2'); font-weight: 700; }
    * { margin: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    .fundo { position: absolute; inset: 0; background: url('${fundo}') center/cover no-repeat; }
    .veu { position: absolute; inset: 0; background: ${lugar === 'esquerda' ? 'linear-gradient(90deg,#0009,#0000 60%)' : lugar === 'topo' ? 'linear-gradient(180deg,#0008,#0000 40%)' : lugar === 'alto-esquerda' ? 'radial-gradient(ellipse at 22% 22%,#0007,#0000 55%)' : 'radial-gradient(#0006,#0000 70%)'}; }
    h1 { position: absolute; ${pos}; font: 700 ${tam}px/0.95 F, sans-serif; color: ${cfg.cor || '#ffd23f'};
      -webkit-text-stroke: ${Math.round(tam * 0.09)}px ${cfg.contorno || '#1d1d2b'}; paint-order: stroke fill;
      text-shadow: 0 ${Math.round(tam * 0.07)}px 0 ${cfg.contorno || '#1d1d2b'}, 0 ${Math.round(tam * 0.12)}px ${Math.round(tam * 0.2)}px #0009; letter-spacing: 0.01em; }
  </style></head><body><div class="fundo"></div>${titulo ? `<div class="veu"></div><h1>${esc(cfg.titulo)}</h1>` : ''}</body></html>`;
}

const SAIDAS = [
  { arq: 'poki/thumb-1256.png', w: 628, h: 628, esc: 2, fundo: 'thumb' },
  { arq: 'poki/thumb-628.png', w: 628, h: 628, esc: 1, fundo: 'thumb' },
  { arq: 'californiagames/midias/thumb.png', w: 512, h: 512, esc: 2, fundo: 'thumb' },
  { arq: 'crazygames/capa-800x800.png', w: 800, h: 800, esc: 1, fundo: 'thumb', titulo: true, lugar: 'topo', tam: 96 },
  { arq: 'crazygames/capa-1920x1080.png', w: 1920, h: 1080, esc: 1, fundo: 'fundo16x9', titulo: true, lugar: cfg.titulo16x9 || 'topo', tam: 150 },
  { arq: 'californiagames/midias/capa.png', w: 1920, h: 1080, esc: 1, fundo: 'fundo16x9', titulo: true, lugar: cfg.titulo16x9 || 'topo', tam: 150 },
  { arq: 'crazygames/capa-800x1200.png', w: 800, h: 1200, esc: 1, fundo: 'fundo9x16', titulo: true, lugar: cfg.titulo9x16 || 'topo', tam: 110 },
  { arq: 'californiagames/midias/capa-mobile.png', w: 540, h: 960, esc: 2, fundo: 'fundo9x16', titulo: true, lugar: cfg.titulo9x16 || 'topo', tam: 76 },
  { arq: 'y8/game-card-760x570.png', w: 760, h: 570, esc: 1, fundo: 'fundo16x9', titulo: true, lugar: 'topo', tam: 84 },
  { arq: 'y8/promo-1920x1080.png', w: 1920, h: 1080, esc: 1, fundo: 'fundo16x9', titulo: true, lugar: cfg.titulo16x9 || 'topo', tam: 150 },
  { arq: 'y8/promo-1080x1920.png', w: 540, h: 960, esc: 2, fundo: 'fundo9x16', titulo: true, lugar: cfg.titulo9x16 || 'topo', tam: 76 },
];

const ch = await abrirChrome({ largura: 800, altura: 800 });
try {
  for (const s of SAIDAS) {
    const fundo = dataUrl(cfg[s.fundo]);
    await ch.tamanho(s.w, s.h, s.esc);
    await ch.cmd('Page.setDocumentContent', { frameId: (await ch.cmd('Page.getFrameTree')).result.frameTree.frame.id, html: pagina({ fundo, titulo: !!s.titulo, lugar: s.lugar, tam: s.tam || 100 }) });
    await new Promise((r) => setTimeout(r, 700));
    const destino = join(DIST, s.arq);
    mkdirSync(join(destino, '..'), { recursive: true });
    writeFileSync(destino, await ch.print());
    process.stdout.write(`${s.arq} (${s.w * s.esc}x${s.h * s.esc})\n`);
  }
  // contraste da thumb com o fundo dos ladrilhos da Poki (#83FFE7): media da borda longe dessa cor
  const borda = await ch.avaliar(`new Promise((ok) => { const i = new Image(); i.onload = () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.drawImage(i, 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64).data; let s = 0, n = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { if (x > 3 && x < 60 && y > 3 && y < 60) continue; const k = (y * 64 + x) * 4;
      s += Math.hypot(d[k] - 0x83, d[k + 1] - 0xff, d[k + 2] - 0xe7); n++; }
    ok(s / n / 441.7); }; i.src = ${JSON.stringify(dataUrl(cfg.thumb))}; })`);
  process.stdout.write(`contraste da borda da thumb com #83FFE7: ${(borda * 100).toFixed(0)}%${borda < 0.25 ? '  <- BAIXO: a thumb some no ladrilho da Poki' : ''}\n`);
} finally {
  await ch.fechar();
}
