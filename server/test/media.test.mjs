import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleMedia } from '../media.mjs';
import config from '../../src/data/mediaCenter.json' with {type:'json'};
const request=(p,m='GET')=>new Request('https://circ-coimbra.org'+p,{method:m});
const draft={...config,published:false,documents:config.documents.map(d=>({...d,status:'draft'}))};
const published={...config,published:true,documents:config.documents.map(d=>({...d,status:'published'}))};
const env={ASSETS:{async fetch(req){const name=new URL(req.url).pathname.split('/').pop();return new Response(name==='index.html'?'<title>Home</title><link rel="canonical" href="https://circ-coimbra.org/">':fs.readFileSync(new URL('../../media-published/'+name,import.meta.url)));}}};
test('draft page and all draft files blocked before asset access',async()=>{for(const p of ['/media',...config.documents.flatMap(d=>Object.values(d.files).map(f=>'/media-files/'+f.name))])assert.equal((await handleMedia(request(p),{ASSETS:{fetch(){throw Error('leak');}}},{config:draft})).status,404);});
test('press permanently redirects, preserving query',async()=>{const r=await handleMedia(request('/press?lang=en'),env);assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/media?lang=en');});
test('unrelated routes are untouched',async()=>{for(const p of ['/api/accommodation/hotels','/conta','/admin','/programa'])assert.equal(await handleMedia(request(p),env),null);});
test('published page does not expose draft file',async()=>assert.equal((await handleMedia(request('/media-files/'+config.documents[0].files.pdf.name),env,{config:{...draft,published:true},authorize:async()=>true})).status,404));
test('published files available after authentication, exact bytes and MIME type',async()=>{for(const d of published.documents)for(const [ext,f] of Object.entries(d.files)){const r=await handleMedia(request('/media-files/'+f.name),env,{config:published,authorize:async()=>true});assert.equal(r.status,200);assert.equal((await r.arrayBuffer()).byteLength,f.bytes);assert.match(r.headers.get('content-type'),ext==='pdf'?/application\/pdf/:ext==='zip'?/application\/zip/:/wordprocessingml/);assert.ok(r.headers.get('content-disposition').includes(f.name));}});
test('HTML fallback and unknown filenames fail closed',async()=>{assert.equal((await handleMedia(request('/media-files/'+config.documents[0].files.pdf.name),{ASSETS:{fetch:async()=>new Response('<html>Home</html>')}},{config:published,authorize:async()=>true})).status,404);assert.equal((await handleMedia(request('/media-files/missing.pdf'),env,{config:published,authorize:async()=>true})).status,404);});
test('preview no-store noindex and route-specific metadata',async()=>{const r=await handleMedia(request('/media'),env,{preview:true});assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('x-robots-tag'),/noindex/);const html=await r.text();assert.match(html,/<title>Media Center \| CIRC 2027<\/title>/);assert.match(html,/href="https:\/\/circ-coimbra.org\/media"/);});
test('HEAD supported and writes rejected',async()=>{const p='/media-files/'+config.documents[0].files.pdf.name;const r=await handleMedia(request(p,'HEAD'),env,{preview:true});assert.equal(r.status,200);assert.equal(await r.text(),'');assert.equal((await handleMedia(request(p,'POST'),env,{preview:true})).status,405);});

test('graphic media assets are allowlisted, validated and downloadable with exact filename',async()=>{
  const jpeg=Uint8Array.from([0xff,0xd8,0xff,0xd9]);
  const pdf=new TextEncoder().encode('%PDF-1.7');
  const assetEnv={ASSETS:{async fetch(req){const p=new URL(req.url).pathname;return new Response(p.endsWith('.pdf')?pdf:jpeg);}}};
  const cases=[
    ['/media-assets/Cartaz_2027_RGB-3000.jpg?download=1','image/jpeg','Cartaz_2027_RGB-3000.jpg'],
    ['/media-assets/CIRC2027_LOGO_VETORIAL.pdf?download=1','application/pdf','CIRC2027_LOGO_VETORIAL.pdf'],
    ['/media-assets/Digitial_1080x1350-TORRE.jpg?download=1','image/jpeg','Digitial_1080x1350-TORRE.jpg'],
  ];
  for(const [p,type,name] of cases){
    const r=await handleMedia(request(p),assetEnv,{config:published,authorize:async()=>true});
    assert.equal(r.status,200); assert.equal(r.headers.get('content-type'),type);
    assert.match(r.headers.get('content-disposition'),/^attachment/); assert.ok(r.headers.get('content-disposition').includes(name));
  }
  assert.equal((await handleMedia(request('/media-assets/unknown.jpg'),assetEnv,{config:published,authorize:async()=>true})).status,404);
  assert.equal((await handleMedia(request('/media-assets/Cartaz_2027_RGB-3000.jpg'),{ASSETS:{fetch:async()=>new Response('<html>fallback</html>')}},{config:published,authorize:async()=>true})).status,404);
});
