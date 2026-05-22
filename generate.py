import os
import requests

# 1. अपनी TMDB API Key और Base URL यहाँ सेट करें
API_KEY = "178d0214bf93dd59b3d5ec69a8c967f"  # इसे आप चाहें तो सुरक्षित रखने के लिए GitHub Secrets में भी डाल सकते हैं
PAGES_TO_FETCH = 250  # करीब 5,000 मूवीज
BASE_URL = "https://u-tv.pages.dev" # या आपकी github.io वाली साइट का URL

# 2. अट्रैक्टिव और प्रोफेशनल HTML टेम्पलेट (डार्क थीम + SEO रेडी)
HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="hi-IN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Watch {movie_title} Full Movie Online Free - U-TV</title>
    <meta name="description" content="{overview}">
    <meta name="keywords" content="{movie_title}, watch online, free movies, U-TV, IMDB {movie_id}">
    <meta property="og:title" content="Watch {movie_title} Full Movie Online Free - U-TV">
    <meta property="og:description" content="{overview}">
    <meta property="og:image" content="https://image.tmdb.org/t/p/w500{poster_path}">
    <meta property="og:type" content="video.movie">
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{ background-color: #141414; color: #ffffff; font-family: sans-serif; padding-bottom: 50px; }}
        .navbar {{ background-color: #000000; padding: 15px 5%; border-bottom: 2px solid #e50914; }}
        .navbar .logo {{ font-size: 24px; font-weight: bold; color: #e50914; text-decoration: none; }}
        .container {{ max-width: 1200px; margin: 30px auto; padding: 0 20px; }}
        .player-container {{ background: #000; width: 100%; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; margin-bottom: 30px; border: 1px solid #2f2f2f; }}
        .player-container iframe {{ width: 100%; height: 100%; border: none; }}
        .movie-details {{ display: flex; gap: 30px; background: #1f1f1f; padding: 25px; border-radius: 8px; border: 1px solid #2f2f2f; }}
        .poster-box {{ flex: 0 0 200px; }}
        .poster-box img {{ width: 100%; border-radius: 6px; }}
        .info-box {{ flex: 1; }}
        .movie-title {{ font-size: 28px; margin-bottom: 10px; }}
        .description {{ font-size: 16px; line-height: 1.6; color: #cccccc; }}
        @media (max-width: 768px) {{
            .movie-details {{ flex-direction: column; align-items: center; text-align: center; }}
        }}
    </style>
</head>
<body>
    <header class="navbar"><a href="/" class="logo">U-TV</a></header>
    <main class="container">
        <div class="player-container">
            <iframe src="https://vidsrc.me/embed/movie/{movie_id}" allowfullscreen></iframe>
        </div>
        <section class="movie-details">
            <div class="poster-box">
                <img src="https://image.tmdb.org/t/p/w500{poster_path}" alt="{movie_title} Poster">
            </div>
            <div class="info-box">
                <h1 class="movie-title">{movie_title}</h1>
                <p class="description">{overview}</p>
            </div>
        </section>
    </main>
</body>
</html>"""

# 3. सिटमैप की शुरुआत
sitemap_urls = []

print("मूवीज फेच करना और पेजेस जनरेट करना शुरू हो रहा है...")

# 4. API से डेटा निकालना और पेजेस बनाना
for page in range(1, PAGES_TO_FETCH + 1):
    url = f"https://api.themoviedb.org/3/movie/popular?api_key={API_KEY}&language=hi-IN&page={page}"
    try:
        response = requests.get(url)
        if response.status_code != 200:
            continue
        data = response.json()
    except Exception as e:
        print(f"Page {page} पर एरर आया: {e}")
        continue

    for movie in data.get('results', []):
        movie_id = movie.get('id')
        movie_title = movie.get('title', 'Unknown Movie')
        poster_path = movie.get('poster_path', '')
        overview = movie.get('overview', 'Watch full movie online on U-TV.').replace('"', "'")
        
        if not movie_id:
            continue

        # HTML फ़ाइल का नाम (जैसे: 100042.html)
        file_name = f"{movie_id}.html"
        
        # HTML कंटेंट तैयार करें
        output_html = HTML_TEMPLATE.format(
            movie_id=movie_id,
            movie_title=movie_title,
            poster_path=poster_path,
            overview=overview
        )
        
        # फाइल राइट करें
        with open(file_name, "w", encoding="utf-8") as f:
            f.write(output_html)
            
        # सिटमैप के लिए URL लिस्ट में जोड़ें
        sitemap_urls.append(f"  <url>\n    <loc>{BASE_URL}/{file_name}</loc>\n    <priority>0.8</priority>\n  </url>")

    print(f"Page {page}/{PAGES_TO_FETCH} डन...", end="\r")

# 5. sitemap.xml फ़ाइल को पूरी तरह से राइट (Write) करना
print("\nसिटमैप जेनरेट हो रहा है...")
sitemap_header = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
sitemap_footer = '\n</urlset>'

with open("sitemap.xml", "w", encoding="utf-8") as s_file:
    s_file.write(sitemap_header + "\n".join(sitemap_urls) + sitemap_footer)

print("सब कुछ सफलतापूर्वक पूरा हो गया! सभी पेजेस और sitemap.xml तैयार हैं।")
