// [kit multiportal] Monta a build de um portal a partir do mesmo codigo (porte dos empacotadores do
// slime-merge, multi-alvo, e do solitaire-soccer, californiagames.io).
// Uso: node tools/empacotar.mjs --alvo=poki|crazygames|crazygames-basic|californiagames|todos [--ensaio]
//
// Para cada alvo:
// - copia index.html, LICENCAS.txt, src/ e vendor/ (se houver) para dist/<alvo>/ (ferramentas, testes,
//   arte bruta e documentacao ficam fora);
// - src/core/plataforma.js passa a reexportar portais/<adaptador>.js e os outros adaptadores saem;
//   crazygames-basic grava ANUNCIOS = false (Basic Launch: nenhum botao de video);
// - a tag da SDK no index.html vira a do alvo (unica URL externa permitida);
// - "kit.trocas" do package.json: { "<alvo>": [["arquivo", "de", "para"]] } (o "de" exatamente uma vez);
// - confere: URL absoluta (fora a SDK do alvo), console.log, .map, extensao proibida, lixo do sistema,
//   import quebrado, nome de outro portal (sem comentarios; vendor/ fica de fora destes testes de texto e
//   e conferido na execucao pelo tools/verificar-build.mjs), viewport-fit, SDK no <head> antes dos modulos,
//   limite de arquivos e de tamanho (Poki: 8 MB no total e aviso acima de 5 MB; CrazyGames: 1.500 arquivos);
// - zipa (index.html na raiz) em dist/<slug>-<alvo>-<versao>.zip + .sha256 e copia para
//   ../distribuicao/<slug>/<pasta do portal>/build/.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { RAIZ, PACOTE } from './servir.mjs';

const SDK_CG = '/sdk/v1/plataforma-sdk.js';
const TAG_CG = `<script src="${SDK_CG}"></script>`;
const MB = 1024 * 1024;

export const ALVOS = {
  poki: {
    pasta: 'poki', adaptador: 'poki', sdk: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
    proibido: /crazygames|californiagames|plataforma-sdk|PlataformaSDK|\by8\b/i, maxArquivos: 1500, maxMb: 8, avisoMb: 5,
  },
  crazygames: {
    pasta: 'crazygames', adaptador: 'crazygames', sdk: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
    proibido: /poki|californiagames|plataforma-sdk|PlataformaSDK|\by8\b/i, maxArquivos: 1500, maxMb: 50, avisoMb: 20,
  },
  'crazygames-basic': {
    pasta: 'crazygames', adaptador: 'crazygames', sdk: 'https://sdk.crazygames.com/crazygames-sdk-v3.js', basico: true,
    proibido: /poki|californiagames|plataforma-sdk|PlataformaSDK|\by8\b/i, maxArquivos: 1500, maxMb: 50, avisoMb: 20,
  },
  californiagames: {
    pasta: 'californiagames', adaptador: 'californiagames', sdk: SDK_CG,
    proibido: /poki|crazygames|\by8\b/i, maxArquivos: 5000, maxMb: 250, avisoMb: 8,
  },
  // Y8: SDK async do CDN deles; appId e gameId do Developer Portal em package.json "kit.ids.y8"
  // (sem eles o zip sai "-sem-id": o SDK nao inicia, so para teste)
  y8: {
    pasta: 'y8', adaptador: 'y8', sdk: 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js', async: true, ids: ['appId', 'gameId'],
    // se o script nao carregar (bloqueador de anuncio), o adaptador segue na hora em vez de esperar o prazo do init
    eventoFalha: 'y8sdk.falhou',
    proibido: /poki|crazygames|californiagames|plataforma-sdk|PlataformaSDK/i, maxArquivos: 1500, maxMb: 50, avisoMb: 8,
  },
};
/** @param {{ sdk: string, async?: boolean, eventoFalha?: string }} A */
const tagDe = (A) =>
  `<script src="${A.sdk}"${A.async ? ' async' : ''}${A.eventoFalha ? ` onerror="window.__sdkFalhou=1;window.dispatchEvent(new Event('${A.eventoFalha}'))"` : ''}></script>`;
const PROIBIDAS = new Set(['.sh', '.py', '.php', '.exe', '.jar', '.bat', '.cmd', '.dll', '.so', '.dylib', '.pl', '.rb', '.cgi', '.map', '.ts', '.md']);

/** @param {string} d @returns {string[]} */
export const listar = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? listar(p) : [p];
});
/** @param {string} t */
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/**
 * @param {string} nomeAlvo
 * @param {{ ensaio?: boolean }} [o]
 * @returns {{ ok: boolean, zip?: string, dist: string, falhas: string[], avisos: string[] }}
 */
export function empacotar(nomeAlvo, { ensaio = false } = {}) {
  const A = ALVOS[/** @type {keyof typeof ALVOS} */ (nomeAlvo)];
  if (!A) throw new Error(`alvo desconhecido: ${nomeAlvo} (${Object.keys(ALVOS).join(', ')}, todos)`);
  const SLUG = PACOTE.name;
  const versao = PACOTE.version;
  const dist = join(RAIZ, 'dist', nomeAlvo);
  const falhas = [];
  const avisos = [];

  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  for (const item of ['index.html', 'LICENCAS.txt', 'src', 'vendor']) {
    if (existsSync(join(RAIZ, item))) cpSync(join(RAIZ, item), join(dist, item), { recursive: true });
    else if (item !== 'vendor') falhas.push(`falta ${item}`);
  }
  for (const f of listar(dist)) if (/(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/.test(f)) rmSync(f);

  // 1) o portal do alvo
  const plat = join(dist, 'src/core/plataforma.js');
  const linha = "export { portal, PLATAFORMA } from './portais/californiagames.js';";
  const tPlat = existsSync(plat) ? readFileSync(plat, 'utf8') : '';
  if (tPlat.split(linha).length !== 2) falhas.push(`src/core/plataforma.js sem a linha (uma vez): ${linha}`);
  else writeFileSync(plat, tPlat.replace(linha, `export { portal, PLATAFORMA } from './portais/${A.adaptador}.js';`));
  const pastaPortais = join(dist, 'src/core/portais');
  const fica = new Set([`${A.adaptador}.js`, ...(A.adaptador === 'californiagames' ? [] : ['fila-sdk.js'])]);
  if (existsSync(pastaPortais)) for (const f of readdirSync(pastaPortais)) if (!fica.has(f)) rmSync(join(pastaPortais, f));
  // ids do painel do portal (Y8): package.json "kit.ids.<alvo>"
  let semId = false;
  if (A.ids) {
    const ids = (PACOTE.kit && PACOTE.kit.ids && PACOTE.kit.ids[nomeAlvo]) || {};
    const arq = join(pastaPortais, `${A.adaptador}.js`);
    const t = readFileSync(arq, 'utf8');
    const vazio = 'export const IDS = {};';
    const preenchidos = Object.fromEntries(A.ids.filter((k) => ids[k]).map((k) => [k, String(ids[k])]));
    semId = A.ids.some((k) => !ids[k]);
    if (t.split(vazio).length !== 2) falhas.push(`${A.adaptador}.js sem "${vazio}" para gravar os ids`);
    else writeFileSync(arq, t.replace(vazio, `export const IDS = ${JSON.stringify(preenchidos)};`));
    if (semId) avisos.push(`SEM ${A.ids.filter((k) => !ids[k]).join(' e ')} (package.json "kit.ids.${nomeAlvo}"): zip so para teste, o SDK nao inicia`);
  }
  if (A.basico) {
    const arq = join(pastaPortais, 'crazygames.js');
    const t = readFileSync(arq, 'utf8');
    const ligado = 'export const ANUNCIOS = true;';
    if (t.split(ligado).length !== 2) falhas.push(`crazygames.js sem "${ligado}"`);
    else writeFileSync(arq, t.replace(ligado, 'export const ANUNCIOS = false;'));
  }

  // 2) a tag da SDK
  const htmlArq = join(dist, 'index.html');
  let html = readFileSync(htmlArq, 'utf8');
  if (html.split(TAG_CG).length !== 2) falhas.push(`index.html sem a tag ${TAG_CG} (uma vez) para trocar`);
  else if (A.sdk !== SDK_CG) html = html.replace(TAG_CG, tagDe(A));
  writeFileSync(htmlArq, html);

  // 3) trocas proprias do jogo
  const trocas = (PACOTE.kit && PACOTE.kit.trocas && PACOTE.kit.trocas[nomeAlvo]) || [];
  for (const [arq, de, para] of trocas) {
    const p = join(dist, arq);
    const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
    if (t.split(de).length !== 2) { falhas.push(`${arq} sem "${de}" (uma vez) para trocar`); continue; }
    writeFileSync(p, t.replace(de, para));
  }

  // 4) conferencias
  const arquivos = listar(dist);
  const cabeca = html.split('</head>')[0];
  if (!/viewport-fit=cover/.test(cabeca)) falhas.push('index.html sem viewport-fit=cover');
  if (!cabeca.includes(tagDe(A))) falhas.push('a tag da SDK deve ficar no <head>');
  const iModulo = cabeca.search(/<script[^>]*type="module"/);
  if (iModulo >= 0 && cabeca.indexOf(A.sdk) > iModulo) falhas.push('a SDK deve vir antes dos scripts do jogo');
  // importmap: os destinos existem
  for (const m of html.matchAll(/"([^"]+)":\s*"(\.\/[^"]+)"/g)) if (!existsSync(join(dist, m[2]))) falhas.push(`importmap aponta para arquivo ausente: ${m[2]}`);
  if (arquivos.length > A.maxArquivos) falhas.push(`${arquivos.length} arquivos (limite ${A.maxArquivos})`);
  let bruto = 0;
  let gz = 0;
  for (const p of arquivos) {
    const r = relative(dist, p);
    const dados = readFileSync(p);
    bruto += dados.length;
    gz += /\.(png|jpe?g|webp|mp3|ogg|mp4|woff2|glb)$/i.test(p) ? dados.length : gzipSync(dados, { level: 9 }).length;
    if (PROIBIDAS.has(extname(p).toLowerCase())) falhas.push(`extensao proibida: ${r}`);
    if (/plataforma-sdk/.test(r)) falhas.push('a SDK nao vai dentro do build');
    if (r.startsWith('vendor/') || !/\.(html|js|mjs|css|json)$/.test(p)) continue;
    const t = dados.toString('utf8');
    const s = semComentarios(t);
    for (const u of s.match(/https?:\/\/[^\s"'`)<>]+/g) || []) if (u !== A.sdk) falhas.push(`URL absoluta em ${r}: ${u}`);
    if (/console\.(log|info|debug)\s*\(/.test(s)) falhas.push(`console.log em ${r}`);
    const marca = s.match(A.proibido);
    if (marca && !(r === 'index.html' && s.includes(A.sdk) && !s.replace(A.sdk, '').match(A.proibido))) falhas.push(`nome de outro portal em ${r}: ${marca[0]}`);
    if (/\.(js|mjs)$/.test(p)) {
      for (const m of s.matchAll(/(?:import|export)\s*(?:[^'"]*from\s*)?\(?\s*'(\.[^']+)'/g)) {
        if (!existsSync(join(p, '..', m[1]))) falhas.push(`import quebrado em ${r}: ${m[1]}`);
      }
    }
  }
  if (bruto > A.maxMb * MB) falhas.push(`build com ${(bruto / MB).toFixed(1)} MB (limite ${A.maxMb} MB)`);
  else if (bruto > A.avisoMb * MB) avisos.push(`build com ${(bruto / MB).toFixed(1)} MB (meta: ate ${A.avisoMb} MB)`);
  if (falhas.length || ensaio) return { ok: !falhas.length, dist, falhas, avisos };

  // 5) zip + sha256 + copia para a distribuicao
  const nome = `${SLUG}-${nomeAlvo}-${versao}${semId ? '-sem-id' : ''}`;
  const zip = join(RAIZ, 'dist', `${nome}.zip`);
  rmSync(zip, { force: true });
  const z = spawnSync('zip', ['-qr', '-X', zip, '.'], { cwd: dist, encoding: 'utf8' });
  if (z.status !== 0) return { ok: false, dist, falhas: [`zip falhou: ${z.stderr}`], avisos };
  const teste = spawnSync('unzip', ['-tq', zip], { encoding: 'utf8' });
  const lista = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).stdout.trim().split('\n');
  if (teste.status !== 0 || !lista.includes('index.html') || lista.some((n) => /__MACOSX|\.DS_Store/.test(n))) {
    return { ok: false, dist, falhas: ['zip invalido, sem index.html na raiz ou com lixo do sistema'], avisos };
  }
  const sha = createHash('sha256').update(readFileSync(zip)).digest('hex');
  writeFileSync(join(RAIZ, 'dist', `${nome}.sha256`), `${sha}  ${nome}.zip\n`);
  const distribuicao = join(RAIZ, '..', 'distribuicao');
  if (existsSync(distribuicao) && SLUG !== 'kit') {
    const copia = join(distribuicao, SLUG, A.pasta, 'build');
    mkdirSync(copia, { recursive: true });
    cpSync(zip, join(copia, `${nome}.zip`));
    cpSync(join(RAIZ, 'dist', `${nome}.sha256`), join(copia, `${nome}.sha256`));
  }
  avisos.unshift(`${arquivos.length} arquivos, ${(bruto / 1024).toFixed(0)} KB (${(gz / 1024).toFixed(0)} KB comprimido), sha256 ${sha.slice(0, 12)}`);
  return { ok: true, zip, dist, falhas, avisos };
}

if (process.argv[1] && process.argv[1].endsWith('empacotar.mjs')) {
  const arg = (process.argv.find((a) => a.startsWith('--alvo=')) || '--alvo=californiagames').slice(7);
  const ensaio = process.argv.includes('--ensaio');
  const alvos = arg === 'todos' ? Object.keys(ALVOS) : [arg];
  let ok = true;
  for (const a of alvos) {
    const r = empacotar(a, { ensaio });
    ok = ok && r.ok;
    process.stdout.write(`${r.ok ? 'ok   ' : 'FALHA'} ${a}${r.zip ? `: ${relative(RAIZ, r.zip)}` : ensaio ? ' (ensaio, sem zip)' : ''}\n`);
    for (const f of r.falhas) process.stdout.write(`        - ${f}\n`);
    for (const f of r.avisos) process.stdout.write(`        ${f}\n`);
  }
  process.exit(ok ? 0 : 1);
}
