import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMedia } from '../media.mjs';
import { handleMediaAccess, hasMediaAccess } from '../media-auth.mjs';
import manifest from '../../src/data/mediaCenter.json' with {type:'json'};
const origin='https://circ-coimbra.org';
const login=(password, from=origin)=>new Request(origin+'/media-access',{method:'POST',headers:{Origin:from,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password})});
test('private-mode direct downloads require a valid cookie before reading assets',async()=>{
  const protectedManifest={...manifest,publicAccess:false};
  for(const doc of protectedManifest.documents) for(const file of Object.values(doc.files)) for(const method of ['GET','HEAD']) {
    const r=await handleMedia(new Request(origin+'/media-files/'+file.name,{method}),{ASSETS:{fetch(){throw Error('Unauthorised asset read');}}},{config:protectedManifest});
    assert.equal(r.status,401);assert.match(r.headers.get('cache-control'),/no-store/);
  }
});
test('missing and forged cookies never authenticate',async()=>{
  for(const cookie of ['', '__Host-circ_media=true', '__Host-circ_media='+'a'.repeat(64)]) {
    const req=new Request(origin+'/media-access',{headers:{Cookie:cookie}});
    assert.equal(await hasMediaAccess(req),false);
    assert.deepEqual(await (await handleMediaAccess(req)).json(),{authenticated:false});
  }
});
test('wrong password and cross-origin submissions fail without issuing a cookie',async()=>{
  const wrong=await handleMediaAccess(login('deliberately-incorrect'));
  assert.equal(wrong.headers.get('location'),'/media?access=denied');assert.equal(wrong.headers.get('set-cookie'),null);
  assert.equal((await handleMediaAccess(login('anything','https://other.example'))).status,403);
});
test('correct password grants a secure cookie, tampering fails, logout clears it',{skip:!process.env.MEDIA_TEST_PASSWORD},async()=>{
  const response=await handleMediaAccess(login(process.env.MEDIA_TEST_PASSWORD));
  assert.equal(response.headers.get('location'),'/media');
  const cookie=response.headers.get('set-cookie');
  assert.match(cookie,/Secure; HttpOnly; SameSite=Strict/);
  const pair=cookie.split(';')[0];
  assert.equal(await hasMediaAccess(new Request(origin+'/media',{headers:{Cookie:pair}})),true);
  assert.equal(await hasMediaAccess(new Request(origin+'/media',{headers:{Cookie:pair+'0'}})),false);
  const out=await handleMediaAccess(new Request(origin+'/media-access',{method:'POST',headers:{Origin:origin},body:'action=logout'}));
  assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
});

test('public Media Center bypasses shared-password authentication only for published manifest files',async()=>{
  const file=manifest.documents[0].files.pdf;
  let reads=0;
  const bytes=await import('node:fs').then(fs=>fs.readFileSync(new URL('../../media-published/'+file.name,import.meta.url)));
  const env={ASSETS:{fetch:async()=>{reads++;return new Response(bytes);}}};
  const publicManifest={...manifest,publicAccess:true};
  const r=await handleMedia(new Request(origin+'/media-files/'+file.name),env,{config:publicManifest});
  assert.equal(r.status,200);assert.equal(reads,1);assert.match(r.headers.get('cache-control'),/public/);
  const unknown=await handleMedia(new Request(origin+'/media-files/not-published.pdf'),env,{config:publicManifest});
  assert.equal(unknown.status,404);assert.equal(reads,1);
});
