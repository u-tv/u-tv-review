const fs = require('fs');
const path = require('path');

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

const IMG_BASE = 'https://image.tmdb.org/t/p';

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeIndexPage(movies, adCode = '') {
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
    <a href="/" class="text-2xl font-black text-white">Movie<span class="text-[#ea4c23]">Review</span></a>
  </div>
  <div class="text-xs text-[#ea4c23] font-bold">ACTIVE</div>
</header>

<div id="drawer" class="drawer p-6"></div>
<div id="overlay" class="overlay" onclick="toggleSideMenu()"></div>

<div id="langModal" class="modal">
  <div class="bg-[#11131e] border border-[#1c1f30] max-w-lg w-full rounded-2xl p-6 relative">
    <h3 class="text-center font-black text-xl text-white mb-4">SELECT LANGUAGE</h3>
    <div class="grid grid-cols-2 gap-3" id="langButtons">
      ${LANGS.map(l => `<button onclick="startTimer('${l.code}')" class="p-3 bg-[#181a29] border border-[#23273d] rounded-xl">${l.name}<div class="text-[11px] text-zinc-500">${l.native}</div></button>`).join('')}
    </div>
    <div id="countdown" class="hidden absolute inset-0 bg-[#07080e] rounded-2xl flex-col items-center justify-center text-center">
      <div class="text-5xl font-black text-[#ea4c23]" id="countDigits">10s</div>
      <div class="text-xs text-zinc-400 mt-2">Processing selected language</div>
    </div>
  </div>
</div>

<main class="p-4 max-w-7xl mx-auto">
  <div class="rounded-2xl bg-gradient-to-br from-[#181a29] via-[#0b0d16] to-black border border-[#1c1f30] p-6 md:p-8 mb-6">
    <h1 class="text-2xl md:text-4xl font-black text-white">MULTILINGUAL MOVIE REVIEW ENGINE</h1>
    <p class="text-sm text-zinc-400 mt-2">Tap any poster, pick a language, wait 10 seconds, and open the generated story page.</p>
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
  card.addEventListener('click',()=>openLang(card.dataset.id));
});
</script>
</body>
</html>`;
}

module.exports = { LANGS, makeIndexPage };code 2const fs = require('fs');
const path = require('path');

function buildMoviePages(details, storyTextFn, movieHtmlFn, langs, outputDir = './movie') {
  const movieDir = path.join(outputDir, String(details.id));
  fs.mkdirSync(movieDir, { recursive: true });

  for (const lang of langs) {
    const html = movieHtmlFn(details, lang, storyTextFn(details, lang.code));
    fs.writeFileSync(path.join(movieDir, `index-${lang.code}.html`), html);
  }
}

module.exports = { buildMoviePages };code 3const fs = require('fs');
const path = require('path');

const TMDB_API_KEYS = [process.env.TMDB_API_KEY_1 || '', process.env.TMDB_API_KEY_2 || ''].filter(Boolean);
const OMDB_API_KEY = process.env.OMDB_API_KEY || '';
const ADSTERRA_POPUNDER_CODE = process.env.ADSTERRA_POPUNDER_CODE || '';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

function qualityLabel(voteAverage = 0) {
  if (voteAverage >= 8) return 'Blockbuster';
  if (voteAverage >= 6.5) return 'Superhit';
  if (voteAverage >= 5) return 'Hit';
  return 'Flop';
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

function storyText(details, lang) {
  const title = details.title || 'Untitled';
  const overview = details.overview || '';
  const base = {
    en: `This review page for ${title} is generated from live TMDb data and cleaned movie metadata. ${overview}`,
    hi: `${title} के लिए यह review page live TMDb data और साफ़ movie metadata से बनाया गया है। ${overview}`,
    es: `Esta página de reseña de ${title} se genera con datos en vivo de TMDb y metadatos limpios de la película. ${overview}`,
    fr: `Cette page de critique pour ${title} est générée à partir des données TMDb en direct et de métadonnées propres. ${overview}`,
    de: `Diese Bewertungsseite für ${title} wird aus Live-TMDb-Daten und bereinigten Filmdaten generiert. ${overview}`,
    it: `Questa pagina di recensione per ${title} è generata da dati live TMDb e metadati del film puliti. ${overview}`,
    ja: `${title} のレビューは、ライブ TMDb データと整理された映画メタデータから生成されています。${overview}`,
    ko: `${title} 리뷰 페이지는 실시간 TMDb 데이터와 정리된 영화 메타데이터로 생성됩니다. ${overview}`,
    pa: `${title} ਲਈ ਇਹ review page live TMDb data ਅਤੇ ਸਾਫ਼ movie metadata ਤੋਂ ਬਣਾਇਆ ਗਿਆ ਹੈ। ${overview}`,
    te: `${title} కోసం ఈ review page live TMDb data మరియు clean movie metadata తో generate చేయబడింది. ${overview}`
  }[lang] || base.en;

  let out = base.trim();
  const filler = ` ${title} remains tied to release date, runtime, genre, cast, crew, director, writer, trailer, rating, box office, and audience quality label for reliable output.`;
  while (out.split(/s+/).length < 520) out += filler;
  while (out.split(/s+/).length > 980) out = out.split(/s+/).slice(0, 980).join(' ');
  return out;
}

function movieHtml(details, lang, story) {
  const poster = details.poster_path ? `${IMG_BASE}/w500${details.poster_path}` : 'https://placehold.co/500x750?text=No+Poster';
  const backdrop = details.backdrop_path ? `${IMG_BASE}/original${details.backdrop_path}` : poster;
  const cast1 = (details.cast || []).slice(0, 5).map(a => a.name).join(', ') || 'N/A';
  const cast2 = (details.cast || []).slice(5, 10).map(a => a.name).join(', ') || 'N/A';
  const quality = qualityLabel(details.vote_average || 0);
  const starLine = stars(details.vote_average || 0);

  return `<!doctype html>
<html lang="${lang.code}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${details.title} - ${lang.name}</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
<h1>${details.title}</h1>
<p>${story}</p>
<p>Hero: ${details.hero}</p>
<p>Heroine: ${details.heroine}</p>
<p>Villain: ${details.villain}</p>
<p>Review: ${quality}</p>
<p>Stars: ${starLine}</p>
<p>Actors: ${cast1}</p>
<p>Other Cast: ${cast2}</p>
</body>
</html>`;
}

module.exports = { fetchTmdb, fetchOmdb, getMovieDetails, storyText, movieHtml, stars, qualityLabel, ADSTERRA_POPUNDER_CODE };
