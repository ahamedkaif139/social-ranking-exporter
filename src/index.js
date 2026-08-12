export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API: server-side fetch for the allowed source host.
    if (url.pathname === "/api/fetch") {
      const target = url.searchParams.get("url");
      if (!target) {
        return json({ error: "Missing url parameter." }, 400);
      }

      let targetUrl;
      try {
        targetUrl = new URL(target);
      } catch {
        return json({ error: "Invalid URL." }, 400);
      }

      // Deliberately restricted: this is not an open proxy.
      const allowedHosts = new Set(["socialcounts.org", "www.socialcounts.org"]);
      if (!allowedHosts.has(targetUrl.hostname)) {
        return json({ error: "Only socialcounts.org URLs are allowed." }, 403);
      }
      if (targetUrl.protocol !== "https:") {
        return json({ error: "HTTPS is required." }, 400);
      }

      // Normal server-side request. No anti-bot bypass, CAPTCHA bypass,
      // authentication bypass, or header spoofing is performed.
      try {
        const upstream = await fetch(targetUrl.toString(), {
          method: "GET",
          headers: {
            "Accept": "text/html,application/xhtml+xml"
          },
          redirect: "follow"
        });

        const body = await upstream.text();
        return new Response(body, {
          status: upstream.status,
          headers: {
            "Content-Type": upstream.headers.get("content-type") || "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store"
          }
        });
      } catch (err) {
        return json({ error: "Upstream fetch failed.", detail: String(err) }, 502);
      }
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "social-ranking-exporter" });
    }

    return env.ASSETS.fetch(request);
  }
};

function json(data, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

