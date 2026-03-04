import os
import requests
import json
import datetime

# API Keys from GitHub Secrets
TMDB_KEY = os.getenv('TMDB_API_KEY')
GEMINI_KEY = os.getenv('GEMINI_API_KEY')

def get_human_review(movie_name, overview):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={GEMINI_KEY}"
    prompt = f"""
    Write a movie review for '{movie_name}' in 'Hinglish' (Hindi + English mix).
    Tone: Professional Critic but with a Human touch. Use words like 'Bhaiyo', 'Paisa Vasool', 'Ek Number'.
    Avoid robotic language. Make it look like a real person wrote it.
    Context: {overview}
    Keep it under 150 words.
    """
    
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    response = requests.post(url, json=payload)
    return response.json()['candidates'][0]['content']['parts'][0]['text']

def sync_data():
    # 1. Fetch Trending Movie
    res = requests.get(f"https://api.themoviedb.org/3/trending/movie/day?api_key={TMDB_KEY}")
    movie = res.json()['results'][0] # Pick the top one
    
    movie_title = movie['title']
    human_text = get_human_review(movie_title, movie['overview'])
    
    # 2. Prepare Data for your 18 Features
    new_post = {
        "title": movie_title,
        "review": human_text,
        "critics_score": round(movie['vote_average'], 1),
        "audience_score": int(movie['vote_average'] * 10 + 5),
        "image": f"https://image.tmdb.org/t/p/w500{movie['poster_path']}",
        "time": datetime.datetime.now().strftime("%I:%M %p"),
        "is_certified": movie['vote_average'] > 7.5
    }
    
    # 3. Update your data.json (Site will read from here)
    with open('posts.json', 'r+') as f:
        data = json.load(f)
        data.insert(0, new_post) # Add new post at top
        f.seek(0)
        json.dump(data[:20], f, indent=4) # Keep last 20 posts

if __name__ == "__main__":
    sync_data()
