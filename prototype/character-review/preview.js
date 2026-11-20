import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';

const names = {front:'정면', side:'측면', back:'후면', oblique:'후면 45°', game:'게임 카메라'};
const directions = {front:Math.PI, side:Math.PI / 2, back:0, oblique:Math.PI / 4};
const status = document.querySelector('#model-status');
const viewNote = document.querySelector('#view-note');
const buttons = [...document.querySelectorAll('.controls button')];
let angle = 'oblique';
let scale = 'full';

function setup(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe5e3dc);
  scene.fog = new THREE.Fog(0xe5e3dc, 11, 27);
  scene.add(new THREE.HemisphereLight(0xf8f8ff, 0x9f998b, 2.1));
  const key = new THREE.DirectionalLight(0xfff6eb, 2.4);
  key.position.set(-3, 6, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left:-3, right:3, top:3, bottom:-3, near:.1, far:15 });
  key.shadow.normalBias = .012;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe6edff, 1.25);
  fill.position.set(3, 3, -4);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({
    color:0xb8b6ad, roughness:1,
  }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.025;
  ground.receiveShadow = true;
  scene.add(ground);

  const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  return {canvas, scene, renderer, camera:new THREE.PerspectiveCamera(40, 1, .05, 60)};
}

function draw(view) {
  const {canvas, scene, renderer, camera} = view;
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  if (angle === 'game') {
    camera.fov = 48;
    camera.position.set(0, 3.1, 4.85);
    camera.lookAt(0, 1.15, -3.2);
  } else {
    const close = scale === 'close';
    const radius = close ? 1.7 : 3.3;
    const direction = directions[angle];
    const height = close ? 1.36 : .97;
    camera.fov = 40;
    camera.position.set(radius * Math.sin(direction), height + (close ? .13 : .26), radius * Math.cos(direction));
    camera.lookAt(0, height, 0);
  }
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

function refresh() {
  for (const button of buttons) {
    if (button.dataset.angle) button.setAttribute('aria-pressed', button.dataset.angle === angle);
    else {
      button.disabled = angle === 'game';
      button.setAttribute('aria-pressed', angle !== 'game' && button.dataset.scale === scale);
    }
  }
  viewNote.textContent = angle === 'game'
    ? '실외 게임 카메라 · 뒤 4.85m · 수직 시야각 48°'
    : names[angle] + ' · ' + (scale === 'close' ? '가까이' : '전신');
  for (const view of views) draw(view);
}

function reportFailure(target, message) {
  target.hidden = false;
  target.classList.add('failed');
  target.textContent = message;
}

let views = [];
async function init() {
  try {
    views = [setup(document.querySelector('#before')), setup(document.querySelector('#after'))];
  } catch {
    for (const target of document.querySelectorAll('.model-status')) {
      reportFailure(target, '3D 화면을 시작하지 못했습니다. WebGL 2를 지원하는 브라우저에서 다시 열어 주세요.');
    }
    return;
  }
  for (const button of buttons) {
    button.addEventListener('click', () => {
      angle = button.dataset.angle ?? angle;
      scale = button.dataset.scale ?? scale;
      refresh();
    });
  }
  const resize = new ResizeObserver(refresh);
  for (const view of views) resize.observe(view.canvas);
  refresh();
  const loader = new GLTFLoader();
  const files = [
    ['commuter.glb', document.querySelector('#baseline-status')],
    ['commuter-refined.glb', status],
  ];
  const results = await Promise.all(files.map(async ([file, label], index) => {
    try {
      const {scene} = await loader.loadAsync('./model/' + file);
      scene.traverse(node => {
        if (node.isMesh) node.castShadow = true;
      });
      views[index].scene.add(scene);
      label.hidden = true;
      draw(views[index]);
      return true;
    } catch {
      reportFailure(label, 'GLB를 불러오지 못했습니다. 로컬 HTTP 서버와 모델 경로를 확인해 주세요.');
      return false;
    }
  }));
  document.body.dataset.model = results.every(Boolean) ? 'ready' : 'failed';
}

init();
