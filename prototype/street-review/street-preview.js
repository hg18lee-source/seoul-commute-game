import { World } from '../dist/world.js';
import { loadCommuter, movementSpeed } from '../dist/hero/motion.js';

const canvas=document.querySelector('#world');
const status=document.querySelector('#status');
const keys=new Set();
const scenes={
  start:[[-5,0,15],[-5,3.1,19.85],[-5,1.15,11.8]],
  overview:[[0,0,-12],[23,31,18],[-3,0,-19]],
  facade:[[-7.4,0,-2],[-3.1,3.2,5.4],[-10.6,2.35,-2.7]],
  station:[[-5,0,-24],[.5,3.05,-16.8],[-8,1.45,-24]],
  stop:[[7,0,-42],[2.6,3.05,-35],[9,1.38,-42]],
};
const variantButtons=[...document.querySelectorAll('[data-version]')];
const cameraButtons=[...document.querySelectorAll('[data-view]')];
let version='after', view='start', walking=false, previous=0;

try {
  const world=new World(canvas,await loadCommuter());
  function resize() {
    world.camera.aspect=canvas.clientWidth/canvas.clientHeight;
    world.camera.updateProjectionMatrix();
    world.renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);
  }
  // World ordinarily owns a full-window canvas; this review embeds it in a panel.
  canvas.style.removeProperty('width');
  canvas.style.removeProperty('height');
  world.resize=resize;
  const observer=new ResizeObserver(resize);
  observer.observe(canvas);
  function use(viewName, position) {
    view=viewName;
    const [point,camera,target]=scenes[view];
    world.camera.position.set(...camera);
    world.camera.lookAt(...target);
    world.hero.position.set(...(position??point));
    for (const button of cameraButtons) button.setAttribute('aria-pressed',button.dataset.view===view);
  }
  function change(next, keepPosition=false) {
    const prior=world.hero.position.toArray();
    version=next;
    world.setStage('street',{legacyStreet:version==='before'});
    world.streetBus.position.z=-42;
    use(view,keepPosition?prior:undefined);
    for (const button of variantButtons) button.setAttribute('aria-pressed',button.dataset.version===version);
  }
  for (const button of variantButtons) button.onclick=()=>change(button.dataset.version,true);
  for (const button of cameraButtons) button.onclick=()=>{
    walking=false;
    keys.clear();
    world.heroAnimator.reset();
    use(button.dataset.view);
  };
  document.querySelector('#walk').onclick=()=>{
    walking=true;
    canvas.focus();
  };
  canvas.addEventListener('keydown',event=>{
    if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Shift'].includes(event.key)) return;
    event.preventDefault();
    walking=true;
    keys.add(event.key);
  });
  addEventListener('keyup',event=>keys.delete(event.key));
  canvas.addEventListener('blur',()=>keys.clear());
  change(version);
  resize();
  function frame(now) {
    const dt=previous?Math.min(.05,(now-previous)/1000):0;
    previous=now;
    if (walking) {
      const dx=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
      const dz=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));
      const running=keys.has('Shift');
      world.move(dx,dz,dt,running?movementSpeed.run:movementSpeed.walk);
      world.advanceHero(dt,{running});
      world.update(dt,now/1000);
    } else world.renderer.render(world.scene,world.camera);
    const next=walking?world.heroAnimator.state+(keys.has('Shift')?' · Shift':''):'고정 비교 구도';
    const label=(version==='before'?'기존 거리':'개선 거리')+' · '+next;
    if (status.textContent!==label) status.textContent=label;
    requestAnimationFrame(frame);
  }
  document.body.dataset.street='ready';
  requestAnimationFrame(frame);
} catch {
  status.textContent='거리를 불러오지 못했습니다. 로컬 HTTP 서버와 WebGL 2 지원을 확인해 주세요.';
  document.body.dataset.street='failed';
}
