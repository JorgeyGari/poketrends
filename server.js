/**
 * @file Service for fetching Google Trends data.
 * Handles interactions with Google Trends API.
 */

import express from 'express';
import cors from 'cors';
import googleTrends from 'google-trends-api';

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

// In-memory cache for trends data
const trendsCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
// Cache for topic (mid) lookups — topic IDs are stable so cache permanently
const topicIdCache = new Map();
// Map max relative score (100) to an estimated absolute monthly search count
const MAX_ESTIMATED_SEARCHES = Number(process.env.MAX_SEARCHES) || 2000000;

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

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const raw = await googleTrends.autoComplete({ keyword: pokemonName });
      if (!raw) {
        lastErr = new Error('Empty autoComplete response');
        throw lastErr;
      }

      parsed = JSON.parse(raw);
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
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
    console.log(`   Found topic: ${pokemonTopic.title} - ${pokemonTopic.mid}`);
    return pokemonTopic.mid;
  }

  // Cache the fact we didn't find a topic to avoid repeated lookups
  topicIdCache.set(key, null);
  return null;
}

/**
 * Fetch Google Trends data for a given Pokémon name and country
 * @param {string} pokemonName - Name of the Pokémon
 * @param {string} countryCode - Country code (e.g., 'US', 'JP')
 * @returns {Promise} - Trends data
 */
async function fetchTrendsData(pokemonName, countryCode) {
  const cacheKey = `${pokemonName}_${countryCode}`;
  const cached = trendsCache.get(cacheKey);

  // Return cached data if valid
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`📦 Cache hit: ${pokemonName} (${countryCode})`);
    return cached.data;
  }

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
    // Helper: detect likely-HTML responses
    function isProbablyHTML(text) {
      if (!text || typeof text !== 'string') return false;
      const t = text.trim().toLowerCase();
      return t.startsWith('<') || t.startsWith('<!doctype') || t.includes('<html');
    }

    // Helper to fetch interestOverTime with retries and HTML detection
    async function fetchInterestWithRetry(term) {
      const maxAttempts = 3;
      const baseDelay = 300; // ms
      let lastError = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const results = await googleTrends.interestOverTime({
            keyword: term,
            geo: countryCode,
            startTime: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Last year
          });

          if (isProbablyHTML(results)) {
            const snippet = results.slice(0, 300).replace(/\n/g, ' ');
            throw new Error(`Non-JSON response from Google Trends (HTML/snippet): ${snippet}`);
          }

          const parsed = JSON.parse(results);
          return parsed;
        } catch (err) {
          lastError = err;
          console.warn(`Attempt ${attempt} failed for ${pokemonName} (${countryCode}) using "${term}":`, err && err.message ? err.message : err);
          if (attempt < maxAttempts) {
            const delay = baseDelay * Math.pow(2, attempt - 1);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
        }
      }
      throw lastError || new Error('Failed to fetch/parse trends data');
    }

    // First try with topicId (if available) — otherwise searchTerm already contains keyword
    let data = null;
    try {
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
      return {
        pokemonName,
        countryCode,
        score: fallback,
        timelineValues: [],
        timelineSum: 0,
        estimatedSearches: Math.round((fallback / 100) * MAX_ESTIMATED_SEARCHES),
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

    // Map precise score to estimated searches
    const estimatedSearches = Math.round((preciseScore / 100) * MAX_ESTIMATED_SEARCHES);
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
    return {
      pokemonName,
      countryCode,
      score: fallbackScore,
      timelineValues: [],
      timelineSum: 0,
      estimatedSearches: Math.round((fallbackScore / 100) * MAX_ESTIMATED_SEARCHES),
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
  const popularPokemon = {
    'pikachu': 95,
    'charizard': 90,
    'mewtwo': 88,
    'eevee': 85,
    'lucario': 80,
    'greninja': 78,
    'bulbasaur': 75,
    'squirtle': 75,
    'charmander': 76,
    'gengar': 72,
    'snorlax': 70,
  };
  
  const baseName = pokemonName.toLowerCase();
  return popularPokemon[baseName] || 30 + Math.floor(Math.random() * 40);
}

// API endpoint to get trends data
app.get('/trends', async (req, res) => {
  const { pokemonName, countryCode } = req.query;
  
  if (!pokemonName || !countryCode) {
    return res.status(400).json({ 
      error: 'Missing required parameters: pokemonName, countryCode' 
    });
  }

  try {
    const data = await fetchTrendsData(pokemonName, countryCode);
    res.json(data);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch trends data',
      message: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    cacheSize: trendsCache.size,
    uptime: process.uptime() 
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Google Trends Service running on http://localhost:${PORT}`);
  console.log(`📊 Endpoint: GET /trends?pokemonName=pikachu&countryCode=US`);
});
