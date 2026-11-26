import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const source=new URL('../dist/',import.meta.url);
const output=new URL('../public-online/',import.meta.url);
const files=[
  'game.js','journey.js','world.js','gongdeok-street.js','storefronts.js','transit-scene.js',
  'style.css','online.js','account-ui.js','account-rules.js','online.css',
  'hero/commuter.glb','hero/motion.js','hero/npc.js','hero/vendor/loaders/GLTFLoader.js',
  'hero/vendor/utils/BufferGeometryUtils.js',
  'transit-assets/gongdeok-entrance.glb','transit-assets/ticket-gate.glb',
  'vendor/THREE-LICENSE.txt','vendor/three.core.js','vendor/three.module.js',
];
const tutorialSource=new URL('../tutorial/',import.meta.url);
const tutorialFiles=['index.html','style.css','app.mjs','input.mjs','state.mjs','guidance.mjs','visual-guide.mjs','dialogue.mjs'];
const tutorialInputs=await Promise.all(tutorialFiles.map(async name=>[name,await readFile(new URL(name,tutorialSource))]));
const inputs=await Promise.all(files.map(async name=>[name,await readFile(new URL(name,source))]));
const hash=createHash('sha256');
for(const [name,bytes] of inputs)hash.update(name).update('\0').update(bytes);
for(const [name,bytes] of tutorialInputs)hash.update('tutorial/'+name).update('\0').update(bytes);
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
  index.replace('</head>','<meta name="commute-tutorial" content="enabled">\n</head>').replace(/(["'])\.\/(game\.js|style\.css|online\.css)\1/g,(_,q,name)=>q+prefix+name+q));
// Administrator HTML is rendered by the server and uses these local root paths.
for (const name of ['admin-ui.js','online.js','style.css','online.css','credits.html'])
  await cp(new URL(name,source),new URL(name,output));

await mkdir(new URL(prefix+'tutorial/',output),{recursive:true});
await mkdir(new URL('tutorial/',output),{recursive:true});
for (const [name,bytes] of tutorialInputs) {
  if (name==='index.html') {
    const html=bytes.toString('utf8').replace('</head>','<meta name="integrated-tutorial" content="enabled">\n</head>')
      .replace(/(["'])\.\/(style\.css|app\.mjs)\1/g,(_,quote,file)=>quote+'/'+prefix+'tutorial/'+file+quote);
    await writeFile(new URL('tutorial/index.html',output),html);
  } else {
    const content=name.endsWith('.mjs')?bytes.toString('utf8').replaceAll("'/assets/","'../").replace("'../dist/journey.js'","'../journey.js'"):bytes;
    await writeFile(new URL(prefix+'tutorial/'+name,output),content);
  }
}
