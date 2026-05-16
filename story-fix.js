<script type="module">
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";AIzaSyBTLkHyTKZpBEnZZvgTqAm0kvvmF38kgnE

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

function boxEl() {
  return document.getElementById("story-box") || document.getElementById("storyBox");
}

function movieId(movie) {
  return movie?.id || movie?.movie_id || movie?.tmdb_id || movie?.movieId || "";
}

function englishKey(movie) {
  return `story_${location.pathname}_${movieId(movie)}_en`;
}

function langKey(movie, lang) {
  return `story_${location.pathname}_${movieId(movie)}_${lang}`;
}

async function geminiGenerate(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}`);
  }

  const data = await response.json();
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
}

async function buildEnglishStory(movie) {
  const key = englishKey(movie);
  const saved = localStorage.getItem(key);
  if (saved && saved.trim().length > 50) return saved;

  const title = movie?.title || movie?.name || movie?.original_title || "";
  const year = (movie?.release_date || movie?.year || "").toString().slice(0, 4);
  const genre = Array.isArray(movie?.genres)
    ? movie.genres.map(g => g.name || g).join(", ")
    : (movie?.genre || movie?.genres || "");

  if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
    throw new Error("Gemini key missing");
  }

  const prompt = `Write a detailed movie story in English.
Movie title: ${title}
Release year: ${year}
Genre: ${genre}

Rules:
- Minimum 1000 words
- Return only the story
- Do not write "Deep analysis in progress"
- Make it natural and complete`;

  const text = await geminiGenerate(prompt);
  if (!text) throw new Error("Empty English story");

  localStorage.setItem(key, text);
  return text;
}

async function translateEnglishStory(englishStory, targetLanguage) {
  const prompt = `Translate this English movie story into ${targetLanguage}. Keep meaning, tone, and flow. Return only the translated story:

${englishStory}`;
  const text = await geminiGenerate(prompt);
  return text || englishStory;
}

window.storyFix = async function(movie, lang) {
  const box = boxEl();
  if (!box) return;

  const lc = normLang(lang);
  const finalKey = langKey(movie, lc);

  const cached = localStorage.getItem(finalKey);
  if (cached && cached.trim().length > 20) {
    box.innerText = cached;
    return;
  }

  try {
    box.innerText = "Loading story...";
    const englishStory = await buildEnglishStory(movie);

    if (lc === "en") {
      localStorage.setItem(finalKey, englishStory);
      box.innerText = englishStory;
      return;
    }

    const translated = await translateEnglishStory(englishStory, LANGS[lc]);
    localStorage.setItem(finalKey, translated);
    box.innerText = translated;
  } catch (e) {
    console.error(e);
    box.innerText = "Story load failed.";
  }
};
</script>
storyFix(movieData, "en");
storyFix(movieData, "hi");
storyFix(movieData, "pa");
storyFix(movieData, "ta");
storyFix(movieData, "te");
