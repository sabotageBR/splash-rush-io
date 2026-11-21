// [Flume Frenzy] Fisica na calha (3.0: velocidade da descida, centrifuga de verdade, direcao como forca), voo e
// pouso, agua (volta ou eliminacao), trombada e colocacao.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarPista, noPonto } from '../src/jogo/pista.js';
import { criarCorredor, criarCorrida, alinhar, largar, passoCorrida, colocacao, lugarDe, corridaAcabou } from '../src/jogo/corrida.js';
import { pilotar, decidir } from '../src/jogo/bots.js';
import { ligarPiloto } from '../src/jogo/montar.js';
import { DS, ALFA_MAX, FISICA } from '../src/jogo/constantes.js';

const DT = 1 / 60;
const MODULOS = [{ tipo: 'largada' }, { tipo: 'reta', len: 40 }, { tipo: 'atalho', marcado: true }, { tipo: 'curva' }, { tipo: 'reta', len: 60 }, { tipo: 'chegada' }];
const pista = () => gerarPista({ semente: 99, modulos: MODULOS, vmax: 36 });
const um = (o = {}) => criarCorredor(0, Object.assign({ nome: 'a', bot: false, personagem: 0, boia: 0, ima: 0 }, o));
/** @param {any} c @param {(c: any) => boolean} ate @param {number} [max] @param {(c: any) => void} [antes] */
const rodar = (c, ate, max = 200, antes) => {
  const ev = [];
  while (c.t < max && !ate(c)) {
    if (antes) antes(c);
    passoCorrida(c, DT);
    ev.push(...c.eventos);
    c.eventos.length = 0;
  }
  return ev;
};
/** tobogan de prova: largada, reta e UMA curva fechada (raio 30 m, 80 graus) */
const comCurva = () => gerarPista({ semente: 3, vmax: 37, modulos: [{ tipo: 'largada' }, { tipo: 'reta', len: 120 }, { tipo: 'curva', raio: 30, ang: 80 }, { tipo: 'reta', len: 120 }, { tipo: 'chegada' }] });
/** primeira curva (|k| >= kMin) depois da largada: [s0, s1] */
function primeiraCurva(p, kMin) {
  let i = p.iLargada + 1;
  while (i < p.n && Math.abs(p.k[i]) < kMin) i++;
  let j = i;
  while (j < p.n && Math.abs(p.k[j]) > 1 / 120) j++;
  return [i * DS, j * DS];
}
/** primeira curva fechada (raio <= 42 m) depois da largada */
const primeiraCurvaFechada = (p) => primeiraCurva(p, 1 / 42);

test('descida: a velocidade vem do declive (despenca nas quedas, perde na subida e um pouco na curva)', () => {
  const p = gerarPista({ semente: 2, vmax: 37, modulos: [{ tipo: 'largada' }, { tipo: 'reta', len: 160 }, { tipo: 'queda' }, { tipo: 'reta', len: 120 }, { tipo: 'chegada' }] });
  const k = um();
  const c = criarCorrida(p, { vmax: 37, cf: 1, volta: false }, [k]);
  alinhar(p, [k]);
  largar(c);
  const tmp = {};
  /** @type {{ s: number, v: number, inc: number }[]} */
  const serie = [];
  rodar(c, () => k.estado !== 'calha', 120, () => {
    const a = noPonto(p, k.s, tmp);
    if (k.s < p.iFinal * DS) serie.push({ s: k.s, v: k.v, inc: a.inc });
  });
  // passou da borda da rampa final: voo das manobras
  assert.ok(k.final && k.estado === 'ar' && k.lugar === 1);
  // a largada despenca: do empurrao da comporta a mais de 24 m/s em poucos segundos
  const largou = serie.find((x) => x.s > p.iLargada * DS + 40);
  assert.ok(largou && largou.v > 24, `largada lenta: ${largou && largou.v}`);
  // na queda (declive < -0.25) a velocidade sobe forte; na subida que vem depois, cai
  const naQueda = serie.filter((x) => x.inc < -0.25);
  const ganho = naQueda[naQueda.length - 1].v - naQueda[0].v;
  assert.ok(ganho > 7, `ganho na queda ${ganho.toFixed(1)} m/s`);
  const naSubida = serie.filter((x) => x.inc > 0.01);
  assert.ok(naSubida.length > 5 && naSubida[naSubida.length - 1].v < naSubida[0].v, 'nao perdeu na subida');
  // teto alto, mas teto
  assert.ok(Math.max(...serie.map((x) => x.v)) <= 37 * FISICA.teto + 0.01);
});

test('curva fechada perde velocidade (atrito da agua contra a parede)', () => {
  const p = comCurva();
  const [s0, s1] = primeiraCurvaFechada(p);
  const aceleracaoMedia = (sa, sb) => {
    const k = um();
    const c = criarCorrida(p, { vmax: 37, cf: 1, volta: false }, [k]);
    largar(c);
    k.s = sa; k.v = 36;
    const t0 = c.t;
    rodar(c, () => k.s >= sb || k.estado !== 'calha', 60, () => { k.v = Math.max(k.v, 0); k.dir = pilotar(c, k, 0, 1); });
    return (k.v - 36) / (c.t - t0);
  };
  const naReta = aceleracaoMedia(s0 - 100, s0 - 40);
  const naCurva = aceleracaoMedia(s0 + 4, s1 - 4);
  assert.ok(naCurva < naReta - 0.5, `curva ${naCurva.toFixed(2)} x reta ${naReta.toFixed(2)} m/s2`);
});

test('sem nenhuma entrada, a centrifuga leva para a borda e o corredor sai da pista na curva fechada', () => {
  const p = comCurva();
  const [s0, s1] = primeiraCurvaFechada(p);
  const k = um();
  const c = criarCorrida(p, { vmax: 37, cf: 1, volta: false }, [k]);
  largar(c);
  k.s = s0 - 120;
  k.v = 35;
  let uMax = 0;
  const ev = rodar(c, () => k.estado === 'fora' || k.estado === 'chegou', 60, () => {
    k.dir = 0;
    if (k.estado === 'calha') uMax = Math.max(uMax, Math.abs(k.u));
  });
  const dec = ev.find((e) => e.tipo === 'decolou');
  assert.ok(dec, `nao saiu da pista (subiu ate u=${uMax.toFixed(2)})`);
  assert.ok(dec.x !== undefined && k.sDecola >= s0 - 2 && k.sDecola <= s1 + 10, `saiu em s=${k.sDecola} fora da curva [${s0}, ${s1}]`);
  assert.ok(ev.some((e) => e.tipo === 'caiu'), 'nao caiu na agua');
  assert.equal(k.estado, 'fora');
});

test('corrigindo (direcao para dentro), a mesma curva fechada da para segurar', () => {
  const p = comCurva();
  const [s0, s1] = primeiraCurvaFechada(p);
  const k = um();
  const c = criarCorrida(p, { vmax: 37, cf: 1, volta: false }, [k]);
  largar(c);
  k.s = s0 - 120;
  k.v = 35;
  let uMax = 0;
  const ev = rodar(c, () => k.s > s1 + 40 || k.estado !== 'calha', 60, () => {
    k.dir = pilotar(c, k, 0, 1);
    if (k.s > s0 && k.s < s1) uMax = Math.max(uMax, Math.abs(k.u));
  });
  assert.ok(!ev.some((e) => e.tipo === 'decolou'), 'saiu da pista mesmo corrigindo');
  // a centrifuga aparece: mesmo corrigindo, sobe bem a parede
  assert.ok(uMax > 0.45, `quase nao subiu a parede (u=${uMax.toFixed(2)})`);
});

test('corrigir demais tambem joga para fora: segurar a correcao da primeira curva do S entra na segunda pelo lado de fora', () => {
  const p = gerarPista({ semente: 4, vmax: 37, modulos: [{ tipo: 'largada' }, { tipo: 'reta', len: 120 }, { tipo: 'ondas' }, { tipo: 'reta', len: 120 }, { tipo: 'chegada' }] });
  const [s0] = primeiraCurva(p, 1 / 120);
  const fora1 = Math.sign(noPonto(p, s0 + 10).k);
  const k = um();
  const c = criarCorrida(p, { vmax: 37, cf: 1, volta: false }, [k]);
  largar(c);
  k.s = s0 - 100;
  k.v = 38;
  // bom na primeira metade (puxa para dentro), mas segura a correcao depois que o S vira
  const ev = rodar(c, () => k.estado !== 'calha' || k.s > s0 + 200, 60, () => { k.dir = k.s > s0 - 10 ? -fora1 : 0; });
  assert.ok(ev.some((e) => e.tipo === 'decolou'), 'corrigir demais nao jogou para fora');
});

test('na reta, segurar a direcao toda nao joga para fora (a gravidade da calha segura)', () => {
  const p = gerarPista({ semente: 1, modulos: [{ tipo: 'largada' }, { tipo: 'reta', len: 300 }, { tipo: 'chegada' }], vmax: 37 });
  const k = um();
  const c = criarCorrida(p, { vmax: 37, cf: 1, volta: false }, [k]);
  largar(c);
  let uMax = 0;
  const ev = rodar(c, () => k.estado === 'chegou' || k.estado === 'fora', 200, () => {
    k.dir = 1;
    uMax = Math.max(uMax, k.u);
  });
  assert.equal(k.estado, 'chegou');
  assert.ok(!ev.some((e) => e.tipo === 'decolou'));
  assert.ok(uMax > 0.5 && uMax < 0.98, `u maximo ${uMax.toFixed(2)}`);
});

test('colado na borda de fora da curva do atalho: voa, pousa na pista de pouso e pula o desvio', () => {
  const p = pista();
  const at = p.atalhos[0];
  for (const v0 of [30, 36, 44]) {
    const k = um({ ima: 0.5 });
    const c = criarCorrida(p, { vmax: 36, cf: 1, volta: false }, [k]);
    largar(c);
    k.s = at.i0 * DS - 30;
    k.v = v0;
    k.u = at.dir * 0.7;
    const ev = rodar(c, () => k.estado === 'chegou' || k.estado === 'fora' || k.s > at.iPouso * DS + 40, 200, () => {
      k.dir = k.estado === 'ar' ? 0 : at.dir;
    });
    assert.ok(ev.some((e) => e.tipo === 'decolou' && e.atalho), `v=${v0}: nao decolou no atalho`);
    const a = ev.find((e) => e.tipo === 'atalho');
    assert.ok(a, `v=${v0}: nao pousou no atalho (${k.estado})`);
    assert.ok(a.pulo > 120, `v=${v0}: pulo ${a.pulo}`);
  }
});

test('devagar demais no atalho: o voo nao alcanca e cai na lagoa (sem volta = fora da rodada)', () => {
  const p = pista();
  const at = p.atalhos[0];
  const k = um();
  const c = criarCorrida(p, { vmax: 36, cf: 4, volta: false }, [k]);
  largar(c);
  k.s = at.i0 * DS - 3;
  k.v = 15;
  k.u = at.dir * 0.75;
  k.vel = 0.4;
  const ev = rodar(c, () => k.estado === 'fora' || k.estado === 'chegou', 200, () => { k.dir = at.dir; });
  assert.ok(ev.some((e) => e.tipo === 'decolou'));
  assert.ok(ev.some((e) => e.tipo === 'caiu'));
  assert.equal(k.estado, 'fora');
  assert.equal(lugarDe(c, k.id), 1);
});

test('rodadas protegidas: quem cai volta logo ao tobogan com protecao e segue; com `voltas`, volta mais atras', () => {
  const p = pista();
  const at = p.atalhos[0];
  for (const cfg of [{ volta: true }, { volta: false, voltas: 1 }]) {
    const k = um();
    const c = criarCorrida(p, Object.assign({ vmax: 36, cf: 4 }, cfg), [k]);
    largar(c);
    k.s = at.i0 * DS - 3;
    k.v = 15;
    k.u = at.dir * 0.75;
    k.vel = 0.4;
    const ev = rodar(c, () => k.estado === 'calha' && k.protecao > 0, 200, () => { k.dir = at.dir; });
    assert.ok(ev.some((e) => e.tipo === 'caiu') && ev.some((e) => e.tipo === 'voltou'));
    assert.equal(k.quedas, 1);
    if (cfg.volta) assert.ok(k.s >= k.sDecola, 'protegida volta adiante');
    else assert.ok(k.s < k.sDecola, 'fora da protecao volta atras');
    k.vel = 1;
    c.cfg.cf = 1;
    ligarPiloto(k, p.atalhos.length, 1);
    const ev2 = rodar(c, () => k.estado === 'chegou' || k.estado === 'fora', 300, () => decidir(c, k, k));
    assert.equal(k.estado, 'chegou', `${JSON.stringify(cfg)}: ${ev2.filter((e) => e.tipo !== 'empurrao').map((e) => `${e.tipo}@${Math.round(e.z)}`).join(' ')} s=${k.s.toFixed(0)}`);
  }
});

test('rampa de salto: lanca para cima e pousa no mesmo tobogan mais a frente', () => {
  const p = gerarPista({ semente: 5, modulos: [{ tipo: 'largada' }, { tipo: 'reta', len: 40 }, { tipo: 'rampa' }, { tipo: 'chegada' }], vmax: 36 });
  const k = um();
  const c = criarCorrida(p, { vmax: 36, cf: 1, volta: false }, [k]);
  largar(c);
  const ev = rodar(c, () => k.estado === 'chegou' || k.estado === 'fora');
  assert.ok(ev.some((e) => e.tipo === 'rampa'));
  const pouso = ev.find((e) => e.tipo === 'pousou');
  assert.ok(pouso && pouso.pulo > 20 && pouso.pulo < 40 + 0.07 * 36 * 36, `pulo da rampa ${pouso && pouso.pulo}`);
  assert.equal(k.estado, 'chegou');
});

test('trombada de lado em velocidade tipica: o outro vai pelo menos meia largura da calha para o lado; o jogador tambem leva', () => {
  const p = gerarPista({ semente: 1, modulos: [{ tipo: 'largada' }, { tipo: 'reta', len: 400 }, { tipo: 'chegada' }], vmax: 37 });
  const ml = ALFA_MAX * p.raio[0];
  // vLat: o jogador vindo de lado (3 m/s = 0,2 s de direcao toda; 2 m/s = um encosto de leve)
  for (const [vLat, minimo] of [[2, 0.9], [3, 1], [4, 1]]) {
    const eu = criarCorredor(0, { nome: 'eu', bot: false, personagem: 0, boia: 0 });
    const ele = criarCorredor(1, { nome: 'ele', bot: true, personagem: 1, boia: 1 });
    const c = criarCorrida(p, { vmax: 37, cf: 1, volta: false }, [eu, ele]);
    largar(c);
    // lado a lado em velocidade de corrida, ele um pouco mais lento
    eu.s = 150; ele.s = 150.6; eu.u = -0.5; ele.u = -0.18; eu.v = 37; ele.v = 35;
    eu.vu = vLat / ml;
    const u0 = ele.u;
    let desloc = 0;
    let euDepois = 0;
    rodar(c, () => c.t > 1.6 || ele.estado !== 'calha', 10, () => {
      eu.dir = 0;
      ele.dir = 0;
      desloc = Math.max(desloc, ele.u - u0);
      if (!euDepois && c.t > 0.05) euDepois = eu.vu * ml;
    });
    if (ele.estado === 'ar') desloc = Math.max(desloc, 1 - u0);
    // meia largura = do fundo ate a borda (u = 1: R * ALFA_MAX metros de parede)
    assert.ok(desloc >= minimo, `vLat ${vLat}: o outro so foi ${desloc.toFixed(2)} da meia largura`);
    // o jogador tambem leva: vinha a +vLat e volta para o outro lado
    assert.ok(euDepois < 0, `vLat ${vLat}: o jogador nao levou tranco (${euDepois.toFixed(2)} m/s)`);
  }
});

test('trombada de um rival no jogador: o jogador vai para a parede (e na curva, para fora)', () => {
  const p = gerarPista({ semente: 1, modulos: [{ tipo: 'largada' }, { tipo: 'reta', len: 400 }, { tipo: 'chegada' }], vmax: 37 });
  const ml = ALFA_MAX * p.raio[0];
  const eu = criarCorredor(0, { nome: 'eu', bot: false, personagem: 0, boia: 0 });
  const ele = criarCorredor(1, { nome: 'ele', bot: true, personagem: 1, boia: 1 });
  const c = criarCorrida(p, { vmax: 37, cf: 1, volta: false }, [eu, ele]);
  largar(c);
  ele.s = 150; eu.s = 150.6; ele.u = -0.5; eu.u = -0.18; ele.v = 37; eu.v = 35;
  ele.vu = 3 / ml;
  const u0 = eu.u;
  let desloc = 0;
  rodar(c, () => c.t > 1.6 || eu.estado !== 'calha', 10, () => { eu.dir = 0; ele.dir = 0; desloc = Math.max(desloc, eu.u - u0); });
  assert.ok(desloc > 0.6 || eu.estado === 'ar', `o jogador so foi ${desloc.toFixed(2)}`);
});

test('trombada na curva: o tranco joga quem esta do lado de fora para fora da pista', () => {
  const p = comCurva();
  const [s0, s1] = primeiraCurvaFechada(p);
  const fora = Math.sign(noPonto(p, (s0 + s1) / 2).k);
  const eu = criarCorredor(0, { nome: 'eu', bot: false, personagem: 0, boia: 0 });
  const ele = criarCorredor(1, { nome: 'ele', bot: true, personagem: 1, boia: 1 });
  const c = criarCorrida(p, { vmax: 37, cf: 1, volta: false }, [eu, ele]);
  largar(c);
  const sm = (s0 + s1) / 2;
  eu.s = sm; ele.s = sm + 0.5; eu.v = 35; ele.v = 34;
  ele.u = fora * 0.62; eu.u = fora * 0.3;
  const ml = ALFA_MAX * p.raio[0];
  eu.vu = (fora * 3) / ml;
  const ev = rodar(c, () => ele.estado !== 'calha' || c.t > 2, 10, () => {
    ele.dir = pilotar(c, ele, 0, 1);
    eu.dir = eu.estado === 'calha' ? pilotar(c, eu, 0, 1) : 0;
  });
  assert.ok(ev.some((e) => e.tipo === 'empurrao' && (e.id === 0 || e.outro === 0)));
  assert.equal(ele.estado, 'ar', 'o tranco nao derrubou');
});

test('toque lento (mesma velocidade, encostados) so separa: sem tranco, sem vai-e-vem', () => {
  const p = gerarPista({ semente: 1, modulos: [{ tipo: 'largada' }, { tipo: 'reta', len: 400 }, { tipo: 'chegada' }], vmax: 37 });
  const a = criarCorredor(0, { nome: 'a', bot: true, personagem: 0, boia: 0 });
  const b = criarCorredor(1, { nome: 'b', bot: true, personagem: 1, boia: 1 });
  const c = criarCorrida(p, { vmax: 37, cf: 1, volta: false }, [a, b]);
  largar(c);
  a.s = 150; b.s = 150.2; a.u = -0.05; b.u = 0.05; a.v = 35; b.v = 35;
  const ev = rodar(c, () => c.t > 1, 10, () => { a.dir = 0; b.dir = 0; });
  assert.ok(!ev.some((e) => e.tipo === 'empurrao'), 'tranco num toque lento');
  const d = Math.hypot(b.s - a.s, (b.u - a.u) * ALFA_MAX * p.raio[0]);
  assert.ok(d >= FISICA.raioContato * 2 - 0.1, `nao separou (${d.toFixed(2)} m)`);
});

test('colocacao: chegados pela ordem, depois quem corre por distancia, depois quem saiu', () => {
  const p = pista();
  const ks = [0, 1, 2, 3].map((i) => criarCorredor(i, { nome: String(i), bot: true, personagem: i, boia: i }));
  const c = criarCorrida(p, { vmax: 36, cf: 1, volta: false }, ks);
  ks[0].estado = 'fora'; ks[0].tFora = 5;
  ks[1].estado = 'calha'; ks[1].s = 200;
  ks[2].estado = 'chegou'; ks[2].chegada = 40;
  ks[3].estado = 'calha'; ks[3].s = 400;
  assert.deepEqual(colocacao(c).map((k) => k.id), [2, 3, 1, 0]);
  assert.ok(!corridaAcabou(c));
});
