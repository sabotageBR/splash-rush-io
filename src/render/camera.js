// [Flume Frenzy] Camera sempre atras do jogador: na calha segue o proprio tobogan (um ponto atras na
// curva, nunca cortando por fora), no ar recua e sobe para mostrar o pouso, na queda para e olha o
// respingo, na chegada gira devagar sobre a piscina.
//
// 2.0.0: segue o s e a posicao INTERPOLADOS (nada de degrau a cada passo fixo), com seguimento
// exponencial independente do fps.
// 3.0.0 (sensacao de velocidade): baixa e perto, sobe a parede junto com o corredor e inclina com ela (o
// "para cima" da camera segue a normal da calha), campo de visao que abre forte com a velocidade, tremor leve
// em alta velocidade (ruido suave, de baixa frequencia: nada de tremedeira quadro a quadro) e tranco curto
// nas trombadas e pousos.
// 3.1.0 (rampa final): no voo das manobras a camera passa para o LADO do jogador (o mortal vira um giro na tela,
// o superman deita o corpo de verdade), na altura dele, e fecha um pouco no apice (com a camera lenta do main);
// depois do mergulho fica olhando o respingo e gira devagar em volta de onde ele caiu.
import * as THREE from 'three';
import { noPonto, naSuperficie } from '../jogo/pista.js';
import { ALFA_MAX } from '../jogo/constantes.js';

/** @param {THREE.PerspectiveCamera} camera */
export function criarCamera(camera) {
  const pos = new THREE.Vector3();
  const olhar = new THREE.Vector3();
  const alvoPos = new THREE.Vector3();
  const alvoOlhar = new THREE.Vector3();
  const cima = new THREE.Vector3(0, 1, 0);
  const alvoCima = new THREE.Vector3(0, 1, 0);
  const CIMA = new THREE.Vector3(0, 1, 0);
  const tmp = {};
  const tmp2 = {};
  let fovExtra = 0;
  let tremor = 0;
  let primeiro = true;
  let ang = 0;
  let tt = 0;
  let uCam = 0;
  let orbita = false;

  /**
   * @param {import('../jogo/corrida.js').Corrida} c
   * @param {import('../jogo/corrida.js').Corredor} k jogador
   * @param {THREE.Vector3} posJog posicao desenhada (interpolada) do jogador
   * @param {number} sJog s desenhado (interpolado) do jogador
   * @param {{ centroPiscina: THREE.Vector3 }} tob
   * @param {number} dt
   * @param {number} fovBase
   */
  function atualizar(c, k, posJog, sJog, tob, dt, fovBase) {
    const p = c.pista;
    let suave = 6;
    let velTremor = 0;
    alvoCima.copy(CIMA);
    if (k.estado === 'calha' || k.estado === 'pronto') {
      const v = k.v;
      suave = 14;
      // um ponto atras, na mesma calha, subindo a parede atras do corredor (menos que ele)
      const atras = 3.4 + v * 0.022;
      uCam += (k.u * 0.62 - uCam) * Math.min(1, dt * 8);
      const sup = naSuperficie(p, sJog - atras, uCam, ALFA_MAX, tmp);
      // normal para dentro da calha (do ponto da superficie para o eixo do tubo)
      const al = sup.alfa;
      const normX = sup.hz * Math.sin(al);
      const normY = Math.cos(al);
      const normZ = -sup.hx * Math.sin(al);
      const h = 2.05 + v * 0.011;
      alvoPos.set(sup.x + normX * h, sup.y + normY * h, sup.z + normZ * h);
      const f = noPonto(p, sJog + 9 + v * 0.22, tmp2);
      alvoOlhar.set(f.x * 0.5 + posJog.x * 0.5, f.y * 0.5 + posJog.y * 0.5 + 0.55, f.z * 0.5 + posJog.z * 0.5);
      // "para cima" inclinado com a parede (mais da metade do angulo)
      alvoCima.set(normX * 0.6, normY * 0.6 + 0.4, normZ * 0.6).normalize();
      if (k.estado === 'pronto') {
        alvoPos.y += 1.4;
        suave = 4;
      }
      fovExtra += (Math.min(22, Math.max(0, (v - 18) * 0.55)) - fovExtra) * Math.min(1, dt * 2.5);
      velTremor = Math.max(0, Math.min(1, (v - 36) / 18));
    } else if (k.estado === 'ar' && k.final) {
      // de lado, na altura do jogador, um pouco atras: a manobra se le inteira
      const hv = Math.hypot(k.vx, k.vz) || 1;
      const dx = k.vx / hv;
      const dz = k.vz / hv;
      const rx = -dz;
      const rz = dx;
      const ap = Math.exp(-((k.vy / 6) ** 2));
      const lado = 7.5 - 1.5 * ap;
      suave = 6;
      // mira adiante pela velocidade (o seguimento exponencial atrasa v/suave metros): fica de lado de verdade
      const lx = k.vx / suave;
      const ly = k.vy / suave;
      const lz = k.vz / suave;
      // um pouco acima, olhando para baixo: a piscina aparece embaixo do voo (a altura se sente)
      // (o meio do corpo fica ~1,3 m acima do pe da boia)
      alvoPos.set(posJog.x + lx + rx * lado - dx * 1.5, Math.max(2.2, posJog.y + ly + 3.6), posJog.z + lz + rz * lado - dz * 1.5);
      // o olhar tambem mira adiante (segue 1,6x mais rapido): o bicho fica no meio da tela subindo e descendo
      const lo = 1 / (suave * 1.6);
      alvoOlhar.set(posJog.x + k.vx * lo + dx * 1.5, posJog.y + k.vy * lo + 0.9, posJog.z + k.vz * lo + dz * 1.5);
      fovExtra += (8 - 10 * ap - fovExtra) * Math.min(1, dt * 2.5);
      velTremor = 0.15;
    } else if (k.estado === 'ar') {
      const hv = Math.hypot(k.vx, k.vz) || 1;
      const dx = k.vx / hv;
      const dz = k.vz / hv;
      alvoPos.set(posJog.x - dx * 8, posJog.y + 4, posJog.z - dz * 8);
      alvoOlhar.set(posJog.x + dx * 16, posJog.y - 4.5, posJog.z + dz * 16);
      suave = 6;
      fovExtra += (Math.min(24, Math.max(0, (hv - 18) * 0.55) + 3) - fovExtra) * Math.min(1, dt * 2);
      velTremor = 0.3;
    } else if (k.estado === 'agua') {
      // para onde esta e olha o respingo
      alvoPos.copy(pos);
      alvoPos.y = Math.max(pos.y, 7);
      alvoOlhar.set(posJog.x, 0, posJog.z);
      suave = 2;
      fovExtra += (0 - fovExtra) * Math.min(1, dt * 2);
    } else {
      // chegada: fica olhando o respingo e gira devagar em volta de onde o jogador caiu
      if (!orbita) {
        orbita = true;
        ang = Math.atan2(pos.z - posJog.z, pos.x - posJog.x);
      }
      ang += dt * 0.22;
      alvoPos.set(posJog.x + Math.cos(ang) * 15, 6.5, posJog.z + Math.sin(ang) * 15);
      alvoOlhar.set(posJog.x, posJog.y + 0.6, posJog.z);
      suave = 1.4;
      fovExtra += (0 - fovExtra) * Math.min(1, dt);
    }
    if (k.estado !== 'chegou') orbita = false;
    if (primeiro) {
      pos.copy(alvoPos);
      olhar.copy(alvoOlhar);
      cima.copy(alvoCima);
      primeiro = false;
    }
    pos.lerp(alvoPos, 1 - Math.exp(-suave * dt));
    olhar.lerp(alvoOlhar, 1 - Math.exp(-suave * 1.6 * dt));
    cima.lerp(alvoCima, 1 - Math.exp(-5 * dt)).normalize();
    camera.position.copy(pos);
    tt += dt;
    // tremor da velocidade: ruido suave (soma de senos lentos), poucos centimetros
    if (velTremor > 0) {
      const a = 0.035 * velTremor;
      camera.position.x += (Math.sin(tt * 13.1) + Math.sin(tt * 17.7) * 0.5) * a;
      camera.position.y += (Math.sin(tt * 15.3 + 1.3) + Math.sin(tt * 11.9) * 0.5) * a;
    }
    // tranco (trombada, pouso): curto e que some rapido
    if (tremor > 0) {
      tremor = Math.max(0, tremor - dt * 4);
      camera.position.x += Math.sin(tt * 90) * tremor * 0.35;
      camera.position.y += Math.cos(tt * 110) * tremor * 0.35;
    }
    camera.up.copy(cima);
    camera.lookAt(olhar);
    const fov = fovBase + fovExtra;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  return {
    atualizar,
    /** @param {number} f 0..1 */
    tremer(f) { tremor = Math.max(tremor, f); },
    reiniciar() { primeiro = true; fovExtra = 0; ang = 0; uCam = 0; orbita = false; },
    pos,
    get fovExtra() { return fovExtra; },
  };
}
