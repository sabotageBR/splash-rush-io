// [kit multiportal] Adaptador da CrazyGames (SDK v3), sobre o fila-sdk.js (porte de
// slime-merge/src/core/crazygames.js). Entra so nas builds --alvo=crazygames (Full Launch, com
// anuncios) e --alvo=crazygames-basic (Basic Launch: ANUNCIOS false, nenhum botao de video).
// Diferencas (docs.crazygames.com):
// - ambiente 'disabled' (fora da CrazyGames e do localhost): o SDK nem aparece e o jogo segue sem SDK;
// - init + game.loadingStart; gameLoadingFinished e game.loadingStop;
// - anuncio: ad.requestAd('midgame'|'rewarded', { adStarted, adFinished, adError }). Premio so no
//   adFinished. O jogo cala so no adStarted (calarNoInicio falso). No maximo um midgame a cada 3 min:
//   o SDK recusa com adCooldown, sem dano;
// - Basic Launch: o erro adsDisabled (ou o antigo adsDisabledBasicLaunch) desliga os anuncios na sessao
//   e chama onSemAnuncios (o main.js esconde os botoes de video). Botao de video sem efeito reprova;
// - bloqueador: ad.hasAdblock() e o erro 'adblock' desligam os videos (bloqueador = true);
// - progresso: modulo data do SDK (obrigatorio no Full Launch com Progress Save ligado), devolvido por
//   fonteDados() para o armazenamento;
// - idioma: user.systemInfo.locale; happytime nos marcos (festa); muteAudio das configuracoes do portal
//   vira onMudoPlataforma.
import { criarFilaSdk } from './fila-sdk.js';

/** Anuncios ligados nesta build (o empacotar --alvo=crazygames-basic grava false). */
export const ANUNCIOS = true;

/** Chave de teste do modulo data (grava, le e apaga). */
const SONDA = '__kit.sonda';

/**
 * @param {{ obterSdk?: () => any, anuncios?: boolean, prazos?: any, agendar?: any, cancelar?: any }} [o]
 */
export function criarPortalCrazy({
  obterSdk = () => /** @type {any} */ (globalThis).CrazyGames?.SDK,
  anuncios = ANUNCIOS,
  prazos,
  agendar,
  cancelar,
} = {}) {
  let desligados = !anuncios;
  let bloqueado = false;
  /** @type {any} */
  let origem = null;
  /** @type {any} */
  let adaptador = null;

  function cg() {
    try {
      const s = obterSdk();
      return s && typeof s === 'object' && s.environment !== 'disabled' ? s : null;
    } catch {
      return null;
    }
  }

  function avisar(fn, ...a) {
    try {
      if (typeof fn === 'function') fn(...a);
    } catch {
      /* ignora */
    }
  }

  function desligar(porBloqueador) {
    const antes = desligados || bloqueado;
    if (porBloqueador) bloqueado = true;
    else desligados = true;
    if (!antes) avisar(portal.onSemAnuncios);
  }

  function avisarMudo(s) {
    try {
      avisar(portal.onMudoPlataforma, !!(s.game && s.game.settings && s.game.settings.muteAudio));
    } catch {
      /* ignora */
    }
  }

  function pedir(s, tipo, aoIniciar) {
    return new Promise((resolve) => {
      s.ad.requestAd(tipo, {
        adStarted: () => { if (typeof aoIniciar === 'function') aoIniciar(); },
        adFinished: () => resolve(true),
        adError: (erro) => {
          const code = erro && erro.code;
          if (code === 'adsDisabled' || code === 'adsDisabledBasicLaunch') desligar(false);
          else if (code === 'adblock') desligar(true);
          resolve(false);
        },
      });
    });
  }

  function olharBloqueador(s) {
    if (desligados) return;
    try {
      Promise.resolve(s.ad.hasAdblock()).then((v) => { if (v === true) desligar(true); }, () => {});
    } catch {
      /* ignora */
    }
  }

  function adaptar(s) {
    const sem = () => desligados || bloqueado;
    return {
      init: () => Promise.resolve(s.init()).then(() => {
        avisarMudo(s);
        try { s.game.addSettingsChangeListener(() => avisarMudo(s)); } catch { /* ignora */ }
        olharBloqueador(s);
        try { s.game.loadingStart(); } catch { /* ignora */ }
      }),
      gameLoadingFinished: () => s.game.loadingStop(),
      gameplayStart: () => s.game.gameplayStart(),
      gameplayStop: () => s.game.gameplayStop(),
      get commercialBreak() {
        return sem() ? undefined : (aoIniciar) => pedir(s, 'midgame', aoIniciar);
      },
      get rewardedBreak() {
        return sem() ? undefined : (o) => pedir(s, 'rewarded', typeof o === 'function' ? o : o && o.onStart);
      },
    };
  }

  const portal = criarFilaSdk({
    nome: 'crazygames',
    obterSdk: () => {
      const s = cg();
      if (!s) return null;
      if (s !== origem) {
        origem = s;
        adaptador = adaptar(s);
      }
      return adaptador;
    },
    prazos,
    agendar,
    cancelar,
    calarNoInicio: false,
  });
  Object.defineProperties(portal, {
    temAnuncios: { get: () => portal.sdkPronto && !desligados && !bloqueado && cg() !== null, configurable: true },
    bloqueador: { get: () => bloqueado, configurable: true },
    idioma: {
      get: () => {
        try {
          const l = cg()?.user?.systemInfo?.locale;
          return typeof l === 'string' ? l : '';
        } catch {
          return '';
        }
      },
      configurable: true,
    },
  });
  portal.fonteDados = async () => {
    await portal.init();
    const s = cg();
    if (!s || !portal.sdkPronto) return null;
    try {
      const d = s.data;
      if (!d || typeof d.getItem !== 'function' || typeof d.setItem !== 'function') return null;
      d.setItem(SONDA, '1');
      const ok = d.getItem(SONDA) === '1';
      if (typeof d.removeItem === 'function') d.removeItem(SONDA);
      return ok ? d : null;
    } catch {
      return null;
    }
  };
  portal.festa = () => {
    const s = cg();
    if (!s || !portal.sdkPronto) return;
    try { s.game.happytime(); } catch { /* ignora */ }
  };
  return portal;
}

export const portal = criarPortalCrazy();
export const PLATAFORMA = 'crazygames';
