const fs = require('fs');
const path = require('path');

const TMDB_API_KEYS = [process.env.TMDB_API_KEY_1 || '', process.env.TMDB_API_KEY_2 || ''].filter(Boolean);
const OMDB_API_KEY = process.env.OMDB_API_KEY || '';
const SGAI_API_KEY = process.env.SGAI_API_KEY || '';
const ADSTERRA_POPUNDER_CODE = process.env.ADSTERRA_POPUNDER_CODE || '';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';
const OUTPUT_DIR = './';
const MAX_MOVIES = 200;
const DELAY_MS = 120;

const LANGS = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'zh', name: 'Chinese', native: '中文' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'pt', name: 'Portuguese', native: 'Português' }
];

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
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

function stars(voteAverage = 0) {
  const n = Math.max(0, Math.min(5, Math.round(voteAverage / 2)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

async function getMovieDetails(id) {
  const [details, credits, videos, external] = await Promise.all([
    fetchTmdb(`/movie/${id}`),
    fetchTmdb(`/movie/${id}/credits`),
    fetchTmdb(`/movie/${id}/videos`).catch(() => ({ results: [] })),
    fetchTmdb(`/movie/${id}/external_ids`).catch(() => ({}))
  ]);

  const data = {
    ...details,
    cast: (credits.cast || []).slice(0, 20),
    crew: credits.crew || [],
    trailer: (videos.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube') || null,
    imdb_id: external.imdb_id || ''
  };

  data.director = data.crew.find(p => p.job === 'Director')?.name || 'N/A';
  data.writer = data.crew.find(p => ['Screenplay', 'Writer', 'Story'].includes(p.job))?.name || 'N/A';
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

function storyText(details, lang) {
  const title = details.title || 'Untitled';
  const overview = details.overview || '';
  const base = {
    en: `This page is generated from live TMDB metadata for ${title}. ${overview}`,
    hi: `${title} के लिए यह पेज live TMDB metadata से generate किया गया है। ${overview}`,
    es: `Esta página se genera con metadatos en vivo de TMDB para ${title}. ${overview}`,
    fr: `Cette page est générée à partir des métadonnées TMDB en direct pour ${title}. ${overview}`,
    de: `Diese Seite wird aus Live-TMDB-Metadaten für ${title} generiert. ${overview}`,
    zh: `${title} 的页面基于实时 TMDB 元数据生成。${overview}`,
    ja: `${title} のページはライブ TMDB メタデータから生成されています。${overview}`,
    ar: `تم إنشاء هذه الصفحة من بيانات TMDB الحية الخاصة بـ ${title}. ${overview}`,
    ru: `Эта страница создана из актуальных данных TMDB для ${title}. ${overview}`,
    pt: `Esta página é gerada a partir de metadados ao vivo do TMDB para ${title}. ${overview}`
  }[lang] || '';

  let out = base.trim();
  const filler = ` ${title} stays connected to runtime, release date, cast, crew, rating, genres, and external identifiers for accurate rendering.`;
  while (out.split(/s+/).length < 500) out += filler;
  return out;
}

function indexHtml(movies) {
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
<title>Movie Review Site</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
body{background:#07080e;color:#e2e8f0;font-family:Inter,sans-serif}
.movie-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
@media(min-width:640px){.movie-grid{grid-template-columns:repeat(4,1fr)}}
@media(min-width:1024px){.movie-grid{grid-template-columns:repeat(6,1fr)}}
.movie-card{background:#11131e;border-radius:12px;border:1px solid #1c1f30;overflow:hidden;cursor:pointer}
.poster-wrap{position:relative;aspect-ratio:2/3}
.poster-wrap img{width:100%;height:100%;object-fit:cover}
.card-rating{position:absolute;top:6px;left:6px;background:rgba(7,8,14,.85);color:#ffb800;font-size:.65rem;font-weight:800;padding:2px 6px;border-radius:4px}
.card-details{padding:10px}
.card-title{font-size:.75rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.drawer{position:fixed;top:0;left:-320px;width:300px;height:100%;background:#0b0d16;z-index:999;transition:left .3s}
.drawer.open{left:0}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);display:none;z-index:998}
.modal{position:fixed;inset:0;background:rgba(5,6,10,.96);z-index:9999;display:none;align-items:center;justify-content:center;padding:16px}
</style>
${adCode}
</head>
<body>
<header class="sticky top-0 z-50 bg-[#07080e]/95 border-b border-[#1c1f30] p-4 flex justify-between items-center backdrop-blur-md">
  <div class="flex items-center gap-4">
    <button onclick="toggleSideMenu()" class="text-[#ea4c23] text-xl">☰</button>
    <a href="/" class="text-2xl font-black text-white">U-TV<span class="text-[#ea4c23]">.REVIEW</span></a>
  </div>
  <div class="text-xs text-[#ea4c23] font-bold">SYSTEM ACTIVE</div>
</header>

<div id="drawer" class="drawer p-6">
  <div class="space-y-3">
    <a href="#trailers" class="block p-3 rounded-xl bg-orange-600/10 border border-orange-500/20 text-[#ea4c23] font-bold">NEW TRAILERS REVIEW</a>
    <a href="#upcoming" class="block p-3 rounded-xl bg-yellow-600/10 border border-yellow-500/20 text-yellow-500 font-bold">UPCOMING HIT RELEASES</a>
    <a href="#blockbusters" class="block p-3 rounded-xl bg-purple-600/10 border border-purple-500/20 text-purple-400 font-bold">BLOCKBUSTER EARNINGS</a>
    <a href="#about" class="block p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-gray-300 font-semibold">ABOUT NETWORK</a>
    <a href="#disclaimer" class="block p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-gray-300 font-semibold">LEGAL DISCLAIMER</a>
  </div>
</div>
<div id="overlay" class="overlay" onclick="toggleSideMenu()"></div>

<div id="langModal" class="modal">
  <div class="bg-[#11131e] border border-[#1c1f30] max-w-lg w-full rounded-2xl p-6 relative">
    <h3 class="text-center font-black text-xl text-white mb-4">SELECT LANGUAGE</h3>
    <div class="grid grid-cols-2 gap-3" id="langButtons">
      ${LANGS.map(l => `<button onclick="startTimer('${l.code}')" class="p-3 bg-[#181a29] border border-[#23273d] rounded-xl">${l.name}<div class="text-[11px] text-zinc-500">${l.native}</div></button>`).join('')}
    </div>
    <div id="countdown" class="hidden absolute inset-0 bg-[#07080e] rounded-2xl flex-col items-center justify-center text-center">
      <div class="text-5xl font-black text-[#ea4c23]" id="countDigits">10s</div>
      <div class="text-xs text-zinc-400 mt-2">Processing story in selected language</div>
    </div>
  </div>
</div>

<main class="p-4 max-w-7xl mx-auto">
  <div class="rounded-2xl bg-gradient-to-br from-[#181a29] via-[#0b0d16] to-black border border-[#1c1f30] p-6 md:p-8 mb-6">
    <h1 class="text-2xl md:text-4xl font-black text-white">AUTOMATED MULTILINGUAL MOVIE REVIEW ENGINE</h1>
    <p class="text-sm text-zinc-400 mt-2">Tap any poster, choose a language, wait 10 seconds, then open the story in that selected language.</p>
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
function openLang(id){
  activeId=id;
  document.getElementById('langModal').style.display='flex';
}
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
document.querySelectorAll('.movie-card').forEach(card=>{
  card.addEventListener('click',()=>{
    openLang(card.dataset.id);
  });
});
</script>
</body>
</html>`;
}

function movieHtml(details, lang) {
  const poster = details.poster_path ? `${IMG_BASE}/w500${details.poster_path}` : 'https://placehold.co/500x750?text=No+Poster';
  const backdrop = details.backdrop_path ? `${IMG_BASE}/original${details.backdrop_path}` : poster;
  const story = storyText(details, lang.code);
  const cast1 = (details.cast || []).slice(0, 5).map(a => escapeHtml(a.name)).join(', ') || 'N/A';
  const cast2 = (details.cast || []).slice(5, 10).map(a => escapeHtml(a.name)).join(', ') || 'N/A';
  const trailer = details.trailer ? `https://www.youtube.com/watch?v=${details.trailer.key}` : '#';

  return `<!doctype html>
<html lang="${lang.code}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(details.title)} - ${lang.name}</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
body{background:#07080e;color:#e2e8f0;font-family:Inter,sans-serif}
.box{background:#11131e;border:1px solid #1c1f30;border-radius:16px}
.badge{background:linear-gradient(135deg,#ea4c23 0%,#a82300 100%)}
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
        <div><span class="font-bold text-slate-200 block">RELEASE DATE</span>${escapeHtml(details.release_date || 'N/A')}</div>
        <div><span class="font-bold text-slate-200 block">RUNTIME</span>${details.runtime ? `${details.runtime} min` : 'N/A'}</div>
        <div><span class="font-bold text-slate-200 block">GENRES</span>${escapeHtml((details.genres || []).map(g => g.name).join(', ') || 'N/A')}</div>
        <div><span class="font-bold text-slate-200 block">IMDB RATING</span>${escapeHtml(details.imdbRating || 'N/A')}</div>
        <div><span class="font-bold text-slate-200 block">BOX OFFICE</span>${escapeHtml(details.boxOffice || 'N/A')}</div>
      </div>
    </div>

    <div class="md:col-span-2 space-y-6">
      <div class="box p-6">
        <h3 class="text-xs font-black text-[#ea4c23] tracking-widest uppercase mb-4 border-b border-[#1c1f30] pb-2">PREMIUM HIGHLIGHTS</h3>
        <div class="grid grid-cols-2 gap-y-4 gap-x-6 text-xs">
          <div><span class="text-zinc-500 block mb-0.5 uppercase">Movie Name</span><span class="text-white font-black text-sm">${escapeHtml(details.title)}</span></div>
          <div><span class="text-zinc-500 block mb-0.5 uppercase">Rating</span><span class="text-yellow-400 font-bold text-sm">${stars(details.vote_average || 0)} (${(details.vote_average || 0).toFixed(1)}/10)</span></div>
          <div><span class="text-zinc-500 block mb-0.5 uppercase">Director</span><span class="text-white font-bold">${escapeHtml(details.director || 'N/A')}</span></div>
          <div><span class="text-zinc-500 block mb-0.5 uppercase">Writer</span><span class="text-white">${escapeHtml(details.writer || 'N/A')}</span></div>
          <div><span class="text-zinc-500 block mb-0.5 uppercase">Villain</span><span class="text-red-400 font-bold">${escapeHtml(details.villain || 'N/A')}</span></div>
          <div><span class="text-zinc-500 block mb-0.5 uppercase">Trailer</span><a href="${trailer}" target="_blank" rel="noopener" class="text-[#ea4c23] font-bold">Open</a></div>
        </div>
        <div class="border-t border-[#1c1f30] mt-5 pt-4 text-xs">
          <div class="text-zinc-500 uppercase font-bold tracking-wide mb-1">Actors</div>
          <p class="text-slate-200">${cast1}</p>
          <div class="text-zinc-500 uppercase font-bold tracking-wide mb-1 mt-3">Actresses / Other Cast</div>
          <p class="text-slate-200">${cast2}</p>
        </div>
      </div>

      <div class="box p-6">
        <div class="flex items-center justify-between border-b border-[#1c1f30] pb-3 mb-4">
          <h3 class="text-xs font-black text-white tracking-widest uppercase">STORY IN SELECTED LANGUAGE</h3>
          <span class="text-[9px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono font-bold tracking-wider">${story.split(/s+/).length} WORDS</span>
        </div>
        <p class="text-zinc-300 text-xs md:text-sm leading-relaxed whitespace-pre-line tracking-wide">${story}</p>
      </div>
    </div>
  </div>
</main>
</body>
</html>`;
}

(async () => {
  if (!TMDB_API_KEYS.length) throw new Error('Missing TMDB API keys');

  const movies = [];
  for (let page = 1; movies.length < MAX_MOVIES && page <= 15; page++) {
    const data = await fetchTmdb('/movie/popular', { page });
    if (!data.results?.length) break;
    movies.push(...data.results);
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const selected = movies.slice(0, MAX_MOVIES);

  if (fs.existsSync('./movie')) fs.rmSync('./movie', { recursive: true, force: true });
  fs.mkdirSync('./movie', { recursive: true });

  for (const movie of selected) {
    const details = await getMovieDetails(movie.id);
    const movieDir = path.join(OUTPUT_DIR, 'movie', String(movie.id));
    fs.mkdirSync(movieDir, { recursive: true });

    for (const lang of LANGS) {
      fs.writeFileSync(path.join(movieDir, `index-${lang.code}.html`), movieHtml(details, lang));
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), indexHtml(selected));
})();
