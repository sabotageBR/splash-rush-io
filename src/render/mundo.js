// [Flume Frenzy] Fachada do desenho 3D, carregada so depois do portal.init() (import dinamico no
// main.js: o three.js nao atrasa o handshake do portal). Junta motor, arte, tobogan, cenario,
// corredores, efeitos e camera, e traduz os eventos da corrida em respingos e tremores.
import * as THREE from 'three';
import { criarMotor } from './motor.js';
import { carregarArteInicial, garantirParque } from './arte.js';
import { criarTobogan } from './tobogan.js';
import { criarCenario } from './cenario.js';
import { criarDesenhoCorredores } from './corredores.js';
import { criarEfeitos } from './efeitos.js';
import { criarCamera } from './camera.js';
import { criarLinhas } from './linhas.js';
import { TEMAS, POR_DO_SOL } from './temas.js';
import { buscarPouso } from '../jogo/pista.js';
import { FISICA, NIVEL_AGUA } from '../jogo/constantes.js';
import { MANOBRA } from '../jogo/manobras.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ filme?: boolean, fixa?: boolean, rnd: () => number }} o
 */
export async function criarMundo(canvas, o) {
  const motor = criarMotor(canvas, { filme: o.filme, fixa: o.fixa });
  const cam = criarCamera(motor.camera);
  const efeitos = criarEfeitos(o.rnd);
  motor.cena.add(efeitos.grupo);
  // a camera entra na cena para levar as linhas de velocidade presas a ela
  motor.cena.add(motor.camera);
  const linhas = criarLinhas(motor.camera, o.rnd);
  let vmaxRodada = 28;
  /** @type {import('./arte.js').Arte | null} */
  let arte = null;
  /** @type {import('./tobogan.js').Tobogan | null} */
  let tob = null;
  /** @type {import('./cenario.js').Cenario | null} */
  let cen = null;
  /** @type {ReturnType<typeof criarDesenhoCorredores> | null} */
  let corr = null;
  let t = 0;
  let tBorrifo = 0;
  const v = new THREE.Vector3();
  /** pontos da trajetoria prevista (x, y, z) e o pouso previsto */
  const pts = new Float32Array(40 * 3);
  const pouso = { x: 0, y: 0, z: 0 };

  /**
   * Trajetoria balistica prevista do jogador no ar (sem o controle) ate o tobogan ou a lagoa.
   * @param {import('../jogo/corrida.js').Corrida} c @param {import('../jogo/corrida.js').Corredor} k
   */
  function preverVoo(c, k) {
    let x = k.x;
    let y = k.y;
    let z = k.z;
    let vy = k.vy;
    const dtp = 0.07;
    let qtd = 0;
    let achou = null;
    for (let i = 0; i < 40; i++) {
      const yAntes = y;
      vy -= FISICA.gAr * dtp;
      x += k.vx * dtp;
      y += vy * dtp;
      z += k.vz * dtp;
      if (vy < 0) {
        const r = buscarPouso(c.pista, x, y, z, yAntes, k.sDecola + 6, 1.15 + k.ima * 0.25);
        if (r) {
          pouso.x = c.pista.x[r.i];
          pouso.y = c.pista.y[r.i];
          pouso.z = c.pista.z[r.i];
          achou = pouso;
          break;
        }
      }
      if (y < NIVEL_AGUA) {
        pouso.x = x;
        pouso.y = NIVEL_AGUA;
        pouso.z = z;
        achou = pouso;
        break;
      }
      if (i % 2 === 1) {
        pts[qtd * 3] = x;
        pts[qtd * 3 + 1] = y;
        pts[qtd * 3 + 2] = z;
        qtd++;
      }
    }
    efeitos.trajetoria(pts, qtd, achou, t);
  }

  return {
    motor,
    cam,
    /** @param {(f: number) => void} progresso */
    async carregar(progresso) {
      arte = await carregarArteInicial(progresso);
      corr = criarDesenhoCorredores(arte, 24);
      motor.cena.add(corr.grupo);
      return arte;
    },
    /** Pre-carrega o cenario de um parque. @param {string} parque */
    async prepararParque(parque) {
      if (arte) await garantirParque(arte, parque);
    },
    /**
     * Troca o tobogan e o cenario para uma rodada nova.
     * @param {import('../jogo/pista.js').Pista} pista
     * @param {string} parque @param {string|null} evento @param {number} semente
     */
    async montar(pista, parque, evento, semente) {
      if (!arte) throw new Error('arte nao carregada');
      await garantirParque(arte, parque);
      if (tob) {
        motor.cena.remove(tob.grupo);
        tob.descartar();
      }
      if (cen) {
        motor.cena.remove(cen.grupo);
        cen.descartar();
      }
      const tema = Object.assign({}, TEMAS[parque] || TEMAS.tropical, evento === 'por-do-sol' ? POR_DO_SOL : {});
      tob = criarTobogan(pista, tema, arte, motor);
      cen = criarCenario(pista, parque, tema, arte, motor, semente);
      motor.cena.add(cen.grupo, tob.grupo);
      /** @type {THREE.Fog} */ (motor.cena.fog).color.set(tema.nevoa);
      motor.renderer.setClearColor(tema.nevoa);
      motor.hemi.color.set('#e8f8ff');
      motor.hemi.groundColor.set(tema.chao);
      motor.sol.color.set(tema.luz);
      motor.sol.intensity = evento === 'por-do-sol' ? 1.6 : 2.1;
      efeitos.limpar();
      cam.reiniciar();
      if (corr) corr.reiniciar();
      vmaxRodada = pista.vmax;
    },
    /**
     * Um quadro.
     * @param {import('../jogo/corrida.js').Corrida} c
     * @param {import('../jogo/corrida.js').Corredor} jog
     * @param {number} dt s (desenho)
     * @param {number} alfa fracao de interpolacao entre passos
     * @param {boolean} trajetoria mostrar a trajetoria de pouso quando o jogador voa
     */
    atualizar(c, jog, dt, alfa, trajetoria) {
      if (!tob || !cen || !corr) return;
      t += dt;
      tob.atualizar(dt, jog.estado === 'calha' ? jog.v : jog.estado === 'ar' ? Math.hypot(jog.vx, jog.vz) : 0);
      corr.atualizar(c, motor.camera, t, jog, alfa, dt);
      const pj = corr.pos[jog.id];
      // borrifo da boia do jogador em velocidade (mais forte subindo a parede)
      if (jog.estado === 'calha' && jog.v > 14 && dt > 0) {
        tBorrifo -= dt;
        if (tBorrifo <= 0) {
          tBorrifo = 0.045 - 0.02 * Math.min(1, Math.abs(jog.u));
          efeitos.borrifo(pj.x, pj.y, pj.z, jog.hx, jog.hz, jog.v * (1 + 0.6 * Math.abs(jog.u)));
        }
      }
      if (trajetoria && jog.estado === 'ar' && !jog.final) preverVoo(c, jog);
      else efeitos.semTrajetoria();
      efeitos.atualizar(dt);
      // linhas de vento: desde ~55% do vmax, cheias acima dele, no voo e no turbo
      const correndo = c.iniciada && (jog.estado === 'calha' || jog.estado === 'ar');
      const forcaVel = !correndo ? 0 : jog.final ? 0.3 : jog.estado === 'ar' || jog.turbo > 0 ? 1
        : Math.max(0, Math.min(1, (jog.v - 0.55 * vmaxRodada) / (0.5 * vmaxRodada)));
      linhas.atualizar(dt, forcaVel, jog.v);
      cam.atualizar(c, jog, pj, corr.sDesenho[jog.id], tob, dt, motor.camera.aspect < 1 ? Math.min(84, 62 / Math.max(0.55, motor.camera.aspect) ** 0.55) : 62);
      motor.camera.updateMatrixWorld();
      cen.atualizar(dt, motor.camera.position);
      motor.seguirLuz(pj);
    },
    renderizar() {
      motor.renderizar();
    },
    /**
     * Efeitos de um evento da corrida.
     * @param {{ tipo: string, id: number, x: number, y: number, z: number, [k: string]: any }} e
     * @param {boolean} doJogador
     */
    efeito(e, doJogador) {
      switch (e.tipo) {
        case 'caiu':
          efeitos.respingo(e.x, 0.2, e.z, 34, 9, -0.5);
          efeitos.onda(e.x, e.z);
          break;
        case 'pousou':
          efeitos.respingo(e.x, e.y + 0.3, e.z, 18, 5, e.y - 3);
          if (doJogador) cam.tremer(Math.min(1, 0.25 + (e.queda || 0) / 30));
          break;
        case 'decolou':
          efeitos.respingo(e.x, e.y, e.z, 10, 4, e.y - 4);
          break;
        case 'rampa':
          // a rampa final solta um leque de agua no labio
          if (e.final) efeitos.respingo(e.x, e.y, e.z, doJogador ? 26 : 12, 7, e.y - 6);
          else efeitos.respingo(e.x, e.y, e.z, 10, 4, e.y - 4);
          break;
        case 'manobra':
          efeitos.brilhos(e.x, e.y + 1.2, e.z, doJogador ? 12 : 6);
          break;
        case 'mergulho': {
          // respingo proporcional ao impacto; a barrigada abre um leque largo e baixo, o pouso limpo uma coroa alta
          const imp = Math.min(40, e.impacto || 20);
          const y0 = MANOBRA.agua;
          if (e.qualidade === 'barrigada') {
            efeitos.respingo(e.x, y0, e.z, doJogador ? 70 : 34, 0.42 * imp, y0 - 0.4);
            efeitos.leque(e.x, y0, e.z, doJogador ? 40 : 18, 0.5 * imp);
            efeitos.onda(e.x, e.z, y0 + 0.04);
            efeitos.onda(e.x, e.z, y0 + 0.05);
            if (doJogador) cam.tremer(0.9);
          } else {
            efeitos.respingo(e.x, y0, e.z, (doJogador ? 30 : 16) + Math.round(imp * 0.6), 0.3 * imp, y0 - 0.4);
            efeitos.onda(e.x, e.z, y0 + 0.04);
            if (doJogador) cam.tremer(0.3 + imp / 80);
            if (doJogador && e.qualidade === 'limpo' && e.n > 0) efeitos.brilhos(e.x, y0 + 1.5, e.z, 18);
          }
          break;
        }
        case 'empurrao':
          efeitos.respingo(e.x, e.y + 0.3, e.z, doJogador ? 9 : 5, 2 + 2.5 * (e.forca || 0), e.y - 0.5);
          if (doJogador) cam.tremer(0.25 + 0.35 * (e.forca || 0));
          break;
        case 'moeda':
        case 'atalho':
          efeitos.brilhos(e.x, e.y + 1, e.z, e.tipo === 'atalho' ? 16 : 6);
          break;
        default:
          break;
      }
    },
    /**
     * Posicao de tela (px CSS) de um corredor (null fora da tela).
     * @param {number} id @param {number} [acima] m acima do pe
     */
    naTela(id, acima = 2.8) {
      if (!corr || !corr.visivel[id]) return null;
      v.copy(corr.pos[id]);
      v.y += acima;
      v.project(motor.camera);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
      return { x: (v.x * 0.5 + 0.5) * motor.largura, y: (-v.y * 0.5 + 0.5) * motor.altura, z: v.z };
    },
    /** Ponto do mundo na tela (px CSS). @param {number} x @param {number} y @param {number} z */
    pontoNaTela(x, y, z) {
      v.set(x, y, z).project(motor.camera);
      if (v.z > 1) return null;
      return { x: (v.x * 0.5 + 0.5) * motor.largura, y: (-v.y * 0.5 + 0.5) * motor.altura };
    },
    get arte() { return arte; },
  };
}
/** @typedef {Awaited<ReturnType<typeof criarMundo>>} Mundo */
