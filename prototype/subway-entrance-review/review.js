import * as T from '../dist/vendor/three.module.js';
import { CommuterMotion, loadCommuter, movementSpeed } from '../dist/hero/motion.js';
import { constrainEntranceCamera, insideEntrance, loadEntrance, worldX, worldZ } from './entrance.js';

const params = new URLSearchParams(location.search);
const baseline = params.has('baseline');
const verify = params.has('verify');
const { inReviewArea, cameraWall, walkHeight, buildStreet } =
  await import(baseline ? '../street-realism-v5-review/scene.js' : './scene.js');

const canvas=document.querySelector('#street');
const status=document.querySelector('#status');
const quality=document.querySelector('#quality');
const controls=[...document.querySelectorAll('[data-view]')];
const title=document.querySelector('#render-title');
const keys=new Set();
const modes={
  entrance:{label:'역 입구 · 난간과 하강 계단',camera:[2.60,2.15,-4.8],target:[5.5,.58,-12.8],fov:57},
  front:{label:'새 입구 · 정면',camera:[5.25,1.72,-5.32],target:[5.25,1.47,-11.5],fov:58},
  side:{label:'새 입구 · 차도 쪽 측면',camera:[-.9,2.35,-12.4],target:[5.25,1.30,-11.5],fov:56},
  rear:{label:'새 입구 · 후면',camera:[2.53,2.38,-18.90],target:[5.25,1.37,-11.9],fov:58},
  stairs:{label:'새 입구 · 에스컬레이터 단',camera:[worldX(1.05),1.87,worldZ(2.18)],target:[worldX(1.08),-2.1,worldZ(-4.0)],fov:60},
  passage:{label:'계단 하부 · 마감과 조명',camera:[worldX(1.2),-2.33,worldZ(-7.26)],target:[5.25,-2.99,worldZ(-9.8)],fov:65},
};
const clamp=T.MathUtils.clamp;
const offset=new T.Vector3(0,3.1,4.85), look=new T.Vector3(0,1.15,-3.2);
let view='play', yaw=0, previous=0, dirty=true, cameraAzimuth=0;

// The game gait stays unchanged. Only this review retargets each ankle to its tread.
class StairMotion extends CommuterMotion {
  solveLeg(limb,x,y,z,pitch) {
    const position=this.model.position;
    if(!baseline&&insideEntrance(position.x,position.z)){
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
    const [player,model]=await Promise.all([loadCommuter(),baseline?null:loadEntrance()]);
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
    const {root,sun,setDetail,landingLight}=buildStreet(renderer,scene,model);
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
      for(const btn of controls)btn.setAttribute('aria-pressed',btn.dataset.view===next);
      keys.clear();
      cameraAzimuth=play?Math.PI*.5:0;
      yaw=play?cameraAzimuth:-2.08;
      driver.reset(yaw);
      player.position.set(24.8,0,15.10);
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
      landingLight.visible=view==='passage'||view==='stairs';
      player.visible=play;
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
    document.addEventListener('visibilitychange',()=>{if(document.hidden)keys.clear();});
    canvas.addEventListener('blur',()=>keys.clear());
    addEventListener('blur',()=>keys.clear());
    const cameraPosition=new T.Vector3(), focus=new T.Vector3(), closeFocus=new T.Vector3();
    const yAxis=new T.Vector3(0,1,0), rotatedOffset=new T.Vector3();
    function aimCamera(){
      focus.copy(look).sub(offset).applyAxisAngle(yAxis,cameraAzimuth).add(camera.position);
      if (!baseline) {
        closeFocus.set(player.position.x,player.position.y+.75,player.position.z-.38);
        focus.lerp(closeFocus,stationProximity());
      }
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
    function stationProximity(){
      return T.MathUtils.smoothstep(worldZ(7)-player.position.z,0,2.7)
        * (1-T.MathUtils.smoothstep(Math.abs(player.position.x-5.25),1.5,2.0));
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
      if (!baseline) {
        const close=stationProximity();
        const fov=T.MathUtils.lerp(48,66,close);
        if (camera.fov!==fov) {
          camera.fov=fov;
          camera.updateProjectionMatrix();
        }
        output.x=T.MathUtils.lerp(output.x,player.position.x,close);
        output.z=T.MathUtils.lerp(output.z,player.position.z+1.58,close);
        output.y=T.MathUtils.lerp(output.y,player.position.y+1.48,close);
        constrainEntranceCamera(output,player.position);
      }
    }
    let sample=null;
    let recording=null;
    const gl=renderer.getContext();
    if (verify) {
      window.reviewVerification={
        get position(){return player.position.toArray();},
        get camera(){return camera.position.toArray();},
        get keys(){return [...keys];},
        get stats(){return {...renderer.info.render,width:canvas.width,height:canvas.height};},
        measure(){sample=[];},
        get frames(){return sample?.slice(16);},
        get renderer(){
          const info=gl.getExtension('WEBGL_debug_renderer_info');
          return info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
        },
        startRecording(){
          const stream=canvas.captureStream(24);
          const recorder=new MediaRecorder(stream);
          const chunks=[];
          const result=new Promise(resolve=>{
            recorder.onstop=()=>{
              stream.getTracks().forEach(track=>track.stop());
              const reader=new FileReader();
              reader.onload=()=>resolve(reader.result);
              reader.readAsDataURL(new Blob(chunks,{type:recorder.mimeType}));
            };
          });
          recorder.ondataavailable=event=>chunks.push(event.data);
          recorder.start();
          recording={recorder,result};
        },
        stopRecording(){recording.recorder.stop();return recording.result;},
      };
    }
    function frame(now) {
      if(sample&&previous)sample.push(now-previous);
      const dt=previous?clamp((now-previous)/1000,0,.12):0;
      previous=now;
      if(view==='play'){
        const count=Math.max(1,Math.ceil(dt/.025));
        for(let i=0;i<count;i++)step(dt/count);
        const alleyBlend=T.MathUtils.smoothstep(player.position.z,10.9,13.0);
        const angle=T.MathUtils.smoothstep(player.position.x,5.4,7.85)*alleyBlend*Math.PI*.5;
        cameraAzimuth=Math.abs(cameraAzimuth-angle)<.00008?angle:
          T.MathUtils.lerp(cameraAzimuth,angle,1-Math.exp(-5.0*dt));
        landingLight.visible=player.position.z<worldZ(.30)&&player.position.z>worldZ(-11);
        targetCamera(cameraPosition);
        if(cameraWall(camera.position.x,camera.position.z)||(!baseline&&insideEntrance(player.position.x,player.position.z)))camera.position.copy(cameraPosition);
        else camera.position.lerp(cameraPosition,1-Math.exp(-8*dt));
        // Follow position without rotating the offset with the player's heading.
        aimCamera();
        dirty=true;
      }
      if(dirty||sample){
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
    const requestedView=params.get('view');
    select(Object.hasOwn(modes,requestedView)?requestedView:baseline?'entrance':'play');
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
