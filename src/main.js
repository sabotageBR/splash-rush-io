// [Flume Frenzy] Montagem do jogo: o UNICO modulo que toca portal, DOM, audio e salvamento
// (test/estilo.test.js). Ciclo do portal do kit multiportal, na mesma ordem:
//
//  1. ganchos do portal ANTES do init (anuncio cala o audio e congela o laco; mudo e pausa do portal);
//  2. portal.init() primeiro; o three.js e a arte so vem depois (import dinamico do src/render/mundo.js);
//  3. carregar a arte com gameLoadingProgress; o laco so comeca depois do init;
//  4. idioma do portal (Poki: vazio, vale o navegador); progresso da nuvem do portal quando existe;
//  5. gameLoadingFinished no primeiro quadro; gameplayStart SO em jogadorAgiu() (gesto real);
//  6. commercialBreak SO na pausa natural (entre corridas) e so depois de 4 corridas e 4 min de jogo;
//  7. video premiado so por escolha, fora da corrida (cartao de chegada e menu), com opcao gratis igual;
//  8. ESC, espaco ou P pausam; aba oculta pausa; o mudo do portal nao desfaz o do jogador;
//  9. portal.intervaloSoNoClique (Y8): o intervalo so sai logo depois do clique em "Proxima corrida" (o avanco
//     automatico do cartao nunca pede anuncio) e com 180 s de jogo desde o anterior; portal.pausaNoBlur: perder o
//     foco abre a pausa.
//
// 3.1.0 (rampa final): no voo da rampa as mesmas maos viram manobras (arrastar/deslizar: lado = giro, cima =
// mortal, baixo = superman; setas ou WASD), com camera lenta no apice, o nome de cada manobra pipocando, um
// sino por manobra subindo a escala com o combo, e o pouso (perfeito, torto ou barrigada) decidindo o bonus.
// A mao-guia ensina na primeira vez que o jogador chega na rampa (ate ele fazer uma manobra).
import { portal, PLATAFORMA } from './core/plataforma.js';
import { criarArmazem } from './core/armazenamento.js';
import { criarAudio } from './core/audio.js';
import { criarHaptico } from './core/haptico.js';
import { criarLaco } from './core/laco.js';
import { criarEntrada } from './core/entrada.js';
import { lerDepuracao } from './core/depuracao.js';
import { criarTelemetria } from './core/telemetria.js';
import { criarRng } from './core/rng.js';
import { escolherIdioma, definirIdioma, aplicarTextos, t, idioma, NOMES_PERSONAGENS, NOMES_BOIAS } from './i18n/textos.js';
import { criarMao, celebrar, botaoPremiado } from './ui/kit.js';
import { SONS } from './som/sons.js';
import { DS, FISICA } from './jogo/constantes.js';
import { configRodada, parqueDaRodada, ABRE_PARQUE } from './jogo/rodadas.js';
import { montarRodada, ligarPiloto, controlarBots } from './jogo/montar.js';
import { passoCorrida, largar, colocacao, corridaAcabou } from './jogo/corrida.js';
import { normalizarSave, saveNovo, aplicarCorrida, somarMoedas, precoProximo, proximoItem, presenteAtivo, escolher } from './jogo/meta.js';
import { PERSONAGENS, BOIAS } from './jogo/elenco.js';
import { multCombo } from './jogo/manobras.js';

/** Intervalo comercial so depois de tantas corridas completas e tantos segundos de jogo. */
const CORRIDAS_ANTES_DO_INTERVALO = 4;
const SEGUNDOS_ANTES_DO_INTERVALO = 240;
/** Cartao de chegada: segue sozinho depois de (s). */
const AUTO_PROXIMA = 4.5;
/** Ajuda automatica: sem arrastar por (s) nas primeiras corridas. */
const AJUDA_APOS = 4;

const dbg = lerDepuracao(['parque', 'evento', 'qualidade']);
const armazem = criarArmazem({ prefixo: 'splashrush.' });
const audio = criarAudio();
const haptico = criarHaptico();
const tele = criarTelemetria(portal);

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const tela = /** @type {HTMLCanvasElement} */ ($('tela'));
const camada = $('camada');
const mao = criarMao(camada);
const hoje = () => new Date().toLocaleDateString('sv-SE');

// ------------------------------------------------------------------ estado
/** @typedef {'carregando'|'largada'|'contagem'|'corrida'|'chegada'|'cartao'} EstadoJogo */
const E = {
  /** @type {EstadoJogo} */
  estado: 'carregando',
  rodada: 1,
  save: saveNovo(),
  /** @type {import('./jogo/rodadas.js').CfgRodada | null} */
  cfg: null,
  /** @type {import('./jogo/corrida.js').Corrida | null} */
  corrida: null,
  /** @type {import('./jogo/corrida.js').Corredor | null} */
  jogador: null,
  sementeSessao: dbg.semente || ((Date.now() % 100000) + 1),
  t: 0,
  tempoJogo: 0,
  tCont: 0,
  semInput: 0,
  quedasRodada: 0,
  derrubados: 0,
  atalhosRodada: 0,
  ajudaContada: false,
  largouAlguma: false,
  premiadoTransicao: false,
  autoProxima: 0,
  trocando: false,
  pausado: false,
  pausaPortal: false,
  menu: false,
  colecao: false,
  tAgua: 0,
  /** @type {{ ganhos: number, lugar: number, fora: boolean, dobrou: boolean, presente: boolean, estilo: number, barrigada: boolean } | null} */
  resultado: null,
  /** um intervalo foi exibido e o jogador ainda nao voltou a jogar: nada de premiado nessa mesma pausa (QA) */
  intervaloSemJogo: false,
  /** voos com a trajetoria de pouso mostrada (as 3 primeiras da sessao, ou rodadas 1 e 2) */
  voosTrajetoria: 0,
  /** s ate o cartao depois do mergulho final (da tempo de ver o respingo) */
  fimEm: 0,
  /** escala do tempo da simulacao (camera lenta no apice do voo final) */
  escala: 1,
  /** a mao-guia esta ensinando as manobras neste voo */
  ensinando: false,
  /** o jogador fez alguma manobra neste voo final */
  fezManobra: false,
  /** a ultima entrada foi pelo teclado (a dica das manobras fala de setas) */
  usouTeclado: false,
};
let tMoeda = -1;
/** E.t do ultimo sino de manobra */
let tSino = -1;
let anunciosVistos = 0;
/** arrasto relativo como alavanca flutuante: o deslocamento desde o ponto de apoio e a forca (-1..1); passou do
 * raio, o apoio vem junto (inverter responde na hora); soltar zera (a fisica age sozinha) */
const arrasto = { ativo: false, x0: 0, forca: 0, ultimoX: 0, y0: 0, forcaY: 0, ultimoY: 0, tBaixo: 0, xBaixo: 0, yBaixo: 0 };
const teclas = { esq: false, dir: false, cima: false, baixo: false };
/** deslize rapido para baixo no voo final: superman ate este E.t */
let supermanAte = 0;
/** forca pedida pelo teclado (sobe em rampa curta) */
let forcaTecla = 0;
/** hit-stop: s congelados depois de uma trombada forte do jogador */
let hitStop = 0;

/** @type {import('./render/mundo.js').Mundo | null} */
let mundo = null;

function carregarProgresso() {
  E.save = dbg.novo ? saveNovo() : normalizarSave(armazem.ler('save', null));
  E.rodada = dbg.fase || E.save.rodada;
}
function salvar() {
  armazem.gravar('save', E.save);
}

// ------------------------------------------------------------------ portal: ganchos antes do init
const laco = criarLaco({ passo, desenhar });
portal.onAdStart = () => {
  anunciosVistos++;
  audio.mudoParaAnuncio();
  laco.pausar(true);
};
portal.onAdEnd = () => {
  audio.voltarDoAnuncio();
  if (!congelado()) laco.pausar(false);
};
portal.onMudoPlataforma = (m) => audio.definirMudoPlataforma(m);
portal.onPausaPlataforma = (p) => {
  E.pausaPortal = p;
  if (p) portal.gameplayStop();
  laco.pausar(congelado() || portal.emAnuncio);
};
portal.onSemAnuncios = () => atualizarVideo();

const congelado = () => E.pausado || E.pausaPortal || E.menu;

/** Unico lugar com gameplayStart: gesto real do jogador, fora de pausa e de anuncio. */
function jogadorAgiu() {
  if (congelado() || portal.emAnuncio || E.colecao) return;
  portal.gameplayStart();
  E.intervaloSemJogo = false;
}

// ------------------------------------------------------------------ som
/** @param {keyof typeof SONS} nome @param {any} [p] @param {number} [max] */
const som = (nome, p = {}, max = 2) => audio.tocarReceita(SONS[nome], p, { chave: nome, max });

// ------------------------------------------------------------------ avisos e dicas
let tAviso = 0;
/** @param {string} texto @param {number} [s] @param {boolean} [amarelo] */
function aviso(texto, s = 1.4, amarelo = false) {
  const el = $('aviso');
  el.textContent = texto;
  el.classList.toggle('amarelo', amarelo);
  el.classList.add('on');
  tAviso = s;
}
let dicaAtual = '';
/** @param {string} texto */
function dica(texto) {
  if (dicaAtual === texto) return;
  dicaAtual = texto;
  const el = $('dica');
  if (texto) el.textContent = texto;
  el.classList.toggle('on', !!texto);
}

// ------------------------------------------------------------------ rodadas
/** @param {number} n */
async function novaRodada(n) {
  E.rodada = n;
  const cfg = configRodada(n, E.sementeSessao);
  if (dbg.extras.parque) cfg.parque = /** @type {any} */ (dbg.extras.parque);
  if (dbg.extras.evento) cfg.evento = /** @type {any} */ (dbg.extras.evento);
  const m = montarRodada(cfg, E.save.escolha, t('voce'));
  if (dbg.auto) ligarPiloto(m.jogador, m.pista.atalhos.length, 0.95);
  E.cfg = cfg;
  if (mundo) await mundo.montar(m.pista, cfg.parque, cfg.evento, cfg.semente);
  E.corrida = m.corrida;
  E.jogador = m.jogador;
  E.semInput = 0;
  E.quedasRodada = 0;
  E.derrubados = 0;
  E.atalhosRodada = 0;
  E.ajudaContada = false;
  E.resultado = null;
  E.fimEm = 0;
  E.escala = 1;
  E.ensinando = false;
  E.fezManobra = false;
  $('manobras').replaceChildren();
  E.estado = E.largouAlguma ? 'contagem' : 'largada';
  E.tCont = 1.6;
  arrasto.ativo = false;
  dica('');
  $('hud').hidden = !!dbg.limpo;
  $('selRodada').textContent = `${t('corrida', { n })} · ${t(`parque-${cfg.parque}`)}`;
  $('selPresente').hidden = !presenteAtivo(E.save, hoje());
  $('selos').hidden = !!dbg.limpo;
  $('lugarDe').textContent = `/${m.corrida.corredores.length}`;
  if (cfg.novidade && !dbg.limpo) setTimeout(() => aviso(t(cfg.novidade), 2.4, true), 300);
  tele.fase(n, 'start');
  if (mundo) mundo.prepararParque(parqueDaRodada(n + 1));
}

function comecarCorrida() {
  if (!E.corrida || E.corrida.iniciada) return;
  largar(E.corrida);
  E.estado = 'corrida';
  E.largouAlguma = true;
  mao.esconder();
  dica('');
  aviso(t('go'), 0.8, true);
  som('largada');
}

/** @param {'chegou'|'fora'} tipo */
async function fimDaCorrida(tipo) {
  const c = E.corrida;
  const k = E.jogador;
  if (!c || !k || E.estado !== 'corrida') return;
  E.estado = 'chegada';
  mao.esconder();
  dica('');
  portal.gameplayStop();
  const fora = tipo === 'fora';
  const ordem = colocacao(c);
  const lugar = ordem.findIndex((x) => x.id === k.id) + 1;
  tele.fase(E.rodada, fora ? 'fail' : 'complete');
  const antes = { moedas: E.save.moedas, preco: precoProximo(E.save), item: proximoItem(E.save) };
  // moedas das manobras da rampa final (barrigada: zero)
  const estilo = !fora && k.pouso ? k.pouso.moedas : 0;
  const res = aplicarCorrida(E.save, {
    lugar, fora, progresso: (fora ? k.sFora : k.s) / c.pista.comprimento, pegas: k.moedas, derrubados: E.derrubados, segundos: c.t, estilo,
  }, hoje());
  E.save = res.save;
  salvar();
  E.resultado = { ganhos: res.ganhos, lugar, fora, dobrou: false, presente: res.presente, estilo,
    barrigada: !fora && !!k.pouso && k.pouso.qualidade === 'barrigada' && k.pouso.n > 0 };
  if (fora) {
    await celebrar(camada, t('caiu'), { sub: `+${res.ganhos}`, ms: 1700 });
  } else if (lugar === 1) {
    som('vitoria');
    portal.festa();
    haptico.vibrar([20, 40, 20]);
    await celebrar(camada, t('venceu'), { sub: `+${res.ganhos}`, ms: 2200 });
  } else {
    som('chegada');
    await celebrar(camada, t('lugar', { n: lugar }), { sub: `+${res.ganhos}`, ms: 1800 });
  }
  mostrarCartao(antes, res.novos);
}

/**
 * @param {{ moedas: number, preco: number|null, item: any }} antes
 * @param {{ tipo: 'personagem'|'boia', id: number }[]} novos
 */
function mostrarCartao(antes, novos) {
  const r = E.resultado;
  if (!r) return;
  E.estado = 'cartao';
  $('cartaoCoroa').hidden = r.fora || r.lugar !== 1;
  $('cartaoLugar').textContent = r.fora ? t('caiu') : t('lugarCurto', { n: r.lugar });
  $('cartaoSub').textContent = `${t('corrida', { n: E.rodada })} · ${t(E.save.coroas === 1 ? 'coroa' : 'coroas', { n: E.save.coroas })}`;
  $('cartaoMoedas').textContent = `+${r.ganhos}`;
  $('cartaoPresente').hidden = !r.presente;
  // manobras: quanto do ganho veio delas (ou a barrigada que perdeu o combo)
  const estilo = $('cartaoEstilo');
  estilo.hidden = !(r.estilo > 0 || r.barrigada);
  estilo.classList.toggle('barriga', r.barrigada);
  $('cartaoEstiloT').textContent = r.barrigada ? t('barrigada') : t('manobras');
  $('cartaoEstiloN').textContent = `+${r.estilo}`;
  atualizarColecaoCartao(antes, novos);
  const dobrar = /** @type {HTMLButtonElement} */ ($('btDobrar'));
  const oferecer = portal.temVideo && E.rodada >= 3 && E.rodada % 2 === 1 && r.ganhos >= 20 && !dbg.limpo;
  dobrar.hidden = !oferecer;
  $('btDobrar').parentElement?.classList.toggle('dois', oferecer);
  $('cartao').hidden = false;
  E.autoProxima = AUTO_PROXIMA;
  if (novos.length) {
    som('desbloqueio');
    haptico.vibrar(30);
    for (const it of novos) tele.evento('colecao', `${it.tipo}-${it.id}`);
  }
}

/**
 * @param {{ moedas: number, preco: number|null, item: any }} antes
 * @param {{ tipo: 'personagem'|'boia', id: number }[]} novos
 */
function atualizarColecaoCartao(antes, novos) {
  const img = /** @type {HTMLImageElement} */ ($('proxImg'));
  const barra = $('proxBarra');
  const box = $('cartaoColecao');
  const item = novos.length ? novos[novos.length - 1] : proximoItem(E.save);
  if (!item) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  img.src = item.tipo === 'personagem' ? `src/arte/pers/costas-${String(item.id + 1).padStart(2, '0')}.webp` : `src/arte/boias/boia-${String(item.id + 1).padStart(2, '0')}.webp`;
  const nomes = item.tipo === 'personagem' ? NOMES_PERSONAGENS[idioma()] : NOMES_BOIAS[idioma()];
  $('proxNome').textContent = nomes[item.id];
  if (novos.length) {
    /** @type {HTMLElement} */ (box.querySelector('small')).textContent = t('novo');
    barra.style.transition = 'none';
    barra.style.width = `${Math.min(100, (antes.moedas / (antes.preco || 1)) * 100)}%`;
    requestAnimationFrame(() => { barra.style.transition = ''; barra.style.width = '100%'; });
    $('proxNum').textContent = '';
  } else {
    /** @type {HTMLElement} */ (box.querySelector('small')).textContent = t('proximo');
    const preco = precoProximo(E.save) || 1;
    barra.style.transition = 'none';
    barra.style.width = `${Math.min(100, (antes.moedas / preco) * 100)}%`;
    requestAnimationFrame(() => { barra.style.transition = ''; barra.style.width = `${Math.min(100, (E.save.moedas / preco) * 100)}%`; });
    $('proxNum').textContent = `${E.save.moedas}/${preco}`;
  }
}

/** @param {boolean} [clique] veio do clique no botao "Proxima corrida" */
async function proximaRodada(clique = false) {
  if (E.trocando || E.estado !== 'cartao') return;
  E.trocando = true;
  $('cartao').hidden = true;
  fecharColecao();
  await intervalo(clique);
  await novaRodada(E.save.rodada);
  E.trocando = false;
}

/** s de jogo no ultimo intervalo pedido (o portal que exige clique so exibe um a cada ~3 min) */
let ultimoIntervalo = -Infinity;
/**
 * Pausa natural entre corridas: o unico ponto do intervalo comercial.
 * @param {boolean} clique veio de um clique em botao (exigido pela Y8)
 */
async function intervalo(clique) {
  if (E.premiadoTransicao) {
    E.premiadoTransicao = false;
    return;
  }
  if (dbg.semAnuncio || !portal.temAnuncios) return;
  if (E.save.corridas < CORRIDAS_ANTES_DO_INTERVALO || E.tempoJogo < SEGUNDOS_ANTES_DO_INTERVALO) return;
  if (portal.intervaloSoNoClique && (!clique || E.tempoJogo - ultimoIntervalo < 180)) return;
  ultimoIntervalo = E.tempoJogo;
  const antes = anunciosVistos;
  await portal.commercialBreak();
  if (anunciosVistos > antes) E.intervaloSemJogo = true;
}

// ------------------------------------------------------------------ laco (passo fixo)
/** @param {number} dt */
function passo(dt) {
  if (congelado()) return;
  if (hitStop > 0) {
    hitStop -= dt;
    return;
  }
  E.t += dt;
  if (portal.jogando) {
    tele.jogando(dt);
    E.tempoJogo += dt;
  }
  if (tAviso > 0 && (tAviso -= dt) <= 0) $('aviso').classList.remove('on');
  const c = E.corrida;
  const k = E.jogador;
  if (!c || !k) return;
  if (E.estado === 'largada') {
    if (dbg.auto || dbg.filme) comecarCorrida();
    return;
  }
  if (E.estado === 'contagem') {
    const antes = Math.ceil(E.tCont);
    E.tCont -= dt;
    const agora = Math.ceil(E.tCont);
    if (agora !== antes && agora > 0 && agora <= 2 && !dbg.limpo) {
      aviso(String(agora), 0.6);
      som('contagem');
    }
    if (E.tCont <= 0) comecarCorrida();
    return;
  }
  if (E.estado === 'corrida') controle(dt, k);
  // camera lenta no apice do voo final do jogador (mais lenta e mais longa enquanto a mao-guia ensina)
  let alvoEsc = 1;
  if (k.final && k.estado === 'ar' && E.estado === 'corrida') {
    const larg = E.ensinando ? 8 : 5;
    alvoEsc = 1 - (E.ensinando ? 0.7 : 0.5) * Math.exp(-((k.vy / larg) ** 2));
  }
  E.escala += (alvoEsc - E.escala) * Math.min(1, dt * 6);
  const dts = dt * E.escala;
  controlarBots(c, k, dts);
  if (!corridaAcabou(c)) passoCorrida(c, dts);
  eventos(c, k);
  if (E.fimEm > 0 && (E.fimEm -= dt) <= 0) fimDaCorrida('chegou');
  if (E.estado === 'corrida') {
    E.semInput += dt;
    ajuda(c, k);
  }
  if (E.estado === 'cartao' && !E.colecao && !E.trocando) {
    E.autoProxima -= dt;
    $('autoAnel').style.width = `${Math.max(0, 1 - E.autoProxima / AUTO_PROXIMA) * 100}%`;
    if (E.autoProxima <= 0) proximaRodada();
  }
}

/**
 * Controle do jogador: a direcao e uma FORCA (o corredor se inclina) enquanto o dedo, o mouse ou a tecla pedem;
 * sem pedir, a fisica age sozinha (na curva fechada, a centrifuga leva para a borda). No ar, o mesmo gesto
 * vira controle aereo.
 */
function controle(dt, k) {
  const alvo = teclas.esq !== teclas.dir ? (teclas.dir ? 1 : -1) : 0;
  forcaTecla += Math.max(-8 * dt, Math.min(8 * dt, alvo - forcaTecla));
  if (alvo) E.semInput = 0;
  if (k.final && k.estado === 'ar') {
    // voo final: lado = giro, cima = mortal, baixo = superman (diagonal franca = giro e mortal juntos: parafuso)
    const ky = teclas.cima !== teclas.baixo ? (teclas.cima ? 1 : -1) : 0;
    let ax = 0;
    let ay = 0;
    if (arrasto.ativo) {
      ax = Math.abs(arrasto.forca) >= 0.3 ? arrasto.forca : 0;
      ay = Math.abs(arrasto.forcaY) >= 0.3 ? arrasto.forcaY : 0;
      if (ax && ay && Math.min(Math.abs(ax), Math.abs(ay)) < 0.5 * Math.max(Math.abs(ax), Math.abs(ay))) {
        if (Math.abs(ax) > Math.abs(ay)) ay = 0;
        else ax = 0;
      }
    }
    k.manX = alvo || ax;
    k.manY = ky || ay || (E.corrida && E.corrida.t < supermanAte ? -1 : 0);
    k.dir = 0;
    return;
  }
  k.dir = Math.abs(forcaTecla) > 0.01 ? forcaTecla : arrasto.ativo ? arrasto.forca : 0;
}

/** O voo final comecou: o que estava apertado para dirigir nao vira manobra sem querer (a alavanca recomeca dali). */
function soltarComandos() {
  arrasto.x0 = arrasto.ultimoX;
  arrasto.y0 = arrasto.ultimoY;
  arrasto.forca = 0;
  arrasto.forcaY = 0;
  teclas.esq = false;
  teclas.dir = false;
  teclas.cima = false;
  teclas.baixo = false;
  forcaTecla = 0;
}

/** Nome da manobra pipocando (os 3 ultimos) e o combo. @param {string} nome @param {number} pts @param {number} n manobras no voo */
function popManobra(nome, pts, n) {
  const cx = $('manobras');
  cx.querySelector('.combo')?.remove();
  const el = document.createElement('div');
  el.className = 'man';
  el.textContent = nome;
  const sm = document.createElement('small');
  sm.textContent = `+${pts}`;
  el.appendChild(sm);
  cx.appendChild(el);
  setTimeout(() => el.remove(), 1150);
  if (n >= 2) {
    const m = multCombo(n);
    const co = document.createElement('div');
    co.className = 'man combo';
    co.textContent = t('combo', { n: idioma() === 'en' ? String(m) : String(m).replace('.', ',') });
    cx.appendChild(co);
    setTimeout(() => co.remove(), 1150);
  }
  while (cx.children.length > 4) /** @type {Element} */ (cx.firstElementChild).remove();
}

/** Como o jogador bateu na agua. @param {any} e evento mergulho */
function mostrarPouso(e) {
  const cx = $('manobras');
  cx.replaceChildren();
  if (e.qualidade !== 'barrigada' && e.n === 0) return;
  const el = document.createElement('div');
  el.className = `pouso ${e.qualidade === 'barrigada' ? 'barriga' : e.qualidade === 'torto' ? 'torto' : ''}`;
  el.textContent = e.qualidade === 'barrigada' ? t('barrigada') : e.qualidade === 'torto' ? t('pousoTorto') : t('pousoLimpo');
  const sm = document.createElement('small');
  sm.textContent = e.qualidade === 'barrigada' ? (e.n > 0 ? t('dicaFeche') : '') : `+${e.moedas}`;
  if (sm.textContent) el.appendChild(sm);
  cx.appendChild(el);
  setTimeout(() => el.remove(), 1650);
}

/** nomes das manobras dos bots por perto: id do bot, texto e quando apareceu */
const manBots = /** @type {{ id: number, t0: number, el: HTMLSpanElement }[]} */ ([]);
/** @param {number} id @param {string} texto */
function manobraDeBot(id, texto) {
  let it = manBots.find((x) => x.id === id) || manBots.find((x) => E.t - x.t0 > 1);
  if (!it) {
    if (manBots.length >= 4) return;
    const el = document.createElement('span');
    $('manBots').appendChild(el);
    it = { id, t0: E.t, el };
    manBots.push(it);
  }
  it.id = id;
  it.t0 = E.t;
  it.el.textContent = texto;
}
function desenharManBots() {
  for (const it of manBots) {
    const idade = E.t - it.t0;
    const pt = idade < 1 && mundo ? mundo.naTela(it.id, 3.6) : null;
    if (!pt) {
      if (it.el.style.opacity !== '0') it.el.style.opacity = '0';
      continue;
    }
    it.el.style.opacity = String(Math.min(1, (1 - idade) * 3));
    it.el.style.transform = `translate(${pt.x.toFixed(1)}px, ${(pt.y - idade * 26).toFixed(1)}px) translate(-50%, -100%)`;
  }
}

/** @param {import('./jogo/corrida.js').Corrida} c @param {import('./jogo/corrida.js').Corredor} k */
function eventos(c, k) {
  for (const e of c.eventos) {
    const meu = e.id === k.id;
    const perto = Math.hypot(e.x - k.x, e.z - k.z) < 140;
    const minhaBatida = e.tipo === 'empurrao' && (meu || e.outro === k.id);
    if (mundo && (meu || perto)) mundo.efeito(e, meu || minhaBatida);
    // trombada do jogador: o mundo para por um instante (hit-stop), a camera treme e o som e um baque limpo
    if (minhaBatida && E.estado === 'corrida') {
      if (e.forca >= 0.3) hitStop = 0.035 + 0.025 * Math.min(1, e.forca);
      som('empurrao', { forca: e.forca });
      haptico.vibrar(e.forca >= 0.3 ? 22 : 10);
    }
    if (meu) {
      switch (e.tipo) {
        case 'cruzou':
          soltarComandos();
          E.fezManobra = false;
          E.ensinando = !dbg.auto && !dbg.limpo && E.save.ensinoManobra < 3;
          som('lancar');
          haptico.vibrar(20);
          break;
        case 'manobra':
          E.fezManobra = true;
          popManobra(t(e.nome), e.pts, e.combo);
          // um sino por passo (giro e mortal fechando juntos com o parafuso soam como uma nota so)
          if (E.t !== tSino) {
            tSino = E.t;
            som('manobra', { nota: e.combo - 1 }, 3);
          }
          haptico.vibrar(12);
          break;
        case 'mergulho':
          mostrarPouso(e);
          som(e.qualidade === 'barrigada' ? 'barrigada' : e.qualidade === 'limpo' && e.n > 0 ? 'pousoLimpo' : 'splash');
          haptico.vibrar(e.qualidade === 'barrigada' ? [40, 30, 60] : 30);
          // a mao-guia ensina ate o jogador fazer uma manobra (no maximo 3 voos)
          E.save.ensinoManobra = E.fezManobra ? 99 : E.save.ensinoManobra + 1;
          E.ensinando = false;
          if (!E.fimEm) E.fimEm = 1.25;
          break;
        case 'decolou':
          som('decolar');
          E.voosTrajetoria++;
          break;
        case 'rampa': som('rampa'); haptico.vibrar(12); break;
        case 'pousou': som('pousar'); haptico.vibrar(18); break;
        case 'atalho':
          E.atalhosRodada++;
          som('atalho');
          aviso(t('atalho'), 1.3, true);
          haptico.vibrar([15, 30, 15]);
          tele.evento('atalho', E.atalhosRodada === 1 ? 'primeiro' : 'mais');
          break;
        case 'turbo': som('turbo'); break;
        case 'moeda':
          if (E.t - tMoeda > 0.35) {
            tMoeda = E.t;
            som('moeda', {}, 1);
          }
          break;
        case 'caiu':
          E.quedasRodada++;
          som('splash');
          haptico.vibrar(40);
          if (E.cfg && E.cfg.volta) aviso(t('splash'), 1.1);
          break;
        case 'voltou': aviso(t('devolta'), 1.2); break;
        case 'fora': fimDaCorrida('fora'); break;
        case 'chegou': if (!E.fimEm) E.fimEm = 1.25; break;
        case 'derrubou': {
          E.derrubados++;
          const vit = c.corredores[e.vitima];
          aviso(t('derrubou', { nome: vit ? vit.nome : '' }), 1.4, true);
          break;
        }
        default: break;
      }
    } else if ((e.tipo === 'caiu' || e.tipo === 'mergulho') && perto) {
      som('splash', {}, 1);
    } else if (e.tipo === 'manobra' && perto) {
      manobraDeBot(e.id, t(e.nome));
    }
  }
  c.eventos.length = 0;
}

/** Mao-guia: largada, ocio nas 3 primeiras corridas e os atalhos ensinados. */
function ajuda(c, k) {
  if (dbg.limpo || dbg.auto) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const p = c.pista;
  // rampa final: avisa chegando e ensina as manobras no voo (ate o jogador fazer uma, no maximo 3 voos)
  if (E.save.ensinoManobra < 3) {
    if (k.estado === 'calha' && k.s > p.iFinal * DS - 70) {
      dica(t('rampaFinal'));
      mao.esconder();
      return;
    }
    if (k.final && k.estado === 'ar' && !E.fezManobra && k.man) {
      dica(t(E.usouTeclado ? 'dicaManTecla' : 'dicaManToque'));
      // a mao desliza para o lado (giro) e para cima (mortal), alternando
      if (Math.floor(k.man.t / 0.9) % 2 === 0) mao.mostrar(W / 2 - 80, H * 0.64, { ateX: W / 2 + 80, ateY: H * 0.64 });
      else mao.mostrar(W / 2, H * 0.74, { ateX: W / 2, ateY: H * 0.5 });
      return;
    }
  }
  // atalho logo a frente
  if (k.estado === 'calha') {
    const ensinar = E.rodada <= 2 || E.quedasRodada >= 2;
    for (const at of p.atalhos) {
      const s0 = at.i0 * DS;
      if (k.s > s0 - 30 && k.s < s0 + 4 && (at.marcado || ensinar)) {
        dica(t('voe'));
        mao.mostrar(W / 2, H * 0.72, { ateX: W / 2 + at.dir * Math.min(W * 0.3, 180), ateY: H * 0.72 });
        return;
      }
    }
  }
  if (E.rodada <= 3 && E.semInput > AJUDA_APOS && k.estado === 'calha') {
    if (!E.ajudaContada) {
      E.ajudaContada = true;
      tele.ajuda(E.rodada);
    }
    dica(t('arraste'));
    mao.mostrar(W / 2 - 80, H * 0.72, { ateX: W / 2 + 80, ateY: H * 0.72 });
    return;
  }
  dica('');
  mao.esconder();
}

// ------------------------------------------------------------------ desenho
const nomesEls = /** @type {HTMLSpanElement[]} */ ([]);
/** quem tem rotulo agora (a lista muda a cada 4 quadros; a posicao, todo quadro) */
const rotulados = /** @type {import('./jogo/corrida.js').Corredor[]} */ ([]);
const ordemHud = /** @type {import('./jogo/corrida.js').Corredor[]} */ ([]);
const vizinhosHud = /** @type {import('./jogo/corrida.js').Corredor[]} */ ([]);
let lugarAntes = 0;
let derrubadosAntes = 0;
/** @param {number} dtReal */
function desenhar(dtReal) {
  if (!mundo || !E.corrida || !E.jogador) return;
  const dt = congelado() ? 0 : Math.min(0.05, dtReal) * E.escala;
  const alfa = dbg.filme || hitStop > 0 ? 1 : laco.alfa;
  const trajetoria = E.rodada <= 2 || E.voosTrajetoria < 3;
  mundo.atualizar(E.corrida, E.jogador, dt, alfa, trajetoria && E.estado === 'corrida');
  mundo.renderizar();
  mundo.motor.medir(dtReal);
  if (!dbg.limpo) {
    hud();
    desenharManBots();
  }
  primeiroQuadro();
}

let hudQuadro = 0;
function hud() {
  const c = /** @type {import('./jogo/corrida.js').Corrida} */ (E.corrida);
  const k = /** @type {import('./jogo/corrida.js').Corredor} */ (E.jogador);
  if (E.estado === 'largada' && !E.menu) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    mao.mostrar(W / 2 - 90, H * 0.72, { ateX: W / 2 + 90, ateY: H * 0.72 });
    dica(t('arraste'));
  }
  if ((hudQuadro++ & 3) === 0) {
    const ordem = colocacao(c, ordemHud);
    const lugar = ordem.indexOf(k) + 1;
    $('lugarN').textContent = idioma() === 'en' ? t('lugarCurto', { n: lugar }) : `${lugar}º`;
    // ultrapassagem: o lugar melhorou durante a corrida
    if (E.estado === 'corrida' && lugarAntes && lugar < lugarAntes) {
      const el = $('lugarHud');
      el.classList.remove('sobe');
      void el.offsetWidth;
      el.classList.add('sobe');
    }
    lugarAntes = E.estado === 'corrida' ? lugar : 0;
    const L = c.pista.comprimento;
    const sl = ordem[0].estado === 'chegou' ? L : ordem[0].s;
    $('progJog').style.left = `${Math.min(100, (k.s / L) * 100)}%`;
    $('progLider').style.left = `${Math.min(100, (sl / L) * 100)}%`;
    $('moedasN').textContent = String(E.save.moedas + (E.estado === 'corrida' ? k.moedas : 0));
    // placar ao vivo: os 3 primeiros e o jogador
    const linhas = $('placar').children;
    let li = 0;
    for (let i = 0; i < ordem.length && li < 4; i++) {
      const o = ordem[i];
      if (i >= 3 && o !== k) continue;
      const el = /** @type {HTMLElement} */ (linhas[li++]);
      el.hidden = false;
      el.className = o === k ? 'eu' : '';
      el.textContent = `${i + 1}. ${o === k ? t('voce') : o.nome}`;
    }
    for (; li < 4; li++) /** @type {HTMLElement} */ (linhas[li]).hidden = true;
    // derrubados
    if (E.derrubados !== derrubadosAntes) {
      derrubadosAntes = E.derrubados;
      $('derrubadosN').textContent = String(E.derrubados);
      const el = $('derrubados');
      el.hidden = E.derrubados === 0;
      el.classList.remove('sobe');
      void el.offsetWidth;
      el.classList.add('sobe');
    }
    // quem tem rotulo: o jogador, os rivais por perto e o lider (com coroa)
    const lider = ordem[0];
    vizinhosHud.length = 0;
    for (const o of c.corredores) if (o !== k && o.estado !== 'fora' && o.estado !== 'chegou' && !o.final && o.s > k.s - 2 && o.s - k.s < 60) vizinhosHud.push(o);
    vizinhosHud.sort((a, b) => Math.abs(a.s - k.s) - Math.abs(b.s - k.s));
    if (vizinhosHud.length > 6) vizinhosHud.length = 6;
    if (lider !== k && !vizinhosHud.includes(lider) && lider.estado !== 'chegou' && lider.estado !== 'fora' && Math.abs(lider.s - k.s) < 120) vizinhosHud.push(lider);
    rotulados.length = 0;
    rotulados.push(k, ...vizinhosHud);
    const cx = $('nomes');
    while (nomesEls.length < 8) {
      const sp = document.createElement('span');
      cx.appendChild(sp);
      nomesEls.push(sp);
    }
    nomesEls.forEach((el, i) => {
      const o = rotulados[i];
      if (!o) return;
      el.textContent = o === k ? t('voce') : o.nome;
      el.classList.toggle('lider', o === lider);
      el.classList.toggle('eu', o === k);
    });
  }
  // posicao dos rotulos: todo quadro (seguem os bichos interpolados, sem degrau)
  for (let i = 0; i < nomesEls.length; i++) {
    const el = nomesEls[i];
    const o = rotulados[i];
    const pt = o && mundo ? mundo.naTela(o.id, (o === k ? 2.1 : 2.9) * o.peso) : null;
    if (!o || !pt) {
      if (el.style.display !== 'none') el.style.display = 'none';
      continue;
    }
    if (el.style.display === 'none') el.style.display = '';
    el.style.transform = `translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px) translate(-50%, -100%)`;
  }
}
let carregouJa = false;
function primeiroQuadro() {
  if (carregouJa) return;
  carregouJa = true;
  portal.gameLoadingFinished();
  $('carregando').classList.add('saindo');
  setTimeout(() => $('carregando').remove(), 400);
}

// ------------------------------------------------------------------ menu de pausa, premiados e colecao
function abrirMenu() {
  if (E.menu || E.estado === 'carregando') return;
  E.menu = true;
  portal.gameplayStop();
  laco.pausar(true);
  atualizarVideo();
  mao.esconder();
  $('menu').hidden = false;
}
function fecharMenu() {
  if (!E.menu) return;
  E.menu = false;
  $('menu').hidden = true;
  laco.pausar(congelado() || portal.emAnuncio);
}
function atualizarVideo() {
  /** @type {HTMLButtonElement} */ ($('btBonus')).hidden = !portal.temVideo || E.intervaloSemJogo;
  if (!portal.temVideo) /** @type {HTMLButtonElement} */ ($('btDobrar')).hidden = true;
}
async function pedirBonus() {
  const ok = await portal.rewardedBreak('small');
  if (ok) {
    const novos = somarMoedas(E.save, 50);
    salvar();
    tele.evento('bonus', 'premio');
    fecharMenu();
    celebrar(camada, '+50');
    if (novos.length) som('desbloqueio');
  }
  atualizarVideo();
}
async function pedirDobro() {
  const r = E.resultado;
  if (!r || r.dobrou || E.estado !== 'cartao') return;
  E.autoProxima = 99;
  const antes = { moedas: E.save.moedas, preco: precoProximo(E.save), item: proximoItem(E.save) };
  const ok = await portal.rewardedBreak('small');
  if (ok) {
    r.dobrou = true;
    E.premiadoTransicao = true;
    const novos = somarMoedas(E.save, r.ganhos);
    salvar();
    tele.evento('dobro', 'premio');
    $('cartaoMoedas').textContent = `+${r.ganhos * 2}`;
    /** @type {HTMLButtonElement} */ ($('btDobrar')).hidden = true;
    $('btDobrar').parentElement?.classList.remove('dois');
    atualizarColecaoCartao(antes, novos);
    if (novos.length) som('desbloqueio');
  }
  E.autoProxima = AUTO_PROXIMA;
}

let abaColecao = /** @type {'personagem'|'boia'} */ ('personagem');
function abrirColecao() {
  E.colecao = true;
  $('colecao').hidden = false;
  desenharColecao();
}
function fecharColecao() {
  if (!E.colecao) return;
  E.colecao = false;
  $('colecao').hidden = true;
  if (E.estado === 'cartao') E.autoProxima = AUTO_PROXIMA;
}
function desenharColecao() {
  const grade = $('grade');
  grade.innerHTML = '';
  const pers = abaColecao === 'personagem';
  const total = pers ? PERSONAGENS.length : BOIAS.length;
  const tem = pers ? E.save.personagens : E.save.boias;
  const escolhido = pers ? E.save.escolha.personagem : E.save.escolha.boia;
  const nomes = pers ? NOMES_PERSONAGENS[idioma()] : NOMES_BOIAS[idioma()];
  for (let i = 0; i < total; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    const meu = tem.includes(i);
    b.className = `item${meu ? '' : ' bloqueado'}${i === escolhido ? ' escolhido' : ''}`;
    b.setAttribute('aria-label', nomes[i]);
    const img = document.createElement('img');
    img.alt = '';
    img.src = pers ? `src/arte/pers/costas-${String(i + 1).padStart(2, '0')}.webp` : `src/arte/boias/boia-${String(i + 1).padStart(2, '0')}.webp`;
    b.appendChild(img);
    if (!meu) {
      const cad = document.createElement('img');
      cad.className = 'cad';
      cad.alt = '';
      cad.src = 'src/arte/icones/icone-07.webp';
      b.appendChild(cad);
    } else {
      b.addEventListener('click', () => {
        escolher(E.save, abaColecao, i);
        salvar();
        som('clique');
        desenharColecao();
      });
    }
    grade.appendChild(b);
  }
  const prox = proximoItem(E.save);
  const preco = precoProximo(E.save);
  const proxParque = Object.values(ABRE_PARQUE).find((r) => r > E.save.rodada);
  $('colInfo').textContent = prox && preco ? `${t('proximo')} ${E.save.moedas}/${preco}` + (proxParque ? ` · ${t('parqueNovo', { n: proxParque - E.save.rodada })}` : '')
    : t('completa');
  $('abaPers').classList.toggle('ativa', pers);
  $('abaBoias').classList.toggle('ativa', !pers);
}

// ------------------------------------------------------------------ entrada
criarEntrada(window, {
  primeiroGesto: () => audio.iniciar(),
  ponteiro: (fase, x, y, e) => {
    if (E.menu || E.colecao) return;
    const k = E.jogador;
    if (fase === 'baixo') {
      tele.gesto(e.pointerType === 'mouse' ? 'mouse' : 'toque');
      jogadorAgiu();
      if (E.estado === 'largada') comecarCorrida();
      if (k) {
        arrasto.ativo = true;
        arrasto.x0 = x;
        arrasto.forca = 0;
        arrasto.y0 = y;
        arrasto.forcaY = 0;
        arrasto.ultimoX = x;
        arrasto.ultimoY = y;
        arrasto.tBaixo = performance.now();
        arrasto.xBaixo = x;
        arrasto.yBaixo = y;
      }
      E.semInput = 0;
      // no computador (mouse) a dica das manobras fala de setas; no toque, de deslizar
      E.usouTeclado = e.pointerType === 'mouse';
      return;
    }
    if (fase === 'mover' && arrasto.ativo && k) {
      // alavanca: ~12% da largura (ate 900 px) da forca maxima; o apoio acompanha quem passa do raio
      const raio = Math.max(36, Math.min(window.innerWidth, 900) * 0.12);
      let d = x - arrasto.x0;
      if (Math.abs(d) > raio) {
        arrasto.x0 = x - Math.sign(d) * raio;
        d = Math.sign(d) * raio;
      }
      arrasto.forca = d / raio;
      // o mesmo para cima/baixo (manobras no voo final): para cima e positivo
      let dy = arrasto.y0 - y;
      if (Math.abs(dy) > raio) {
        arrasto.y0 = y + Math.sign(dy) * raio;
        dy = Math.sign(dy) * raio;
      }
      arrasto.forcaY = dy / raio;
      if (Math.abs(x - arrasto.ultimoX) > 2) E.semInput = 0;
      arrasto.ultimoX = x;
      arrasto.ultimoY = y;
      return;
    }
    if (fase === 'cima') {
      // deslize rapido no voo final: o corpo se joga (rajada) para o lado, para cima, ou estica (superman)
      if (k && k.final && k.estado === 'ar' && arrasto.ativo) {
        const dx = x - arrasto.xBaixo;
        const dy = arrasto.yBaixo - y;
        if (performance.now() - arrasto.tBaixo < 320 && Math.max(Math.abs(dx), Math.abs(dy)) > 24) {
          if (Math.abs(dx) > Math.abs(dy) * 1.2) k.impX = Math.sign(dx);
          else if (dy > 0) k.impY = 1;
          else supermanAte = E.corrida ? E.corrida.t + 0.6 : 0;
        }
      }
      arrasto.ativo = false;
      arrasto.forca = 0;
      arrasto.forcaY = 0;
    }
  },
  tecla: (codigo, baixo) => {
    if (codigo === 'ArrowLeft' || codigo === 'KeyA') teclas.esq = baixo;
    if (codigo === 'ArrowRight' || codigo === 'KeyD') teclas.dir = baixo;
    if (codigo === 'ArrowUp' || codigo === 'KeyW') teclas.cima = baixo;
    if (codigo === 'ArrowDown' || codigo === 'KeyS') teclas.baixo = baixo;
    if (!baixo) return;
    if (/Arrow|Key[ADWS]/.test(codigo)) E.usouTeclado = true;
    // voo final: apertar ja joga o corpo (rajada, como o deslize); segurar continua girando
    const kj = E.jogador;
    if (kj && kj.final && kj.estado === 'ar' && E.estado === 'corrida') {
      if (codigo === 'ArrowLeft' || codigo === 'KeyA') kj.impX = -1;
      else if (codigo === 'ArrowRight' || codigo === 'KeyD') kj.impX = 1;
      else if (codigo === 'ArrowUp' || codigo === 'KeyW') kj.impY = 1;
      else if ((codigo === 'ArrowDown' || codigo === 'KeyS') && E.corrida) supermanAte = E.corrida.t + 0.6;
    }
    if (codigo === 'Escape' || codigo === 'Space' || codigo === 'KeyP') {
      if (E.colecao) fecharColecao();
      else if (E.menu) fecharMenu();
      else abrirMenu();
      return;
    }
    if ((codigo === 'Enter' || codigo === 'NumpadEnter') && E.estado === 'cartao') {
      proximaRodada();
      return;
    }
    jogadorAgiu();
    if (E.estado === 'largada' && /Arrow|Key[AD]/.test(codigo)) comecarCorrida();
  },
});
$('btPausa').addEventListener('click', () => abrirMenu());
$('btContinuar').addEventListener('click', () => { fecharMenu(); jogadorAgiu(); });
$('btBonus').addEventListener('click', () => pedirBonus());
$('btColecaoMenu').addEventListener('click', () => abrirColecao());
$('btColecaoCartao').addEventListener('click', () => abrirColecao());
$('btFecharColecao').addEventListener('click', () => fecharColecao());
$('abaPers').addEventListener('click', () => { abaColecao = 'personagem'; desenharColecao(); });
$('abaBoias').addEventListener('click', () => { abaColecao = 'boia'; desenharColecao(); });
$('btProxima').addEventListener('click', () => proximaRodada(true));
$('btDobrar').addEventListener('click', () => pedirDobro());
$('btSom').addEventListener('click', () => {
  audio.definirMudo(!audio.mudo);
  $('btSom').setAttribute('aria-pressed', String(!audio.mudo));
  armazem.gravar('mudo', audio.mudo);
});
document.addEventListener('visibilitychange', () => {
  audio.pausarAba(document.hidden);
  if (document.hidden) {
    portal.gameplayStop();
    laco.pausar(true);
  } else laco.pausar(congelado() || portal.emAnuncio);
});
// o iframe do portal precisa de foco para o teclado (espaco nao rola a pagina do portal)
window.addEventListener('pointerdown', () => { try { window.focus(); } catch { /* ignora */ } });
window.addEventListener('resize', () => { if (mundo) mundo.motor.ajustar(); });
// Y8: perder o foco abre a pausa
window.addEventListener('blur', () => { if (portal.pausaNoBlur && carregouJa && E.estado !== 'carregando') abrirMenu(); });

// ------------------------------------------------------------------ partida
async function iniciar() {
  const pedidoInit = portal.init();
  const barra = /** @type {HTMLElement|null} */ (document.querySelector('#carregando .barra i'));
  const prog = (/** @type {number} */ f) => {
    portal.gameLoadingProgress(f);
    if (barra) barra.style.width = `${Math.round(f * 100)}%`;
  };
  prog(0.05);
  await pedidoInit;
  // o three.js e a arte so depois do init (o handshake do portal nao espera o download)
  const { criarMundo } = await import('./render/mundo.js');
  prog(0.15);
  const rndVisual = criarRng(E.sementeSessao ^ 0x9e3779b9);
  mundo = await criarMundo(tela, { filme: !!dbg.filme, fixa: !!dbg.filme || !!dbg.extras.qualidade, rnd: rndVisual });
  await mundo.carregar((f) => prog(0.15 + f * 0.8));
  armazem.usarFonte(await portal.fonteDados(), ['save', 'mudo']);
  definirIdioma(escolherIdioma(dbg.lang || portal.idioma || navigator.language));
  document.documentElement.lang = { pt: 'pt-BR', en: 'en', es: 'es' }[idioma()];
  aplicarTextos(document);
  botaoPremiado(/** @type {HTMLButtonElement} */ ($('btBonus')), t('bonus'));
  botaoPremiado(/** @type {HTMLButtonElement} */ ($('btDobrar')), t('dobrar'));
  audio.definirMudo(armazem.ler('mudo', false) === true);
  $('btSom').setAttribute('aria-pressed', String(!audio.mudo));
  carregarProgresso();
  atualizarVideo();
  await novaRodada(E.rodada);
  prog(1);
  if (dbg.filme) {
    comecarCorrida();
    desenhar(0);
    return;
  }
  laco.iniciar();
}

// ------------------------------------------------------------------ ganchos de teste (so local)
if (dbg.ganchos) {
  /** @type {any} */ (window).__jogo = {
    E,
    portal,
    audio,
    plataforma: PLATAFORMA,
    get lang() { return idioma(); },
    get jogou() { return portal.jogando; },
    get emAnuncio() { return portal.emAnuncio; },
    get menuAberto() { return E.menu; },
    get mundo() { return mundo; },
    /** ponto (px CSS) para um toque real no meio do tobogan */
    alvo() { return { x: window.innerWidth / 2, y: window.innerHeight * 0.7 }; },
    /** leva o jogador ate a chegada (prints e provas) */
    completar() {
      const k = E.jogador;
      const c = E.corrida;
      if (!k || !c) return;
      if (!c.iniciada) comecarCorrida();
      k.estado = 'calha';
      k.s = c.pista.comprimento - 1;
      k.v = Math.max(k.v, 10);
    },
    /** simula s segundos de corrida sem desenhar (gravacao: comeca o video perto do fim, num take so) @param {number} seg */
    pular(seg) {
      if (E.corrida && !E.corrida.iniciada) comecarCorrida();
      for (let i = 0; i < Math.round(seg * 60); i++) passo(1 / 60);
    },
    /** poe o jogador no comeco da reta de embalo da rampa final, rapido (prints e gravacao das manobras) */
    rampa() {
      const k = E.jogador;
      const c = E.corrida;
      if (!k || !c) return;
      if (!c.iniciada) comecarCorrida();
      k.estado = 'calha';
      k.s = c.pista.iFinal * DS - 40;
      k.u = 0;
      k.vu = 0;
      k.v = Math.max(k.v, c.cfg.vmax * 1.05);
    },
    /** libera o intervalo comercial (as carencias de corrida e tempo) */
    liberarIntervalo() {
      E.save.corridas = Math.max(E.save.corridas, CORRIDAS_ANTES_DO_INTERVALO);
      E.tempoJogo = Math.max(E.tempoJogo, SEGUNDOS_ANTES_DO_INTERVALO);
    },
    proxima() { return proximaRodada(); },
    /** poe o jogador logo antes do primeiro atalho, mirando a borda de fora (prints do voo) */
    prepararVoo() {
      const k = E.jogador;
      const c = E.corrida;
      if (!k || !c || !c.pista.atalhos.length) return;
      if (!c.iniciada) comecarCorrida();
      const at = c.pista.atalhos[0];
      ligarPiloto(k, c.pista.atalhos.length, 1);
      k.estado = 'calha';
      k.s = at.i0 * DS - 26;
      k.v = Math.max(k.v, FISICA.velProjeto * c.cfg.vmax * 1.1);
      k.u = at.dir * 0.7;
      k.dir = at.dir;
    },
    /** moedas de presente (prints da colecao) @param {number} n */
    darMoedas(n) {
      somarMoedas(E.save, n);
      salvar();
    },
    abrirColecao() { abrirColecao(); },
    /** um quadro de video sem relogio real (?filme): avanca 1/fps e devolve o JPEG */
    quadro(fps = 30) {
      passo(1 / fps);
      desenhar(1 / fps);
      return tela.toDataURL('image/jpeg', 0.9);
    },
  };
}

iniciar();
