const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const TMDB_KEY = process.env.TMDB_API_KEY;
const DAILY_PATH = path.join(process.cwd(), 'daily-posts.json');

async function main() {
  // 1) Purane daily posts read karo
  let oldPosts = [];
  if (fs.existsSync(DAILY_PATH)) {
    try {
      const raw = fs.readFileSync(DAILY_PATH, 'utf8');
      oldPosts = JSON.parse(raw);
      if (!Array.isArray(oldPosts)) oldPosts = [];
    } catch {
      oldPosts = [];
    }
  }

  // 2) TMDB se aaj ke trending movies lo
  const url = `https://api.themoviedb.org/3/trending/movie/day?api_key=${TMDB_KEY}&language=en-IN`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TMDB error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const movies = data.results || [];

  if (!movies.length) {
    console.log('No movies returned from TMDB.');
    return;
  }

  // 3) Top 5 movies lo
  const fresh = movies.slice(0, 5);

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

  // 4) Naye 5 posts banao
  const newPosts = fresh.map(m => {
    const rating = m.vote_average || 0;
    const criticsScore = Math.min(99, Math.round(rating * 10));
    const poster = m.poster_path
      ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
      : 'https://via.placeholder.com/500x750?text=No+Image';

    return {
      title: `${m.title} Review`,
      image: poster,
      rating: rating.toFixed(1),
      critics: `${criticsScore}%`,
      review: "Latest trending movie!",
      time: timeStr,
      is_certified: rating >= 7.5
    };
  });

  // 5) Sirf latest 5 rakho (purane daily ko replace karo)
  fs.writeFileSync(DAILY_PATH, JSON.stringify(newPosts, null, 2));
  console.log(`Daily posts updated with ${newPosts.length} movies.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
