# Background Harvest Architecture

## Overview

The game now uses **pre-computed trends data** stored in `data/pokemon_trends.json`. A background harvest service continuously updates this file without blocking gameplay.

## Architecture

```
┌─────────────┐
│   Frontend  │  Reads from local data file (fast, offline)
│   (Game)    │  ↓
└─────────────┘  GET /data/trends
                 │
┌─────────────────────────────────────┐
│         Backend Server              │
│  ┌──────────────┐  ┌──────────────┐│
│  │   /trends    │  │ /data/trends ││  Serves pre-computed data
│  │  (live API)  │  │ (static file)││  
│  └──────────────┘  └──────────────┘│
│                                     │
│  ┌──────────────────────────────┐  │
│  │  HarvestService              │  │  Background worker
│  │  - Updates data incrementally│  │  updates file async
│  │  - Runs on schedule/trigger  │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Components

### 1. `services/HarvestService.js`
Background service that:
- Loads existing `data/pokemon_trends.json`
- Fetches stale entries (>7 days old) from Google Trends
- Saves incrementally (every 20 items)
- Tracks progress (success/fallback metrics)

### 2. `scripts/harvest_trends.js`
CLI tool for one-time aggressive harvesting:
```bash
# Fast mode (~45-60 min, ~15-20% fallback)
node scripts/harvest_trends.js --fast

# Balanced mode (~90 min, ~10% fallback) [default]
node scripts/harvest_trends.js

# Aggressive mode (~2-3 hours, <5% fallback)
node scripts/harvest_trends.js --aggressive

# Custom options
node scripts/harvest_trends.js --countries=US,JP --limit=151
```

### 3. Server Endpoints

#### `GET /data/trends`
Serves the pre-computed data file to frontend.

Response:
```json
{
  "version": "2026-01-31T20:11:00Z",
  "lastUpdate": "2026-01-31T20:11:00Z",
  "countries": {
    "US": {
      "pikachu": {
        "score": 75.45,
        "estimatedSearches": 1508968,
        "topicId": "/m/0dl567",
        "lastFetched": "2026-01-31T15:00:00Z"
      }
    }
  },
  "metadata": {
    "totalPokemon": 1025,
    "successRate": 89.2,
    "lastHarvest": "2026-01-30T03:00:00Z"
  }
}
```

#### `POST /admin/harvest`
Trigger background harvest manually.

Request body (all optional):
```json
{
  "targetPokemon": ["pikachu", "charizard"],
  "targetCountries": ["US", "JP"],
  "aggressive": true
}
```

#### `GET /admin/harvest/status`
Check harvest progress.

Response:
```json
{
  "isRunning": true,
  "progress": {
    "current": 245,
    "total": 6150,
    "successCount": 220,
    "fallbackCount": 25
  },
  "lastUpdate": "2026-01-31T20:15:00Z"
}
```

### 4. Frontend: `TrendsApiService.js`

**Priority order:**
1. **Local data** (if <30 days old) → instant, no API calls
2. **Live API** (localhost only, dev mode) → fallback for development
3. **Deterministic fallback** → stable, always available

On app startup:
```javascript
// Automatically loads data/pokemon_trends.json
const service = new TrendsApiService();
await service.loadLocalData();

// Gameplay uses pre-computed data (no live API calls)
const data = await service.getTrendsScore('pikachu', 'US');
// → Returns from local data instantly
```

## Deployment Strategies

### Option A: Seed with Baseline (Recommended)

1. **Initial harvest** (one-time, ~2-3 hours):
   ```bash
   node scripts/harvest_trends.js --aggressive --output data/pokemon_trends_baseline.json
   ```

2. **Commit to git**:
   ```bash
   git add data/pokemon_trends_baseline.json
   git commit -m "Add baseline trends data"
   ```

3. **Dockerfile**:
   ```dockerfile
   FROM node:18
   COPY . /app
   WORKDIR /app
   RUN npm ci --production
   
   # Copy baseline data
   COPY data/pokemon_trends_baseline.json /app/data/pokemon_trends.json
   
   CMD ["node", "server.js"]
   ```

4. **Server auto-refreshes** stale entries in background (no redeployment needed).

### Option B: Harvest on Build

```dockerfile
FROM node:18
COPY . /app
WORKDIR /app
RUN npm ci --production

# Run aggressive harvest during build
RUN node scripts/harvest_trends.js --aggressive --output /app/data/pokemon_trends.json

CMD ["node", "server.js"]
```

**Trade-off:** Build takes 2-3 hours, but container has freshest data.

### Option C: No Seed, Runtime Harvest

```dockerfile
FROM node:18
COPY . /app
WORKDIR /app
RUN npm ci --production
RUN mkdir -p /app/data

CMD ["node", "server.js"]
```

Server auto-starts harvest on first run (see `server.js` startup logic).

## Ongoing Maintenance

### Scheduled Re-harvests

Add to `server.js`:
```javascript
import cron from 'node-cron';

// Weekly refresh (Sundays at 3 AM)
cron.schedule('0 3 * * 0', () => {
  console.log('Starting weekly background harvest...');
  harvestService.startBackgroundHarvest({ aggressive: false });
});
```

Or use GitHub Actions:
``yaml
# .github/workflows/refresh-trends.yml
name: Refresh Trends Data
on:
  schedule:
    - cron: '0 3 * * 0'  # Weekly
  workflow_dispatch:  # Manual trigger

jobs:
  harvest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: node scripts/harvest_trends.js --output data/pokemon_trends.json
      - name: Commit updated data
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add data/pokemon_trends.json
          git commit -m "Update trends data" || echo "No changes"
          git push
```

### Manual Triggers

```bash
# Trigger via admin endpoint
curl -X POST http://localhost:3002/admin/harvest \
  -H "Content-Type: application/json" \
  -d '{"aggressive": true}'

# Check status
curl http://localhost:3002/admin/harvest/status

# Or use the CLI script
node scripts/harvest_trends.js --aggressive
```

## Testing

### 1. Test with small sample (10 Pokémon):
```bash
# Start server
node server.js

# In another terminal, trigger harvest
curl -X POST http://localhost:3002/admin/harvest \
  -H "Content-Type: application/json" \
  -d '{"targetCountries": ["US"], "targetPokemon": ["pikachu", "charizard", "mewtwo"]}'

# Check progress
watch -n 2 'curl -s http://localhost:3002/admin/harvest/status | jq'

# View data
curl http://localhost:3002/data/trends | jq '.countries.US | keys | .[0:10]'
```

### 2. Test frontend integration:
```bash
# Start dev server
npm run dev

# Open browser to http://localhost:5173
# Check console logs:
# → "📦 Loaded pre-computed trends data: X Pokémon, Y% success rate"
# → "📦 Local data: pikachu = 75.45"
```

### 3. Test CLI harvest:
```bash
# Quick test with 10 Pokémon
LIMIT=10 node scripts/harvest_trends.js --fast

# Check output
cat data/pokemon_trends.json | jq '.metadata'
```

## Benefits

✅ **Fast gameplay** - No live API calls, instant scores  
✅ **Offline-capable** - Data bundled with app  
✅ **Fresh data** - Background updates keep it current  
✅ **Resume-safe** - Harvest can be interrupted and resumed  
✅ **Low fallback rate** - Aggressive harvesting gets real data  
✅ **Scalable** - Serves thousands of users without API rate limits  

## Environment Variables

```bash
# Server (server.js)
TRENDS_MIN_TIME_MS=20000        # Min time between Google Trends requests (default: 20s)
TRENDS_COOLDOWN_MS=30000        # Cooldown after 429 errors (default: 30s)
TRENDS_HTML_COOLDOWN_MS=60000   # Cooldown after HTML blocks (default: 60s)

# Harvest script (scripts/harvest_trends.js)
TRENDS_API_URL=http://localhost:3002  # Backend URL for harvest script
```

## File Structure

```
poketrends/
├── data/
│   ├── pokemon_trends.json           # Hot data file (auto-updated)
│   ├── pokemon_trends_baseline.json  # Optional: committed baseline
│   ├── topic_cache.json              # Cached topic IDs
│   └── .harvest.lock                 # Lock file (auto-managed)
├── services/
│   └── HarvestService.js             # Background harvest worker
├── scripts/
│   ├── harvest_trends.js             # CLI harvest tool
│   └── top_popular.js                # Analysis tool (still works)
├── src/js/services/
│   └── TrendsApiService.js           # Frontend: local-first service
└── server.js                         # Backend with /data/trends endpoint
```

## Next Steps

1. **Initial harvest** (one-time):
   ```bash
   node scripts/harvest_trends.js --aggressive --limit=151
   ```

2. **Commit baseline**:
   ```bash
   cp data/pokemon_trends.json data/pokemon_trends_baseline.json
   git add data/pokemon_trends_baseline.json
   ```

3. **Deploy** with baseline included

4. **Set up weekly refresh** (cron or GitHub Actions)

5. **Monitor** via `/admin/harvest/status`
