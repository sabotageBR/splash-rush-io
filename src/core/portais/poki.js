// [kit multiportal] Adaptador da Poki (SDK v2), sobre o fila-sdk.js (porte do criarPoki de
// slime-merge/src/core/poki.js). Entra so na build --alvo=poki: o index.html leva a tag
// https://game-cdn.poki.com/scripts/v2/poki-sdk.js (unico script externo permitido) e o
// src/core/plataforma.js passa a reexportar este arquivo (tools/empacotar.mjs).
// Regras da Poki que valem aqui: calar o jogo ANTES de pedir o anuncio (calarNoInicio), commercialBreak
// so em pausa natural e sem relogio proprio, rewarded so com true, nenhum texto sobre bloqueador, idioma
// do navegador (a Poki nao informa: idioma '').
import { criarFilaSdk } from './fila-sdk.js';

/**
 * @param {{ obterSdk?: () => any, prazos?: import('./fila-sdk.js').Prazos, agendar?: any, cancelar?: any }} [o]
 */
export function criarPortalPoki({ obterSdk = () => /** @type {any} */ (globalThis).PokiSDK, prazos, agendar, cancelar } = {}) {
  const portal = criarFilaSdk({ nome: 'poki', obterSdk, prazos, agendar, cancelar, calarNoInicio: true });
  /** Move a pilula da Poki no celular (topPercent, topPx). */
  /** @type {any} */ (portal).movePill = (topPercent, topPx) => {
    try {
      const s = obterSdk();
      if (portal.sdkPronto && s && typeof s.movePill === 'function') s.movePill(topPercent, topPx);
    } catch { /* ignora */ }
  };
  return portal;
}

export const portal = criarPortalPoki();
export const PLATAFORMA = 'poki';
