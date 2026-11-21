// [kit multiportal] Parametros de teste na URL (porte do solitaire-soccer). So valem em file://,
// localhost, 127.0.0.1 e na rede local (o celular pela Wi-Fi). No portal nada disso existe.
// Unico modulo do jogo que le a URL (test/estilo.test.js). Parametros comuns a todos os jogos:
//   ?semente=123    semente fixa (prints reprodutiveis)
//   ?novo           ignora o progresso salvo
//   ?fase=12        comeca na fase N (prints e provas)
//   ?auto[=0.3]     o bot joga sozinho (s por jogada)
//   ?filme=30       quadros de video sem relogio real (window.__jogo.quadro())
//   ?semanuncio     nao pede intervalo comercial
//   ?lang=pt        forca o idioma (pt, en, es)
//   ?limpo          sem HUD (arte e capas)
//   ?debug          fps e ms do desenho no canto
// O jogo acrescenta os dele em `extras` (lidos como texto). Em todo endereco local o jogo tambem expoe
// window.__jogo (os roteiros de prova e de midia o usam).

/** @param {string[]} [extras] nomes de parametros proprios do jogo */
export function lerDepuracao(extras = []) {
  const base = {
    local: false, ganchos: false, semente: 0, novo: false, fase: 0, auto: false, ritmo: 0.3, filme: 0,
    semAnuncio: false, lang: '', limpo: false, debug: false, /** @type {Record<string, string>} */ extras: {},
  };
  let local = false;
  try {
    local = location.protocol === 'file:'
      || /^(127\.0\.0\.1|localhost|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)$/.test(location.hostname);
  } catch {
    local = false;
  }
  if (!local) return base;
  const q = new URLSearchParams(location.search || location.hash.slice(1));
  const num = (k, d) => (q.has(k) && q.get(k) !== '' && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
  const filme = Math.max(0, num('filme', 0));
  /** @type {Record<string, string>} */
  const ext = {};
  for (const k of extras) if (q.has(k)) ext[k] = q.get(k) || '';
  return Object.assign(base, {
    local: true,
    ganchos: true,
    semente: num('semente', 0) >>> 0,
    novo: q.has('novo') || filme > 0,
    fase: Math.max(0, num('fase', 0) | 0),
    auto: q.has('auto'),
    ritmo: Math.max(0.03, num('auto', 0.3) || 0.3),
    filme,
    semAnuncio: q.has('semanuncio') || filme > 0,
    lang: q.get('lang') || '',
    limpo: q.has('limpo') || filme > 0,
    debug: q.has('debug'),
    extras: ext,
  });
}
