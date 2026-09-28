import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleSocialMetadata } from '../social-metadata.mjs';
const html=fs.readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
const env={ASSETS:{fetch:async()=>new Response(html)}};
test('programme metadata is available without JavaScript and uses the current social artwork',async()=>{
 const r=await handleSocialMetadata(new Request('https://circ-coimbra.org/programa'),env);
 const body=await r.text();
 assert.match(body,/<title>Programa científico \| CIRC 2027/);
 assert.match(body,/property="og:url" content="https:\/\/circ-coimbra.org\/programa"/);
 assert.match(body,/property="og:image" content="https:\/\/circ-coimbra.org\/identity2027\/circ2027-social-20260928.jpg"/);
 assert.match(body,/property="og:image:width" content="1734"/);
 assert.doesNotMatch(body,/save-the-date-2027/);
 assert.equal(await handleSocialMetadata(new Request('https://circ-coimbra.org/media'),env),null);
 assert.equal(await (await handleSocialMetadata(new Request('https://circ-coimbra.org/programa/',{method:'HEAD'}),env)).text(),'');
});
