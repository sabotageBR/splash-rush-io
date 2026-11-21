// [kit multiportal] Pecas de interface que todo jogo do estudio usa (regras de retencao do cofre,
// Conhecimento/Retencao.md, e das paginas de portal):
// - mao-guia: ensina com gesto, sem texto (primeiras fases e a ajuda automatica quando o jogador trava);
// - celebrar: festa curta (1,6 a 2,5 s) SEM tela de "fase concluida" e sem bloquear o toque; o jogo segue;
// - premiado: o botao de video com 🎬, nunca verde, sempre ao lado de uma opcao gratis de tamanho igual
//   ou maior; some quando o portal nao tem video (portal.temVideo falso ou onSemAnuncios).

const SVG_MAO = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M24 30V12a5 5 0 0 1 10 0v14l2-1a5 5 0 0 1 6 2l1 1a5 5 0 0 1 6 3 5 5 0 0 1 5 5v8c0 9-7 16-16 16h-3c-6 0-10-3-13-8L13 38a5 5 0 0 1 8-6z" fill="#fff" stroke="#1d1d2b" stroke-width="3" stroke-linejoin="round"/></svg>';

/**
 * Mao que aponta (toque) ou arrasta entre dois pontos, em coordenadas de tela (CSS px).
 * @param {HTMLElement} camada elemento com position:relative/absolute cobrindo o jogo
 */
export function criarMao(camada) {
  const el = document.createElement('div');
  el.className = 'kit-mao';
  el.innerHTML = SVG_MAO;
  el.hidden = true;
  camada.appendChild(el);
  return {
    /**
     * @param {number} x @param {number} y
     * @param {{ ateX?: number, ateY?: number }} [o] com ateX/ateY a mao arrasta
     */
    mostrar(x, y, o = {}) {
      el.hidden = false;
      el.style.setProperty('--x0', `${x}px`);
      el.style.setProperty('--y0', `${y}px`);
      el.style.setProperty('--x1', `${o.ateX ?? x}px`);
      el.style.setProperty('--y1', `${o.ateY ?? y}px`);
      el.classList.toggle('arrasto', o.ateX !== undefined);
    },
    esconder() { el.hidden = true; },
    get visivel() { return !el.hidden; },
  };
}

/**
 * Festa curta por cima do jogo, sem bloquear o toque. Resolve quando acaba.
 * @param {HTMLElement} camada
 * @param {string} texto
 * @param {{ ms?: number, sub?: string }} [o]
 * @returns {Promise<void>}
 */
export function celebrar(camada, texto, o = {}) {
  const ms = Math.max(1600, Math.min(2500, o.ms ?? 1800));
  const el = document.createElement('div');
  el.className = 'kit-festa';
  el.style.setProperty('--ms', `${ms}ms`);
  const b = document.createElement('b');
  b.textContent = texto;
  el.appendChild(b);
  if (o.sub) {
    const s = document.createElement('small');
    s.textContent = o.sub;
    el.appendChild(s);
  }
  for (let i = 0; i < 18; i++) {
    const c = document.createElement('i');
    c.style.setProperty('--a', `${(i / 18) * 360}deg`);
    c.style.setProperty('--h', `${(i * 47) % 360}`);
    el.appendChild(c);
  }
  camada.appendChild(el);
  return new Promise((ok) => setTimeout(() => { el.remove(); ok(); }, ms));
}

/**
 * Prepara um botao de video premiado: 🎬 + texto. A classe .kit-premio nunca e verde.
 * @param {HTMLButtonElement} botao
 * @param {string} texto
 */
export function botaoPremiado(botao, texto) {
  botao.classList.add('kit-premio');
  botao.innerHTML = '';
  const icone = document.createElement('span');
  icone.className = 'kit-premio-icone';
  icone.textContent = '🎬';
  const rotulo = document.createElement('span');
  rotulo.textContent = texto;
  botao.append(icone, rotulo);
}
