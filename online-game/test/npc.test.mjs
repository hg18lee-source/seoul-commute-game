import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { GLTFLoader } from '../dist/hero/vendor/loaders/GLTFLoader.js';
import { createNpc, moveNpc } from '../dist/hero/npc.js';

async function commuterModel() {
  const bytes=await readFile(new URL('../dist/hero/commuter.glb',import.meta.url));
  const data=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const {scene}=await new Promise((resolve,reject)=>new GLTFLoader().parse(data,'',resolve,reject));
  return scene;
}

test('NPCs use the player commuter rig, keep independent skeletons, vary outfits and walk back and forth', async()=>{
  const source=await commuterModel(), first=createNpc(source,0), second=createNpc(source,1);
  const skinned=(root)=>{let found;root.traverse(node=>{if(node.isSkinnedMesh)found=node;});return found;};
  const sourceMesh=skinned(source), firstMesh=skinned(first.g), secondMesh=skinned(second.g);
  assert.ok(sourceMesh&&firstMesh&&secondMesh,'all actors use the same skinned character model');
  assert.notEqual(firstMesh.skeleton,sourceMesh.skeleton);
  assert.notEqual(firstMesh.skeleton.bones[0],sourceMesh.skeleton.bones[0]);
  assert.notEqual(firstMesh.skeleton,secondMesh.skeleton,'each animated NPC needs its own skeleton');
  const coat=(root)=>{let found;root.traverse(node=>{
    for(const material of Array.isArray(node.material)?node.material:[node.material])
      if(material?.name==='Navy wool')found=material;
  });return found;};
  assert.notEqual(coat(first.g).color.getHex(),coat(second.g).color.getHex(),
    'NPC jacket colors should differ');

  first.g.position.z=0;
  first.minZ=-.4;
  first.maxZ=.4;
  first.speed=1;
  for(let i=0;i<18;i++)moveNpc(first,.1);
  assert.ok(first.g.position.z>=first.minZ&&first.g.position.z<=first.maxZ);
  assert.notEqual(first.direction,1,'NPCs reverse at the ends of their walking lane');
  const walker=createNpc(source,2);
  walker.minZ=-5;
  walker.maxZ=5;
  walker.speed=1;
  for(let i=0;i<6;i++)moveNpc(walker,.1);
  assert.equal(walker.animator.state,'Walk','the player walk animator drives NPC movement');
  assert.ok(walker.animator.gait>0);
  source.traverse(node=>{if(node.isSkinnedMesh)node.skeleton.dispose();});
  firstMesh.skeleton.dispose();
  secondMesh.skeleton.dispose();
  skinned(walker.g).skeleton.dispose();
});
