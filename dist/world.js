import * as THREE from './vendor/three.module.js';
import { CommuterMotion } from "./hero/motion.js";
import { entranceHeight, entranceBlocked, gateZ, placeGate } from './transit-scene.js';
import { populateGongdeok } from "./gongdeok-street.js";

const C={pavement:0xd8d2bb,road:0x7d8881,cream:0xe8e5ce,ink:0x294b43,green:0x527f56,glass:0x628183,wood:0x9c7953};
const mats=new Map();
function mat(color,extra={}){const k=color+JSON.stringify(extra);if(!mats.has(k))mats.set(k,new THREE.MeshStandardMaterial({color,roughness:.88,...extra}));return mats.get(k);}
function cube(parent,w,h,d,color,x,y,z,extra={}){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color,extra));m.position.set(x,y,z);m.castShadow=h>1;m.receiveShadow=true;parent.add(m);return m;}
function cylinder(parent,r,h,color,x,y,z,sides=8){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,sides),mat(color));m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
const signCache=new Map();
function sign(parent,text,w,h,x,y,z,bg='#214f43',fg='#fff9e9',size=52){const key=[text,w,h,bg,fg,size].join('|');let material=signCache.get(key);if(!material){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.max(128,Math.round(1024*h/w));const c=canvas.getContext('2d');c.fillStyle=bg;c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';c.font=`700 ${Math.min(canvas.height*.54,1024/Math.max(text.length,3)*1.5)}px Arial,Malgun Gothic,sans-serif`;c.fillText(text,512,canvas.height/2,980);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;material=new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide});signCache.set(key,material);}const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);m.position.set(x,y,z);parent.add(m);return m;}
const npcBody=new THREE.CapsuleGeometry(.5,1,3,7);
const npcHead=new THREE.SphereGeometry(.5,8,6);
const npcBox=new THREE.BoxGeometry(1,1,1);
function character(parent,color,index){
  const g=new THREE.Group();
  const skin=[0xc89875,0xa56f55,0xdbac8d,0x765044][index%4];
  const pants=[0x383f44,0x5a5348,0x46514b][index%3];
  function piece(group,geometry,color,x,y,z,w,h,d) {
    const mesh=new THREE.Mesh(geometry,mat(color));
    mesh.userData.sharedGeometry=true;
    mesh.position.set(x,y,z);
    mesh.scale.set(w,h,d);
    group.add(mesh);
    return mesh;
  }
  piece(g,npcBody,color,0,1.10,0,.46,.29,.25);
  piece(g,npcHead,skin,0,1.59,0,.30,.35,.29);
  piece(g,npcHead,0x292524,0,1.695,.025,.30,.15,.30);
  if(index%3===0)piece(g,npcBox,0x4f4d3e,0,1.095,.177,.30,.37,.20);
  const legs=[], arms=[];
  for(const side of [-1,1]){
    const leg=new THREE.Group();
    leg.position.set(side*.115,.76,0);
    g.add(leg);
    piece(leg,npcBody,pants,0,-.33,0,.16,.34,.15);
    piece(leg,npcBox,0x353332,0,-.69,-.045,.17,.115,.26);
    legs.push(leg);
    const arm=new THREE.Group();
    arm.position.set(side*.28,1.345,0);
    arm.rotation.z=side*.12;
    g.add(arm);
    piece(arm,npcBody,color,0,-.21,0,.13,.22,.13);
    piece(arm,npcHead,skin,0,-.412,0,.11,.12,.105);
    arms.push(arm);
  }
  g.scale.setScalar(.91+(index%5)*.03);
  g.userData.legs=legs;
  g.userData.arms=arms;
  if(index%3===0)arms[0].rotation.x=-.34;
  parent.add(g);
  return g;
}
function tree(parent,x,z){cylinder(parent,.16,3.5,0x8a7253,x,1.75,z);for(let i=0;i<3;i++){const leaves=new THREE.Mesh(new THREE.IcosahedronGeometry(1.65-i*.15,0),mat([0x819552,0x728b4d,0x9ba15e][i]));leaves.position.set(x+(i-1)*.55,3.7+i*.4,z+(i%2)*.3);leaves.castShadow=true;parent.add(leaves);}cube(parent,2.2,.32,2.2,0xbcc3a4,x,.16,z);}
function bench(parent,x,z){cube(parent,2.2,.15,.65,C.wood,x,.6,z);cube(parent,2.2,.6,.1,C.wood,x,1,z+.3);for(const s of [-1,1])cube(parent,.1,.55,.5,C.ink,x+s*.8,.3,z);}

export class World{
 constructor(canvas,heroModel){this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.14;this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xdbe5d7);this.scene.fog=new THREE.Fog(0xdbe5d7,38,145);this.camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,230);this.scene.add(new THREE.HemisphereLight(0xfff7df,0x889c7d,2.1));this.sun=new THREE.DirectionalLight(0xfff1cd,3);this.sun.position.set(-28,45,16);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{left:-45,right:45,top:45,bottom:-45,near:1,far:110});this.sun.shadow.bias=-.0008;this.scene.add(this.sun);this.root=new THREE.Group();this.scene.add(this.root);this.hero=new THREE.Group();this.hero.add(heroModel);this.scene.add(this.hero);this.heroAnimator=new CommuterMotion(heroModel);this.moveOrigin=new THREE.Vector2();this.desiredYaw=0;this.commandedSpeed=0;this.transit={};this.npcs=[];this.spots=[];this.mode='street';this.bounds={minX:-8,maxX:8,minZ:-51,maxZ:35};this.intro=true;this.portal=null;this.vehicleRoot=null;this.streetBus=null;this.platformTrains=[];this.cityMotion=[];this.resize();addEventListener('resize',()=>this.resize());}
 resize(){this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);}
 clear(){this.scene.remove(this.root);this.root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry&&!o.userData.sharedGeometry)o.geometry.dispose();});this.root=new THREE.Group();this.scene.add(this.root);this.npcs=[];this.spots=[];this.portal=null;this.vehicleRoot=null;this.streetBus=null;this.platformTrains=[];this.cityMotion=[];this.gate=null;this.traffic=null;}
 floor(w,d,color=C.pavement){cube(this.root,w,.2,d,color,0,-.12,0);}
 spot(id,label,x,z,meta={}){const ring=new THREE.Mesh(new THREE.RingGeometry(.62,.72,28),new THREE.MeshBasicMaterial({color:0xa6e5b0,transparent:true,opacity:.85,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(x,.025,z);this.root.add(ring);const spot={id,label,x,z,ring,...meta};this.spots.push(spot);return spot;}
 people(count,area={x:7,z:45,offset:0}){const colors=[0x374c52,0x9f9278,0x78857b,0x616f82,0xb4a58c,0x746654];for(let i=0;i<count;i++){const g=character(this.root,colors[i%colors.length],i);const x=Math.sin(i*9.27)*area.x,z=(i/count-.5)*area.z+area.offset;g.position.set(x,0,z);g.rotation.y=(i%2)*Math.PI;this.npcs.push({g,baseX:x,baseZ:z,phase:i*2.5,walk:i%3!==0});}}
 setStage(mode,data={}){this.clear();this.mode=mode;this.intro=!!data.intro;this.scene.background.set(mode==='hall'||mode==='platform'?0xd2d7c7:0xdbe5d7);this.scene.fog.color.copy(this.scene.background);this.hero.visible=true;this.hero.rotation.y=0;this.desiredYaw=0;this.heroAnimator.reset();if(mode==='street'){if(data.legacyStreet)this.street(data);else populateGongdeok(this);}if(mode==='hall')this.hall(data);if(mode==='platform')this.platform(data);if(mode==='vehicle')this.vehicle(data);if(mode==='office')this.office(data);this.hero.position.set(data.spawnX??0,0,data.spawnZ??(mode==='street'?22:mode==='hall'?14:mode==='platform'?8:mode==='vehicle'?5:22));this.camera.position.copy(this.hero.position).add(new THREE.Vector3(0,5.3,9));this.camera.lookAt(this.hero.position.x,1,this.hero.position.z-3);}
 street(data){this.floor(250,260,0xb8c2a5);cube(this.root,22,.16,150,C.pavement,0,-.01,-15);cube(this.root,17,.1,160,C.road,20,-.03,-15);for(let i=0;i<30;i++){cube(this.root,22,.015,.035,0xb8bca9,0,.08,38-i*4);cube(this.root,.35,.02,2.7,0xe9d6a2,5,.085,38-i*4);}for(let i=0;i<18;i++){cube(this.root,.12,.025,3.5,0xe5dba6,19,.04,35-i*8);cube(this.root,.12,.025,3.5,0xe5dba6,20,.04,35-i*8);}for(const side of [-1,1])for(let i=0;i<11;i++){const z=28-i*15,w=8+(i%3)*2,h=8+(i*7%5)*5,x=side<0?-19:39;const color=[0xc3c6b4,0xd8d2be,0xb8c8c0,0xd2c8b4,0xacbbb3][i%5];cube(this.root,w,h,12,color,x,h/2,z);cube(this.root,w+.3,.25,12.3,0x9baa9d,x,h,z);for(let yy=3;yy<h-1;yy+=3)for(let xx=-w/2+1;xx<w/2;xx+=2)cube(this.root,1.1,1.8,.08,C.glass,x+xx,yy,z+6.05,{metalness:.2,roughness:.4});if(side<0&&i<6){const names=['서울커피','오늘의 빵','편의점','아침식당','책방 공덕','꽃, 오늘'];sign(this.root,names[i],7.5,.85,x,2.7,z+6.16,i%2?'#4a695c':'#8b765b');cube(this.root,7.5,2.3,.1,0x798a7d,x,1.3,z+6.1);}}for(let i=0;i<8;i++){tree(this.root,9,23-i*14);cylinder(this.root,.065,5.5,C.ink,12,2.75,23-i*14);cube(this.root,1.6,.12,.35,C.ink,11.3,5.5,23-i*14);}bench(this.root,-8,-2);bench(this.root,8,-29);this.stationEntrance(data.station||'공덕',data.line||'5');this.streetBus=this.busModel(12,-42);this.busShelter(8,-42);this.spot('station','역으로 들어가기',-5,-24);this.spot('bus','버스 정류장에서 기다리기',7,-42);this.bounds={minX:-10,maxX:10,minZ:-48,maxZ:32};this.people(14,{x:7,z:76,offset:-5});const distant=cube(this.root,2,27,2,0xb4c3ba,-2,13.5,-110);cylinder(this.root,.35,10,0x8ea899,-2,32,-110);sign(this.root,'서울의 아침',4,1,-5,2.3,26,'#527260');}
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
  this.people(3,{x:5.4,z:10,offset:12});
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
  if(this.mode==='hall'&&z>gateZ-1.22&&z<gateZ+1.22)
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
 for(let z=-29;z<30;z+=1.4)cube(this.root,9,.018,.022,0x9f988a,0,.308,z);
 cube(this.root,10,.4,65,0xd4d2b9,0,.1,0);for(const s of [-1,1]){cube(this.root,.32,.02,62,0xe6cb66,s*4.6,.32,0);cube(this.root,1,.2,68,0x4e5e51,s*9,-.1,0);for(let i=0;i<11;i++)cube(this.root,2.3,.12,.15,0x35463b,s*9,-.02,-30+i*6);const train=new THREE.Group();this.root.add(train);train.position.x=s*9;this.platformTrains.push(train);cube(train,5,3.6,58,0xe2e4d7,0,1.6,-3);cube(train,5.05,.22,58,Number(data.line)===5?0x9274b1:0x679156,0,1.1,-3);for(let i=0;i<11;i++){cube(train,.05,1,2.3,0x5a7870,-s*2.53,2,-28+i*5);cube(train,.06,2.4,1.2,0x859d86,-s*2.54,1.4,-25+i*5);}const neighbor=data.neighbors?.[s===-1?0:1]||'다음 역';sign(this.root,`${s===-1?'←':'→'}  ${neighbor} 방면`,6,.8,s*5.4,3.7,-3,Number(data.line)===5?'#80679b':'#497a50');this.spot(s===-1?'train-left':'train-right',`${neighbor} 방면 탑승`,s*4,0,{direction:s});}for(let i=0;i<5;i++){cube(this.root,.6,6,.6,0xc9cbb7,0,3,-24+i*13);sign(this.root,`${data.station}   ${data.line}`,2,.55,0,2.3,-23.65+i*13,'#e7e8d5','#45634a');}bench(this.root,1,17);sign(this.root,`${data.station}역`,5,1,0,4,13,'#4c7152');this.spot('exit','역 밖으로 나가기',0,24);this.bounds={minX:-4.45,maxX:4.45,minZ:-25,maxZ:25};this.people(7,{x:3.6,z:35,offset:-3});}
 vehicle(data){const isBus=data.type==='bus';this.floor(isBus?5:6,30,0xa6b09a);for(const x of [-3.1,3.1]){cube(this.root,.12,.85,30,0xe5e3ce,x,.4,0);for(let i=0;i<8;i++){cube(this.root,.1,1.5,.12,0x899e89,x,1.6,-13+i*3.7);cube(this.root,.12,.12,3.7,0xc4cbb6,x,2.5,-13+i*3.7);}}for(let i=0;i<7;i++)for(const side of [-1,1]){const z=-10+i*3.2;cube(this.root,.8,.4,1.05,isBus?0x729683:0x8597ab,side*2.2,.5,z);cube(this.root,.18,.8,1.05,isBus?0x658773:0x7b899b,side*2.58,1,z);this.spot(`seat-${side}-${i}`,'좌석에 앉기',side*1.7,z,{seat:true,side});}for(let z=-10;z<=10;z+=5)cylinder(this.root,.035,2.7,0xbecab4,.7,1.35,z);cube(this.root,.05,.05,26,0xc4d0be,.7,2.6,0);for(let z=-10;z<=10;z+=2.5){const ring=new THREE.Mesh(new THREE.TorusGeometry(.13,.023,6,12),mat(0xe8ebd4));ring.position.set(.7,2.13,z);this.root.add(ring);}sign(this.root,isBus?'7016   광화문 방면':`${data.line}호선  ·  ${data.next||'다음 역'}`,4.7,.7,0,2.7,-13.9,isBus?'#385c48':'#4a6c51');this.spot('alight','열린 문으로 하차',0,-10.9);if(isBus){cube(this.root,.3,.4,.12,0xd85c45,1.4,1.3,-5);sign(this.root,'STOP',.5,.25,1.4,1.7,-4.9,'#a94e3e');this.spot('bell','하차 벨 누르기',1.1,-5);}for(let i=0;i<10;i++){const g=new THREE.Group();g.position.set(i%2?-10:10,0,-30+i*9);this.root.add(g);cube(g,5,12+i%3*5,6,[0xbac6ad,0xd0ceb5,0x9db8ac][i%3],0,6,0);tree(g,2,3);this.cityMotion.push(g);}this.bounds={minX:-1.9,maxX:1.9,minZ:-11,maxZ:11};this.people(isBus?5:7,{x:1.3,z:19,offset:0});}
 office(data){this.street({station:data.station,line:'2'});this.spots=this.spots.filter(s=>{s.ring.visible=false;return false;});cube(this.root,16,22,9,0xb6c6bc,0,11,-33);cube(this.root,12,16,.1,0x668781,0,12,-28.4,{roughness:.4,metalness:.15});for(let x=-5;x<=5;x+=2)cube(this.root,.08,16,.15,0xd7ddcc,x,12,-28.25);cube(this.root,4,4,.1,0x294c41,0,2,-28.2);sign(this.root,'SEOUL WORKS',9,1,0,5.2,-28,'#d4ddca','#3d6651');const g=new THREE.Group();g.position.set(0,1.7,-26);const ring=new THREE.Mesh(new THREE.TorusGeometry(1.2,.1,7,36),new THREE.MeshStandardMaterial({color:0xef655a,emissive:0xdc483f,emissiveIntensity:1.5,roughness:.5}));ring.scale.y=1.35;g.add(ring);const fill=new THREE.Mesh(new THREE.CircleGeometry(1.1,32),new THREE.MeshBasicMaterial({color:0xf17466,transparent:true,opacity:.25,side:THREE.DoubleSide}));fill.scale.y=1.35;g.add(fill);this.root.add(g);this.portal=g;sign(this.root,'직장  ·  도착',3.2,.65,0,3.8,-25.95,'#d46150');this.spot('finish','직장에 도착하기',0,-26);this.bounds={minX:-9,maxX:9,minZ:-28,maxZ:34};}
 nearest(){let near=null,dist=2.35;for(const s of this.spots){const d=Math.hypot(this.hero.position.x-s.x,this.hero.position.z-s.z);if(d<dist){near=s;dist=d;}}return near;}
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
  p.y=this.mode==='street'&&this.transit.entrance?entranceHeight(p.x,p.z):0;
  return Math.hypot(p.x-this.moveOrigin.x,p.z-this.moveOrigin.y)>.0001;
 }
 crowdCollision(running,dt,onHit){for(const n of this.npcs){const p=this.hero.position,d=p.distanceTo(n.g.position);if(d<.64&&d>.005){const v=p.clone().sub(n.g.position);v.y=0;v.normalize();
 const x=p.x+v.x*(.64-d)*.5,z=p.z+v.z*(.64-d)*.5;
 if(!this.blocked(x,z)&&x>=this.bounds.minX&&x<=this.bounds.maxX&&z>=this.bounds.minZ&&z<=this.bounds.maxZ){p.x=x;p.z=z;}n.g.position.addScaledVector(v,-(.64-d)*.5);if(running)onHit();}}}
 advanceHero(dt,{running=false,grip=false,seated=false}={}){
  const p=this.hero.position;
  const actual=Math.hypot(p.x-this.moveOrigin.x,p.z-this.moveOrigin.y);
  const distance=Math.min(actual,this.commandedSpeed*dt);
  this.heroAnimator.advance(dt,{distance,speed:dt?distance/dt:0,yaw:this.desiredYaw,running,grip,seated});
 }
 update(dt,time,{seated=false,rideMoving=false,intro=false,ended=false}={}){
  if(intro||ended)this.heroAnimator.advance(dt);
  this.traffic?.(time);
  for(const n of this.npcs){if(n.walk){n.g.position.z=n.baseZ+Math.sin(time*.24+n.phase)*2;const distance=Math.abs(n.g.position.z-this.hero.position.z);
 if(distance<25){
  n.g.userData.legs.forEach((l,i)=>{
    l.rotation.x=Math.sin(time*4+n.phase+i*Math.PI)*.27;
    n.g.userData.arms[i].rotation.x=-l.rotation.x*.72;
  });
 }}}for(const s of this.spots)s.ring.material.opacity=.55+Math.sin(time*2)*.18;if(this.portal){this.portal.children[0].rotation.z=Math.sin(time)*.03;this.portal.children[1].material.opacity=.2+Math.sin(time*2)*.08;}if(rideMoving)for(const g of this.cityMotion){g.position.z+=dt*8;if(g.position.z>30)g.position.z=-50;}if(intro){this.hero.position.set(1.5,0,4);this.hero.rotation.y=0;this.camera.position.set(12+Math.sin(time*.12)*1.4,7.7,23);this.camera.lookAt(-.5,2,-20);}else{const target=new THREE.Vector3(this.hero.position.x,this.hero.position.y+(seated?-.45:0)+(this.hero.position.y<-.6?1.85:3.1),this.hero.position.z+(this.hero.position.y<-.6?1.8:this.mode==='vehicle'?3.4:4.85));this.camera.position.lerp(target,1-Math.exp(-dt*8));this.camera.lookAt(this.hero.position.x,this.hero.position.y+(seated?-.45:0)+1.15,this.hero.position.z-3.2);}this.renderer.render(this.scene,this.camera);}
}
