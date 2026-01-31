/**
 * Trends API Service (Frontend)
 * Calls the Node.js backend to get Google Trends data
 */
export class TrendsApiService {
  constructor() {
    // Use environment variable or fallback to localhost for development
    const baseUrl = typeof __API_BASE_URL__ !== 'undefined' 
      ? __API_BASE_URL__ 
      : (process.env.VITE_API_BASE_URL || 'http://localhost:3002');
    this.apiUrl = `${baseUrl}/trends`;
    this.cache = new Map();
  }

  /**
   * Get Google Trends data for a Pokémon
   * @param {string} pokemonName - Name of the Pokémon
   * @param {string} countryCode - Country code (default: 'US')
   * @returns {Promise<Object>} Object containing { score, estimatedSearches, estimatedLabel, rawData, ... }
   */
  async getTrendsScore(pokemonName, countryCode = 'US') {
    const cacheKey = `${pokemonName}_${countryCode}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const url = `${this.apiUrl}?pokemonName=${encodeURIComponent(pokemonName)}&countryCode=${countryCode}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();

      // Cache full data object
      this.cache.set(cacheKey, data);

      // Log result type
      if (data.cached) {
        console.log(`📦 Cached trends: ${pokemonName} = ${data.score}`);
      } else if (data.fallback) {
        console.log(`⚠️ Fallback trends: ${pokemonName} = ${data.score}`);
      } else {
        console.log(`✅ Real trends: ${pokemonName} = ${data.score}`);
      }

      return data;
      
    } catch (error) {
      console.error(`Error fetching trends for ${pokemonName}:`, error);
      return { score: this.getFallbackScore(pokemonName), fallback: true };
    }
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
      // Add 300ms delay between requests to avoid overwhelming the API
      await this.delay(300);
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
