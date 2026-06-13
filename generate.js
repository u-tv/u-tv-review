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
const DELAY_MS = 300;

const LANGS = [
  { code: 'en-US', short: 'en', name: 'English', native: 'English' },
  { code: 'hi-IN', short: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'es-ES', short: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr-FR', short: 'fr', name: 'French', native: 'Français' },
  { code: 'de-DE', short: 'de', name: 'German', native: 'Deutsch' },
  { code: 'it-IT', short: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'ja-JP', short: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko-KR', short: 'ko', name: 'Korean', native: '한국어' },
  { code: 'pa-IN', short: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'te-IN', short: 'te', name: 'Telugu', native: 'తెలుగు' }
];

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, ...options });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

// Free Google Translate API (no key needed)
async function translateText(text, targetLang) {
  if (!text || targetLang === 'en') return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return text;
    const data = await res.json();
    if (!data || !Array.isArray(data[0])) return text;
    return data[0].map(item => item[0]).join('');
  } catch (e) {
    console.error(`Translation failed for ${targetLang}:`, e.message);
    return text;
  }
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
  } catch (e) { return null; }
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

function countWords(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function padToWordCount(text, minWords = 500, maxWords = 1500) {
  let words = String(text).trim().split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    return words.slice(0, maxWords).join(' ');
  }
  const filler = ' The narrative continues to explore deeper thematic elements while maintaining strong character development and visual storytelling excellence. The production values remain consistently high throughout the runtime.';
  while (words.length < minWords) {
    text += filler;
    words = text.trim().split(/\s+/).filter(Boolean);
  }
  return words.slice(0, maxWords).join(' ');
}

async function generateProReview(details, lang) {
  const title = details.title || 'Movie';
  const overview = details.overview || 'An exciting cinematic journey awaits.';
  const director = details.director || 'N/A';
  const writer = details.writer || 'N/A';
  const hero = details.hero || 'N/A';
  const heroine = details.heroine || 'N/A';
  const villain = details.villain || 'N/A';
  const rating = (details.vote_average || 0).toFixed(1);
  const verdict = qualityLabel(details.vote_average || 0);
  const releaseDate = details.release_date || 'N/A';
  const genres = (details.genres || []).map(g => g.name).join(', ') || 'N/A';
  const boxOffice = details.boxOffice || (details.revenue ? `$${Number(details.revenue).toLocaleString()}` : 'N/A');
  const castList = (details.cast || []).slice(0, 10).map(c => `${c.name} as ${c.character}`).join(', ');

  const masterEnglish = `
The cinematic production titled "${title}" presents a masterful journey through high-stake emotional landscapes and complex narrative territories. Officially released on ${releaseDate}, this film operates within the genres of ${genres}, establishing itself as a significant entry in contemporary cinema with a worldwide box office performance of ${boxOffice}.

Core Plot and Narrative Architecture:
The story unfolds with deliberate pacing, weaving together multiple thematic threads into a cohesive and compelling narrative. ${overview} The screenplay demonstrates exceptional structural integrity, ensuring that each plot point serves both character development and thematic resonance. The narrative arc moves through carefully calibrated emotional beats, building tension through strategic revelations and character-driven conflicts rather than relying solely on external plot mechanics.

Directorial Vision and Creative Execution:
Under the visionary direction of ${director}, each frame is composed with meticulous attention to visual storytelling. The directorial choices reflect a deep understanding of cinematic language, utilizing camera movement, lighting design, and spatial composition to enhance the emotional subtext of every scene. The screenplay, crafted by ${writer}, injects rhythmic precision into the dialogue and scene transitions, preventing any narrative stagnation while amplifying the psychological depth during critical story moments.

Performance Analysis and Character Dynamics:
The lead performance by ${hero} introduces remarkable layers of complexity and authenticity to the protagonist. The screen presence is commanding yet nuanced, allowing audiences to connect with the character's internal journey. ${heroine} delivers a powerful emotional anchor, creating chemistry that makes their shared sequences genuinely resonant. The antagonistic force embodied by ${villain} injects essential narrative friction, driving the primary stakes to their absolute maximum and providing meaningful opposition that tests the protagonist's resolve.

The supporting ensemble, featuring performances from ${castList}, adds exceptional texture and depth to the surrounding world. Each supporting character feels fully realized rather than merely functional, contributing to a universe that feels lived-in and authentic.

Technical Execution and Production Values:
From a technical standpoint, the film achieves remarkable coherence across all departments. The cinematography creates a visual palette that successfully mirrors the internal psychological states of the main characters. The editing maintains propulsive momentum while allowing emotional moments to breathe. The sound design and musical score work in perfect harmony, enhancing the atmospheric quality without overwhelming the narrative.

Final Critical Assessment:
With an aggregate critical score of ${rating} out of 10, this cinematic piece stands as a noteworthy milestone in its genre. The production successfully bridges the gap between artistic ambition and commercial accessibility, offering thematic depth that resonates across diverse audience demographics. The film earns its classification as a ${verdict} through consistent excellence in storytelling, performance, and technical execution.
  `;

  const padded = padToWordCount(masterEnglish, 500, 1500);
  
  if (lang.short === 'en') {
    return padded;
  }
  
  console.log(`Translating "${title}" to ${lang.name} (${lang.short})...`);
  const translated = await translateText(padded, lang.short);
  return translated;
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
  data.villain = data.cast.find(p => /villain|antagonist|killer|nemesis|bad|evil/i.test(p.character || ''))?.name || 'N/A';

  if (data.imdb_id) {
    const omdb = await fetchOmdb(data.imdb_id);
    if (omdb && omdb.BoxOffice && omdb.BoxOffice !== 'N/A') {
      data.boxOffice = omdb.BoxOffice;
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

  const adCode = ADSTERRA_POPUNDER_CODE ? `\n${ADSTERRA_POPUNDER_CODE}\n` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>U-TV REVIEW – Pro Movie Analysis & Reviews</title>
<meta name="description" content="In-depth movie reviews, ratings, cast, box office analysis. Latest from Bollywood, Hollywood, South, and Web Series.">
<link rel="canonical" href="${SITE_URL}/">
<meta name="robots" content="index,follow">
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
.modal{position:fixed;inset:0;background:rgba(3,4,7,.95);z-index:9999;display:none;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(8px)}
</style>
${adCode}
</head>
<body>
<header class="sticky top-0 z-50 bg-[#07080e]/90 border-b border-[#1c1f30] p-4 flex justify-between items-center backdrop-blur-md shadow-xl">
  <a href="/" class="font-black text-2xl tracking-tight text-white">U-TV<span class="text-[#ea4c23]">.REVIEW</span></a>
  <div class="text-[10px] tracking-widest bg-red-950/50 border border-red-800 text-red-400 px-3 py-1 rounded-full font-bold">TRANSLATION ENGINE ONLINE</div>
</header>

<div id="langModal" class="modal">
  <div class="bg-[#0f111a] border border-[#1e2235] max-w-lg w-full rounded-2xl p-6 relative shadow-2xl">
    <h3 class="text-center font-black text-xl text-white mb-5 tracking-tight">SELECT LANGUAGE</h3>
    <div class="grid grid-cols-2 gap-3">
      ${LANGS.map(l => `<button onclick="startTimer('${l.short}')" class="p-3 text-left bg-[#151826] border border-[#22273d] text-white rounded-xl hover:border-[#ea4c23] transition-all group">${l.name}<div class="text-[11px] text-zinc-400 group-hover:text-zinc-200">${l.native}</div></button>`).join('')}
    </div>
    <div id="countdown" class="hidden absolute inset-0 bg-[#07080e] rounded-2xl flex-col items-center justify-center text-center">
      <div class="text-6xl font-black text-[#ea4c23] animate-pulse" id="countDigits">10s</div>
      <div class="text-sm font-bold text-white mt-3">Syncing Live Translation...</div>
      <div class="text-xs text-zinc-500 mt-1">Structuring pro-review (500-1500 words)</div>
    </div>
  </div>
</div>

<main class="pt-8 pb-12 px-4 max-w-[1600px] mx-auto">
  <div class="rounded-3xl bg-gradient-to-r from-[#141624] to-[#090a10] border border-[#1c1f30] p-6 md:p-8 mb-8 shadow-lg">
    <h1 class="text-3xl md:text-5xl font-black tracking-tight text-white">PRO MULTILINGUAL CINEMATIC ENGINE</h1>
    <p class="text-sm text-zinc-400 mt-2">Click any movie poster. System triggers automated cross-translation pipeline with advanced analysis.</p>
  </div>
  <div class="movie-grid">${cards}</div>
</main>

<script>
let activeId = null;
function openLang(id){ activeId=id; document.getElementById('langModal').style.display='flex'; }
function startTimer(lang){
  const c=document.getElementById('countdown');
  const d=document.getElementById('countDigits');
  c.style.display='flex';
  let s=10; d.innerText=s+'s';
  const t=setInterval(()=>{
    s--; d.innerText=s+'s';
    if(s<=0){ clearInterval(t); location.href='/movie/'+activeId+'/index-'+lang+'.html'; }
  },1000);
}
document.querySelectorAll('.movie-card').forEach(card=>card.addEventListener('click',()=>openLang(card.dataset.id)));
</script>
</body>
</html>`;
}

function renderMoviePage(details, lang, storyHtml) {
  const poster = details.poster_path ? `${IMG_BASE}/w500${details.poster_path}` : 'https://placehold.co/500x750?text=No+Poster';
  const backdrop = details.backdrop_path ? `${IMG_BASE}/original${details.backdrop_path}` : poster;
  const cast1 = (details.cast || []).slice(0, 8).map(a => escapeHtml(a.name)).join(', ') || 'N/A';
  const trailer = details.trailer ? `https://www.youtube.com/watch?v=${details.trailer.key}` : '#';
  const rating = (details.vote_average || 0).toFixed(1);
  const quality = qualityLabel(details.vote_average || 0);
  const boxOffice = details.boxOffice || (details.revenue ? `$${Number(details.revenue).toLocaleString()}` : 'N/A');
  const keywords = (details.keywords || []).join(', ') || 'N/A';

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Movie",
    "name": details.title,
    "description": (details.overview || storyHtml).slice(0, 200),
    "image": poster,
    "datePublished": details.release_date || '',
    "genre": (details.genres || []).map(g => g.name),
    "aggregateRating": { "@type": "AggregateRating", "ratingValue": rating, "bestRating": "10" }
  };

  return `<!doctype html>
<html lang="${lang.short}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(details.title)} - ${lang.name} Review | U-TV REVIEW</title>
<meta name="description" content="${escapeHtml((details.overview || storyHtml).slice(0, 160))}">
<meta name="keywords" content="${escapeHtml([details.title, ...(details.genres || []).map(g => g.name), ...(details.keywords || [])].join(', '))}">
<link rel="canonical" href="${SITE_URL}/movie/${details.id}/index-${lang.short}.html">
<meta name="robots" content="index,follow">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<script src="https://cdn.tailwindcss.com"></script>
<style>
body{background:#040508;color:#d1d5db;font-family:Inter,sans-serif}
.box{background:#0b0d16;border:1px solid #1a1d2e;border-radius:20px}
.label{color:#64748b;text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-weight:800}
.value{color:#fff;font-weight:700;font-size:13px}
</style>
</head>
<body class="pb-20">
<header class="bg-[#040508]/95 border-b border-[#161929] p-4 flex justify-between items-center sticky top-0 z-50 backdrop-blur-md">
  <a href="/" class="text-2xl font-black text-white tracking-tight">U-TV<span class="text-[#ea4c23]">.REVIEW</span></a>
  <a href="/" class="bg-zinc-900 border border-zinc-800 text-white px-5 py-2 rounded-full text-xs font-bold hover:bg-zinc-800 transition-all">← Back</a>
</header>

<main class="max-w-6xl mx-auto p-4 mt-4">
  <div class="relative rounded-3xl overflow-hidden h-64 md:h-80 mb-8 border border-[#1a1d2e]">
    <div class="absolute inset-0 bg-cover bg-center" style="background-image:url('${backdrop}');opacity:.4"></div>
    <div class="absolute inset-0 bg-gradient-to-t from-[#040508] via-transparent to-black/50"></div>
    <div class="absolute bottom-6 left-6 right-6">
      <span class="px-3 py-1 text-[10px] font-black rounded-md text-white bg-gradient-to-r from-[#ea4c23] to-[#a82300] uppercase tracking-widest">${lang.name}</span>
      <h1 class="text-4xl md:text-6xl font-black text-white mt-2 tracking-tight">${escapeHtml(details.title)}</h1>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
    <div class="space-y-6">
      <div class="rounded-2xl overflow-hidden border border-[#1a1d2e] shadow-xl">
        <img src="${poster}" alt="${escapeHtml(details.title)}" class="w-full object-cover">
      </div>
      <div class="box p-5 space-y-4 text-xs">
        <h4 class="text-white font-black text-xs border-b border-[#1a1d2e] pb-2 uppercase tracking-wider text-[#ea4c23]">METRIC OVERVIEW</h4>
        <div><span class="label">Official Title</span><div class="value">${escapeHtml(details.title)}</div></div>
        <div><span class="label">Global Launch</span><div class="value">${escapeHtml(details.release_date || 'N/A')}</div></div>
        <div><span class="label">Lead Actor</span><div class="value">${escapeHtml(details.hero || 'N/A')}</div></div>
        <div><span class="label">Lead Actress</span><div class="value">${escapeHtml(details.heroine || 'N/A')}</div></div>
        <div><span class="label">Antagonist</span><div class="value">${escapeHtml(details.villain || 'N/A')}</div></div>
        <div><span class="label">Box Office</span><div class="value text-emerald-400">${escapeHtml(boxOffice)}</div></div>
        <div><span class="label">Verdict</span><div class="value">${quality}</div></div>
        <div><span class="label">Rating</span><div class="value text-yellow-500">${rating}/10</div></div>
        <div><span class="label">Keywords</span><div class="value">${escapeHtml(keywords)}</div></div>
      </div>
    </div>

    <div class="md:col-span-2 space-y-8">
      <div class="box p-6">
        <h3 class="text-xs font-black text-[#ea4c23] tracking-widest uppercase mb-4 border-b border-[#1a1d2e] pb-2">PRODUCTION MATRIX</h3>
        <div class="grid grid-cols-2 gap-y-4 gap-x-6 text-xs">
          <div><span class="label">Director</span><div class="value">${escapeHtml(details.director || 'N/A')}</div></div>
          <div><span class="label">Writer</span><div class="value">${escapeHtml(details.writer || 'N/A')}</div></div>
          <div><span class="label">Stars</span><div class="value text-yellow-400 font-mono">${stars(details.vote_average || 0)}</div></div>
          <div><span class="label">Trailer</span><a href="${trailer}" target="_blank" rel="noopener" class="text-[#ea4c23] font-bold hover:underline">Watch →</a></div>
        </div>
        <div class="border-t border-[#1a1d2e] mt-5 pt-4 text-xs">
          <div class="label mb-1">Cast</div><p class="text-slate-300 font-medium leading-relaxed">${cast1}</p>
        </div>
      </div>

      <div class="box p-6 md:p-8">
        <div class="flex items-center justify-between border-b border-[#1a1d2e] pb-4 mb-6">
          <h3 class="text-xs font-black text-white tracking-widest uppercase">CRITICAL ANALYSIS & STORY (${lang.name})</h3>
          <span class="text-[10px] bg-red-950/60 text-red-400 border border-red-900/50 px-2.5 py-1 rounded-md font-mono font-bold tracking-wider">${countWords(storyHtml)} WORDS</span>
        </div>
        <div class="text-zinc-300 text-sm md:text-base leading-relaxed whitespace-pre-line tracking-wide space-y-4 font-sans font-normal">${storyHtml}</div>
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
  if (!TMDB_API_KEYS.length) {
    console.error('ERROR: Set TMDB_API_KEY_1 environment variable');
    process.exit(1);
  }

  if (fs.existsSync('./movie')) fs.rmSync('./movie', { recursive: true, force: true });
  fs.mkdirSync('./movie', { recursive: true });

  console.log('Fetching popular movies from TMDB...');
  const allMovies = [];
  for (let page = 1; allMovies.length < MAX_MOVIES && page <= 5; page++) {
    const data = await fetchTmdb('/movie/popular', { page });
    if (!data.results?.length) break;
    for (const item of data.results) {
      if (!allMovies.find(m => m.id === item.id)) allMovies.push(item);
    }
  }

  const selected = allMovies.slice(0, MAX_MOVIES);
  console.log(`Found ${selected.length} movies. Starting generation...`);

  const sitemapUrls = [`${SITE_URL}/`];

  for (let i = 0; i < selected.length; i++) {
    const movie = selected[i];
    console.log(`[${i + 1}/${selected.length}] Processing: ${movie.title} (ID: ${movie.id})`);
    
    const details = await getMovieDetails(movie.id);
    const movieDir = path.join(OUT_DIR, 'movie', String(movie.id));
    fs.mkdirSync(movieDir, { recursive: true });

    for (const lang of LANGS) {
      const proReviewText = await generateProReview(details, lang);
      const html = renderMoviePage(details, lang, escapeHtml(proReviewText));
      fs.writeFileSync(path.join(movieDir, `index-${lang.short}.html`), html);
      sitemapUrls.push(`${SITE_URL}/movie/${movie.id}/index-${lang.short}.html`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderIndexPage(selected));
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), sitemapXml(sitemapUrls));
  
  console.log(`\n✅ DONE! Generated ${selected.length} movies x ${LANGS.length} languages = ${selected.length * LANGS.length} pages.`);
  console.log(`📁 Files saved in: ${path.resolve(OUT_DIR)}`);
  console.log(`🌐 Sitemap: ${sitemapUrls.length} URLs`);
})();
