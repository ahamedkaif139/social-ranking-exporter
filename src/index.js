export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    if (u.pathname === '/api/fetch') {
      const target = u.searchParams.get('url');
      if (!target) return json({ error: 'Missing url' }, 400);
      let t;
      try {
        t = new URL(target);
      } catch {
        return json({ error: 'Invalid URL' }, 400);
      }
      if (
        t.protocol !== 'https:' ||
        !['socialcounts.org', 'www.socialcounts.org'].includes(t.hostname)
      ) {
        return json({ error: 'Only socialcounts.org HTTPS URLs are allowed' }, 403);
      }
      try {
        const r = await fetch(t.href, {
          headers: {
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        });
        const body = await r.text();
        return new Response(body, {
          status: r.status,
          headers: {
            'Content-Type': r.headers.get('content-type') || 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
          },
        });
      } catch (e) {
        return json({ error: 'Upstream fetch failed', detail: String(e) }, 502);
      }
    }
    if (u.pathname === '/api/health') return json({ ok: true });
    return env.ASSETS.fetch(request);
  },
};

function json(x, status = 200) {
  return new Response(JSON.stringify(x), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
