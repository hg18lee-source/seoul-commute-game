import * as T from '../dist/vendor/three.module.js';
import { CommuterMotion, loadCommuter, movementSpeed } from '../dist/hero/motion.js';
import { inReviewArea, cameraWall, walkHeight, buildStreet } from './scene.js';

const canvas=document.querySelector('#street');
const status=document.querySelector('#status');
const quality=document.querySelector('#quality');
const controls=[...document.querySelectorAll('[data-view]')];
const compare=document.querySelector('#comparison');
const title=document.querySelector('#render-title');
const keys=new Set();
const modes={
  match:{label:'고정 비교 카메라',camera:[1.85,1.64,8],target:[3.85,1.10,-15],fov:53},
  overview:{label:'차도 쪽에서 본 3D 장면',camera:[-11,6.3,5.6],target:[3.3,2.4,-25],fov:56},
  paving:{label:'보도 · 석판과 점자블록',camera:[2.53,1.48,-3.4],target:[5.0,.26,-8.7],fov:58},
  shops:{label:'상점 · 유리와 입면 단차',camera:[2.8,1.65,8.5],target:[8.3,1.95,-.5],fov:57},
  diner:{label:'분식점 · 식탁과 조리대',camera:[4.2,1.52,4.1],target:[9.6,1.46,5.25],fov:58},
  optics:{label:'안경점 · 안경과 발광 선반',camera:[4.5,1.54,-3.1],target:[9.8,1.39,-5.05],fov:56},
  entrance:{label:'역 입구 · 난간과 하강 계단',camera:[2.60,2.15,-4.8],target:[5.5,.58,-12.8],fov:57},
  passage:{label:'계단 하부 · 마감과 조명',camera:[5.29,.88,-11.0],target:[5.30,-.54,-15.9],fov:60},
  alley:{label:'주거 골목 · 현관과 배선',camera:[26.35,2.25,15.81],target:[11.2,1.28,15.1],fov:60},
  reverse:{label:'큰길 · 반대 방향',camera:[4.1,2.44,-34.4],target:[4.65,1.43,8],fov:53},
  tree:{label:'가로수 · 가지 구조와 잎의 그림자',camera:[-2.0,1.73,-16.4],target:[2.60,4.19,-21.7],fov:63},
};
const clamp=T.MathUtils.clamp;
const offset=new T.Vector3(0,3.1,4.85), look=new T.Vector3(0,1.15,-3.2);
let view='match', yaw=0, previous=0, dirty=true, cameraAzimuth=0;

// The game gait stays unchanged. Only this review retargets each ankle to its tread.
class StairMotion extends CommuterMotion {
  solveLeg(limb,x,y,z,pitch) {
    const position=this.model.position;
    if(position.x>4.14&&position.x<6.45&&position.z< -8.39&&position.z> -16.21){
      const c=Math.cos(this.yaw),s=Math.sin(this.yaw), soleZ=z-.037;
      const wx=position.x+x*c+soleZ*s,wz=position.z+soleZ*c-x*s;
      const correction=T.MathUtils.clamp(walkHeight(wx,wz,false)-position.y,-.30,.30);
      y+=correction;
    }
    super.solveLeg(limb,x,y,z,pitch);
  }
}

function clonePedestrian(source,cloth,pants) {
  const copy=source.clone(true);
  const pairs=new Map();
  const traverse=(a,b)=>{
    pairs.set(a,b);
    a.children.forEach((object,i)=>traverse(object,b.children[i]));
  };
  traverse(source,copy);
  source.traverse(a=>{
    if(!a.isSkinnedMesh)return;
    const b=pairs.get(a);
    b.bind(new T.Skeleton(a.skeleton.bones.map(bone=>pairs.get(bone)),a.skeleton.boneInverses),a.bindMatrix);
    const tint=a.material.name.includes('Navy')?cloth:
      a.material.name==='Trousers'?pants:null;
    if(tint!==null) {
      b.material=a.material.clone();
      b.material.color.setHex(tint);
    }
    b.castShadow=false;
  });
  return copy;
}

async function init(){
  for(const button of controls)button.disabled=true;
  try {
    const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    const scene=new T.Scene();
    const player=await loadCommuter();
    const driver=new StairMotion(player);
    player.traverse(mesh=>{if(mesh.isMesh)mesh.castShadow=false;});
    const mask=document.createElement('canvas');
    mask.width=mask.height=64;
    const brush=mask.getContext('2d');
    const gradient=brush.createRadialGradient(32,32,3,32,32,31);
    gradient.addColorStop(0,'rgba(26,31,34,.36)');
    gradient.addColorStop(1,'rgba(26,31,34,0)');
    brush.fillStyle=gradient;brush.fillRect(0,0,64,64);
    const shadowMap=new T.CanvasTexture(mask);
    const shadowMaterial=new T.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false});
    const shadowGeometry=new T.PlaneGeometry(1.04,1.31);
    function contact(x,z){
      const mark=new T.Mesh(shadowGeometry,shadowMaterial);
      mark.rotation.x=-Math.PI/2;
      mark.position.set(x,.013,z);
      scene.add(mark);
      return mark;
    }
    const playerContact=contact(0,0);
    const camera=new T.PerspectiveCamera(53,1,.085,185);
    renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.toneMapping=T.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.05;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=T.PCFSoftShadowMap;
    const {root,sun,setDetail,landingLight}=buildStreet(renderer,scene);
    const extras=[];
    for(const [x,z,angle,cloth,pants,scale] of [
      [2.35,-10.8,.15,0x817c6d,0x777673,.99],[2.0,-13.3,2.55,0x666b62,0x47484c,.91],
      [7.44,-11.6,-1.55,0x858c93,0x45464d,.97],
      [-17.32,-15.3,2.91,0x647785,0x4b4c47,1.01],
    ]) {
      const pedestrian=clonePedestrian(player,cloth,pants);
      const pose=new CommuterMotion(pedestrian);
      pose.reset(angle);
      if(x<0)pose.advance(.17,{distance:.28,speed:1.65,yaw:angle});
      else if(x>7){
        const [arm]=pose.limbs;
        arm.arm.rotation.x=-.24;
        arm.forearm.rotation.x=.98;
        const phone=new T.Mesh(new T.BoxGeometry(.066,.134,.013),
          new T.MeshStandardMaterial({color:0x273131,roughness:.48}));
        phone.position.set(.012,-.078,-.032);
        phone.rotation.x=-.48;
        arm.hand.add(phone);
        pose.head.rotation.x=.16;
      }
      pedestrian.position.set(x,0,z);pedestrian.scale.setScalar(scale);
      scene.add(pedestrian);
      const mark=contact(x,z);
      if(extras.length||x<0)extras.push(pedestrian,mark);
    }
    scene.add(player);
    function fit(){
      const w=canvas.clientWidth,h=canvas.clientHeight;
      camera.aspect=w/h;
      camera.updateProjectionMatrix();
      renderer.setSize(w,h,false);dirty=true;
    }
    function setQuality(){
      const high=quality.value==='detail';
      renderer.setPixelRatio(Math.min(devicePixelRatio,high?1.5:.85));
      setDetail(high);
      for(const object of extras)object.visible=high;
      sun.shadow.mapSize.setScalar(high?2048:1024);
      sun.shadow.needsUpdate=true;
      if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}
      scene.environmentIntensity=high?.59:.48;
      fit();
    }
    const observer=new ResizeObserver(fit);
    observer.observe(canvas);
    quality.onchange=setQuality;
    function select(next){
      view=next;
      const play=view==='play';
      compare.classList.toggle('single',view!=='match');
      for(const btn of controls)btn.setAttribute('aria-pressed',btn.dataset.view===next);
      keys.clear();
      cameraAzimuth=play?Math.PI*.5:0;
      yaw=play?cameraAzimuth:-2.08;
      driver.reset(yaw);
      player.position.set(play?24.8:6.25,0,play?15.10:2.40);
      if(play){
        camera.fov=48;
        targetCamera(camera.position);
        aimCamera();
        canvas.focus();
      } else {
        const preset=modes[view];
        camera.fov=preset.fov;
        camera.position.set(...preset.camera);
        camera.lookAt(...preset.target);
      }
      landingLight.visible=view==='passage';
      player.visible=play||view==='match'||view==='overview';
      title.textContent=play?'3D 재구성 · 고정 각도 추적 카메라':'3D 재구성 · '+modes[view].label;
      fit();
    }
    for(const button of controls) {
      button.disabled=false;
      button.onclick=()=>select(button.dataset.view);
    }
    canvas.addEventListener('keydown',event=>{
      if(view!=='play'||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Shift'].includes(event.key))return;
      event.preventDefault();keys.add(event.key);
    });
    addEventListener('keyup',event=>keys.delete(event.key));
    canvas.addEventListener('blur',()=>keys.clear());
    addEventListener('blur',()=>keys.clear());
    const cameraPosition=new T.Vector3(), focus=new T.Vector3();
    const yAxis=new T.Vector3(0,1,0), rotatedOffset=new T.Vector3();
    function aimCamera(){
      focus.copy(look).sub(offset).applyAxisAngle(yAxis,cameraAzimuth).add(camera.position);
      camera.lookAt(focus);
    }
    function step(dt){
      const dx=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
      const dz=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));
      const len=Math.hypot(dx,dz),running=keys.has('Shift');
      let distance=0;
      if(len){
        const speed=running?movementSpeed.run:movementSpeed.walk;
        const {x,z}=player.position;
        const c=Math.cos(cameraAzimuth),s=Math.sin(cameraAzimuth);
        const mx=(dx*c+dz*s)/len,mz=(dz*c-dx*s)/len;
        const px=x+dt*speed*mx,pz=z+dt*speed*mz;
        if(inReviewArea(px,z))player.position.x=px;
        if(inReviewArea(player.position.x,pz))player.position.z=pz;
        distance=Math.hypot(player.position.x-x,player.position.z-z);
        yaw=Math.atan2(-mx,-mz);
      }
      const y=walkHeight(player.position.x,player.position.z);
      player.position.y=T.MathUtils.lerp(player.position.y,y,1-Math.exp(-32*dt));
      driver.advance(dt,{distance,speed:dt?distance/dt:0,yaw,running});
    }
    function targetCamera(output){
      let fraction=T.MathUtils.lerp(1,.48,T.MathUtils.smoothstep(-player.position.y,.10,1.22));
      rotatedOffset.copy(offset).applyAxisAngle(yAxis,cameraAzimuth);
      for(let ratio=.16;ratio<=1.01;ratio+=.06){
        if(cameraWall(player.position.x+rotatedOffset.x*ratio,player.position.z+rotatedOffset.z*ratio)){
          fraction=Math.min(fraction,Math.max(.28,ratio-.08));break;
        }
      }
      output.copy(player.position).addScaledVector(rotatedOffset,fraction);
    }
    function frame(now) {
      const dt=previous?clamp((now-previous)/1000,0,.12):0;
      previous=now;
      if(view==='play'){
        const count=Math.max(1,Math.ceil(dt/.025));
        for(let i=0;i<count;i++)step(dt/count);
        const angle=T.MathUtils.smoothstep(player.position.x,5.4,7.85)*Math.PI*.5;
        cameraAzimuth=Math.abs(cameraAzimuth-angle)<.00008?angle:
          T.MathUtils.lerp(cameraAzimuth,angle,1-Math.exp(-5.0*dt));
        landingLight.visible=player.position.y<-.15;
        targetCamera(cameraPosition);
        if(cameraWall(camera.position.x,camera.position.z))camera.position.copy(cameraPosition);
        else camera.position.lerp(cameraPosition,1-Math.exp(-8*dt));
        // Follow position without rotating the offset with the player's heading.
        aimCamera();
        dirty=true;
      }
      if(dirty){
        playerContact.visible=player.visible;
        playerContact.position.x=player.position.x+.12;
        playerContact.position.z=player.position.z+.07;
        playerContact.position.y=walkHeight(player.position.x,player.position.z)+.013;
        renderer.render(scene,camera);
        dirty=false;
      }
      requestAnimationFrame(frame);
    }
    document.querySelector('#hide-signs').onchange=event=>{
      root.traverse(obj=>{if(obj.userData.shopSign)obj.visible=!event.target.checked;});
      dirty=true;
    };
    setQuality();
    select('match');
    status.hidden=true;
    document.body.dataset.scene='ready';
    requestAnimationFrame(frame);
  } catch(error) {
    console.error('Review scene failed',error);
    status.textContent='3D 거리를 불러오지 못했습니다. 로컬 HTTP 서버와 WebGL 2 지원을 확인해 주세요.';
    document.body.dataset.scene='failed';
  }
}
init();
