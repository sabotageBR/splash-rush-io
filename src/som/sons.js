// [Flume Frenzy] Sons sintetizados (src/som/receitas.js). Contrato de cada receita:
// (v, t0, p) => duracao em s, sem sorteio.
//
// 2.0.0: nada de "catraca" (pedido do usuario para todos os jogos): sem rajadas repetidas de agua, sem
// arpejos rapidos e sem tique-tique de moedas. Festa e atalho sao acordes que soam juntos e somem devagar;
// a moeda e um toque so (o main.js espaca as moedas de uma fileira).
// 3.1.0: manobras com som de combo MUSICAL: cada manobra completa e um sino so, subindo a escala pentatonica
// com o combo (uma nota por manobra, nunca rajada); pouso perfeito e um acorde; barrigada e um tapa na agua.
import { tom, sopro, hz } from './receitas.js';

/** Acorde: as notas comecam juntas (nada de sequencia rapida). */
function acorde(v, t0, notas, o) {
  let fim = t0;
  for (const m of notas) fim = Math.max(fim, tom(v, t0, Object.assign({ f: hz(m) }, o)));
  return fim;
}

export const SONS = {
  largada(v, t0) {
    // um apito so, subindo
    return tom(v, t0, { f: hz(72), f2: hz(79), vol: 0.1, ataque: 0.02, segurar: 0.18, queda: 0.3, tipo: 'triangle' }) - t0;
  },
  contagem(v, t0, p) {
    const ultimo = p && p.ultimo;
    return tom(v, t0, { f: hz(ultimo ? 84 : 72), vol: 0.07, ataque: 0.008, queda: ultimo ? 0.35 : 0.16, tipo: 'sine' }) - t0;
  },
  empurrao(v, t0, p) {
    // baque limpo: um tom grave que cai e um respingo curto por baixo (uma vez so)
    const f = (p && p.forca) || 0.5;
    sopro(v, t0, { f: 900, f2: 400, q: 0.8, filtro: 'lowpass', vol: 0.03 + f * 0.03, ataque: 0.003, queda: 0.1 });
    return tom(v, t0, { f: 190, f2: 85, vol: 0.09 + f * 0.04, ataque: 0.004, queda: 0.16, tipo: 'sine' }) - t0;
  },
  decolar(v, t0) {
    return sopro(v, t0, { f: 500, f2: 2200, q: 1.2, vol: 0.08, ataque: 0.08, segurar: 0.25, queda: 0.45 }) - t0;
  },
  pousar(v, t0) {
    sopro(v, t0, { f: 1400, f2: 500, q: 0.7, filtro: 'lowpass', vol: 0.12, ataque: 0.006, queda: 0.45 });
    return tom(v, t0, { f: 120, f2: 60, vol: 0.1, ataque: 0.005, queda: 0.2, tipo: 'sine' }) - t0;
  },
  splash(v, t0) {
    sopro(v, t0, { f: 2200, f2: 400, q: 0.6, filtro: 'lowpass', vol: 0.16, ataque: 0.005, queda: 0.8 });
    tom(v, t0, { f: 480, f2: 140, vol: 0.07, ataque: 0.006, queda: 0.35, tipo: 'sine' });
    return 0.9;
  },
  atalho(v, t0) {
    return acorde(v, t0, [76, 79, 84], { vol: 0.05, ataque: 0.03, segurar: 0.15, queda: 0.6, tipo: 'triangle' }) - t0;
  },
  turbo(v, t0) {
    return sopro(v, t0, { f: 800, f2: 2600, q: 1.5, vol: 0.06, ataque: 0.04, segurar: 0.1, queda: 0.3 }) - t0;
  },
  rampa(v, t0) {
    return tom(v, t0, { f: 220, f2: 520, vol: 0.08, ataque: 0.01, queda: 0.3, tipo: 'triangle' }) - t0;
  },
  moeda(v, t0) {
    return tom(v, t0, { f: hz(88), vol: 0.05, ataque: 0.006, queda: 0.35, tipo: 'sine' }) - t0;
  },
  vitoria(v, t0) {
    acorde(v, t0, [72, 76, 79], { vol: 0.055, ataque: 0.04, segurar: 0.3, queda: 0.5, tipo: 'triangle' });
    return acorde(v, t0 + 0.45, [77, 81, 84], { vol: 0.06, ataque: 0.05, segurar: 0.4, queda: 0.9, tipo: 'triangle' }) - t0;
  },
  chegada(v, t0) {
    return acorde(v, t0, [67, 72, 76], { vol: 0.055, ataque: 0.04, segurar: 0.2, queda: 0.6, tipo: 'triangle' }) - t0;
  },
  desbloqueio(v, t0) {
    return acorde(v, t0, [84, 88, 91], { vol: 0.04, ataque: 0.05, segurar: 0.2, queda: 0.8, tipo: 'sine' }) - t0;
  },
  /** decolagem da rampa final: sopro largo subindo */
  lancar(v, t0) {
    sopro(v, t0, { f: 300, f2: 1800, q: 0.9, vol: 0.1, ataque: 0.05, segurar: 0.3, queda: 0.6 });
    return tom(v, t0, { f: 180, f2: 420, vol: 0.06, ataque: 0.02, queda: 0.45, tipo: 'triangle' }) - t0;
  },
  /** manobra completa: um sino na nota do combo (p.nota 0, 1, 2... sobe a escala) */
  manobra(v, t0, p) {
    const ESCALA = [76, 79, 81, 84, 86, 88, 91, 93];
    const m = ESCALA[Math.max(0, Math.min(ESCALA.length - 1, (p && p.nota) || 0))];
    tom(v, t0, { f: hz(m + 12), vol: 0.025, ataque: 0.004, queda: 0.25, tipo: 'sine' });
    return tom(v, t0, { f: hz(m), vol: 0.06, ataque: 0.006, segurar: 0.05, queda: 0.5, tipo: 'triangle' }) - t0;
  },
  pousoLimpo(v, t0) {
    sopro(v, t0, { f: 2400, f2: 600, q: 0.6, filtro: 'lowpass', vol: 0.12, ataque: 0.005, queda: 0.6 });
    return acorde(v, t0 + 0.05, [79, 83, 86, 91], { vol: 0.045, ataque: 0.03, segurar: 0.25, queda: 0.8, tipo: 'triangle' }) - t0;
  },
  barrigada(v, t0) {
    // tapa chato na agua, um baque grave e um "uon" descendo
    sopro(v, t0, { f: 3200, f2: 300, q: 0.5, filtro: 'lowpass', vol: 0.24, ataque: 0.002, queda: 0.7 });
    tom(v, t0, { f: 140, f2: 48, vol: 0.14, ataque: 0.003, queda: 0.3, tipo: 'sine' });
    return tom(v, t0 + 0.12, { f: 320, f2: 130, vol: 0.05, ataque: 0.02, segurar: 0.1, queda: 0.35, tipo: 'triangle' }) - t0;
  },
  clique(v, t0) {
    return tom(v, t0, { f: 700, f2: 560, vol: 0.04, ataque: 0.004, queda: 0.06, tipo: 'sine' }) - t0;
  },
};
