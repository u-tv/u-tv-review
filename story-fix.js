<script type="module">
import { GoogleGenAI } from "https://esm.run/@google/genai";

const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const LANGS = {
  en: "English",
  hi: "Hindi",
  pa: "Punjabi",
  ta: "Tamil",
  te: "Telugu"
};

function normLang(x) {
  x = (x || "").toString().toLowerCase().trim();
  if (x === "english") return "en";
  if (x === "hindi") return "hi";
  if (x === "punjabi") return "pa";
  if (x === "tamil") return "ta";
  if (x === "telugu") return "te";
  return LANGS[x] ? x : "en";
}

function cacheKey(movieId, lang) {
  return `movie_story_${movieId}_${lang}`;
}

async function storyFix(movie, lang) {
  const lc = normLang(lang);
  const movieId = movie?.id || movie?.movie_id || movie?.tmdb_id || "";
  const title = movie?.title || movie?.name || "";
  const year = movie?.year || movie?.release_date || "";
  const genre = Array.isArray(movie?.genres) ? movie.genres.join(", ") : (movie?.genre || "");

  const box = document.getElementById("storyBox");
  if (!box) return;

  const saved = localStorage.getItem(cacheKey(movieId, lc));
  if (saved && saved.length > 300) {
    box.innerHTML = `<div style="white-space:pre-wrap;line-height:1.8">${saved}</div>`;
    return;
  }

  box.innerHTML = "Loading story...";

  try {
    const prompt = `
Write a very detailed movie story in ${LANGS[lc]}.
Movie title: ${title}
Release year: ${year}
Genre: ${genre}

Rules:
- Use only ${LANGS[lc]}.
- Minimum 1000 words.
- Do not write "Deep analysis in progress".
- Do not write blank lines only.
- Make it natural, complete, and user-friendly.
`;

    const res = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt
    });

    const text = (res.text || "").trim();

    if (!text) {
      box.innerHTML = `<p>No story available.</p>`;
      return;
    }

    localStorage.setItem(cacheKey(movieId, lc), text);
    box.innerHTML = `<div style="white-space:pre-wrap;line-height:1.8">${text}</div>`;
  } catch (e) {
    box.innerHTML = `<p>Story load failed.</p>`;
  }
}

window.storyFix = storyFix;
</script>
