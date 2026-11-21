// [kit multiportal] Grava gameplay da build (dist/<alvo>/) quadro a quadro, sem relogio real: abre
// index.html?filme=<fps>&<params> e chama window.__jogo.quadro(fps) N vezes (o jogo avanca 1/fps e devolve
// o JPEG). Liso mesmo em maquina lenta e no 3D (crie o WebGLRenderer com preserveDrawingBuffer no ?filme).
// O bot do jogo (?auto) joga sozinho; "--js" roda antes do primeiro quadro (montar a cena boa).
// Uso: node tools/gravar.mjs --tamanho=1280x720 [--escala=1] [--segundos=22] [--fps=30] [--params="auto&fase=8"]
//                            [--js="__jogo.algo()"] [--alvo=californiagames] --saida=.tmp/gameplay-16x9.mp4
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { abrirChrome, espera } from './cdp.mjs';
import { servirLivre, RAIZ } from './servir.mjs';

const op = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const [L, A] = String(op.tamanho || '1280x720').split('x').map(Number);
const fps = Number(op.fps || 30);
const N = Math.round(Number(op.segundos || 22) * fps);
const alvo = op.alvo || 'californiagames';
const saida = resolve(RAIZ, op.saida || '.tmp/gameplay.mp4');
const dist = join(RAIZ, 'dist', alvo);
if (!existsSync(join(dist, 'index.html'))) throw new Error(`rode antes: node tools/empacotar.mjs --alvo=${alvo}`);
const pasta = join(RAIZ, '.tmp', `quadros-${L}x${A}`);
rmSync(pasta, { recursive: true, force: true });
mkdirSync(pasta, { recursive: true });

const srv = await servirLivre(dist);
const ch = await abrirChrome({ largura: L, altura: A, escala: Number(op.escala || 1), args: ['--enable-unsafe-swiftshader', '--use-angle=metal'] });
try {
  await ch.ir(`${srv.url}/index.html?filme=${fps}&semanuncio&${op.params || ''}`, 3500);
  if (!(await ch.avaliar('!!(window.__jogo && window.__jogo.quadro)'))) throw new Error('o jogo nao expoe __jogo.quadro (modo ?filme)');
  if (op.js) await ch.avaliar(String(op.js));
  for (let i = 0; i < N; i++) {
    const url = await ch.avaliar(`window.__jogo.quadro(${fps})`);
    writeFileSync(join(pasta, `q${String(i).padStart(5, '0')}.jpg`), Buffer.from(String(url).split(',')[1], 'base64'));
  }
  if (ch.erros.length) process.stdout.write(`erros no console: ${ch.erros.slice(0, 5).join(' | ')}\n`);
} finally {
  await ch.fechar();
  await srv.fechar();
}
mkdirSync(dirname(saida), { recursive: true });
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-i', join(pasta, 'q%05d.jpg'), '-an',
  '-vf', `scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`, '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', saida]);
await espera(10);
process.stdout.write(`${saida} (${N} quadros, ${(N / fps).toFixed(1)} s)\n`);
