// generate.js
// U-TV REVIEW — Advanced Static Content Generator
// Node.js 18+
// No external npm packages required.
//
// Required environment variables:
// TMDB_API_KEY_1=your_key
// TMDB_API_KEY_2=your_optional_backup_key
//
// Optional:
// SITE_URL=https://u-tv-review.pages.dev
// MAX_MOVIE_PAGES=25
// MAX_TV_PAGES=25
// ITEMS_PER_TYPE=100
// REQUEST_DELAY_MS=250
// TMDB_LANGUAGE=en-US

'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG = Object.freeze({
  SITE_URL: (
    process.env.SITE_URL ||
    'https://u-tv-review.pages.dev'
  ).replace(/\/+$/, ''),

  OUTPUT_DIR: path.join(process.cwd(), 'public'),

  TMDB_BASE_URL: 'https://api.themoviedb.org/3',
  TMDB_IMAGE_URL: 'https://image.tmdb.org/t/p',

  TMDB_LANGUAGE: process.env.TMDB_LANGUAGE || 'en-US',

  MAX_MOVIE_PAGES: toPositiveInt(
    process.env.MAX_MOVIE_PAGES,
    25
  ),

  MAX_TV_PAGES: toPositiveInt(
    process.env.MAX_TV_PAGES,
    25
  ),

  ITEMS_PER_TYPE: toPositiveInt(
    process.env.ITEMS_PER_TYPE,
    100
  ),

  REQUEST_DELAY_MS: toPositiveInt(
    process.env.REQUEST_DELAY_MS,
    250
  ),

  REQUEST_TIMEOUT_MS: 15000,

  MAX_RETRIES: 3,

  MAX_CAST: 12,

  MAX_CREW: 30,

  MAX_SITEMAP_URLS: 50000
});

const TMDB_API_KEYS = [
  process.env.TMDB_API_KEY_1,
  process.env.TMDB_API_KEY_2,
  process.env.TMDB_API_KEY_3
].filter(Boolean);

const STATIC_PAGES = [
  {
    slug: 'about',
    title: 'About Us',
    desc: 'Learn more about U-TV REVIEW and our movie and TV discovery platform.'
  },
  {
    slug: 'dmca',
    title: 'DMCA Policy',
    desc: 'Read our copyright and content removal policy.'
  },
  {
    slug: 'disclaimer',
    title: 'Disclaimer',
    desc: 'Important information about third-party information and external services.'
  },
  {
    slug: 'contact',
    title: 'Contact',
    desc: 'Contact U-TV REVIEW for questions, corrections and support.'
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    desc: 'Learn how this website handles basic website data and cookies.'
  },
  {
    slug: 'terms',
    title: 'Terms of Use',
    desc: 'Rules and conditions for using U-TV REVIEW.'
  }
];

const DISCOVERY_ENDPOINTS = {
  movie: '/movie/popular',
  tv: '/tv/popular'
};

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);

  return Number.isFinite(n) && n > 0
    ? n
    : fallback;
}

function escapeHtml(value = '') {
  return String(value).replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]
  );
}

function escapeAttribute(value = '') {
  return escapeHtml(value);
}

function safeText(value = '', maxLength = 5000) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function slugify(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function absoluteUrl(value = '') {
  if (!value) return '';

  try {
    return new URL(value, CONFIG.SITE_URL).toString();
  } catch {
    return '';
  }
}

function imageUrl(file, size = 'w500') {
  if (!file) return '';
  return `${CONFIG.TMDB_IMAGE_URL}/${size}${file}`;
}

function getTitle(item) {
  return safeText(
    item?.title ||
    item?.name ||
    item?.original_title ||
    item?.original_name ||
    'Untitled'
  );
}

function getReleaseDate(item) {
  return (
    item?.release_date ||
    item?.first_air_date ||
    ''
  );
}

function getYear(item) {
  const date = getReleaseDate(item);

  if (!date) return '';

  const year = Number.parseInt(date.slice(0, 4), 10);

  return Number.isFinite(year) ? String(year) : '';
}

function formatRating(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 'N/A';
  }

  return number.toFixed(1);
}

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US').format(number);
}

function formatRuntime(details, type) {
  if (type === 'movie') {
    return details?.runtime
      ? `${details.runtime} min`
      : 'N/A';
  }

  const runtime = details?.episode_run_time?.find(
    value => Number(value) > 0
  );

  return runtime
    ? `${runtime} min/episode`
    : 'N/A';
}

function uniqueById(items = []) {
  const map = new Map();

  for (const item of items) {
    if (!item || item.id == null) continue;

    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }

  return [...map.values()];
}

function writeFileSafe(filePath, content) {
  fs.mkdirSync(
    path.dirname(filePath),
    { recursive: true }
  );

  fs.writeFileSync(
    filePath,
    content,
    'utf8'
  );
}

function removeOutputDirectory() {
  if (
    fs.existsSync(CONFIG.OUTPUT_DIR) &&
    path.basename(CONFIG.OUTPUT_DIR) === 'public'
  ) {
    fs.rmSync(
      CONFIG.OUTPUT_DIR,
      {
        recursive: true,
        force: true
      }
    );
  }

  fs.mkdirSync(
    CONFIG.OUTPUT_DIR,
    {
      recursive: true
    }
  );
}

function createRequestUrl(endpoint, params = {}, apiKey) {
  const url = new URL(
    `${CONFIG.TMDB_BASE_URL}${endpoint}`
  );

  url.searchParams.set(
    'api_key',
    apiKey
  );

  url.searchParams.set(
    'language',
    params.language || CONFIG.TMDB_LANGUAGE
  );

  for (const [key, value] of Object.entries(params)) {
    if (
      key === 'language' ||
      value === undefined ||
      value === null ||
      value === ''
    ) {
      continue;
    }

    url.searchParams.set(
      key,
      String(value)
    );
  }

  return url;
}

async function fetchJson(url) {
  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    CONFIG.REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'U-TV-Review-Generator/2.0'
        },
        signal: controller.signal
      }
    );

    const text = await response.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(
        `Invalid JSON response (${response.status})`
      );
    }

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestTMDB(
  endpoint,
  params = {}
) {
  if (!TMDB_API_KEYS.length) {
    throw new Error(
      'No TMDB API key configured. Set TMDB_API_KEY_1.'
    );
  }

  let lastError = null;

  for (const apiKey of TMDB_API_KEYS) {
    for (
      let attempt = 1;
      attempt <= CONFIG.MAX_RETRIES;
      attempt++
    ) {
      try {
        const url =
          createRequestUrl(
            endpoint,
            params,
            apiKey
          );

        const response =
          await fetchJson(url);

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          lastError = new Error(
            `TMDB authentication failed (${response.status})`
          );
          break;
        }

        if (response.status === 429) {
          const retryAfter =
            Number.parseInt(
              response.data?.status_message,
              10
            );

          await sleep(
            Number.isFinite(retryAfter)
              ? retryAfter * 1000
              : attempt * 1500
          );

          continue;
        }

        if (
          response.status >= 500 ||
          response.status === 408
        ) {
          lastError = new Error(
            `TMDB temporary error ${response.status}`
          );

          await sleep(
            attempt * 1000
          );

          continue;
        }

        if (!response.ok) {
          throw new Error(
            response.data?.status_message ||
            `TMDB request failed: ${response.status}`
          );
        }

        return response.data;
      } catch (error) {
        lastError = error;

        if (
          attempt < CONFIG.MAX_RETRIES
        ) {
          await sleep(
            attempt * 700
          );
        }
      }
    }
  }

  throw new Error(
    lastError?.message ||
    `TMDB request failed: ${endpoint}`
  );
}

async function getDiscovery(
  type,
  maxPages
) {
  const results = [];

  for (
    let page = 1;
    page <= maxPages;
    page++
  ) {
    console.log(
      `  ${type.toUpperCase()} discovery: page ${page}/${maxPages}`
    );

    try {
      const data =
        await requestTMDB(
          DISCOVERY_ENDPOINTS[type],
          {
            page
          }
        );

      const pageItems =
        Array.isArray(data?.results)
          ? data.results
          : [];

      if (!pageItems.length) {
        break;
      }

      for (const item of pageItems) {
        results.push({
          ...item,
          media_type_custom: type
        });
      }

      if (
        uniqueById(results).length >=
        CONFIG.ITEMS_PER_TYPE
      ) {
        break;
      }
    } catch (error) {
      console.warn(
        `  Warning: ${type} page ${page} failed: ${error.message}`
      );
    }

    await sleep(
      CONFIG.REQUEST_DELAY_MS
    );
  }

  return uniqueById(results)
    .slice(
      0,
      CONFIG.ITEMS_PER_TYPE
    );
}

async function getDetails(
  type,
  id
) {
  const endpoint =
    `/${type}/${encodeURIComponent(id)}`;

  const [
    details,
    credits,
    videos
  ] = await Promise.all([
    requestTMDB(
      endpoint,
      {
        append_to_response:
          'videos,images,watch/providers'
      }
    ),

    requestTMDB(
      `${endpoint}/credits`
    ).catch(() => ({
      cast: [],
      crew: []
    })),

    requestTMDB(
      `${endpoint}/videos`
    ).catch(() => ({
      results: []
    }))
  ]);

  return {
    ...details,
    credits,
    videos
  };
}

function findTrailer(details) {
  const videos =
    details?.videos?.results || [];

  const youtubeVideos =
    videos.filter(video =>
      video &&
      video.site === 'YouTube' &&
      video.key
    );

  const officialTrailer =
    youtubeVideos.find(video =>
      video.type === 'Trailer' &&
      video.official === true
    );

  const trailer =
    officialTrailer ||
    youtubeVideos.find(
      video => video.type === 'Trailer'
    ) ||
    youtubeVideos.find(
      video => video.type === 'Teaser'
    );

  return trailer
    ? `https://www.youtube.com/embed/${encodeURIComponent(trailer.key)}`
    : '';
}

function getDirector(details) {
  return (
    details?.credits?.crew?.find(
      person =>
        person.job === 'Director'
    )?.name ||
    ''
  );
}

function getCreators(details) {
  return (
    details?.created_by
      ?.map(person => person.name)
      .filter(Boolean)
      .join(', ') ||
    ''
  );
}

function getCast(details) {
  return (
    details?.credits?.cast
      ?.slice(0, CONFIG.MAX_CAST)
      .map(person => ({
        name: safeText(person.name),
        character: safeText(
          person.character
        ),
        profile: imageUrl(
          person.profile_path,
          'w185'
        )
      }))
      .filter(person => person.name) ||
    []
  );
}

function getGenres(details) {
  return (
    details?.genres
      ?.map(genre => genre.name)
      .filter(Boolean)
      .join(', ') ||
    'General'
  );
}

function buildJsonLd(
  item,
  details,
  type,
  pageUrl
) {
  const title =
    getTitle(item);

  const description =
    safeText(
      details?.overview ||
      item?.overview ||
      `${title} information on U-TV REVIEW.`,
      1000
    );

  const poster =
    imageUrl(
      item?.poster_path,
      'w780'
    );

  const base = {
    '@context': 'https://schema.org',
    '@type':
      type === 'movie'
        ? 'Movie'
        : 'TVSeries',
    name: title,
    description,
    url: pageUrl,
    image: poster
      ? [poster]
      : undefined,
    dateCreated:
      getReleaseDate(item) ||
      undefined,
    aggregateRating:
      Number(item?.vote_count) > 0
        ? {
            '@type':
              'AggregateRating',
            ratingValue:
              formatRating(
                item.vote_average
              ),
            ratingCount:
              String(
                item.vote_count
              ),
            bestRating: '10',
            worstRating: '0'
          }
        : undefined
  };

  if (type === 'movie') {
    const director =
      getDirector(details);

    if (director) {
      base.director = {
        '@type': 'Person',
        name: director
      };
    }
  } else {
    const creators =
      getCreators(details);

    if (creators) {
      base.creator = creators
        .split(',')
        .map(name => ({
          '@type': 'Person',
          name: name.trim()
        }));
    }
  }

  return JSON.stringify(
    base,
    null,
    2
  );
}

function renderServerIndependentPlayer(
  details,
  title
) {
  const trailer =
    findTrailer(details);

  if (!trailer) {
    return `
      <div class="no-video">
        <div class="no-video-icon">▶</div>
        <h3>No trailer available</h3>
        <p>
          An official trailer is not currently available
          for this title.
        </p>
      </div>
    `;
  }

  return `
    <div class="trailer-box">
      <iframe
        src="${escapeAttribute(trailer)}"
        title="${escapeAttribute(
          `${title} official trailer`
        )}"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen>
      </iframe>
    </div>
  `;
}

function buildMovieHtml(
  item,
  details,
  type
) {
  const title =
    getTitle(item);

  const year =
    getYear(item);

  const poster =
    imageUrl(
      item.poster_path,
      'w780'
    );

  const backdrop =
    imageUrl(
      item.backdrop_path,
      'original'
    ) ||
    poster;

  const releaseDate =
    getReleaseDate(item) ||
    'N/A';

  const rating =
    formatRating(
      item.vote_average
    );

  const voteCount =
    Number(details.vote_count) || 0;

  const runtime =
    formatRuntime(
      details,
      type
    );

  const genres =
    getGenres(details);

  const overview =
    safeText(
      details.overview ||
      item.overview ||
      'No description available.',
      3000
    );

  const tagline =
    safeText(
      details.tagline ||
      '',
      500
    );

  const cast =
    getCast(details);

  const director =
    type === 'movie'
      ? getDirector(details)
      : getCreators(details);

  const mediaLabel =
    type === 'movie'
      ? 'Movie'
      : 'TV Series';

  const pageUrl =
    `${CONFIG.SITE_URL}/${type}/${item.id}/`;

  const titleWithYear =
    year
      ? `${title} (${year})`
      : title;

  const castHtml =
    cast.length
      ? cast.map(person => `
          <div class="cast-card">
            ${
              person.profile
                ? `
                  <img
                    src="${escapeAttribute(
                      person.profile
                    )}"
                    alt="${escapeAttribute(
                      person.name
                    )}"
                    loading="lazy"
                  >
                `
                : `
                  <div class="cast-placeholder">
                    ${escapeHtml(
                      person.name
                        .slice(0, 1)
                        .toUpperCase()
                    )}
                  </div>
                `
            }
            <div>
              <strong>
                ${escapeHtml(
                  person.name
                )}
              </strong>
              ${
                person.character
                  ? `
                    <span>
                      ${escapeHtml(
                        person.character
                      )}
                    </span>
                  `
                  : ''
              }
            </div>
          </div>
        `).join('')
      : `
          <p class="muted">
            Cast information unavailable.
          </p>
        `;

  const jsonLd =
    buildJsonLd(
      item,
      details,
      type,
      pageUrl
    );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>
    ${escapeHtml(titleWithYear)} | U-TV REVIEW
  </title>

  <meta
    name="description"
    content="${escapeAttribute(
      `${titleWithYear}. Rating ${rating}/10. ${overview.slice(
        0,
        150
      )}`
    )}"
  >

  <meta
    name="robots"
    content="index,follow,max-image-preview:large"
  >

  <link
    rel="canonical"
    href="${escapeAttribute(pageUrl)}"
  >

  <meta
    property="og:title"
    content="${escapeAttribute(
      titleWithYear
    )} | U-TV REVIEW"
  >

  <meta
    property="og:description"
    content="${escapeAttribute(
      overview.slice(0, 200)
    )}"
  >

  ${
    poster
      ? `
        <meta
          property="og:image"
          content="${escapeAttribute(
            poster
          )}"
        >
      `
      : ''
  }

  <meta
    property="og:type"
    content="website"
  >

  <meta
    property="og:url"
    content="${escapeAttribute(pageUrl)}"
  >

  <meta
    name="twitter:card"
    content="summary_large_image"
  >

  <script type="application/ld+json">
${jsonLd}
  </script>

  <style>
    :root{
      color-scheme:dark;
      --bg:#050609;
      --panel:#0c0f15;
      --panel2:#11151e;
      --line:#202631;
      --text:#f8fafc;
      --muted:#94a3b8;
      --accent:#ea4c23;
      --accent2:#ff7043;
      --gold:#f5b942;
    }

    *{
      box-sizing:border-box;
      margin:0;
      padding:0;
    }

    html{
      scroll-behavior:smooth;
    }

    body{
      min-height:100vh;
      background:
        radial-gradient(
          circle at top,
          #151923 0,
          var(--bg) 45%,
          #020305 100%
        );
      color:var(--text);
      font-family:
        Inter,
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
      line-height:1.6;
    }

    a{
      color:inherit;
    }

    .backdrop{
      position:fixed;
      inset:0;
      z-index:-2;
      background:
        linear-gradient(
          180deg,
          rgba(5,6,9,.5),
          rgba(5,6,9,.98)
        ),
        url("${escapeAttribute(
          backdrop
        )}") center/cover no-repeat;
      filter:blur(18px);
      transform:scale(1.08);
      opacity:.4;
    }

    .container{
      width:min(1180px,100%);
      margin:auto;
      padding:20px;
    }

    .topbar{
      position:sticky;
      top:0;
      z-index:20;
      background:rgba(5,6,9,.82);
      backdrop-filter:blur(18px);
      border-bottom:1px solid rgba(255,255,255,.06);
    }

    .topbar-inner{
      width:min(1180px,100%);
      margin:auto;
      padding:14px 20px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:15px;
    }

    .brand{
      text-decoration:none;
      font-size:1.15rem;
      font-weight:950;
      letter-spacing:-.04em;
    }

    .brand span{
      color:var(--accent);
    }

    .home-btn{
      text-decoration:none;
      padding:8px 15px;
      border:1px solid var(--line);
      background:rgba(255,255,255,.04);
      border-radius:999px;
      font-size:.8rem;
      transition:.2s;
    }

    .home-btn:hover{
      border-color:var(--accent);
      transform:translateY(-1px);
    }

    .movie-box{
      margin-top:25px;
      padding:28px;
      display:grid;
      grid-template-columns:280px 1fr;
      gap:32px;
      background:rgba(10,12,18,.86);
      border:1px solid rgba(255,255,255,.08);
      border-radius:28px;
      box-shadow:
        0 30px 90px rgba(0,0,0,.35);
      backdrop-filter:blur(18px);
    }

    .poster{
      width:100%;
      aspect-ratio:2/3;
      object-fit:cover;
      border-radius:20px;
      background:#111;
      box-shadow:
        0 25px 45px rgba(0,0,0,.45);
    }

    .poster-placeholder{
      aspect-ratio:2/3;
      border-radius:20px;
      display:grid;
      place-items:center;
      background:var(--panel2);
      color:var(--muted);
    }

    .eyebrow{
      color:var(--accent2);
      font-size:.75rem;
      font-weight:900;
      letter-spacing:.12em;
      text-transform:uppercase;
      margin-bottom:8px;
    }

    h1{
      font-size:
        clamp(
          2rem,
          5vw,
          4rem
        );
      line-height:1.03;
      letter-spacing:-.05em;
      margin-bottom:10px;
    }

    .tagline{
      color:#cbd5e1;
      font-style:italic;
      margin-bottom:20px;
    }

    .meta{
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      margin-bottom:20px;
    }

    .pill{
      border:1px solid var(--line);
      background:rgba(255,255,255,.045);
      border-radius:999px;
      padding:7px 12px;
      font-size:.75rem;
      color:#cbd5e1;
    }

    .rating{
      color:var(--gold);
      font-weight:900;
    }

    .overview{
      color:#d7dee9;
      font-size:.98rem;
      line-height:1.8;
      margin-bottom:25px;
    }

    .credit{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
      color:var(--muted);
      font-size:.85rem;
    }

    .credit strong{
      color:#fff;
    }

    .section{
      margin-top:28px;
      padding:22px;
      background:rgba(10,12,18,.9);
      border:1px solid rgba(255,255,255,.07);
      border-radius:24px;
    }

    .section-title{
      font-size:1rem;
      font-weight:900;
      margin-bottom:15px;
    }

    .trailer-box{
      position:relative;
      aspect-ratio:16/9;
      overflow:hidden;
      background:#000;
      border-radius:18px;
      border:1px solid var(--line);
    }

    .trailer-box iframe{
      width:100%;
      height:100%;
      border:0;
    }

    .no-video{
      min-height:250px;
      display:grid;
      place-items:center;
      text-align:center;
      padding:30px;
      background:var(--panel2);
      border-radius:18px;
      color:var(--muted);
    }

    .no-video-icon{
      font-size:2rem;
      margin-bottom:8px;
    }

    .cast-grid{
      display:grid;
      grid-template-columns:
        repeat(
          auto-fill,
          minmax(180px,1fr)
        );
      gap:12px;
    }

    .cast-card{
      display:flex;
      gap:10px;
      align-items:center;
      padding:10px;
      border-radius:15px;
      background:var(--panel2);
      border:1px solid var(--line);
    }

    .cast-card img,
    .cast-placeholder{
      width:48px;
      height:60px;
      object-fit:cover;
      border-radius:10px;
      background:#1a1f29;
      display:grid;
      place-items:center;
      color:var(--muted);
      flex:none;
    }

    .cast-card strong{
      display:block;
      font-size:.78rem;
    }

    .cast-card span{
      display:block;
      color:var(--muted);
      font-size:.7rem;
      margin-top:2px;
    }

    .muted{
      color:var(--muted);
    }

    footer{
      margin-top:35px;
      padding:25px 0 15px;
      border-top:1px solid var(--line);
      color:var(--muted);
      text-align:center;
      font-size:.75rem;
    }

    footer a{
      color:#cbd5e1;
      text-decoration:none;
    }

    footer a:hover{
      color:var(--accent2);
    }

    @media(max-width:760px){
      .container{
        padding:14px;
      }

      .movie-box{
        grid-template-columns:1fr;
        padding:18px;
        gap:22px;
      }

      .poster{
        width:min(220px,100%);
        margin:auto;
      }

      h1{
        font-size:2.2rem;
      }

      .section{
        padding:16px;
      }

      .cast-grid{
        grid-template-columns:
          repeat(2,minmax(0,1fr));
      }
    }

    @media(max-width:420px){
      .cast-grid{
        grid-template-columns:1fr;
      }
    }
  </style>
</head>

<body>

  <div class="backdrop"></div>

  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/">
        U-TV<span>.REVIEW</span>
      </a>

      <a class="home-btn" href="/">
        ← Home
      </a>
    </div>
  </header>

  <main class="container">

    <article class="movie-box">

      <div>
        ${
          poster
            ? `
              <img
                class="poster"
                src="${escapeAttribute(
                  poster
                )}"
                alt="${escapeAttribute(
                  `${title} poster`
                )}"
                width="780"
                height="1170"
                fetchpriority="high"
              >
            `
            : `
              <div class="poster-placeholder">
                No Poster
              </div>
            `
        }
      </div>

      <div>

        <div class="eyebrow">
          ${escapeHtml(mediaLabel)}
        </div>

        <h1>
          ${escapeHtml(title)}
          ${
            year
              ? ` <span style="color:#64748b">(${escapeHtml(
                  year
                )})</span>`
              : ''
          }
        </h1>

        ${
          tagline
            ? `
              <p class="tagline">
                "${escapeHtml(tagline)}"
              </p>
            `
            : ''
        }

        <div class="meta">

          <span class="pill rating">
            ★ ${escapeHtml(rating)}/10
          </span>

          <span class="pill">
            ${escapeHtml(
              formatNumber(
                voteCount
              )
            )} votes
          </span>

          <span class="pill">
            ${escapeHtml(
              releaseDate
            )}
          </span>

          <span class="pill">
            ${escapeHtml(
              runtime
            )}
          </span>

          <span class="pill">
            ${escapeHtml(
              genres
            )}
          </span>

        </div>

        <p class="overview">
          ${escapeHtml(
            overview
          )}
        </p>

        ${
          director
            ? `
              <div class="credit">
                <strong>
                  ${
                    type === 'movie'
                      ? 'Director'
                      : 'Creator'
                  }:
                </strong>
                <span>
                  ${escapeHtml(
                    director
                  )}
                </span>
              </div>
            `
            : ''
        }

      </div>

    </article>

    <section class="section">

      <h2 class="section-title">
        Official Trailer
      </h2>

      ${renderServerIndependentPlayer(
        details,
        title
      )}

    </section>

    <section class="section">

      <h2 class="section-title">
        Star Cast
      </h2>

      <div class="cast-grid">
        ${castHtml}
      </div>

    </section>

    <footer>

      <p>
        © ${new Date().getFullYear()}
        U-TV REVIEW
      </p>

      <p style="margin-top:8px">
        Data and imagery provided by
        TMDB. This site is not endorsed
        or certified by TMDB.
      </p>

      <p style="margin-top:10px">
        <a href="/">Home</a>
        &nbsp;·&nbsp;
        <a href="/about/">About</a>
        &nbsp;·&nbsp;
        <a href="/dmca/">DMCA</a>
        &nbsp;·&nbsp;
        <a href="/contact/">Contact</a>
        &nbsp;·&nbsp;
        <a href="/privacy/">Privacy</a>
        &nbsp;·&nbsp;
        <a href="/terms/">Terms</a>
      </p>

    </footer>

  </main>

</body>
</html>`;
}

function renderStaticPage(
  title,
  desc,
  slug
) {
  const pageUrl =
    `${CONFIG.SITE_URL}/${slug}/`;

  const pageContent = {
    about: `
      <h2>About U-TV REVIEW</h2>
      <p>
        U-TV REVIEW is a movie and TV discovery
        website designed to make entertainment
        information easier to explore.
      </p>
    `,

    dmca: `
      <h2>DMCA Policy</h2>
      <p>
        If you believe material displayed on this
        website infringes your copyright, please
        contact the website operator with sufficient
        information to identify the material and
        the claimed rights.
      </p>
    `,

    disclaimer: `
      <h2>Disclaimer</h2>
      <p>
        Information displayed on U-TV REVIEW may
        originate from third-party data services.
        Availability, ratings, descriptions and
        other metadata can change without notice.
      </p>
    `,

    contact: `
      <h2>Contact</h2>
      <p>
        For corrections, questions or support,
        please use the contact address published
        on the website.
      </p>
      <p>
        <a href="mailto:help.wowmovies@gmail.com">
          help.wowmovies@gmail.com
        </a>
      </p>
    `,

    privacy: `
      <h2>Privacy Policy</h2>
      <p>
        This static website does not require an
        account for basic browsing. Third-party
        services may have their own privacy policies
        when you interact with their content.
      </p>
    `,

    terms: `
      <h2>Terms of Use</h2>
      <p>
        By using this website, you agree to use it
        responsibly and comply with applicable laws.
      </p>
    `
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>

<title>
  ${escapeHtml(title)} | U-TV REVIEW
</title>

<meta
  name="description"
  content="${escapeAttribute(desc)}"
>

<meta
  name="robots"
  content="index,follow"
>

<link
  rel="canonical"
  href="${escapeAttribute(
    pageUrl
  )}"
>

<style>

:root{
  --bg:#050609;
  --panel:#0d1017;
  --line:#202631;
  --text:#f8fafc;
  --muted:#94a3b8;
  --accent:#ea4c23;
}

*{
  box-sizing:border-box;
}

body{
  margin:0;
  min-height:100vh;
  background:
    radial-gradient(
      circle at top,
      #151923,
      var(--bg) 55%
    );
  color:var(--text);
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  line-height:1.7;
}

.wrapper{
  width:min(850px,100%);
  margin:auto;
  padding:25px 18px;
}

.card{
  margin-top:30px;
  padding:30px;
  border-radius:25px;
  border:1px solid var(--line);
  background:rgba(13,16,23,.9);
}

h1{
  line-height:1.1;
  font-size:clamp(2rem,5vw,3.5rem);
}

h2{
  color:#fff;
  margin-top:28px;
}

p{
  color:#cbd5e1;
}

a{
  color:#ff7043;
}

.back{
  display:inline-block;
  padding:9px 15px;
  border-radius:999px;
  border:1px solid var(--line);
  text-decoration:none;
  color:#fff;
}

</style>

</head>

<body>

<div class="wrapper">

  <a class="back" href="/">
    ← Back to Home
  </a>

  <main class="card">

    <h1>
      ${escapeHtml(title)}
    </h1>

    <p>
      ${escapeHtml(desc)}
    </p>

    ${
      pageContent[slug] ||
      '<p>Information coming soon.</p>'
    }

  </main>

</div>

</body>
</html>`;
}

function renderHomePage(
  movies,
  tvShows
) {
  function renderCard(
    item,
    type
  ) {
    const title =
      getTitle(item);

    const poster =
      imageUrl(
        item.poster_path,
        'w342'
      );

    const year =
      getYear(item);

    return `
      <a
        class="movie-card"
        href="/${type}/${item.id}/"
        aria-label="${escapeAttribute(
          title
        )}"
      >

        <div class="poster-wrap">

          ${
            poster
              ? `
                <img
                  src="${escapeAttribute(
                    poster
                  )}"
                  alt="${escapeAttribute(
                    title
                  )}"
                  loading="lazy"
                  width="342"
                  height="513"
                >
              `
              : `
                <div class="no-poster">
                  No Poster
                </div>
              `
          }

          <span class="rating">
            ★ ${escapeHtml(
              formatRating(
                item.vote_average
              )
            )}
          </span>

        </div>

        <div class="card-content">

          <strong>
            ${escapeHtml(title)}
          </strong>

          <span>
            ${escapeHtml(
              year || '—'
            )}
            ·
            ${type === 'movie'
              ? 'Movie'
              : 'TV'}
          </span>

        </div>

      </a>
    `;
  }

  const movieCards =
    movies
      .map(item =>
        renderCard(
          item,
          'movie'
        )
      )
      .join('');

  const tvCards =
    tvShows
      .map(item =>
        renderCard(
          item,
          'tv'
        )
      )
      .join('');

  return `<!doctype html>
<html lang="en">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>
  U-TV REVIEW | Movies & TV Discovery
</title>

<meta
  name="description"
  content="Discover popular movies and TV series with ratings, release dates, trailers, cast information and detailed pages."
>

<meta
  name="robots"
  content="index,follow,max-image-preview:large"
>

<link
  rel="canonical"
  href="${escapeAttribute(
    CONFIG.SITE_URL
  )}/"
>

<meta
  property="og:title"
  content="U-TV REVIEW | Movies & TV Discovery"
>

<meta
  property="og:description"
  content="Explore popular movies and TV series."
>

<meta
  property="og:type"
  content="website"
>

<meta
  property="og:url"
  content="${escapeAttribute(
    CONFIG.SITE_URL
  )}/"
>

<style>

:root{
  --bg:#050609;
  --panel:#0c0f15;
  --panel2:#11151e;
  --line:#202631;
  --text:#f8fafc;
  --muted:#94a3b8;
  --accent:#ea4c23;
  --gold:#f5b942;
}

*{
  box-sizing:border-box;
}

html{
  scroll-behavior:smooth;
}

body{
  margin:0;
  background:
    radial-gradient(
      circle at top,
      #151923 0,
      var(--bg) 45%,
      #020305 100%
    );
  color:var(--text);
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

a{
  color:inherit;
}

.container{
  width:min(1550px,100%);
  margin:auto;
  padding:18px;
}

header{
  position:sticky;
  top:0;
  z-index:50;
  background:rgba(5,6,9,.82);
  backdrop-filter:blur(18px);
  border-bottom:1px solid rgba(255,255,255,.06);
}

.header-inner{
  width:min(1550px,100%);
  margin:auto;
  padding:14px 18px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:15px;
}

.brand{
  font-size:1.25rem;
  font-weight:950;
  text-decoration:none;
  letter-spacing:-.04em;
}

.brand span{
  color:var(--accent);
}

.live{
  border:1px solid #7f1d1d;
  background:#3b0a0a;
  color:#fca5a5;
  padding:5px 10px;
  border-radius:999px;
  font-size:.65rem;
  font-weight:900;
  letter-spacing:.1em;
}

.hero{
  margin-top:20px;
  padding:
    clamp(25px,5vw,55px);
  border:1px solid var(--line);
  border-radius:28px;
  background:
    radial-gradient(
      circle at top right,
      rgba(234,76,35,.16),
      transparent 40%
    ),
    var(--panel);
}

.hero h1{
  margin:0 0 10px;
  font-size:
    clamp(
      2.2rem,
      6vw,
      5rem
    );
  line-height:.98;
  letter-spacing:-.06em;
}

.hero p{
  max-width:850px;
  color:#cbd5e1;
  line-height:1.7;
}

.section{
  margin-top:35px;
}

.section-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-bottom:15px;
}

.section-title{
  font-size:1.15rem;
  border-left:4px solid var(--accent);
  padding-left:11px;
  font-weight:900;
}

.movie-grid{
  display:grid;
  grid-template-columns:
    repeat(
      2,
      minmax(0,1fr)
    );
  gap:10px;
}

.movie-card{
  display:block;
  text-decoration:none;
  background:var(--panel);
  border:1px solid rgba(255,255,255,.05);
  border-radius:16px;
  overflow:hidden;
  transition:
    transform .25s ease,
    border-color .25s ease,
    box-shadow .25s ease;
}

.movie-card:hover{
  transform:
    translateY(-5px);
  border-color:
    rgba(234,76,35,.6);
  box-shadow:
    0 18px 40px
    rgba(0,0,0,.3);
}

.poster-wrap{
  position:relative;
  aspect-ratio:2/3;
  background:#11151e;
}

.poster-wrap img{
  display:block;
  width:100%;
  height:100%;
  object-fit:cover;
}

.no-poster{
  height:100%;
  display:grid;
  place-items:center;
  color:var(--muted);
  font-size:.75rem;
}

.rating{
  position:absolute;
  top:8px;
  left:8px;
  background:rgba(5,6,9,.88);
  color:var(--gold);
  border:1px solid rgba(255,255,255,.08);
  padding:4px 7px;
  border-radius:8px;
  font-size:.68rem;
  font-weight:900;
  backdrop-filter:blur(8px);
}

.card-content{
  padding:10px;
}

.card-content strong{
  display:block;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  font-size:.78rem;
}

.card-content span{
  display:block;
  margin-top:4px;
  color:var(--muted);
  font-size:.68rem;
}

.page-grid{
  display:grid;
  grid-template-columns:
    repeat(
      auto-fit,
      minmax(170px,1fr)
    );
  gap:10px;
}

.page-link{
  text-decoration:none;
  padding:16px;
  border-radius:16px;
  border:1px solid var(--line);
  background:var(--panel);
  transition:.2s;
}

.page-link:hover{
  border-color:var(--accent);
  transform:translateY(-2px);
}

.page-link strong{
  display:block;
  margin-bottom:5px;
}

.page-link span{
  color:var(--muted);
  font-size:.75rem;
  line-height:1.5;
}

footer{
  margin-top:40px;
  padding:30px 0;
  text-align:center;
  border-top:1px solid var(--line);
  color:var(--muted);
  font-size:.75rem;
}

footer a{
  text-decoration:none;
  color:#cbd5e1;
}

@media(min-width:520px){
  .movie-grid{
    grid-template-columns:
      repeat(3,minmax(0,1fr));
  }
}

@media(min-width:760px){
  .movie-grid{
    grid-template-columns:
      repeat(5,minmax(0,1fr));
  }
}

@media(min-width:1100px){
  .movie-grid{
    grid-template-columns:
      repeat(7,minmax(0,1fr));
  }
}

</style>

</head>

<body>

<header>

  <div class="header-inner">

    <a
      class="brand"
      href="/"
    >
      U-TV<span>.REVIEW</span>
    </a>

    <div class="live">
      LIVE
    </div>

  </div>

</header>

<main class="container">

  <section class="hero">

    <h1>
      U-TV REVIEW
    </h1>

    <p>
      Discover popular movies and TV series,
      explore ratings, release dates, trailers,
      cast information and detailed entertainment
      pages.
    </p>

  </section>

  <section class="section">

    <div class="section-head">
      <h2 class="section-title">
        Popular Movies
      </h2>
    </div>

    <div class="movie-grid">
      ${movieCards}
    </div>

  </section>

  <section class="section">

    <div class="section-head">
      <h2 class="section-title">
        Popular TV Series
      </h2>
    </div>

    <div class="movie-grid">
      ${tvCards}
    </div>

  </section>

  <section class="section">

    <div class="section-head">
      <h2 class="section-title">
        Information
      </h2>
    </div>

    <div class="page-grid">

      ${STATIC_PAGES.map(
        page => `
          <a
            class="page-link"
            href="/${page.slug}/"
          >
            <strong>
              ${escapeHtml(
                page.title
              )}
            </strong>

            <span>
              ${escapeHtml(
                page.desc
              )}
            </span>
          </a>
        `
      ).join('')}

    </div>

  </section>

</main>

<footer>

  <p>
    © ${new Date().getFullYear()}
    U-TV REVIEW
  </p>

  <p>
    Data and imagery provided by TMDB.
    This site is not endorsed or certified by TMDB.
  </p>

  <p>
    <a href="/about/">About</a>
    ·
    <a href="/dmca/">DMCA</a>
    ·
    <a href="/contact/">Contact</a>
    ·
    <a href="/privacy/">Privacy</a>
    ·
    <a href="/terms/">Terms</a>
  </p>

</footer>

</body>
</html>`;
}

function buildSitemap(
  urls
) {
  const now =
    new Date()
      .toISOString()
      .split('T')[0];

  const uniqueUrls =
    [
      ...new Set(
        urls.filter(Boolean)
      )
    ].slice(
      0,
      CONFIG.MAX_SITEMAP_URLS
    );

  const items =
    uniqueUrls.map(url => `
      <url>
        <loc>${escapeHtml(
          url
        )}</loc>
        <lastmod>${now}</lastmod>
      </url>
    `).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>
${items}
</urlset>`;
}

function writeRobots() {
  writeFileSafe(
    path.join(
      CONFIG.OUTPUT_DIR,
      'robots.txt'
    ),
`User-agent: *
Allow: /

Sitemap: ${CONFIG.SITE_URL}/sitemap.xml
`
  );
}

function writeCloudflareFiles() {
  writeFileSafe(
    path.join(
      CONFIG.OUTPUT_DIR,
      '_headers'
    ),
`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Cross-Origin-Opener-Policy: same-origin-allow-popups

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/movie/*
  Cache-Control: public, max-age=3600, must-revalidate

/tv/*
  Cache-Control: public, max-age=3600, must-revalidate

/index.html
  Cache-Control: public, max-age=300, must-revalidate
`
  );

  writeFileSafe(
    path.join(
      CONFIG.OUTPUT_DIR,
      '_redirects'
    ),
`/about /about/ 301
/dmca /dmca/ 301
/disclaimer /disclaimer/ 301
/contact /contact/ 301
/privacy /privacy/ 301
/terms /terms/ 301
`
  );
}

function write404() {
  writeFileSafe(
    path.join(
      CONFIG.OUTPUT_DIR,
      '404.html'
    ),
`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>404 | U-TV REVIEW</title>
<style>
*{box-sizing:border-box}
body{
margin:0;
min-height:100vh;
display:grid;
place-items:center;
padding:20px;
background:#050609;
color:#f8fafc;
font-family:system-ui,sans-serif
}
.box{
width:min(600px,100%);
padding:35px;
border-radius:25px;
border:1px solid #202631;
background:#0c0f15;
text-align:center
}
h1{
font-size:clamp(2.5rem,8vw,5rem);
margin:0
}
p{
color:#94a3b8;
line-height:1.7
}
a{
display:inline-block;
margin-top:10px;
padding:10px 18px;
border-radius:999px;
background:#ea4c23;
color:#fff;
text-decoration:none;
font-weight:800
}
</style>
</head>
<body>
<div class="box">
<h1>404</h1>
<h2>Page Not Found</h2>
<p>
The page you requested could not be found.
</p>
<a href="/">Go Home</a>
</div>
</body>
</html>`
  );
}

async function generateStaticPages(
  sitemapUrls
) {
  for (const page of STATIC_PAGES) {
    const dir =
      path.join(
        CONFIG.OUTPUT_DIR,
        page.slug
      );

    writeFileSafe(
      path.join(
        dir,
        'index.html'
      ),
      renderStaticPage(
        page.title,
        page.desc,
        page.slug
      )
    );

    sitemapUrls.push(
      `${CONFIG.SITE_URL}/${page.slug}/`
    );
  }
}

async function generateContentPages(
  items,
  type,
  sitemapUrls
) {
  let generated = 0;

  for (const item of items) {
    const title =
      getTitle(item);

    console.log(
      `  Generating ${type}: ${title} [${item.id}]`
    );

    try {
      const details =
        await getDetails(
          type,
          item.id
        );

      const dir =
        path.join(
          CONFIG.OUTPUT_DIR,
          type,
          String(item.id)
        );

      writeFileSafe(
        path.join(
          dir,
          'index.html'
        ),
        buildMovieHtml(
          item,
          details,
          type
        )
      );

      sitemapUrls.push(
        `${CONFIG.SITE_URL}/${type}/${item.id}/`
      );

      generated++;

      await sleep(
        CONFIG.REQUEST_DELAY_MS
      );
    } catch (error) {
      console.warn(
        `  Skipped ${type}/${item.id}: ${error.message}`
      );
    }
  }

  return generated;
}

function printSummary({
  movies,
  tvShows,
  generatedMovies,
  generatedTv,
  sitemapCount
}) {
  console.log('');
  console.log(
    '=========================================='
  );
  console.log(
    ' U-TV REVIEW GENERATOR COMPLETE'
  );
  console.log(
    '=========================================='
  );
  console.log(
    `Movie discovery items : ${movies.length}`
  );
  console.log(
    `TV discovery items    : ${tvShows.length}`
  );
  console.log(
    `Movie pages generated : ${generatedMovies}`
  );
  console.log(
    `TV pages generated    : ${generatedTv}`
  );
  console.log(
    `Sitemap URLs           : ${sitemapCount}`
  );
  console.log(
    `Output                 : ${CONFIG.OUTPUT_DIR}`
  );
  console.log(
    `Site                   : ${CONFIG.SITE_URL}`
  );
  console.log(
    '=========================================='
  );
}

async function main() {
  console.log('');
  console.log(
    'U-TV REVIEW — Advanced Generator'
  );
  console.log(
    'Node.js:',
    process.version
  );
  console.log('');

  if (!TMDB_API_KEYS.length) {
    console.error(
      'ERROR: TMDB API key missing.'
    );

    console.error(
      'Set TMDB_API_KEY_1 before running.'
    );

    process.exitCode = 1;
    return;
  }

  removeOutputDirectory();

  const sitemapUrls = [
    `${CONFIG.SITE_URL}/`
  ];

  console.log(
    '1. Fetching popular movies...'
  );

  const movies =
    await getDiscovery(
      'movie',
      CONFIG.MAX_MOVIE_PAGES
    );

  console.log(
    `   Found ${movies.length} movies.`
  );

  console.log('');

  console.log(
    '2. Fetching popular TV series...'
  );

  const tvShows =
    await getDiscovery(
      'tv',
      CONFIG.MAX_TV_PAGES
    );

  console.log(
    `   Found ${tvShows.length} TV series.`
  );

  console.log('');

  console.log(
    '3. Generating static information pages...'
  );

  await generateStaticPages(
    sitemapUrls
  );

  console.log('');

  console.log(
    '4. Generating movie pages...'
  );

  const generatedMovies =
    await generateContentPages(
      movies,
      'movie',
      sitemapUrls
    );

  console.log('');

  console.log(
    '5. Generating TV pages...'
  );

  const generatedTv =
    await generateContentPages(
      tvShows,
      'tv',
      sitemapUrls
    );

  console.log('');

  console.log(
    '6. Generating homepage...'
  );

  writeFileSafe(
    path.join(
      CONFIG.OUTPUT_DIR,
      'index.html'
    ),
    renderHomePage(
      movies,
      tvShows
    )
  );

  console.log(
    '7. Generating sitemap...'
  );

  writeFileSafe(
    path.join(
      CONFIG.OUTPUT_DIR,
      'sitemap.xml'
    ),
    buildSitemap(
      sitemapUrls
    )
  );

  console.log(
    '8. Generating robots.txt...'
  );

  writeRobots();

  console.log(
    '9. Generating Cloudflare headers/redirects...'
  );

  writeCloudflareFiles();

  console.log(
    '10. Generating 404 page...'
  );

  write404();

  printSummary({
    movies,
    tvShows,
    generatedMovies,
    generatedTv,
    sitemapCount:
      new Set(
        sitemapUrls
      ).size
  });
}

main().catch(error => {
  console.error('');
  console.error(
    'GENERATION FAILED'
  );
  console.error(
    error?.stack ||
    error?.message ||
    error
  );

  process.exitCode = 1;
});