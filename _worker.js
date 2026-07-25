// _worker.js — Auto-sync sitemap with TMDB
const TMDB_KEY = '174d0214bf933dd59b3d5ec68a0c967f';
const BASE_URL = 'https://u-tv-review.pages.dev';

// ===== FETCH MOVIES FROM TMDB =====
async function fetchMovies() {
  const url = `https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_KEY}&page=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('TMDB error');
    const data = await res.json();
    return (data.results || []).filter(item => item.poster_path).slice(0, 50);
  } catch {
    return [];
  }
}

// ===== GENERATE SITEMAP XML =====
function generateSitemap(movies) {
  const staticPages = [
    '/', '/about/', '/dmca/', '/disclaimer/', '/contact/', '/privacy/', '/terms/'
  ];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

  // Static pages
  staticPages.forEach(path => {
    const priority = path === '/' ? '1.0' : '0.8';
    xml += `
  <url>
    <loc>${BASE_URL}${path}</loc>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
  });

  // Movie pages (dynamic)
  movies.forEach(m => {
    const type = m.media_type || 'movie';
    xml += `
  <url>
    <loc>${BASE_URL}/${type}/${m.id}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
  });

  xml += `
</urlset>`;
  return xml;
}

// ===== MAIN WORKER =====
export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    // === SITEMAP ROUTE ===
    if (url.pathname === '/sitemap.xml') {
      const movies = await fetchMovies();
      const sitemap = generateSitemap(movies);
      return new Response(sitemap, {
        headers: {
          'Content-Type': 'application/xml',
          'Cache-Control': 'public, max-age=3600' // 1 hour cache
        }
      });
    }
    
    // === OPTIONAL: API PROXY (if you want to hide TMDB key) ===
    if (url.pathname === '/api/movies') {
      const category = url.searchParams.get('cat') || 'movie';
      const page = url.searchParams.get('page') || 1;
      const proxyUrl = `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_KEY}&page=${page}`;
      const res = await fetch(proxyUrl);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // === FALLBACK: Serve static assets ===
    return new Response('Not Found', { status: 404 });
  }
};
