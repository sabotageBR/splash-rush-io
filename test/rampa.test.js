// [Flume Frenzy] 3.1.0: rampa final e manobras. O voo da rampa (alto, cabe na piscina, chegada justa na
// borda), a fisica das manobras (torque, inercia, fechar em pe, L = I w no superman), a contagem (sequencia,
// combo, repeticao), o pouso (limpo, torto, barrigada) e as moedas, e os bots fazendo manobras.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarPista, RAMPA_FINAL } from '../src/jogo/pista.js';
import { criarCorredor, criarCorrida, alinhar, largar, passoCorrida, lugarDe, corridaAcabou } from '../src/jogo/corrida.js';
import { MANOBRA, novasManobras, passoManobras, avaliarPouso, erroEmPe, multCombo, planejarBot, tempoAteAgua } from '../src/jogo/manobras.js';
import { configRodada } from '../src/jogo/rodadas.js';
import { montarRodada, ligarPiloto, controlarBots } from '../src/jogo/montar.js';
import { moedasDaCorrida } from '../src/jogo/meta.js';
import { DS, FISICA } from '../src/jogo/constantes.js';

const DT = 1 / 60;
const VOLTA = Math.PI * 2;
const um = (id = 0, o = {}) => criarCorredor(id, Object.assign({ nome: `c${id}`, bot: false, personagem: 0, boia: 0, ima: 0 }, o));
/** corpo solto no ar (so o estado das manobras) */
const corpo = () => ({ man: novasManobras(), manX: 0, manY: 0, impX: 0, impY: 0 });
/** @param {any} k @param {number} s @param {(t: number) => void} [entrada] */
function girar(k, s, entrada) {
  const nomes = [];
  for (let t = 0; t < s; t += DT) {
    if (entrada) entrada(t);
    passoManobras(k, DT, (n) => nomes.push(n));
  }
  return nomes;
}

test('rampa final: lanca alto (apice bem acima do labio) e todo mundo cai dentro da piscina, em 12 rodadas', () => {
  let voos = 0;
  let apiceMin = Infinity;
  let tMin = Infinity;
  let tMax = 0;
  for (let n = 1; n <= 12; n++) {
    for (const sem of [1, 2]) {
      const cfg = configRodada(n, sem);
      const m = montarRodada(cfg, { personagem: 0, boia: 0 }, 'J');
      ligarPiloto(m.jogador, m.pista.atalhos.length, 0.95);
      const c = m.corrida;
      const p = m.pista;
      const iL = p.n - 1;
      const lab = { x: p.x[iL], y: p.y[iL], z: p.z[iL] };
      const t0 = new Map();
      const ymax = new Map();
      largar(c);
      for (let i = 0; i < 60 * 150 && !corridaAcabou(c); i++) {
        controlarBots(c, m.jogador, DT);
        passoCorrida(c, DT);
        for (const k of c.corredores) if (k.final && k.estado === 'ar') ymax.set(k.id, Math.max(ymax.get(k.id) || 0, k.y));
        for (const e of c.eventos) {
          if (e.tipo === 'cruzou') t0.set(e.id, c.t);
          if (e.tipo !== 'mergulho') continue;
          const k = c.corredores[e.id];
          const dx = k.x - lab.x;
          const dz = k.z - lab.z;
          const ao = dx * p.hx[iL] + dz * p.hz[iL];
          const lat = -dx * p.hz[iL] + dz * p.hx[iL];
          assert.ok(ao > RAMPA_FINAL.piscina.ini && ao < RAMPA_FINAL.piscina.fim - 8, `pousou fora da piscina: ${ao.toFixed(0)} m (rodada ${n})`);
          assert.ok(Math.abs(lat) < RAMPA_FINAL.piscina.meia - 4, `pousou de lado: ${lat.toFixed(1)} m`);
          const tv = c.t - t0.get(e.id);
          tMin = Math.min(tMin, tv);
          tMax = Math.max(tMax, tv);
          if (k.v > 0) apiceMin = Math.min(apiceMin, (ymax.get(e.id) || 0) - lab.y);
          voos++;
        }
        c.eventos.length = 0;
      }
      assert.ok(corridaAcabou(c), `rodada ${n} nao acabou`);
      // o labio fica alto acima da agua
      assert.ok(lab.y > 6, `labio baixo: ${lab.y.toFixed(1)} m`);
    }
  }
  assert.ok(voos > 250, `voos ${voos}`);
  // ate quem chega devagar (voltou da agua) ainda sobe; o voo tipico e bem mais alto (teste abaixo)
  assert.ok(apiceMin > 2, `apice baixo: ${apiceMin.toFixed(1)} m acima do labio`);
  assert.ok(tMin > 1.8 && tMax < 5.2, `tempo de voo ${tMin.toFixed(2)}..${tMax.toFixed(2)} s`);
});

test('voo tipico: ~3 s no ar e mais de 8 m acima do labio (da para encadear manobras)', () => {
  const p = gerarPista({ semente: 5, vmax: 36, modulos: [{ tipo: 'largada' }, { tipo: 'reta', len: 160 }, { tipo: 'chegada' }] });
  const k = um();
  const c = criarCorrida(p, { vmax: 36, cf: 1, volta: false }, [k]);
  alinhar(p, [k]);
  largar(c);
  let yLab = 0;
  let ymax = 0;
  let tC = 0;
  while (c.t < 120 && k.estado !== 'chegou') {
    passoCorrida(c, DT);
    for (const e of c.eventos) if (e.tipo === 'cruzou') { yLab = k.y; tC = c.t; }
    c.eventos.length = 0;
    if (k.final) ymax = Math.max(ymax, k.y);
  }
  assert.equal(k.estado, 'chegou');
  assert.ok(ymax - yLab > 8, `apice ${(ymax - yLab).toFixed(1)} m`);
  assert.ok(c.t - tC > 2.6, `voo curto: ${(c.t - tC).toFixed(2)} s`);
});

test('chegada justa: conta na borda da rampa, na ordem de passagem (quem voa mais nao passa ninguem)', () => {
  const p = gerarPista({ semente: 5, vmax: 36, modulos: [{ tipo: 'largada' }, { tipo: 'reta', len: 160 }, { tipo: 'chegada' }] });
  // a: cruza primeiro e devagar (voo curto); b: cruza logo depois e rapido (voo longo, cai na agua depois)
  const a = um(0);
  const b = um(1);
  const c = criarCorrida(p, { vmax: 36, cf: 1, volta: false }, [a, b]);
  largar(c);
  a.s = p.comprimento - 1;
  a.v = 12;
  b.s = p.comprimento - 6;
  b.u = 0.5;
  b.v = 40;
  const ordem = [];
  const agua = [];
  while (c.t < 20 && !corridaAcabou(c)) {
    passoCorrida(c, DT);
    for (const e of c.eventos) {
      if (e.tipo === 'cruzou') ordem.push(e.id);
      if (e.tipo === 'mergulho') agua.push(e.id);
    }
    c.eventos.length = 0;
  }
  assert.deepEqual(ordem, [0, 1]);
  assert.deepEqual(agua, [0, 1]);
  assert.equal(a.lugar, 1);
  assert.equal(b.lugar, 2);
  assert.equal(lugarDe(c, 0), 1);
  assert.equal(lugarDe(c, 1), 2);
  // ainda no ar o lugar ja vale
  const c2 = criarCorrida(p, { vmax: 36, cf: 1, volta: false }, [um(0), um(1)]);
  largar(c2);
  c2.corredores[0].s = p.comprimento - 1;
  c2.corredores[0].v = 20;
  c2.corredores[1].s = p.comprimento - 40;
  c2.corredores[1].v = 20;
  for (let i = 0; i < 10; i++) passoCorrida(c2, DT);
  assert.equal(c2.corredores[0].estado, 'ar');
  assert.equal(lugarDe(c2, 0), 1);
});

test('inercia: pedir o giro acelera; soltando, continua rodando sozinho, fecha a volta e para em pe', () => {
  const k = corpo();
  // pede por 0,45 s (pouco mais de meia volta)
  const nomes = girar(k, 0.45, () => { k.manX = 1; });
  const gSolta = k.man.g;
  const wSolta = k.man.wg;
  assert.ok(wSolta > 9, `pouca velocidade angular: ${wSolta.toFixed(1)}`);
  assert.ok(gSolta < VOLTA * 0.75 && gSolta > VOLTA * 0.4);
  // soltou: a inercia leva o resto da volta
  k.manX = 0;
  nomes.push(...girar(k, 0.1));
  assert.ok(k.man.g - gSolta > 0.6, 'parou ao soltar (sem inercia)');
  nomes.push(...girar(k, 1));
  assert.deepEqual(nomes, ['giro360']);
  assert.ok(erroEmPe(k.man.g) < 0.05 && Math.abs(k.man.wg) < 0.3, `nao fechou em pe: ${erroEmPe(k.man.g).toFixed(2)}`);
  assert.ok(Math.abs(k.man.g - VOLTA) < 0.05);
});

test('um toque curto nao completa: a inercia nao passa da metade e o corpo volta para tras', () => {
  const k = corpo();
  const nomes = girar(k, 0.12, () => { k.manX = 1; });
  k.manX = 0;
  nomes.push(...girar(k, 1.2));
  assert.deepEqual(nomes, []);
  assert.ok(Math.abs(k.man.g) < 0.05);
});

test('deslize rapido: uma rajada so ja leva uma volta inteira', () => {
  const k = corpo();
  k.impX = 1;
  k.impY = 0;
  const nomes = girar(k, 1.5);
  assert.deepEqual(nomes, ['giro360']);
  const m = corpo();
  m.impY = 1;
  assert.deepEqual(girar(m, 1.5), ['mortal']);
});

test('superman: esticar aumenta a inercia e freia o giro (L = I w se conserva)', () => {
  const k = corpo();
  girar(k, 0.3, () => { k.manX = 1; });
  const w0 = k.man.wg;
  const iAntes = 1 + (MANOBRA.inerciaSuperman - 1) * k.man.pose;
  // um passo esticando com o giro ainda pedido: L conserva e o torque soma (dividido pela inercia nova)
  k.manY = -1;
  passoManobras(k, DT, () => {});
  const pose = MANOBRA.poseVel * DT;
  const I = 1 + (MANOBRA.inerciaSuperman - 1) * pose;
  const esperado = (w0 * iAntes) / I + (MANOBRA.torqueGiro / I) * DT;
  assert.ok(Math.abs(k.man.wg - esperado) < 1e-9, `${k.man.wg} != ${esperado}`);
  // todo esticado, o giro fica bem mais lento que encolhido
  const enc = corpo();
  const est = corpo();
  for (const x of [enc, est]) { x.man.wg = 12; x.manX = 1; }
  est.manY = -1;
  girar(est, 0.2);
  girar(enc, 0.2);
  assert.ok(est.man.g < enc.man.g * 0.65, `esticado ${est.man.g.toFixed(2)} vs encolhido ${enc.man.g.toFixed(2)}`);
});

test('contagem: dois mortais separados sao dois "mortal"; sem parar e um "mortal2"; giro e mortal juntos = parafuso', () => {
  const k = corpo();
  const nomes = girar(k, 0.4, () => { k.manY = 1; });
  k.manY = 0;
  nomes.push(...girar(k, 1));
  nomes.push(...girar(k, 0.4, () => { k.manY = 1; }));
  k.manY = 0;
  nomes.push(...girar(k, 1));
  assert.deepEqual(nomes, ['mortal', 'mortal']);
  const d = corpo();
  const nd = girar(d, 1.2, () => { d.manY = 1; });
  d.manY = 0;
  nd.push(...girar(d, 1.2));
  assert.deepEqual(nd.slice(0, 2), ['mortal', 'mortal2']);
  const p = corpo();
  const np = girar(p, 0.45, () => { p.manX = 1; p.manY = 1; });
  p.manX = 0;
  p.manY = 0;
  np.push(...girar(p, 1.2));
  assert.ok(np.includes('giro360') && np.includes('mortal') && np.includes('parafuso'), np.join(','));
  // superman conta depois de esticado um tempo, e o longo depois de mais
  const s = corpo();
  assert.deepEqual(girar(s, 1.4, () => { s.manY = -1; }), ['superman', 'supermanLongo']);
});

test('pouso: limpo x1,5; torto vale o que fez; barrigada (esticado, de costas ou de lado) perde tudo', () => {
  const k = corpo();
  girar(k, 0.4, () => { k.manX = 1; });
  k.manX = 0;
  girar(k, 1);
  girar(k, 0.45, () => { k.manY = 1; });
  k.manY = 0;
  girar(k, 1);
  assert.deepEqual(k.man.lista, ['giro360', 'mortal']);
  const limpo = avaliarPouso(k.man);
  assert.equal(limpo.qualidade, 'limpo');
  assert.equal(limpo.mult, multCombo(2));
  assert.equal(limpo.total, Math.round((MANOBRA.pontos.giro + MANOBRA.pontos.mortal) * 1.5 * MANOBRA.limpoMult));
  assert.equal(limpo.moedas, Math.round(limpo.total / MANOBRA.ptsPorMoeda));
  assert.ok(limpo.moedas > 0);
  // mesmo combo, batendo na agua no meio de outro mortal (de costas)
  const meio = structuredClone(k.man);
  meio.m += Math.PI;
  assert.equal(avaliarPouso(meio).qualidade, 'barrigada');
  assert.equal(avaliarPouso(meio).moedas, 0);
  // esticado (superman) na agua
  const est = structuredClone(k.man);
  est.pose = 0.8;
  assert.equal(avaliarPouso(est).qualidade, 'barrigada');
  // um pouco torto: vale o combo, sem o bonus do limpo
  const torto = structuredClone(k.man);
  torto.g += 1.0;
  const r = avaliarPouso(torto);
  assert.equal(r.qualidade, 'torto');
  assert.equal(r.total, Math.round((MANOBRA.pontos.giro + MANOBRA.pontos.mortal) * 1.5));
  // repetir a mesma manobra vale metade
  const rep = corpo();
  girar(rep, 0.4, () => { rep.manX = 1; });
  rep.manX = 0;
  girar(rep, 1);
  girar(rep, 0.4, () => { rep.manX = 1; });
  rep.manX = 0;
  girar(rep, 1);
  assert.equal(rep.man.pts, MANOBRA.pontos.giro * 1.5);
});

test('moedas de manobra entram no resultado da corrida', () => {
  const base = moedasDaCorrida({ lugar: 3, fora: false, progresso: 1, pegas: 0, derrubados: 0 });
  assert.equal(moedasDaCorrida({ lugar: 3, fora: false, progresso: 1, pegas: 0, derrubados: 0, estilo: 17 }), base + 17);
});

test('na corrida: bater na agua no meio de um mortal e barrigada; fechado em pe e limpo', () => {
  const p = gerarPista({ semente: 5, vmax: 36, modulos: [{ tipo: 'largada' }, { tipo: 'reta', len: 160 }, { tipo: 'chegada' }] });
  const roda = (/** @type {(k: any) => void} */ entrada) => {
    const k = um();
    const c = criarCorrida(p, { vmax: 36, cf: 1, volta: false }, [k]);
    largar(c);
    k.s = p.comprimento - 30;
    k.v = 36;
    let ev = null;
    while (c.t < 20 && k.estado !== 'chegou') {
      if (k.final) entrada(k);
      passoCorrida(c, DT);
      for (const e of c.eventos) if (e.tipo === 'mergulho') ev = e;
      c.eventos.length = 0;
    }
    return ev;
  };
  // um giro, e um mortal comecado tarde demais (0,35 s antes da agua): bate de costas
  const ruim = roda((k) => {
    k.manX = k.man.t < 0.4 ? 1 : 0;
    k.manY = tempoAteAgua(k.y, k.vy, FISICA.gAr) < 0.35 ? 1 : 0;
  });
  assert.equal(ruim.qualidade, 'barrigada');
  assert.equal(ruim.moedas, 0);
  assert.ok(ruim.n >= 1);
  // superman ate a agua: barrigada
  const esticado = roda((k) => { k.manY = -1; });
  assert.equal(esticado.qualidade, 'barrigada');
  // um giro logo no comeco e solta
  const bom = roda((k) => { k.manX = k.man.t < 0.4 ? 1 : 0; });
  assert.equal(bom.qualidade, 'limpo');
  assert.ok(bom.moedas > 0);
  // nada: limpo, sem moedas
  const nada = roda(() => {});
  assert.equal(nada.qualidade, 'limpo');
  assert.equal(nada.moedas, 0);
});

test('bots fazem manobras: quase todos tentam; a maioria fecha em pe, alguns caem de barriga', () => {
  const q = { limpo: 0, torto: 0, barrigada: 0 };
  let comManobra = 0;
  let total = 0;
  for (const n of [1, 3, 5, 8, 11]) {
    for (const sem of [1, 2, 3]) {
      const m = montarRodada(configRodada(n, sem), { personagem: 0, boia: 0 }, 'J');
      ligarPiloto(m.jogador, m.pista.atalhos.length, 0.95);
      const c = m.corrida;
      largar(c);
      for (let i = 0; i < 60 * 150 && !corridaAcabou(c); i++) {
        controlarBots(c, m.jogador, DT);
        passoCorrida(c, DT);
        for (const e of c.eventos) {
          if (e.tipo !== 'mergulho' || e.id === m.jogador.id) continue;
          total++;
          q[e.qualidade]++;
          if (e.n > 0) comManobra++;
        }
        c.eventos.length = 0;
      }
    }
  }
  assert.ok(comManobra / total > 0.85, `so ${comManobra}/${total} fizeram manobra`);
  assert.ok(q.limpo / total > 0.5, `limpos ${q.limpo}/${total}`);
  assert.ok(q.barrigada / total > 0.05 && q.barrigada / total < 0.4, `barrigadas ${q.barrigada}/${total}`);
});

test('plano do bot: o bom deixa folga, o ruim aposta alem do tempo de voo', () => {
  const durMax = (pl) => pl.reduce((s, it) => s + ({ giro: it.n === 2 ? 1.3 : 0.87, mortal: 0.93, superman: 0.7, parafuso: 0.95 })[it.tipo], 0.15);
  let bomPassou = 0;
  let ruimPassou = 0;
  for (let sem = 1; sem <= 40; sem++) {
    if (durMax(planejarBot({ habilidade: 0.95, risco: 1 }, 3, sem)) > 3) bomPassou++;
    if (durMax(planejarBot({ habilidade: 0.3, risco: 1 }, 3, sem)) > 3) ruimPassou++;
  }
  assert.equal(bomPassou, 0);
  assert.ok(ruimPassou > 10, `ruim passou ${ruimPassou}/40`);
});

test('o tobogan termina na rampa final (flag FINAL subindo ate o labio)', () => {
  const p = gerarPista({ semente: 5, vmax: 36, modulos: [{ tipo: 'largada' }, { tipo: 'reta', len: 160 }, { tipo: 'chegada' }] });
  assert.ok(p.iFinal > p.iLargada && p.iFinal < p.n - 3);
  for (let i = p.iFinal + 1; i < p.n; i++) assert.ok(p.y[i] > p.y[i - 1], `rampa nao sobe na amostra ${i}`);
  assert.ok(p.inc[p.n - 1] > 0.5, `labio pouco inclinado: ${p.inc[p.n - 1].toFixed(2)}`);
  assert.ok((p.n - 1 - p.iFinal) * DS >= RAMPA_FINAL.rampa - DS);
  assert.ok(FISICA.arrastoRampa > 0);
});
