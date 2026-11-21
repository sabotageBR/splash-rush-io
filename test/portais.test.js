// [kit multiportal] Os tres adaptadores com SDKs falsos: ordem dos eventos, prazos com SDK pendurado,
// premio so com true, mudo no momento certo de cada portal, Basic Launch da CrazyGames e sinais do
// californiagames.io que chegam antes do aviso.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarPortalPoki } from '../src/core/portais/poki.js';
import { criarPortalCrazy } from '../src/core/portais/crazygames.js';
import { criarPortalCalifornia } from '../src/core/portais/californiagames.js';

const tique = () => new Promise((r) => setTimeout(r, 0));

function pokiFalso({ init = () => Promise.resolve(), premio = true } = {}) {
  const log = [];
  return {
    log,
    sdk: {
      init: () => { log.push('init'); return init(); },
      gameLoadingFinished: () => log.push('loadingFinished'),
      gameplayStart: () => log.push('gameplayStart'),
      gameplayStop: () => log.push('gameplayStop'),
      commercialBreak: (onStart) => { log.push('commercialBreak'); onStart && onStart(); return Promise.resolve(); },
      rewardedBreak: (o) => { log.push(`rewarded:${typeof o}`); o.onStart && o.onStart(); return Promise.resolve(premio); },
      measure: (...a) => log.push(`measure:${a.join('|')}`),
    },
  };
}

test('poki: fila ate o init, loading antes do gameplay, measure limpo', async () => {
  const f = pokiFalso();
  const p = criarPortalPoki({ obterSdk: () => f.sdk });
  p.measure('level', '1/2', 'start');
  p.gameplayStart();
  await p.init();
  await tique();
  assert.deepEqual(f.log, ['init', 'loadingFinished', 'gameplayStart', 'measure:level|1-2|start']);
  p.gameplayStart();
  assert.equal(f.log.filter((x) => x === 'gameplayStart').length, 1, 'idempotente');
});

test('poki: SDK pendurado (bloqueador) nao trava o init nem o anuncio', async () => {
  const p = criarPortalPoki({ obterSdk: () => ({ init: () => new Promise(() => {}) }), prazos: { init: 20 } });
  const t0 = Date.now();
  await p.init();
  assert.ok(Date.now() - t0 < 500);
  assert.equal(p.sdkPronto, false);
  assert.equal(await p.commercialBreak(), false);
  assert.equal(await p.rewardedBreak(), false);
});

test('poki: anuncio cala ANTES, para o gameplay e devolve; premio so com true', async () => {
  const f = pokiFalso({ premio: 'true' });
  const p = criarPortalPoki({ obterSdk: () => f.sdk });
  const ev = [];
  p.onAdStart = () => ev.push('cala');
  p.onAdEnd = () => ev.push('volta');
  await p.init();
  p.gameplayStart();
  assert.equal(await p.commercialBreak(), true);
  assert.deepEqual(ev, ['cala', 'volta']);
  assert.ok(f.log.indexOf('gameplayStop') < f.log.indexOf('commercialBreak'));
  assert.equal(await p.rewardedBreak('small'), false, "'true' (texto) nao premia");
  assert.ok(f.log.includes('rewarded:object'), 'rewarded como objeto');
});

test('poki: commercialBreak recusado antes do primeiro gameplay', async () => {
  const f = pokiFalso();
  const p = criarPortalPoki({ obterSdk: () => f.sdk });
  await p.init();
  assert.equal(await p.commercialBreak(), false);
});

function crazyFalso({ erro = null } = {}) {
  const log = [];
  const dados = new Map();
  return {
    log,
    dados,
    sdk: {
      environment: 'local',
      init: () => { log.push('init'); return Promise.resolve(); },
      game: {
        settings: { muteAudio: false },
        addSettingsChangeListener: () => {},
        loadingStart: () => log.push('loadingStart'),
        loadingStop: () => log.push('loadingStop'),
        gameplayStart: () => log.push('gameplayStart'),
        gameplayStop: () => log.push('gameplayStop'),
        happytime: () => log.push('happytime'),
      },
      ad: {
        hasAdblock: () => Promise.resolve(false),
        requestAd: (tipo, cb) => {
          log.push(`requestAd:${tipo}`);
          if (erro) { cb.adError({ code: erro }); return; }
          cb.adStarted();
          cb.adFinished();
        },
      },
      data: { getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, v), removeItem: (k) => dados.delete(k) },
      user: { systemInfo: { locale: 'es-ES' } },
    },
  };
}

test('crazygames: loadingStart no init, mudo so no adStarted, premio no adFinished, idioma do systemInfo', async () => {
  const f = crazyFalso();
  const p = criarPortalCrazy({ obterSdk: () => f.sdk });
  const ev = [];
  p.onAdStart = () => ev.push('cala');
  p.onAdEnd = () => ev.push('volta');
  await p.init();
  await tique();
  p.gameplayStart();
  assert.deepEqual(f.log.slice(0, 4), ['init', 'loadingStart', 'loadingStop', 'gameplayStart']);
  assert.equal(await p.rewardedBreak(), true);
  assert.deepEqual(ev, ['cala', 'volta']);
  assert.equal(p.idioma, 'es-ES');
  assert.ok(await p.fonteDados(), 'modulo data disponivel');
});

test('crazygames: Basic Launch (adsDisabled) esconde os videos e avisa uma vez', async () => {
  const f = crazyFalso({ erro: 'adsDisabled' });
  const p = criarPortalCrazy({ obterSdk: () => f.sdk });
  let avisos = 0;
  p.onSemAnuncios = () => avisos++;
  await p.init();
  p.gameplayStart();
  assert.equal(p.temVideo, true);
  assert.equal(await p.rewardedBreak(), false);
  assert.equal(p.temVideo, false);
  assert.equal(avisos, 1);
  assert.equal(await p.commercialBreak(), false, 'sem anuncios, nada e pedido');
});

test('crazygames: build basic (anuncios falso) nunca oferece video', async () => {
  const f = crazyFalso();
  const p = criarPortalCrazy({ obterSdk: () => f.sdk, anuncios: false });
  await p.init();
  assert.equal(p.temVideo, false);
  assert.equal(await p.rewardedBreak(), false);
  assert.ok(!f.log.some((x) => x.startsWith('requestAd')));
});

test('crazygames: ambiente disabled = sem SDK', async () => {
  const f = crazyFalso();
  f.sdk.environment = 'disabled';
  const p = criarPortalCrazy({ obterSdk: () => f.sdk });
  await p.init();
  assert.equal(p.sdkPronto, false);
  assert.equal(f.log.length, 0);
});

function californiaFalso({ premio = true, bloqueado = false } = {}) {
  const log = [];
  const ouvintes = {};
  return {
    log,
    emitir: (ev) => (ouvintes[ev] || []).forEach((fn) => fn()),
    sdk: {
      on: (ev, fn) => { (ouvintes[ev] ||= []).push(fn); log.push(`on:${ev}`); },
      init: () => { log.push('init'); return Promise.resolve(); },
      gameLoadingStart: () => log.push('loadingStart'),
      gameLoadingProgress: (p) => log.push(`progress:${p}`),
      gameLoadingFinished: () => log.push('loadingFinished'),
      gameplayStart: () => log.push('gameplayStart'),
      gameplayStop: () => log.push('gameplayStop'),
      commercialBreak: (onStart) => { log.push('commercialBreak'); onStart(); return Promise.resolve(); },
      rewardedBreak: (o) => {
        log.push(`rewarded:${typeof o}`);
        if (typeof o !== 'object') return Promise.resolve(false);
        o.onStart();
        return Promise.resolve(premio);
      },
      measure: (...a) => log.push(`measure:${a.join('|')}`),
      getLanguage: () => 'pt-BR',
      isAdBlocked: () => bloqueado,
    },
  };
}

test('californiagames: ouve os sinais antes do init; loading, progresso limitado, gameplay', async () => {
  const f = californiaFalso();
  let t = 0;
  const p = criarPortalCalifornia({ obterSdk: () => f.sdk, agora: () => t });
  await p.init();
  assert.ok(f.log.indexOf('on:pause') < f.log.indexOf('init'));
  p.gameLoadingProgress(0.3);
  t += 50;
  p.gameLoadingProgress(0.5);
  t += 200;
  p.gameLoadingProgress(0.9);
  assert.deepEqual(f.log.filter((x) => x.startsWith('progress')), ['progress:0.3', 'progress:0.9']);
  p.gameplayStart();
  assert.ok(f.log.indexOf('loadingFinished') < f.log.indexOf('gameplayStart'));
  assert.equal(p.idioma, 'pt-BR');
  assert.equal(p.lacoAposInit, true);
});

test('californiagames: sinal de pausa e mudo antes do aviso vale quando o aviso chega', async () => {
  const f = californiaFalso();
  const p = criarPortalCalifornia({ obterSdk: () => f.sdk });
  await p.init();
  f.emitir('pause');
  f.emitir('mute');
  const ev = [];
  p.onPausaPlataforma = (v) => ev.push(`pausa:${v}`);
  p.onMudoPlataforma = (v) => ev.push(`mudo:${v}`);
  f.emitir('resume');
  assert.deepEqual(ev, ['pausa:true', 'mudo:true', 'pausa:false']);
});

test('californiagames: rewarded como objeto, premio so com true; bloqueador esconde o video', async () => {
  const f = californiaFalso({ premio: 1 });
  const p = criarPortalCalifornia({ obterSdk: () => f.sdk });
  await p.init();
  p.gameplayStart();
  assert.equal(await p.rewardedBreak(), false, '1 nao premia');
  assert.ok(f.log.includes('rewarded:object'));
  assert.ok(f.log.indexOf('gameplayStop') < f.log.indexOf('rewarded:object'));
  const b = californiaFalso({ bloqueado: true });
  const p2 = criarPortalCalifornia({ obterSdk: () => b.sdk });
  await p2.init();
  assert.equal(p2.temVideo, false);
});

test('californiagames: sem SDK o jogo roda em ingles e sem anuncios', async () => {
  const p = criarPortalCalifornia({ obterSdk: () => undefined });
  await p.init();
  assert.equal(p.idioma, 'en');
  assert.equal(p.temVideo, false);
  p.gameplayStart();
  assert.equal(await p.commercialBreak(), false);
});

import { criarPortalY8 } from '../src/core/portais/y8.js';

function y8Falso({ viu = true, pulado = false } = {}) {
  const ouvintes = {};
  const janela = { addEventListener: (ev, fn) => { (ouvintes[ev] ||= []).push(fn); } };
  const log = [];
  const sdkObj = {
    init: (a, b) => log.push(`init:${a.appId}:${b && b.gameId}`),
    getPlatformLocale: () => Promise.resolve('es'),
    showAd: (p) => {
      log.push(`showAd:${p.type}`);
      if (pulado) { p.adBreakDone({ breakStatus: 'frequencyCapped' }); return; }
      p.beforeAd();
      if (p.type === 'reward') p.beforeReward(() => { if (viu) p.adViewed(); else p.adDismissed(); });
      p.afterAd();
      p.adBreakDone({ breakStatus: 'viewed' });
    },
  };
  const y8 = { sdk: () => sdkObj, emitReadyEvent: () => (ouvintes['y8sdk.ready'] || []).forEach((f) => f()) };
  return { janela, y8, log };
}

test('y8: sem appId o SDK nao inicia e nao ha video', async () => {
  const f = y8Falso();
  const p = criarPortalY8({ obterSdk: () => f.y8, ids: {}, janela: f.janela });
  await p.init();
  assert.equal(p.sdkPronto, false);
  assert.equal(p.temVideo, false);
  assert.equal(f.log.length, 0);
});

test('y8: SDK bloqueado (onerror da tag) segue na hora, sem esperar o prazo do init', async () => {
  const f = y8Falso();
  const ja = criarPortalY8({ obterSdk: () => undefined, ids: { appId: 'a1', gameId: 'g1' }, janela: { ...f.janela, __sdkFalhou: 1 } });
  const t0 = Date.now();
  await ja.init();
  assert.ok(Date.now() - t0 < 500);
  assert.equal(ja.temAnuncios, false);
  const ouvintes = {};
  const janela = { addEventListener: (ev, fn) => { (ouvintes[ev] ||= []).push(fn); } };
  const depois = criarPortalY8({ obterSdk: () => undefined, ids: { appId: 'a1', gameId: 'g1' }, janela });
  const t1 = Date.now();
  const pronto = depois.init();
  setTimeout(() => (ouvintes['y8sdk.falhou'] || []).forEach((fn) => fn()), 20);
  await pronto;
  assert.ok(Date.now() - t1 < 500);
  assert.equal(depois.temAnuncios, false);
});

test('y8: init com os ids, idioma do subdominio, intervalo so no clique e pausa no blur', async () => {
  const f = y8Falso();
  const p = criarPortalY8({ obterSdk: () => f.y8, ids: { appId: 'a1', gameId: 'g1' }, janela: f.janela });
  await p.init();
  assert.equal(p.sdkPronto, true);
  assert.deepEqual(f.log, ['init:a1:g1']);
  assert.equal(p.idioma, 'es');
  assert.equal(p.intervaloSoNoClique, true);
  assert.equal(p.pausaNoBlur, true);
  assert.equal(p.temVideo, true);
});

test('y8: cala so no beforeAd; break pulado nao cala; premio so no adViewed', async () => {
  const f = y8Falso();
  const p = criarPortalY8({ obterSdk: () => f.y8, ids: { appId: 'a1', gameId: 'g1' }, janela: f.janela });
  const ev = [];
  p.onAdStart = () => ev.push('cala');
  p.onAdEnd = () => ev.push('volta');
  await p.init();
  p.gameplayStart();
  assert.equal(await p.commercialBreak(), true);
  assert.deepEqual(ev, ['cala', 'volta']);
  assert.equal(await p.rewardedBreak('small'), true);
  const g = y8Falso({ pulado: true });
  const q = criarPortalY8({ obterSdk: () => g.y8, ids: { appId: 'a1', gameId: 'g1' }, janela: g.janela });
  const ev2 = [];
  q.onAdStart = () => ev2.push('cala');
  await q.init();
  q.gameplayStart();
  await q.commercialBreak();
  assert.deepEqual(ev2, [], 'break pulado pelo limite de frequencia nao cala o jogo');
  const h = y8Falso({ viu: false });
  const r = criarPortalY8({ obterSdk: () => h.y8, ids: { appId: 'a1', gameId: 'g1' }, janela: h.janela });
  await r.init();
  assert.equal(await r.rewardedBreak(), false, 'fechou o video: sem premio');
});
