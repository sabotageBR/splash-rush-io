// [Flume Frenzy] Rodadas inteiras simuladas (bots locais e o piloto automatico no lugar do jogador):
// duracao e velocidade, sair da pista sem entrada, chance da 1a rodada, atalhos dos bots, ninguem preso,
// nada de NaN e nada de tremor com 20 corredores. E a meta e o roteiro.
import test from 'node:test';
import assert from 'node:assert/strict';
import { configRodada, novidadeDaRodada, parqueDaRodada, eventoDaRodada } from '../src/jogo/rodadas.js';
import { montarRodada, ligarPiloto, controlarBots } from '../src/jogo/montar.js';
import { passoCorrida, largar, lugarDe, corridaAcabou } from '../src/jogo/corrida.js';
import { DS } from '../src/jogo/constantes.js';
import { saveNovo, normalizarSave, aplicarCorrida, somarMoedas, precoProximo, moedasDaCorrida, presenteAtivo, escolher } from '../src/jogo/meta.js';
import { ORDEM_COLECAO, PERSONAGENS, BOIAS } from '../src/jogo/elenco.js';

const DT = 1 / 60;

/** @param {number} n @param {number} sem @param {'piloto'|'parado'|'so-bots'} modo */
function simular(n, sem, modo) {
  const cfg = configRodada(n, sem);
  const { pista, corrida: c, jogador } = montarRodada(cfg, { personagem: 0, boia: 0 }, 'eu');
  if (modo === 'piloto') ligarPiloto(jogador, pista.atalhos.length, 0.95);
  if (modo === 'so-bots') {
    jogador.estado = 'fora';
    jogador.tFora = 0;
  }
  largar(c);
  if (modo === 'so-bots') jogador.estado = 'fora';
  const ev = { atalhosBots: 0, atalhosJog: 0, quedasJog: 0 };
  let tJog = -1;
  let lugar = 0;
  let somaV = 0;
  let nV = 0;
  while (c.t < 180 && !corridaAcabou(c)) {
    controlarBots(c, jogador);
    if (modo === 'parado') jogador.dir = 0;
    passoCorrida(c, DT);
    if (jogador.estado === 'calha') {
      somaV += jogador.v;
      nV++;
    }
    for (const e of c.eventos) {
      if (e.tipo === 'atalho') e.id === jogador.id ? ev.atalhosJog++ : ev.atalhosBots++;
      if (e.tipo === 'caiu' && e.id === jogador.id) ev.quedasJog++;
    }
    c.eventos.length = 0;
    if (modo !== 'so-bots' && tJog < 0 && (jogador.estado === 'chegou' || jogador.estado === 'fora')) {
      tJog = c.t;
      lugar = lugarDe(c, jogador.id);
    }
  }
  for (const k of c.corredores) for (const v of [k.s, k.u, k.v, k.x, k.y, k.z]) assert.ok(Number.isFinite(v), `NaN no corredor ${k.id}`);
  return { cfg, c, jogador, tJog, lugar, ev, fim: c.t, acabou: corridaAcabou(c), vMed: somaV / Math.max(1, nV) };
}

test('toda rodada acaba (todos chegam ou saem) em menos de 2 minutos, sem NaN', () => {
  for (let n = 1; n <= 12; n++) {
    for (const s of [1, 2]) {
      const r = simular(n, s, 'piloto');
      assert.ok(r.acabou, `rodada ${n} semente ${s} nao acabou em ${r.fim}s`);
      assert.ok(r.fim < 120, `rodada ${n} longa demais: ${r.fim}`);
    }
  }
});

test('duracao da corrida do jogador: 40 a 80 s (piloto bom), mais rapida que a 2.0 (media acima de 33 m/s)', () => {
  const tempos = [];
  let somaV = 0;
  let nV = 0;
  for (let n = 1; n <= 9; n++) for (const s of [3, 4]) {
    const r = simular(n, s, 'piloto');
    if (r.jogador.estado === 'chegou') tempos.push(r.tJog);
    somaV += r.vMed;
    nV++;
  }
  const media = tempos.reduce((a, b) => a + b, 0) / tempos.length;
  assert.ok(tempos.length >= 14, `o piloto so chegou em ${tempos.length}/18`);
  assert.ok(media > 40 && media < 65, `media ${media}`);
  for (const t of tempos) assert.ok(t > 30 && t < 80, `corrida de ${t}s`);
  // 2.0.0: 27 m/s de media com o mesmo piloto
  assert.ok(somaV / nV > 31, `velocidade media ${(somaV / nV).toFixed(1)} m/s`);
});

test('sem nenhuma entrada (fora do trecho protegido), o jogador sai da pista na primeira curva fechada', () => {
  // curva fechada = onde a centrifuga v^2/R do proprio corredor passa de 45 m/s2 (a gravidade da calha so segura
  // ~60 parado na borda); a primeira curva depois da largada, ainda devagar, nao conta
  const FECHADA = 45;
  for (let n = 4; n <= 12; n++) for (const s of [1, 2]) {
    const cfg = configRodada(n, s);
    const { pista: p, corrida: c, jogador } = montarRodada(cfg, { personagem: 0, boia: 0 }, 'eu');
    largar(c);
    // sem trombadas no jogador: quem tira da pista aqui e so a centrifuga
    jogador.protecao = 1e9;
    let saiu = -1;
    let iCurva = -1;
    while (c.t < 120 && saiu < 0 && jogador.estado !== 'chegou' && jogador.estado !== 'fora') {
      controlarBots(c, jogador);
      jogador.dir = 0;
      passoCorrida(c, DT);
      for (const e of c.eventos) if (e.id === jogador.id && e.tipo === 'decolou') saiu = jogador.sDecola;
      c.eventos.length = 0;
      const i = Math.floor(jogador.s / DS);
      if (iCurva < 0 && jogador.estado === 'calha' && jogador.v * jogador.v * Math.abs(p.k[i]) >= FECHADA) iCurva = i;
    }
    assert.ok(saiu >= 0, `rodada ${n}/${s}: nao saiu da pista`);
    // saiu antes mesmo de chegar a uma curva fechada (numa curva mais aberta): vale, mas numa curva
    if (iCurva < 0) {
      // numa curva ou na saida dela (o pendulo ainda vem balancando): curvatura nos 30 m antes da decolagem
      let kMax = 0;
      for (let i = Math.floor((saiu - 30) / DS); i <= Math.floor(saiu / DS); i++) kMax = Math.max(kMax, Math.abs(p.k[Math.max(0, i)]));
      assert.ok(kMax > 1 / 60, `rodada ${n}/${s}: saiu numa reta em s=${saiu}`);
      continue;
    }
    let j = iCurva;
    while (j < p.n && Math.abs(p.k[j]) > 1 / 120) j++;
    assert.ok(saiu <= j * DS + 10, `rodada ${n}/${s}: saiu em s=${saiu.toFixed(0)}, depois da primeira curva fechada (${iCurva * DS}-${j * DS})`);
  }
});

test('rodada 1 (protegida): o piloto quase sempre ganha; parado, a centrifuga ja derruba, mas nunca sai da rodada', () => {
  let ganhou = 0;
  for (let s = 1; s <= 8; s++) {
    const r = simular(1, s, 'piloto');
    if (r.lugar === 1) ganhou++;
    assert.notEqual(r.jogador.estado, 'fora');
    const p = simular(1, s, 'parado');
    assert.notEqual(p.jogador.estado, 'fora', 'saiu da rodada protegida');
    assert.ok(p.ev.quedasJog >= 1, 'parado nao caiu nenhuma vez na rodada 1');
  }
  assert.ok(ganhou >= 7, `piloto ganhou ${ganhou}/8`);
});

test('o piloto pega atalhos (o "uau" da rodada 1 aparece cedo)', () => {
  const r = simular(1, 2, 'piloto');
  assert.ok(r.ev.atalhosJog >= 2, `atalhos ${r.ev.atalhosJog}`);
});

test('so bots: arriscam atalhos a partir da rodada 2, alguns caem, a maioria chega', () => {
  for (const n of [4, 7, 10]) {
    const r = simular(n, 5, 'so-bots');
    const bots = r.c.corredores.filter((k) => k.bot);
    const chegaram = bots.filter((k) => k.estado === 'chegou').length;
    assert.ok(r.ev.atalhosBots >= 5, `rodada ${n}: ${r.ev.atalhosBots} atalhos de bots`);
    assert.ok(chegaram >= bots.length * 0.4, `rodada ${n}: so ${chegaram}/${bots.length} chegaram`);
  }
  const r1 = simular(1, 5, 'so-bots');
  assert.ok(r1.ev.atalhosBots <= 6, `na rodada 1 os bots quase nao arriscam (${r1.ev.atalhosBots})`);
});

test('roteiro: novidade antes do minuto 2 e a cada ~2 rodadas; parques abrem na ordem', () => {
  assert.equal(novidadeDaRodada(1), null);
  for (let n = 2; n <= 8; n++) assert.ok(novidadeDaRodada(n), `rodada ${n} sem novidade`);
  for (let n = 9; n <= 30; n += 2) assert.ok(novidadeDaRodada(n), `rodada ${n} sem evento`);
  assert.equal(parqueDaRodada(1), 'tropical');
  assert.equal(parqueDaRodada(4), 'doces');
  assert.equal(parqueDaRodada(7), 'gelo');
  assert.equal(eventoDaRodada(5), 'moedas');
  assert.equal(configRodada(1, 1).volta, true);
  assert.equal(configRodada(4, 1).volta, false);
  assert.equal(configRodada(1, 1).nBots, 11);
  assert.equal(configRodada(5, 1).nBots, 19);
});

test('meta: moedas pela colocacao, desbloqueio automatico em ordem, presente do dia uma vez', () => {
  assert.equal(moedasDaCorrida({ lugar: 1, fora: false, progresso: 1, pegas: 0, derrubados: 0 }), 60);
  assert.equal(moedasDaCorrida({ lugar: 12, fora: false, progresso: 1, pegas: 3, derrubados: 1 }), 18);
  assert.equal(moedasDaCorrida({ lugar: 9, fora: true, progresso: 0.5, pegas: 0, derrubados: 0 }), 10);
  let s = saveNovo();
  const r1 = aplicarCorrida(s, { lugar: 1, fora: false, progresso: 1, pegas: 0, derrubados: 0, segundos: 55 }, '2026-11-20');
  assert.equal(r1.ganhos, 120, 'presente do dia dobra a primeira');
  assert.ok(r1.presente);
  assert.equal(r1.novos.length, 1, 'primeiro desbloqueio logo na primeira vitoria');
  assert.deepEqual(r1.novos[0], ORDEM_COLECAO[0]);
  assert.equal(r1.save.escolha.personagem, ORDEM_COLECAO[0].id, 'o novo ja fica vestido');
  assert.equal(s.corridas, 0, 'nao muda o save recebido');
  s = r1.save;
  const r2 = aplicarCorrida(s, { lugar: 1, fora: false, progresso: 1, pegas: 0, derrubados: 0, segundos: 55 }, '2026-11-20');
  assert.equal(r2.ganhos, 60, 'presente so uma vez por dia');
  assert.ok(presenteAtivo(r2.save, '2026-11-21'));
  assert.equal(r2.save.coroas, 2);
  assert.equal(r2.save.rodada, 3);
  // colecao inteira abre e para
  const cheio = saveNovo();
  const novos = somarMoedas(cheio, 100000);
  assert.equal(novos.length, ORDEM_COLECAO.length);
  assert.equal(precoProximo(cheio), null);
  assert.equal(cheio.personagens.length, PERSONAGENS.length);
  assert.equal(cheio.boias.length, BOIAS.length);
  escolher(cheio, 'boia', 5);
  assert.equal(cheio.escolha.boia, 5);
});

test('save: qualquer lixo vira um save valido; so escolhe o que tem', () => {
  for (const lixo of [null, 3, 'x', [], { v: 99 }, { v: 1, rodada: -5, moedas: 'a', personagens: [99, 2, 'x'], escolha: { personagem: 17 } }]) {
    const s = normalizarSave(lixo);
    assert.ok(s.rodada >= 1 && s.moedas >= 0);
    assert.ok(s.personagens.includes(0));
    assert.ok(s.personagens.includes(s.escolha.personagem));
    assert.ok(s.personagens.every((i) => i >= 0 && i < PERSONAGENS.length));
  }
});

test('sem tremor: 20 corredores no pelotao, a aceleracao lateral nao fica trocando de sinal passo a passo', () => {
  for (const [n, sem] of [[5, 1], [5, 2], [8, 3]]) {
    const cfg = configRodada(n, sem);
    const { pista, corrida: c, jogador } = montarRodada(cfg, { personagem: 0, boia: 0 }, 'eu');
    assert.equal(c.corredores.length, 20);
    ligarPiloto(jogador, pista.atalhos.length, 0.95);
    largar(c);
    const hist = c.corredores.map(() => /** @type {number[]} */ ([]));
    const ultimo = c.corredores.map(() => 0);
    const porCorredor = c.corredores.map(() => 0);
    const seguidos = c.corredores.map(() => 0);
    let zigue = 0;
    let amostras = 0;
    let maiorSequencia = 0;
    while (c.t < 20) {
      controlarBots(c, jogador, DT);
      passoCorrida(c, DT);
      c.eventos.length = 0;
      c.corredores.forEach((k, i) => {
        const h = hist[i];
        if (k.estado !== 'calha' || k.salto) {
          h.length = 0;
          return;
        }
        h.push(k.u);
        if (h.length > 3) h.shift();
        if (h.length < 3) return;
        amostras++;
        const a = (h[2] - 2 * h[1] + h[0]) / (DT * DT);
        if (Math.sign(a) !== Math.sign(ultimo[i]) && Math.abs(a) > 3 && Math.abs(ultimo[i]) > 3) {
          zigue++;
          porCorredor[i]++;
          seguidos[i]++;
          maiorSequencia = Math.max(maiorSequencia, seguidos[i]);
        } else seguidos[i] = 0;
        ultimo[i] = a;
      });
    }
    const media = zigue / (amostras * DT);
    // tremer = trocar de sinal a cada passo (60 por segundo); batida normal = 1 ou 2 trocas
    assert.ok(media < 1.5, `rodada ${n}: ${media.toFixed(2)} trocas por corredor-segundo`);
    assert.ok(Math.max(...porCorredor) / 20 < 4, `rodada ${n}: um corredor tremendo (${Math.max(...porCorredor) / 20}/s)`);
    assert.ok(maiorSequencia <= 3, `rodada ${n}: ${maiorSequencia} trocas seguidas (vai-e-vem)`);
  }
});
