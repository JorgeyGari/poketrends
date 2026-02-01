import Bottleneck from 'bottleneck';
import fs from 'fs/promises';
import path from 'path';
import https from 'https';

export class ContinuousRefreshService {
  constructor(trendsService, dataPath) {
    this.trendsService = trendsService;
    this.dataPath = dataPath;
    this.isRunning = false;
    this.isPaused = false;
    this.stats = {
      lastRun: null,
      successCount: 0,
      failureCount: 0,
      blockedCount: 0,
      currentPokemon: null,
      cycleProgress: 0
    };
    
    // Ultra-conservative rate limiting (configurable via env)
    const continuousMin = Number(process.env.TRENDS_CONTINUOUS_MIN_TIME_MS) || Number(process.env.TRENDS_MIN_TIME_MS) || 45000;
    this.limiter = new Bottleneck({
      minTime: continuousMin,           // 45 seconds between requests (~1.33/min) by default
      maxConcurrent: 1,
      reservoir: 1,             // Start with 1 request
      reservoirRefreshAmount: 1,
      reservoirRefreshInterval: 60000  // Refill 1 every minute
    });
    
    // Add jitter before each request
    this.limiter.on('scheduled', async () => {
      const jitter = Math.random() * 10000;  // 0-10 second random delay
      await new Promise(resolve => setTimeout(resolve, jitter));
    });
  }
  
  async start() {
    if (this.isRunning) {
      console.log('⚠️  Refresh service already running');
      return false;
    }
    
    this.isRunning = true;
    this.isPaused = false;
    // Startup delay to avoid immediate requests on boot
    const startupDelay = 5 * 60 * 1000; // 5 minutes
    console.log(`🔄 Starting continuous refresh service in ${startupDelay/1000}s...`);
    await new Promise(resolve => setTimeout(resolve, startupDelay));
    console.log('▶️  Beginning refresh loop');

    // Run in background loop
    this.refreshLoop().catch(err => {
      console.error('❌ Refresh service crashed:', err);
      this.isRunning = false;
    });

    return true;
  }
  
  async stop() {
    console.log('⏹️  Stopping refresh service...');
    this.isRunning = false;
    await this.limiter.stop();
  }
  
  pause() {
    console.log('⏸️  Pausing refresh service');
    this.isPaused = true;
  }
  
  resume() {
    console.log('▶️  Resuming refresh service');
    this.isPaused = false;
  }
  
  async refreshLoop() {
    while (this.isRunning) {
      if (this.isPaused) {
        await new Promise(resolve => setTimeout(resolve, 60000));  // Check every minute
        continue;
      }
      
      try {
        // Get next Pokémon to refresh (oldest first)
        const pokemon = await this.getNextPokemonToRefresh();
        
        if (!pokemon) {
          console.log('✅ Full refresh cycle complete! Starting new cycle...');
          this.stats.cycleProgress = 0;
          await new Promise(resolve => setTimeout(resolve, 300000));  // 5 min break between cycles
          continue;
        }
        
          // Random pause when switching to a different Pokémon to mimic human pacing
          if (this.stats.currentPokemon && this.stats.currentPokemon !== pokemon.name) {
            const pauseTime = 120000 + Math.random() * 180000; // 2-5 min
            console.log(`⏳ Switching to ${pokemon.name}, pausing ${Math.round(pauseTime/1000)}s...`);
            await new Promise(resolve => setTimeout(resolve, pauseTime));
          }

          this.stats.currentPokemon = pokemon.name;
        
        // Fetch with rate limiting
        const result = await this.limiter.schedule(() => 
          this.fetchWithBlockDetection(pokemon)
        );
        
        if (result.blocked) {
          console.error('🚫 BLOCKING DETECTED - Pausing for 24 hours');
          this.stats.blockedCount++;
          this.pause();
          
          // Auto-resume after 24 hours
          setTimeout(() => this.resume(), 24 * 60 * 60 * 1000);
          
        } else if (result.success) {
          this.stats.successCount++;
          await this.saveData(pokemon, result.data);
          console.log(`✅ Updated ${pokemon.name} (${this.stats.cycleProgress}% complete)`);
          
        } else {
          this.stats.failureCount++;
          console.log(`⚠️  Failed to update ${pokemon.name}: ${result.error}`);
        }
        
        this.stats.lastRun = new Date().toISOString();
        
      } catch (err) {
        console.error('Error in refresh loop:', err);
        await new Promise(resolve => setTimeout(resolve, 60000));  // Wait 1 min on error
      }
    }
  }
  
  async fetchWithBlockDetection(pokemon) {
    try {
      const result = await this.trendsService.getTrends(
        pokemon.name,
        pokemon.country || 'US',
        pokemon.id
      );
      
      // Check for blocking indicators
      if (typeof result === 'string' && result.includes('<!DOCTYPE')) {
        return { blocked: true };
      }
      
      if (result.error && result.error.includes('Unexpected token')) {
        return { blocked: true };
      }
      
      if (result.fallback === true) {
        return { success: false, error: 'Fallback used' };
      }
      
      return { success: true, data: result };
      
    } catch (err) {
      // Check if error indicates blocking
      if (err.message.includes('Unexpected token') || 
          err.message.includes('302 Moved')) {
        return { blocked: true };
      }
      
      return { success: false, error: err.message };
    }
  }
  
  async getNextPokemonToRefresh() {
    // Load current data file
    const data = await this.loadData();
    
    // Get all Pokémon that need refreshing
    const allPokemon = await this.getAllPokemon();
    const countries = ['US', 'JP', 'GB', 'ES', 'FR', 'DE'];
    
    // Build list of all pokemon-country combinations with age
    const entries = [];
    for (const pokemon of allPokemon) {
      for (const country of countries) {
        const key = `${pokemon.name}-${country}`;
        const existing = data.countries?.[country]?.[pokemon.name];
        const age = existing?.lastFetched ? 
          Date.now() - new Date(existing.lastFetched).getTime() : 
          Infinity;
        
        entries.push({
          name: pokemon.name,
          id: pokemon.id,
          country,
          age,
          lastFetched: existing?.lastFetched || null
        });
      }
    }
    
    // Sort by age (oldest first)
    entries.sort((a, b) => b.age - a.age);
    
    // Calculate progress
    const refreshedCount = entries.filter(e => e.age < 7 * 24 * 60 * 60 * 1000).length;
    this.stats.cycleProgress = Math.round((refreshedCount / entries.length) * 100);
    
    // Return oldest entry that's > 7 days old, or null if all fresh
    const stale = entries.find(e => e.age > 7 * 24 * 60 * 60 * 1000);
    return stale || null;
  }
  
  async getAllPokemon() {
    // Try reading from local cache first
    const cacheFile = path.join(path.dirname(this.dataPath), 'pokemon_names.json');
    try {
      const content = await fs.readFile(cacheFile, 'utf8');
      const parsed = JSON.parse(content);
      // Validate structure: array of objects with id and name
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].name) {
        console.log(`✅ Loaded ${parsed.length} Pokémon from cache`);
        return parsed;
      }
    } catch (err) {
      // ignore and fall back to network
    }

    // Helper: simple HTTPS GET that returns parsed JSON
    const fetchJson = (url) => new Promise((resolve, reject) => {
      https.get(url, (res) => {
        const { statusCode } = res;
        if (statusCode !== 200) {
          res.resume();
          return reject(new Error(`Request Failed. Status Code: ${statusCode}`));
        }

        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            resolve(parsed);
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });

    try {
      console.log('Fetching Pokémon list from PokéAPI...');
      const data = await fetchJson('https://pokeapi.co/api/v2/pokemon?limit=1025');
      const pokemonList = (data.results || []).map((p, idx) => ({ id: idx + 1, name: p.name }));

      // Save cache (best-effort)
      try {
        await fs.writeFile(cacheFile, JSON.stringify(pokemonList, null, 2));
      } catch (err) {
        console.warn('Failed to write Pokémon cache:', err.message || err);
      }

      if (pokemonList.length > 0) {
        console.log(`✅ Fetched ${pokemonList.length} Pokémon from PokéAPI`);
      }
  
    return pokemonList;
    } catch (err) {
      console.error('Failed to fetch Pokémon list from PokéAPI:', err.message || err);
      // As a last resort, return an empty list to avoid generating invalid names
      return [];
    }
  }
  
  async loadData() {
    try {
      const content = await fs.readFile(this.dataPath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      return { countries: {}, metadata: {} };
    }
  }
  
  async saveData(pokemon, trendsData) {
    const data = await this.loadData();
    
    if (!data.countries[pokemon.country]) {
      data.countries[pokemon.country] = {};
    }
    
    data.countries[pokemon.country][pokemon.name] = {
      ...trendsData,
      lastFetched: new Date().toISOString()
    };
    
    data.metadata.lastUpdate = new Date().toISOString();
    
    await fs.writeFile(this.dataPath, JSON.stringify(data, null, 2));
  }
  
  getStatus() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      stats: this.stats,
      estimatedCompletion: this.calculateETA()
    };
  }
  
  calculateETA() {
    if (!this.isRunning || this.stats.cycleProgress === 0) return null;
    
    const totalEntries = 1025 * 6;  // 1025 Pokémon × 6 countries
    const remaining = totalEntries * (1 - this.stats.cycleProgress / 100);
    const requestsPerHour = 60 / (25 / 60);  // ~2.4 per minute = 144/hour
    const hoursRemaining = remaining / requestsPerHour;
    
    return {
      hoursRemaining: Math.round(hoursRemaining),
      daysRemaining: Math.round(hoursRemaining / 24),
      completionDate: new Date(Date.now() + hoursRemaining * 60 * 60 * 1000).toISOString()
    };
  }
}

