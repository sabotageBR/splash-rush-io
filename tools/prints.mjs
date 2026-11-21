// [kit multiportal] Screenshots de gameplay real da build (dist/<alvo>/), por arte/prints.json:
//   [{ "nome": "meio-da-fase", "tamanho": "paisagem" | "retrato", "params": "fase=12&semente=3&auto",
//      "esperar": 2500, "js": "__jogo.algo()" }]
// paisagem = 1280x720@1,5 (1920x1080); retrato = 540x960@2 (1080x1920). Saidas:
//   ../distribuicao/<slug>/californiagames/midias/screenshot-01..NN.png (3 a 10)
//   ../distribuicao/<slug>/poki/screenshot-01..03.png (as 3 primeiras; o formulario da Poki pede 3)
//   ../distribuicao/<slug>/y8/standard-760x570-0N.png e widescreen-1280x720-0N.png (das paisagens, so
//   gameplay: a Standard vira o thumbnail das listas da Y8, com teste A/B)
// Uso: node tools/prints.mjs [--alvo=californiagames]
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { abrirChrome, espera } from './cdp.mjs';
import { servirLivre, RAIZ, DISTRIBUICAO } from './servir.mjs';

const alvo = (process.argv.find((a) => a.startsWith('--alvo=')) || '--alvo=californiagames').slice(7);
const dist = join(RAIZ, 'dist', alvo);
if (!existsSync(join(dist, 'index.html'))) throw new Error(`rode antes: node tools/empacotar.mjs --alvo=${alvo}`);
const lista = JSON.parse(readFileSync(join(RAIZ, 'arte/prints.json'), 'utf8'));
if (lista.length < 3 || lista.length > 10) throw new Error('arte/prints.json: de 3 a 10 prints');
const DIST = DISTRIBUICAO;
const cg = join(DIST, 'californiagames/midias');
const poki = join(DIST, 'poki');
const y8 = join(DIST, 'y8');
mkdirSync(cg, { recursive: true });
mkdirSync(poki, { recursive: true });
mkdirSync(y8, { recursive: true });
let nY8 = 0;
const srv = await servirLivre(dist);
const ch = await abrirChrome({ largura: 1280, altura: 720, escala: 1.5, args: ['--enable-unsafe-swiftshader', '--use-angle=metal'] });
try {
  for (const [i, p] of lista.entries()) {
    if (p.tamanho === 'retrato') await ch.tamanho(540, 960, 2);
    else await ch.tamanho(1280, 720, 1.5);
    await ch.ir(`${srv.url}/index.html?semanuncio&${p.params || ''}&r=${i}`, 3000);
    if (p.js) await ch.avaliar(p.js);
    await espera(p.esperar || 1500);
    const nome = `screenshot-${String(i + 1).padStart(2, '0')}.png`;
    writeFileSync(join(cg, nome), await ch.print());
    if (i < 3) copyFileSync(join(cg, nome), join(poki, nome));
    if (p.tamanho !== 'retrato' && nY8 < 3) {
      nY8++;
      const ff = (vf, saida) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(cg, nome), '-vf', vf, saida]);
      ff('crop=ih*4/3:ih,scale=760:570:flags=lanczos', join(y8, `standard-760x570-0${nY8}.png`));
      ff('scale=1280:720:flags=lanczos', join(y8, `widescreen-1280x720-0${nY8}.png`));
    }
    process.stdout.write(`${nome}  ${p.nome || ''}\n`);
  }
  if (ch.erros.length) process.stdout.write(`erros no console: ${ch.erros.slice(0, 5).join(' | ')}\n`);
} finally {
  await ch.fechar();
  await srv.fechar();
}
