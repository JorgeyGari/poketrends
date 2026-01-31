#!/usr/bin/env node
// Diagnose why Mewtwo scores higher than Pikachu

const TRENDS_URL = 'http://localhost:3002/trends';

async function diagnose(name, id) {
  const url = `${TRENDS_URL}?pokemonName=${encodeURIComponent(name)}&countryCode=US&pokemonId=${id}`;
  const res = await fetch(url);
  const data = await res.json();
  
  console.log(`\n=== ${name.toUpperCase()} (ID ${id}) ===`);
  console.log(`Score (weighted):    ${data.score}`);
  console.log(`Avg Score (simple):  ${data.avgScore}`);
  console.log(`Max Score (peak):    ${data.maxScore}`);
  console.log(`Recent Avg:          ${data.recentAvg ?? 'N/A'}`);
  console.log(`Estimated Searches:  ${data.estimatedSearches?.toLocaleString() ?? 'N/A'}`);
  console.log(`Used Topic (Entity): ${data.usedTopic ? 'YES' : 'NO'}`);
  console.log(`Topic ID:            ${data.topicId ?? 'none'}`);
  console.log(`Fallback Used:       ${data.fallback ? 'YES ⚠️' : 'NO'}`);
  console.log(`Cached:              ${data.cached ? 'YES' : 'NO'}`);
  
  if (data.timelineValues && data.timelineValues.length > 0) {
    const vals = data.timelineValues;
    const sum = vals.reduce((a,b) => a+b, 0);
    const avg = (sum / vals.length).toFixed(2);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const last5 = vals.slice(-5);
    console.log(`Timeline: ${vals.length} points, avg=${avg}, max=${max}, min=${min}`);
    console.log(`Last 5 weeks: [${last5.join(', ')}]`);
    
    // Verify weighted calc
    const recent = vals.slice(-30);
    const recentAvg = recent.reduce((a,b)=>a+b,0) / recent.length;
    const calculated = (parseFloat(avg) * 0.85) + (max * 0.10) + (recentAvg * 0.05);
    console.log(`\nWeighted formula check:`);
    console.log(`  (${avg} * 0.85) + (${max} * 0.10) + (${recentAvg.toFixed(2)} * 0.05) = ${calculated.toFixed(2)}`);
    console.log(`  Backend returned: ${data.score}`);
    console.log(`  Match: ${Math.abs(calculated - data.score) < 0.1 ? '✓' : '✗ MISMATCH'}`);
  } else {
    console.log('⚠️  No timeline data available');
  }
  
  return data;
}

async function main() {
  console.log('Diagnosing Pikachu vs Mewtwo scoring discrepancy...\n');
  
  const pikachu = await diagnose('pikachu', 25);
  const mewtwo = await diagnose('mewtwo', 150);
  
  console.log('\n\n=== COMPARISON ===');
  console.log(`Pikachu score: ${pikachu.score} (fallback: ${pikachu.fallback})`);
  console.log(`Mewtwo score:  ${mewtwo.score} (fallback: ${mewtwo.fallback})`);
  console.log(`\nExpected (based on Google Trends): Pikachu > Mewtwo`);
  console.log(`Actual result: ${pikachu.score > mewtwo.score ? 'Pikachu > Mewtwo ✓' : 'Mewtwo > Pikachu ✗ WRONG'}`);
  
  if (pikachu.fallback || mewtwo.fallback) {
    console.log('\n⚠️  One or both are using FALLBACK scores (not real Google Trends data)');
    console.log('   This likely explains the inversion. Try restarting the server or checking API connectivity.');
  }
  
  if (pikachu.cached || mewtwo.cached) {
    console.log('\n⚠️  One or both are CACHED (may be stale data from 24h ago)');
    console.log('   Restart server to clear cache.');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
