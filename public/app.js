let rows = [],
  running = false,
  pagesDone = 0;
const $ = (id) => document.getElementById(id);
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

function num(v) {
  const m = clean(v)
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .toUpperCase()
    .match(/^(\d+(?:\.\d+)?)([KMBT])?$/);
  if (!m) return 0;
  return Math.round(
    Number(m[1]) * ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2]] || 1)
  );
}

function parse(html, base) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  const text = clean(d.body?.innerText || d.body?.textContent || '');
  const out = [];
  const seen = new Set();

  // Primary parser: matches current SocialCounts layout
  // "# 1 MrBeast US Subscribers 512M Views 136B Videos 997 512M subs"
  const re =
    /#\s*(\d+)\s+(.+?)\s+(?:([A-Z]{2}|Unknown)\s+)?Subscribers\s+(\d+(?:\.\d+)?\s*[KMBT]?)\s+Views\s+(\d+(?:\.\d+)?\s*[KMBT]?)\s+Videos\s+(\d+(?:\.\d+)?\s*[KMBT]?)\s+(\d+(?:\.\d+)?\s*[KMBT]?)\s*subs?/gi;

  let m;
  while ((m = re.exec(text))) {
    const rank = +m[1];
    if (!rank || seen.has(rank)) continue;
    seen.add(rank);
    let name = clean(m[2]).replace(
      /^(Most subscribed|Most viewed|Channels|Videos)\s+/i,
      ''
    );
    // Guard against leftover metric words in name
    name = name.replace(/\s+(Subscribers|Views|Videos)\s*$/i, '').trim();
    if (!name) continue;
    out.push({
      rank,
      name,
      subscribers: num(m[4]),
      views: num(m[5]),
      videos: num(m[6]),
      country: m[3] || '',
      channelUrl: '',
    });
  }

  // Fallback for older / alternate text layouts
  if (!out.length) {
    const re2 =
      /#\s*(\d+)\s+(.+?)(?=\s+\d+(?:\.\d+)?\s*[KMBT]?\s*subs?\b)/gi;
    while ((m = re2.exec(text))) {
      const rank = +m[1];
      let name = clean(m[2])
        .replace(/^(Most subscribed|Most viewed|Channels|Videos)\s+/i, '')
        .replace(/\s+(US|IN|BR|KR|MX|TR|Unknown|[A-Z]{2})\s+(Subscribers|Views).*/i, '')
        .trim();
      const sm = text
        .slice(re2.lastIndex)
        .match(/^\s*(\d+(?:\.\d+)?\s*[KMBT]?)\s*subs?/i);
      if (!name || seen.has(rank)) continue;
      seen.add(rank);
      out.push({
        rank,
        name,
        subscribers: sm ? num(sm[1]) : 0,
        views: 0,
        videos: 0,
        country: '',
        channelUrl: '',
      });
    }
  }

  // Attach YouTube channel URLs from /youtube-channel-analytics/UC... links (appear in rank order)
  const ids = [];
  const idSeen = new Set();
  for (const a of d.querySelectorAll('a[href*="/youtube-channel-analytics/"]')) {
    const href = a.getAttribute('href') || '';
    const mm = href.match(/\/youtube-channel-analytics\/(UC[\w-]+)/i);
    if (mm && !idSeen.has(mm[1])) {
      idSeen.add(mm[1]);
      ids.push(mm[1]);
    }
  }
  // Also scan raw HTML in case links are outside simple <a> text extraction
  if (ids.length < out.length) {
    const rawIds = [...html.matchAll(/\/youtube-channel-analytics\/(UC[\w-]+)/gi)].map(
      (x) => x[1]
    );
    for (const id of rawIds) {
      if (!idSeen.has(id)) {
        idSeen.add(id);
        ids.push(id);
      }
    }
  }
  for (let i = 0; i < out.length && i < ids.length; i++) {
    out[i].channelUrl = 'https://www.youtube.com/channel/' + ids[i];
  }

  // Optional enrichment from element text (country / views already covered by primary regex)
  for (const el of d.querySelectorAll(
    'a,article,li,[class*="card"],[class*="channel"],[class*="ranking"]'
  )) {
    const t = clean(el.innerText || el.textContent || '');
    const rm = t.match(/#\s*(\d+)\b/);
    if (!rm) continue;
    const r = out.find((x) => x.rank === +rm[1]);
    if (!r) continue;
    if (!r.country) {
      const cm = t.match(/\b([A-Z]{2}|Unknown)\b/);
      if (cm) r.country = cm[1];
    }
  }

  out.sort((a, b) => a.rank - b.rank);
  return out;
}

function render() {
  const b = $('tbody');
  b.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    [r.rank, r.name, r.subscribers, r.views, r.videos, r.country, r.channelUrl].forEach(
      (v) => {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      }
    );
    b.appendChild(tr);
  }
  $('records').textContent = rows.length.toLocaleString();
  $('pagesDone').textContent = pagesDone;
  $('subsTotal').textContent = rows
    .reduce((a, r) => a + r.subscribers, 0)
    .toLocaleString();
  $('withViews').textContent = rows.filter((r) => r.views > 0).length;
}

function msg(x, s) {
  $('status').textContent = x;
  $('state').textContent = s;
}

async function get(u) {
  const r = await fetch('/api/fetch?url=' + encodeURIComponent(u));
  if (!r.ok) throw Error('Worker returned HTTP ' + r.status);
  return r.text();
}

async function start() {
  if (running) return;
  running = true;
  rows = [];
  pagesDone = 0;
  render();
  const base = $('url').value;
  const total = Math.max(1, +$('pages').value || 1);
  for (let p = 1; p <= total && running; p++) {
    const u = new URL(base);
    u.searchParams.set('page', p);
    u.searchParams.set('limit', $('limit').value || 100);
    msg('Fetching page ' + p + ' of ' + total + '\n' + u.href, 'Running');
    try {
      const data = parse(await get(u.href), u.href);
      if (!data.length)
        throw Error('No ranking entries found in the returned SocialCounts HTML.');
      rows.push(...data);
      const seen = new Set();
      rows = rows.filter((r) => {
        const key = r.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      pagesDone = p;
      $('bar').style.width = (p / total) * 100 + '%';
      render();
      msg('Page ' + p + ' complete. Detected ' + data.length + ' entries.', 'Running');
    } catch (e) {
      running = false;
      msg('Stopped on page ' + p + '\n' + e.message, 'Error');
      return;
    }
    if (p < total)
      await new Promise((r) =>
        setTimeout(r, Math.max(1000, +$('delay').value || 2000))
      );
  }
  running = false;
  msg('Finished: ' + rows.length + ' unique channels.', 'Done');
}

function dl(data, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
}

$('start').onclick = start;
$('stop').onclick = () => {
  running = false;
  msg('Stopped.', 'Stopped');
};
$('clear').onclick = () => {
  running = false;
  rows = [];
  pagesDone = 0;
  $('bar').style.width = '0';
  render();
  msg('Cleared.', 'Ready');
};
$('csv').onclick = () => {
  if (!rows.length) return alert('No data');
  const q = (v) => '"' + String(v ?? '').replaceAll('"', '""') + '"';
  dl(
    '\ufeffRank,Channel,Subscribers,Views,Videos,Country,Channel URL\n' +
      rows
        .map((r) =>
          [r.rank, r.name, r.subscribers, r.views, r.videos, r.country, r.channelUrl]
            .map(q)
            .join(',')
        )
        .join('\n'),
    'socialcounts-ranking.csv',
    'text/csv'
  );
};
$('json').onclick = () => {
  if (!rows.length) return alert('No data');
  dl(JSON.stringify(rows, null, 2), 'socialcounts-ranking.json', 'application/json');
};
render();
