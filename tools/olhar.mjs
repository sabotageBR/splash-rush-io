// [Flume Frenzy] Conferencia visual rapida: abre o jogo do codigo-fonte (sem empacotar) no Chrome headless
// em modo ?filme e salva quadros escolhidos (em segundos de jogo) num mosaico. Ajuda a olhar voo, pouso,
// tunel e chegada sem jogar a corrida inteira.
// Uso: node tools/olhar.mjs --tamanho=960x540 --params="auto&semente=3" --em=2,8,9.5,30 [--js="..."] --saida=.tmp/olhar.jpg
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { abrirChrome } from './cdp.mjs';
import { servirLivre, RAIZ } from './servir.mjs';

const op = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const [L, A] = String(op.tamanho || '960x540').split('x').map(Number);
const fps = 30;
const em = String(op.em || '2,6,10').split(',').map(Number);
const pasta = join(RAIZ, '.tmp', 'olhar');
rmSync(pasta, { recursive: true, force: true });
mkdirSync(pasta, { recursive: true });
const srv = await servirLivre(RAIZ);
const ch = await abrirChrome({ largura: L, altura: A, escala: Number(op.escala || 1), toque: L < A, args: ['--enable-unsafe-swiftshader', '--use-angle=metal'] });
const arqs = [];
try {
  await ch.ir(`${srv.url}/index.html?filme=${fps}&lang=${op.lang || 'pt'}&${op.params || ''}`, 4000);
  if (op.js) await ch.avaliar(String(op.js));
  let q = 0;
  for (const s of em) {
    const alvo = Math.round(s * fps);
    let url = '';
    while (q <= alvo) {
      url = await ch.avaliar(`window.__jogo.quadro(${fps})`);
      q++;
    }
    const a = join(pasta, `q-${String(s).replace('.', '_')}.jpg`);
    writeFileSync(a, Buffer.from(String(url).split(',')[1], 'base64'));
    arqs.push(a);
    if (op.estado) process.stdout.write(`${s}s ${await ch.avaliar('JSON.stringify({e: __jogo.E.estado, j: __jogo.E.jogador.estado, s: Math.round(__jogo.E.jogador.s), v: Math.round(__jogo.E.jogador.v)})')}\n`);
  }
  if (ch.erros.length) process.stdout.write(`erros no console: ${ch.erros.slice(0, 5).join(' | ')}\n`);
} finally {
  await ch.fechar();
  await srv.fechar();
}
const saida = resolve(RAIZ, op.saida || '.tmp/olhar.jpg');
const col = Math.min(arqs.length, Number(op.colunas || 2));
const entradas = arqs.flatMap((a) => ['-i', a]);
const lin = Math.ceil(arqs.length / col);
const layout = arqs.map((_, i) => `${(i % col) === 0 ? '0' : Array.from({ length: i % col }, () => 'w0').join('+')}_${Math.floor(i / col) === 0 ? '0' : Array.from({ length: Math.floor(i / col) }, () => 'h0').join('+')}`).join('|');
if (arqs.length === 1) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', arqs[0], saida]);
else {
  const falta = col * lin - arqs.length;
  const extra = falta > 0 ? `;color=black:s=${L * Number(op.escala || 1)}x${A * Number(op.escala || 1)}:d=1[pad]` : '';
  void extra;
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...entradas, '-filter_complex', `xstack=inputs=${arqs.length}:layout=${layout}:fill=black`, '-frames:v', '1', saida]);
}
writeFileSync(join(pasta, 'feito'), '');
process.stdout.write(`${saida}\n`);
