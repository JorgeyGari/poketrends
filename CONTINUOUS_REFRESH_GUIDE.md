# Continuous Refresh System Guide

## Overview

The continuous refresh system automatically updates your Pokémon trends data in a sustainable, Google-safe manner.

## Key Features

- **Rate**: 2-3 requests/minute (ultra-conservative)
- **Full cycle**: 7-10 days for all 1000+ Pokémon across 6 countries
- **Priority**: Updates oldest data first
- **Auto-pause**: Stops immediately if blocking detected
- **Resume-safe**: Picks up where it left off after restarts

## Configuration

### Cooldown Period

Located in [server.js](server.js):

```javascript
const COOLDOWN_HOURS = 72;  // Change to 0 after initial cooldown period
```

**Current state**: 72-hour cooldown (you're currently blocked)

**After cooldown**: Set to `0` to start immediately on server launch

## API Endpoints

### Check Status

```bash
curl http://localhost:3002/admin/refresh/status | jq
```

**Response**:
```json
{
  "isRunning": true,
  "isPaused": false,
  "stats": {
    "lastRun": "2026-02-03T10:45:00Z",
    "successCount": 145,
    "failureCount": 12,
    "blockedCount": 0,
    "currentPokemon": "charizard",
    "cycleProgress": 24
  },
  "estimatedCompletion": {
    "hoursRemaining": 38,
    "daysRemaining": 2,
    "completionDate": "2026-02-05T00:45:00Z"
  }
}
```

### Manual Controls

#### Start Service
```bash
curl -X POST http://localhost:3002/admin/refresh/start
```

#### Stop Service
```bash
curl -X POST http://localhost:3002/admin/refresh/stop
```

#### Pause (temporarily suspend)
```bash
curl -X POST http://localhost:3002/admin/refresh/pause
```

#### Resume (continue after pause)
```bash
curl -X POST http://localhost:3002/admin/refresh/resume
```

## Timeline

### Current State (Day 0-3)
- Server blocked, no requests possible
- System in cooldown mode
- No automatic requests will be made

### Day 3 (February 3rd, 2026)
- Auto-start continuous refresh
- Rate: ~2-3 requests/minute
- ~3,000 requests/day

### Day 10-13
- First full cycle complete (all 6,150 entries refreshed)
- Success rate: 50-70% expected
- Failed entries remain with synthetic/fallback scores

### Steady State (Ongoing)
- Rolling 7-day refresh cycle
- Data never older than 7-10 days
- Auto-pauses on any blocking detection
- Self-heals after 24h cooldown

## Rate Limiting

The service uses ultra-conservative rate limiting:

- **Minimum time**: 25 seconds between requests (2.4/min)
- **Concurrency**: 1 (sequential requests only)
- **Reservoir**: 2 requests max, refills 2/minute
- **Jitter**: 0-10 second random delay before each request

## Blocking Detection

The service automatically detects blocking and pauses:

- HTML responses (instead of JSON)
- "Unexpected token" errors
- 302 redirects
- Rate limit errors

When blocking is detected:
1. Service pauses immediately
2. Blocking counter increments
3. Auto-resumes after 24 hours
4. Logs warning message

## Data Storage

Trends data is stored in:
```
/home/zen/Documentos/poketrends/data/pokemon_trends.json
```

Structure:
```json
{
  "countries": {
    "US": {
      "pikachu": {
        "score": 85.4,
        "lastFetched": "2026-02-03T10:45:00Z",
        ...
      }
    }
  },
  "metadata": {
    "lastUpdate": "2026-02-03T10:45:00Z"
  }
}
```

## Deployment

### Starting the Server

```bash
cd /home/zen/Documentos/poketrends
node server.js
```

Or with Docker:
```bash
docker-compose up -d
```

### After Cooldown Period

1. Edit [server.js](server.js):
   ```javascript
   const COOLDOWN_HOURS = 0;  // Start immediately
   ```

2. Restart server:
   ```bash
   # If running directly
   pkill -f "node server.js"
   node server.js
   
   # If using Docker
   docker-compose restart
   ```

## Monitoring

### Check Logs

```bash
# Direct run
tail -f /tmp/poketrends_server.log

# Docker
docker-compose logs -f
```

### Watch Status in Real-Time

```bash
watch -n 30 'curl -s http://localhost:3002/admin/refresh/status | jq'
```

## Troubleshooting

### Service Not Starting

**Check cooldown period**:
```javascript
// In server.js, look for:
const COOLDOWN_HOURS = 72;
```

If you want to start immediately, set to `0`.

### High Failure Rate

Normal: 30-50% failure rate is expected due to:
- Google Trends inconsistencies
- Network issues
- Rate limiting

The service automatically retries stale data in the next cycle.

### Blocking Detected

**Automatic response**: Service pauses for 24 hours

**Manual intervention**:
1. Check status: `curl http://localhost:3002/admin/refresh/status`
2. Wait for auto-resume OR manually resume after sufficient cooldown
3. If persistent, increase rate limiting in ContinuousRefreshService.js:
   ```javascript
   minTime: 30000,  // Increase from 25000 to 30000 (slower)
   ```

## Best Practices

✅ **Let it run**: The system is designed to run indefinitely  
✅ **Check weekly**: Monitor progress once a week  
✅ **Don't rush**: Increasing rate risks permanent blocking  
✅ **Trust auto-pause**: If blocking is detected, let it cool down  
✅ **Keep cooldown**: For first 3 days after deployment, keep COOLDOWN_HOURS at 72  

## Expected Performance

- **Requests/day**: ~3,000
- **Cycle duration**: 7-10 days
- **Success rate**: 50-70%
- **Data freshness**: Max 7-10 days old
- **Uptime**: 99.9% (auto-recovers from issues)

## Support

If issues persist:
1. Check [server.js](server.js) configuration
2. Review [ContinuousRefreshService.js](services/ContinuousRefreshService.js) 
3. Monitor `/admin/refresh/status` endpoint
4. Check server logs for errors
