/* Pocket Christmas Floor: background worker, for the arcade leaderboard.

   Two jobs: read leaderboard.json from the GitHub repo, and open a pre-filled GitHub issue when a
   player sends a score (any score of 1 or more). A workflow in the repo replays the run from that issue and opens a
   pull request (.github/workflows/score.yml); merging it puts the score on the board.

   Every URL is built here from fixed values and checked fields. Nothing in a message can point the
   worker at another address. */
const REPO = 'iprithvitharun/pocket.design-xmas-floor'; // owner/name on GitHub; '' turns the leaderboard off
const BRANCH = 'main';
const BOARD_URL = REPO ? `https://raw.githubusercontent.com/${REPO}/${BRANCH}/leaderboard.json` : '';
const GAMES = { fish: 'Fish Catcher', gift: 'Gift Catcher' };
const RULES = 1;
const NAME = /^[A-Z0-9][A-Z0-9 ]{0,9}$/;
const MAX_ROWS = 100; // rows per game, as tools/build-leaderboard.js writes them

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

function cleanRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(r => r && typeof r.name === 'string' && NAME.test(r.name.trim()) && isInt(r.score, 0, 9999))
    .slice(0, MAX_ROWS)
    .map(r => ({ name: r.name.trim(), score: r.score }));
}

async function readBoard() {
  if (!BOARD_URL) return { ok: false, reason: 'off' };
  try {
    const res = await fetch(BOARD_URL, { cache: 'no-cache', credentials: 'omit' });
    if (!res.ok) return { ok: false, reason: `http ${res.status}` };
    const data = await res.json();
    const games = {};
    for (const g of Object.keys(GAMES)) games[g] = cleanRows(data && data.games && data.games[g]);
    return { ok: true, games };
  } catch (e) {
    return { ok: false, reason: 'network' };
  }
}

function openIssue(run, tab) {
  if (!REPO || !run) return { ok: false };
  const name = typeof run.name === 'string' ? run.name.trim().toUpperCase() : '';
  const valid = GAMES[run.game] && NAME.test(name) && run.rules === RULES && isInt(run.score, 1, 9999) &&
    isInt(run.seed, 0, 0xffffffff) && isInt(run.steps, 1, 40 * 60) &&
    typeof run.moves === 'string' && /^[A-Za-z0-9_-]{1,800}$/.test(run.moves);
  if (!valid) return { ok: false };
  const data = { v: 1, rules: run.rules, game: run.game, name, score: run.score, seed: run.seed, steps: run.steps, moves: run.moves };
  const title = `Score: ${name} · ${run.score} · ${GAMES[run.game]}`;
  const body = [
    `A ${GAMES[run.game]} score from the Pocket Christmas Floor arcade.`,
    '',
    '**Press Create to send it.** You don\'t need to change anything.',
    '',
    'A bot replays the round from the moves below to check the score, then opens a pull request. Once that\'s merged, your score shows on the arcade\'s leaderboard.',
    '',
    '```json',
    JSON.stringify(data),
    '```'
  ].join('\n');
  const url = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  const opts = { url };
  if (tab && Number.isInteger(tab.index)) { opts.index = tab.index + 1; opts.openerTabId = tab.id; }
  chrome.tabs.create(opts);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || sender.id !== chrome.runtime.id) return false;
  if (msg.type === 'pxf:board') { readBoard().then(reply); return true; }
  if (msg.type === 'pxf:submit') { reply(openIssue(msg.run, sender.tab)); return false; }
  return false;
});
