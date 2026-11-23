import * as THREE from './vendor/three.module.js';
import { CommuterMotion } from "./hero/motion.js";
import { createNpc, moveNpc } from './hero/npc.js';
import { entranceHeight, entranceBlocked, gateZ, placeGate } from './transit-scene.js';
import { populateGongdeok } from "./gongdeok-street.js";
import { BUS_COURSE, CHECKPOINTS, COURSE } from './journey.js';

const C={pavement:0xd8d2bb,road:0x7d8881,cream:0xe8e5ce,ink:0x294b43,green:0x527f56,glass:0x628183,wood:0x9c7953};
const mats=new Map();
function mat(color,extra={}){const k=color+JSON.stringify(extra);if(!mats.has(k))mats.set(k,new THREE.MeshStandardMaterial({color,roughness:.88,...extra}));return mats.get(k);}
function cube(parent,w,h,d,color,x,y,z,extra={}){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color,extra));m.position.set(x,y,z);m.castShadow=h>1;m.receiveShadow=true;parent.add(m);return m;}
function cylinder(parent,r,h,color,x,y,z,sides=8){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,sides),mat(color));m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
const signCache=new Map();
function sign(parent,text,w,h,x,y,z,bg='#214f43',fg='#fff9e9',size=52){const key=[text,w,h,bg,fg,size].join('|');let material=signCache.get(key);if(!material){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.max(128,Math.round(1024*h/w));const c=canvas.getContext('2d');c.fillStyle=bg;c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';c.font=`700 ${Math.min(canvas.height*.54,1024/Math.max(text.length,3)*1.5)}px Arial,Malgun Gothic,sans-serif`;c.fillText(text,512,canvas.height/2,980);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;material=new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide});signCache.set(key,material);}const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);m.position.set(x,y,z);parent.add(m);return m;}
function tree(parent,x,z){cylinder(parent,.16,3.5,0x8a7253,x,1.75,z);for(let i=0;i<3;i++){const leaves=new THREE.Mesh(new THREE.IcosahedronGeometry(1.65-i*.15,0),mat([0x819552,0x728b4d,0x9ba15e][i]));leaves.position.set(x+(i-1)*.55,3.7+i*.4,z+(i%2)*.3);leaves.castShadow=true;parent.add(leaves);}cube(parent,2.2,.32,2.2,0xbcc3a4,x,.16,z);}
function bench(parent,x,z){cube(parent,2.2,.15,.65,C.wood,x,.6,z);cube(parent,2.2,.6,.1,C.wood,x,1,z+.3);for(const s of [-1,1])cube(parent,.1,.55,.5,C.ink,x+s*.8,.3,z);}

export class World{
 constructor(canvas,heroModel,{signal}={}){this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.14;this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xdbe5d7);this.scene.fog=new THREE.Fog(0xdbe5d7,38,145);this.camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,230);this.scene.add(new THREE.HemisphereLight(0xfff7df,0x889c7d,2.1));this.sun=new THREE.DirectionalLight(0xfff1cd,3);this.sun.position.set(-28,45,16);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{left:-45,right:45,top:45,bottom:-45,near:1,far:110});this.sun.shadow.bias=-.0008;this.scene.add(this.sun);this.root=new THREE.Group();this.scene.add(this.root);this.hero=new THREE.Group();this.hero.add(heroModel);this.heroModel=heroModel;this.scene.add(this.hero);this.heroAnimator=new CommuterMotion(heroModel);this.moveOrigin=new THREE.Vector2();this.desiredYaw=0;this.commandedSpeed=0;this.transit={};this.npcs=[];this.spots=[];this.mode='street';this.bounds={minX:-8,maxX:8,minZ:-51,maxZ:35};this.intro=true;this.portal=null;this.vehicleRoot=null;this.streetBus=null;this.platformTrains=[];this.cityMotion=[];this.resize();addEventListener('resize',()=>this.resize(),{signal});}
 resize(){this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);}
 clear(){this.scene.remove(this.root);const npcMaterials=new Set(),npcSkeletons=new Set();this.root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry&&!o.userData.sharedGeometry)o.geometry.dispose();if(o.isSkinnedMesh&&o.skeleton)npcSkeletons.add(o.skeleton);for(const material of Array.isArray(o.material)?o.material:[o.material])if(material?.userData.npcOwned)npcMaterials.add(material);});for(const skeleton of npcSkeletons)skeleton.dispose();for(const material of npcMaterials)material.dispose();this.root=new THREE.Group();this.scene.add(this.root);this.npcs=[];this.spots=[];this.portal=null;this.vehicleRoot=null;this.streetBus=null;this.platformTrains=[];this.cityMotion=[];this.gate=null;this.traffic=null;}
 floor(w,d,color=C.pavement){cube(this.root,w,.2,d,color,0,-.12,0);}
 spot(id,label,x,z,meta={}){const marked=meta.boarding||meta.alighting,ring=new THREE.Mesh(new THREE.RingGeometry(marked?1.05:.62,marked?1.28:.72,40),new THREE.MeshBasicMaterial({color:marked?0xffd334:0xa6e5b0,transparent:true,opacity:.95,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(x,marked&&this.mode==='platform'?.335:.025,z);this.root.add(ring);const spot={id,label,x,z,ring,...meta};this.spots.push(spot);if(marked){const height=this.mode==='platform'?1.65:.75,y=height/2+.04,text=meta.boarding?'탑승 위치':this.mode==='vehicle'?'하차 위치':'하차 후 전진';sign(this.root,text,2.8,.64,x,this.mode==='platform'?2.75:1.9,z-1.15,'#e6b820','#172f2b');const beacon=cylinder(this.root,.09,height,0xffd334,x,y,z-.72,12);beacon.material=mat(0xffd334,{emissive:0xffb900,emissiveIntensity:1.8,roughness:.35});spot.beacon=beacon;}return spot;}
 people(count,area={x:7,z:45,offset:0}){for(let i=0;i<count;i++){const npc=createNpc(this.heroModel,i),x=Math.sin(i*9.27)*area.x,z=(i/count-.5)*area.z+area.offset,spacing=area.z/count,roam=Math.min(7.8,spacing*.38*(area.roamMultiplier??1));npc.g.position.set(x,0,z);npc.baseX=x;npc.baseZ=z;npc.minZ=Math.max(area.offset-area.z/2,z-roam);npc.maxZ=Math.min(area.offset+area.z/2,z+roam);this.root.add(npc.g);this.npcs.push(npc);}}
 setStage(mode,data={}){this.clear();this.mode=mode;this.intro=!!data.intro;this.scene.background.set(mode==='hall'||mode==='exit-hall'||mode==='platform'?0xd2d7c7:0xdbe5d7);this.scene.fog.color.copy(this.scene.background);this.hero.visible=true;this.hero.rotation.y=0;this.desiredYaw=0;this.heroAnimator.reset();if(mode==='street'){if(data.legacyStreet)this.street(data);else populateGongdeok(this);}if(mode==='hall'||mode==='exit-hall')this.hall(data);if(mode==='platform')this.platform(data);if(mode==='vehicle')this.vehicle(data);if(mode==='office'||mode==='exit-street')this.office(data);this.hero.position.set(data.spawnX??0,mode==='platform'?.3:0,data.spawnZ??(mode==='street'?22:mode==='hall'||mode==='exit-hall'?14:mode==='platform'?8:mode==='vehicle'?5:22));this.camera.position.copy(this.hero.position).add(new THREE.Vector3(0,5.3,9));this.camera.lookAt(this.hero.position.x,1,this.hero.position.z-3);}
 street(data){this.floor(250,260,0xb8c2a5);cube(this.root,22,.16,150,C.pavement,0,-.01,-15);cube(this.root,17,.1,160,C.road,20,-.03,-15);for(let i=0;i<30;i++){cube(this.root,22,.015,.035,0xb8bca9,0,.08,38-i*4);cube(this.root,.35,.02,2.7,0xe9d6a2,5,.085,38-i*4);}for(let i=0;i<18;i++){cube(this.root,.12,.025,3.5,0xe5dba6,19,.04,35-i*8);cube(this.root,.12,.025,3.5,0xe5dba6,20,.04,35-i*8);}for(const side of [-1,1])for(let i=0;i<11;i++){const z=28-i*15,w=8+(i%3)*2,h=8+(i*7%5)*5,x=side<0?-19:39;const color=[0xc3c6b4,0xd8d2be,0xb8c8c0,0xd2c8b4,0xacbbb3][i%5];cube(this.root,w,h,12,color,x,h/2,z);cube(this.root,w+.3,.25,12.3,0x9baa9d,x,h,z);for(let yy=3;yy<h-1;yy+=3)for(let xx=-w/2+1;xx<w/2;xx+=2)cube(this.root,1.1,1.8,.08,C.glass,x+xx,yy,z+6.05,{metalness:.2,roughness:.4});if(side<0&&i<6){const names=['서울커피','오늘의 빵','편의점','아침식당','책방 공덕','꽃, 오늘'];sign(this.root,names[i],7.5,.85,x,2.7,z+6.16,i%2?'#4a695c':'#8b765b');cube(this.root,7.5,2.3,.1,0x798a7d,x,1.3,z+6.1);}}for(let i=0;i<8;i++){tree(this.root,9,23-i*14);cylinder(this.root,.065,5.5,C.ink,12,2.75,23-i*14);cube(this.root,1.6,.12,.35,C.ink,11.3,5.5,23-i*14);}bench(this.root,-8,-2);bench(this.root,8,-29);this.stationEntrance(data.station||'공덕',data.line||'5');this.streetBus=this.busModel(12,-42);this.busShelter(8,-42);this.spot('station','역으로 들어가기',-5,-24);this.spot('bus','버스 정류장에서 기다리기',7,-42);this.bounds={minX:-10,maxX:10,minZ:-48,maxZ:32};this.people(14,{x:7,z:76,offset:-5,roamMultiplier:3});const distant=cube(this.root,2,27,2,0xb4c3ba,-2,13.5,-110);cylinder(this.root,.35,10,0x8ea899,-2,32,-110);sign(this.root,'서울의 아침',4,1,-5,2.3,26,'#527260');}
 stationEntrance(name,line){cube(this.root,5.8,2.7,4.5,0xb8beb0,-5,1.25,-26);cube(this.root,4.9,2.3,.12,0x3e5648,-5,1.12,-23.7);for(const s of [-1,1])cube(this.root,.28,3,4.8,0xe2ddc8,-5+s*2.8,1.5,-25.6);cube(this.root,6.3,.25,5,0x9ca79b,-5,2.9,-25.8);sign(this.root,`${line}   ${name}역  ↙`,5.6,.75,-5,2.65,-23.3,'#31594e');for(let i=0;i<6;i++)cube(this.root,4.3,.1,1.3,0x8a9686,-5,.07-i*.05,-23.9-i*.15);}
 busShelter(x,z){cube(this.root,3.4,.15,5.8,C.ink,x,3,z);for(const s of [-1,1])cube(this.root,.1,3,.1,C.ink,x+s*1.5,1.5,z+2.5);cube(this.root,3,2,.08,0x9bad99,x,1.65,z-2.5);sign(this.root,'BUS   7016',2.8,.6,x,2.5,z+2.6,'#3b684c');bench(this.root,x,z-1.5);cylinder(this.root,.08,3.4,C.ink,x-2,1.7,z+1);sign(this.root,'7016  광화문 방면',2.2,.8,x-2,2.6,z+1,'#edf0d8','#3b5c43');}
 busModel(x,z){const g=new THREE.Group();this.root.add(g);g.position.set(x,0,z);cube(g,2.7,2.7,9,0x5e9955,0,1.7,0);cube(g,2.6,.28,8.8,0xe8ead7,0,3.12,0);cube(g,2.45,1.13,.08,0x2c4743,0,2.2,4.55);sign(g,'7016',1.6,.45,0,2.94,4.61,'#263d33','#cbef9f');for(const s of [-1,1])for(let i=0;i<5;i++)cube(g,.06,1,1.05,0x2e4c46,s*1.37,2.27,3-i*1.45);for(const s of [-1,1])for(const zz of [-2.8,2.8]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.25,12),mat(0x26362e));wheel.rotation.z=Math.PI/2;wheel.position.set(s*1.38,.5,zz);g.add(wheel);}for(const s of [-1,1])cube(g,.4,.16,.1,0xf1e8ba,s*.8,1.1,4.6);return g;}
 hall(data){
  this.floor(24,52,0xc8c4b6);
  const accent=data.line==='2'?0x347147:0x614d82;
  for(const x of [-7,7]) {
    cube(this.root,.30,3.3,27,0xddd6c5,x,1.65,7);
    cube(this.root,.36,.42,27,accent,x,1.83,7);
    cube(this.root,.39,.21,27,0x505a54,x,.12,7);
    for(let z=-4;z<=19;z+=4){
      cube(this.root,.56,3.2,.42,0xaba695,x,1.60,z);
      cube(this.root,.24,.07,1.80,0xeaf2e7,x*.74,3.28,z,{emissive:0xd6daca,emissiveIntensity:.45});
    }
  }
  for(let z=-5;z<21;z+=1.45)cube(this.root,14,.018,.024,0xa5a699,0,.006,z);
  for(const x of [-.98,.98])cube(this.root,.13,.02,14,0xceb778,x,.009,9);
  sign(this.root,data.station+'역  /  '+data.line+'호선',5.5,.62,0,2.95,.60,'#38474e');
  sign(this.root,'교통카드  ·  승강장 ↓',4.9,.61,0,2.18,3.03,'#364a43');
  for(const x of [-3.82,3.82]) {
    cube(this.root,6.1,1.10,.27,0x6f7b79,x,.55,gateZ,{roughness:.46,metalness:.25});
    cube(this.root,6.1,.20,.18,0xa7b9b6,x,1.18,gateZ,{transparent:true,opacity:.46});
  }
  const paintGate=placeGate(this.transit.gate,this.root);
  paintGate(0);
  this.gate={startedAt:null,open:false,paint:paintGate};
  this.spot('gate','교통카드 찍기',0,4.69);
  this.bounds={minX:-6.72,maxX:6.72,minZ:1,maxZ:19};
 }
 openGate(time){
  if(this.gate&&this.gate.startedAt===null)this.gate.startedAt=time;
 }
 gateTick(time){
  if(!this.gate||this.gate.startedAt===null)return;
  const fraction=THREE.MathUtils.smoothstep(time-this.gate.startedAt,0,.48);
  this.gate.paint(fraction);
  this.gate.open=fraction===1;
 }
 blocked(x,z){
  if(this.mode==='street'){
    if(z<-39.55&&z>-45.4&&x>9.82)return true;
    if(this.transit.entrance&&entranceBlocked(x,z))return true;
  }
  if((this.mode==='hall'||this.mode==='exit-hall')&&z>gateZ-1.22&&z<gateZ+1.22)
    return !this.gate?.open||Math.abs(x)>.44;
  return false;
 }
 platform(data){this.floor(30,70,0x666e69);
 for(const x of [-11,11]){
  cube(this.root,.32,3.8,65,0xd1cac0,x,1.90,0);
  cube(this.root,.36,.40,65,data.line==='2'?0x4a815a:0x745792,x,1.75,0);
 }
 for(let z=-26;z<=27;z+=6.5){
  cube(this.root,7.8,.12,.54,0x959991,0,3.43,z);
  cube(this.root,5.2,.075,.22,0xe9efdf,0,3.35,z,{emissive:0xebefdf,emissiveIntensity:.64});
 }
 cube(this.root,10,.4,65,0xd4d2b9,0,.1,0);for(const s of [-1,1]){cube(this.root,.32,.02,62,0xe6cb66,s*4.6,.32,0);cube(this.root,1,.2,68,0x4e5e51,s*9,-.1,0);for(let i=0;i<11;i++)cube(this.root,2.3,.12,.15,0x35463b,s*9,-.02,-30+i*6);const train=new THREE.Group();this.root.add(train);train.position.x=s*9;this.platformTrains.push(train);cube(train,5,3.6,58,0xe2e4d7,0,1.6,-3);cube(train,5.05,.22,58,Number(data.line)===5?0x9274b1:0x679156,0,1.1,-3);for(let i=0;i<11;i++){cube(train,.05,1,2.3,0x5a7870,-s*2.53,2,-28+i*5);cube(train,.06,2.4,1.2,0x859d86,-s*2.54,1.4,-25+i*5);}const neighbor=data.neighbors?.[s===-1?0:1]||'다음 역';sign(this.root,`${s===-1?'←':'→'}  ${neighbor} 방면`,6,.8,s*5.4,3.7,-3,Number(data.line)===5?'#80679b':'#497a50');if(s===COURSE.direction)this.spot('train-board','노란 표시에서 탑승',CHECKPOINTS.trainBoard.platform.x,CHECKPOINTS.trainBoard.platform.z,{direction:s,boarding:true});else this.spot(s===-1?'train-left':'train-right',`${neighbor} 방면 탑승`,s*4,0,{direction:s});}for(let i=0;i<5;i++){cube(this.root,.6,6,.6,0xc9cbb7,0,3,-24+i*13);sign(this.root,`${data.station}   ${data.line}`,2,.55,0,2.3,-23.65+i*13,'#e7e8d5','#45634a');}bench(this.root,1,17);sign(this.root,`${data.station}역`,5,1,0,4,13,'#4c7152');this.spot('exit','역 출구',0,CHECKPOINTS.stationExit.platform.z,data.station===COURSE.destination?{alighting:true}:{});if(data.station===COURSE.destination)this.spot('platform-alight','하차 위치',0,CHECKPOINTS.trainAlight.platform.z,{alighting:true});this.bounds={minX:-4.45,maxX:4.45,minZ:-25,maxZ:25};this.people(7,{x:3.6,z:35,offset:-3,roamMultiplier:3});}
 vehicle(data){const isBus=data.type==='bus';this.floor(isBus?5:6,30,0xa6b09a);for(const x of [-3.1,3.1]){cube(this.root,.12,.85,30,0xe5e3ce,x,.4,0);for(let i=0;i<8;i++){cube(this.root,.1,1.5,.12,0x899e89,x,1.6,-13+i*3.7);cube(this.root,.12,.12,3.7,0xc4cbb6,x,2.5,-13+i*3.7);}}for(let i=0;i<7;i++)for(const side of [-1,1]){const z=-10+i*3.2;cube(this.root,.9,.3,.95,isBus?0x729683:0x8597ab,side*1.45,.46,z);cube(this.root,.16,.78,.95,isBus?0x658773:0x7b899b,side*1.94,.96,z);this.spot(`seat-${side}-${i}`,'좌석에 앉기',side*1.45,z,{seat:true,side,seatX:side*1.45,seatYaw:side===1?Math.PI/2:-Math.PI/2});}for(let z=-10;z<=10;z+=5)cylinder(this.root,.035,2.7,0xbecab4,.7,1.35,z);cube(this.root,.05,.05,26,0xc4d0be,.7,2.6,0);for(let z=-10;z<=10;z+=2.5){const ring=new THREE.Mesh(new THREE.TorusGeometry(.13,.023,6,12),mat(0xe8ebd4));ring.position.set(.7,1.78,z);this.root.add(ring);cube(this.root,.025,.72,.025,0xd5d7c7,.7,2.24,z);}this.vehicleSignLine=isBus?'7016':`${data.line}호선`;this.vehicleSignColor=isBus?'#385c48':'#4a6c51';this.vehicleSignText='';this.vehicleSign=null;this.setVehicleDestination('다음 '+(data.next||'다음 역'));this.spot('alight','열린 문으로 하차',0,-10.9,{alighting:true});if(isBus){cube(this.root,.3,.4,.12,0xd85c45,1.4,1.3,-5);sign(this.root,'STOP',.5,.25,1.4,1.7,-4.9,'#a94e3e');this.spot('bell','하차 벨 누르기',1.1,-5);}for(let i=0;i<10;i++){const g=new THREE.Group();g.position.set(i%2?-10:10,0,-30+i*9);this.root.add(g);cube(g,5,12+i%3*5,6,[0xbac6ad,0xd0ceb5,0x9db8ac][i%3],0,6,0);tree(g,2,3);this.cityMotion.push(g);}this.bounds={minX:-1.9,maxX:1.9,minZ:-11,maxZ:11};this.people(isBus?5:7,{x:1.3,z:19,offset:0});if(!isBus){this.npcs.forEach((npc,i)=>{npc.stationary=true;if(i<3){npc.sitting=true;const side=i===1?1:-1,z=[-6.8,-3.6,2.8][i];npc.g.position.set(side*1.45,0,z);npc.animator.reset(side===1?Math.PI/2:-Math.PI/2);}else npc.g.position.set((i%2?-.45:.45),0,-2+i*2);});}}
 office(data){this.street({station:data.station,line:'2'});this.spots=this.spots.filter(s=>{s.ring.visible=false;return false;});cube(this.root,16,22,9,0xb6c6bc,0,11,-33);cube(this.root,12,16,.1,0x668781,0,12,-28.4,{roughness:.4,metalness:.15});for(let x=-5;x<=5;x+=2)cube(this.root,.08,16,.15,0xd7ddcc,x,12,-28.25);cube(this.root,4,4,.1,0x294c41,0,2,-28.2);sign(this.root,'SEOUL WORKS',9,1,0,5.2,-28,'#d4ddca','#3d6651');const g=new THREE.Group();g.position.set(0,1.7,-26);const ring=new THREE.Mesh(new THREE.TorusGeometry(1.2,.1,7,36),new THREE.MeshStandardMaterial({color:0xef655a,emissive:0xdc483f,emissiveIntensity:1.5,roughness:.5}));ring.scale.y=1.35;g.add(ring);const fill=new THREE.Mesh(new THREE.CircleGeometry(1.1,32),new THREE.MeshBasicMaterial({color:0xf17466,transparent:true,opacity:.25,side:THREE.DoubleSide}));fill.scale.y=1.35;g.add(fill);this.root.add(g);this.portal=g;sign(this.root,'직장  ·  도착',3.2,.65,0,3.8,-25.95,'#d46150');this.spot('finish','직장에 도착하기',0,-26);this.bounds={minX:-9,maxX:9,minZ:-28,maxZ:34};}
 nearest(){let near=null,dist=2.35;for(const s of this.spots){const d=Math.hypot(this.hero.position.x-s.x,this.hero.position.z-s.z);if(d<dist){near=s;dist=d;}}return near;}
 setVehicleDestination(text){const value=this.vehicleSignLine+' · '+text;if(value===this.vehicleSignText)return;if(this.vehicleSign){this.root.remove(this.vehicleSign);this.vehicleSign.geometry.dispose();}this.vehicleSign=sign(this.root,value,4.7,.7,0,2.7,-13.9,this.vehicleSignColor);this.vehicleSignText=value;}
 sitAt(spot){this.hero.position.set(spot.seatX,0,spot.z);this.desiredYaw=spot.seatYaw;this.commandedSpeed=0;}
 alignGrip(z){this.hero.position.x=.4;this.hero.position.z=z+.25;this.desiredYaw=0;this.commandedSpeed=0;}
 move(dx,dz,dt,speed){
  const p=this.hero.position;
  this.moveOrigin.set(p.x,p.z);
  const length=Math.hypot(dx,dz);
  this.commandedSpeed=length?speed:0;
  if(length){
    const x=THREE.MathUtils.clamp(p.x+dx/length*dt*speed,this.bounds.minX,this.bounds.maxX);
    const z=THREE.MathUtils.clamp(p.z+dz/length*dt*speed,this.bounds.minZ,this.bounds.maxZ);
    if(!this.blocked(x,z)){p.x=x;p.z=z;}
    else {
      if(!this.blocked(x,p.z))p.x=x;
      if(!this.blocked(p.x,z))p.z=z;
    }
    this.desiredYaw=Math.atan2(-dx,-dz);
  }
  p.y=this.mode==='street'&&this.transit.entrance?entranceHeight(p.x,p.z):this.mode==='platform'?.3:0;
  return Math.hypot(p.x-this.moveOrigin.x,p.z-this.moveOrigin.y)>.0001;
 }
 crowdCollision(running,dt,onHit){for(const n of this.npcs){const p=this.hero.position,d=p.distanceTo(n.g.position);if(d<.64&&d>.005){const v=p.clone().sub(n.g.position);v.y=0;v.normalize();
 const push=(.64-d)+.02;
 n.g.position.addScaledVector(v,-push);onHit(running);}}}
 advanceHero(dt,{running=false,grip=false,seated=false}={}){
  const p=this.hero.position;
  const actual=Math.hypot(p.x-this.moveOrigin.x,p.z-this.moveOrigin.y);
  const distance=Math.min(actual,this.commandedSpeed*dt);
  this.heroAnimator.advance(dt,{distance,speed:dt?distance/dt:0,yaw:this.desiredYaw,running,grip,seated});
 }
 update(dt,time,{seated=false,rideMoving=false,intro=false,ended=false}={}){
  if(intro||ended)this.heroAnimator.advance(dt);
  this.traffic?.(time);
  for(const npc of this.npcs){if(npc.stationary)npc.animator.advance(dt,{seated:!!npc.sitting});else moveNpc(npc,dt,(x,z)=>this.blocked(x,z));npc.g.position.y=(this.mode==='street'&&this.transit.entrance?entranceHeight(npc.g.position.x,npc.g.position.z):this.mode==='platform'?.3:0)+(npc.sitting?.24:0);}for(const s of this.spots){s.ring.material.opacity=(s.boarding||s.alighting)?.7+Math.sin(time*4)*.25:.55+Math.sin(time*2)*.18;if(s.boarding||s.alighting){s.ring.scale.setScalar(1+.08*Math.sin(time*4));s.beacon.material.emissiveIntensity=1.1+.9*Math.sin(time*4);}}if(this.portal){this.portal.children[0].rotation.z=Math.sin(time)*.03;this.portal.children[1].material.opacity=.2+Math.sin(time*2)*.08;}if(rideMoving)for(const g of this.cityMotion){g.position.z+=dt*8;if(g.position.z>30)g.position.z=-50;}if(intro){this.hero.position.set(1.5,0,4);this.hero.rotation.y=0;this.camera.position.set(12+Math.sin(time*.12)*1.4,7.7,23);this.camera.lookAt(-.5,2,-20);}else{const target=new THREE.Vector3(this.hero.position.x,this.hero.position.y+(seated?-.45:0)+(this.hero.position.y<-.6?1.85:3.1),this.hero.position.z+(this.hero.position.y<-.6?1.8:this.mode==='vehicle'?3.4:4.85));this.camera.position.lerp(target,1-Math.exp(-dt*8));this.camera.lookAt(this.hero.position.x,this.hero.position.y+(seated?-.45:0)+1.15,this.hero.position.z-3.2);}this.renderer.render(this.scene,this.camera);}
}

const baseVehicle=World.prototype.vehicle;
World.prototype.vehicle=function(data) {
  baseVehicle.call(this,data);
  if(data.type!=='bus')return;
  // The riding view is from +Z; neutral yaw faces down the bus toward -Z.
  const forward=0;
  for(const spot of this.spots)if(spot.seat)spot.seatYaw=forward;
  for(const child of this.root.children){
    const p=child.geometry?.parameters;
    if(p?.width===.16&&p?.height===.78&&p?.depth===.95&&Math.abs(child.position.x)>1.8)child.visible=false;
  }
  for(let row=0;row<7;row++)for(const side of [-1,1]){
    const seatZ=-10+row*3.2;
    cube(this.root,.92,.78,.16,0x658773,side*1.45,1.0,seatZ+.48);
  }
  // Give the cabin a compact bus shell with broad side windows and continuous overhead rails.
  for(const side of [-1,1]){
    cube(this.root,.12,.82,21,0x42514c,side*2.2,.42,0);
    cube(this.root,.055,1.12,18.5,0x91b0aa,side*2.23,2.05,0,{transparent:true,opacity:.38,roughness:.25,metalness:.08,side:THREE.DoubleSide});
    for(let z=-9;z<=9;z+=3)cube(this.root,.085,1.55,.10,0x3d504a,side*2.22,1.65,z);
    cube(this.root,.07,.07,19,0xbac7b8,side*1.8,2.55,0);
  }
  this.vehicleSignLine=BUS_COURSE.busNumber+'번';
  this.vehicleSignColor='#385c48';
  this.vehicleSignText='';
  this.setVehicleDestination('다음 '+(data.next||BUS_COURSE.destinationLabel));
  this.npcs.forEach((npc,i)=>{
    npc.stationary=true;
    npc.sitting=i<2;
    npc.g.rotation.y=forward;
    npc.animator.reset(forward);
    if(i<2)npc.g.position.set(i===0?-1.45:1.45,i===0?0:0,i===0?-6.8:-3.6);
    else npc.g.position.set(i===2?-.42:.42,0,-1+(i-3)*2.5);
  });
};

const baseSpot=World.prototype.spot;
World.prototype.spot=function(id,label,x,z,meta={}) {
  const spot=baseSpot.call(this,id,label,x,z,meta);
  if(meta.markerLabel){
    spot.ring.geometry.dispose();
    spot.ring.geometry=new THREE.RingGeometry(1.35,1.72,48);
    spot.beacon.scale.y=1.8;
    spot.beacon.position.y=1.05;
    for(const child of this.root.children){
      if(child.isMesh&&child.geometry?.type==='PlaneGeometry'&&Math.abs(child.position.x-x)<.01
          &&Math.abs(child.position.z-(z-1.15))<.01)child.visible=false;
    }
    sign(this.root,meta.markerLabel,4.4,.72,x,2.85,z-1.15,'#e6b820','#172f2b');
  }
  return spot;
};

const baseBusModel=World.prototype.busModel;
World.prototype.busModel=function(x,z) {
  const bus=baseBusModel.call(this,x,z);
  for(const child of bus.children){
    if(child.isMesh&&child.geometry?.type==='PlaneGeometry'&&child.position.z>4.5)child.visible=false;
  }
  sign(bus,BUS_COURSE.busNumber,1.6,.45,0,2.94,4.62,'#263d33','#cbef9f');
  return bus;
};

const baseDestination=World.prototype.setVehicleDestination;
World.prototype.setVehicleDestination=function(text) {
  baseDestination.call(this,text);
  if(this.vehicleSignLine?.endsWith('번')&&this.vehicleSign)this.vehicleSign.position.z=13.9;
};

const baseOffice=World.prototype.office;
World.prototype.office=function(data={}) {
  const stationEntrance=this.stationEntrance;
  this.stationEntrance=()=>{};
  baseOffice.call(this,data);
  this.stationEntrance=stationEntrance;
  if(!data.busOnly)return;
  if(this.portal)this.portal.visible=false;
  this.spots=this.spots.filter(spot=>{if(spot.id==='finish'){spot.ring.visible=false;return false;}return true;});
  // Bring the workplace facade into view immediately after alighting at Chungjeongno.
  cube(this.root,15,18,2.1,0xb6c6bc,0,9,-11);
  cube(this.root,12.2,11.7,.12,0x668781,0,8.3,-9.88,{roughness:.4,metalness:.15});
  for(let x=-5;x<=5;x+=2)cube(this.root,.08,11.8,.15,0xd7ddcc,x,8.3,-9.8);
  cube(this.root,3.8,4.1,.16,0x294c41,0,2.1,-9.78);
  sign(this.root,'SEOUL WORKS',8,.9,0,14,-9.7,'#d4ddca','#3d6651');
  cube(this.root,5,.2,2.8,0xaaa58f,0,.02,-8.4);
  const portal=new THREE.Group();
  portal.position.set(0,1.7,-6);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.2,.1,7,36),new THREE.MeshStandardMaterial({color:0xef655a,emissive:0xdc483f,emissiveIntensity:1.5,roughness:.5}));
  ring.scale.y=1.35;portal.add(ring);
  const fill=new THREE.Mesh(new THREE.CircleGeometry(1.1,32),new THREE.MeshBasicMaterial({color:0xf17466,transparent:true,opacity:.25,side:THREE.DoubleSide}));
  fill.scale.y=1.35;portal.add(fill);this.root.add(portal);this.portal=portal;
  sign(this.root,'직장 · 도착',3.2,.65,0,3.8,-5.95,'#d46150');
  this.spot('finish','회사에 도착하기',0,-6);
};
