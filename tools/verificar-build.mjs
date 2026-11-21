// [kit multiportal] Confere a build JA MONTADA (dist/<alvo>/, do tools/empacotar.mjs) rodando no Chrome
// headless, nos pontos que a QA da Poki e da CrazyGames reprovam (resumo do hexadrop/tools/verify-build.mjs):
// - nenhum pedido a dominio externo alem do SDK do alvo (o SDK fica bloqueado: e o caso do bloqueador de
//   anuncios, e o jogo tem que abrir e jogar igual);
// - sem excecao nem console.error, com o SDK bloqueado e com o localStorage quebrado;
// - o canvas cobre a tela e o carregamento some nos quadros da Poki (640x360, 836x470, 1031x580), no
//   retrato do celular (390x844, toque) e em 1280x720;
// - o primeiro gesto real (clique no centro) liga o gameplay (portal.jaJogou).
// Fotos de cada tamanho em .tmp/verificar/<alvo>/.
// Uso: node tools/verificar-build.mjs --alvo=poki|crazygames|crazygames-basic|californiagames|todos
//      (rode antes: node tools/empacotar.mjs --alvo=<o mesmo>)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { abrirChrome, espera } from './cdp.mjs';
import { servirLivre, RAIZ } from './servir.mjs';
import { ALVOS } from './empacotar.mjs';

const TAMANHOS = [
  { l: 640, a: 360 }, { l: 836, a: 470 }, { l: 1031, a: 580 }, { l: 1280, a: 720 }, { l: 390, a: 844, toque: true, escala: 2 },
];
const QUEBRA_LS = "Object.defineProperty(window, 'localStorage', { get() { throw new Error('armazenamento bloqueado'); } });";

/** @param {string} nomeAlvo */
async function verificar(nomeAlvo) {
  const A = ALVOS[/** @type {keyof typeof ALVOS} */ (nomeAlvo)];
  const dist = join(RAIZ, 'dist', nomeAlvo);
  if (!existsSync(join(dist, 'index.html'))) throw new Error(`falta ${dist}: rode node tools/empacotar.mjs --alvo=${nomeAlvo}`);
  const fotos = join(RAIZ, '.tmp', 'verificar', nomeAlvo);
  mkdirSync(fotos, { recursive: true });
  const srv = await servirLivre(dist);
  const hostSdk = A.sdk.startsWith('http') ? new URL(A.sdk).host : '';
  const args = hostSdk ? [`--host-resolver-rules=MAP ${hostSdk} 127.0.0.1:9`] : [];
  const falhas = [];
  const cenarios = [...TAMANHOS.map((t) => ({ ...t, ls: true })), { l: 836, a: 470, ls: false }];
  for (const c of cenarios) {
    const rotulo = `${c.l}x${c.a}${c.toque ? '-toque' : ''}${c.ls ? '' : '-sem-armazenamento'}`;
    const ch = await abrirChrome({ largura: c.l, altura: c.a, toque: !!c.toque, escala: c.escala || 1, args, antes: c.ls ? '' : QUEBRA_LS });
    try {
      await ch.ir(`${srv.url}/index.html?semanuncio`, 3500);
      const e = await ch.avaliar(`(() => {
        const cv = document.querySelector('canvas');
        const r = cv ? cv.getBoundingClientRect() : null;
        return { canvas: !!cv, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
          carregando: !!document.getElementById('carregando') && !document.getElementById('carregando').classList.contains('saindo'),
          ganchos: !!window.__jogo };
      })()`);
      if (!e.canvas) falhas.push(`${rotulo}: sem canvas`);
      else if (Math.abs(e.w - c.l) > 2 || Math.abs(e.h - c.a) > 2) falhas.push(`${rotulo}: canvas ${e.w}x${e.h} nao cobre a tela`);
      if (e.carregando) falhas.push(`${rotulo}: a tela de carregamento nao saiu`);
      await ch.clicar(Math.round(c.l / 2), Math.round(c.a / 2));
      await espera(600);
      if (e.ganchos) {
        const jogou = await ch.avaliar('window.__jogo.portal.jaJogou === true');
        if (!jogou) falhas.push(`${rotulo}: o clique no centro nao ligou o gameplay`);
      }
      writeFileSync(join(fotos, `${rotulo}.png`), await ch.print());
      for (const u of ch.rede) {
        if (/^(data|blob|about|chrome):/.test(u)) continue;
        const h = new URL(u).host;
        if (h !== `127.0.0.1:${srv.porta}` && h !== hostSdk) falhas.push(`${rotulo}: pedido externo ${u}`);
      }
      for (const err of ch.erros) {
        // o SDK bloqueado de proposito pode logar falha de rede do proprio script: isso nao e do jogo
        if (hostSdk && err.includes(hostSdk)) continue;
        falhas.push(`${rotulo}: erro no console: ${String(err).slice(0, 200)}`);
      }
    } finally {
      await ch.fechar();
    }
  }
  await srv.fechar();
  return [...new Set(falhas)];
}

const arg = (process.argv.find((a) => a.startsWith('--alvo=')) || '--alvo=californiagames').slice(7);
const alvos = arg === 'todos' ? Object.keys(ALVOS) : [arg];
let ok = true;
for (const a of alvos) {
  const f = await verificar(a);
  ok = ok && !f.length;
  process.stdout.write(`${f.length ? 'FALHA' : 'ok   '} ${a}\n`);
  for (const x of f) process.stdout.write(`        - ${x}\n`);
}
process.exit(ok ? 0 : 1);
