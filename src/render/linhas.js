// [Flume Frenzy] Linhas de velocidade: tracos brancos finos presos a camera (um draw call, InstancedMesh)
// que vem do fundo e abrem para as bordas, mais fortes com a velocidade, no voo e no turbo. Ficam no WebGL
// (e nao em CSS) para aparecer tambem nos videos gravados quadro a quadro. Nada alocado por quadro.
import * as THREE from 'three';

const N = 48;

/** @param {THREE.PerspectiveCamera} camera @param {() => number} rnd */
export function criarLinhas(camera, rnd) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false });
  const malha = new THREE.InstancedMesh(geo, mat, N);
  malha.frustumCulled = false;
  malha.renderOrder = 20;
  camera.add(malha);
  const ang = new Float32Array(N);
  const raio = new Float32Array(N);
  const prof = new Float32Array(N);
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const esc = new THREE.Vector3();
  const eixoZ = new THREE.Vector3(0, 0, 1);
  const nascer = (i, longe) => {
    ang[i] = rnd() * Math.PI * 2;
    raio[i] = 2.2 + rnd() * 4;
    prof[i] = longe ? -(18 + rnd() * 14) : -(3 + rnd() * 29);
  };
  for (let i = 0; i < N; i++) nascer(i, false);
  let forca = 0;

  /**
   * @param {number} dt @param {number} alvo 0..1 (velocidade, voo, turbo) @param {number} v m/s
   */
  function atualizar(dt, alvo, v) {
    forca += (alvo - forca) * (1 - Math.exp(-6 * dt));
    mat.opacity = forca * 0.55;
    malha.visible = forca > 0.02;
    if (!malha.visible) return;
    const vel = 14 + v * 1.7;
    for (let i = 0; i < N; i++) {
      prof[i] += vel * dt;
      if (prof[i] > -1.5) nascer(i, true);
      const z = prof[i];
      pos.set(Math.cos(ang[i]) * raio[i], Math.sin(ang[i]) * raio[i] * 0.75, z);
      q.setFromAxisAngle(eixoZ, ang[i] - Math.PI / 2);
      esc.set(0.035, 0.8 + forca * 1.6, 1);
      m4.compose(pos, q, esc);
      malha.setMatrixAt(i, m4);
    }
    malha.instanceMatrix.needsUpdate = true;
  }

  return { atualizar, descartar() { camera.remove(malha); geo.dispose(); mat.dispose(); } };
}
