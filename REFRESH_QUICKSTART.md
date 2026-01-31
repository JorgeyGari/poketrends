# Continuous Refresh System - Quick Start

## 🚀 Implementation Complete!

The continuous slow-drip refresh system has been successfully installed.

## 📁 Files Created/Modified

### New Files:
- [services/ContinuousRefreshService.js](services/ContinuousRefreshService.js) - Core refresh service
- [CONTINUOUS_REFRESH_GUIDE.md](CONTINUOUS_REFRESH_GUIDE.md) - Complete documentation
- [scripts/monitor_refresh.sh](scripts/monitor_refresh.sh) - Status monitoring tool

### Modified Files:
- [server.js](server.js) - Integrated refresh service with admin endpoints
- [package.json](package.json) - Already had bottleneck dependency

## ⚙️ Configuration

**Current cooldown period**: 72 hours (3 days)

Located in [server.js](server.js#L90):
```javascript
const COOLDOWN_HOURS = 72;  // Change to 0 after initial cooldown period
```

## 🎯 Quick Start

### 1. Start the Server (Current State - Day 0)

The service will NOT make requests yet due to the 72-hour cooldown:

```bash
# Kill any existing server
pkill -f "node server.js"

# Start fresh
cd /home/zen/Documentos/poketrends
node server.js
```

### 2. Monitor Status

```bash
# Quick check
./scripts/monitor_refresh.sh

# Or manually
curl http://localhost:3002/admin/refresh/status | jq
```

### 3. After 72 Hours (Day 3 - Feb 3rd)

The service will automatically start making requests at 2-3 per minute.

### 4. Remove Cooldown (Optional - Only After You're Unblocked)

When you're confident you're no longer blocked:

1. Edit [server.js](server.js):
   ```javascript
   const COOLDOWN_HOURS = 0;  // Start immediately
   ```

2. Restart:
   ```bash
   pkill -f "node server.js"
   node server.js
   ```

## 📊 What to Expect

### Timeline

| Day | Activity | Rate | Progress |
|-----|----------|------|----------|
| 0-3 | Cooldown | 0 req/min | 0% |
| 3-10 | First cycle | 2-3 req/min | 0-100% |
| 10+ | Steady state | 2-3 req/min | Rolling 7-day refresh |

### Metrics

- **Requests per day**: ~3,000
- **Full cycle duration**: 7-10 days
- **Expected success rate**: 50-70%
- **Data freshness**: Max 7-10 days old
- **Total entries**: 6,150 (1,025 Pokémon × 6 countries)

## 🎛️ Manual Controls

All controls work immediately (even during cooldown):

```bash
# Start service manually (bypasses cooldown)
curl -X POST http://localhost:3002/admin/refresh/start

# Stop service
curl -X POST http://localhost:3002/admin/refresh/stop

# Pause temporarily
curl -X POST http://localhost:3002/admin/refresh/pause

# Resume after pause
curl -X POST http://localhost:3002/admin/refresh/resume

# Check status
curl http://localhost:3002/admin/refresh/status | jq
```

## 🔍 Monitoring

### Watch in Real-Time

```bash
watch -n 30 './scripts/monitor_refresh.sh'
```

### Check Logs

```bash
# If running in foreground, check console output
# If background, check wherever you redirect output

# Example log messages:
# 🔄 Starting continuous refresh service...
# ✅ Updated pikachu (24% complete)
# ⚠️  Failed to update mewtwo: Fallback used
# 🚫 BLOCKING DETECTED - Pausing for 24 hours
```

## 🛡️ Safety Features

✅ **Auto-pause on blocking** - Stops immediately if Google blocks requests  
✅ **24h auto-recovery** - Resumes automatically after cooldown  
✅ **Rate limiting** - Ultra-conservative 2-3 req/min  
✅ **Random jitter** - 0-10s random delay per request  
✅ **Graceful shutdown** - Saves state on server restart  
✅ **Resume-safe** - Picks up where it left off  

## 🚨 Troubleshooting

### Service Not Starting After Cooldown

Check the cooldown setting:
```bash
grep "COOLDOWN_HOURS" server.js
```

Should show `const COOLDOWN_HOURS = 72;`

### High Failure Rate

This is normal! Expected failure rate is 30-50% due to:
- Google Trends API inconsistencies
- Network issues
- Rate limiting

Failed entries will be retried in the next cycle (oldest first).

### Blocking Detected

**Automatic response**: Service pauses for 24 hours

**What to do**: Nothing! Just let it auto-resume. If it keeps happening, the rate is already very conservative, so you may need to:
1. Wait longer between attempts
2. Consider if your IP is flagged

## 📚 Full Documentation

See [CONTINUOUS_REFRESH_GUIDE.md](CONTINUOUS_REFRESH_GUIDE.md) for complete details.

## ✅ Next Steps

1. **Now (Day 0)**: Start server with cooldown active
2. **Day 3**: Service auto-starts, begins slow refresh
3. **Day 10**: First full cycle complete
4. **Day 10+**: Runs indefinitely, keeping data fresh

## 🎉 Ready to Deploy!

Start your server and let it run:

```bash
cd /home/zen/Documentos/poketrends
node server.js

# Or with Docker
docker-compose up -d
```

The system will handle everything automatically from here!
