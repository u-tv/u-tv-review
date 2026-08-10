Bilkul — नीचे पूरी तरह fixed, advanced, Cloudflare Pages Advanced Mode + GitHub friendly _worker.js raw code hai. TMDB key hard-code नहीं की गई है; TMDB_API_KEY Cloudflare Secret/Environment Variable से आएगी।

'use strict';

/*
===========================================================
 U-TV REVIEW
 Cloudflare Pages Advanced Mode Worker
===========================================================

 FEATURES
-----------------------------------------------------------
✓ Cloudflare Pages ASSETS integration
✓ Dynamic TMDB API proxy
✓ TMDB movie / TV / trending endpoints
✓ Dynamic sitemap.xml
✓ Static sitemap fallback
✓ Cloudflare Cache API
✓ Request timeout
✓ API validation
✓ CORS
✓ OPTIONS / HEAD support
✓ Security headers
✓ JSON error handling
✓ Graceful TMDB failure fallback
✓ Health endpoint
✓ Search endpoint
✓ Movie details endpoint
✓ TV details endpoint
✓ Discover endpoints
✓ Trending endpoint
✓ Popular endpoints
✓ Upcoming movies
✓ Top-rated movies
✓ Airing / popular TV
✓ TMDB key hidden from browser
✓ No Node.js dependencies
✓ GitHub deploy friendly
✓ Cloudflare Pages deploy friendly

REQUIRED CLOUDFLARE VARIABLE
-----------------------------------------------------------
TMDB_API_KEY

OPTIONAL
-----------------------------------------------------------
SITE_URL
===========================================================
*/

const CONFIG = Object.freeze({
  SITE_URL: 'https://u-tv-review.pages.dev',

  TMDB_BASE_URL: 'https://api.themoviedb.org/3',

  TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p',

  REQUEST_TIMEOUT: 10000,

  CACHE_TTL: 3600,

  API_CACHE_TTL: 300,

  MAX_PAGE: 500,

  MAX_SEARCH_PAGE: 20,

  MAX_SITEMAP_URLS: 5000,

  MAX_SITEMAP_TMDB_PAGES: 5,

  MAX_SITEMAP_ITEMS_PER_TYPE: 100,

  MAX_QUERY_LENGTH: 100,

  ALLOWED_METHODS: [
    'GET',
    'HEAD',
    'OPTIONS'
  ],

  ALLOWED_TYPES: [
    'movie',
    'tv'
  ],

  STATIC_ROUTES: [
    '/',
    '/about/',
    '/dmca/',
    '/disclaimer/',
    '/contact/',
    '/privacy/',
    '/terms/'
  ]
});


/* =========================================================
   ENVIRONMENT
========================================================= */

function getSiteUrl(env) {
  const configured =
    env &&
    typeof env.SITE_URL === 'string'
      ? env.SITE_URL.trim()
      : '';

  if (!configured) {
    return CONFIG.SITE_URL;
  }

  return configured.replace(/\/+$/, '');
}


function getTmdbKey(env) {
  return env &&
    typeof env.TMDB_API_KEY === 'string'
    ? env.TMDB_API_KEY.trim()
    : '';
}


/* =========================================================
   RESPONSE HELPERS
========================================================= */

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',

    'X-Frame-Options': 'SAMEORIGIN',

    'Referrer-Policy':
      'strict-origin-when-cross-origin',

    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=()',

    'Cross-Origin-Opener-Policy':
      'same-origin-allow-popups'
  };
}


function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',

    'Access-Control-Allow-Methods':
      'GET, HEAD, OPTIONS',

    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, Accept',

    'Access-Control-Max-Age':
      '86400'
  };
}


function jsonResponse(
  data,
  status = 200,
  extraHeaders = {}
) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,

      headers: {
        'Content-Type':
          'application/json; charset=UTF-8',

        'Cache-Control':
          `public, max-age=${CONFIG.API_CACHE_TTL}`,

        ...securityHeaders(),

        ...corsHeaders(),

        ...extraHeaders
      }
    }
  );
}


function xmlResponse(
  body,
  status = 200,
  extraHeaders = {}
) {
  return new Response(
    body,
    {
      status,

      headers: {
        'Content-Type':
          'application/xml; charset=UTF-8',

        'Cache-Control':
          `public, max-age=${CONFIG.CACHE_TTL}`,

        ...securityHeaders(),

        ...extraHeaders
      }
    }
  );
}


function textResponse(
  body,
  status = 200,
  extraHeaders = {}
) {
  return new Response(
    body,
    {
      status,

      headers: {
        'Content-Type':
          'text/plain; charset=UTF-8',

        ...securityHeaders(),

        ...extraHeaders
      }
    }
  );
}


function headResponse(response) {
  return new Response(null, {
    status: response.status,

    headers: response.headers
  });
}


/* =========================================================
   VALIDATION
========================================================= */

function parsePositiveInt(
  value,
  fallback = 1,
  maximum = CONFIG.MAX_PAGE
) {
  const parsed =
    Number.parseInt(
      String(value ?? ''),
      10
    );

  if (
    !Number.isFinite(parsed) ||
    parsed < 1
  ) {
    return fallback;
  }

  return Math.min(
    parsed,
    maximum
  );
}


function validId(value) {
  const id =
    Number.parseInt(
      String(value ?? ''),
      10
    );

  if (
    !Number.isFinite(id) ||
    id <= 0 ||
    id > 999999999
  ) {
    return null;
  }

  return id;
}


function validType(type) {
  return CONFIG.ALLOWED_TYPES.includes(
    type
  );
}


function cleanQuery(query) {
  return String(
    query ?? ''
  )
    .trim()
    .replace(/\s+/g, ' ')
    .slice(
      0,
      CONFIG.MAX_QUERY_LENGTH
    );
}


/* =========================================================
   XML ESCAPE
========================================================= */

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}


/* =========================================================
   URL HELPERS
========================================================= */

function absoluteUrl(
  pathname,
  env
) {
  return new URL(
    pathname,
    getSiteUrl(env)
  ).toString();
}


/* =========================================================
   TIMEOUT FETCH
========================================================= */

async function fetchWithTimeout(
  url,
  options = {},
  timeout = CONFIG.REQUEST_TIMEOUT
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeout
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal
      }
    );
  } finally {
    clearTimeout(timer);
  }
}


/* =========================================================
   CLOUDFLARE CACHE HELPERS
========================================================= */

function createCacheRequest(
  url
) {
  return new Request(
    url,
    {
      method: 'GET'
    }
  );
}


async function getCache(
  url
) {
  try {
    const cache =
      caches.default;

    return await cache.match(
      createCacheRequest(url)
    );
  } catch {
    return null;
  }
}


async function putCache(
  url,
  response,
  ctx
) {
  try {
    const cache =
      caches.default;

    if (ctx?.waitUntil) {
      ctx.waitUntil(
        cache.put(
          createCacheRequest(url),
          response.clone()
        )
      );
    } else {
      await cache.put(
        createCacheRequest(url),
        response.clone()
      );
    }
  } catch {
    // Cache failure must never break request.
  }
}


/* =========================================================
   TMDB CORE REQUEST
========================================================= */

async function tmdbRequest(
  endpoint,
  params,
  env,
  ctx,
  cacheTtl = CONFIG.CACHE_TTL
) {
  const apiKey =
    getTmdbKey(env);

  if (!apiKey) {
    throw new Error(
      'TMDB_API_KEY is not configured'
    );
  }

  const tmdbUrl =
    new URL(
      `${CONFIG.TMDB_BASE_URL}${endpoint}`
    );

  tmdbUrl.searchParams.set(
    'api_key',
    apiKey
  );

  tmdbUrl.searchParams.set(
    'language',
    'en-US'
  );

  for (
    const [
      key,
      value
    ] of Object.entries(
      params || {}
    )
  ) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      tmdbUrl.searchParams.set(
        key,
        String(value)
      );
    }
  }

  const requestUrl =
    tmdbUrl.toString();

  const cached =
    await getCache(
      requestUrl
    );

  if (cached) {
    try {
      return await cached.json();
    } catch {
      // Ignore broken cache.
    }
  }

  let response;

  try {
    response =
      await fetchWithTimeout(
        requestUrl,
        {
          method: 'GET',

          headers: {
            Accept:
              'application/json',

            'User-Agent':
              'U-TV-REVIEW-Cloudflare-Worker'
          }
        }
      );
  } catch (error) {
    throw new Error(
      error?.name === 'AbortError'
        ? 'TMDB request timeout'
        : `TMDB network error: ${error.message}`
    );
  }

  if (
    response.status === 401
  ) {
    throw new Error(
      'TMDB API key is invalid'
    );
  }

  if (
    response.status === 404
  ) {
    throw new Error(
      'TMDB resource not found'
    );
  }

  if (
    response.status === 429
  ) {
    throw new Error(
      'TMDB rate limit reached'
    );
  }

  if (!response.ok) {
    throw new Error(
      `TMDB HTTP ${response.status}`
    );
  }

  let data;

  try {
    data =
      await response.json();
  } catch {
    throw new Error(
      'TMDB returned invalid JSON'
    );
  }

  const cacheResponse =
    new Response(
      JSON.stringify(data),
      {
        headers: {
          'Content-Type':
            'application/json; charset=UTF-8',

          'Cache-Control':
            `public, max-age=${cacheTtl}`,

          ...securityHeaders()
        }
      }
    );

  await putCache(
    requestUrl,
    cacheResponse,
    ctx
  );

  return data;
}


/* =========================================================
   TMDB ENDPOINTS
========================================================= */

async function getTrending(
  env,
  ctx
) {
  return tmdbRequest(
    '/trending/all/week',
    {},
    env,
    ctx
  );
}


async function getPopularMovies(
  page,
  env,
  ctx
) {
  return tmdbRequest(
    '/movie/popular',
    {
      page
    },
    env,
    ctx
  );
}


async function getPopularTv(
  page,
  env,
  ctx
) {
  return tmdbRequest(
    '/tv/popular',
    {
      page
    },
    env,
    ctx
  );
}


async function getTopRatedMovies(
  page,
  env,
  ctx
) {
  return tmdbRequest(
    '/movie/top_rated',
    {
      page
    },
    env,
    ctx
  );
}


async function getUpcomingMovies(
  page,
  env,
  ctx
) {
  return tmdbRequest(
    '/movie/upcoming',
    {
      page
    },
    env,
    ctx
  );
}


async function getNowPlayingMovies(
  page,
  env,
  ctx
) {
  return tmdbRequest(
    '/movie/now_playing',
    {
      page
    },
    env,
    ctx
  );
}


async function getAiringToday(
  page,
  env,
  ctx
) {
  return tmdbRequest(
    '/tv/airing_today',
    {
      page
    },
    env,
    ctx
  );
}


async function getOnTheAir(
  page,
  env,
  ctx
) {
  return tmdbRequest(
    '/tv/on_the_air',
    {
      page
    },
    env,
    ctx
  );
}


async function getTopRatedTv(
  page,
  env,
  ctx
) {
  return tmdbRequest(
    '/tv/top_rated',
    {
      page
    },
    env,
    ctx
  );
}


async function searchMulti(
  query,
  page,
  env,
  ctx
) {
  return tmdbRequest(
    '/search/multi',
    {
      query,
      page,
      include_adult: false
    },
    env,
    ctx,
    CONFIG.API_CACHE_TTL
  );
}


async function searchMovies(
  query,
  page,
  env,
  ctx
) {
  return tmdbRequest(
    '/search/movie',
    {
      query,
      page,
      include_adult: false
    },
    env,
    ctx,
    CONFIG.API_CACHE_TTL
  );
}


async function searchTv(
  query,
  page,
  env,
  ctx
) {
  return tmdbRequest(
    '/search/tv',
    {
      query,
      page,
      include_adult: false
    },
    env,
    ctx,
    CONFIG.API_CACHE_TTL
  );
}


async function discoverMovies(
  page,
  env,
  ctx,
  extra = {}
) {
  return tmdbRequest(
    '/discover/movie',
    {
      page,
      include_adult: false,
      include_video: false,
      sort_by:
        'popularity.desc',
      ...extra
    },
    env,
    ctx
  );
}


async function discoverTv(
  page,
  env,
  ctx,
  extra = {}
) {
  return tmdbRequest(
    '/discover/tv',
    {
      page,
      include_adult: false,
      sort_by:
        'popularity.desc',
      ...extra
    },
    env,
    ctx
  );
}


async function getMovieDetails(
  id,
  env,
  ctx
) {
  return tmdbRequest(
    `/movie/${id}`,
    {
      append_to_response:
        'credits,videos,images,similar,recommendations'
    },
    env,
    ctx
  );
}


async function getTvDetails(
  id,
  env,
  ctx
) {
  return tmdbRequest(
    `/tv/${id}`,
    {
      append_to_response:
        'credits,videos,images,similar,recommendations'
    },
    env,
    ctx
  );
}


/* =========================================================
   API ROUTE — MOVIES
========================================================= */

async function moviesApi(
  request,
  env,
  ctx
) {
  const url =
    new URL(request.url);

  const category =
    (
      url.searchParams.get(
        'cat'
      ) ||
      'movie'
    )
      .trim()
      .toLowerCase();

  const page =
    parsePositiveInt(
      url.searchParams.get(
        'page'
      ),
      1,
      CONFIG.MAX_PAGE
    );

  try {
    let data;

    switch (category) {
      case 'movie':
      case 'popular':
        data =
          await getPopularMovies(
            page,
            env,
            ctx
          );
        break;

      case 'tv':
        data =
          await getPopularTv(
            page,
            env,
            ctx
          );
        break;

      case 'trending':
        data =
          await getTrending(
            env,
            ctx
          );
        break;

      case 'top-rated':
      case 'top_rated':
        data =
          await getTopRatedMovies(
            page,
            env,
            ctx
          );
        break;

      case 'upcoming':
        data =
          await getUpcomingMovies(
            page,
            env,
            ctx
          );
        break;

      case 'now-playing':
      case 'now_playing':
        data =
          await getNowPlayingMovies(
            page,
            env,
            ctx
          );
        break;

      case 'airing-today':
      case 'airing_today':
        data =
          await getAiringToday(
            page,
            env,
            ctx
          );
        break;

      case 'on-the-air':
      case 'on_the_air':
        data =
          await getOnTheAir(
            page,
            env,
            ctx
          );
        break;

      case 'tv-top-rated':
        data =
          await getTopRatedTv(
            page,
            env,
            ctx
          );
        break;

      default:
        return jsonResponse(
          {
            success: false,

            error:
              'Invalid category',

            allowed: [
              'movie',
              'tv',
              'trending',
              'top-rated',
              'upcoming',
              'now-playing',
              'airing-today',
              'on-the-air',
              'tv-top-rated'
            ]
          },
          400
        );
    }

    return jsonResponse({
      success: true,

      category,

      page,

      total_pages:
        data?.total_pages || 1,

      total_results:
        data?.total_results || 0,

      results:
        Array.isArray(
          data?.results
        )
          ? data.results
          : [],

      generated_at:
        new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,

        error:
          'TMDB request failed',

        message:
          error?.message ||
          'Unknown error'
      },
      502
    );
  }
}


/* =========================================================
   API ROUTE — SEARCH
========================================================= */

async function searchApi(
  request,
  env,
  ctx
) {
  const url =
    new URL(request.url);

  const query =
    cleanQuery(
      url.searchParams.get(
        'q'
      )
    );

  const type =
    (
      url.searchParams.get(
        'type'
      ) ||
      'multi'
    )
      .trim()
      .toLowerCase();

  const page =
    parsePositiveInt(
      url.searchParams.get(
        'page'
      ),
      1,
      CONFIG.MAX_SEARCH_PAGE
    );

  if (!query) {
    return jsonResponse(
      {
        success: false,
        error:
          'Search query is required'
      },
      400
    );
  }

  try {
    let data;

    if (
      type === 'movie'
    ) {
      data =
        await searchMovies(
          query,
          page,
          env,
          ctx
        );
    } else if (
      type === 'tv'
    ) {
      data =
        await searchTv(
          query,
          page,
          env,
          ctx
        );
    } else {
      data =
        await searchMulti(
          query,
          page,
          env,
          ctx
        );
    }

    return jsonResponse({
      success: true,

      query,

      type,

      page,

      total_pages:
        data?.total_pages || 1,

      total_results:
        data?.total_results || 0,

      results:
        Array.isArray(
          data?.results
        )
          ? data.results
          : []
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,

        error:
          'Search failed',

        message:
          error?.message ||
          'Unknown error'
      },
      502
    );
  }
}


/* =========================================================
   API ROUTE — DETAILS
========================================================= */

async function detailsApi(
  request,
  env,
  ctx
) {
  const url =
    new URL(request.url);

  const type =
    (
      url.searchParams.get(
        'type'
      ) ||
      'movie'
    )
      .trim()
      .toLowerCase();

  const id =
    validId(
      url.searchParams.get(
        'id'
      )
    );

  if (!validType(type)) {
    return jsonResponse(
      {
        success: false,
        error:
          'type must be movie or tv'
      },
      400
    );
  }

  if (!id) {
    return jsonResponse(
      {
        success: false,
        error:
          'Valid TMDB ID is required'
      },
      400
    );
  }

  try {
    const data =
      type === 'movie'
        ? await getMovieDetails(
            id,
            env,
            ctx
          )
        : await getTvDetails(
            id,
            env,
            ctx
          );

    return jsonResponse({
      success: true,

      type,

      id,

      data
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,

        error:
          'Unable to load details',

        message:
          error?.message ||
          'Unknown error'
      },
      502
    );
  }
}


/* =========================================================
   API ROUTE — DISCOVER
========================================================= */

async function discoverApi(
  request,
  env,
  ctx
) {
  const url =
    new URL(request.url);

  const type =
    (
      url.searchParams.get(
        'type'
      ) ||
      'movie'
    )
      .trim()
      .toLowerCase();

  const page =
    parsePositiveInt(
      url.searchParams.get(
        'page'
      ),
      1,
      CONFIG.MAX_PAGE
    );

  if (!validType(type)) {
    return jsonResponse(
      {
        success: false,
        error:
          'type must be movie or tv'
      },
      400
    );
  }

  const allowedParams = [
    'with_genres',
    'with_original_language',
    'primary_release_year',
    'first_air_date_year',
    'vote_average.gte',
    'vote_count.gte',
    'sort_by',
    'with_watch_monetization_types',
    'with_watch_providers',
    'watch_region'
  ];

  const filters = {};

  for (
    const key of allowedParams
  ) {
    const value =
      url.searchParams.get(
        key
      );

    if (
      value !== null &&
      value !== ''
    ) {
      filters[key] =
        value.slice(0, 100);
    }
  }

  try {
    const data =
      type === 'movie'
        ? await discoverMovies(
            page,
            env,
            ctx,
            filters
          )
        : await discoverTv(
            page,
            env,
            ctx,
            filters
          );

    return jsonResponse({
      success: true,

      type,

      page,

      filters,

      total_pages:
        data?.total_pages || 1,

      total_results:
        data?.total_results || 0,

      results:
        data?.results || []
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,

        error:
          'Discover request failed',

        message:
          error?.message ||
          'Unknown error'
      },
      502
    );
  }
}


/* =========================================================
   HEALTH
========================================================= */

function healthApi(
  env
) {
  return jsonResponse(
    {
      success: true,

      status: 'healthy',

      service:
        'U-TV REVIEW',

      runtime:
        'Cloudflare Pages Worker',

      tmdb_configured:
        Boolean(
          getTmdbKey(env)
        ),

      timestamp:
        new Date().toISOString()
    },
    200,
    {
      'Cache-Control':
        'no-store'
    }
  );
}


/* =========================================================
   SITEMAP HELPERS
========================================================= */

function sitemapEntry(
  pathname,
  env,
  lastmod,
  priority
) {
  return `
  <url>
    <loc>${escapeXml(
      absoluteUrl(
        pathname,
        env
      )
    )}</loc>
    <lastmod>${escapeXml(
      lastmod
    )}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
}


function extractSitemapUrls(
  xml
) {
  const results = [];

  const regex =
    /<loc>\s*([^<]+?)\s*<\/loc>/gi;

  let match;

  while (
    (match =
      regex.exec(xml)) !== null
  ) {
    const value =
      match[1].trim();

    if (value) {
      results.push(value);
    }

    if (
      results.length >=
      CONFIG.MAX_SITEMAP_URLS
    ) {
      break;
    }
  }

  return results;
}


async function readStaticSitemap(
  request,
  env
) {
  if (
    !env?.ASSETS ||
    typeof env.ASSETS.fetch !==
      'function'
  ) {
    return [];
  }

  try {
    const sitemapUrl =
      new URL(
        '/sitemap.xml',
        request.url
      );

    const response =
      await env.ASSETS.fetch(
        new Request(
          sitemapUrl.toString(),
          {
            method: 'GET'
          }
        )
      );

    if (!response.ok) {
      return [];
    }

    const body =
      await response.text();

    return extractSitemapUrls(
      body
    );
  } catch {
    return [];
  }
}


/* =========================================================
   DYNAMIC SITEMAP
========================================================= */

async function dynamicSitemap(
  request,
  env,
  ctx
) {
  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const routeMap =
    new Map();

  for (
    const route of CONFIG.STATIC_ROUTES
  ) {
    routeMap.set(
      route,
      {
        lastmod: today,

        priority:
          route === '/'
            ? '1.0'
            : '0.8'
      }
    );
  }

  /*
    Preserve URLs generated by
    generate.cjs / public/sitemap.xml.
  */

  const staticUrls =
    await readStaticSitemap(
      request,
      env
    );

  for (
    const fullUrl of staticUrls
  ) {
    try {
      const parsed =
        new URL(fullUrl);

      const site =
        new URL(
          getSiteUrl(env)
        );

      if (
        parsed.origin !==
        site.origin
      ) {
        continue;
      }

      routeMap.set(
        parsed.pathname,
        {
          lastmod: today,

          priority:
            parsed.pathname === '/'
              ? '1.0'
              : '0.7'
        }
      );
    } catch {
      // Ignore malformed URLs.
    }
  }

  /*
    Fetch multiple TMDB sources.
  */

  const results =
    await Promise.allSettled([
      getTrending(
        env,
        ctx
      ),

      getPopularMovies(
        1,
        env,
        ctx
      ),

      getPopularTv(
        1,
        env,
        ctx
      )
    ]);

  const items = [];

  for (
    const result of results
  ) {
    if (
      result.status ===
        'fulfilled' &&
      Array.isArray(
        result.value?.results
      )
    ) {
      items.push(
        ...result.value.results
      );
    }
  }

  /*
    Deduplicate movie/TV IDs.
  */

  const seen =
    new Set();

  for (
    const item of items
  ) {
    if (!item?.id) {
      continue;
    }

    let type =
      item.media_type;

    if (
      type !== 'movie' &&
      type !== 'tv'
    ) {
      /*
        Popular movie endpoint does
        not always return media_type.
      */

      type =
        item.title
          ? 'movie'
          : 'tv';
    }

    const key =
      `${type}:${item.id}`;

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    const date =
      item.release_date ||
      item.first_air_date ||
      today;

    routeMap.set(
      `/${type}/${item.id}/`,
      {
        lastmod: date,

        priority: '0.7'
      }
    );

    if (
      routeMap.size >=
      CONFIG.MAX_SITEMAP_URLS
    ) {
      break;
    }
  }

  const body =
    [...routeMap.entries()]
      .slice(
        0,
        CONFIG.MAX_SITEMAP_URLS
      )
      .map(
        ([
          pathname,
          meta
        ]) =>
          sitemapEntry(
            pathname,
            env,
            meta.lastmod,
            meta.priority
          )
      )
      .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>
${body}
</urlset>`;
}


/* =========================================================
   STATIC ASSETS
========================================================= */

async function serveAssets(
  request,
  env
) {
  if (
    !env?.ASSETS ||
    typeof env.ASSETS.fetch !==
      'function'
  ) {
    return textResponse(
      'Cloudflare Pages ASSETS binding is not configured.',
      500
    );
  }

  let response;

  try {
    response =
      await env.ASSETS.fetch(
        request
      );
  } catch {
    return textResponse(
      'Asset service unavailable.',
      503
    );
  }

  /*
    Add security headers to
    static asset responses.
  */

  const headers =
    new Headers(
      response.headers
    );

  const security =
    securityHeaders();

  for (
    const [
      key,
      value
    ] of Object.entries(
      security
    )
  ) {
    headers.set(
      key,
      value
    );
  }

  /*
    Static HTML can remain revalidatable.
  */

  if (
    !headers.has(
      'Cache-Control'
    )
  ) {
    headers.set(
      'Cache-Control',
      'public, max-age=0, must-revalidate'
    );
  }

  return new Response(
    response.body,
    {
      status:
        response.status,

      statusText:
        response.statusText,

      headers
    }
  );
}


/* =========================================================
   404 RESPONSE
========================================================= */

async function notFound(
  request,
  env
) {
  if (
    env?.ASSETS &&
    typeof env.ASSETS.fetch ===
      'function'
  ) {
    try {
      const url =
        new URL(
          '/404.html',
          request.url
        );

      const response =
        await env.ASSETS.fetch(
          new Request(
            url.toString(),
            {
              method: 'GET'
            }
          )
        );

      if (response.ok) {
        return new Response(
          response.body,
          {
            status: 404,
            headers:
              response.headers
          }
        );
      }
    } catch {
      // Continue fallback.
    }
  }

  return textResponse(
    '404 - Page Not Found',
    404
  );
}


/* =========================================================
   OPTIONS
========================================================= */

function optionsResponse() {
  return new Response(
    null,
    {
      status: 204,

      headers: {
        ...corsHeaders(),

        ...securityHeaders()
      }
    }
  );
}


/* =========================================================
   MAIN ROUTER
========================================================= */

export default {

  async fetch(
    request,
    env,
    ctx
  ) {
    const url =
      new URL(
        request.url
      );

    /*
      OPTIONS
    */

    if (
      request.method ===
      'OPTIONS'
    ) {
      return optionsResponse();
    }

    /*
      Method protection
    */

    if (
      !CONFIG.ALLOWED_METHODS.includes(
        request.method
      )
    ) {
      return jsonResponse(
        {
          success: false,

          error:
            'Method Not Allowed'
        },
        405,
        {
          Allow:
            'GET, HEAD, OPTIONS'
        }
      );
    }

    /*
      Health
    */

    if (
      url.pathname ===
      '/api/health'
    ) {
      const response =
        healthApi(env);

      return request.method ===
        'HEAD'
        ? headResponse(
            response
          )
        : response;
    }

    /*
      Dynamic sitemap
    */

    if (
      url.pathname ===
      '/sitemap.xml'
    ) {
      try {
        const sitemap =
          await dynamicSitemap(
            request,
            env,
            ctx
          );

        const response =
          xmlResponse(
            sitemap,
            200
          );

        return request.method ===
          'HEAD'
          ? headResponse(
              response
            )
          : response;
      } catch {
        /*
          TMDB failure fallback:
          serve GitHub-generated sitemap.
        */

        if (
          env?.ASSETS &&
          typeof env.ASSETS.fetch ===
            'function'
        ) {
          try {
            const fallback =
              await env.ASSETS.fetch(
                new Request(
                  new URL(
                    '/sitemap.xml',
                    request.url
                  ),
                  {
                    method:
                      request.method
                  }
                )
              );

            return fallback;
          } catch {
            // Continue.
          }
        }

        const fallback =
          xmlResponse(
            `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${CONFIG.STATIC_ROUTES
  .map(
    route =>
      sitemapEntry(
        route,
        env,
        new Date()
          .toISOString()
          .slice(0, 10),
        route === '/'
          ? '1.0'
          : '0.8'
      )
  )
  .join('\n')}
</urlset>`
          );

        return request.method ===
          'HEAD'
          ? headResponse(
              fallback
            )
          : fallback;
      }
    }

    /*
      Main movies API
    */

    if (
      url.pathname ===
      '/api/movies'
    ) {
      const response =
        await moviesApi(
          request,
          env,
          ctx
        );

      return request.method ===
        'HEAD'
        ? headResponse(
            response
          )
        : response;
    }

    /*
      Search API
    */

    if (
      url.pathname ===
      '/api/search'
    ) {
      const response =
        await searchApi(
          request,
          env,
          ctx
        );

      return request.method ===
        'HEAD'
        ? headResponse(
            response
          )
        : response;
    }

    /*
      Details API
    */

    if (
      url.pathname ===
      '/api/details'
    ) {
      const response =
        await detailsApi(
          request,
          env,
          ctx
        );

      return request.method ===
        'HEAD'
        ? headResponse(
            response
          )
        : response;
    }

    /*
      Discover API
    */

    if (
      url.pathname ===
      '/api/discover'
    ) {
      const response =
        await discoverApi(
          request,
          env,
          ctx
        );

      return request.method ===
        'HEAD'
        ? headResponse(
            response
          )
        : response;
    }

    /*
      Static Pages / CSS / JS /
      images / generated movie pages
    */

    const assetResponse =
      await serveAssets(
        request,
        env
      );

    /*
      If asset exists, return it.
    */

    if (
      assetResponse.status !==
      404
    ) {
      return assetResponse;
    }

    /*
      Custom 404.
    */

    return notFound(
      request,
      env
    );
  }
};