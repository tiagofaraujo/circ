import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { handleMedia } from '../server/media.mjs';
const root = path.resolve(import.meta.dirname,'../.media-preview');
const mime = {'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.json':'application/json'};
const assets = {async fetch(request) {
 const pathname = decodeURIComponent(new URL(request.url).pathname);
 const file = path.resolve(root, '.' + pathname);
 if (!file.startsWith(root + '/')) return new Response('Not found',{status:404});
 try {return new Response(await fs.readFile(file),{headers:{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}});}
 catch {return new Response(await fs.readFile(path.join(root,'index.html')),{headers:{'Content-Type':'text/html'}});}
}};
http.createServer(async (req,res) => {
 try {
  const request = new Request('http://127.0.0.1:4173' + req.url,{method:req.method});
  const response = await handleMedia(request, {ASSETS:assets}, {preview:true}) || await assets.fetch(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
 } catch {res.writeHead(500);res.end('Preview unavailable');}
}).listen(4173,'127.0.0.1',()=>console.log('Private local preview: http://127.0.0.1:4173/media'));
