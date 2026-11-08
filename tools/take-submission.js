// Run by .github/workflows/score.yml when someone opens a "Score:" issue.
// Reads the issue from env (BODY, ISSUE, AUTHOR), replays the run, and if it checks out writes it to
// leaderboard/runs/. Tells the workflow what happened through $GITHUB_OUTPUT: ok, file, title, message.
const fs = require('fs');
const path = require('path');
const { checkRun, readRuns, RUNS_DIR, ROOT } = require('./runs.js');

const GAME_NAMES = { fish: 'Fish Catcher', gift: 'Gift Catcher' };
const body = process.env.BODY || '';
const issue = Number.parseInt(process.env.ISSUE, 10);
const author = /^[A-Za-z0-9-]{1,39}$/.test(process.env.AUTHOR || '') ? process.env.AUTHOR : null;

function output(values) {
  const lines = Object.entries(values).map(([k, v]) => {
    const text = String(v);
    const tag = `EOF_${Math.random().toString(36).slice(2)}`;
    return text.includes('\n') ? `${k}<<${tag}\n${text}\n${tag}` : `${k}=${text}`;
  });
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  else console.log(lines.join('\n'));
}

function reject(reason) {
  output({ ok: 'false', message: `Thanks for playing! This score couldn't be added: ${reason}.\n\nSend a new one from the arcade and it'll be checked again.` });
  process.exit(0);
}

if (!Number.isInteger(issue) || issue < 1) reject('the issue number is missing');
const block = body.match(/```json\s*([\s\S]*?)```/);
if (!block) reject("there's no score block in the issue");
let run;
try { run = JSON.parse(block[1]); } catch (e) { reject("the score block isn't valid JSON"); }

const res = checkRun(run);
if (!res.ok) reject(res.reason);
const runs = readRuns();
if (runs.some(r => r.data && r.data.seed === res.run.seed && r.data.game === res.run.game)) reject('this round has already been sent');

// The board keeps each player's best (by GitHub account, as tools/build-leaderboard.js does), so a
// round that doesn't beat it gets a reply instead of a pull request to review.
const label = GAME_NAMES[res.run.game];
const who = (author || res.run.name).toLowerCase();
let best = 0;
for (const { data } of runs) {
  if (!data || data.game !== res.run.game || (data.github || data.name || '').toLowerCase() !== who) continue;
  const old = checkRun(data);
  if (old.ok && old.run.score > best) best = old.run.score;
}
if (best && res.run.score <= best) {
  output({ ok: 'false', message: `Thanks for playing! The round checks out (${res.run.score}), but your best ${label} score on the board is already **${best}**, so this one wouldn't change it. Beat ${best} and send that one.` });
  process.exit(0);
}

const file = path.join(RUNS_DIR, `${res.run.game}-${issue}.json`);
fs.mkdirSync(RUNS_DIR, { recursive: true });
fs.writeFileSync(file, JSON.stringify({ ...res.run, github: author, issue, at: new Date().toISOString() }, null, 2) + '\n');

output({
  ok: 'true',
  file: path.relative(ROOT, file),
  title: `Score: ${res.run.name} · ${res.run.score} · ${label}`,
  message: `Checked: the round replays to **${res.run.score}** (${res.replay.caught} caught, ${res.replay.golds} gold). A pull request is open, and the score goes on the leaderboard once it's merged.`
});
