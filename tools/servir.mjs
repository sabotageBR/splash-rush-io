// [kit multiportal] Servidor estatico minimo (porte do solitaire-soccer). Como a origem de jogos do
// californiagames.io, serve a PlataformaSDK em /sdk/ (de em_tech/plataforma/frontend/public/sdk): fora de
// um iframe do portal ela entra no modo autonomo (anuncios simulados). Sem a pasta, /sdk/ da 404 e o jogo
// roda igual, sem SDK.
// Uso: node tools/servir.mjs [porta] [--lan]   (porta padrao: "config.porta" do package.json)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = fileURLToPath(new URL('..', import.meta.url));
/** jogos/<slug> -> em_tech/plataforma; distribuicao/kit -> em_tech/plataforma */
function acharSdk() {
  for (const sobe of [['..', '..'], ['..', '..', '..']]) {
    const d = resolve(RAIZ, ...sobe, 'plataforma', 'frontend', 'public', 'sdk');
    if (existsSync(d)) return d;
  }
  return resolve(RAIZ, '..', '..', 'plataforma', 'frontend', 'public', 'sdk');
}
export const SDK_DIR = acharSdk();
export const PACOTE = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
export const PORTA = Number(PACOTE.config && PACOTE.config.porta) || 5400;
/** Pasta do jogo na distribuicao (jogos/distribuicao/<slug>/); no proprio kit, .tmp/distribuicao/. */
export const DISTRIBUICAO = existsSync(join(RAIZ, '..', 'distribuicao', 'ferramentas'))
  ? join(RAIZ, '..', 'distribuicao', PACOTE.name)
  : join(RAIZ, '.tmp', 'distribuicao');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

/**
 * @param {number} porta @param {string} [host] @param {string} [raiz] pasta servida (padrao: o projeto)
 * @returns {Promise<() => Promise<void>>} fecha o servidor
 */
export function servir(porta, host = '127.0.0.1', raiz = RAIZ) {
  const srv = createServer(async (req, res) => {
    try {
      const caminho = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
      let base = resolve(raiz);
      let rel = caminho;
      if (caminho.startsWith('/sdk/')) {
        base = SDK_DIR;
        rel = caminho.slice('/sdk'.length);
      }
      let arq = normalize(join(base, rel));
      if (arq !== base && !arq.startsWith(base + sep)) throw new Error('fora');
      if ((await stat(arq)).isDirectory()) arq = join(arq, 'index.html');
      const corpo = await readFile(arq);
      res.writeHead(200, { 'content-type': TIPOS[/** @type {keyof typeof TIPOS} */ (extname(arq).toLowerCase())] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(corpo);
    } catch {
      res.writeHead(404);
      res.end('404');
    }
  });
  return new Promise((ok, falha) => {
    srv.once('error', falha);
    srv.listen(porta, host, () => ok(() => new Promise((r) => srv.close(() => r()))));
  });
}

/** Porta livre (0) para as ferramentas automaticas: varias sessoes rodam ao mesmo tempo. */
export async function servirLivre(raiz = RAIZ) {
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const porta = /** @type {any} */ (srv.address()).port;
  await new Promise((r) => srv.close(r));
  const fechar = await servir(porta, '127.0.0.1', raiz);
  return { porta, url: `http://127.0.0.1:${porta}`, fechar };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const lan = args.includes('--lan');
  const porta = Number(args.find((a) => /^\d+$/.test(a))) || PORTA;
  await servir(porta, lan ? '0.0.0.0' : '127.0.0.1');
  process.stdout.write(`${PACOTE.name} em http://127.0.0.1:${porta}/\n`);
  if (lan) {
    for (const lista of Object.values(networkInterfaces())) {
      for (const n of lista || []) if (n.family === 'IPv4' && !n.internal) process.stdout.write(`  no celular: http://${n.address}:${porta}/\n`);
    }
  }
}
