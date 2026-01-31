#!/usr/bin/env node
/**
 * @file harvest_trends.js
 * CLI script for one-time aggressive Pokemon trends harvesting.
 * Usage:
 *   node scripts/harvest_trends.js [--fast|--aggressive] [--countries=US,JP] [--limit=151]
 */

import { HarvestService } from '../services/HarvestService.js';

// Import trends fetcher from server.js (we'll need to export fetchTrendsData)
const TRENDS_URL = process.env.TRENDS_API_URL || 'http://localhost:3002';

/**
 * Fetch Pokemon list from PokéAPI
 */
async function fetchPokemonList(limit = 0) {
  const url = limit > 0 
    ? `https://pokeapi.co/api/v2/pokemon-species?limit=${limit}`
    : `https://pokeapi.co/api/v2/pokemon-species?limit=10000`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  return (data.results || []).map(r => {
    const parts = r.url.split('/').filter(Boolean);
    const id = Number(parts[parts.length - 1]);
    return { name: r.name, id };
  });
}

/**
 * Call local trends API endpoint
 */
async function fetchTrendsData(pokemonName, countryCode, pokemonId) {
  const url = `${TRENDS_URL}/trends?pokemonName=${encodeURIComponent(pokemonName)}&countryCode=${countryCode}&pokemonId=${pokemonId}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Parse CLI arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: 'balanced', // fast, balanced, aggressive
    countries: null,
    limit: 0,
    output: './data/pokemon_trends.json'
  };

  for (const arg of args) {
    if (arg === '--fast') {
      options.mode = 'fast';
    } else if (arg === '--aggressive') {
      options.mode = 'aggressive';
    } else if (arg.startsWith('--countries=')) {
      options.countries = arg.split('=')[1].split(',');
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--output=')) {
      options.output = arg.split('=')[1];
    }
  }

  return options;
}

/**
 * Main harvest function
 */
async function main() {
  const options = parseArgs();
  
  console.log('🌱 Pokemon Trends Harvester');
  console.log(`Mode: ${options.mode}`);
  console.log(`Limit: ${options.limit || 'all'}`);
  console.log(`Countries: ${options.countries ? options.countries.join(', ') : 'default (US, JP, ES, GB, DE, FR)'}`);
  console.log(`Output: ${options.output}\n`);

  // Determine harvest parameters based on mode
  let concurrency, minTime, maxRetries;
  switch (options.mode) {
    case 'fast':
      concurrency = 1;
      minTime = 5000; // 5s
      maxRetries = 2;
      console.log('⚡ Fast mode: ~45-60 min, expect 15-20% fallback rate');
      break;
    case 'aggressive':
      concurrency = 1;
      minTime = 15000; // 15s
      maxRetries = 5;
      console.log('🐢 Aggressive mode: ~2-3 hours, expect <5% fallback rate');
      break;
    default: // balanced
      concurrency = 1;
      minTime = 10000; // 10s
      maxRetries = 3;
      console.log('⚖️  Balanced mode: ~90 min, expect ~10% fallback rate');
  }

  // Create harvest service
  const service = new HarvestService(fetchTrendsData, () => fetchPokemonList(options.limit));

  // Start harvest (this will run synchronously in the CLI)
  console.log('\nStarting harvest...\n');
  
  const startTime = Date.now();
  
  await service.startBackgroundHarvest({
    concurrency,
    minTime,
    maxRetries,
    targetCountries: options.countries,
    aggressive: options.mode === 'aggressive'
  });

  // Wait for harvest to complete (poll every second)
  while (service.isRunning) {
    await new Promise(r => setTimeout(r, 1000));
    const progress = service.getProgress();
    
    // Print progress bar
    if (progress.total > 0) {
      const pct = ((progress.current / progress.total) * 100).toFixed(1);
      const bar = '='.repeat(Math.round(progress.current / progress.total * 30));
      const space = ' '.repeat(30 - bar.length);
      process.stdout.write(`\r[${bar}${space}] ${pct}% ${progress.current}/${progress.total} (${progress.successCount} success, ${progress.fallbackCount} fallback)`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const progress = service.getProgress();
  
  console.log('\n');
  console.log(`✅ Harvest complete in ${elapsed} minutes`);
  console.log(`Success: ${progress.successCount}/${progress.total} (${((progress.successCount / progress.total) * 100).toFixed(1)}%)`);
  console.log(`Fallback: ${progress.fallbackCount}/${progress.total} (${((progress.fallbackCount / progress.total) * 100).toFixed(1)}%)`);
  console.log(`Data saved to: ${options.output}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
