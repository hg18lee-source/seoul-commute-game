import * as THREE from 'three';
import { CommuterMotion, loadCommuter, movementSpeed } from '../dist/hero/motion.js';
import { legacyFigure } from './source/legacy-preview.js';

const stage=document.querySelector('#motion-stage');
const status=document.querySelector('#motion-status');
const demoButtons=[...document.querySelectorAll('[data-demo]')];
const viewButtons=[...document.querySelectorAll('[data-observe]')];
const position=new THREE.Vector3();
const cameraOffset={front:[0,2.35,-5.5],side:[5.9,2.15,0],back:[0,2.35,5.5]};
const keys=new Set();
let axis='side', demo='idle', direction=-1, previous=0, gait=0, facing=0;
const clamp=THREE.MathUtils.clamp;

function setup(canvas,model) {
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xe5e3dc);
  scene.add(new THREE.HemisphereLight(0xf8f8ff,0x9f998b,2.1));
  const light=new THREE.DirectionalLight(0xfff6eb,2.4);
  light.position.set(-3,6,2);
  light.castShadow=true;
  light.shadow.mapSize.set(1024,1024);
  Object.assign(light.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:.1,far:20});
  light.shadow.normalBias=.015;
  scene.add(light);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:0xb8b6ad,roughness:1}));
  ground.rotation.x=-Math.PI/2;
  ground.position.y=-.015;
  ground.receiveShadow=true;
  scene.add(ground,new THREE.GridHelper(20,20,0x485750,0x899088),model);
  const marker=new THREE.Mesh(new THREE.PlaneGeometry(.04,10),new THREE.MeshBasicMaterial({color:0x486458}));
  marker.position.y=.002;
  marker.rotation.x=-Math.PI/2;
  scene.add(marker);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.shadowMap.enabled=true;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  return {renderer,camera:new THREE.PerspectiveCamera(41,1,.05,40),scene,canvas,model};
}

try {
  const newModel=await loadCommuter();
  const driver=new CommuterMotion(newModel);
  const old=legacyFigure();
  const limbs=old.children.filter(node=>node.isGroup);
  const views=[setup(document.querySelector('#motion-before'),old),
    setup(document.querySelector('#motion-after'),newModel)];
  function setDemo(mode) {
    demo=mode;
    for (const button of demoButtons) button.setAttribute('aria-pressed',button.dataset.demo===mode);
  }
  for (const button of demoButtons) button.onclick=()=>{ keys.clear(); setDemo(button.dataset.demo); };
  for (const button of viewButtons) button.onclick=()=>{
    axis=button.dataset.observe;
    for (const other of viewButtons) other.setAttribute('aria-pressed',other.dataset.observe===axis);
  };
  document.querySelector('#motion-focus').onclick=()=>stage.focus();
  stage.addEventListener('keydown',event=>{
    if (!['Shift','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    setDemo('idle');
    keys.add(event.key);
  });
  addEventListener('keyup',event=>keys.delete(event.key));
  stage.addEventListener('blur',()=>keys.clear());
  function frame(now) {
    const dt=previous?Math.min((now-previous)/1000,.05):0;
    previous=now;
    let dx=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
    let dz=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));
    if (demo!=='idle') {
      if (position.z<=-3.8) direction=1;
      else if (position.z>=3.8) direction=-1;
      dz=direction;
    }
    const length=Math.hypot(dx,dz);
    const running=keys.has('Shift')||demo==='run';
    const speed=running?movementSpeed.run:movementSpeed.walk;
    const px=position.x,pz=position.z;
    if (length) {
      position.x=clamp(px+dx*speed*dt/length,-4,4);
      position.z=clamp(pz+dz*speed*dt/length,-4,4);
      facing=Math.atan2(-dx,-dz);
    }
    const distance=Math.hypot(position.x-px,position.z-pz);
    newModel.position.copy(position);
    driver.advance(dt,{distance,speed:dt?distance/dt:0,yaw:facing,running});
    old.position.copy(position);
    old.rotation.y=facing;
    gait+=dt*(running?12:7);
    old.position.y=distance?Math.abs(Math.sin(gait))*.025:0;
    for (const [i,limb] of limbs.entries()) {
      limb.rotation.x=distance?Math.sin(gait+Math.floor(i/2)*Math.PI)*(i%2?-.4:.55):0;
    }
    const label=driver.state+' · '+(dt?distance/dt:0).toFixed(2)+' m/s';
    if (status.textContent!==label) status.textContent=label;
    for (const view of views) {
      const {canvas,camera,renderer,scene}=view;
      if (canvas.clientWidth && canvas.clientHeight) {
        camera.aspect=canvas.clientWidth/canvas.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);
        camera.position.set(...cameraOffset[axis]).add(position);
        camera.lookAt(position.x,.92,position.z);
        renderer.render(scene,camera);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch {
  status.textContent='이동 검토 모델을 불러오지 못했습니다. 로컬 서버와 WebGL을 확인해 주세요.';
}
