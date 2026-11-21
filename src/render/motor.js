// [Flume Frenzy] Motor 3D: WebGLRenderer, cena, camera, duas luzes (hemisferio e sol, sem sombra
// projetada: as sombras sao bolhas), nevoa e qualidade automatica pelo fps (DPR 2 -> 1,5 -> 1). No retrato
// o campo de visao vertical abre para caber o tobogan. Com ?filme o renderer guarda o quadro
// (preserveDrawingBuffer) para a gravacao quadro a quadro.
import * as THREE from 'three';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ filme?: boolean, fixa?: boolean }} [o]
 */
export function criarMotor(canvas, o = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!o.filme, alpha: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor('#bfeaf5');
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2600);
  const hemi = new THREE.HemisphereLight('#e8f8ff', '#5fb8a0', 1.7);
  cena.add(hemi);
  const sol = new THREE.DirectionalLight('#fff6e0', 2.1);
  sol.position.set(-60, 120, 40);
  cena.add(sol);
  cena.add(sol.target);
  cena.fog = new THREE.Fog('#bfeaf5', 180, 1100);

  // degraus do cel shading (MeshToonMaterial)
  const degraus = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1);
  degraus.minFilter = THREE.NearestFilter;
  degraus.magFilter = THREE.NearestFilter;
  degraus.needsUpdate = true;

  const niveis = [Math.min(2, window.devicePixelRatio || 1), Math.min(1.5, window.devicePixelRatio || 1), 1];
  let nivel = 0;
  let largura = 1;
  let altura = 1;

  function ajustar() {
    largura = Math.max(1, canvas.clientWidth || window.innerWidth);
    altura = Math.max(1, canvas.clientHeight || window.innerHeight);
    renderer.setPixelRatio(niveis[nivel]);
    renderer.setSize(largura, altura, false);
    camera.aspect = largura / altura;
    // retrato: abre o campo vertical para o tobogan caber de lado a lado
    camera.fov = camera.aspect < 1 ? Math.min(84, 62 / Math.max(0.55, camera.aspect) ** 0.55) : 62;
    camera.updateProjectionMatrix();
  }

  // fps para a qualidade automatica
  let acum = 0;
  let quadros = 0;
  let fps = 60;
  let ruins = 0;
  /** @param {number} dt s reais */
  function medir(dt) {
    acum += dt;
    quadros++;
    if (acum < 1) return;
    fps = quadros / acum;
    acum = 0;
    quadros = 0;
    if (o.fixa) return;
    ruins = fps < 46 ? ruins + 1 : 0;
    if (ruins >= 3 && nivel < niveis.length - 1) {
      nivel++;
      ruins = 0;
      ajustar();
    }
  }

  /** Luz acompanha o jogador (o sol e direcional, so a direcao importa). @param {THREE.Vector3} alvo */
  function seguirLuz(alvo) {
    sol.target.position.copy(alvo);
    sol.position.set(alvo.x - 60, alvo.y + 120, alvo.z + 40);
  }

  ajustar();
  return {
    renderer, cena, camera, hemi, sol, degraus, ajustar, medir, seguirLuz,
    renderizar: () => renderer.render(cena, camera),
    get fps() { return fps; },
    get nivel() { return nivel; },
    get largura() { return largura; },
    get altura() { return altura; },
  };
}
/** @typedef {ReturnType<typeof criarMotor>} Motor */
