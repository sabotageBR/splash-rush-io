// [kit multiportal] Fronteiras do codigo (as do magic_block e do solitaire-soccer, para varios portais):
// nucleo puro e ASCII, sem console.log, sem URL absoluta, nome de portal so na camada de portais, so o
// armazenamento toca o localStorage, so o main.js importa a plataforma e gameplayStart so em jogadorAgiu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname;
const arquivos = (dir) => (existsSync(join(RAIZ, dir)) ? readdirSync(join(RAIZ, dir)).flatMap((n) => {
  const p = join(dir, n);
  return statSync(join(RAIZ, p)).isDirectory() ? arquivos(p) : /\.(js|mjs)$/.test(n) ? [p] : [];
}) : []);
const ler = (p) => readFileSync(join(RAIZ, p), 'utf8');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
const CAMADA_PORTAL = /^src\/core\/(portais\/|plataforma\.js$)/;

test('src/jogo e puro: sem Math.random, DOM nem relogio; ASCII; so importa src/jogo, core/rng e vendor/planck', () => {
  for (const p of arquivos('src/jogo')) {
    const s = semComentarios(ler(p));
    assert.ok(!/Math\.random/.test(s), `${p}: Math.random`);
    assert.ok(!/\b(document|window|localStorage|performance|Date|requestAnimationFrame)\b/.test(s), `${p}: DOM ou relogio`);
    assert.ok(/^[\x00-\x7f]*$/.test(s), `${p}: caractere fora do ASCII`);
    for (const m of s.matchAll(/from\s+'([^']+)'/g)) {
      assert.ok(/^\.\/[a-z0-9-]+\.js$/.test(m[1]) || m[1] === '../core/rng.js' || m[1] === '../../vendor/planck/planck.mjs', `${p}: importa ${m[1]}`);
    }
  }
});

test('sem console.log nem URL absoluta; nome de portal so na camada de portais', () => {
  for (const p of arquivos('src')) {
    const s = semComentarios(ler(p));
    assert.ok(!/console\.(log|info|debug)/.test(s), `${p}: console.log`);
    assert.ok(!/https?:\/\//.test(s), `${p}: URL absoluta`);
    if (!CAMADA_PORTAL.test(p)) assert.ok(!/poki|crazygames|californiagames|PlataformaSDK|\by8\b/i.test(s), `${p}: nome de portal fora da camada`);
  }
});

test('so src/core/armazenamento.js toca o localStorage', () => {
  for (const p of arquivos('src')) {
    if (p.endsWith('core/armazenamento.js')) continue;
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(semComentarios(ler(p))), `${p}: armazenamento direto`);
  }
});

test('so src/main.js importa a plataforma; gameplayStart so dentro de jogadorAgiu', () => {
  for (const p of arquivos('src')) {
    if (p === 'src/main.js' || CAMADA_PORTAL.test(p)) continue;
    assert.ok(!/core\/plataforma\.js|\.\/plataforma\.js|portais\//.test(semComentarios(ler(p))), `${p}: importa a plataforma`);
  }
  const main = semComentarios(ler('src/main.js'));
  assert.equal([...main.matchAll(/portal\.gameplayStart\(\)/g)].length, 1, 'um gameplayStart so');
  const i = main.indexOf('function jogadorAgiu');
  assert.ok(i >= 0, 'falta function jogadorAgiu');
  const corpo = main.slice(i, main.indexOf('\n}', i));
  assert.ok(corpo.includes('portal.gameplayStart()'), 'gameplayStart fora de jogadorAgiu');
});

test('src/core/plataforma.js reexporta o californiagames no codigo-fonte (o empacotar troca)', () => {
  assert.ok(ler('src/core/plataforma.js').includes("export { portal, PLATAFORMA } from './portais/californiagames.js';"));
});

test('index.html: SDK relativa no <head>, antes do script do jogo; viewport-fit', () => {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
  const cabeca = html.split('</head>')[0];
  assert.ok(cabeca.includes('<script src="/sdk/v1/plataforma-sdk.js"></script>'));
  assert.ok(!/<script[^>]*type="module"[^>]*src/.test(cabeca), 'o modulo do jogo vai no fim do body');
  assert.ok(/viewport-fit=cover/.test(cabeca));
  assert.ok(!/fonts\.googleapis|cdn\.|unpkg|jsdelivr/.test(html), 'nada de CDN');
});
