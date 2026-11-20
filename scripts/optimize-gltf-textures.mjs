import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';

const [input,output,toolRoot]=process.argv.slice(2);
if(!input||!output||!toolRoot) throw Error('usage: node scripts/optimize-gltf-textures.mjs input.glb output.glb /absolute/tool/package.json');
const sharp=createRequire(toolRoot)('sharp');
const source=await readFile(input);
const jsonLength=source.readUInt32LE(12);
const doc=JSON.parse(source.subarray(20,20+jsonLength));
const original=source.subarray(28+jsonLength);
const replacements=new Map();
for(const image of doc.images) {
  const view=doc.bufferViews[image.bufferView];
  const offset=view.byteOffset??0;
  const data=original.subarray(offset,offset+view.byteLength);
  let resized=sharp(data).resize({width:512,height:512,fit:'inside',withoutEnlargement:true});
  resized=image.mimeType==='image/jpeg'?resized.jpeg({quality:87}):resized.png({compressionLevel:9});
  const bytes=await resized.toBuffer();
  if(bytes.length<data.length)replacements.set(image.bufferView,bytes);
}
const parts=[];
let length=0;
for(const [id,view] of doc.bufferViews.entries()) {
  const offset=view.byteOffset??0;
  const bytes=replacements.get(id)??original.subarray(offset,offset+view.byteLength);
  const pad=Buffer.alloc((4-bytes.length%4)%4);
  view.byteOffset=length;
  view.byteLength=bytes.length;
  parts.push(bytes,pad);
  length+=bytes.length+pad.length;
}
doc.buffers[0].byteLength=length;
const json=Buffer.from(JSON.stringify(doc));
const jsonPad=Buffer.alloc((4-json.length%4)%4,0x20);
const header=Buffer.alloc(20);
const binHeader=Buffer.alloc(8);
header.write('glTF');header.writeUInt32LE(2,4);
header.writeUInt32LE(28+json.length+jsonPad.length+length,8);
header.writeUInt32LE(json.length+jsonPad.length,12);header.write('JSON',16);
binHeader.writeUInt32LE(length);binHeader.write('BIN\0',4);
await writeFile(output,Buffer.concat([header,json,jsonPad,binHeader,...parts]));
console.log(input,source.length,'→',28+json.length+jsonPad.length+length,'bytes');
