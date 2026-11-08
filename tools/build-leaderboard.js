// Rebuilds leaderboard.json from leaderboard/runs/: replays every run again, keeps each player's best
// per game, and writes the best 100 players. Run by .github/workflows/leaderboard.yml after a merge, or by hand.
const fs = require('fs');
const path = require('path');
const { checkRun, readRuns, ROOT, GAMES } = require('./runs.js');

const OUT = path.join(ROOT, 'leaderboard.json');
const best = Object.fromEntries(GAMES.map(g => [g, new Map()]));

for (const { file, data } of readRuns()) {
  const res = checkRun(data);
  if (!res.ok) { console.warn(`Skipped ${file}: ${res.reason}`); continue; }
  const key = (data.github || res.run.name).toLowerCase();
  const entry = { name: res.run.name, score: res.run.score, github: data.github || null, at: data.at || null };
  const prev = best[res.run.game].get(key);
  if (!prev || entry.score > prev.score || (entry.score === prev.score && String(entry.at) < String(prev.at))) best[res.run.game].set(key, entry);
}

const games = {};
for (const g of GAMES) {
  games[g] = [...best[g].values()]
    .sort((a, b) => b.score - a.score || String(a.at).localeCompare(String(b.at)))
    .slice(0, 100); // the extension reads at most this many (MAX_ROWS in src/background.js)
}

let old = null;
try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* first build */ }
if (old && JSON.stringify(old.games) === JSON.stringify(games)) { console.log('No change.'); process.exit(0); }
fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), games }, null, 2) + '\n');
console.log(GAMES.map(g => `${g}: ${games[g].length}`).join(', '));
