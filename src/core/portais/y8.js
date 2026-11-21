// [kit multiportal] Adaptador da Y8 (docs.y8.com, SDK 2-0), sobre o fila-sdk.js (porte de
// hexadrop/src/portais/y8.js e slime-merge/src/core/portais/y8.js). Entra so na build --alvo=y8: o
// index.html leva <script src="https://cdn.y8.com/minimal-sdk/2-0/y8.min.js" async></script>.
// - appId e gameId vem da aba "SDK Initialization" do Developer Portal da Y8; o tools/empacotar.mjs grava
//   os de package.json ("kit.ids.y8") em IDS. Sem appId o SDK nem inicia e o jogo segue sem anuncios (o zip
//   sai com "-sem-id", so para teste);
// - o SDK avisa que esta pronto pelo evento y8sdk.ready; emitReadyEvent cobre o caso de ele ja ter chegado;
// - pre-roll: a propria Y8 mostra, antes da interface do jogo;
// - intervalo SO DEPOIS DE UM CLIQUE (Play, Next, Retry, Continue): as diretrizes proibem o intersticial
//   automatico no single-player. Por isso este portal liga intervaloSoNoClique: o main.js pede um clique em
//   "Continuar" antes do commercialBreak. A frequencia (~180 s) e da Y8;
// - pausar e calar DENTRO do beforeAd, nunca antes (calarNoInicio falso): break pulado (limite de
//   frequencia, sem anuncio) nao chama beforeAd nem afterAd e termina so no adBreakDone;
// - premio so no adViewed; o idioma do subdominio (getPlatformLocale);
// - pausar ao perder o foco (pausaNoBlur), requisito da Y8.
import { criarFilaSdk } from './fila-sdk.js';

/** Os ids do painel da Y8 (o tools/empacotar.mjs grava os de package.json "kit.ids.y8"). */
export const IDS = {};

/**
 * @param {{ obterSdk?: () => any, ids?: Record<string, string>, janela?: any, prazos?: any, agendar?: any, cancelar?: any }} [o]
 */
export function criarPortalY8({
  obterSdk = () => /** @type {any} */ (globalThis).y8,
  ids = IDS,
  janela = typeof window !== 'undefined' ? window : null,
  prazos,
  agendar,
  cancelar,
} = {}) {
  /** @type {any} */
  let sdk = null;
  let idioma = '';
  /** @type {any} */
  let adaptador = null;

  /** Pede um break da Y8 e resolve quando ele acaba (adBreakDone vem sempre). */
  function pedir(tipo, aoIniciar) {
    return new Promise((resolve) => {
      const premiado = tipo === 'reward';
      let viu = false;
      let fim = false;
      const sai = (ok) => {
        if (fim) return;
        fim = true;
        resolve(ok);
      };
      /** @type {any} */
      const pedido = {
        type: premiado ? 'reward' : 'next',
        name: premiado ? 'reward' : 'continue',
        beforeAd: () => { if (typeof aoIniciar === 'function') aoIniciar(); },
        afterAd: () => { if (!premiado) sai(true); },
        adBreakDone: () => sai(premiado ? viu : true),
      };
      if (premiado) {
        pedido.beforeReward = (mostrar) => { if (typeof mostrar === 'function') mostrar(); };
        pedido.adViewed = () => { viu = true; };
        pedido.adDismissed = () => {};
      }
      try {
        Promise.resolve(sdk.showAd(pedido)).catch(() => sai(false));
      } catch {
        sai(false);
      }
    });
  }

  function criarAdaptador() {
    return {
      init: async () => {
        const y8 = await new Promise((resolve) => {
          // script do SDK bloqueado (bloqueador de anuncio, rede): o onerror da tag (tools/empacotar.mjs) avisa e o
          // jogo segue sem anuncios na hora, sem esperar o prazo do init
          if (janela.__sdkFalhou) { resolve(null); return; }
          janela.addEventListener('y8sdk.falhou', () => resolve(null), { once: true, capture: true });
          janela.addEventListener('y8sdk.ready', () => resolve(obterSdk()), { once: true });
          const ja = obterSdk();
          if (ja && typeof ja.emitReadyEvent === 'function') ja.emitReadyEvent();
        });
        if (!y8 || typeof y8.sdk !== 'function') throw new Error('sem SDK');
        sdk = y8.sdk();
        sdk.init({ appId: ids.appId, autoLogin: false }, ids.gameId ? { gameId: ids.gameId, preloadAdBreaks: 'on', sound: 'on' } : undefined);
        try {
          const l = await Promise.race([Promise.resolve(sdk.getPlatformLocale()), new Promise((r) => setTimeout(() => r(''), 1500))]);
          idioma = typeof l === 'string' ? l : '';
        } catch {
          idioma = '';
        }
      },
      gameLoadingFinished: () => {},
      gameplayStart: () => {},
      gameplayStop: () => {},
      get commercialBreak() {
        return sdk && ids.gameId ? (aoIniciar) => pedir('next', aoIniciar) : undefined;
      },
      get rewardedBreak() {
        return sdk && ids.gameId ? (o) => pedir('reward', typeof o === 'function' ? o : o && o.onStart) : undefined;
      },
    };
  }

  const portal = criarFilaSdk({
    nome: 'y8',
    obterSdk: () => {
      if (!ids.appId || !janela) return null;
      if (!adaptador) adaptador = criarAdaptador();
      return adaptador;
    },
    prazos,
    agendar,
    cancelar,
    calarNoInicio: false,
  });
  Object.defineProperties(portal, {
    temAnuncios: { get: () => portal.sdkPronto && !!sdk && !!ids.gameId, configurable: true },
    idioma: { get: () => idioma, configurable: true },
  });
  /** @type {any} */ (portal).intervaloSoNoClique = true;
  /** @type {any} */ (portal).pausaNoBlur = true;
  return portal;
}

export const portal = criarPortalY8();
export const PLATAFORMA = 'y8';
