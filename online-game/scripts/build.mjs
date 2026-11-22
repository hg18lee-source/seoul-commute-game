import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const source=new URL('../dist/',import.meta.url);
const output=new URL('../public-online/',import.meta.url);
const files=[
  'game.js','journey.js','world.js','gongdeok-street.js','storefronts.js','transit-scene.js',
  'style.css','online.js','account-ui.js','online.css',
  'hero/commuter.glb','hero/motion.js','hero/npc.js','hero/vendor/loaders/GLTFLoader.js',
  'hero/vendor/utils/BufferGeometryUtils.js',
  'transit-assets/gongdeok-entrance.glb','transit-assets/ticket-gate.glb',
  'vendor/THREE-LICENSE.txt','vendor/three.core.js','vendor/three.module.js',
];
const inputs=await Promise.all(files.map(async name=>[name,await readFile(new URL(name,source))]));
const hash=createHash('sha256');
for(const [name,bytes] of inputs)hash.update(name).update('\0').update(bytes);
const prefix='game-assets/'+hash.digest('hex').slice(0,16)+'/';
await rm(output,{recursive:true,force:true});
await mkdir(new URL(prefix,output),{recursive:true});
for(const [name,bytes] of inputs){
  const path=new URL(prefix+name,output);
  await mkdir(new URL('./',path),{recursive:true});
  await writeFile(path,bytes);
}
const index=await readFile(new URL('index.html',source),'utf8');
await writeFile(new URL('index.html',output),
  index.replace(/(["'])\.\/(game\.js|style\.css|online\.css)\1/g,(_,q,name)=>q+prefix+name+q));
// Administrator HTML is rendered by the server and uses these local root paths.
for (const name of ['admin-ui.js','online.js','style.css','online.css','credits.html'])
  await cp(new URL(name,source),new URL(name,output));
