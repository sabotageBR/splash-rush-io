// [Flume Frenzy] Constantes da fisica, divididas entre o gerador do tobogan (que calcula a queda dos
// atalhos para o voo caber) e a corrida. Unidades: metros, segundos, radianos. Puro.
//
// 3.0.0: fisica de verdade na calha.
// - Ao longo do tobogan a velocidade vem da descida: a = gDescida * declive - arrastoAr * v^2 / vel^2
//   - atritoCurva * v^2 * |k|. Despenca nas quedas, perde um pouco nas curvas fechadas e nas subidas.
// - De lado o corredor e um pendulo na meia-calha (alfa = u * ALFA_MAX a partir do fundo): a gravidade
//   da calha puxa para o fundo, a forca centrifuga v^2 * k empurra para fora da curva, e a direcao e uma
//   forca LIMITADA (o corredor se inclina) que so existe enquanto alguem pede. Sem pedir, ninguem segura o
//   corredor: na curva fechada ele sobe a parede e voa pela borda. Corrigir demais tambem joga para fora
//   (o pendulo volta com tudo).

/** Distancia horizontal entre duas amostras do tobogan (m). */
export const DS = 2;
/** Angulo da borda da calha a partir do fundo (rad, ~75 graus). Passar dele = voo. */
export const ALFA_MAX = 1.31;
/** Raio da calha (meia-largura) padrao, m. */
export const RAIO = 4;
/** Altura da lagoa: abaixo disso o corredor caiu na agua. */
export const NIVEL_AGUA = 0;
/** Altura do fundo do tobogan no ponto mais baixo da chegada (o fundo da reta de embalo da rampa final). */
export const ALTURA_FIM = 1.4;
/** Declive de referencia: a velocidade terminal nele e o vmax da rodada. */
export const DECLIVE_REF = 0.09;

export const FISICA = Object.freeze({
  /** gravidade no ar (m/s2): a de verdade */
  gAr: 9.8,
  /** impulso vertical ao passar da borda (m/s) */
  chute: 3.5,
  /** impulso lateral para fora ao decolar (m/s) */
  saidaLateral: 1.6,
  /** aceleracao lateral do controle no ar (m/s2) */
  controleAr: 9,
  // ---------------------------------------------------------------- ao longo do tobogan
  /** gravidade que puxa tobogan abaixo, vezes o declive (m/s2 por unidade de declive) */
  gDescida: 46,
  /** perda nas curvas: atrito da agua contra a parede, vezes a forca centrifuga (adimensional) */
  atritoCurva: 0.035,
  /** perda extra subindo alto na parede (m/s2 com |u| = 1) */
  atritoParede: 1.6,
  /** arrasto vezes isto no desvio do atalho (canal raso: quem nao voa vai mais devagar) */
  arrastoDesvio: 3,
  /** velocidade minima na calha (m/s): a agua sempre leva */
  velMin: 9,
  /** teto da velocidade, vezes o vmax da rodada */
  teto: 1.55,
  /** turbo: velocidade somada (m/s) e teto relativo ao vmax */
  turbo: 9,
  tetoTurbo: 1.7,
  /** rampa de salto: fracao da velocidade que vira subida */
  rampa: 0.24,
  /** rampa de parede: subida extra (m/s) */
  parede: 5,
  /** rampa final: atrito da lamina de agua (1/m, vezes v^2): 25 a 45 m/s no pe da rampa saem a 16 a 32 */
  arrastoRampa: 0.035,
  // ---------------------------------------------------------------- de lado (pendulo na calha)
  /** gravidade dentro da calha (puxa para o fundo), m/s2 */
  gCalha: 16,
  /** forca maxima da direcao (m/s2 na parede): numa reta nao passa da borda; segura as curvas fechadas */
  direcao: 15,
  /** amortecimento da agua (1/s): o pendulo balanca de verdade, mas assenta */
  amortece: 2.6,
  /** velocidade lateral maxima (m/s na parede) */
  vLatMax: 22,
  // ---------------------------------------------------------------- atalhos
  /** fracao do vmax usada para desenhar a queda dos atalhos (a ponta lenta: quem vem mais rapido pousa mais
   * adiante na pista de pouso, que e longa) */
  velProjeto: 0.84,
  /** margem extra de queda no atalho (m): pouso alguns metros depois do comeco da pista de pouso */
  margemAtalho: 2.5,
  /** borda de fora rebaixada na curva do atalho (u): e por ali que se voa para o trecho de baixo */
  bordaAtalho: 0.8,
  /** a borda rebaixada e um trampolim: subida extra ao decolar por ela (m/s) */
  chuteAtalho: 5,
  // ---------------------------------------------------------------- trombadas
  /** raio de cada boia (m, vezes o peso) */
  raioContato: 0.95,
  /** restituicao do impulso normal */
  restituicao: 0.35,
  /** fracao do impulso ao longo que vai para quem e batido por tras (o resto so freia quem bate) */
  repasse: 0.35,
  /** ganho na correnteza: no meio da calha a agua corre mais e leva (m/s2 com u = 0) */
  correnteza: 1.2,
  /** tranco lateral: velocidade de lado ganha por m/s de aproximacao (o jogador batendo / batido / entre bots) */
  tranco: 3.4,
  trancoNoJogador: 2.2,
  trancoBots: 1.4,
  /** depois do tranco a boia desliza solta por ate tempoSolto s, com o amortecimento vezes amorteceSolto */
  tempoSolto: 0.5,
  amorteceSolto: 0.3,
  /** aproximacao minima (m/s) para o tranco; abaixo disso so a separacao macia (nada de vai-e-vem) */
  aproximacaoMin: 0.8,
  /** separacao macia: fracao da sobreposicao desfeita por passo */
  separacao: 0.5,
});

/** Altura da borda acima do fundo da calha. @param {number} raio */
export const alturaBorda = (raio) => raio * (1 - Math.cos(ALFA_MAX));
