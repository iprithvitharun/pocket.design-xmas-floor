// Shared by the leaderboard tools: checks a submitted run by replaying it with the game's own rules.
const fs = require('fs');
const path = require('path');
const SIM = require('../src/arcade-sim.js');

const ROOT = path.join(__dirname, '..');
const RUNS_DIR = path.join(ROOT, 'leaderboard', 'runs');
const GAMES = ['fish', 'gift'];
const NAME = /^[A-Z0-9][A-Z0-9 ]{0,9}$/;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

function checkRun(r) {
  const bad = reason => ({ ok: false, reason });
  if (!r || typeof r !== 'object') return bad('the score block is empty');
  if (r.v !== 1) return bad('the score block is from an unknown version');
  if (r.rules !== SIM.RULES) return bad(`the run uses rules v${r.rules}, but the arcade is on v${SIM.RULES}`);
  if (!GAMES.includes(r.game)) return bad('the game should be fish or gift');
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!NAME.test(name)) return bad('the name should be 1–10 capital letters, digits or spaces');
  if (!isInt(r.score, 0, 9999)) return bad('the score should be a whole number');
  if (r.score < 1) return bad('a round needs at least 1 point to go on the board');
  if (!isInt(r.seed, 0, 0xffffffff)) return bad('the seed is out of range');
  if (!isInt(r.steps, 1, SIM.LEN)) return bad('the round length is out of range');
  if (typeof r.moves !== 'string') return bad('the moves are missing');
  const rep = SIM.replay(r.game, r.seed, r.moves, r.steps);
  if (!rep.ok) return bad(`the replay failed: ${rep.reason}`);
  if (rep.score !== r.score) return bad(`the replay scores ${rep.score}, not ${r.score}`);
  return { ok: true, run: { v: 1, rules: r.rules, game: r.game, name, score: r.score, seed: r.seed, steps: r.steps, moves: r.moves }, replay: rep };
}

function readRuns() {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs.readdirSync(RUNS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => {
      try { return { file: f, data: JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f), 'utf8')) }; }
      catch (e) { return { file: f, data: null }; }
    });
}

module.exports = { checkRun, readRuns, RUNS_DIR, ROOT, GAMES };
