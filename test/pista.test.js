// [Flume Frenzy] Gerador do tobogan: determinismo, continuidade, descida, atalhos que fecham na mesma
// linha e na altura certa, e as buscas da grade (pouso e ima).
import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarPista, T, noPonto, naSuperficie, buscarPouso, alvoAbaixo } from '../src/jogo/pista.js';
import { DS, ALFA_MAX, ALTURA_FIM, FISICA, alturaBorda } from '../src/jogo/constantes.js';
import { configRodada } from '../src/jogo/rodadas.js';

const pistaDe = (n, s) => {
  const c = configRodada(n, s);
  return gerarPista({ semente: c.semente, modulos: c.modulos, vmax: c.vmax });
};

test('mesma semente, mesmo tobogan; semente diferente, tobogan diferente', () => {
  const a = pistaDe(4, 7);
  const b = pistaDe(4, 7);
  const c = pistaDe(4, 8);
  assert.equal(a.n, b.n);
  assert.deepEqual([...a.x.slice(0, 50)], [...b.x.slice(0, 50)]);
  assert.notDeepEqual([...a.x], [...c.x]);
});

test('amostras continuas a cada DS, descendo (so as subidas curtas depois das quedas e a rampa final), fundo da chegada na altura certa', () => {
  for (let n = 1; n <= 12; n++) {
    for (const s of [1, 2, 3]) {
      const p = pistaDe(n, s);
      let subida = 0;
      for (let i = 1; i < p.n; i++) {
        const d = Math.hypot(p.x[i] - p.x[i - 1], p.z[i] - p.z[i - 1]);
        assert.ok(Math.abs(d - DS) < 0.02, `passo ${d} na amostra ${i}`);
        // so sobe logo depois de uma queda forte, e pouco (uma lombada de ~1 m)
        subida = p.y[i] > p.y[i - 1] + 1e-9 ? subida + (p.y[i] - p.y[i - 1]) : 0;
        if (!(p.tipo[i] & T.FINAL)) assert.ok(subida < 1.6, `subida longa na amostra ${i} (rodada ${n})`);
        assert.ok(Number.isFinite(p.y[i]) && Number.isFinite(p.hx[i]));
      }
      // o fundo da reta de embalo fica em ALTURA_FIM; a rampa final sobe dali ate o labio, bem acima da piscina
      const fundo = Math.min(...p.y.slice(p.iFinal - 8));
      assert.ok(Math.abs(fundo - ALTURA_FIM) < 1e-6);
      assert.ok(p.y[p.n - 1] - fundo > 4.5, `rampa final baixa: ${(p.y[p.n - 1] - fundo).toFixed(1)} m`);
      for (let i = 0; i < p.iFinal - 16; i++) assert.ok(p.y[i] > 2, 'o tobogan encosta na lagoa antes do fim');
    }
  }
});

test('rodada 1 tem 3 atalhos (2 marcados); rodadas abertas tem 4 ou mais', () => {
  const p1 = pistaDe(1, 5);
  assert.equal(p1.atalhos.length, 3);
  assert.equal(p1.atalhos.filter((a) => a.marcado).length, 2);
  for (let n = 4; n <= 14; n++) assert.ok(pistaDe(n, 3).atalhos.length >= 4, `rodada ${n}`);
});

test('o desvio do atalho volta para a mesma linha da decolagem, mais abaixo', () => {
  for (let n = 1; n <= 10; n++) {
    const p = pistaDe(n, 11);
    for (const a of p.atalhos) {
      const it = a.i0;
      const ip = a.iPouso;
      // lateral da pista de pouso em relacao a linha reta da decolagem
      const lat = -(p.x[ip] - p.x[it]) * p.hz[it] + (p.z[ip] - p.z[it]) * p.hx[it];
      assert.ok(Math.abs(lat) < 3, `pista de pouso fora da linha: ${lat.toFixed(2)} m`);
      assert.ok(Math.abs(p.hx[ip] * p.hx[it] + p.hz[ip] * p.hz[it] - 1) < 1e-3, 'pista de pouso torta');
      const queda = p.y[it + 2] - p.y[ip];
      assert.ok(queda > 8 && queda < 45, `queda ${queda}`);
      assert.ok(a.pulo > 100, `atalho pula pouco: ${a.pulo}`);
      // o voo na velocidade de projeto (borda rebaixada + trampolim, descendo com o declive) ainda esta acima
      // da pista de pouso quando chega nela
      const D = (p.x[ip] - p.x[it + 2]) * p.hx[it + 2] + (p.z[ip] - p.z[it + 2]) * p.hz[it + 2];
      const vp = FISICA.velProjeto * p.vmax;
      const t = D / vp;
      const hDecola = p.raio[it] * (1 - Math.cos(FISICA.bordaAtalho * ALFA_MAX));
      const vy0 = FISICA.chute + FISICA.chuteAtalho + vp * p.inc[it + 2];
      const yVoo = p.y[it + 2] + hDecola + vy0 * t - 0.5 * FISICA.gAr * t * t;
      assert.ok(yVoo > p.y[ip], `o voo de projeto nao alcanca a pista de pouso (${(yVoo - p.y[ip]).toFixed(2)} m)`);
    }
  }
});

test('marcas: largada, tuneis, rampas, turbo e paredes aparecem quando a rodada pede', () => {
  const tem = (p, b) => Array.from(p.tipo).some((x) => (x & b) !== 0);
  const p1 = pistaDe(1, 2);
  assert.ok(tem(p1, T.LARGADA) && tem(p1, T.ATALHO) && tem(p1, T.POUSO) && tem(p1, T.CHEGADA));
  assert.ok(!tem(p1, T.TUNEL) && !tem(p1, T.RAMPA));
  assert.ok(pistaDe(2, 2).rampas.length >= 2);
  const p3 = pistaDe(3, 2);
  assert.ok(tem(p3, T.TUNEL) && tem(p3, T.TURBO));
  assert.ok(tem(pistaDe(6, 2), T.PAREDE));
});

test('superficie e interpolacao: fundo em u=0, borda em u=1 na altura da borda', () => {
  const p = pistaDe(2, 4);
  const s = 300;
  const a = noPonto(p, s);
  const fundo = naSuperficie(p, s, 0, ALFA_MAX);
  const borda = naSuperficie(p, s, 1, ALFA_MAX);
  assert.ok(Math.abs(fundo.y - a.y) < 1e-9);
  assert.ok(Math.abs(borda.y - a.y - alturaBorda(a.raio)) < 1e-6);
  const lat = -(borda.x - a.x) * a.hz + (borda.z - a.z) * a.hx;
  assert.ok(Math.abs(lat - a.raio * Math.sin(ALFA_MAX)) < 1e-6, 'u positivo e a direita');
});

test('grade: pouso acha a calha logo abaixo e ignora o que esta longe; ima so olha trechos alinhados', () => {
  const p = pistaDe(1, 3);
  const i = 200;
  const x = p.x[i];
  const z = p.z[i];
  const y = p.y[i];
  const r = buscarPouso(p, x, y + 0.1, z, y + 1, 0);
  assert.ok(r && Math.abs(r.i - i) <= 1 && Math.abs(r.u) < 0.05);
  assert.equal(buscarPouso(p, x + 40, y + 0.1, z + 40, y + 1, 0), null);
  assert.equal(buscarPouso(p, x, y + 0.1, z, y + 1, (i + 10) * DS), null, 'sMin respeitado');
  assert.ok(alvoAbaixo(p, x, z, y + 5, 0, p.hx[i], p.hz[i]) >= 0);
  assert.equal(alvoAbaixo(p, x, z, y + 5, 0, -p.hz[i], p.hx[i]), -1, 'trecho de lado nao conta');
});
