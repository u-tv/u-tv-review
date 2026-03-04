const fs = require('fs');
const https = require('https');

const TMDB_KEY = process.env.TMDB_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function getAIReview(title, overview) {
    const prompt = `Write a movie review for '${title}' in Hinglish (Hindi+English). Style: Human, Use 'Bhaiyo', 'Paisa Vasool'. Context: ${overview}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`;
    
    const data = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
    
    return new Promise((resolve) => {
        const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    resolve(json.candidates[0].content.parts[0].text);
                } catch (e) { resolve("Bhaiyo, ek number movie hai, zaroor dekho!"); }
            });
        });
        req.write(data);
        req.end();
    });
}

async function startSync() {
    https.get(`https://api.themoviedb.org/3/trending/movie/day?api_key=${TMDB_KEY}`, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', async () => {
            const movie = JSON.parse(body).results[0];
            const review = await getAIReview(movie.title, movie.overview);
            
            const newPost = {
                title: movie.title,
                review: review,
                critics_score: movie.vote_average.toFixed(1),
                audience_score: Math.floor(movie.vote_average * 10),
                image: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
                time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                is_certified: movie.vote_average > 7.5
            };

            let posts = JSON.parse(fs.readFileSync('posts.json', 'utf8') || '[]');
            posts.unshift(newPost);
            fs.writeFileSync('posts.json', JSON.stringify(posts.slice(0, 10), null, 4));
            console.log("1000% Success: Data Synced!");
        });
    });
}

startSync();
