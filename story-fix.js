<script type="module">
import { GoogleGenAI } from "https://esm.run/@google/genai";

const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const LANGS = { en:"English", hi:"Hindi", pa:"Punjabi", ta:"Tamil", te:"Telugu" };

function normLang(x) {
  x = (x || "").toString().toLowerCase().trim();
  if (x === "english") return "en";
  if (x === "hindi") return "hi";
  if (x === "punjabi") return "pa";
  if (x === "tamil") return "ta";
  if (x === "telugu") return "te";
  return LANGS[x] ? x : "en";
}

function k(movieId, lang) {
  return `story_${location.pathname}_${movieId}_${lang}`;
}

window.storyFix = async function(movie, lang) {
  const box = document.getElementById("storyBox");
  if (!box) return;

  const lc = normLang(lang);
  const movieId = movie?.id || movie?.movie_id || movie?.tmdb_id || "";
  const title = movie?.title || movie?.name || movie?.original_title || "";
  const year = (movie?.release_date || movie?.year || "").toString().slice(0, 4);
  const genre = Array.isArray(movie?.genres)
    ? movie.genres.map(g => g.name || g).join(", ")
    : (movie?.genre || movie?.genres || "");

  const cached = localStorage.getItem(k(movieId, lc));
  if (cached && cached.length > 300) {
    box.innerHTML = `<div style="white-space:pre-wrap;line-height:1.8">${cached}</div>`;
    return;
  }

  box.innerHTML = "Loading story...";

  if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
    box.innerHTML = "<p>Gemini API key missing.</p>";
    return;
  }

  try {
    const prompt = `Write a detailed movie story in ${LANGS[lc]}.
Movie title: ${title}
Release year: ${year}
Genre: ${genre}

Rules:
- Use only ${LANGS[lc]}.
- Minimum 1000 words.
- Do not write "Deep analysis in progress".
- Do not leave blank text.
- Make it natural and complete.
- Return only the story.`;

    const res = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt
    });

    const text = (res.text || "").trim();

    if (!text) {
      box.innerHTML = "<p>No story available.</p>";
      return;
    }

    localStorage.setItem(k(movieId, lc), text);
    box.innerHTML = `<div style="white-space:pre-wrap;line-height:1.8">${text}</div>`;
  } catch (e) {
    box.innerHTML = `<p>Story load failed.</p>`;
  }
};
</script>
// 1. Apne code ke sabse upar apni Gemini Key daal dein
const GEMINI_API_KEY = "AIzaSyBTLkHyTKZpBEnZZvgTqAm0kvvmF38kgnE"; // (Isey badal lena bad mein)

// 2. Yeh function tab chalega jab user kisi language button par click karega
async function handleLanguageClick(targetLanguage, englishStory) {
    
    // Pehle check karein ki kya TMDB se us language ki story mili?
    let currentStory = movieData.overviews[targetLanguage]; 

    // Agar story nahi milti ya blank aati hai, toh Gemini ko call karein
    if (!currentStory || currentStory.trim() === "") {
        console.log("Story blank hai, Gemini se translate kar rahe hain...");
        
        // UI par loader dikhayein takki user ko lage ki kuch load ho raha hai
        document.getElementById("story-box").innerText = "Loading story in " + targetLanguage + "...";

        try {
            // Gemini API ko direct call karne ka URL
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ 
                            text: `Translate this movie overview into professional and engaging ${targetLanguage}. Keep the original meaning and movie tone intact. Text to translate: "${englishStory}"` 
                        }]
                    }]
                })
            });

            const data = await response.json();
            
            // Gemini se aayi hui translated story ko variable me daalein
            currentStory = data.candidates[0].content.parts[0].text;

        } catch (error) {
            console.error("Gemini Error:", error);
            currentStory = englishStory; // Agar koi error aaye toh safe side English dikha do, blank mat rakho
        }
    }

    // 3. Final story ko website ke screen par show kar dein
    document.getElementById("story-box").innerText = currentStory;
}
