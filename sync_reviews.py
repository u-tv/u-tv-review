import os
import requests
import json
import datetime

# GitHub Secrets से नाम बिल्कुल सही होने चाहिए
TMDB_KEY = os.getenv('TMDB_API_KEY')
GEMINI_KEY = os.getenv('GEMINI_API_KEY')

def get_human_review(movie_name, overview):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={GEMINI_KEY}"
    prompt = f"Write a movie review for '{movie_name}' in Hinglish. Style: Human, Professional, uses 'Bhaiyo'. Review this: {overview}"
    
    try:
        response = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=30)
        response.raise_for_status()
        return response.json()['candidates'][0]['content']['parts'][0]['text']
    except Exception as e:
        print(f"AI Error: {e}")
        return "Must watch movie for everyone! Paisa vasool entertainment."

def sync_data():
    # 1. Fetch Trending Data
    try:
        res = requests.get(f"https://api.themoviedb.org/3/trending/movie/day?api_key={TMDB_KEY}")
        res.raise_for_status()
        movie = res.json()['results'][0]
    except Exception as e:
        print(f"TMDB Error: {e}")
        return

    # 2. Prepare Post
    new_post = {
        "title": movie['title'],
        "review": get_human_review(movie['title'], movie['overview']),
        "critics_score": round(movie.get('vote_average', 0), 1),
        "audience_score": int(movie.get('vote_average', 0) * 10),
        "image": f"https://image.tmdb.org/t/p/w500{movie.get('poster_path', '')}",
        "time": datetime.datetime.now().strftime("%I:%M %p"),
        "is_certified": movie.get('vote_average', 0) > 7.5
    }

    # 3. Write to posts.json (Path fix)
    file_path = 'posts.json'
    
    # अगर फाइल नहीं है तो बनाओ
    if not os.path.exists(file_path):
        with open(file_path, 'w') as f:
            json.dump([], f)

    try:
        with open(file_path, 'r+') as f:
            data = json.load(f)
            data.insert(0, new_post)
            f.seek(0)
            json.dump(data[:10], f, indent=4)
            f.truncate()
        print("Successfully synced!")
    except Exception as e:
        print(f"File Error: {e}")

if __name__ == "__main__":
    sync_data()
