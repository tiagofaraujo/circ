// Serve crawler-readable programme metadata; social crawlers need no JavaScript.
export async function handleSocialMetadata(request, env) {
  const url = new URL(request.url);
  if (!['/programa', '/programa/'].includes(url.pathname)) return null;
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status:405, headers:{Allow:'GET, HEAD'}});
  const response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
  if (!response.ok) return response;
  const title = 'Programa científico | CIRC 2027 · 8–10 abril · Coimbra';
  const description = 'Consulte o programa provisório do CIRC 2027: cursos pré-congresso a 8 de abril e sessões científicas a 9 e 10, no Convento São Francisco, Coimbra.';
  const canonical = 'https://circ-coimbra.org/programa';
  const html = (await response.text())
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace(/(<link\s+rel="canonical"\s+href=")[^"]*/, '$1'+canonical)
    .replace(/(<meta\s+(?:name|property)="(?:og:title|twitter:title)"\s+content=")[^"]*/g, '$1'+title)
    .replace(/(<meta\s+(?:name|property)="(?:description|og:description|twitter:description)"\s+content=")[^"]*/g, '$1'+description)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*/, '$1'+canonical);
  return new Response(request.method === 'HEAD' ? null : html, {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
}
