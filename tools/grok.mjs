#!/usr/bin/env node
// [kit multiportal] Arte do jogo com o Grok Imagine em modo headless, restrito a image_gen/image_edit
// (copia adaptada de ../distribuicao/ferramentas/grok.mjs: nunca --yolo, bypass ou --always-approve). O Grok
// roda numa pasta propria fora dos repositorios (~/.cache/<jogo>-grok, git init vazio e sem CLAUDE.md).
// O codigo de saida do grok e 0 mesmo quando falha: o sucesso e medido pelo arquivo de imagem novo.
//
// FILA GLOBAL: varios jogos geram arte ao mesmo tempo. Cada chamada pega uma das GROK_VAGAS (padrao 2)
// vagas em ~/.cache/grok-fila (mkdir atomico; vaga de processo morto ou com mais de 15 min e liberada).
//
// Uso:
//   node tools/grok.mjs gerar  <id> <1:1|16:9|9:16> "<prompt>"
//   node tools/grok.mjs editar <id> <ref.png[,ref2.png]> "<prompt>" [aspecto]
//     (com uma referencia so, o Grok devolve na proporcao dela e ignora o aspecto)
//   node tools/grok.mjs lote <pedidos.json> [--paralelo=2]
//     pedidos.json: [{ "id", "modo": "gerar"|"editar", "aspecto"?, "imagens"?: [...], "prompt" }]
// Grava em arte/bruto/<id>.jpg e registra o prompt em docs/autoria.md.
//
// Sprites com fundo transparente: pedir o objeto "isolated on a perfectly flat solid magenta (#FF00FF)
// background, no shadow, no gradient, no ground, no text" e recortar com tools/sprite.mjs. Varios itens
// numa imagem so ("a 3x3 grid of 9 separate ... evenly spaced") poupam a cota: sprite.mjs --separar.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, copyFileSync, appendFileSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const NOME = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).name;
const PASTA = join(homedir(), `.cache/${NOME}-grok`);
const SESSOES = join(homedir(), '.grok/sessions', encodeURIComponent(PASTA));
const BRUTO = join(RAIZ, 'arte/bruto');
const FILA = join(homedir(), '.cache/grok-fila');
const VAGAS = Math.max(1, Number(process.env.GROK_VAGAS) || 2);
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** @param {number} pid */
function vivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return /** @type {any} */ (e).code === 'EPERM';
  }
}

/** Pega uma vaga da fila global (espera se todas estao ocupadas). @returns {Promise<string>} */
async function pegarVaga() {
  mkdirSync(FILA, { recursive: true });
  for (;;) {
    for (let i = 0; i < VAGAS; i++) {
      const d = join(FILA, `vaga-${i}`);
      try {
        mkdirSync(d);
        writeFileSync(join(d, 'dono'), `${process.pid} ${Date.now()} ${NOME}`);
        return d;
      } catch {
        try {
          const [pid, t] = readFileSync(join(d, 'dono'), 'utf8').split(' ').map(Number);
          if (!vivo(pid) || Date.now() - t > 15 * 60 * 1000) rmSync(d, { recursive: true, force: true });
        } catch {
          // sem arquivo de dono ainda: o outro processo acabou de criar
        }
      }
    }
    await espera(1500 + Math.floor(Math.random() * 2500));
  }
}

function rodar(args, ms = 420000) {
  return new Promise((ok) => {
    const p = spawn('grok', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => p.kill('SIGKILL'), ms);
    p.on('close', (codigo) => { clearTimeout(t); ok({ out, err, codigo }); });
  });
}

const imagensDaSessao = (sid) => {
  const pasta = join(SESSOES, sid, 'images');
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta).filter((n) => /\.(jpe?g|png|webp)$/i.test(n))
    .map((n) => join(pasta, n)).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
};

/** @param {{ id: string, modo: 'gerar'|'editar', aspecto?: string, imagens?: string[], prompt: string }} p */
export async function grok(p) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(p.id)) throw new Error(`id invalido: ${p.id}`);
  mkdirSync(PASTA, { recursive: true });
  if (!existsSync(join(PASTA, '.git'))) await new Promise((r) => spawn('git', ['init', '-q'], { cwd: PASTA }).on('close', r));
  mkdirSync(BRUTO, { recursive: true });
  const texto = p.prompt.replace(/'/g, '’').replace(/\s+/g, ' ').trim();
  const refs = (p.imagens || []).map((i) => resolve(RAIZ, i));
  for (const r of refs) if (!existsSync(r)) throw new Error(`referencia nao encontrada: ${r}`);
  const pedido = p.modo === 'editar'
    ? `Call image_edit exactly once with images [${refs.map((r) => `'${r}'`).join(', ')}]${p.aspecto ? ` and aspect_ratio ${p.aspecto}` : ''} and this prompt verbatim: '${texto}'. Then reply with only the returned file path.`
    : `Call image_gen exactly once with aspect ratio ${p.aspecto || '1:1'} and this prompt verbatim: '${texto}'. Then reply with only the returned file path.`;
  const vaga = await pegarVaga();
  try {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const sid = randomUUID();
      const r = await rodar(['-p', pedido, '--cwd', PASTA, '--tools', 'image_gen,image_edit', '--disable-web-search',
        '--no-subagents', '--reasoning-effort', 'low', '--output-format', 'json', '--max-turns', '4', '-s', sid]);
      if (/permission required/i.test(r.err)) throw new Error('o Grok pediu permissao (libere so image_gen/image_edit)');
      if (/login|unauthori[sz]ed|expired/i.test(r.err) && !imagensDaSessao(sid).length) throw new Error('login do Grok vencido: o usuario precisa rodar "grok login"');
      let arq = '';
      try {
        const j = JSON.parse(r.out);
        const t = String(j.text || '').trim();
        if (t && existsSync(t)) arq = t;
      } catch { /* sem json */ }
      if (!arq) arq = imagensDaSessao(sid).at(-1) || '';
      if (arq) {
        const ext = arq.match(/\.(\w+)$/)[1].toLowerCase().replace('jpeg', 'jpg');
        const destino = join(BRUTO, `${p.id}.${ext}`);
        copyFileSync(arq, destino);
        registrar(p, sid);
        return destino;
      }
      process.stderr.write(`[${p.id}] tentativa ${tentativa + 1} sem imagem: ${(r.err || r.out).slice(-300)}\n`);
      await espera(/429|rate/i.test(r.err + r.out) ? 30000 : 3000);
    }
  } finally {
    rmSync(vaga, { recursive: true, force: true });
  }
  throw new Error(`o Grok nao devolveu imagem para ${p.id}`);
}

function registrar(p, sid) {
  const arq = join(RAIZ, 'docs/autoria.md');
  mkdirSync(join(RAIZ, 'docs'), { recursive: true });
  if (!existsSync(arq)) writeFileSync(arq, `# Autoria da arte (${NOME})\n\nToda a arte bruta foi gerada com o Grok Imagine (headless, so image_gen/image_edit) por \`tools/grok.mjs\` e fica em \`arte/bruto/\`. O jogo usa versoes recortadas, reduzidas e ajustadas (\`tools/sprite.mjs\`) em \`src/arte/\`.\n\n| id | modo | data | sessao | referencias | prompt |\n|---|---|---|---|---|---|\n`);
  const data = new Date().toLocaleDateString('sv-SE');
  const lim = (s) => String(s).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  appendFileSync(arq, `| ${p.id} | ${p.modo} | ${data} | ${sid} | ${lim((p.imagens || []).join(', ') || '-')} | ${lim(p.prompt)} |\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [modo, a2, a3, a4, a5] = process.argv.slice(2);
  if (modo === 'gerar') process.stdout.write(`${await grok({ modo, id: a2, aspecto: a3, prompt: a4 })}\n`);
  else if (modo === 'editar') process.stdout.write(`${await grok({ modo, id: a2, imagens: a3.split(','), prompt: a4, aspecto: a5 })}\n`);
  else if (modo === 'lote') {
    const pedidos = JSON.parse(readFileSync(resolve(a2), 'utf8'));
    const par = Number((process.argv.find((a) => a.startsWith('--paralelo=')) || '=2').split('=')[1]);
    let i = 0;
    let falhas = 0;
    await Promise.all(Array.from({ length: Math.min(par, pedidos.length) }, async () => {
      while (i < pedidos.length) {
        const p = pedidos[i++];
        if (p.pular && existsSync(join(BRUTO, `${p.id}.jpg`))) { process.stdout.write(`pula ${p.id} (ja existe)\n`); continue; }
        try { process.stdout.write(`ok   ${p.id} -> ${await grok(p)}\n`); } catch (e) { falhas++; process.stdout.write(`ERRO ${p.id}: ${/** @type {Error} */ (e).message}\n`); }
      }
    }));
    process.exitCode = falhas ? 1 : 0;
  } else {
    process.stdout.write('uso: node tools/grok.mjs gerar <id> <aspecto> "<prompt>" | editar <id> <refs> "<prompt>" [aspecto] | lote <pedidos.json> [--paralelo=2]\n');
    process.exitCode = 2;
  }
}
