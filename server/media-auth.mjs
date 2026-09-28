// Only a salted credential verifier is committed. Neither the password nor bearer cookie is stored.
const salt = 'dfcd6b55bd93944c0b096dcc37121003';
const verifier = 'afbdf7fe6b58c72fc8329284c3a786950ebe2f23d8265029e17ae50b351834d6';
const cookieName = '__Host-circ_media';
const headers = {'Cache-Control':'private, no-store', 'X-Robots-Tag':'noindex, nofollow', 'Vary':'Cookie'};
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
export async function deriveMediaToken(password) {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:Uint8Array.from(salt.match(/../g),b=>parseInt(b,16)),iterations:100000},key,256));
}
async function validToken(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return false;
  const digest = hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
  let diff = 0;
  for(let i=0;i<verifier.length;i++) diff |= digest.charCodeAt(i)^verifier.charCodeAt(i);
  return diff === 0;
}
export async function hasMediaAccess(request) {
  const cookies = (request.headers.get('Cookie') || '').split(';').map(s=>s.trim());
  const values = cookies.filter(s=>s.startsWith(cookieName+'='));
  return values.length === 1 && validToken(values[0].slice(cookieName.length+1));
}
export async function handleMediaAccess(request) {
  const url = new URL(request.url);
  if (url.pathname !== '/media-access') return null;
  if(request.method === 'GET') return Response.json({authenticated:await hasMediaAccess(request)}, {headers});
  if(request.method !== 'POST') return new Response(null,{status:405,headers:{...headers,Allow:'GET, POST'}});
  if(request.headers.get('Origin') !== url.origin) return new Response('Forbidden',{status:403,headers});
  if(Number(request.headers.get('Content-Length') || 0)>2048) return new Response(null,{status:413,headers});
  const body = await request.text();
  if(body.length>2048) return new Response(null,{status:413,headers});
  const form = new URLSearchParams(body);
  if(form.get('action')==='logout') return new Response(null,{status:303,headers:{...headers,Location:'/media','Set-Cookie':cookieName+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'}});
  const password = form.get('password') || '';
  const token = password.length<=128 ? await deriveMediaToken(password) : '';
  if(!await validToken(token)) return new Response(null,{status:303,headers:{...headers,Location:'/media?access=denied'}});
  // Session cookie: cleared on logout/browser session end; treat as a password-equivalent bearer credential.
  return new Response(null,{status:303,headers:{...headers,Location:'/media','Set-Cookie':cookieName+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict'}});
}
