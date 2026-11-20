import * as T from './vendor/three.module.js';
import { GLTFLoader } from './hero/vendor/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
export const entrance = { x: -5, z: -25.5, scale: .86 };
export const entranceLanding = -32.1;
export const gateZ = 3.35;
const treads = [
  [3.846, .087], [3.599, .229], [3.362, .390], [1.926, .312],
  ...Array.from({length:30}, (_, i) => [1.616-i*.2697, .143-i*.16926]),
  [-6.471, -4.707],
];

export function entranceHeight(x, z) {
  if (Math.abs(x-entrance.x)>1.90) return 0;
  const localZ=(z-entrance.z)/entrance.scale;
  if (localZ>3.93||z<entranceLanding-.7) return 0;
  let height=0;
  for (const [edge, next] of treads) {
    if (Math.abs(localZ-edge)<.10) {
      return entrance.scale*T.MathUtils.lerp(next,height,T.MathUtils.smoothstep(localZ,edge-.10,edge+.10));
    }
    if (localZ>edge) break;
    height=next;
  }
  return height*entrance.scale;
}

export function entranceBlocked(x,z) {
  if (z> -22.20 || z< -34.12 || Math.abs(x+5)>2.28) return false;
  const lane=Math.abs(x+5);
  return z< -33.48 || lane>1.34 || (z> -31.7 && lane<.40);
}

const request = name => loader.loadAsync(new URL('./transit-assets/'+name,import.meta.url).href);
export async function loadTransit(onStatus) {
  const loaded={};
  const assets=[['entrance','gongdeok-entrance.glb'],['gate','ticket-gate.glb']];
  const failures=await Promise.all(assets.map(async ([key,name])=>{
    try { loaded[key]=await request(name); }
    catch { return key; }
    finally { onStatus(Object.keys(loaded).length); }
  }));
  return {loaded,failures:failures.filter(Boolean)};
}

export function placeEntrance(source, parent) {
  const root=source.scene.clone();
  root.name='공덕역 1번 출구';
  root.position.set(entrance.x,0,entrance.z);
  root.scale.setScalar(entrance.scale);
  // Replace original fictional lettering with the game's local station signs.
  const glass=root.getObjectByName('Glass')?.children[0];
  const image=glass?.material.map?.image;
  if (image) {
    const atlas=document.createElement('canvas');
    atlas.width=image.width; atlas.height=image.height;
    const ctx=atlas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(image,0,0);
    for(const [x,y,w,h] of [[425,47,105,46],[27,408,105,48]]) {
      const sx=atlas.width/1024, sy=atlas.height/1024;
      const rgba=ctx.getImageData(x*sx,y*sy,1,1).data;
      ctx.fillStyle='rgb('+[rgba[0],rgba[1],rgba[2]].join(',')+')';
      ctx.fillRect(x*sx,y*sy,w*sx,h*sy);
    }
    const map=new T.CanvasTexture(atlas);
    map.colorSpace=T.SRGBColorSpace;
    map.flipY=false;
    const original=glass.material;
    glass.material=original.clone();
    glass.material.map=map;
    glass.material.forceSinglePass=true;
    glass.material.depthWrite=false;
    root.traverse(mesh=>{
      if(!mesh.isMesh||mesh===glass)return;
      mesh.material=mesh.material.clone();
      if(mesh.parent.name.startsWith('Plane')) {
        mesh.material.map=map;
        mesh.material.polygonOffset=true;
        mesh.material.polygonOffsetFactor=-1;
      } else {
        mesh.material.transparent=false;
        mesh.material.depthWrite=true;
        if(mesh.parent.name==='Floor_Underground') {
          mesh.material.roughness=1;
          mesh.material.metalness=.30;
        }
      }
      mesh.receiveShadow=true;
    });
  }
  root.traverse(o=>{if(o.isMesh)o.userData.sharedGeometry=true;});
  parent.add(root);
}

export function placeGate(source,parent) {
  const root=source.scene.clone();
  root.name='개찰구';
  root.position.z=gateZ;
  root.scale.set(1.28,1,1);
  root.traverse(o=>{if(o.isMesh)o.userData.sharedGeometry=true;});
  parent.add(root);
  // The source closes the two ends in sequence. Synchronize those authored
  // closed and open poses so both ends clear the lane for this passage.
  const doors=source.animations[0].tracks.map(track=>{
    const name=track.name.split('.')[0], sample=track.createInterpolant();
    const closedTime=['frontDoor2','backDoor1'].includes(name)?.3:.65;
    return {mesh:root.getObjectByName(name),
      open:new T.Quaternion().fromArray(sample.evaluate(0)),
      closed:new T.Quaternion().fromArray(sample.evaluate(closedTime))};
  });
  return fraction=>{
    for (const door of doors) door.mesh.quaternion.slerpQuaternions(door.closed,door.open,fraction);
  };
}

const BODY=new T.BoxGeometry(1,1,1);
const TIRE=new T.CylinderGeometry(.32,.32,.22,12);
export function addTraffic(parent) {
  const lane=new T.Group();
  parent.add(lane);
  const paint=[0x38464e,0x919c9f].map(color=>new T.MeshStandardMaterial({color,roughness:.43,metalness:.20}));
  const glass=new T.MeshStandardMaterial({color:0x47616a,roughness:.32,metalness:.24});
  const rubber=new T.MeshStandardMaterial({color:0x292d2c,roughness:1});
  function mesh(g,m,p,x,y,z) {
    const o=new T.Mesh(g,m);
    o.position.set(x,y,z);o.userData.sharedGeometry=true;p.add(o);return o;
  }
  const vehicles=paint.map((color,i)=>{
    const car=new T.Group();
    lane.add(car);car.position.x=17.9+i*4.7;car.rotation.y=i*Math.PI;
    mesh(BODY,color,car,0,.71,0).scale.set(1.82,.55,4.55);
    mesh(BODY,glass,car,0,1.12,.12).scale.set(1.55,.43,2.33);
    mesh(BODY,color,car,0,1.36,.21).scale.set(1.57,.075,1.52);
    const wheels=[];
    for(const x of [-.91,.91])for(const z of [-1.43,1.43]){
      const axle=new T.Group();
      axle.position.set(x,.33,z);car.add(axle);
      mesh(TIRE,rubber,axle,0,0,0).rotation.z=Math.PI/2;
      wheels.push(axle);
    }
    return {car,wheels,i};
  });
  return time=>{
    for(const {car,wheels,i} of vehicles) {
      const cycle=(time+i*9)%26;
      const distance=Math.min(cycle,9)*6+Math.max(0,cycle-12)*6;
      car.position.z=(i?-1:1)*(-70+distance);
      for(const wheel of wheels)wheel.rotation.x=distance/.32;
    }
  };
}
