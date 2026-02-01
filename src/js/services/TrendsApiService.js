/**
 * Trends API Service (Frontend)
 * Prioritizes pre-computed local data, falls back to live API in dev mode
 */
export class TrendsApiService {
  constructor() {
    // Use environment variable or fallback to localhost for development
    const baseUrl = typeof __API_BASE_URL__ !== 'undefined' 
      ? __API_BASE_URL__ 
      : (process.env.VITE_API_BASE_URL || 'http://localhost:3002');
    this.apiUrl = `${baseUrl}/trends`;
    this.dataUrl = `${baseUrl}/data/trends`;
    this.cache = new Map();
    this.localData = null;
    this.dataAge = null;
    this.isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // Load local data on init
    this.loadLocalData();
  }

  /**
   * Load pre-computed trends data from server
   */
  async loadLocalData() {
    try {
      const response = await fetch(this.dataUrl);
      if (!response.ok) {
        throw new Error(`Failed to load data: ${response.status}`);
      }
      
      this.localData = await response.json();
      this.dataAge = new Date(this.localData.lastUpdate);
      
      const totalPokemon = this.localData?.metadata?.totalPokemon || 0;
      const successRate = this.localData?.metadata?.successRate || 0;
      
      console.log(`📦 Loaded pre-computed trends data: ${totalPokemon} Pokémon, ${successRate}% success rate`);
      console.log(`📅 Last update: ${this.dataAge.toLocaleString()}`);
    } catch (err) {
      console.warn('⚠️ Failed to load local trends data, will use live API:', err.message);
    }
  }

  /**
   * Get Google Trends data for a Pokémon
   * Priority: 1) Local data (if fresh), 2) Live API (localhost only), 3) Fallback
   * @param {string} pokemonName - Name of the Pokémon
   * @param {string} countryCode - Country code (default: 'US')
   * @param {number} pokemonId - Pokémon ID (optional, used for generation-based ceiling calculation)
   * @returns {Promise<Object>} Object containing { score, estimatedSearches, estimatedLabel, rawData, ... }
   */
  async getTrendsScore(pokemonName, countryCode = 'US', pokemonId = null) {
    const cacheKey = `${pokemonName}_${countryCode}`;
    
    // Check in-memory cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Priority 1: Use local pre-computed data if available and fresh
    if (this.localData?.countries?.[countryCode]?.[pokemonName]) {
      const entry = this.localData.countries[countryCode][pokemonName];
      const lastFetched = entry.lastFetched ? new Date(entry.lastFetched) : null;
      const age = lastFetched ? (Date.now() - lastFetched.getTime()) : Infinity;
      
      // Use if < 30 days old
      if (age < 30 * 24 * 60 * 60 * 1000) {
        const data = {
          ...entry,
          source: 'local',
          cached: true,
          pokemonName,
          countryCode
        };
        
        this.cache.set(cacheKey, data);
        console.log(`📦 Local data: ${pokemonName} = ${data.score}`);
        return data;
      }
    }

    // Priority 2: Fallback to live API (localhost only for dev)
    if (this.isLocalhost) {
      try {
        const data = await this.fetchLiveAPI(pokemonName, countryCode, pokemonId);
        this.cache.set(cacheKey, data);
        return data;
      } catch (error) {
        console.warn(`⚠️ Live API failed for ${pokemonName}, using fallback`);
      }
    }

    // Priority 3: Use deterministic fallback
    const fallbackData = {
      score: this.getFallbackScore(pokemonName),
      fallback: true,
      source: 'fallback',
      pokemonName,
      countryCode
    };
    
    this.cache.set(cacheKey, fallbackData);
    console.log(`⚠️ Fallback: ${pokemonName} = ${fallbackData.score}`);
    return fallbackData;
  }

  /**
   * Fetch from live API (dev mode only)
   */
  async fetchLiveAPI(pokemonName, countryCode, pokemonId) {
    let url = `${this.apiUrl}?pokemonName=${encodeURIComponent(pokemonName)}&countryCode=${countryCode}`;
    if (pokemonId != null) {
      url += `&pokemonId=${pokemonId}`;
    }

    const maxAttempts = 3;
    const baseDelay = 500; // ms
    let attempt = 0;
    let lastErr = null;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          // Surface 429 specially so callers can back off if needed
          const status = response.status;
          throw new Error(`API returned ${status}`);
        }

        const data = await response.json();
        // Log result type
        if (data.cached) {
          console.log(`📦 Cached trends: ${pokemonName} = ${data.score}`);
        } else if (data.fallback) {
          console.log(`⚠️ Fallback trends: ${pokemonName} = ${data.score}`);
        } else {
          console.log(`✅ Real trends: ${pokemonName} = ${data.score}`);
        }

        return data;
      } catch (err) {
        lastErr = err;
        if (attempt >= maxAttempts) break;
        const backoff = Math.pow(2, attempt) * baseDelay + Math.random() * 500;
        await this.delay(backoff);
      }
    }

    throw lastErr || new Error('Failed to fetch live trends API');
    
  }

  /**
   * Get batch trends scores with rate limiting
   * @param {Array<string>} pokemonNames - Array of Pokémon names
   * @param {string} countryCode - Country code
   * @returns {Promise<Map>} Map of names to scores
   */
  async getBatchScores(pokemonNames, countryCode = 'US') {
    const scores = new Map();
    
    for (const name of pokemonNames) {
      // Add randomized delay between requests (300-800ms) to avoid bursts
      await this.delay(300 + Math.random() * 500);
      const score = await this.getTrendsScore(name, countryCode);
      scores.set(name, score);
    }
    
    return scores;
  }

  /**
   * Fallback score (client-side backup)
   */
  getFallbackScore(pokemonName) {
    const seed = pokemonName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return 30 + (seed % 50);
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Check if backend is running
   */
  async checkHealth() {
    try {
      const healthUrl = `${this.apiUrl.replace('/trends', '')}/health`;
      const response = await fetch(healthUrl);
      const text = await response.text();

      // Try to parse JSON, but handle non-JSON responses gracefully
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('❌ Backend health returned non-JSON:', text);
        return false;
      }

      console.log('🏥 Backend health:', data);
      return data.status === 'ok';
    } catch (error) {
      console.error('❌ Backend not reachable:', error.message);
      return false;
    }
  }
}
