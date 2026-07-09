const fs = require('fs');
const path = require('path');

const TMDB_API_KEYS = [
  '174d0214bf933dd59b3d5ec68a0c967f',
  '5bf61a62fd4647aa7debed7d6f2db079'
];

const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';
const SITE_URL = 'https://u-tv-review.pages.dev';
const OUTPUT_DIR = path.join(process.cwd(), 'public');
const MAX_PAGES = 25;
const DELAY_MS = 200;

const EMBED_SERVERS = [
  { name: 'Server 1', url: 'https://vidsrc.to/embed/%TYPE%/%ID%' },
  { name: 'Server 2', url: 'https://vidsrc.xyz/embed/%TYPE%/%ID%' },
  { name: 'Server 3', url: 'https://embed.su/embed/%TYPE%/%ID%' },
  { name: 'Server 4', url: 'https://autoembed.to/%TYPE%/tmdb/%ID%' },
  { name: 'Server 5', url: 'https://vidlink.pro/%TYPE%/%ID%' },
  { name: 'Server 6', url: 'https://moviesapi.club/%TYPE%/%ID%' },
  { name: 'Server 7', url: 'https://2embed.org/embed/%TYPE%/%ID%' },
  { name: 'Server 8', url: 'https://embed.smashystream.com/%TYPE%/%ID%' },
  { name: 'Server 9', url: 'https://multiembed.cx/?video_id=%ID%&tmdb=1' },
  { name: 'Server 10', url: 'https://vidsrc.cc/v2/embed/%TYPE%/%ID%' }
];

const STATIC_PAGES = [
  { slug: 'about', title: 'About Us', desc: 'Learn more about U-TV HUB and our platform.' },
  { slug: 'dmca', title: 'DMCA Policy', desc: 'Read our content removal and copyright policy.' },
  { slug: 'disclaimer', title: 'Disclaimer', desc: 'Important legal notices regarding third-party content.' },
  { slug: 'contact', title: 'Contact', desc: 'Get in touch with our team for help and requests.' },
  { slug: 'privacy', title: 'Privacy Policy', desc: 'How we handle data and cookies.' },
  { slug: 'terms', title: 'Terms of Use', desc: 'Rules for using this website.' }
];

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

async function fetchWithFallback(endpoint, params = {}) {
  for (const apiKey of TMDB_API_KEYS) {
    try {
      const url = new URL(`${BASE_URL}${endpoint}`);
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('language', params.language || 'en-US');
      for (const [k, v] of Object.entries(params)) {
        if (k !== 'language' && v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
      }

      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (res.status === 401) continue;
      if (!res.ok) continue;
      const data = await res.json();

      if (data.results?.length || data.id) return data;
    } catch (_) {}
  }
  throw new Error(`TMDB failed: ${endpoint}`);
}

async function getContent(type) {
  const allItems = [];
  const endpoint = type === 'movie' ? '/movie/popular' : '/tv/popular';

  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const data = await fetchWithFallback(endpoint, { page });
      if (!data.results?.length) break;
      for (const item of data.results) {
        item.media_type_custom = type;
        allItems.push(item);
      }
    } catch (_) {
      break;
    }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  return allItems;
}

async function getContentDetails(type, id) {
  const [details, credits] = await Promise.all([
    fetchWithFallback(`/${type}/${id}`),
    fetchWithFallback(`/${type}/${id}/credits`).catch(() => ({ cast: [], crew: [] }))
  ]);
  return { ...details, credits };
}

function writeFileSafe(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function buildEmbedUrl(type, id, template) {
  return template.replace('%TYPE%', type).replace('%ID%', id);
}

function buildMovieHtml(item, details, type) {
  const title = item.title || item.name || 'Untitled';
  const poster = item.poster_path ? `${IMG_BASE}/w500${item.poster_path}` : '';
  const backdrop = item.backdrop_path ? `${IMG_BASE}/original${item.backdrop_path}` : poster;
  const releaseDate = item.release_date || item.first_air_date || 'N/A';
  const releaseYear = releaseDate !== 'N/A' ? new Date(releaseDate).getFullYear() : '';
  const runtime = type === 'movie'
    ? (details.runtime ? `${details.runtime} min` : 'N/A')
    : (details.episode_run_time?.length ? `${details.episode_run_time[0]} min` : 'N/A');

  const genres = (details.genres || []).map(g => g.name).join(', ');
  const castNames = (details.credits?.cast || []).slice(0, 10).map(c => c.name).filter(Boolean);
  const creatorOrDirector = type === 'movie'
    ? ((details.credits?.crew || []).find(c => c.job === 'Director')?.name || 'N/A')
    : ((details.created_by || []).map(c => c.name).join(', ') || 'N/A');

  const voteAverage = item.vote_average?.toFixed(1) || 'N/A';
  const voteCount = details.vote_count || 0;
  const tagline = details.tagline || '';
  const overview = details.overview || item.overview || 'No description available.';
  const pageUrl = `${SITE_URL}/${type}/${item.id}/`;

  const serverButtons = EMBED_SERVERS.map((s, i) => {
    const finalUrl = buildEmbedUrl(type, item.id, s.url);
    return `<button class="server-btn ${i === 0 ? 'active' : ''}" data-url="${finalUrl}">${escapeHtml(s.name)}</button>`;
  }).join('');

  const initialPlayerSrc = buildEmbedUrl(type, item.id, EMBED_SERVERS[0].url);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} (${releaseYear}) | U-TV HUB</title>
  <meta name="description" content="Watch ${escapeHtml(title)} (${releaseYear}). Rating ${voteAverage}/10, duration ${runtime}, genres ${escapeHtml(genres)}.">
  <link rel="canonical" href="${pageUrl}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta property="og:title" content="${escapeHtml(title)} (${releaseYear})">
  <meta property="og:description" content="${escapeHtml(overview).slice(0, 160)}">
  <meta property="og:image" content="${poster}">
  <meta property="og:type" content="${type === 'movie' ? 'video.movie' : 'video.tv_show'}">
  <meta property="og:url" content="${pageUrl}">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#050508;color:#e2e8f0;font-family:system-ui,sans-serif}
    .backdrop{position:fixed;inset:0;background:url('${backdrop}') no-repeat center/cover;filter:blur(25px) brightness(.25);z-index:-1}
    .container{max-width:1200px;margin:0 auto;padding:20px}
    .movie-box{background:rgba(14,15,22,.92);backdrop-filter:blur(12px);border-radius:28px;display:flex;flex-wrap:wrap;gap:35px;padding:30px;border:1px solid rgba(229,9,20,.3)}
    .poster{width:280px;border-radius:20px;box-shadow:0 20px 30px -10px rgba(0,0,0,.5)}
    .info{flex:1;min-width:280px}
    h1{font-size:2rem;margin-bottom:10px}
    .tagline{font-style:italic;color:#e50914;margin-bottom:15px;font-size:1rem}
    .meta{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px;color:#cbd5e1;font-size:.85rem}
    .meta span{background:#1e1f2a;padding:4px 12px;border-radius:20px}
    .overview{line-height:1.6;margin-bottom:20px}
    .cast-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
    .cast-item{background:#1e1f2a;padding:4px 14px;border-radius:30px;font-size:.8rem}
    .player-section{background:#0e0f16;border-radius:24px;padding:20px;margin-top:30px}
    .server-buttons{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:15px}
    .server-btn{background:#222;border:none;padding:8px 16px;border-radius:40px;color:#fff;cursor:pointer;font-size:.8rem}
    .server-btn.active,.server-btn:hover{background:#e50914}
    .video-container{position:relative;padding-bottom:56.25%;height:0;background:#000;border-radius:12px;overflow:hidden}
    .video-container iframe{position:absolute;inset:0;width:100%;height:100%;border:none}
    .ad-container{background:#0e0f16;margin:20px 0;padding:12px;border-radius:12px;text-align:center}
    .smart-link{display:inline-block;background:#e50914;color:#fff;padding:10px 20px;border-radius:40px;text-decoration:none;font-weight:bold}
    footer{text-align:center;padding:30px;margin-top:40px;border-top:1px solid #1e1f2a;font-size:.8rem}
    footer a{color:#e50914;text-decoration:none}
    @media (max-width:768px){.movie-box{flex-direction:column;align-items:center}.poster{width:200px}}
  </style>
</head>
<body>
<div class="backdrop"></div>
<div class="container">
  <div class="movie-box">
    <img class="poster" src="${poster}" alt="${escapeHtml(title)} poster">
    <div class="info">
      <h1>${escapeHtml(title)} (${releaseYear})</h1>
      ${tagline ? `<div class="tagline">"${escapeHtml(tagline)}"</div>` : ''}
      <div class="meta">
        <span>⭐ ${voteAverage}/10 (${voteCount} votes)</span>
        <span>📅 ${releaseDate}</span>
        <span>⏱️ ${runtime}</span>
        <span>🎭 ${escapeHtml(genres || 'General')}</span>
        <span>🎬 ${type === 'movie' ? 'Director' : 'Creator'}: ${escapeHtml(creatorOrDirector)}</span>
      </div>
      <p class="overview">${escapeHtml(overview)}</p>
      <div><strong>Star Cast:</strong><div class="cast-list">${castNames.map(name => `<div class="cast-item">${escapeHtml(name)}</div>`).join('')}</div></div>
    </div>
  </div>

  <div class="ad-container">
    <script async data-cfasync="false" src="https://pl28831972.effectivegatecpm.com/e1fcb13904d27c4fe4e794fb5b4db78d/invoke.js"></script>
    <div id="container-e1fcb13904d27c4fe4e794fb5b4db78d"></div>
  </div>

  <div class="player-section">
    <div class="server-buttons" id="serverButtons">${serverButtons}</div>
    <div class="video-container">
      <iframe id="playerFrame" src="${initialPlayerSrc}" allowfullscreen></iframe>
    </div>
  </div>

  <div class="ad-container">
    <a class="smart-link" href="https://www.effectivegatecpm.com/sa8mca36sv?key=3711015d24018cf89ccb362976c4a2e0" target="_blank" rel="noopener noreferrer">Open Smart Link</a>
  </div>

  <footer>
    <p>© U-TV HUB | TMDB data | DMCA: <a href="mailto:help.wowmovies@gmail.com">help.wowmovies@gmail.com</a></p>
    <p><a href="/">Home</a> | <a href="/sitemap.xml">Sitemap</a></p>
  </footer>
</div>

<script>
  document.querySelectorAll('.server-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('playerFrame').src = btn.dataset.url;
    });
  });
</script>
</body>
</html>`;
}

function renderStaticPage(title, desc, slug) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | U-TV HUB</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <link rel="canonical" href="${SITE_URL}/${slug}/">
  <meta name="robots" content="index,follow">
</head>
<body>
  <main style="max-width:800px;margin:40px auto;padding:20px;font-family:system-ui,sans-serif;">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(desc)}</p>
    <p><a href="/">Back to Home</a></p>
  </main>
</body>
</html>`;
}

function renderHomePage(movies) {
  const cards = movies.map(m => {
    const poster = m.poster_path ? `${IMG_BASE}/w342${m.poster_path}` : 'https://placehold.co/342x513?text=No+Poster';
    return `
    <div class="movie-card" data-id="${m.id}">
      <div class="poster-wrap">
        <img src="${poster}" alt="${escapeHtml(m.title || m.name || 'Untitled')}" loading="lazy">
        <span class="card-rating">★ ${(m.vote_average || 0).toFixed(1)}</span>
      </div>
      <div class="card-details">
        <div class="card-title">${escapeHtml(m.title || m.name || 'Untitled')}</div>
      </div>
    </div>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>U-TV REVIEW | Movies, Web Series, Trailers & Contact</title>
<meta name="description" content="U-TV REVIEW provides movie and web series discovery, categories, trending content, business details, and easy contact access.">
<link rel="canonical" href="${SITE_URL}/">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:title" content="U-TV REVIEW | Movies, Web Series, Trailers & Contact">
<meta property="og:description" content="Movie and web series discovery with trending content, business details, and contact options.">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE_URL}/">
<script src="https://cdn.tailwindcss.com"></script>
<style>
body{background:radial-gradient(circle at top,#12131a 0%,#050508 100%);color:#fff;font-family:Inter,sans-serif}
.movie-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media(min-width:640px){.movie-grid{grid-template-columns:repeat(4,1fr)}}
@media(min-width:1024px){.movie-grid{grid-template-columns:repeat(6,1fr)}}
.movie-card{background:#0e1017;border-radius:14px;border:1px solid rgba(255,255,255,.04);overflow:hidden;cursor:pointer;transition:.3s cubic-bezier(0.4, 0, 0.2, 1)}
.movie-card:hover{transform:translateY(-5px) scale(1.02);border-color:#ea4c23;box-shadow:0 10px 20px rgba(234,76,35,0.15)}
.poster-wrap{position:relative;aspect-ratio:2/3}
.poster-wrap img{width:100%;height:100%;object-fit:cover}
.card-rating{position:absolute;top:8px;left:8px;background:rgba(7,8,14,.9);color:#ffb800;font-size:.7rem;font-weight:900;padding:3px 7px;border-radius:6px;backdrop-filter:blur(4px)}
.card-details{padding:12px}
.card-title{font-size:.8rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style>
</head>
<body>
<header style="position:sticky;top:0;z-index:50;background:#07080e/90;border-bottom:1px solid #1c1f30;padding:16px;backdrop-filter:blur(10px);display:flex;justify-content:space-between;align-items:center;">
  <a href="/" style="font-weight:900;font-size:24px;color:#fff;text-decoration:none;">U-TV<span style="color:#ea4c23;">.REVIEW</span></a>
  <div style="font-size:10px;letter-spacing:.15em;background:#3b0a0a;border:1px solid #7f1d1d;color:#f87171;padding:6px 10px;border-radius:999px;font-weight:700;">LIVE</div>
</header>

<main style="padding:24px 16px;max-width:1600px;margin:0 auto;">
  <section style="margin-bottom:24px;padding:20px;border:1px solid #1c1f30;border-radius:24px;background:#0b0d16;">
    <h1 style="font-size:clamp(1.8rem,4vw,3.5rem);line-height:1.1;margin-bottom:10px;font-weight:900;">U-TV REVIEW</h1>
    <p style="color:#cbd5e1;max-width:900px;">Movie and web series discovery with trending content, categories, contact pages, and direct navigation.</p>
  </section>

  <section style="margin-bottom:20px;">
    <h2 style="font-size:1.1rem;border-left:4px solid #ea4c23;padding-left:12px;margin-bottom:12px;">Trending Content</h2>
    <div class="movie-grid">${cards}</div>
  </section>

  <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:28px;">
    ${STATIC_PAGES.map(p => `<a href="/${p.slug}/" style="background:#14151f;border:1px solid #20212c;border-radius:16px;padding:14px;text-decoration:none;display:block;color:inherit;"><strong style="display:block;margin-bottom:6px;color:#fff;">${escapeHtml(p.title)}</strong><span style="font-size:.8rem;color:#9da0b5;line-height:1.5;">${escapeHtml(p.desc)}</span></a>`).join('')}
  </section>

  <section style="margin:24px 0;padding:16px;border:1px solid #20212c;border-radius:18px;background:#0f1017;">
    <h2 style="font-size:1rem;margin-bottom:10px;">Contact Support</h2>
    <p>Have issues or queries? Reach out via official support.</p>
    <p style="margin-top:10px;"><a href="mailto:help.wowmovies@gmail.com">help.wowmovies@gmail.com</a></p>
  </section>
</main>

<footer style="background:#06070a;padding:20px 16px;text-align:center;font-size:.75rem;border-top:1px solid #14151f;margin-top:30px;">
  <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px;">
    <a href="/">Home</a> |
    <a href="/about/">About Us</a> |
    <a href="/dmca/">DMCA</a> |
    <a href="/disclaimer/">Disclaimer</a> |
    <a href="/contact/">Contact</a> |
    <a href="/privacy/">Privacy</a> |
    <a href="/terms/">Terms</a>
  </div>
  <p style="color:#9da0b5;margin-top:10px;">© 2026 U-TV REVIEW | All rights reserved.</p>
</footer>

<script>
document.querySelectorAll('.movie-card').forEach(card=>{
  card.addEventListener('click',()=>location.href='/movie/'+card.dataset.id+'/');
});
</script>
</body>
</html>`;
}

function sitemapXml(urls) {
  const now = new Date().toISOString();
  const items = urls.map(u => `<url><loc>${u}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</urlset>`;
}

(async () => {
  if (!TMDB_API_KEYS.length) {
    console.error('ERROR: Set TMDB_API_KEY_1 environment variable');
    process.exit(1);
  }

  if (fs.existsSync(OUTPUT_DIR)) fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const allMovies = [];
  for (let page = 1; allMovies.length < MAX_PAGES * 20 && page <= 5; page++) {
    const data = await fetchWithFallback('/movie/popular', { page });
    if (!data.results?.length) break;
    for (const item of data.results) {
      if (!allMovies.find(m => m.id === item.id)) allMovies.push(item);
    }
  }

  const selected = allMovies.slice(0, MAX_PAGES * 4);
  const sitemapUrls = [`${SITE_URL}/`];

  for (const page of STATIC_PAGES) {
    const dir = path.join(OUTPUT_DIR, page.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), renderStaticPage(page.title, page.desc, page.slug));
    sitemapUrls.push(`${SITE_URL}/${page.slug}/`);
  }

  for (const movie of selected) {
    const details = await getContentDetails('movie', movie.id);
    const movieDir = path.join(OUTPUT_DIR, 'movie', String(movie.id));
    fs.mkdirSync(movieDir, { recursive: true });
    fs.writeFileSync(path.join(movieDir, 'index.html'), buildMovieHtml(movie, details, 'movie'));
    sitemapUrls.push(`${SITE_URL}/movie/${movie.id}/`);
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), renderHomePage(selected));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap.xml'), sitemapXml(sitemapUrls));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'robots.txt'), `User-agent: *
Allow: /
Sitemap: ${SITE_URL}/sitemap.xml
`);
  fs.writeFileSync(path.join(OUTPUT_DIR, '_redirects'), `/about /about/ 301
/dmca /dmca/ 301
/disclaimer /disclaimer/ 301
/contact /contact/ 301
/privacy /privacy/ 301
/terms /terms/ 301
/movie/* /movie/:splat/ 200
`);
  fs.writeFileSync(path.join(OUTPUT_DIR, '_headers'), `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Cache-Control: public, max-age=0, must-revalidate
  X-Robots-Tag: index,follow
`);

  const notFound = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="3; url=/"><title>404 - Page Not Found | U-TV HUB</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0c10;color:#e2e8f0;font-family:system-ui,sans-serif;padding:20px}.box{max-width:560px;width:100%;background:#0f1017;border:1px solid #20212c;border-radius:24px;padding:28px;text-align:center}a{display:inline-block;background:#ea4c23;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:700}</style></head><body><div class="box"><h1>404 - Page Not Found</h1><p>Jo page aap dhoondh rahe hain wo available nahi hai.</p><a href="/">Go Home</a></div></body></html>`;
  fs.writeFileSync(path.join(OUTPUT_DIR, '404.html'), notFound);

  console.log(`Done: ${selected.length} movie pages generated.`);
})();
