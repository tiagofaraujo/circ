import { handleMediaAccess, hasMediaAccess } from './media-auth.mjs';
import manifest from '../src/data/mediaCenter.json' with { type: 'json' };
const types = {pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
const unavailable = () => new Response('Not found', {status: 404, headers: {'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex'}});
export async function handleMedia(request, env, { preview = false, config = manifest, authorize = hasMediaAccess } = {}) {
  const accessResponse = await handleMediaAccess(request);
  if (accessResponse) return accessResponse;
  const url = new URL(request.url);
  const path = url.pathname;
  if (!['/media', '/media/', '/press', '/press/'].includes(path) && !path.startsWith('/media-files/')) return null;
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status: 405, headers: {Allow: 'GET, HEAD'}});
  if (path === '/press' || path === '/press/') return new Response(null, {status: 301, headers: {Location: '/media' + url.search, 'Cache-Control': 'no-store'}});
  if (!config.published && !preview) return unavailable();
  if (path.startsWith('/media-files/')) {
    if (!preview && !await authorize(request)) return new Response('Acesso reservado à imprensa.', {status:401,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Vary':'Cookie'}});
    const file = config.documents.filter(d => d.status === 'published' || preview).flatMap(d => Object.entries(d.files)).find(([,f]) => path === '/media-files/' + f.name);
    if (!file) return unavailable();
    const [ext, meta] = file;
    const res = await env.ASSETS.fetch(new Request(request.url, {method:'GET'}));
    if (!res.ok) return unavailable();
    const bytes = new Uint8Array(await res.arrayBuffer());
    const signature = ext === 'pdf' ? new TextDecoder().decode(bytes.slice(0,5)) === '%PDF-' : bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
    if (!signature || bytes.length !== meta.bytes) return unavailable();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== meta.sha256) return unavailable();
    return new Response(request.method === 'HEAD' ? null : bytes, {headers: {
      'Content-Type': types[ext], 'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${meta.name}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'Vary':'Cookie',
    }});
  }
  if (path === '/media/') return new Response(null, {status:301, headers:{Location:'/media' + url.search}});
  const response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
  let html = await response.text();
  const description = 'Informação e materiais para imprensa — CIRC 2027. Nota de imprensa, Fact Sheet e contacto de imprensa.';
  html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>Media Center | CIRC 2027</title>')
    .replace(/(<link\s+rel="canonical"\s+href=")[^"]*/, '$1https://circ-coimbra.org/media')
    .replace(/(<meta\s+(?:name|property)="(?:description|og:description|twitter:description)"\s+content=")[^"]*/g, '$1' + description)
    .replace(/(<meta\s+(?:name|property)="(?:og:title|twitter:title)"\s+content=")[^"]*/g, '$1Media Center | CIRC 2027')
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*/, '$1https://circ-coimbra.org/media');
  return new Response(request.method === 'HEAD' ? null : html, {status:response.status, headers:{'Content-Type':'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag':'noindex, nofollow', 'Vary':'Cookie'}});
}
