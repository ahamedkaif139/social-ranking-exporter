SOCIAL RANKING EXPORTER — CLOUDFLARE WORKERS

Project structure:
- wrangler.jsonc
- public/index.html
- public/app.js
- src/index.js

What it does:
1. Cloudflare Worker serves the website.
2. /api/fetch performs a normal server-side HTTPS fetch to socialcounts.org.
3. The browser parses ranking cards.
4. Subscriber, view and video values are converted to plain integers.
5. CSV/JSON exports contain numeric values.

Examples:
512M      -> 512000000
35B       -> 35000000000
26.8K     -> 26800
199M      -> 199000000
0         -> 0

CSV columns:
Rank, Channel, Subscribers, Views, Videos, Country, Channel URL

Deployment:
Use a current Wrangler installation and deploy from the project root:
  npx wrangler login
  npx wrangler deploy

Cloudflare currently recommends Workers Static Assets for new full-stack/static projects. This project uses that configuration with a Worker API route.

Important:
The Worker is deliberately not an open proxy. It only accepts HTTPS URLs whose hostname is socialcounts.org or www.socialcounts.org. It does not bypass CAPTCHA, authentication, anti-bot protections, rate limits, or other access controls. Use it only where the source site's rules permit the requests.

If SocialCounts changes its HTML structure, the parser may need an update.
