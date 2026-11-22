import * as THREE from '../vendor/three.module.js';
import { CommuterMotion, movementSpeed } from './motion.js';

const outfits = [
  {jacket:0x496958, facing:0x678472, trousers:0x333d3c},
  {jacket:0x735361, facing:0x936f7e, trousers:0x403a42},
  {jacket:0x53667a, facing:0x718397, trousers:0x3c4147},
  {jacket:0x886347, facing:0xa0815f, trousers:0x454139},
  {jacket:0x526e6b, facing:0x72918d, trousers:0x3d4643},
  {jacket:0x706347, facing:0x958662, trousers:0x42413a},
  {jacket:0x554f76, facing:0x787397, trousers:0x3b3d48},
  {jacket:0x7b4d49, facing:0x9c6d67, trousers:0x443a3b},
];

export function cloneCommuter(source) {
  const clone=source.clone(true), originals=[], copies=[];
  source.traverse(node=>originals.push(node));
  clone.traverse(node=>copies.push(node));
  if(originals.length!==copies.length)throw new Error('NPC commuter clone hierarchy mismatch');
  const paired=new Map(originals.map((node,index)=>[node,copies[index]]));
  originals.forEach((node,index)=>{
    if(!node.isSkinnedMesh)return;
    const mesh=copies[index];
    mesh.geometry.userData.sharedGeometry=true;
    const skeleton=new THREE.Skeleton(node.skeleton.bones.map(bone=>paired.get(bone)),
      node.skeleton.boneInverses.map(matrix=>matrix.clone()));
    mesh.bind(skeleton,node.bindMatrix.clone());
  });
  return clone;
}

function outfitMaterial(source,outfit) {
  const material=source.clone();
  material.userData.npcOwned=true;
  if(source.name==='Navy wool')material.color.setHex(outfit.jacket);
  else if(source.name==='Navy facing')material.color.setHex(outfit.facing);
  else if(source.name==='Trousers')material.color.setHex(outfit.trousers);
  return material;
}

export function createNpc(source,index) {
  const g=new THREE.Group(), model=cloneCommuter(source), outfit=outfits[index%outfits.length];
  model.traverse(node=>{
    if(node.isMesh)node.material=Array.isArray(node.material)
      ?node.material.map(material=>outfitMaterial(material,outfit))
      :outfitMaterial(node.material,outfit);
  });
  model.scale.setScalar(.94+(index%4)*.035);
  g.add(model);
  const animator=new CommuterMotion(model), direction=index%2===0?1:-1;
  animator.reset(direction>0?Math.PI:0);
  return {g,animator,direction,speed:movementSpeed.walk*(.82+(index%4)*.06)*.5};
}

export function moveNpc(npc,dt,blocked=()=>false) {
  const {g}=npc, previous=g.position.z;
  let next=previous+npc.direction*npc.speed*dt;
  if(next<=npc.minZ||next>=npc.maxZ||blocked(g.position.x,next)){
    npc.direction*=-1;
    next=THREE.MathUtils.clamp(previous+npc.direction*npc.speed*dt,npc.minZ,npc.maxZ);
    if(blocked(g.position.x,next))next=previous;
  }
  g.position.z=next;
  const distance=Math.abs(next-previous), yaw=npc.direction>0?Math.PI:0;
  npc.animator.advance(dt,{distance,speed:dt?distance/dt:0,yaw});
}
