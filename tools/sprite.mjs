#!/usr/bin/env node
// Sprites e texturas a partir da arte do Grok (que so sai em JPG opaco), so com ffmpeg, cwebp e Node:
// nada de ImageMagick nem Python. Mestre em jogos/distribuicao/ferramentas/sprite.mjs; o kit multiportal
// leva uma copia em tools/sprite.mjs (2026-11-20).
//
//   recortar <entrada> <saida.png|webp | pasta/> [--separar] [--chave=ff00ff] [--tol=0.20] [--suave=0.10]
//            [--margem=4] [--juntar=12] [--min=0.0015] [--largura=N] [--nome=prefixo] [--q=86]
//     Tira o fundo chapado (magenta por padrao no prompt; a cor real e medida na borda da imagem, ou
//     --chave), desfaz a mistura nas bordas (cor = a*objeto + (1-a)*fundo), tira o resto da cor do fundo
//     no contorno e apara. Com --separar, cada objeto da grade vira um arquivo (<nome>-01, -02... na ordem
//     de leitura); pedacos soltos a menos de --juntar px do vizinho ficam juntos (brilhos, gotas).
//   costurar <entrada> <saida> [--banda=0.25] [--lado=N]
//     Textura sem emenda: mistura a imagem com ela mesma deslocada meia volta (bordas continuas) e mantem
//     o miolo original. Bom para texturas organicas (madeira, agua, grama, pedra).
//   reduzir <entrada> <saida.webp|png|jpg> [--largura=N] [--altura=N] [--q=82]
//     Redimensiona (lanczos, mantendo o alfa) e converte. WebP via cwebp.
//   folha <pasta|arquivos...> <saida.png> [--celula=192]
//     Folha de conferencia: todos os PNG/WebP sobre xadrez, para olhar o recorte a olho.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, rmSync, mkdtempSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const op = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const [k, ...v] = a.slice(2).split('=');
  return [k, v.length ? v.join('=') : true];
}));
const pos = args.filter((a) => !a.startsWith('--'));
const num = (k, d) => (op[k] !== undefined && op[k] !== true ? Number(op[k]) : d);

function exec(cmd, a, input) {
  const r = spawnSync(cmd, a, { input, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`${cmd} falhou: ${String(r.stderr).slice(-400)}`);
  return r.stdout;
}

/** @param {string} arq @param {string} [vf] */
function decodificar(arq, vf) {
  const filtro = vf ? ['-vf', vf] : [];
  const sonda = exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', arq]).toString().trim().split(',').map(Number);
  let [w, h] = sonda;
  if (vf) {
    // dimensao depois do filtro: decodifica um quadro em PNG e mede
    const tmp = join(mkdtempSync(join(tmpdir(), 'sprite-')), 'q.png');
    exec('ffmpeg', ['-v', 'error', '-y', '-i', arq, ...filtro, '-frames:v', '1', tmp]);
    [w, h] = exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', tmp]).toString().trim().split(',').map(Number);
    rmSync(dirname(tmp), { recursive: true, force: true });
  }
  const px = exec('ffmpeg', ['-v', 'error', '-i', arq, ...filtro, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
  return { w, h, px: new Uint8Array(px.buffer, px.byteOffset, px.length) };
}

/** Grava RGBA cru em PNG, WebP ou JPG (opcionalmente redimensionando). */
function codificar(px, w, h, saida, { largura = 0, altura = 0, q = 86 } = {}) {
  mkdirSync(dirname(resolve(saida)), { recursive: true });
  const ext = extname(saida).toLowerCase();
  const escala = largura || altura ? ['-vf', `scale=${largura || -1}:${altura || -1}:flags=lanczos`] : [];
  const entrada = ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', '-'];
  if (ext === '.webp') {
    const tmp = join(mkdtempSync(join(tmpdir(), 'sprite-')), 'q.png');
    exec('ffmpeg', [...entrada, ...escala, '-pix_fmt', 'rgba', tmp], Buffer.from(px.buffer, px.byteOffset, px.length));
    exec('cwebp', ['-quiet', '-q', String(q), '-alpha_q', '90', '-m', '6', '-metadata', 'none', tmp, '-o', saida]);
    rmSync(dirname(tmp), { recursive: true, force: true });
  } else if (ext === '.jpg' || ext === '.jpeg') {
    exec('ffmpeg', [...entrada, ...escala, '-q:v', '3', saida], Buffer.from(px.buffer, px.byteOffset, px.length));
  } else {
    exec('ffmpeg', [...entrada, ...escala, '-pix_fmt', 'rgba', saida], Buffer.from(px.buffer, px.byteOffset, px.length));
  }
  return saida;
}

const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Cor do fundo: mediana dos pixels da borda (ou --chave). */
function corDoFundo(img) {
  if (typeof op.chave === 'string') {
    const c = op.chave.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  }
  const { w, h, px } = img;
  const canais = [[], [], []];
  const pega = (x, y) => { const i = (y * w + x) * 4; for (let c = 0; c < 3; c++) canais[c].push(px[i + c]); };
  for (let x = 0; x < w; x += 2) { pega(x, 0); pega(x, h - 1); }
  for (let y = 0; y < h; y += 2) { pega(0, y); pega(w - 1, y); }
  return canais.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
}

function recortar() {
  const [entrada, saida] = pos.slice(1);
  if (!entrada || !saida) throw new Error('uso: recortar <entrada> <saida.png|webp|pasta/> [--separar]');
  const img = decodificar(resolve(entrada));
  const { w, h, px } = img;
  const k = corDoFundo(img);
  const tol = num('tol', 0.2);
  const suave = num('suave', 0.1);
  const n = w * h;
  const alfa = new Float32Array(n);
  // 1) alfa pela distancia a cor do fundo
  for (let i = 0; i < n; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const d = Math.hypot(r - k[0], g - k[1], b - k[2]) / 441.7;
    let a = (d - tol) / suave;
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    alfa[i] = a < 0.04 ? 0 : a;
  }
  // 1b) so some o fundo LIGADO a borda (preenchimento): cor parecida com a chave DENTRO do contorno do
  //     objeto fica (um pato rosa num fundo magenta); buraco fechado so some se for quase a cor da chave.
  //     --global desliga (todo pixel perto da chave some).
  if (!op.global) {
    const ligado = new Uint8Array(n);
    const fila = new Int32Array(n);
    let ini = 0, fim = 0;
    const semear = (i) => { if (!ligado[i] && alfa[i] < 1) { ligado[i] = 1; fila[fim++] = i; } };
    for (let x = 0; x < w; x++) { semear(x); semear((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { semear(y * w); semear(y * w + w - 1); }
    while (ini < fim) {
      const i = fila[ini++];
      const x = i % w, y = (i / w) | 0;
      if (x > 0) semear(i - 1);
      if (x < w - 1) semear(i + 1);
      if (y > 0) semear(i - w);
      if (y < h - 1) semear(i + w);
    }
    for (let i = 0; i < n; i++) {
      if (ligado[i] || alfa[i] >= 1) continue;
      const d = Math.hypot(px[i * 4] - k[0], px[i * 4 + 1] - k[1], px[i * 4 + 2] - k[2]) / 441.7;
      alfa[i] = d < tol * 0.6 ? 0 : 1;
    }
  }
  // 2) desfaz a mistura com o fundo nas bordas e tira o resto da cor da chave no contorno
  const fortes = [0, 1, 2].filter((c) => k[c] >= 128);
  const fracos = [0, 1, 2].filter((c) => k[c] < 128);
  const out = new Uint8Array(n * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = alfa[i];
      if (a <= 0) continue;
      let cor = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
      if (a < 1) cor = cor.map((v, c) => Math.max(0, Math.min(255, (v - (1 - a) * k[c]) / a)));
      // contorno: algum vizinho transparente num raio de 2 px
      let contorno = a < 1;
      for (let dy = -2; dy <= 2 && !contorno; dy++) {
        for (let dx = -2; dx <= 2 && !contorno; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && alfa[yy * w + xx] === 0) contorno = true;
        }
      }
      if (contorno && fortes.length && fracos.length) {
        const sobra = Math.min(...fortes.map((c) => cor[c])) - Math.max(...fracos.map((c) => cor[c]));
        if (sobra > 0) for (const c of fortes) cor[c] -= sobra * 0.85;
      }
      out[i * 4] = cor[0];
      out[i * 4 + 1] = cor[1];
      out[i * 4 + 2] = cor[2];
      out[i * 4 + 3] = Math.round(a * 255);
    }
  }
  const margem = num('margem', 4);
  const largura = num('largura', 0);
  const q = num('q', 86);
  const ext = extname(saida) || '.png';
  const pasta = saida.endsWith('/') || !extname(saida) ? saida : dirname(saida);
  const prefixo = typeof op.nome === 'string' ? op.nome : basename(entrada, extname(entrada));
  /** @param {number[]} bb x0,y0,x1,y1 @param {(i: number) => boolean} [mantem] */
  const salvarCorte = (bb, arq, mantem) => {
    const x0 = Math.max(0, bb[0] - margem), y0 = Math.max(0, bb[1] - margem);
    const x1 = Math.min(w - 1, bb[2] + margem), y1 = Math.min(h - 1, bb[3] + margem);
    const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
    const c = new Uint8Array(cw * chh * 4);
    for (let y = 0; y < chh; y++) {
      for (let x = 0; x < cw; x++) {
        const i = (y + y0) * w + (x + x0);
        if (mantem && !mantem(i)) continue;
        c.set(out.subarray(i * 4, i * 4 + 4), (y * cw + x) * 4);
      }
    }
    codificar(c, cw, chh, arq, { largura: largura && largura < cw ? largura : 0, q });
    return `${arq} (${cw}x${chh})`;
  };
  const relatos = [`fundo ${hex(k)}`];
  if (!op.separar) {
    let bb = [w, h, -1, -1];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alfa[y * w + x] > 0) bb = [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x), Math.max(bb[3], y)];
    if (bb[2] < 0) throw new Error('nada sobrou depois de tirar o fundo (--tol alto demais?)');
    const arq = extname(saida) ? saida : join(pasta, `${prefixo}${ext}`);
    relatos.push(salvarCorte(bb, arq));
  } else {
    // componentes 8-conexos sobre alfa > 0,5
    const rot = new Int32Array(n);
    const caixas = [];
    let proximo = 0;
    const fila = new Int32Array(n);
    for (let s = 0; s < n; s++) {
      if (rot[s] || alfa[s] <= 0.5) continue;
      proximo++;
      let ini = 0, fim = 0;
      fila[fim++] = s;
      rot[s] = proximo;
      const bb = [w, h, -1, -1, 0];
      while (ini < fim) {
        const i = fila[ini++];
        const x = i % w, y = (i / w) | 0;
        bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); bb[4]++;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = yy * w + xx;
            if (!rot[j] && alfa[j] > 0.5) { rot[j] = proximo; fila[fim++] = j; }
          }
        }
      }
      caixas[proximo] = bb;
    }
    // junta pedacos proximos (union-find pelas caixas aumentadas)
    const juntar = num('juntar', 12);
    const pai = caixas.map((_, i) => i);
    const raiz = (i) => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
    for (let a = 1; a <= proximo; a++) {
      for (let b = a + 1; b <= proximo; b++) {
        const A = caixas[a], B = caixas[b];
        if (A[0] - juntar <= B[2] && B[0] - juntar <= A[2] && A[1] - juntar <= B[3] && B[1] - juntar <= A[3]) pai[raiz(a)] = raiz(b);
      }
    }
    /** @type {Map<number, { rots: Set<number>, bb: number[], area: number }>} */
    const grupos = new Map();
    for (let r = 1; r <= proximo; r++) {
      const g = raiz(r);
      const c = caixas[r];
      const gr = grupos.get(g) || { rots: new Set(), bb: [w, h, -1, -1], area: 0 };
      gr.rots.add(r);
      gr.bb = [Math.min(gr.bb[0], c[0]), Math.min(gr.bb[1], c[1]), Math.max(gr.bb[2], c[2]), Math.max(gr.bb[3], c[3])];
      gr.area += c[4];
      grupos.set(g, gr);
    }
    const minimo = num('min', 0.0015) * n;
    let lista = [...grupos.values()].filter((gr) => gr.area >= minimo);
    if (!lista.length) throw new Error('nenhum objeto separado (confira --tol e --min)');
    // ordem de leitura: linhas pela altura media
    const alturaMed = lista.map((gr) => gr.bb[3] - gr.bb[1]).sort((a, b) => a - b)[lista.length >> 1];
    lista.sort((a, b) => (a.bb[1] + a.bb[3]) / 2 - (b.bb[1] + b.bb[3]) / 2);
    const linhas = [];
    for (const gr of lista) {
      const cy = (gr.bb[1] + gr.bb[3]) / 2;
      const l = linhas.find((ln) => Math.abs(ln.cy - cy) < alturaMed * 0.5);
      if (l) l.itens.push(gr); else linhas.push({ cy, itens: [gr] });
    }
    lista = linhas.flatMap((l) => l.itens.sort((a, b) => a.bb[0] - b.bb[0]));
    // cada grupo: so os pixels dele (com 2 px de folga para o antisserrilhado do contorno)
    lista.forEach((gr, idx) => {
      const mantem = (i) => {
        if (gr.rots.has(rot[i])) return true;
        if (rot[i]) return false;
        const x = i % w, y = (i / w) | 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && gr.rots.has(rot[yy * w + xx])) return true;
        }
        return false;
      };
      relatos.push(salvarCorte(gr.bb, join(pasta, `${prefixo}-${String(idx + 1).padStart(2, '0')}${ext}`), mantem));
    });
    relatos.push(`${lista.length} objetos`);
  }
  process.stdout.write(relatos.join('\n') + '\n');
}

function costurar() {
  const [entrada, saida] = pos.slice(1);
  if (!entrada || !saida) throw new Error('uso: costurar <entrada> <saida>');
  const { w, h, px } = decodificar(resolve(entrada));
  const banda = num('banda', 0.25);
  const out = new Uint8Array(w * h * 4);
  const bw = Math.max(1, banda * w), bh = Math.max(1, banda * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const sx = (x + (w >> 1)) % w, sy = (y + (h >> 1)) % h;
      const j = (sy * w + sx) * 4;
      // peso do original: 0 na borda (fica a deslocada, que emenda com a vizinha), 1 no miolo
      const p = Math.min(1, Math.min(x, w - 1 - x) / bw) * Math.min(1, Math.min(y, h - 1 - y) / bh);
      const s = p * p * (3 - 2 * p);
      for (let c = 0; c < 3; c++) out[i + c] = px[i + c] * s + px[j + c] * (1 - s);
      out[i + 3] = 255;
    }
  }
  const lado = num('lado', 0);
  codificar(out, w, h, saida, { largura: lado, altura: lado, q: num('q', 82) });
  process.stdout.write(`${saida} (sem emenda${lado ? `, ${lado}x${lado}` : ''})\n`);
}

function reduzir() {
  const [entrada, saida] = pos.slice(1);
  if (!entrada || !saida) throw new Error('uso: reduzir <entrada> <saida.webp|png|jpg> [--largura=N] [--altura=N]');
  const { w, h, px } = decodificar(resolve(entrada));
  codificar(px, w, h, saida, { largura: num('largura', 0), altura: num('altura', 0), q: num('q', 82) });
  process.stdout.write(`${saida} (${(statSync(saida).size / 1024).toFixed(0)} KB)\n`);
}

function folha() {
  const lista = pos.slice(1, -1).flatMap((p) => (statSync(p).isDirectory()
    ? readdirSync(p).filter((f) => /\.(png|webp)$/i.test(f)).sort().map((f) => join(p, f)) : [p]));
  const saida = pos.at(-1);
  if (!lista.length || !saida) throw new Error('uso: folha <pasta|arquivos...> <saida.png>');
  const cel = num('celula', 192);
  const cols = Math.min(6, lista.length);
  const lins = Math.ceil(lista.length / cols);
  const W = cols * cel, H = lins * cel;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = ((x >> 4) + (y >> 4)) % 2 ? 205 : 245;
    out.set([v, v, v, 255], (y * W + x) * 4);
  }
  lista.forEach((arq, k) => {
    const img = decodificar(resolve(arq), `scale=${cel - 8}:${cel - 8}:force_original_aspect_ratio=decrease`);
    const ox = (k % cols) * cel + ((cel - img.w) >> 1), oy = Math.floor(k / cols) * cel + ((cel - img.h) >> 1);
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4, j = ((oy + y) * W + ox + x) * 4;
      const a = img.px[i + 3] / 255;
      for (let c = 0; c < 3; c++) out[j + c] = img.px[i + c] * a + out[j + c] * (1 - a);
    }
  });
  codificar(out, W, H, saida);
  process.stdout.write(`${saida} (${lista.length} imagens)\n`);
}

const acoes = { recortar, costurar, reduzir, folha };
const acao = acoes[/** @type {keyof typeof acoes} */ (pos[0])];
if (!acao) {
  process.stdout.write('uso: node sprite.mjs recortar|costurar|reduzir|folha ... (veja o cabecalho)\n');
  process.exit(2);
}
try {
  acao();
} catch (e) {
  process.stderr.write(`${/** @type {Error} */ (e).message}\n`);
  process.exit(1);
}
