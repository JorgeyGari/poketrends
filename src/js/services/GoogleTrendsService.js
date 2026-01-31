/**
 * @file Service for fetching Google Trends data.
 * Handles interactions with Google Trends API.
 */

import express from 'express';
import cors from 'cors';
import googleTrends from 'google-trends-api';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// In-memory cache for trends data
const trendsCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch Google Trends data for a given Pokémon name and country
 * @param {string} pokemonName - Name of the Pokémon
 * @param {string} countryCode - Country code (e.g., 'US', 'JP')
 * @returns {Promise<Object>} - Trends data
 */
async function fetchTrendsData(pokemonName, countryCode) {
    const cacheKey = `${pokemonName}_${countryCode}`;
    const cached = trendsCache.get(cacheKey);

    // Return cached data if valid
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        return cached.data;
    }

    try {
        const results = await googleTrends.interestOverTime({
            keyword: pokemonName,
            geo: countryCode,
            timeframe: 'today 12-m',
        });

        const data = JSON.parse(results);
        // Cache the fetched data
        trendsCache.set(cacheKey, { data, timestamp: Date.now() });

        return data;
    } catch (error) {
        console.error(`Error fetching trends for ${pokemonName} in ${countryCode}:`, error);
        throw error;
    }
}

// API endpoint to get trends data
app.get('/trends', async (req, res) => {
    const { pokemonName, countryCode } = req.query;

    if (!pokemonName || !countryCode) {
        return res.status(400).json({ error: 'Missing required parameters: pokemonName, countryCode' });
    }

    try {
        const data = await fetchTrendsData(pokemonName, countryCode);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch trends data' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Google Trends Service running on http://localhost:${PORT}`);
});