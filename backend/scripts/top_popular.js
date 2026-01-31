#!/usr/bin/env node
// Fetch all Pokémon from PokéAPI and query local /trends endpoint
// Outputs top 30 Pokémon by `score` (popularity)

// Use the species endpoint to avoid alternative forms and match the app's behavior
const LIMIT = Number(process.env.LIMIT) || Number(process.argv[2]) || 2000;
const POKEAPI_LIST = `https://pokeapi.co/api/v2/pokemon-species?limit=${LIMIT}`;
const TRENDS_URL = (name, id) => `http://localhost:3002/trends?pokemonName=${encodeURIComponent(name)}&countryCode=US&pokemonId=${id}`;

const CONCURRENCY = Number(process.env.CONCURRENCY) || 12;
const RETRIES = 2;
const RETRY_DELAY = 500; // ms

async function fetchJson(url) {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt < RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)));
      } else {
        throw err;
      }
    }
  }
}

function parseIdFromUrl(url) {
  const parts = url.split('/').filter(Boolean);
  return Number(parts[parts.length - 1]);
}

async function main() {
  console.log('Fetching Pokémon list from PokéAPI...');
  const list = await fetchJson(POKEAPI_LIST);
  const pokes = (list.results || []).map(r => ({ name: r.name, id: parseIdFromUrl(r.url) }));
  // Shuffle and sample to get a randomized set
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const sampleSize = LIMIT || pokes.length;
  const sampled = shuffle(pokes).slice(0, sampleSize);
  console.log(`Found ${pokes.length} Pokémon. Querying randomized sample of ${sampled.length} trends (this may take a while)...`);
  // replace pokes with sampled set
  const pokesToQuery = sampled;

  const results = [];
  let idx = 0;
  const total = pokes.length;
  let processed = 0;
  const startTime = Date.now();
  // Render a simple ASCII progress bar with ETA
  function renderProgress(processed, total) {
    const width = 30;
    const pct = total > 0 ? processed / total : 0;
    const filled = Math.round(pct * width);
    const bar = `[${'='.repeat(filled)}${' '.repeat(width - filled)}]`;
    const elapsed = (Date.now() - startTime) / 1000; // seconds
    const rate = processed / Math.max(1e-6, elapsed);
    const remaining = Math.max(0, total - processed);
    const etaSec = rate > 0 ? Math.round(remaining / rate) : -1;
    const eta = etaSec >= 0 ? (etaSec >= 60 ? `${Math.floor(etaSec/60)}m ${etaSec%60}s` : `${etaSec}s`) : '??';
    const pctLabel = `${Math.round(pct * 100).toString().padStart(3)}%`;
    process.stdout.write(`\r${bar} ${pctLabel} ${processed}/${total} ETA:${eta}`);
  }

  async function worker() {
    while (idx < pokes.length) {
      const i = idx++;
      const p = pokesToQuery[i];
      try {
        const data = await fetchJson(TRENDS_URL(p.name, p.id));
        results.push({ id: p.id, name: p.name, score: data.score ?? null, estimatedSearches: data.estimatedSearches ?? null, estimatedLabel: data.estimatedLabel ?? null, fallback: !!data.fallback });
        processed++;
        // Optional client-side spacing to avoid server-side rate-limits
        if (process.env.SLEEP_MS) {
          const ms = Number(process.env.SLEEP_MS) || 0;
          if (ms > 0) await new Promise(r => setTimeout(r, ms));
        }
      } catch (err) {
        results.push({ id: p.id, name: p.name, score: null, error: String(err) });
        processed++;
      }
    }
  }

  // Start periodic progress rendering
  renderProgress(processed, total);
  const progressInterval = setInterval(() => renderProgress(processed, total), 1000);

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);
  clearInterval(progressInterval);
  // print final progress and newline
  renderProgress(processed, total);
  process.stdout.write('\n');
  console.log('Done fetching trends.');

  const valid = results.filter(r => typeof r.score === 'number');
  valid.sort((a, b) => b.score - a.score);
  const top30 = valid.slice(0, 30);

  console.log('\nTop 30 Pokémon by popularity score (country: US):\n');
  console.log('Rank | ID   | Name               | Score   | Estimated Searches | Label');
  console.log('-----|------|--------------------|---------|--------------------|----------------');
  top30.forEach((p, i) => {
    console.log(`${String(i+1).padEnd(4)} | ${String(p.id).padEnd(4)} | ${p.name.padEnd(18)} | ${String(p.score).padEnd(7)} | ${String(p.estimatedSearches || '').padEnd(18)} | ${p.estimatedLabel || ''}`);
  });

  const failed = results.filter(r => r.score == null);
  const fallbacks = valid.filter(r => r.fallback);
  const realData = valid.filter(r => !r.fallback);
  
  console.log(`\nProcessed: ${results.length}, Success: ${valid.length}, Failed: ${failed.length}`);
  console.log(`Real Trends data: ${realData.length}, Fallback: ${fallbacks.length} (${((fallbacks.length/valid.length)*100).toFixed(1)}%)`);
  
  if (fallbacks.length > valid.length * 0.5) {
    console.log('\n⚠️  WARNING: Over 50% of results are using fallback scores!');
    console.log('   This means Google Trends requests are failing.');
    console.log('   Possible causes: rate limiting, network issues, or server not running.');
  }
  
  if (failed.length > 0) {
    console.log('\nSome requests failed (showing up to 10):');
    failed.slice(0,10).forEach(f => console.log(`- ${f.name} (${f.id}): ${f.error}`));
  }
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
