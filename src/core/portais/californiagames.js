// [kit multiportal] Adaptador do californiagames.io (PlataformaSDK 1.1.x), porte de
// solitaire-soccer/src/core/plataforma.js (criarCalifornia) com a interface Portal do kit. E o alvo
// padrao do codigo-fonte: o index.html do jogo traz a tag RELATIVA <script src="/sdk/v1/plataforma-sdk.js">
// no <head> (o portal serve a SDK na origem dos jogos; ela nunca vai no zip; no teste local o
// tools/servir.mjs a serve de ../../plataforma/frontend/public/sdk, em modo autonomo com anuncio simulado).
//
// Regras da SDK e licoes do distribuicao/RELATORIO.md:
// - init() o quanto antes, gameLoadingStart junto; a SDK so espera o handshake por 1,5 s, entao o laco
//   so comeca depois do init (lacoAposInit) e nada pesado roda antes dele;
// - os sinais pause/resume/mute/unmute sao ouvidos ANTES do init: o portal os reenvia logo depois do
//   handshake e nao repete para quem passa a ouvir depois. O ultimo estado fica guardado e vale para o
//   aviso registrado mais tarde (os setters onPausaPlataforma/onMudoPlataforma);
// - gameLoadingProgress: chamadas a menos de 100 ms da anterior sao descartadas pelo portal (aqui, 120 ms);
// - gameLoadingFinished uma vez; gameplayStart nunca antes dele; gameplayStop antes de todo intervalo;
// - o resume do portal pode chegar ANTES da promessa do anuncio resolver: nada de gameplayStart durante
//   o anuncio (emAnuncio), e o jogo so volta ao gameplay no proximo gesto do jogador;
// - commercialBreak(onStart) em todo ponto natural: o PORTAL limita a frequencia (60 s de jogo antes do
//   primeiro, 120 s entre eles, 8 por hora);
// - rewardedBreak SEMPRE como objeto ({ size, onStart }): a funcao solta e ignorada em silencio; premio
//   so com true;
// - idioma por getLanguage() ('pt-BR' | 'en' | 'es'), nunca pelo navegador; sem SDK, ingles;
// - isAdBlocked(): sem video premiado (temVideo falso).

/** @param {unknown} v */
const limparCampo = (v) => String(v ?? '').replace(/[/^]/g, '-');

/**
 * @param {{ obterSdk?: () => any, agora?: () => number }} [o]
 * @returns {import('./fila-sdk.js').Portal}
 */
export function criarPortalCalifornia({
  obterSdk = () => /** @type {any} */ (globalThis).PlataformaSDK,
  agora = () => Date.now(),
} = {}) {
  let pronto = false;
  let carregou = false;
  let jogando = false;
  let jaJogou = false;
  let emAnuncio = false;
  let ultimoProgresso = -1e9;
  /** @type {Promise<void>|null} */
  let promessaInit = null;
  /** ultimo sinal do portal (vale para o aviso registrado depois dele) */
  const estado = { pausado: false, mudo: false };
  /** @type {((p: boolean) => void)|null} */
  let avisoPausa = null;
  /** @type {((m: boolean) => void)|null} */
  let avisoMudo = null;

  /** @returns {any} */
  function sdk() {
    try {
      const s = obterSdk();
      return s && (typeof s === 'object' || typeof s === 'function') ? s : null;
    } catch {
      return null;
    }
  }

  /** @param {string} nome @param {...any} args */
  function chamar(nome, ...args) {
    const s = sdk();
    if (!s) return undefined;
    try {
      return typeof s[nome] === 'function' ? s[nome](...args) : undefined;
    } catch {
      return undefined;
    }
  }

  /** @param {Function|null} fn @param {...any} args */
  function avisar(fn, ...args) {
    if (typeof fn !== 'function') return;
    try {
      fn(...args);
    } catch {
      /* ignora */
    }
  }

  function lerIdioma() {
    const l = chamar('getLanguage');
    return l === 'pt-BR' || l === 'en' || l === 'es' ? l : '';
  }

  function init() {
    if (promessaInit) return promessaInit;
    chamar('on', 'pause', () => { estado.pausado = true; avisar(avisoPausa, true); });
    chamar('on', 'resume', () => { estado.pausado = false; avisar(avisoPausa, false); });
    chamar('on', 'mute', () => { estado.mudo = true; avisar(avisoMudo, true); });
    chamar('on', 'unmute', () => { estado.mudo = false; avisar(avisoMudo, false); });
    const pedido = chamar('init');
    chamar('gameLoadingStart');
    promessaInit = Promise.resolve(pedido)
      .catch(() => undefined)
      .then(() => {
        pronto = !!sdk();
      });
    return promessaInit;
  }

  /** @param {number} fracao 0..1 */
  function gameLoadingProgress(fracao) {
    if (carregou) return;
    const t = agora();
    if (t - ultimoProgresso < 120) return;
    ultimoProgresso = t;
    chamar('gameLoadingProgress', Math.max(0, Math.min(1, Number(fracao) || 0)));
  }

  function gameLoadingFinished() {
    if (carregou) return;
    carregou = true;
    chamar('gameLoadingFinished');
  }

  function gameplayStart() {
    if (jogando || emAnuncio) return;
    gameLoadingFinished();
    jogando = true;
    jaJogou = true;
    chamar('gameplayStart');
  }

  function gameplayStop() {
    if (!jogando) return;
    jogando = false;
    chamar('gameplayStop');
  }

  async function rodarAnuncio(pedir, reserva) {
    gameplayStop();
    emAnuncio = true;
    let calou = false;
    const onStart = () => {
      if (calou) return;
      calou = true;
      avisar(portal.onAdStart);
    };
    let resultado = reserva;
    try {
      resultado = await pedir(onStart);
    } catch {
      resultado = reserva;
    }
    emAnuncio = false;
    if (calou) avisar(portal.onAdEnd);
    return resultado;
  }

  async function commercialBreak() {
    const s = sdk();
    if (emAnuncio || !jaJogou || !s || typeof s.commercialBreak !== 'function') return false;
    await rodarAnuncio((onStart) => s.commercialBreak(onStart), undefined);
    return true;
  }

  /** @param {'small'|'medium'|'large'} [tamanho] */
  async function rewardedBreak(tamanho = 'medium') {
    const s = sdk();
    if (emAnuncio || !s || typeof s.rewardedBreak !== 'function') return false;
    const r = await rodarAnuncio((onStart) => s.rewardedBreak({ size: tamanho, onStart }), false);
    return r === true;
  }

  function measure(categoria, oque, acao) {
    if (emAnuncio) return;
    chamar('measure', limparCampo(categoria), limparCampo(oque), limparCampo(acao));
  }

  const bloqueado = () => chamar('isAdBlocked') === true;

  const portal = {
    nome: 'californiagames',
    init,
    gameLoadingProgress,
    gameLoadingFinished,
    gameplayStart,
    gameplayStop,
    commercialBreak,
    rewardedBreak,
    measure,
    festa() {},
    fonteDados: () => Promise.resolve(null),
    get sdkPronto() { return pronto; },
    get temAnuncios() { return pronto && !bloqueado(); },
    get temVideo() { return pronto && !bloqueado(); },
    get jaJogou() { return jaJogou; },
    get emAnuncio() { return emAnuncio; },
    get jogando() { return jogando; },
    get bloqueador() { return pronto && bloqueado(); },
    get idioma() { return lerIdioma() || 'en'; },
    /** @type {(() => void)|null} */
    onAdStart: null,
    /** @type {(() => void)|null} */
    onAdEnd: null,
    /** @type {(() => void)|null} */
    onSemAnuncios: null,
    get onPausaPlataforma() { return avisoPausa; },
    set onPausaPlataforma(fn) {
      avisoPausa = typeof fn === 'function' ? fn : null;
      if (avisoPausa && estado.pausado) avisar(avisoPausa, true);
    },
    get onMudoPlataforma() { return avisoMudo; },
    set onMudoPlataforma(fn) {
      avisoMudo = typeof fn === 'function' ? fn : null;
      if (avisoMudo && estado.mudo) avisar(avisoMudo, true);
    },
    lacoAposInit: true,
    intervaloSoNoClique: false,
    pausaNoBlur: false,
  };
  return /** @type {any} */ (portal);
}

export const portal = criarPortalCalifornia();
export const PLATAFORMA = 'californiagames';
