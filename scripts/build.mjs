import { cp, mkdir, rm } from 'node:fs/promises';

const output=new URL('../public-online/',import.meta.url);
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for (const name of ['index.html','game.js','world.js','gongdeok-street.js','traffic-data.js','style.css',
  'online.js','account-ui.js','online.css','admin-ui.js','hero','vendor']) {
  await cp(new URL('../dist/'+name,import.meta.url),new URL(name,output),{recursive:true});
}
