import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { makePool } from '../server/db.mjs';
import { app, configFrom } from '../server/app.mjs';

const tutorial=process.argv.includes('--tutorial') ? await import('../../tutorial/local-http.mjs') : null;
const pool=makePool(), handle=app(pool,configFrom());
const port=Number(process.env.PORT??8010), host='127.0.0.1';
const origin='http://'+host+':'+port;
const mime={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',
  css:'text/css; charset=utf-8',glb:'model/gltf-binary',txt:'text/plain; charset=utf-8'};
const server=createServer(async (req,res)=>{
  try {
    const url=new URL(req.url,origin);
    if (url.origin!==origin) {res.writeHead(400).end();return;}
    if (url.pathname.startsWith('/api/')||url.pathname==='/api'||url.pathname==='/administrator') {
      const hasBody=!['GET','HEAD'].includes(req.method);
      const request=new Request(url,{method:req.method,headers:req.headers,
        ...(hasBody?{body:Readable.toWeb(req),duplex:'half'}:{})});
      const response=await handle(request);
      res.writeHead(response.status,Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body).pipe(res);
      else res.end();
      return;
    }
    if (tutorial&&await tutorial.serveTutorial(req,res,url.pathname)) return;
    const path=url.pathname==='/'?'/index.html':url.pathname;
    const extension=path.split('.').at(-1);
    if (!['GET','HEAD'].includes(req.method)||!Object.hasOwn(mime,extension)||!/^\/(?:[\w-]+\/)*[\w-]+\.[\w.]+$/.test(path)) {
      res.writeHead(404).end();return;
    }
    let asset=await readFile(new URL('../public-online'+path,import.meta.url));
    if (tutorial&&path==='/index.html') asset=tutorial.enableTutorialMenu(asset.toString('utf8'));
    res.writeHead(200,{'Content-Type':mime[extension],'Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:asset);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(port,host,()=>console.log(origin));
