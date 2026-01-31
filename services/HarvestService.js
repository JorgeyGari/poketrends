/**
 * @file HarvestService.js
 * Background service for harvesting Pokemon trends data incrementally.
 * Maintains a hot data file (data/pokemon_trends.json) that updates asynchronously.
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Bottleneck from 'bottleneck';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class HarvestService {
  constructor(trendsClient, pokemonListFetcher) {
    this.trendsClient = trendsClient; // function: (pokemonName, countryCode, pokemonId) => Promise<data>
    this.pokemonListFetcher = pokemonListFetcher; // function: () => Promise<Array<{name, id}>>
    this.isHarvesting = false;
    this.progress = { current: 0, total: 0, successCount: 0, fallbackCount: 0 };
    this.dataPath = path.resolve(__dirname, '../data/pokemon_trends.json');
    this.lockPath = path.resolve(__dirname, '../data/.harvest.lock');
    this.currentData = null;
    this.loadExistingData();
  }

  /**
   * Load existing data from disk into memory
   */
  loadExistingData() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const raw = fs.readFileSync(this.dataPath, 'utf8');
        this.currentData = JSON.parse(raw);
        console.log(`📦 Loaded trends data: ${this.currentData?.metadata?.totalPokemon || 0} Pokémon, success rate ${this.currentData?.metadata?.successRate || 0}%`);
      } else {
        this.currentData = this.createEmptyData();
        console.log('📦 No existing trends data, starting fresh.');
      }
    } catch (err) {
      console.warn('Failed to load existing trends data:', err.message);
      this.currentData = this.createEmptyData();
    }
  }

  createEmptyData() {
    return {
      version: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      countries: {},
      topicIds: {}, // pokemonName -> topicId (shared across countries)
      metadata: {
        totalPokemon: 0,
        successRate: 0,
        lastHarvest: null
      }
    };
  }

  /**
   * Get current data (for serving to frontend)
   */
  getCurrentData() {
    return this.currentData || this.createEmptyData();
  }

  /**
   * Get last update time
   */
  getLastUpdateTime() {
    return this.currentData?.lastUpdate || null;
  }

  /**
   * Get current progress
   */
  getProgress() {
    return { ...this.progress };
  }

  /**
   * Check if currently harvesting
   */
  get isRunning() {
    return this.isHarvesting;
  }

  /**
   * Start background harvest (non-blocking)
   * @param {Object} options - { concurrency, minTime, maxRetries, targetPokemon, targetCountries, aggressive }
   * @returns {Promise<Object>} - { status, estimatedTime }
   */
  async startBackgroundHarvest(options = {}) {
    if (this.isHarvesting) {
      return { status: 'already_running', progress: this.progress };
    }

    // Check for lock file (in case process crashed mid-harvest)
    if (fs.existsSync(this.lockPath)) {
      console.warn('Lock file exists from previous harvest. Removing...');
      fs.unlinkSync(this.lockPath);
    }

    this.isHarvesting = true;
    fs.writeFileSync(this.lockPath, JSON.stringify({ startTime: new Date().toISOString() }), 'utf8');

    const {
      concurrency = 1,
      minTime = 12000,
      maxRetries = 3,
      targetPokemon = null, // null = all, or array of specific names
      targetCountries = null, // null = all, or array of country codes
      aggressive = false
    } = options;

    // Run harvest in background (don't block)
    this.doHarvest(concurrency, minTime, maxRetries, targetPokemon, targetCountries)
      .then(() => {
        console.log('✅ Background harvest completed');
      })
      .catch((err) => {
        console.error('❌ Background harvest failed:', err.message);
      })
      .finally(() => {
        this.isHarvesting = false;
        if (fs.existsSync(this.lockPath)) {
          fs.unlinkSync(this.lockPath);
        }
      });

    return { status: 'started', estimatedTime: '2-4 hours', progress: this.progress };
  }

  /**
   * Perform the actual harvest
   */
  async doHarvest(concurrency, minTime, maxRetries, targetPokemon, targetCountries) {
    console.log(`🌱 Starting harvest: concurrency=${concurrency}, minTime=${minTime}ms, maxRetries=${maxRetries}`);

    // Load existing data to avoid re-fetching fresh entries
    this.loadExistingData();

    // Fetch Pokemon list
    const allPokemon = await this.pokemonListFetcher();
    console.log(`Found ${allPokemon.length} Pokémon to consider`);

    // Determine what to fetch (skip entries < 7 days old)
    const toFetch = this.getStaleEntries(allPokemon, targetPokemon, targetCountries);
    console.log(`Will fetch ${toFetch.length} stale entries`);

    this.progress.total = toFetch.length;
    this.progress.current = 0;
    this.progress.successCount = 0;
    this.progress.fallbackCount = 0;

    // Use Bottleneck for rate limiting
    const limiter = new Bottleneck({ minTime, maxConcurrent: concurrency });

    for (const { pokemon, country } of toFetch) {
      await limiter.schedule(() => this.fetchAndSave(pokemon, country, maxRetries));
      this.progress.current++;

      // Log progress every 10 items
      if (this.progress.current % 10 === 0) {
        console.log(`Progress: ${this.progress.current}/${this.progress.total} (${this.progress.successCount} success, ${this.progress.fallbackCount} fallback)`);
      }
    }

    // Update metadata
    this.currentData.metadata.lastHarvest = new Date().toISOString();
    this.currentData.lastUpdate = new Date().toISOString();
    this.currentData.metadata.totalPokemon = allPokemon.length;
    this.currentData.metadata.successRate = this.progress.total > 0 
      ? ((this.progress.successCount / this.progress.total) * 100).toFixed(1)
      : 0;

    await this.saveData();
    console.log(`✅ Harvest complete: ${this.progress.successCount}/${this.progress.total} success (${this.currentData.metadata.successRate}% rate)`);
  }

  /**
   * Get list of stale entries that need refresh
   * @returns {Array<{pokemon: {name, id}, country: string}>}
   */
  getStaleEntries(allPokemon, targetPokemon, targetCountries) {
    const STALE_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days
    const now = Date.now();

    // Default countries: US, JP, ES, GB, DE, FR
    const countries = targetCountries || ['US', 'JP', 'ES', 'GB', 'DE', 'FR'];
    
    // Filter Pokemon if target list provided
    const pokemon = targetPokemon 
      ? allPokemon.filter(p => targetPokemon.includes(p.name))
      : allPokemon;

    const toFetch = [];

    for (const country of countries) {
      for (const p of pokemon) {
        const entry = this.currentData?.countries?.[country]?.[p.name];
        
        if (!entry) {
          // No data yet
          toFetch.push({ pokemon: p, country });
        } else {
          // Check if stale
          const lastFetched = entry.lastFetched ? new Date(entry.lastFetched).getTime() : 0;
          const age = now - lastFetched;
          if (age > STALE_THRESHOLD) {
            toFetch.push({ pokemon: p, country });
          }
        }
      }
    }

    return toFetch;
  }

  /**
   * Fetch trends for one Pokemon+country and save incrementally
   */
  async fetchAndSave(pokemon, country, maxRetries) {
    let attempt = 0;
    let lastError = null;

    while (attempt < maxRetries) {
      try {
        const data = await this.trendsClient(pokemon.name, country, pokemon.id);
        
        // Initialize country object if needed
        if (!this.currentData.countries[country]) {
          this.currentData.countries[country] = {};
        }

        // Store the entry
        this.currentData.countries[country][pokemon.name] = {
          score: data.score,
          avgScore: data.avgScore || null,
          maxScore: data.maxScore || null,
          estimatedSearches: data.estimatedSearches || null,
          estimatedLabel: data.estimatedLabel || null,
          topicId: data.topicId || null,
          lastFetched: new Date().toISOString(),
          fallback: !!data.fallback
        };

        // Store topicId globally if found
        if (data.topicId && !this.currentData.topicIds[pokemon.name]) {
          this.currentData.topicIds[pokemon.name] = data.topicId;
        }

        // Track success/fallback
        if (data.fallback) {
          this.progress.fallbackCount++;
        } else {
          this.progress.successCount++;
        }

        // Save incrementally every 20 items
        if (this.progress.current % 20 === 0) {
          await this.saveData();
        }

        return;
      } catch (err) {
        lastError = err;
        attempt++;
        if (attempt < maxRetries) {
          // Wait a bit before retry
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
    }

    // If all retries failed, store a fallback entry
    console.warn(`Failed to fetch ${pokemon.name} (${country}) after ${maxRetries} attempts`);
    if (!this.currentData.countries[country]) {
      this.currentData.countries[country] = {};
    }
    this.currentData.countries[country][pokemon.name] = {
      score: this.getFallbackScore(pokemon.name),
      fallback: true,
      lastFetched: new Date().toISOString(),
      error: lastError?.message || 'Unknown error'
    };
    this.progress.fallbackCount++;
  }

  /**
   * Deterministic fallback score
   */
  getFallbackScore(pokemonName) {
    const seed = pokemonName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return Math.min(60, 30 + (seed % 50));
  }

  /**
   * Save data to disk (atomic write)
   */
  async saveData() {
    try {
      const dataDir = path.dirname(this.dataPath);
      await fsp.mkdir(dataDir, { recursive: true });
      
      const tmp = this.dataPath + '.tmp';
      await fsp.writeFile(tmp, JSON.stringify(this.currentData, null, 2), 'utf8');
      await fsp.rename(tmp, this.dataPath);
      
      this.currentData.lastUpdate = new Date().toISOString();
    } catch (err) {
      console.error('Failed to save trends data:', err.message);
    }
  }
}
