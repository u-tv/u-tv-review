<script type="module">
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";

const LANG_MAP = {
  english: "en-US",
  hindi: "hi-IN",
  punjabi: "pa-IN",
  tamil: "ta-IN",
  telugu: "te-IN",
  en: "en-US",
  hi: "hi-IN",
  pa: "pa-IN",
  ta: "ta-IN",
  te: "te-IN"
};

function normalizeLang(lang) {
  return LANG_MAP[(lang || "").toString().toLowerCase().trim()] || "en-US";
}

function getBox() {
  return document.getElementById("story-box") || document.getElementById("storyBox");
}

function getMovieId(movieData) {
  return movieData?.id || movieData?.movie_id || movieData?.tmdb_id || movieData?.movieId || "";
}

function getEnglishStory(movieData) {
  return (
    movieData?.overviews?.en ||
    movieData?.overviews?.["en-US"] ||
    movieData?.overview ||
    movieData?.englishStory ||
    ""
  );
}

function getTargetStory(movieData, targetLanguage) {
  if (!movieData || !movieData.overviews) return "";
  return (
    movieData.overviews[targetLanguage] ||
    movieData.overviews[normalizeLang(targetLanguage)] ||
    movieData.overviews[targetLanguage?.toLowerCase?.()] ||
    ""
  );
}

function cacheKey(movieData, lang) {
  return `story_${location.pathname}_${getMovieId(movieData)}_${lang}`;
}

async function callGeminiTranslate(text, targetLanguage) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const prompt = `Translate this movie overview into professional and engaging ${targetLanguage}. Keep the original meaning and movie tone intact. Return only the translated story. Text: "${text}"`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}`);
  }

  const data = await response.json();
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return out.trim();
}

window.handleLanguageClick = async function(targetLanguage, movieData) {
  const box = getBox();
  if (!box) return;

  const langCode = normalizeLang(targetLanguage);
  const movieId = getMovieId(movieData);
  const key = cacheKey(movieData, langCode);

  if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
    box.innerText = "Gemini API key missing.";
    return;
  }

  const cached = localStorage.getItem(key);
  if (cached && cached.trim().length > 10) {
    box.innerText = cached;
    return;
  }

  let currentStory = getTargetStory(movieData, targetLanguage);

  if (!currentStory || !currentStory.trim()) {
    const englishStory = getEnglishStory(movieData);

    if (!englishStory.trim()) {
      box.innerText = "English story bhi nahi mili.";
      return;
    }

    box.innerText = `Loading story in ${targetLanguage}...`;

    try {
      currentStory = await callGeminiTranslate(englishStory, targetLanguage);

      if (!currentStory) {
        currentStory = englishStory;
      }

      localStorage.setItem(key, currentStory);
    } catch (error) {
      console.error("Gemini Error:", error);
      currentStory = englishStory;
      localStorage.setItem(key, currentStory);
    }
  }

  box.innerText = currentStory;
};
</script>
