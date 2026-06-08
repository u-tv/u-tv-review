const fs = require('fs');
const path = require('path');

// ==================== CONFIG ====================
const TMDB_API_KEYS = [
  '5bf61a62fd4647aa7debed7d6f2db079',
  '174d0214bf933dd59b3d5ec68a0c967f'
];
const OMDb_API_KEY = '641145d5';  // your OMDb key
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';
const SITE_URL = 'https://u-tv-review.pages.dev';
const OUTPUT_DIR = './';
const MAX_MOVIES = 200;
const DELAY_MS = 150;

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

async function fetchWithFallback(endpoint, params = {}) {
  for (const apiKey of TMDB_API_KEYS) {
    try {
      const url = new URL(`${BASE_URL}${endpoint}`);
      url.searchParams.append('api_key', apiKey);
      url.searchParams.append('language', 'en-US');
      for (const [k, v] of Object.entries(params)) if (v) url.searchParams.append(k, v);
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.status === 401) continue;
      if (!res.ok) continue;
      return await res.json();
    } catch (e) {}
  }
  throw new Error('All TMDB keys failed');
}

async function fetchOMDb(imdbId) {
  if (!imdbId) return null;
  try {
    const url = `https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDb_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.Response === 'True') return data;
    return null;
  } catch (e) { console.log(`OMDb fetch failed for ${imdbId}`); return null; }
}

async function fetchMovieDetails(id) {
  const [enDetails, hiDetails, credits, videos, external] = await Promise.all([
    fetchWithFallback(`/movie/${id}`),
    fetchWithFallback(`/movie/${id}`, { language: 'hi-IN' }).catch(() => ({})),
    fetchWithFallback(`/movie/${id}/credits`),
    fetchWithFallback(`/movie/${id}/videos`).catch(() => ({ results: [] })),
    fetchWithFallback(`/movie/${id}/external_ids`).catch(() => ({}))
  ]);
  const merged = { ...enDetails };
  merged.overview_hi = hiDetails.overview || enDetails.overview;
  merged.cast = (credits.cast || []).slice(0, 15);
  merged.crew = credits.crew || [];
  merged.director = merged.crew.find(p => p.job === 'Director')?.name || 'N/A';
  merged.writer = merged.crew.find(p => p.job === 'Screenplay' || p.job === 'Writer')?.name || 'N/A';
  merged.trailer = (videos.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');
  merged.imdb_id = external.imdb_id || '';

  // Fetch OMDb data
  if (merged.imdb_id) {
    const omdb = await fetchOMDb(merged.imdb_id);
    if (omdb) {
      merged.imdbRating = omdb.imdbRating;
      merged.imdbVotes = omdb.imdbVotes;
      merged.metascore = omdb.Metascore;
      merged.awards = omdb.Awards;
    }
  }
  return merged;
}

async function getAllMovies() {
  let allMovies = [];
  let page = 1;
  while (allMovies.length < MAX_MOVIES && page <= 20) {
    const data = await fetchWithFallback(`/movie/popular`, { page });
    if (!data.results || data.results.length === 0) break;
    allMovies.push(...data.results);
    page++;
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
  return allMovies.slice(0, MAX_MOVIES);
}

async function generateMoviePage(movie, details) {
  const movieDir = path.join(OUTPUT_DIR, 'movie', movie.id.toString());
  if (!fs.existsSync(movieDir)) fs.mkdirSync(movieDir, { recursive: true });

  const poster = details.poster_path ? `${IMG_BASE}/w500${details.poster_path}` : '';
  const backdrop = details.backdrop_path ? `${IMG_BASE}/original${details.backdrop_path}` : poster;
  const title = details.title;
  const releaseYear = details.release_date ? new Date(details.release_date).getFullYear() : 'N/A';
  const releaseDate = details.release_date || 'N/A';
  const runtime = details.runtime ? `${details.runtime} min` : 'N/A';
  const genres = (details.genres || []).map(g => g.name).join(', ');
  const tmdbRating = details.vote_average?.toFixed(1) || 'N/A';
  const tmdbVotes = details.vote_count || 0;
  const imdbRating = details.imdbRating || 'N/A';
  const imdbVotes = details.imdbVotes || 'N/A';
  const metascore = details.metascore || 'N/A';
  const awards = details.awards || 'N/A';
  const tagline = details.tagline || '';
  const overviewEn = details.overview || 'No description available.';
  const overviewHi = details.overview_hi || overviewEn;
  const cast = details.cast || [];
  const director = details.director;
  const writer = details.writer;
  const productionCompanies = (details.production_companies || []).map(c => c.name).join(', ') || 'N/A';
  const budget = details.budget ? `$${details.budget.toLocaleString()}` : 'N/A';
  const revenue = details.revenue ? `$${details.revenue.toLocaleString()}` : 'N/A';
  const imdbUrl = details.imdb_id ? `https://www.imdb.com/title/${details.imdb_id}/` : '#';
  const trailerUrl = details.trailer ? `https://www.youtube.com/embed/${details.trailer.key}` : null;

  const castHtml = cast.map(actor => `
    <div class="cast-item">
      <img src="${actor.profile_path ? `${IMG_BASE}/w185${actor.profile_path}` : 'https://placehold.co/185x278?text=No+Image'}" alt="${escapeHtml(actor.name)}" loading="lazy">
      <div><strong>${escapeHtml(actor.name)}</strong><br><span>as ${escapeHtml(actor.character || '')}</span></div>
    </div>
  `).join('');

  const schema = {
    "@context": "https://schema.org",
    "@type": "Movie",
    "name": title,
    "datePublished": releaseDate,
    "duration": `PT${details.runtime || 0}M`,
    "director": { "@type": "Person", "name": director },
    "actor": cast.slice(0, 5).map(a => ({ "@type": "Person", "name": a.name })),
    "aggregateRating": { "@type": "AggregateRating", "ratingValue": tmdbRating, "ratingCount": tmdbVotes },
    "description": overviewEn.substring(0, 300),
    "image": poster
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} (${releaseYear}) - In-Depth Review & Analysis | U-TV REVIEW</title>
  <meta name="description" content="${escapeHtml(overviewEn.substring(0, 160))} - ⭐ TMDB ${tmdbRating}/10, 🎬 IMDb ${imdbRating}/10, ${runtime}, ${genres}. Full story, cast, budget, revenue, and critical analysis.">
  <meta name="keywords" content="${escapeHtml(title)}, movie review, analysis, ${genres}, U-TV REVIEW">
  <link rel="canonical" href="${SITE_URL}/movie/${movie.id}/">
  <meta property="og:title" content="${escapeHtml(title)} (${releaseYear}) - Review & Analysis">
  <meta property="og:description" content="${escapeHtml(overviewEn.substring(0, 160))}">
  <meta property="og:image" content="${poster}">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://cdn.tailwindcss.com">
  <link rel="preconnect" href="https://cdnjs.cloudflare.com">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    :root { --utv-red: #e50914; }
    body { background: #050505; color: #e2e8f0; font-family: 'Inter', sans-serif; }
    .movie-grid { display: grid; grid-template-columns: 280px 1fr; gap: 30px; }
    .poster img { border-radius: 20px; box-shadow: 0 20px 30px -10px black; }
    .cast-list { display: flex; flex-wrap: wrap; gap: 15px; margin-top: 15px; }
    .cast-item { width: 110px; text-align: center; font-size: 0.7rem; }
    .cast-item img { width: 100%; border-radius: 12px; margin-bottom: 5px; }
    .share-btn { padding: 8px 16px; border-radius: 30px; font-weight: bold; display: inline-flex; align-items: center; gap: 8px; }
    .whatsapp { background: #25D366; color: black; }
    .telegram { background: #0088cc; }
    .trailer-container { position: relative; padding-bottom: 56.25%; height: 0; margin-top: 20px; }
    .trailer-container iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; border-radius: 16px; }
    @media (max-width: 768px) { .movie-grid { grid-template-columns: 1fr; } }
  </style>
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
  <script data-cfasync="false" src="https://pl28831952.effectivegatecpm.com/08/eb/75/08eb7538aa9646008f732c0721d2a5cc.js"></script>
</head>
<body>
  <div class="fixed top-0 w-full z-50 bg-black/90 backdrop-blur-md border-b border-[var(--utv-red)] p-3">
    <div class="max-w-7xl mx-auto flex justify-between items-center">
      <a href="/" class="text-2xl font-black">U-TV<span class="text-[var(--utv-red)]">.REVIEW</span></a>
      <button onclick="window.location.href='/'" class="bg-[var(--utv-red)] px-4 py-2 rounded-full text-sm font-bold">← Home</button>
    </div>
  </div>

  <div class="max-w-6xl mx-auto pt-28 px-4 pb-10">
    <div class="relative rounded-2xl overflow-hidden mb-8">
      <div class="absolute inset-0 bg-cover blur-md" style="background-image: url('${backdrop}'); opacity: 0.3;"></div>
      <div class="relative movie-grid p-6 md:p-10">
        <div class="poster"><img src="${poster}" alt="${escapeHtml(title)} poster"></div>
        <div>
          <h1 class="text-3xl md:text-4xl font-bold">${escapeHtml(title)} (${releaseYear})</h1>
          ${tagline ? `<p class="text-[var(--utv-red)] italic mt-1">${escapeHtml(tagline)}</p>` : ''}
          <div class="flex flex-wrap gap-3 mt-3 text-sm">
            <span class="bg-black/50 px-3 py-1 rounded-full">⭐ TMDB: ${tmdbRating}/10 (${tmdbVotes} votes)</span>
            <span class="bg-black/50 px-3 py-1 rounded-full">🎬 IMDb: ${imdbRating}/10 (${imdbVotes} votes)</span>
            <span class="bg-black/50 px-3 py-1 rounded-full">🍅 Metascore: ${metascore}</span>
            <span class="bg-black/50 px-3 py-1 rounded-full">⏱️ ${runtime}</span>
            <span class="bg-black/50 px-3 py-1 rounded-full">📅 ${releaseDate}</span>
            <span class="bg-black/50 px-3 py-1 rounded-full">🎭 ${escapeHtml(genres)}</span>
          </div>
          <div class="mt-6 space-y-4">
            <div><div class="font-bold text-lg">📖 Story (English)</div><p class="text-gray-300 leading-relaxed">${escapeHtml(overviewEn)}</p></div>
            <div><div class="font-bold text-lg">📖 कहानी (हिंदी)</div><p class="text-gray-300 leading-relaxed">${escapeHtml(overviewHi)}</p></div>
            <div class="grid grid-cols-2 gap-4 text-sm bg-black/40 p-4 rounded-xl">
              <div><span class="font-bold">🎬 Director:</span> ${escapeHtml(director)}</div>
              <div><span class="font-bold">✍️ Writer:</span> ${escapeHtml(writer)}</div>
              <div><span class="font-bold">🏭 Production:</span> ${escapeHtml(productionCompanies)}</div>
              <div><span class="font-bold">💰 Budget:</span> ${budget}</div>
              <div><span class="font-bold">🏆 Revenue:</span> ${revenue}</div>
              <div><span class="font-bold">🏅 Awards:</span> ${escapeHtml(awards)}</div>
              <div><span class="font-bold">🔗 IMDb:</span> <a href="${imdbUrl}" target="_blank" rel="nofollow">View on IMDb</a></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mb-8"><h2 class="text-2xl font-bold border-l-4 border-[var(--utv-red)] pl-3 mb-4">🎭 Top Cast</h2><div class="cast-list">${castHtml}</div></div>

    ${trailerUrl ? `
    <div class="mb-8">
      <h2 class="text-2xl font-bold border-l-4 border-[var(--utv-red)] pl-3 mb-4">🎬 Official Trailer</h2>
      <div class="trailer-container"><iframe src="${trailerUrl}" allowfullscreen></iframe></div>
    </div>
    ` : ''}

    <div class="flex gap-4 justify-center mt-8">
      <button onclick="shareMovie('whatsapp')" class="share-btn whatsapp"><i class="fab fa-whatsapp"></i> WhatsApp</button>
      <button onclick="shareMovie('telegram')" class="share-btn telegram"><i class="fab fa-telegram"></i> Telegram</button>
    </div>
  </div>

  <footer class="bg-black border-t border-zinc-800 p-6 text-center text-zinc-500 text-xs">
    <p>© 2026 U-TV REVIEW – Critical Analysis & Reviews | Data: TMDB & OMDb</p>
    <p><a href="mailto:HELP.WOWMOVIES@GMAIL.COM" class="text-[var(--utv-red)]">DMCA / Report</a></p>
  </footer>

  <script>
    function shareMovie(platform) {
      const url = encodeURIComponent(window.location.href);
      const text = encodeURIComponent("Check out the detailed review of ${escapeHtml(title)} on U-TV REVIEW");
      if (platform === 'whatsapp') window.open(\`https://api.whatsapp.com/send?text=\${text} \${url}\`, '_blank');
      else if (platform === 'telegram') window.open(\`https://t.me/share/url?url=\${url}&text=\${text}\`, '_blank');
    }
  </script>
  <script async data-cfasync="false" src="https://pl28831952.effectivegatecpm.com/e1fcb13904d27c4fe4e794fb5b4db78d/invoke.js"></script>
</body>
</html>`;
  fs.writeFileSync(path.join(movieDir, 'index.html'), html);
  console.log(`✅ Movie review page: /movie/${movie.id}/`);
}

function generateSitemap(movies) {
  let urls = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  urls += `  <url><loc>${SITE_URL}/</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod><priority>1.0</priority></url>\n`;
  for (const m of movies) urls += `  <url><loc>${SITE_URL}/movie/${m.id}/</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod><priority>0.8</priority></url>\n`;
  urls += `</urlset>`;
  fs.writeFileSync('sitemap.xml', urls);
  fs.writeFileSync('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n\nUser-agent: GPTBot\nDisallow: /\nUser-agent: CCBot\nDisallow: /`);
  console.log('✅ Sitemap & robots.txt generated');
}

(async () => {
  console.log('🚀 Generating static review pages with OMDb (IMDb ratings, Metascore, Awards)');
  const movies = await getAllMovies();
  console.log(`📦 Fetched ${movies.length} movies.`);
  if (fs.existsSync('./movie')) fs.rmSync('./movie', { recursive: true, force: true });
  fs.mkdirSync('./movie');
  for (let i = 0; i < movies.length; i++) {
    console.log(`📝 ${i+1}/${movies.length}: ${movies[i].title}`);
    const details = await fetchMovieDetails(movies[i].id).catch(() => null);
    if (details) await generateMoviePage(movies[i], details);
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
  generateSitemap(movies);
  console.log('🎉 Build complete! Now push to GitHub.');
})();
