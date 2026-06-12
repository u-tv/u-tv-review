const fs = require('fs');
const path = require('path');

const TMDB_API_KEYS = [process.env.TMDB_API_KEY_1 || '', process.env.TMDB_API_KEY_2 || ''].filter(Boolean);
const OMDB_API_KEY = process.env.OMDB_API_KEY || '';
const ADSTERRA_POPUNDER_CODE = process.env.ADSTERRA_POPUNDER_CODE || '';
const SITE_URL = process.env.SITE_URL || 'https://u-tv-review.pages.dev';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';
const OUT_DIR = './';
const MAX_MOVIES = 200;
const DELAY_MS = 120;

const LANGS = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' }
];

const PAGES = ['top_rated', 'now_playing', 'popular'];

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(text = '') {
  return String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'movie';
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function fetchTmdb(endpoint, params = {}) {
  for (const key of TMDB_API_KEYS) {
    if (!key) continue;
    try {
      const u = new URL(`${BASE_URL}${endpoint}`);
      u.searchParams.set('api_key', key);
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
      }
      return await fetchJson(u.toString());
    } catch (e) {}
  }
  throw new Error(`TMDB failed: ${endpoint}`);
}

async function fetchOmdb(imdbId) {
  if (!imdbId || !OMDB_API_KEY) return null;
  try {
    const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(OMDB_API_KEY)}`;
    const data = await fetchJson(url);
    return data.Response === 'True' ? data : null;
  } catch (e) {
    return null;
  }
}

function stars(v = 0) {
  const n = Math.max(0, Math.min(5, Math.round(v / 2)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function qualityLabel(v = 0) {
  if (v >= 8) return 'Blockbuster';
  if (v >= 6.5) return 'Superhit';
  if (v >= 5) return 'Hit';
  return 'Flop';
}

function wordLimit(text, minWords = 520, maxWords = 980) {
  let out = String(text || '').trim();
  const words = out.split(/s+/).filter(Boolean);
  if (words.length > maxWords) out = words.slice(0, maxWords).join(' ');
  while (out.split(/s+/).filter(Boolean).length < minWords) {
    out += ' ' + 'This movie remains connected to its cast, crew, release date, rating, genres, trailer, and box office so the page stays useful and complete.';
  }
  return out;
}

function makeStory(details, lang) {
  const title = details.title || 'Untitled';
  const overview = details.overview || '';
  const storyMap = {
    en: `This review page for ${title} is generated from live TMDb data. ${overview}`,
    hi: `${title} के लिए यह review page live TMDb data से generate किया गया है। ${overview}`,
    es: `Esta página de reseña de ${title} se genera con datos en vivo de TMDb. ${overview}`,
    fr: `Cette page de critique pour ${title} est générée à partir des données TMDb en direct. ${overview}`,
    de: `Diese Bewertungsseite für ${title} wird aus Live-TMDb-Daten generiert. ${overview}`,
    it: `Questa pagina di recensione per ${title} è generata da dati live TMDb. ${overview}`,
    ja: `${title} のレビューは、ライブ TMDb データから生成されています。${overview}`,
    ko: `${title} 리뷰 페이지는 실시간 TMDb 데이터로 생성됩니다. ${overview}`,
    pa: `${title} ਲਈ ਇਹ review page live TMDb data ਤੋਂ ਬਣਾਇਆ ਗਿਆ ਹੈ। ${overview}`,
    te: `${title} కోసం ఈ review page live TMDb data తో generate చేయబడింది. ${overview}`
  };
  return wordLimit(storyMap[lang] || storyMap.en);
}

async function getMovieDetails(id) {
  const [details, credits, videos, external, keywords] = await Promise.all([
    fetchTmdb(`/movie/${id}`),
    fetchTmdb(`/movie/${id}/credits`),
    fetchTmdb(`/movie/${id}/videos`).catch(() => ({ results: [] })),
    fetchTmdb(`/movie/${id}/external_ids`).catch(() => ({})),
    fetchTmdb(`/movie/${id}/keywords`).catch(() => ({ keywords: [] }))
  ]);

  const data = {
    ...details,
    cast: (credits.cast || []).slice(0, 20),
    crew: credits.crew || [],
    trailer: (videos.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube') || null,
    imdb_id: external.imdb_id || '',
    keywords: (keywords.keywords || []).map(k => k.name).slice(0, 12)
  };

  data.director = data.crew.find(p => p.job === 'Director')?.name || 'N/A';
  data.writer = data.crew.find(p => ['Screenplay', 'Writer', 'Story'].includes(p.job))?.name || 'N/A';
  data.hero = data.cast[0]?.name || 'N/A';
  data.heroine = data.cast[1]?.name || 'N/A';
  data.villain = data.cast.find(p => /villain|antagonist|killer|nemesis/i.test(p.character || ''))?.name || 'N/A';

  if (data.imdb_id) {
    const omdb = await fetchOmdb(data.imdb_id);
    if (omdb) {
      data.imdbRating = omdb.imdbRating || '';
      data.imdbVotes = omdb.imdbVotes || '';
      data.metascore = omdb.Metascore || '';
      data.awards = omdb.Awards || '';
      data.boxOffice = omdb.BoxOffice || '';
      data.plot = omdb.Plot || data.overview || '';
    }
  }

  return data;
}

function renderIndexPage(movies) {
  const cards = movies.map(m => {
    const poster = m.poster_path ? `${IMG_BASE}/w342${m.poster_path}` : 'https://placehold.co/342x513?text=No+Poster';
    return `
    <div class="movie-card" data-id="${m.id}">
      <div class="poster-wrap">
        <img src="${poster}" alt="${escapeHtml(m.title)}" loading="lazy">
        <span class="card-rating">★ ${(m.vote_average || 0).toFixed(1)}</span>
      </div>
      <div class="card-details">
        <div class="card-title">${escapeHtml(m.title)}</div>
      </div>
    </div>`;
  }).join('');

  const adCode = ADSTERRA_POPUNDER_CODE ? `
${ADSTERRA_POPUNDER_CODE}
` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>U-TV REVIEW – Movie Analysis, Reviews & Ratings</title>
<meta name="description" content="In-depth movie reviews, ratings, cast, box office analysis. Latest from Bollywood, Hollywood, South, and Web Series.">
<link rel="canonical" href="${SITE_URL}/">
<link rel="sitemap" href="/sitemap.xml">
<meta name="robots" content="index,follow">
<script src="https://cdn.tailwindcss.com"></script>
<style>
body{background:radial-gradient(circle at top,#1a1a1a 0%,#050505 100%);color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif}
.movie-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
@media(min-width:640px){.movie-grid{grid-template-columns:repeat(4,1fr)}}
@media(min-width:1024px){.movie-grid{grid-template-columns:repeat(6,1fr)}}
.movie-card{background:#121212;border-radius:12px;border:1px solid rgba(255,255,255,.05);overflow:hidden;cursor:pointer;transition:.25s}
.movie-card:hover{transform:translateY(-4px);border-color:#e50914}
.poster-wrap{position:relative;aspect-ratio:2/3}
.poster-wrap img{width:100%;height:100%;object-fit:cover}
.card-rating{position:absolute;top:6px;left:6px;background:rgba(7,8,14,.85);color:#ffb800;font-size:.65rem;font-weight:800;padding:2px 6px;border-radius:4px}
.card-details{padding:10px}
.card-title{font-size:.75rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:none;align-items:center;justify-content:center;padding:16px}
.drawer{position:fixed;top:0;left:-320px;width:300px;height:100%;background:#0b0d16;z-index:999;transition:left .3s}
.drawer.open{left:0}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);display:none;z-index:998}
.section-title{font-size:1.2rem;font-weight:800;border-left:4px solid #e50914;padding-left:12px;margin:1.5rem 0 1rem}
</style>
${adCode}
</head>
<body class="min-h-screen">
<header class="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-red-600 p-3 md:p-4 flex justify-between items-center shadow-lg">
  <div class="flex items-center gap-2">
    <button onclick="toggleSideMenu()" class="text-red-500 text-xl">☰</button>
    <a href="/" class="font-black text-2xl md:text-3xl text-white">U-TV<span class="text-red-500">.REVIEW</span></a>
  </div>
  <div class="text-xs text-red-500 font-bold">SYSTEM ACTIVE</div>
</header>

<div id="drawer" class="drawer p-6"></div>
<div id="overlay" class="overlay" onclick="toggleSideMenu()"></div>

<div id="langModal" class="modal">
  <div class="bg-[#11131e] border border-[#1c1f30] max-w-lg w-full rounded-2xl p-6 relative">
    <h3 class="text-center font-black text-xl text-white mb-4">SELECT LANGUAGE</h3>
    <div class="grid grid-cols-2 gap-3">
      ${LANGS.map(l => `<button onclick="startTimer('${l.code}')" class="p-3 bg-[#181a29] border border-[#23273d] rounded-xl">${l.name}<div class="text-[11px] text-zinc-500">${l.native}</div></button>`).join('')}
    </div>
    <div id="countdown" class="hidden absolute inset-0 bg-[#07080e] rounded-2xl flex-col items-center justify-center text-center">
      <div class="text-5xl font-black text-[#ea4c23]" id="countDigits">10s</div>
      <div class="text-xs text-zinc-400 mt-2">Processing selected language</div>
    </div>
  </div>
</div>

<main class="pt-8 pb-10 px-4 max-w-[1600px] mx-auto">
  <div class="rounded-2xl bg-gradient-to-br from-[#181a29] via-[#0b0d16] to-black border border-[#1c1f30] p-6 md:p-8 mb-6">
    <h1 class="text-2xl md:text-4xl font-black text-white">AUTOMATED MULTILINGUAL MOVIE REVIEW ENGINE</h1>
    <p class="text-sm text-zinc-400 mt-2">Tap any poster, choose a language, wait 10 seconds, and open the generated story page.</p>
  </div>
  <div class="movie-grid">${cards}</div>
</main>

<script>
let activeId = null;
function toggleSideMenu(){
  const d=document.getElementById('drawer');
  const o=document.getElementById('overlay');
  d.classList.toggle('open');
  o.style.display=d.classList.contains('open')?'block':'none';
}
function openLang(id){ activeId=id; document.getElementById('langModal').style.display='flex'; }
function startTimer(lang){
  const c=document.getElementById('countdown');
  const d=document.getElementById('countDigits');
  c.style.display='flex';
  let s=10;
  d.innerText=s+'s';
  const t=setInterval(()=>{
    s--;
    d.innerText=s+'s';
    if(s<=0){
      clearInterval(t);
      location.href='/movie/'+activeId+'/index-'+lang+'.html';
    }
  },1000);
}
document.querySelectorAll('.movie-card').forEach(card=>card.addEventListener('click',()=>openLang(card.dataset.id)));
</script>
</body>
</html>`;
}

function renderMoviePage(details, lang) {
  const poster = details.poster_path ? `${IMG_BASE}/w500${details.poster_path}` : 'https://placehold.co/500x750?text=No+Poster';
  const backdrop = details.backdrop_path ? `${IMG_BASE}/original${details.backdrop_path}` : poster;
  const story = makeStory(details, lang.code);
  const cast1 = (details.cast || []).slice(0, 5).map(a => escapeHtml(a.name)).join(', ') || 'N/A';
  const cast2 = (details.cast || []).slice(5, 10).map(a => escapeHtml(a.name)).join(', ') || 'N/A';
  const trailer = details.trailer ? `https://www.youtube.com/watch?v=${details.trailer.key}` : '#';
  const rating = (details.vote_average || 0).toFixed(1);
  const quality = qualityLabel(details.vote_average || 0);
  const boxOffice = details.boxOffice || (details.revenue ? `$${Number(details.revenue).toLocaleString()}` : 'N/A');
  const keywords = (details.keywords || []).join(', ') || 'N/A';

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Movie",
    "name": details.title,
    "description": details.overview || story.slice(0, 200),
    "image": poster,
    "datePublished": details.release_date || '',
    "genre": (details.genres || []).map(g => g.name),
    "aggregateRating": { "@type": "AggregateRating", "ratingValue": rating, "bestRating": "10" }
  };

  return `<!doctype html>
<html lang="${lang.code}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(details.title)} - ${lang.name} Review | U-TV REVIEW</title>
<meta name="description" content="${escapeHtml((details.overview || story).slice(0, 160))}">
<meta name="keywords" content="${escapeHtml([details.title, ...(details.genres || []).map(g => g.name), ...details.keywords || []].join(', '))}">
<link rel="canonical" href="${SITE_URL}/movie/${details.id}/index-${lang.code}.html">
<meta name="robots" content="index,follow">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<script src="https://cdn.tailwindcss.com"></script>
<style>
body{background:#07080e;color:#e2e8f0;font-family:Inter,sans-serif}
.box{background:#11131e;border:1px solid #1c1f30;border-radius:16px}
.badge{background:linear-gradient(135deg,#ea4c23 0%,#a82300 100%)}
.label{color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-weight:700}
.value{color:#fff;font-weight:700}
</style>
</head>
<body class="pb-16">
<header class="bg-[#07080e]/95 border-b border-[#1c1f30] p-4 flex justify-between items-center sticky top-0 z-50 backdrop-blur-md">
  <a href="/" class="text-xl font-black text-white">U-TV<span class="text-[#ea4c23]">.REVIEW</span></a>
  <a href="/" class="bg-zinc-800 text-white px-4 py-1.5 rounded-full text-xs font-bold">← Return Index</a>
</header>

<main class="max-w-5xl mx-auto p-4 mt-2">
  <div class="relative rounded-2xl overflow-hidden h-56 md:h-72 mb-6 border border-[#1c1f30]">
    <div class="absolute inset-0 bg-cover bg-center" style="background-image:url('${backdrop}');opacity:.35"></div>
    <div class="absolute inset-0 bg-gradient-to-t from-[#07080e] via-transparent to-black/40"></div>
    <div class="absolute bottom-5 left-5 right-5">
      <span class="px-2.5 py-1 text-[10px] font-black rounded text-white badge uppercase tracking-wider">${lang.name} Build</span>
      <h1 class="text-3xl md:text-5xl font-black text-white mt-1.5 tracking-tight">${escapeHtml(details.title)}</h1>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div class="space-y-4">
      <div class="rounded-2xl overflow-hidden border border-[#1c1f30] bg-[#11131e]">
        <img src="${poster}" alt="${escapeHtml(details.title)}" class="w-full object-cover">
      </div>
      <div class="box p-4 space-y-3 text-xs">
        <div><span class="label">Movie Name</span><div class="value">${escapeHtml(details.title)}</div></div>
        <div><span class="label">Release Date</span><div class="value">${escapeHtml(details.release_date || 'N/A')}</div></div>
        <div><span class="label">Platform</span><div class="value">TMDb / OMDb</div></div>
        <div><span class="label">Hero</span><div class="value">${escapeHtml(details.hero || 'N/A')}</div></div>
        <div><span class="label">Heroine</span><div class="value">${escapeHtml(details.heroine || 'N/A')}</div></div>
        <div><span class="label">Villain</span><div class="value">${escapeHtml(details.villain || 'N/A')}</div></div>
        <div><span class="label">Worldwide Collection</span><div class="value">${escapeHtml(boxOffice)}</div></div>
        <div><span class="label">Hit / Superhit / Blockbuster / Flop</span><div class="value">${quality}</div></div>
        <div><span class="label">10 Me Se Kitna No</span><div class="value">${rating}/10</div></div>
        <div><span class="label">Keywords</span><div class="value">${escapeHtml(keywords)}</div></div>
      </div>
    </div>

    <div class="md:col-span-2 space-y-6">
      <div class="box p-6">
        <h3 class="text-xs font-black text-[#ea4c23] tracking-widest uppercase mb-4 border-b border-[#1c1f30] pb-2">PREMIUM HIGHLIGHTS</h3>
        <div class="grid grid-cols-2 gap-y-4 gap-x-6 text-xs">
          <div><span class="label">Movie Name</span><div class="value">${escapeHtml(details.title)}</div></div>
          <div><span class="label">Release Date</span><div class="value">${escapeHtml(details.release_date || 'N/A')}</div></div>
          <div><span class="label">Director</span><div class="value">${escapeHtml(details.director || 'N/A')}</div></div>
          <div><span class="label">Writer</span><div class="value">${escapeHtml(details.writer || 'N/A')}</div></div>
          <div><span class="label">Hero</span><div class="value">${escapeHtml(details.hero || 'N/A')}</div></div>
          <div><span class="label">Heroine</span><div class="value">${escapeHtml(details.heroine || 'N/A')}</div></div>
          <div><span class="label">Villain</span><div class="value">${escapeHtml(details.villain || 'N/A')}</div></div>
          <div><span class="label">Rating</span><div class="value text-yellow-400">${stars(details.vote_average || 0)} (${rating}/10)</div></div>
          <div><span class="label">Worldwide Collection</span><div class="value">${escapeHtml(boxOffice)}</div></div>
          <div><span class="label">Trailer</span><a href="${trailer}" target="_blank" rel="noopener" class="text-[#ea4c23] font-bold">Open</a></div>
        </div>
        <div class="border-t border-[#1c1f30] mt-5 pt-4 text-xs">
          <div class="label mb-1">Actors</div><p class="text-slate-200">${cast1}</p>
          <div class="label mb-1 mt-3">Other Cast</div><p class="text-slate-200">${cast2}</p>
        </div>
      </div>

      <div class="box p-6">
        <div class="flex items-center justify-between border-b border-[#1c1f30] pb-3 mb-4">
          <h3 class="text-xs font-black text-white tracking-widest uppercase">STORY IN SELECTED LANGUAGE</h3>
          <span class="text-[9px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono font-bold tracking-wider">${story.split(/s+/).filter(Boolean).length} WORDS</span>
        </div>
        <p class="text-zinc-300 text-xs md:text-sm leading-relaxed whitespace-pre-line tracking-wide">${escapeHtml(story)}</p>
      </div>
    </div>
  </div>
</main>
</body>
</html>`;
}

function sitemapXml(urls) {
  const now = new Date().toISOString();
  const items = urls.map(u => `<url><loc>${u}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</urlset>`;
}

(async () => {
  if (!TMDB_API_KEYS.length) throw new Error('Missing TMDB API keys');

  if (fs.existsSync('./movie')) fs.rmSync('./movie', { recursive: true, force: true });
  fs.mkdirSync('./movie', { recursive: true });

  const allMovies = [];
  for (const section of PAGES) {
    for (let page = 1; allMovies.length < MAX_MOVIES && page <= 5; page++) {
      const data = await fetchTmdb(`/movie/${section}`, { page });
      if (!data.results?.length) break;
      for (const item of data.results) {
        if (!allMovies.find(m => m.id === item.id)) allMovies.push(item);
      }
    }
  }

  const selected = allMovies.slice(0, MAX_MOVIES);
  const sitemapUrls = [`${SITE_URL}/`];

  for (const movie of selected) {
    const details = await getMovieDetails(movie.id);
    const movieDir = path.join(OUT_DIR, 'movie', String(movie.id));
    fs.mkdirSync(movieDir, { recursive: true });

    for (const lang of LANGS) {
      const html = renderMoviePage(details, lang);
      fs.writeFileSync(path.join(movieDir, `index-${lang.code}.html`), html);
      sitemapUrls.push(`${SITE_URL}/movie/${movie.id}/index-${lang.code}.html`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderIndexPage(selected));
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), sitemapXml(sitemapUrls));
})();
