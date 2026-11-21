// [kit multiportal] Videos de vitrine dos 3 portais a partir das gravacoes de gameplay (tools/gravar.mjs) e
// das capas (tools/capas.mjs). Todos mudos, H.264, sem cursor nem quadro preto.
//   crazygames/video-1920x1080.mp4   abre na capa (1,2 s) e funde no gameplay; 15 a 20 s (padrao 18)
//   crazygames/video-1080x1620.mp4   idem em 2:3 (capa 800x1200 e gameplay em retrato)
//   poki/thumb-animada.mp4           1080x1080, ~6 s, recorte quadrado do gameplay (thumb animada de hover)
//   californiagames/midias/preview.mp4   720x720, 12 s, ate 10 MB (o portal corta o quadrado do centro)
//   y8/video-1920x1080.mp4           gameplay continuo desde o 1o segundo (sem capa, sem corte), >= 15 s,
//                                    com trilha de audio muda (o painel da Y8 mostrou preto sem audio no hexadrop)
// Uso: node tools/videos.mjs --paisagem=.tmp/gameplay-16x9.mp4 --retrato=.tmp/gameplay-9x16.mp4
//                            [--quadrado=.tmp/gameplay-1x1.mp4] [--duracao=18] [--inicio=2]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RAIZ, DISTRIBUICAO } from './servir.mjs';

const op = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const DIST = DISTRIBUICAO;
const duracao = Math.max(15, Math.min(20, Number(op.duracao || 18)));
const inicio = Number(op.inicio || 2);
const arq = (p) => {
  const a = resolve(RAIZ, p);
  if (!existsSync(a)) throw new Error(`falta ${p}`);
  return a;
};
const paisagem = arq(op.paisagem || '.tmp/gameplay-16x9.mp4');
const retrato = arq(op.retrato || '.tmp/gameplay-9x16.mp4');
const quadrado = op.quadrado ? arq(op.quadrado) : null;
const ff = (a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
const cobrir = (w, h) => `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,format=yuv420p`;
const x264 = (crf) => ['-an', '-c:v', 'libx264', '-crf', String(crf), '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];

/** capa parada (1,2 s) fundindo no gameplay */
function comCapa(capa, jogo, w, h, saida) {
  mkdirSync(join(saida, '..'), { recursive: true });
  ff(['-loop', '1', '-t', '1.6', '-i', capa, '-ss', String(inicio), '-t', String(duracao), '-i', jogo,
    '-filter_complex', `[0:v]${cobrir(w, h)}[c];[1:v]${cobrir(w, h)}[j];[c][j]xfade=transition=fade:duration=0.4:offset=1.2,trim=duration=${duracao}[v]`,
    '-map', '[v]', ...x264(20), saida]);
  return saida;
}
/** recorte quadrado do gameplay */
function quadradoDe(jogo, lado, segundos, crf, saida) {
  mkdirSync(join(saida, '..'), { recursive: true });
  ff(['-ss', String(inicio), '-t', String(segundos), '-i', jogo, '-vf', cobrir(lado, lado), ...x264(crf), saida]);
  return saida;
}

/** gameplay continuo (Y8): sem capa, sem corte, com trilha de audio muda */
function continuo(jogo, w, h, saida) {
  mkdirSync(join(saida, '..'), { recursive: true });
  ff(['-ss', String(inicio), '-t', String(duracao), '-i', jogo, '-f', 'lavfi', '-t', String(duracao), '-i', 'anullsrc=r=44100:cl=stereo',
    '-vf', cobrir(w, h), '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', saida]);
  return saida;
}

const feitos = [
  comCapa(arq(join(DIST, 'crazygames/capa-1920x1080.png')), paisagem, 1920, 1080, join(DIST, 'crazygames/video-1920x1080.mp4')),
  comCapa(arq(join(DIST, 'crazygames/capa-800x1200.png')), retrato, 1080, 1620, join(DIST, 'crazygames/video-1080x1620.mp4')),
  quadradoDe(quadrado || paisagem, 1080, 6, 22, join(DIST, 'poki/thumb-animada.mp4')),
  quadradoDe(quadrado || paisagem, 720, 12, 24, join(DIST, 'californiagames/midias/preview.mp4')),
  continuo(paisagem, 1920, 1080, join(DIST, 'y8/video-1920x1080.mp4')),
];
for (const f of feitos) process.stdout.write(`${f.slice(DIST.length + 1)} (${(statSync(f).size / 1024 / 1024).toFixed(1)} MB)\n`);
if (statSync(feitos[3]).size > 10 * 1024 * 1024) process.stdout.write('ATENCAO: preview.mp4 acima de 10 MB\n');
