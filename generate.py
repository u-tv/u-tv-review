import json
import os
from pathlib import Path

# Create directories
Path("movies").mkdir(exist_ok=True)
Path("tags").mkdir(exist_ok=True)

# Your movie database (add/edit movies here)
movies_data = {
    "movies": [
        {
            "id": "inception",
            "title": "Inception",
            "description": "A thief who steals corporate secrets through dream-sharing technology.",
            "tags": ["sci-fi", "action", "thriller"],
            "year": 2010,
            "rating": 8.8
        },
        {
            "id": "interstellar",
            "title": "Interstellar",
            "description": "A team of explorers travel through a wormhole in space.",
            "tags": ["sci-fi", "drama", "adventure"],
            "year": 2014,
            "rating": 8.6
        },
        {
            "id": "dark-knight",
            "title": "The Dark Knight",
            "description": "Batman faces the Joker, a criminal mastermind.",
            "tags": ["action", "crime", "drama"],
            "year": 2008,
            "rating": 9.0
        }
    ]
}

# Generate main index page
index_html = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Movie Reviews</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: #f4f4f4; }
        .header { background: #1a1a2e; color: white; padding: 20px; text-align: center; }
        .container { max-width: 1200px; margin: auto; padding: 20px; }
        .movie-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .movie-card { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .movie-card h2 { color: #1a1a2e; margin-bottom: 10px; }
        .movie-card p { color: #666; margin: 10px 0; }
        .tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 15px 0; }
        .tag { background: #007bff; color: white; padding: 4px 10px; border-radius: 5px; font-size: 12px; text-decoration: none; }
        .rating { color: #ffc107; font-weight: bold; }
        .btn { display: inline-block; background: #1a1a2e; color: white; padding: 8px 15px; text-decoration: none; border-radius: 5px; margin-top: 10px; }
        .footer { text-align: center; padding: 20px; background: #1a1a2e; color: white; margin-top: 40px; }
        @media (max-width: 768px) { .movie-grid { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎬 Movie Reviews</h1>
        <p>Your daily movie guide</p>
    </div>
    <div class="container">
        <div class="movie-grid">
'''

# Generate individual movie pages
for movie in movies_data["movies"]:
    # Create tags HTML
    tags_html = ''.join([f'<a href="/tags/{tag}.html" class="tag">{tag}</a>' for tag in movie["tags"]])
    
    # Individual movie page
    movie_html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{movie["title"]} - Movie Review</title>
    <meta name="description" content="{movie["description"]}">
    <meta name="keywords" content="{', '.join(movie["tags"])}">
    <style>
        body {{ font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; }}
        .header {{ background: #1a1a2e; color: white; padding: 20px; text-align: center; }}
        .container {{ max-width: 800px; margin: auto; padding: 20px; background: white; border-radius: 10px; margin-top: 20px; }}
        .tags {{ display: flex; gap: 10px; margin: 20px 0; flex-wrap: wrap; }}
        .tag {{ background: #007bff; color: white; padding: 5px 12px; border-radius: 5px; text-decoration: none; }}
        .back {{ display: inline-block; margin-top: 20px; color: #007bff; text-decoration: none; }}
        .rating {{ font-size: 20px; color: #ffc107; margin: 10px 0; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>{movie["title"]}</h1>
        <p>{movie["year"]} | Rating: {movie["rating"]}/10</p>
    </div>
    <div class="container">
        <p style="font-size: 18px; line-height: 1.6;">{movie["description"]}</p>
        <div class="tags">
            Tags: {tags_html}
        </div>
        <a href="/" class="back">← Back to Home</a>
    </div>
</body>
</html>'''
    
    # Save movie page
    with open(f"movies/{movie['id']}.html", "w", encoding="utf-8") as f:
        f.write(movie_html)
    
    # Add to index grid
    index_html += f'''
            <div class="movie-card">
                <h2>{movie['title']} ({movie['year']})</h2>
                <div class="rating">⭐ {movie['rating']}/10</div>
                <p>{movie['description'][:120]}...</p>
                <div class="tags">{tags_html}</div>
                <a href="/movies/{movie['id']}.html" class="btn">Watch Review →</a>
            </div>'''

# Generate tag pages
all_tags = set()
for movie in movies_data["movies"]:
    for tag in movie["tags"]:
        all_tags.add(tag)

for tag in all_tags:
    tag_movies = [m for m in movies_data["movies"] if tag in m["tags"]]
    tag_movies_html = ''
    for movie in tag_movies:
        tag_movies_html += f'''
        <div class="movie-card">
            <h2>{movie['title']} ({movie['year']})</h2>
            <p>{movie['description'][:100]}...</p>
            <a href="/movies/{movie['id']}.html" class="btn">View →</a>
        </div>'''
    
    tag_page = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Movies tagged: {tag}</title>
    <style>
        body {{ font-family: Arial; background: #f4f4f4; margin: 0; }}
        .header {{ background: #1a1a2e; color: white; padding: 20px; text-align: center; }}
        .container {{ max-width: 1200px; margin: auto; padding: 20px; }}
        .movie-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }}
        .movie-card {{ background: white; border-radius: 10px; padding: 20px; }}
        .btn {{ background: #1a1a2e; color: white; padding: 8px 15px; text-decoration: none; border-radius: 5px; }}
        .back {{ display: inline-block; margin: 20px; color: #007bff; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>🎬 Movies tagged: #{tag}</h1>
    </div>
    <div class="container">
        <div class="movie-grid">{tag_movies_html}</div>
        <a href="/" class="back">← Back to Home</a>
    </div>
</body>
</html>'''
    
    with open(f"tags/{tag}.html", "w", encoding="utf-8") as f:
        f.write(tag_page)

# Complete index page
index_html += '''
        </div>
    </div>
    <div class="footer">
        <p>© 2024 Movie Reviews | Auto-synced with GitHub</p>
    </div>
</body>
</html>'''

# Save index page
with open("index.html", "w", encoding="utf-8") as f:
    f.write(index_html)

# Create README
readme = """# Movie Review Site
Auto-synced movie review website with individual pages for each movie.

## Add/Edit Movies
Edit `movies_data` in `generate_pages.py` and run:
```bash
python generate_pages.py
