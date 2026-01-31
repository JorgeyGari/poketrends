#!/bin/bash

# Continuous Refresh Monitor
# Quick status checker for the continuous refresh system

API_BASE="http://localhost:3002"

echo "========================================"
echo "  Continuous Refresh System Monitor"
echo "========================================"
echo ""

# Check if server is running
if ! curl -s "${API_BASE}/health" > /dev/null 2>&1; then
    echo "❌ Server is not running!"
    echo "Start with: node server.js"
    exit 1
fi

echo "✅ Server is running"
echo ""

# Get refresh status
STATUS=$(curl -s "${API_BASE}/admin/refresh/status")

if [ $? -ne 0 ]; then
    echo "❌ Failed to get refresh status"
    exit 1
fi

# Parse status using jq if available
if command -v jq &> /dev/null; then
    echo "📊 Refresh Service Status:"
    echo "-------------------------"
    
    IS_RUNNING=$(echo "$STATUS" | jq -r '.isRunning')
    IS_PAUSED=$(echo "$STATUS" | jq -r '.isPaused')
    
    if [ "$IS_RUNNING" = "true" ]; then
        echo "🟢 Running: Yes"
    else
        echo "🔴 Running: No"
    fi
    
    if [ "$IS_PAUSED" = "true" ]; then
        echo "⏸️  Paused: Yes"
    else
        echo "▶️  Paused: No"
    fi
    
    echo ""
    echo "📈 Statistics:"
    echo "-------------"
    echo "$STATUS" | jq -r '.stats | 
        "  Last Run: \(.lastRun // "Never")
  Current Pokémon: \(.currentPokemon // "None")
  Success Count: \(.successCount)
  Failure Count: \(.failureCount)
  Blocked Count: \(.blockedCount)
  Cycle Progress: \(.cycleProgress)%"'
    
    echo ""
    
    HAS_ETA=$(echo "$STATUS" | jq -r '.estimatedCompletion')
    if [ "$HAS_ETA" != "null" ]; then
        echo "⏱️  Estimated Completion:"
        echo "------------------------"
        echo "$STATUS" | jq -r '.estimatedCompletion | 
            "  Hours Remaining: \(.hoursRemaining)
  Days Remaining: \(.daysRemaining)
  Completion Date: \(.completionDate)"'
    else
        echo "⏱️  No ETA available (service not started or just started)"
    fi
else
    # Fallback if jq is not available
    echo "📊 Raw Status (install jq for better formatting):"
    echo "$STATUS" | python3 -m json.tool 2>/dev/null || echo "$STATUS"
fi

echo ""
echo "========================================"
echo "  Commands:"
echo "========================================"
echo "  Start:   curl -X POST ${API_BASE}/admin/refresh/start"
echo "  Stop:    curl -X POST ${API_BASE}/admin/refresh/stop"
echo "  Pause:   curl -X POST ${API_BASE}/admin/refresh/pause"
echo "  Resume:  curl -X POST ${API_BASE}/admin/refresh/resume"
echo "  Status:  curl ${API_BASE}/admin/refresh/status | jq"
echo ""
