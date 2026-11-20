import * as T from '../dist/vendor/three.module.js';
import { GLTFLoader } from '../dist/hero/vendor/loaders/GLTFLoader.js';

const canvas = document.querySelector('canvas');
const status = document.querySelector('#status');
const buttons = [...document.querySelectorAll('button')];
const angles = [[5, 4.5, 12], [12, 5, .5], [-7, 5, -11], [1.15, 1.95, 2.55]];
const targets = [[0, .7, .8], [0, 1, .5], [0, .8, -.9], [1.1, -2, -4]];
let angle = 0;
try {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  const scene = new T.Scene();
  scene.background = new T.Color(0xa2b5c5);
  const camera = new T.PerspectiveCamera(48, 1, .04, 100);
  const sun = new T.DirectionalLight(0xfff2db, 2.6);
  sun.position.set(4, 9, 7);
  scene.add(sun, new T.HemisphereLight(0xe8f4ff, 0x948776, 2));
  const { scene: model } = await new GLTFLoader().loadAsync('./assets/original.glb');
  scene.add(model);
  function draw() {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    camera.position.set(...angles[angle]);
    camera.lookAt(...targets[angle]);
    renderer.render(scene, camera);
  }
  buttons.forEach((button, i) => button.onclick = () => { angle = i; draw(); });
  addEventListener('resize', draw);
  draw();
  status.textContent = '원본 GLB · Alt';
  document.body.dataset.scene = 'ready';
} catch (error) {
  console.error(error);
  status.textContent = '원본 로딩 실패';
  document.body.dataset.scene = 'failed';
}
