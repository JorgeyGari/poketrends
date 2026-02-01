/**
* @file Service for fetching Google Trends data.
* Handles interactions with Google Trends API.
*/

import express from 'express';
import cors from 'cors';
import googleTrends from 'google-trends-api';
import HttpsProxyAgent from 'https-proxy-agent';
import Bottleneck from 'bottleneck';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { HarvestService } from './backend/services/HarvestService.js';
import { ContinuousRefreshService } from './services/ContinuousRefreshService.js';

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

// In-memory cache for trends data
const trendsCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
// Cache for topic (mid) lookups — topic IDs are stable so cache permanently
const topicIdCache = new Map();
// Simple runtime metrics for monitoring request outcomes
const metrics = {
  totalRequests: 0,
  success: 0,
  fallback: 0,
  rateLimit429: 0,
  blockedHTML: 0,
};

// Daily budget tracking (simple in-memory, resets each day)
const DAILY_BUDGET = Number(process.env.TRENDS_DAILY_BUDGET) || 200;
const dailyStats = {
  date: new Date().toDateString(),
  requestsToday: 0
};

// Create a Bottleneck limiter to space requests and keep concurrency low
const limiter = new Bottleneck({
  minTime: Number(process.env.TRENDS_MIN_TIME_MS) || 20000, // default 20s between requests
  maxConcurrent: 1,
});

// Optional proxy and UA configuration to reduce ban risk when enabled via environment
const proxyUrl = process.env.PROXY_URL || process.env.TRENDS_PROXY || '';
const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
const trendsUserAgent = process.env.TRENDS_USER_AGENT || '';

// File-backed topicIdCache persistence
const DATA_DIR = path.resolve(process.cwd(), 'data');
const TOPIC_CACHE_FILE = path.join(DATA_DIR, 'topic_cache.json');

async function loadTopicCacheFromDisk() {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    const raw = await fsp.readFile(TOPIC_CACHE_FILE, 'utf8');
    const obj = JSON.parse(raw);
    for (const [k, v] of Object.entries(obj || {})) {
      topicIdCache.set(k, v);
    }
    console.log(`Loaded ${topicIdCache.size} topicId entries from ${TOPIC_CACHE_FILE}`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('Failed to load topic cache:', err && err.message ? err.message : err);
    }
  }
}
async function saveTopicCacheToDisk() {
  try {
    const obj = Object.fromEntries(Array.from(topicIdCache.entries()));
    const tmp = TOPIC_CACHE_FILE + '.tmp';
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.writeFile(tmp, JSON.stringify(obj), 'utf8');
    await fsp.rename(tmp, TOPIC_CACHE_FILE);
  } catch (err) {
    console.warn('Failed to save topic cache:', err && err.message ? err.message : err);
  }
}

// Load cache on startup
loadTopicCacheFromDisk().catch(() => {});

const harvestService = new HarvestService(
  fetchTrendsData,
  async () => {
    const response = await fetch('https://pokeapi.co/api/v2/pokemon-species?limit=10000');
    const data = await response.json();
    return (data.results || []).map(r => {
      const parts = r.url.split('/').filter(Boolean);
      const id = Number(parts[parts.length - 1]);
      return { name: r.name, id };
    });
  }
);

const dataPath = path.join(process.cwd(), 'data', 'pokemon_trends.json');
const refreshService = new ContinuousRefreshService({
  getTrends: async (name, country, id) => {
    return await fetchTrendsData(name, country, id);
  }
}, dataPath);

const COOLDOWN_HOURS = 0;
setTimeout(() => {
  console.log('🚀 Starting continuous refresh service...');
  refreshService.start();
}, COOLDOWN_HOURS * 60 * 60 * 1000);

// Map max relative score (100) to an estimated absolute monthly search count
const MAX_ESTIMATED_SEARCHES = Number(process.env.MAX_SEARCHES) || 2000000;
// Earliest year Google Trends data is available
const GOOGLE_TRENDS_START_YEAR = 2004;
// Baseline year for ceiling calculation (when Pikachu/Gen 1 had full search history available)
const BASELINE_YEAR = 2004;

/**
* Get the release year for a Pokémon by ID
* @param {number} pokemonId
* @returns {number} Release year
*/
function getPokemonReleaseYear(pokemonId) {
  // Special mapping for specific Pokémon with staggered releases (DLC, regional variants, etc.)
  const specialReleases = {
    // Sword/Shield DLC (Isle of Armor, Crown Tundra) - late 2020
    890: 2020, 891: 2020, 892: 2020, 893: 2020, // Eternatus, Kubfu, Urshifu, Zarude
    // Scarlet/Violet DLC (The Teal Mask, The Indigo Disk) - 2023/2024
    1008: 2023, 1009: 2023, 1010: 2023, 1011: 2023, // Miraidon etc
  };

  if (specialReleases[pokemonId]) {
    return specialReleases[pokemonId];
  }

  // Standard generation-based mapping
  if (pokemonId <= 386) return 2004;  // Gen I-III
  if (pokemonId <= 493) return 2006;  // Gen IV
  if (pokemonId <= 649) return 2010;  // Gen V
  if (pokemonId <= 721) return 2013;  // Gen VI
  if (pokemonId <= 809) return 2016;  // Gen VII
  if (pokemonId <= 905) return 2019;  // Gen VIII
  return 2022;                        // Gen IX
}

/**
* Calculate the adjusted MAX_ESTIMATED_SEARCHES ceiling based on Pokémon's release year.
* Normalizes for the fact that newer Pokémon have less historical search volume.
* @param {number} pokemonId
* @returns {number} Adjusted ceiling for estimated searches
*/
function getAdjustedMaxSearchesCeiling(pokemonId) {
  const releaseYear = getPokemonReleaseYear(pokemonId);
  const currentYear = new Date().getFullYear();
  
  // Years since release (minimum 1 year to avoid division issues)
  const yearsSinceRelease = Math.max(1, currentYear - releaseYear);
  
  // Years available in Google Trends (from 2004 to present)
  const yearsInTrends = currentYear - GOOGLE_TRENDS_START_YEAR;
  
  // Proportion of search history available for this Pokémon
  const proportionAvailable = Math.min(1, yearsSinceRelease / yearsInTrends);
  
  // Scale the baseline ceiling proportionally
  const adjustedCeiling = Math.round(MAX_ESTIMATED_SEARCHES * proportionAvailable);
  
  return adjustedCeiling;
}

/**
* Get topic ID (mid) for a given Pokémon name using google-trends-api autoComplete.
* Caches results (including null) permanently in `topicIdCache`.
* @param {string} pokemonName
* @returns {Promise<string|null>} topic mid like '/m/0dl567' or null if not found
*/
async function getTopicId(pokemonName) {
  if (!pokemonName) return null;
  const key = String(pokemonName).toLowerCase();
  if (topicIdCache.has(key)) return topicIdCache.get(key);

  const maxAttempts = 2;
  const baseDelay = 150;
  let lastErr = null;
  let parsed = null;

  // Try autoComplete with "<name> pokemon" first, then fallback to bare name.
  const queries = [`${pokemonName} pokemon`, pokemonName];
  for (const q of queries) {
    for (let attempt = 1; attempt <= Math.max(2, maxAttempts); attempt++) {
      try {
        const raw = await limiter.schedule(() => googleTrends.autoComplete({
          keyword: q,
          ...(proxyAgent ? { agent: proxyAgent } : {}),
          ...(trendsUserAgent ? { userAgent: trendsUserAgent } : {})
        }));
        if (!raw) {
          lastErr = new Error('Empty autoComplete response');
          throw lastErr;
        }
        parsed = JSON.parse(raw);
        // If parsed and contains suggestions, break out
        if (parsed && parsed.default && Array.isArray(parsed.default.topics) && parsed.default.topics.length > 0) {
          break;
        }
        // otherwise, allow retry logic to continue
        break;
      } catch (err) {
        lastErr = err;
        const msg = (err && err.message) ? String(err.message).toLowerCase() : '';
        if (msg.includes('429') || msg.includes('too many requests') || msg.includes('rate limit')) {
          metrics.rateLimit429++;
        }
        if (attempt < maxAttempts) {
          const jitter = Math.random() * 200;
          const delay = baseDelay * Math.pow(2, attempt - 1) + jitter;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
    }
    if (parsed) break; // stop trying other query if we got a parse
  }

  // If we never parsed a valid response, don't cache null permanently (transient)
  if (!parsed) {
    console.warn(`getTopicId failed for ${pokemonName}: ${lastErr && lastErr.message}`);
    return null;
  }

  const suggestions = parsed?.default?.topics || [];

  const pokemonTopic = suggestions.find(topic => {
    if (!topic || !topic.title) return false;
    const title = String(topic.title).toLowerCase();
    const ttype = String(topic.type || '').toLowerCase();
    return title === key && (ttype.includes('pok') || ttype.includes('video') || ttype === 'topic');
  }) || suggestions.find(topic => String(topic.title || '').toLowerCase() === key);

  if (pokemonTopic && pokemonTopic.mid) {
    topicIdCache.set(key, pokemonTopic.mid);
    // persist change
    saveTopicCacheToDisk().catch(() => {});
    console.log(`   Found topic: ${pokemonTopic.title} - ${pokemonTopic.mid}`);
    return pokemonTopic.mid;
  }

  // Cache the fact we didn't find a topic to avoid repeated lookups
  topicIdCache.set(key, null);
  saveTopicCacheToDisk().catch(() => {});
  return null;
}

/**
* Fetch Google Trends data for a given Pokémon name and country
* @param {string} pokemonName - Name of the Pokémon
* @param {string} countryCode - Country code (e.g., 'US', 'JP')
* @param {number} pokemonId - Pokémon ID (optional, used for generation-based ceiling)
* @returns {Promise} - Trends data
*/
async function fetchTrendsData(pokemonName, countryCode, pokemonId = null, requestProxyUrl = undefined, requestUserAgent = undefined) {
  const cacheKey = `${pokemonName}_${countryCode}`;
  const cached = trendsCache.get(cacheKey);

  // Return cached data if valid
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`📦 Cache hit: ${pokemonName} (${countryCode})`);
    return cached.data;
  }
  
  metrics.totalRequests++;
  
  try {
    console.log(`🌐 Fetching trends: ${pokemonName} (${countryCode})`);
    // Try to resolve a Knowledge Graph topic ID (mid). If found, we'll use it
    let topicId = null;
    try {
      topicId = await getTopicId(pokemonName);
    } catch (err) {
      topicId = null; // continue with keyword fallback
    }

    // Use topicId when available, otherwise fallback to keyword
    const searchTerm = topicId || `${pokemonName} pokemon`;
    console.log(`   Using: ${topicId ? `Topic ID ${topicId}` : `Keyword "${searchTerm}"`}`);
    
    // Helper: detect likely-HTML responses or anti-bot pages
    function isProbablyHTML(text) {
      if (!text || typeof text !== 'string') return false;
      const t = text.trim().toLowerCase();
      if (t.startsWith('<') || t.startsWith('<!doctype') || t.includes('<html')) return true;
      // Common anti-bot / block indicators
      const markers = ['captcha', 'recaptcha', 'please try again', 'verify', 'access denied', 'forbidden', 'unusual traffic', 'meta name="robots"', 'check your browser'];
      for (const m of markers) {
        if (t.includes(m)) return true;
      }
      // Heuristic: server-side error pages often contain <meta> and </head>
      if (t.includes('<meta') && t.includes('</head>')) return true;
      return false;
    }

    // Resolve per-request agent/userAgent: prefer request-specific values, otherwise fall back to globals
    const resolveAgent = (url) => url ? new HttpsProxyAgent(url) : proxyAgent;
    const localUserAgent = requestUserAgent || trendsUserAgent || '';

    // Helper to fetch interestOverTime with retries and HTML detection
    async function fetchInterestWithRetry(term) {
      const maxAttempts = 4;
      const baseDelay = 1000; // ms
      let lastError = null;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          // Use Bottleneck to space requests
          const localAgent = resolveAgent(requestProxyUrl);
          const results = await limiter.schedule(() => googleTrends.interestOverTime({
            keyword: term,
            geo: countryCode,
            startTime: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Last year
            ...(localAgent ? { agent: localAgent } : {}),
            ...(localUserAgent ? { userAgent: localUserAgent } : {})
          }));

          if (isProbablyHTML(results)) {
            metrics.blockedHTML++;
            const snippet = results.slice(0, 300).replace(/\n/g, ' ');
            throw new Error(`Non-JSON response from Google Trends (HTML/snippet): ${snippet}`);
          }

          const parsed = JSON.parse(results);
          metrics.success++;
          return parsed;
        } catch (err) {
          lastError = err;
          const msg = (err && err.message) ? String(err.message).toLowerCase() : '';
          
          if (msg.includes('429') || msg.includes('too many requests') || msg.includes('rate limit')) {
            metrics.rateLimit429++;
            console.warn(`Rate limit detected for ${pokemonName}. Pausing longer before retry.`);
            // longer cooldown on explicit 429s
            const cooldown = Number(process.env.TRENDS_COOLDOWN_MS) || 30000;
            await new Promise(r => setTimeout(r, cooldown + Math.random() * 5000));
          } else if (msg.includes('non-json') || msg.includes('html') || msg.includes('<!doctype')) {
            metrics.blockedHTML++;
            console.warn(`Blocked HTML response detected for ${pokemonName}. Cooling down before retry.`);
            const cooldown = Number(process.env.TRENDS_HTML_COOLDOWN_MS) || 60000;
            await new Promise(r => setTimeout(r, cooldown + Math.random() * 5000));
          } else {
            console.warn(`Attempt ${attempt} failed for ${pokemonName} (${countryCode}) using "${term}":`, err && err.message ? err.message : err);
            if (attempt < maxAttempts) {
              const backoff = Math.pow(2, attempt) * baseDelay;
              const jitter = Math.random() * 1000;
              await new Promise(r => setTimeout(r, backoff + jitter));
              continue;
            }
          }
          
          if (attempt < maxAttempts) {
            continue;
          }
        }
      }
      throw lastError || new Error('Failed to fetch/parse trends data');
    }

    // Track daily budget: reset if day changed
    if (dailyStats.date !== new Date().toDateString()) {
      dailyStats.date = new Date().toDateString();
      dailyStats.requestsToday = 0;
    }

    // If we've exhausted today's budget, return a fallback immediately
    if (DAILY_BUDGET > 0 && dailyStats.requestsToday >= DAILY_BUDGET) {
      console.warn(`Daily Trends budget exceeded (${dailyStats.requestsToday}/${DAILY_BUDGET}). Returning fallback for ${pokemonName}.`);
      metrics.fallback++;
      const fallbackScore = getFallbackScore(pokemonName);
      const ceiling = pokemonId != null ? getAdjustedMaxSearchesCeiling(pokemonId) : MAX_ESTIMATED_SEARCHES;
      return {
        pokemonName,
        countryCode,
        score: fallbackScore,
        timelineValues: [],
        timelineSum: 0,
        estimatedSearches: Math.round((fallbackScore / 100) * ceiling),
        estimatedLabel: null,
        rawData: null,
        cached: false,
        error: 'Daily trends budget exceeded',
        usedTopic: false,
        topicId: null,
        fallback: true
      };
    }

    // First try with topicId (if available) — otherwise searchTerm already contains keyword
    let data = null;
    try {
      // If we resolved a topicId via autoComplete, add a small breathing room
      if (topicId) {
        const pause = 200 + Math.random() * 600; // 200-800ms
        await new Promise(r => setTimeout(r, pause));
      }

      // Increment daily counter before making the request
      dailyStats.requestsToday++;

      data = await fetchInterestWithRetry(searchTerm);
    } catch (err) {
      throw err;
    }

    // If we used a topicId but got an empty timeline or no useful data, retry once with keyword fallback
    const timelineCheck = (d) => Array.isArray(d?.default?.timelineData) && d.default.timelineData.length > 0;
    if (topicId && !timelineCheck(data)) {
      console.warn(`Topic-based query returned no timeline for ${pokemonName}; retrying with keyword fallback.`);
      try {
        const keywordTerm = `${pokemonName} pokemon`;
        const fallbackData = await fetchInterestWithRetry(keywordTerm);
        // mark that we fell back to keyword
        topicId = null;
        data = fallbackData;
      } catch (err) {
        // keep original data (even if empty) and continue to error handling below
        console.warn(`Keyword fallback also failed for ${pokemonName}:`, err && err.message ? err.message : err);
      }
    }
    
    // Calculate metrics from timeline
    const timeline = data.default?.timelineData || [];
    const values = timeline.map(d => d.value[0]);

    if (values.length === 0) {
      const fallback = getFallbackScore(pokemonName);
      const ceiling = pokemonId != null ? getAdjustedMaxSearchesCeiling(pokemonId) : MAX_ESTIMATED_SEARCHES;
      metrics.fallback++;
      return {
        pokemonName,
        countryCode,
        score: fallback,
        timelineValues: [],
        timelineSum: 0,
        estimatedSearches: Math.round((fallback / 100) * ceiling),
        estimatedLabel: null,
        rawData: data,
        cached: false,
        usedTopic: !!topicId,
        topicId: topicId || null,
        fallback: true
      };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const avgScore = sum / values.length; // float average
    const maxScore = Math.max(...values);
    const recentValues = values.slice(-30);
    const recentAvg = recentValues.length > 0 ? (recentValues.reduce((a, b) => a + b, 0) / recentValues.length) : avgScore;

    // Precise score with decimal precision and recent trend tiebreaker
    const preciseScore = (
      avgScore * 0.85 +    // 85% weight on average
      maxScore * 0.10 +    // 10% weight on peak
      recentAvg * 0.05     // 5% weight on recent trend
    );

    // Map precise score to estimated searches using generation-adjusted ceiling
    const ceiling = pokemonId != null ? getAdjustedMaxSearchesCeiling(pokemonId) : MAX_ESTIMATED_SEARCHES;
    const estimatedSearches = Math.round((preciseScore / 100) * ceiling);
    
    function prettySearchLabel(n) {
      if (n >= 1000000) return `~${(n / 1000000).toFixed(1)}M searches`;
      if (n >= 1000) return `~${(n / 1000).toFixed(0)}k searches`;
      return `~${n} searches`;
    }

    const timelineValues = values;
    const timelineSum = sum;

    const result = {
      pokemonName,
      countryCode,
      score: Number(preciseScore.toFixed(2)),
      avgScore: Number(avgScore.toFixed(2)),
      maxScore,
      recentAvg: Number(recentAvg.toFixed(2)),
      timelineValues,
      timelineSum,
      estimatedSearches,
      estimatedLabel: prettySearchLabel(estimatedSearches),
      rawData: data,
      usedTopic: !!topicId,
      topicId: topicId || null,
      cached: false,
      estimateMethod: 'preciseWeighted'
    };
    
    // Cache the fetched data
    trendsCache.set(cacheKey, { data: result, timestamp: Date.now() });

    console.log(`✅ ${pokemonName}: score=${result.score} ${result.usedTopic ? '(Entity)' : '(Keyword)'}`);
    return result;
    
  } catch (error) {
    console.error(`❌ Error fetching trends for ${pokemonName} in ${countryCode}:`, error && error.message ? error.message : error);

    // Log a short snippet if available (helpful for anti-bot HTML pages)
    if (error && error.message && error.message.length > 0) {
      console.error('  Details:', error.message.slice(0, 400));
    }

    // Return fallback score but keep the API shape
    const fallbackScore = getFallbackScore(pokemonName);
    const ceiling = pokemonId != null ? getAdjustedMaxSearchesCeiling(pokemonId) : MAX_ESTIMATED_SEARCHES;
    metrics.fallback++;
    return {
      pokemonName,
      countryCode,
      score: fallbackScore,
      timelineValues: [],
      timelineSum: 0,
      estimatedSearches: Math.round((fallbackScore / 100) * ceiling),
      estimatedLabel: null,
      rawData: null,
      cached: false,
      error: (error && error.message) || String(error),
      usedTopic: false,
      topicId: null,
      fallback: true
    };
  }
}

/**
* Get fallback score for popular Pokémon
*/
function getFallbackScore(pokemonName) {
  // Deterministic fallback based on name to avoid hard-coded celebrity bias.
  const baseName = (pokemonName || '').toString().toLowerCase();
  // compute simple seed from name
  const seed = baseName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  // Cap fallback to avoid artificially dominant results (max 60)
  return Math.min(60, 30 + (seed % 50));
}

// Admin endpoint to view runtime metrics (rate-limit hits, fallbacks, etc.)
app.get('/admin/metrics', (req, res) => {
  const remaining = DAILY_BUDGET > 0 ? Math.max(0, DAILY_BUDGET - dailyStats.requestsToday) : null;
  res.json({
    metrics,
    trendsCacheSize: trendsCache.size,
    topicIdCacheSize: topicIdCache.size,
    dailyBudget: {
      date: dailyStats.date,
      used: dailyStats.requestsToday,
      budget: DAILY_BUDGET,
      remaining
    }
  });
});

// API endpoint to get trends data
app.get('/trends', async (req, res) => {
  const { pokemonName, countryCode, pokemonId } = req.query;
  
  if (!pokemonName || !countryCode) {
    return res.status(400).json({  
      error: 'Missing required parameters: pokemonName, countryCode'  
    });
  }

  try {
    const id = pokemonId ? parseInt(pokemonId, 10) : null;
    const requestProxyUrl = req.query.proxyUrl || req.query.proxy || undefined;
    const requestUserAgent = req.query.userAgent || req.query.ua || undefined;
    const data = await fetchTrendsData(pokemonName, countryCode, id, requestProxyUrl, requestUserAgent);
    res.json(data);
  } catch (error) {
    res.status(500).json({  
      error: 'Failed to fetch trends data',
      message: error.message  
    });
  }
});

// Admin: clear caches (trends and topic id cache)
app.get('/admin/clear-cache', (req, res) => {
  const { pokemonName, topic } = req.query;

  const before = {
    trendsCacheSize: trendsCache.size,
    topicIdCacheSize: topicIdCache.size,
  };

  let clearedTrends = 0;
  if (pokemonName) {
    const keyLower = String(pokemonName).toLowerCase();
    for (const key of Array.from(trendsCache.keys())) {
      if (key.toLowerCase().startsWith(keyLower + '_') || key.toLowerCase().includes(keyLower)) {
        trendsCache.delete(key);
        clearedTrends++;
      }
    }
  } else {
    clearedTrends = trendsCache.size;
    trendsCache.clear();
  }

  let clearedTopic = 0;
  if (topic) {
    const t = String(topic).toLowerCase();
    if (topicIdCache.has(t)) {
      topicIdCache.delete(t);
      clearedTopic = 1;
    }
  } else {
    clearedTopic = topicIdCache.size;
    topicIdCache.clear();
  }

  const after = {
    trendsCacheSize: trendsCache.size,
    topicIdCacheSize: topicIdCache.size,
  };

  res.json({
    message: 'Cache cleared',
    before,
    after,
    cleared: { trends: clearedTrends, topic: clearedTopic }
  });
});

app.get('/data/trends', (req, res) => {
  const data = harvestService.getCurrentData();
  res.json(data);
});

app.post('/admin/harvest', async (req, res) => {
  const { targetPokemon, targetCountries, aggressive } = req.body;
  const result = await harvestService.startBackgroundHarvest({
    concurrency: 1,
    minTime: aggressive ? 15000 : 12000,
    maxRetries: aggressive ? 5 : 3,
    targetPokemon,
    targetCountries
  });
  res.json(result);
});

app.get('/admin/harvest/status', (req, res) => {
  res.json({
    isRunning: harvestService.isRunning,
    progress: harvestService.getProgress(),
    lastUpdate: harvestService.getLastUpdateTime()
  });
});

app.get('/admin/refresh/status', (req, res) => {
  res.json(refreshService.getStatus());
});

app.post('/admin/refresh/start', async (req, res) => {
  const started = await refreshService.start();
  res.json({ success: started, message: started ? 'Started' : 'Already running' });
});

app.post('/admin/refresh/stop', async (req, res) => {
  await refreshService.stop();
  res.json({ success: true, message: 'Stopped' });
});

app.post('/admin/refresh/pause', (req, res) => {
  refreshService.pause();
  res.json({ success: true, message: 'Paused' });
});

app.post('/admin/refresh/resume', (req, res) => {
  refreshService.resume();
  res.json({ success: true, message: 'Resumed' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({  
    status: 'ok',  
    cacheSize: trendsCache.size,
    uptime: process.uptime()  
  });
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, stopping refresh service...');
  await refreshService.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, stopping refresh service...');
  await refreshService.stop();
  process.exit(0);
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Google Trends Service running on http://localhost:${PORT}`);
  console.log(`📊 Endpoint: GET /trends?pokemonName=pikachu&countryCode=US`);
});
