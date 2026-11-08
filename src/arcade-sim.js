/* Pocket Christmas Floor: the arcade's rules.

   Pure and deterministic, so a round can be replayed from its seed and the moves the player made.
   The extension draws it (src/arcade-art.js); tools/runs.js replays it in Node to check a score
   before it reaches the leaderboard.

   The rules use only + - * /, comparisons, Math.floor/abs and Math.imul: no Math.random, no
   Math.sin, no clock. That keeps a replay exact in any JavaScript engine.

   window.pxfArcadeSim = { RULES, HZ, DT, W, H, GROUND, LEN, create, step, encode, decode, replay } */
(function (root) {
  'use strict';

  const RULES = 1;                 // bump when the rules change; old runs keep replaying under their own
  const HZ = 60, DT = 1 / HZ;      // the game always advances in 1/60 s steps
  const W = 240, H = 160;          // the screen, in game pixels
  const GROUND = 146;              // the floor line the cat stands on
  const LEN = 40 * HZ;             // a round lasts 40 seconds
  const LIVES = 3;
  const SPEED = 2.2;               // the cat, px per step (132 px/s)
  const EDGE = 16;                 // how close to the side walls the cat can go
  const CATCH_W = 14;              // half-width of the catch zone around the cat
  const CATCH_TOP = 38, CATCH_H = 22; // the catch zone, measured up from the floor (the cat's head and chest)

  // mulberry32: small, fast, and identical everywhere because it is all 32-bit integer maths.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function create(game, seed) {
    return {
      rules: RULES, game, seed: seed >>> 0, rnd: rng(seed),
      t: 0, x: W / 2, dir: 1, mv: 0,
      items: [], next: 1, spawn: 30,
      score: 0, lives: LIVES, caught: 0, golds: 0,
      over: false, events: []
    };
  }

  // Advances one step. mv: -1 left, 0 still, 1 right. s.events lists what happened this step
  // ('catch', 'hit', 'miss', 'over') so the screen can play sounds and effects.
  function step(s, mv) {
    s.events = [];
    if (s.over) return s;
    mv = mv < 0 ? -1 : mv > 0 ? 1 : 0;
    s.mv = mv;
    if (mv) s.dir = mv;
    s.x = Math.min(W - EDGE, Math.max(EDGE, s.x + mv * SPEED));
    s.t++;
    const hard = s.t / LEN; // 0 → 1 over the round

    if (--s.spawn <= 0) {
      s.spawn = Math.floor(27 + s.rnd() * 27 - hard * 15); // 0.45–0.9 s apart, quicker later
      const bad = s.rnd() < 0.22 + hard * 0.15;
      const gold = !bad && s.rnd() < 0.08;
      s.items.push({
        id: s.next++,
        kind: bad ? 'bad' : gold ? 'gold' : 'good',
        x: 12 + Math.floor(s.rnd() * (W - 24)),
        y: 2,
        vy: 0.7 + s.rnd() * 0.33 + hard * 0.67,
        v: Math.floor(s.rnd() * 4) // which colour or way round to draw it
      });
    }

    for (let i = s.items.length - 1; i >= 0; i--) {
      const it = s.items[i];
      it.y += it.vy;
      if (it.y > GROUND - CATCH_TOP && it.y < GROUND - CATCH_TOP + CATCH_H && Math.abs(it.x - s.x) < CATCH_W) {
        s.items.splice(i, 1);
        if (it.kind === 'bad') { s.lives--; s.events.push({ type: 'hit', it }); }
        else {
          const pts = it.kind === 'gold' ? 3 : 1;
          s.score += pts; s.caught++; if (pts === 3) s.golds++;
          s.events.push({ type: 'catch', it, pts });
        }
        continue;
      }
      if (it.y > GROUND + 2) { s.items.splice(i, 1); s.events.push({ type: 'miss', it }); }
    }

    if (s.t >= LEN || s.lives <= 0) { s.over = true; s.events.push({ type: 'over', out: s.lives <= 0 }); }
    return s;
  }

  // ---------------------------------------------------------------- moves ↔ text
  // Each step's move takes 2 bits (0 still, 1 left, 2 right), packed 4 to a byte, written as
  // base64url. A full 40 s round is always 800 characters, short enough for a link.
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function encode(moves) {
    const bytes = [];
    for (let i = 0; i < moves.length; i += 4) {
      let b = 0;
      for (let j = 0; j < 4; j++) {
        const m = moves[i + j];
        b |= (m < 0 ? 1 : m > 0 ? 2 : 0) << (j * 2);
      }
      bytes.push(b);
    }
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      const chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
      for (let j = 0; j < chars; j++) out += B64[(n >> (18 - j * 6)) & 63];
    }
    return out;
  }
  function decode(text, steps) {
    if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) return null;
    if (!Number.isInteger(steps) || steps < 1 || steps > LEN) return null;
    const bytes = [];
    for (let i = 0; i < text.length; i += 4) {
      const chunk = text.slice(i, i + 4);
      let n = 0;
      for (let j = 0; j < 4; j++) n = (n << 6) | (j < chunk.length ? B64.indexOf(chunk[j]) : 0);
      bytes.push((n >> 16) & 255);
      if (chunk.length > 2) bytes.push((n >> 8) & 255);
      if (chunk.length > 3) bytes.push(n & 255);
    }
    if (bytes.length !== Math.ceil(steps / 4)) return null;
    const moves = new Array(steps);
    for (let i = 0; i < steps; i++) {
      const v = (bytes[i >> 2] >> ((i & 3) * 2)) & 3;
      if (v === 3) return null;
      moves[i] = v === 1 ? -1 : v === 2 ? 1 : 0;
    }
    return moves;
  }

  // Plays a round back. A run is valid only if it ends exactly on its last recorded step.
  function replay(game, seed, text, steps) {
    const moves = decode(text, steps);
    if (!moves) return { ok: false, reason: 'the moves could not be read' };
    const s = create(game, seed);
    for (let i = 0; i < moves.length; i++) {
      if (s.over) return { ok: false, reason: 'the round ended before the moves did' };
      step(s, moves[i]);
    }
    if (!s.over) return { ok: false, reason: 'the round had not finished' };
    return { ok: true, score: s.score, caught: s.caught, golds: s.golds, lives: s.lives, steps: s.t };
  }

  const api = { RULES, HZ, DT, W, H, GROUND, LEN, LIVES, create, step, encode, decode, replay };
  root.pxfArcadeSim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
