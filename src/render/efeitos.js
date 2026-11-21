// [Flume Frenzy] Efeitos de agua: gotas e espuma (particulas em billboard transparente, um draw call),
// anel de onda na lagoa quando alguem cai, brilhos de moeda e de atalho, borrifo lateral da boia do
// jogador em velocidade e a trajetoria de pouso (pontinhos) nos primeiros voos.
//
// 2.0.0: pool fixo em vetores (nenhum objeto criado por quadro).
import * as THREE from 'three';
import { criarBillboards } from './billboard.js';

function texGota() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  // 0: gota branca-azulada  1: espuma macia  2: brilho  3: ponto da trajetoria
  let gr = g.createRadialGradient(28, 28, 2, 32, 32, 28);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.5, 'rgba(200,245,255,0.95)');
  gr.addColorStop(1, 'rgba(160,230,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  gr = g.createRadialGradient(96, 32, 4, 96, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(64, 0, 64, 64);
  g.save();
  g.translate(160, 32);
  g.fillStyle = 'rgba(255,240,150,1)';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 8 : 28;
    const a = (i / 8) * Math.PI * 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.fill();
  g.restore();
  g.beginPath();
  g.arc(224, 32, 18, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(18,64,90,0.6)';
  g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const CELS = [
  { u0: 0, v0: 0, du: 0.25, dv: 1 },
  { u0: 0.25, v0: 0, du: 0.25, dv: 1 },
  { u0: 0.5, v0: 0, du: 0.25, dv: 1 },
  { u0: 0.75, v0: 0, du: 0.25, dv: 1 },
];

/** @param {() => number} rnd sorteio visual (nao afeta a logica) */
export function criarEfeitos(rnd) {
  const MAX = 720;
  const tex = texGota();
  const bb = criarBillboards(tex, MAX, { transparente: true, corte: 0.02 });
  bb.malha.renderOrder = 6;
  const brilho = criarBillboards(tex, 120, { transparente: true, corte: 0.02, aditivo: true });
  brilho.malha.renderOrder = 7;
  const trilha = criarBillboards(tex, 64, { transparente: true, corte: 0.02, nevoa: false });
  trilha.malha.renderOrder = 8;
  const grupo = new THREE.Group();
  grupo.add(bb.malha, brilho.malha, trilha.malha);
  // aneis de onda
  const gAnel = new THREE.RingGeometry(0.8, 1, 32);
  gAnel.rotateX(-Math.PI / 2);
  const mAnel = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false });
  const aneis = Array.from({ length: 8 }, () => {
    const m = new THREE.Mesh(gAnel, mAnel.clone());
    m.visible = false;
    grupo.add(m);
    return { m, vida: 0 };
  });
  // alvo do pouso previsto
  const gAlvo = new THREE.RingGeometry(1.2, 1.7, 32);
  gAlvo.rotateX(-Math.PI / 2);
  const mAlvo = new THREE.MeshBasicMaterial({ color: '#5bff8a', transparent: true, opacity: 0.85, depthWrite: false, depthTest: false });
  const alvo = new THREE.Mesh(gAlvo, mAlvo);
  alvo.visible = false;
  alvo.renderOrder = 9;
  grupo.add(alvo);

  // pool de particulas (estrutura de vetores)
  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  const vida = new Float32Array(MAX);
  const maxV = new Float32Array(MAX);
  const tam = new Float32Array(MAX);
  const cel = new Uint8Array(MAX);
  const chao = new Float32Array(MAX);
  let n = 0;

  /** @param {number} x @param {number} y @param {number} z @param {number} ax @param {number} ay @param {number} az @param {number} m @param {number} t @param {number} c @param {number} ch */
  function nova(x, y, z, ax, ay, az, m, t, c, ch) {
    if (n >= MAX) return;
    px[n] = x; py[n] = y; pz[n] = z;
    vx[n] = ax; vy[n] = ay; vz[n] = az;
    vida[n] = 0; maxV[n] = m; tam[n] = t; cel[n] = c; chao[n] = ch;
    n++;
  }

  /**
   * @param {number} x @param {number} y @param {number} z
   * @param {number} qtd @param {number} forca m/s @param {number} [ch] altura onde a gota some
   */
  function respingo(x, y, z, qtd, forca, ch = -1) {
    for (let i = 0; i < qtd; i++) {
      const a = rnd() * Math.PI * 2;
      const h = forca * (0.3 + rnd() * 0.7);
      nova(x, y, z, Math.cos(a) * h * 0.6, forca * (0.6 + rnd() * 0.8), Math.sin(a) * h * 0.6,
        0.7 + rnd() * 0.6, 0.35 + rnd() * 0.6, rnd() < 0.7 ? 0 : 1, ch);
    }
  }
  /**
   * Leque baixo e largo (barrigada): gotas grandes saindo quase na horizontal para todos os lados.
   * @param {number} x @param {number} y @param {number} z @param {number} qtd @param {number} forca m/s
   */
  function leque(x, y, z, qtd, forca) {
    for (let i = 0; i < qtd; i++) {
      const a = (i / qtd) * Math.PI * 2 + rnd() * 0.3;
      const h = forca * (0.6 + rnd() * 0.5);
      nova(x, y + 0.2, z, Math.cos(a) * h, forca * (0.15 + rnd() * 0.25), Math.sin(a) * h, 0.6 + rnd() * 0.4, 0.6 + rnd() * 0.7, rnd() < 0.5 ? 0 : 1, y - 0.5);
    }
  }
  /** @param {number} x @param {number} y @param {number} z @param {number} qtd */
  function brilhos(x, y, z, qtd) {
    for (let i = 0; i < qtd; i++) {
      const a = rnd() * Math.PI * 2;
      nova(x, y, z, Math.cos(a) * 3, 2 + rnd() * 3, Math.sin(a) * 3, 0.5, 0.5, 2, -99);
    }
  }
  /**
   * Borrifo lateral da boia (velocidade): duas gotas jogadas para os lados e para tras.
   * @param {number} x @param {number} y @param {number} z @param {number} hx @param {number} hz rumo
   * @param {number} v velocidade
   */
  function borrifo(x, y, z, hx, hz, v) {
    const rx = -hz;
    const rz = hx;
    for (const lado of [-1, 1]) {
      const l = 3 + rnd() * 3;
      nova(x + rx * lado * 0.9, y + 0.15, z + rz * lado * 0.9,
        rx * lado * l + hx * v * 0.4, 2.5 + rnd() * 2.5, rz * lado * l + hz * v * 0.4, 0.5, 0.3 + rnd() * 0.3, 0, y - 1);
    }
  }
  /** @param {number} x @param {number} z @param {number} [y] */
  function onda(x, z, y = 0.06) {
    const o = aneis.find((r) => r.vida <= 0) || aneis[0];
    o.vida = 1.2;
    o.m.position.set(x, y, z);
    o.m.visible = true;
  }

  /**
   * Trajetoria prevista do voo (pontinhos) e o alvo do pouso.
   * @param {Float32Array} pts x,y,z de cada ponto @param {number} qtd
   * @param {{ x: number, y: number, z: number } | null} pouso null = cai na agua
   * @param {number} t tempo (pulsar)
   */
  function trajetoria(pts, qtd, pouso, t) {
    trilha.limpar();
    for (let i = 0; i < qtd; i++) {
      const s = 0.42 + 0.08 * Math.sin(t * 8 - i * 0.6);
      trilha.por(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], s, s, CELS[3]);
    }
    trilha.fechar();
    if (pouso) {
      alvo.visible = true;
      alvo.position.set(pouso.x, pouso.y + 0.15, pouso.z);
      mAlvo.color.set(pouso.y > 0.5 ? '#5bff8a' : '#ff6a5a');
      alvo.scale.setScalar(1 + 0.12 * Math.sin(t * 6));
    } else alvo.visible = false;
  }
  function semTrajetoria() {
    trilha.limpar();
    trilha.fechar();
    alvo.visible = false;
  }

  /** @param {number} dt */
  function atualizar(dt) {
    bb.limpar();
    brilho.limpar();
    let i = 0;
    while (i < n) {
      vida[i] += dt;
      if (vida[i] >= maxV[i] || py[i] < chao[i]) {
        // troca pelo ultimo (sem buraco no pool)
        n--;
        px[i] = px[n]; py[i] = py[n]; pz[i] = pz[n];
        vx[i] = vx[n]; vy[i] = vy[n]; vz[i] = vz[n];
        vida[i] = vida[n]; maxV[i] = maxV[n]; tam[i] = tam[n]; cel[i] = cel[n]; chao[i] = chao[n];
        continue;
      }
      vy[i] -= 16 * dt;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      pz[i] += vz[i] * dt;
      const k = 1 - vida[i] / maxV[i];
      const s = tam[i] * (0.6 + 0.6 * k);
      if (cel[i] === 2) brilho.por(px[i], py[i], pz[i], s, s, CELS[2], vida[i] * 6);
      else bb.por(px[i], py[i], pz[i], s, s, CELS[cel[i]]);
      i++;
    }
    bb.fechar();
    brilho.fechar();
    for (const o of aneis) {
      if (o.vida <= 0) continue;
      o.vida -= dt;
      const k = 1 - o.vida / 1.2;
      o.m.scale.setScalar(1 + k * 7);
      /** @type {THREE.MeshBasicMaterial} */ (o.m.material).opacity = 0.7 * (1 - k);
      if (o.vida <= 0) o.m.visible = false;
    }
  }

  return { grupo, respingo, leque, brilhos, borrifo, onda, trajetoria, semTrajetoria, atualizar, limpar() { n = 0; semTrajetoria(); } };
}
