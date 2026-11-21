// [Flume Frenzy] Brutos do Grok (arte/bruto/) -> arte do jogo (src/arte/), sempre do mesmo jeito:
//   personagens  pers-a-costas(-v2), pers-b-costas -> src/arte/pers/costas-01..18.webp
//                pers-a-esq-v2, pers-b-esq-v3     -> esq-01..18.webp; dir-NN = espelho do esq (mesmo desenho)
//   boias        boias                            -> src/arte/boias/boia-01..09.webp
//   cenario      props-<parque>                   -> src/arte/props/<parque>-01..09.webp
//   icones       icones-v2                        -> src/arte/icones/icone-01..09.webp (128 px)
//   texturas     tex-agua, tex-correnteza, tex-areia -> src/arte/tex/*.webp (512, sem emenda)
//   ceus         ceu-<parque>                     -> src/arte/ceu/<parque>.webp (1024 de largura)
// Cada grade tem de render exatamente 9 objetos (senao para e avisa). Bruto que falta e pulado.
// Uso: node tools/processar-arte.mjs [so=pers|boias|props|icones|tex|ceu]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname;
const B = (n) => join(RAIZ, 'arte/bruto', `${n}.jpg`);
const SAI = (d) => {
  const p = join(RAIZ, 'src/arte', d);
  mkdirSync(p, { recursive: true });
  return p;
};
const so = (process.argv.find((a) => a.startsWith('so=')) || '').slice(3);
const sprite = (...args) => execFileSync('node', [join(RAIZ, 'tools/sprite.mjs'), ...args], { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
const dois = (i) => String(i + 1).padStart(2, '0');

/** Recorta uma grade de 9 em PNGs temporarios. @returns {string[]} */
function grade(bruto, extra = ['--tol=0.1', '--suave=0.06']) {
  const tmp = join(RAIZ, '.tmp/rec', bruto);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  sprite('recortar', B(bruto), `${tmp}/`, '--separar', '--nome=x', ...extra);
  const arqs = readdirSync(tmp).filter((f) => f.endsWith('.png')).sort().map((f) => join(tmp, f));
  if (arqs.length !== 9) throw new Error(`${bruto}: ${arqs.length} objetos (esperava 9)`);
  return arqs;
}
const webp = (ent, sai, largura = 256, q = 86) => sprite('reduzir', ent, sai, `--largura=${largura}`, `--q=${q}`);
const espelhar = (ent, sai) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', ent, '-vf', 'hflip', sai]);
const tem = (n) => existsSync(B(n));

if (!so || so === 'pers') {
  const d = SAI('pers');
  const grupos = [
    // a refacao da grade A saiu mostrando o lado DIREITO (rosto para a esquerda): ela vira o dir, e o espelho o esq
    { costas: tem('pers-a-costas-v2') ? 'pers-a-costas-v2' : 'pers-a-costas', esq: tem('pers-a-esq-v2') ? 'pers-a-esq-v2' : 'pers-a-esq', base: 0, invertido: tem('pers-a-esq-v2') },
    { costas: 'pers-b-costas', esq: tem('pers-b-esq-v3') ? 'pers-b-esq-v3' : 'pers-b-esq', base: 9 },
  ];
  for (const g of grupos) {
    // fundo carmim (#e40465) perto do pelo laranja-avermelhado: tolerancia baixa (senao o panda-vermelho fica verde)
    const corte = ['--tol=0.1', '--suave=0.06'];
    if (tem(g.costas)) grade(g.costas, corte).forEach((a, i) => webp(a, join(d, `costas-${dois(g.base + i)}.webp`)));
    if (tem(g.esq)) {
      grade(g.esq, corte).forEach((a, i) => {
        const esp = a.replace(/\.png$/, '-esp.png');
        espelhar(a, esp);
        webp(g.invertido ? esp : a, join(d, `esq-${dois(g.base + i)}.webp`));
        webp(g.invertido ? a : esp, join(d, `dir-${dois(g.base + i)}.webp`));
      });
    }
  }
}
if (!so || so === 'boias') {
  const d = SAI('boias');
  if (tem('boias')) grade('boias').forEach((a, i) => webp(a, join(d, `boia-${dois(i)}.webp`)));
}
if (!so || so === 'props') {
  const d = SAI('props');
  for (const parque of ['tropical', 'doces', 'gelo']) {
    if (tem(`props-${parque}`)) grade(`props-${parque}`).forEach((a, i) => webp(a, join(d, `${parque}-${dois(i)}.webp`)));
  }
}
if (!so || so === 'icones') {
  const d = SAI('icones');
  const n = tem('icones-v2') ? 'icones-v2' : 'icones';
  if (tem(n)) grade(n).forEach((a, i) => webp(a, join(d, `icone-${dois(i)}.webp`), 128));
}
if (!so || so === 'tex') {
  const d = SAI('tex');
  for (const t of ['agua', 'correnteza', 'areia']) {
    if (tem(`tex-${t}`)) sprite('costurar', B(`tex-${t}`), join(d, `${t}.webp`), '--lado=512', '--q=80');
  }
}
if (!so || so === 'ceu') {
  const d = SAI('ceu');
  for (const parque of ['tropical', 'doces', 'gelo']) {
    if (tem(`ceu-${parque}`)) sprite('reduzir', B(`ceu-${parque}`), join(d, `${parque}.webp`), '--largura=1024', '--q=78');
  }
}
process.stdout.write('arte processada\n');
