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
// Map max relative score (100) to an estimated absolute monthly search count
const MAX_ESTIMATED_SEARCHES = Number(process.env.MAX_SEARCHES) || 2000000;

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
    
    // Add "pokemon" for better search results
    const searchTerm = `${pokemonName} pokemon`;
    
    const results = await googleTrends.interestOverTime({
      keyword: searchTerm,
      geo: countryCode,
      startTime: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Last year
    });
    
    const data = JSON.parse(results);
    
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
      cached: false,
      estimateMethod: 'preciseWeighted'
    };
    
    // Cache the fetched data
    trendsCache.set(cacheKey, { data: result, timestamp: Date.now() });
    
    console.log(`✅ ${pokemonName}: score=${avgScore}`);
    return result;
    
  } catch (error) {
    console.error(`❌ Error fetching trends for ${pokemonName} in ${countryCode}:`, error.message);
    
    // Return fallback score
    return {
      pokemonName,
      countryCode,
      score: getFallbackScore(pokemonName),
      error: error.message,
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
