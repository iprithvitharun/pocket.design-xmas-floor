/* Pocket Christmas Floor: arcade art.

   The whole cabinet (marquee, bezel, screen, control panel) is one small canvas drawn at one canvas
   pixel per art pixel. The page scales it up by a whole number of device pixels with
   image-rendering: pixelated, so every pixel in the game, the text and the cat is the same size.

   Everything here is drawn from code: a 5×7 pixel font, sprites from text maps, the cucumber
   rasterised at 8 angles, and two scenes (rooftops for Fish Catcher, snowy pines for Gift Catcher).
   The cat is the same rig the office cat uses (src/catsprite.js), drawn 1:1.

   window.pxfArcadeArt = { CAB, render, text, measure } */
(function (root) {
  'use strict';

  const SIM = root.pxfArcadeSim;
  const SW = SIM.W, SH = SIM.H, GROUND = SIM.GROUND, HUD_H = 12;
  // Cabinet layout, in art pixels. exit is the drawn EXIT button, where the page puts a real <button>.
  const CAB = { W: 276, H: 250, SX: 18, SY: 44, exit: { x: 222, y: 218, w: 30, h: 29 } };
  const TITLES = { fish: 'FISH CATCHER', gift: 'GIFT CATCHER' };
  const MARQUEE = { fish: 'FLOOR 1 ARCADE', gift: 'FLOOR 2 ARCADE' };

  const cache = new Map();
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const px = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  function prng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
  function oval(c, cx, cy, rx, ry, col) {
    c.fillStyle = col;
    for (let dy = -ry; dy <= ry; dy++) {
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)));
      c.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
    }
  }
  // A rectangle with its four corner pixels cut, the pixel-art way of rounding a corner.
  function rrect(c, x, y, w, h, col) { px(c, x + 1, y, w - 2, h, col); px(c, x, y + 1, w, h - 2, col); }

  const PAL = {
    fish: {
      hud: '#0b0716', hudLine: '#2a1f48', ink: '#fff6e0', gold: '#ffd27a', muted: '#a397d0', red: '#ff6b6b', green: '#8de07b',
      panel: 'rgba(11, 7, 24, 0.86)', edge: '#6a4f9a', field: '#05030a', title: '#ffd27a', shadow: '#a0461c', bar: '#8de07b', puff: '#c8a07a',
      line: '#12081a', body: '#4a2160', light: '#7d3f99', dark: '#2b123a', deck: '#3d1a50', deckTop: '#9c58b8',
      bezel: '#0e0814', bezelEdge: '#2a1a36', sign: '#2a0f33', signGlow: '#3d1747', signInk: '#ffd27a', signShadow: '#a0461c',
      label: '#d9b8ea', door: '#1a1020', bulbs: ['#ffe7a3', '#ffd27a'], bulbOff: '#5a3a3a'
    },
    gift: {
      hud: '#08112a', hudLine: '#1e3566', ink: '#f4f8ff', gold: '#ffd27a', muted: '#a6b9de', red: '#ff6b6b', green: '#8de07b',
      panel: 'rgba(6, 12, 32, 0.86)', edge: '#4f6fa8', field: '#030714', title: '#ffffff', shadow: '#c8382e', bar: '#8de07b', puff: '#ffffff',
      line: '#07130d', body: '#1f4d3a', light: '#3b7a5c', dark: '#123326', deck: '#183d2e', deckTop: '#5fa07f',
      bezel: '#08100c', bezelEdge: '#1d3328', sign: '#7d1d22', signGlow: '#922a2c', signInk: '#ffffff', signShadow: '#3a0a0e',
      label: '#cfe8da', door: '#0e1f17', bulbs: ['#ff5a4a', '#5fd07a', '#ffd27a', '#6aa8ff'], bulbOff: '#3a2a2a'
    }
  };

  // ---------------------------------------------------------------- font
  // 5×7, rows top to bottom, '#' = ink. Narrow glyphs are narrower; digits are all 5 wide.
  const FONT = {
    A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.',
    C: '.###.|#...#|#....|#....|#....|#...#|.###.', D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
    E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
    G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
    I: '###|.#.|.#.|.#.|.#.|.#.|###', J: '..###|...#.|...#.|...#.|#..#.|#..#.|.##..',
    K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
    M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
    O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.', P: '####.|#...#|#...#|####.|#....|#....|#....',
    Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
    U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
    W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
    0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
    2: '.###.|#...#|....#|...#.|..#..|.#...|#####', 3: '#####|...#.|..#..|...#.|....#|#...#|.###.',
    4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
    6: '..##.|.#...|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
    8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.', 9: '.###.|#...#|#...#|.####|....#|...#.|.##..',
    ' ': '...|...|...|...|...|...|...', '.': '.|.|.|.|.|.|#', ',': '..|..|..|..|..|.#|#.',
    ':': '.|.|#|.|.|#|.', '!': '#|#|#|#|#|.|#', "'": '#|#|.|.|.|.|.', '-': '....|....|....|####|....|....|....',
    '+': '.....|..#..|..#..|#####|..#..|..#..|.....', '/': '....#|....#|...#.|..#..|.#...|#....|#....',
    '?': '.###.|#...#|....#|...#.|..#..|.....|..#..', '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.',
    '(': '..#|.#.|#..|#..|#..|.#.|..#', ')': '#..|.#.|..#|..#|..#|.#.|#..', '_': '.....|.....|.....|.....|.....|.....|#####',
    '←': '.....|..#..|.#...|#####|.#...|..#..|.....', '→': '.....|..#..|...#.|#####|...#.|..#..|.....',
    '·': '.|.|.|#|.|.|.'
  };
  const GLYPH = {};
  for (const k of Object.keys(FONT)) GLYPH[k] = FONT[k].split('|');
  const glyph = ch => GLYPH[ch] || GLYPH['?'];

  function measure(str, s = 1) {
    let w = 0;
    for (const ch of String(str).toUpperCase()) w += glyph(ch)[0].length + 1;
    return Math.max(0, w - 1) * s;
  }
  // Draws pixel text; returns its width. o: { scale, align: 'left'|'center'|'right', shadow }.
  function text(c, str, x, y, col, o = {}) {
    const s = o.scale || 1;
    str = String(str).toUpperCase();
    const w = measure(str, s);
    if (o.align === 'center') x -= Math.floor(w / 2); else if (o.align === 'right') x -= w;
    x = Math.round(x); y = Math.round(y);
    const ink = (colr, x0, y0) => {
      c.fillStyle = colr;
      let cx = x0;
      for (const ch of str) {
        const g = glyph(ch);
        for (let r = 0; r < 7; r++) {
          const row = g[r];
          for (let i = 0; i < row.length; i++) if (row[i] === '#') c.fillRect(cx + i * s, y0 + r * s, s, s);
        }
        cx += (g[0].length + 1) * s;
      }
    };
    if (o.shadow) ink(o.shadow, x + s, y + s);
    ink(col, x, y);
    return w;
  }

  // ---------------------------------------------------------------- sprites
  function sprite(key, rows, pal, flip) {
    const id = key + (flip ? '<' : '>');
    let c = cache.get(id);
    if (c) return c;
    const h = rows.length, w = rows[0].length;
    c = mk(w, h);
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = rows[y][flip ? w - 1 - x : x];
        if (k !== '.' && pal[k]) { g.fillStyle = pal[k]; g.fillRect(x, y, 1, 1); }
      }
    }
    cache.set(id, c);
    return c;
  }

  // A fish, nose to the right: F fin, L lit back, B body, D gill, E eye, W belly, T tail.
  const FISH = [
    '......ooo.....',
    '.....oFFFo....',
    'oo..oLLLLLLoo.',
    'oTooBBBBBDBEBo',
    'oTTBBBBBBDBBBo',
    'oTooWWWWWDWWo.',
    'oo..oWWWWWoo..',
    '.....ooooo....'
  ];
  const FISH_FLICK = FISH.map((r, i) => (i === 2 || i === 6 ? '.' + r.slice(1) : r)); // tail mid-swish
  const FISH_PAL = [
    { o: '#1b2440', B: '#5d9ad8', L: '#9cc8f2', D: '#3c6aa6', W: '#e3f0fb', F: '#3c6aa6', T: '#4a7fc0', E: '#10121c' },
    { o: '#1b2440', B: '#5d9ad8', L: '#9cc8f2', D: '#3c6aa6', W: '#e3f0fb', F: '#3c6aa6', T: '#4a7fc0', E: '#10121c' },
    { o: '#3a1a10', B: '#ec8a3c', L: '#f8b979', D: '#c2582a', W: '#fde3c4', F: '#c2582a', T: '#d86d30', E: '#10121c' },
    { o: '#11302c', B: '#3fb3a0', L: '#86dccd', D: '#24806f', W: '#dff6f1', F: '#24806f', T: '#2f9886', E: '#10121c' }
  ];
  const FISH_GOLD = { o: '#4a2e08', B: '#f2c443', L: '#fff0a0', D: '#c9901c', W: '#fff8d8', F: '#c9901c', T: '#e0aa2a', E: '#3a2410' };
  const fishSprite = (v, frame, flip) =>
    sprite(`fish${v}${frame}`, frame ? FISH_FLICK : FISH, v === 'gold' ? FISH_GOLD : FISH_PAL[v & 3], flip);

  // A present: R ribbon, r ribbon shade, L lid light, B box, D box shade, S base.
  const GIFT = [
    '.ooo...ooo.',
    'oRoRo.oRoRo',
    'oRRRRoRRRRo',
    'oooooRooooo',
    'oLLLLRLLLLo',
    'oBBBBRBBBDo',
    'oRRRRRRRRRo',
    'orrrrRrrrro',
    'oBBBBRBBBDo',
    'oSSSSrSSSSo',
    '.ooooooooo.'
  ];
  const GIFT_PAL = [
    { o: '#2a1418', B: '#c8482f', L: '#e2715a', D: '#9a3222', S: '#86291c', R: '#ffd27a', r: '#d8a443' },
    { o: '#0f2418', B: '#2f7d55', L: '#4fa274', D: '#215d3e', S: '#1b4d33', R: '#f4f1e6', r: '#cfc8b3' },
    { o: '#121a33', B: '#3f6fc4', L: '#6a93dc', D: '#2d5299', S: '#244383', R: '#ffd27a', r: '#d8a443' },
    { o: '#24102a', B: '#8a3f8f', L: '#ad62b0', D: '#6a2c70', S: '#5a2560', R: '#f4f1e6', r: '#cfc8b3' }
  ];
  const GIFT_GOLD = { o: '#4a2e08', B: '#f2c14e', L: '#ffe28a', D: '#c9952b', S: '#a87a1e', R: '#c8482f', r: '#962f1f' };
  const giftSprite = v => sprite(`gift${v}`, GIFT, v === 'gold' ? GIFT_GOLD : GIFT_PAL[v & 3]);

  const COAL = [
    '..ooo....',
    '.oKKKoo..',
    'oKHKKKKo.',
    'oKKKSKKKo',
    'oKKKKKHKo',
    'oKSKKKKKo',
    '.oKKKKKo.',
    '..ooooo..'
  ];
  const COAL_PAL = { o: '#0c0a10', K: '#2f2a37', H: '#7a7388', S: '#4b4556' };
  const coalSprite = flip => sprite('coal', COAL, COAL_PAL, flip);

  const HEART = ['.XX.XX.', 'XLRXRRX', 'XRRRRRX', '.XRRRX.', '..XRX..', '...X...'];
  const heart = full => sprite(full ? 'heart1' : 'heart0', HEART,
    full ? { X: '#2a0f14', R: '#e0435a', L: '#ff9aa8' } : { X: '#2a0f14', R: '#4a2a3a', L: '#5a3a4a' });

  const BALL = ['..ooo..', '.oRRRo.', 'oRLLRRo', 'oRLRRDo', 'oRRRDDo', '.oDDDo.', '..ooo..'];
  const BUTTON = ['..ooooooo..', '.oLLLLRRRo.', 'oLLRRRRRRRo', 'oRRRRRRRRDo', '.oRRRRRRDo.', '..ooooooo..'];

  const SPARKLE = [
    ['.....', '.....', '..#..', '.....', '.....'],
    ['.....', '..#..', '.###.', '..#..', '.....'],
    ['..#..', '..#..', '##.##', '..#..', '..#..']
  ];
  function sparkle(c, x, y, f, col) {
    const rows = SPARKLE[f];
    c.fillStyle = col;
    for (let r = 0; r < 5; r++) for (let i = 0; i < 5; i++) if (rows[r][i] === '#') c.fillRect(x - 2 + i, y - 2 + r, 1, 1);
  }

  // The cucumber is drawn at 8 angles from a capsule, lit from the top left whichever way it faces.
  function cucumber(frame) {
    frame &= 7;
    const id = 'cuc' + frame;
    let c = cache.get(id);
    if (c) return c;
    const N = 17, C = 8, L = 6.4, R = 2.6;
    const a = (frame * 45 + 90) * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
    const lit = nx * -0.6 + ny * -0.8 >= 0 ? 1 : -1;
    const cell = [];
    for (let y = 0; y < N; y++) {
      cell.push([]);
      for (let x = 0; x < N; x++) {
        const dx = x - C, dy = y - C;
        const u = dx * ca + dy * sa, v = dx * nx + dy * ny;
        const au = Math.abs(u), cap = L - R;
        const inside = au <= cap ? Math.abs(v) <= R : au <= L && (au - cap) ** 2 + v * v <= R * R;
        let col = null;
        if (inside) {
          const sv = v * lit;
          if (u > L - 1.3) col = '#c8c46a';
          else if (sv > 1.1) col = '#94d36c';
          else if (sv < -1.0) col = '#2c6428';
          else col = (Math.round(u) + 30) % 3 === 0 && Math.round(sv) === 0 ? '#2f6e2b' : '#4f9a3f';
        }
        cell[y].push(col);
      }
    }
    c = mk(N, N);
    const g = c.getContext('2d');
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let col = cell[y][x];
        if (!col && ((cell[y - 1] && cell[y - 1][x]) || (cell[y + 1] && cell[y + 1][x]) || cell[y][x - 1] || cell[y][x + 1])) col = '#13301a';
        if (col) px(g, x, y, 1, 1, col);
      }
    }
    cache.set(id, c);
    return c;
  }

  // ---------------------------------------------------------------- scenes
  function bands(g, cols, y0, y1) {
    const n = cols.length, step = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      const a = Math.round(y0 + i * step), b = Math.round(y0 + (i + 1) * step);
      px(g, 0, a, SW, b - a, cols[i]);
      if (i > 0) { // a two-row dither so the bands blend without a smooth gradient
        g.fillStyle = cols[i - 1];
        for (let x = 0; x < SW; x++) { if ((x & 1) === 0) g.fillRect(x, a, 1, 1); if ((x & 3) === 1) g.fillRect(x, a + 1, 1, 1); }
      }
    }
  }
  function moon(g, cx, cy, r, col, shade, crater, glow) {
    for (let y = -r - 3; y <= r + 3; y++) {
      for (let x = -r - 3; x <= r + 3; x++) {
        const d2 = x * x + y * y;
        if (d2 <= r * r) px(g, cx + x, cy + y, 1, 1, (x + 2) ** 2 + (y + 2) ** 2 > r * r ? shade : col);
        else if (d2 <= (r + 3) ** 2 && ((x + y) & 1) === 0) px(g, cx + x, cy + y, 1, 1, glow);
      }
    }
    px(g, cx - 4, cy + 1, 2, 2, crater); px(g, cx + 1, cy - 4, 2, 1, crater); px(g, cx + 1, cy + 3, 1, 1, crater); px(g, cx - 1, cy - 1, 1, 1, crater);
  }
  function starsFor(seed, n, yMax, mx, my) {
    const r = prng(seed), out = [];
    while (out.length < n) {
      const s = { x: Math.floor(r() * SW), y: 15 + Math.floor(r() * (yMax - 15)), p: r(), big: r() < 0.14 };
      if (Math.hypot(s.x - mx, s.y - my) > 15) out.push(s);
    }
    return out;
  }
  function skyline(g, r, base, minH, maxH, col, winCol, litRate) {
    const wins = [];
    let x = -4;
    while (x < SW) {
      const w = 12 + Math.floor(r() * 16), h = minH + Math.floor(r() * (maxH - minH)), top = base - h;
      px(g, x, top, w, h, col);
      const roof = r();
      if (roof < 0.25) px(g, x + (w >> 1), top - 5, 1, 5, col);
      else if (roof < 0.45) px(g, x + 2, top - 3, w - 4, 3, col);
      for (let wy = top + 3; wy < base - 3; wy += 4) {
        for (let wx = x + 2; wx < x + w - 2; wx += 3) {
          const q = r();
          if (q < litRate) wins.push([wx, wy]);
          else if (q < litRate + 0.22) px(g, wx, wy, 1, 2, winCol);
        }
      }
      x += w + (r() < 0.3 ? 2 : 0);
    }
    return wins;
  }
  function pine(g, x, base, h) {
    px(g, x - 1, base - 3, 2, 3, '#3b2a22');
    for (let t = 0; t < 3; t++) {
      const top = base - h + Math.round(t * h * 0.24), th = Math.round(h * 0.42), wide = Math.round(h * 0.2) + t * 2;
      for (let r = 0; r < th; r++) {
        const half = Math.max(0, Math.round((r / th) * wide));
        const y = top + r;
        if (y > base - 3) break;
        px(g, x - half, y, half + 1, 1, '#14324d');
        px(g, x + 1, y, half, 1, '#0d2438');
        if (r === th - 1 || r === 0) px(g, x - half, y, Math.max(1, half), 1, '#e3ecf8');
      }
    }
  }

  function scene(game) {
    const id = 'scene:' + game;
    let sc = cache.get(id);
    if (sc) return sc;
    const cv = mk(SW, SH), g = cv.getContext('2d');
    sc = { canvas: cv };
    if (game === 'gift') {
      bands(g, ['#0b1430', '#101d40', '#162851', '#1d3462'], HUD_H, GROUND);
      moon(g, 26, 36, 9, '#f2f5ff', '#c9d4ec', '#d8e0f2', '#1f3463');
      for (let x = 0; x < SW; x++) {
        const h1 = Math.round(116 + 6 * Math.sin(x / 23) + 4 * Math.sin(x / 9 + 1));
        px(g, x, h1, 1, GROUND - h1, '#253d70'); px(g, x, h1, 1, 1, '#c6d6ee');
        const h2 = Math.round(129 + 5 * Math.sin(x / 17 + 2) + 3 * Math.sin(x / 7));
        px(g, x, h2, 1, GROUND - h2, '#1b2f5a'); px(g, x, h2, 1, 1, '#e2ebf7');
      }
      [[12, 24], [64, 18], [80, 30], [150, 22], [172, 34], [212, 20], [230, 27]].forEach(([x, h]) => pine(g, x, GROUND + 1, h));
      // a cabin with a lit window
      px(g, 28, 128, 22, 18, '#6b4434');
      for (let y = 131; y < 146; y += 3) px(g, 28, y, 22, 1, '#55352a');
      px(g, 33, 133, 6, 5, '#ffcf6e'); px(g, 35, 133, 1, 5, '#6b4434'); px(g, 33, 135, 6, 1, '#6b4434');
      px(g, 42, 137, 4, 9, '#3a241c');
      px(g, 44, 113, 4, 10, '#5a3a30'); px(g, 43, 112, 6, 2, '#eef4fb');
      for (let r = 0; r < 12; r++) { px(g, 39 - r - 2, 116 + r, (r + 2) * 2 + 1, 1, r < 4 ? '#eef4fb' : '#7a2a2a'); px(g, 39 - r - 2, 116 + r, 1, 1, '#eef4fb'); }
      px(g, 24, 127, 31, 1, '#dfe9f5');
      // snow on the ground
      px(g, 0, GROUND, SW, SH - GROUND, '#e9f1fa');
      px(g, 0, GROUND, SW, 1, '#ffffff');
      for (let x = 0; x < SW; x++) {
        if (Math.sin(x / 6) + 0.5 * Math.sin(x / 2.3) > 1.05) px(g, x, GROUND - 1, 1, 1, '#ffffff');
        if (((x * 7) % 11) < 4) px(g, x, SH - 4, 1, 1, '#d4e0ee');
      }
      px(g, 0, SH - 3, SW, 3, '#d4e0ee');
      const r = prng(5);
      for (let i = 0; i < 24; i++) px(g, Math.floor(r() * SW), GROUND + 3 + Math.floor(r() * 9), 1, 1, r() < 0.5 ? '#c6d6ea' : '#ffffff');
      sc.stars = starsFor(11, 18, 96, 26, 36);
      const fr = prng(23);
      sc.flakes = Array.from({ length: 48 }, () => ({ x: fr() * SW, y: fr() * SH, s: fr() < 0.25 ? 2 : 1, sp: 8 + fr() * 14, ph: fr() * 6.28 }));
    } else {
      bands(g, ['#140f26', '#1b1532', '#241b40', '#2d214e'], HUD_H, GROUND);
      moon(g, 26, 36, 9, '#fff1c9', '#e9d49a', '#e3cc8e', '#2c2450');
      const r = prng(3);
      skyline(g, r, GROUND, 30, 48, '#261d44', '#33295a', 0);
      sc.windows = skyline(g, r, GROUND, 12, 30, '#18122c', '#241c3c', 0.12);
      // a water tank on the roofline
      px(g, 166, 106, 1, 8, '#18122c'); px(g, 175, 106, 1, 8, '#18122c'); rrect(g, 164, 96, 14, 11, '#18122c'); px(g, 165, 95, 12, 1, '#18122c');
      // the parapet the cat walks along
      px(g, 0, GROUND, SW, SH - GROUND, '#5e3726');
      px(g, 0, GROUND, SW, 1, '#b07a4f');
      px(g, 0, GROUND + 1, SW, 2, '#8a5636');
      px(g, 0, GROUND + 3, SW, 1, '#3b2116');
      for (let row = 0, y = GROUND + 4; y < SH; row++, y += 4) {
        px(g, 0, y + 3, SW, 1, '#46281b');
        for (let x = (row & 1) * 5; x < SW; x += 10) { px(g, x, y, 1, 3, '#46281b'); px(g, x + 2, y, 3, 1, '#6e4230'); }
      }
      sc.stars = starsFor(7, 40, 100, 26, 36);
    }
    cache.set(id, sc);
    return sc;
  }

  function sceneLive(c, v, sc, P) {
    for (const s of sc.stars) {
      const ph = (v.t * 1.4 + s.p * 10) % 10;
      if (s.big) { if (ph < 3) sparkle(c, s.x, s.y, ph < 1 ? 2 : ph < 2 ? 1 : 0, v.game === 'gift' ? '#e8f0ff' : '#fff3c4'); else px(c, s.x, s.y, 1, 1, '#8f86c9'); }
      else px(c, s.x, s.y, 1, 1, ph < 1.2 ? (v.game === 'gift' ? '#3a5280' : '#5a4f90') : s.p > 0.5 ? '#fff3c4' : '#b8b0e8');
    }
    if (v.game === 'gift') {
      for (let i = 0; i < 4; i++) { // chimney smoke
        const a = (v.t * 0.5 + i / 4) % 1;
        c.fillStyle = `rgba(220, 230, 245, ${(0.55 * (1 - a)).toFixed(3)})`;
        const sz = a < 0.5 ? 2 : 3;
        c.fillRect(Math.round(46 + a * 9 + Math.sin(v.t * 2 + i) * 1.2), Math.round(110 - a * 24), sz, sz);
      }
      for (const f of sc.flakes) {
        const y = 13 + ((f.y + v.t * f.sp) % (GROUND - 13));
        const x = ((f.x + Math.sin(v.t * 0.9 + f.ph) * 3) % SW + SW) % SW;
        px(c, Math.round(x), Math.round(y), f.s, f.s, f.s === 2 ? '#dfe9f7' : '#ffffff');
      }
      // a string of lights under the top bar
      let bulb = 0;
      for (let s0 = 0; s0 < SW; s0 += 60) {
        for (let x = s0; x < s0 + 60; x++) {
          const y = 14 + Math.round(4 * Math.sin((Math.PI * (x - s0)) / 60));
          px(c, x, y, 1, 1, '#1f2a22');
          if ((x - s0) % 12 === 6) {
            const on = (bulb + Math.floor(v.t * 3)) % 5 !== 0;
            px(c, x, y + 1, 1, 1, '#1f2a22');
            px(c, x - 1, y + 2, 2, 2, on ? P.bulbs[bulb % P.bulbs.length] : '#3a3a48');
            bulb++;
          }
        }
      }
    } else {
      sc.windows.forEach(([x, y], i) => {
        if ((i * 5 + Math.floor(v.t / 2.5)) % 17 === 0) return; // someone switches a light off for a bit
        px(c, x, y, 1, 2, i % 3 ? '#ffcf6e' : '#f7a64b');
      });
    }
  }

  // ---------------------------------------------------------------- the round
  function itemSprite(v, it) {
    if (v.game === 'gift') {
      if (it.kind === 'bad') return coalSprite(Math.floor(v.t * 4 + it.id) % 2 === 1);
      return giftSprite(it.kind === 'gold' ? 'gold' : it.v);
    }
    if (it.kind === 'bad') { const f = Math.floor(v.t * 6 + it.id * 3); return cucumber(it.v & 1 ? f : -f & 7); }
    return fishSprite(it.kind === 'gold' ? 'gold' : it.v, Math.floor(v.t * 6 + it.id) % 2, (it.v & 1) === 1);
  }
  function items(c, v) {
    if (!v.sim) return;
    c.save();
    c.beginPath(); c.rect(0, 0, SW, GROUND + 1); c.clip(); // anything that misses drops behind the ledge
    for (const it of v.sim.items) {
      const s = itemSprite(v, it);
      const x = Math.round(it.x - s.width / 2), y = Math.round(it.y - s.height / 2);
      c.drawImage(s, x, y);
      if (it.kind === 'gold') {
        const f = Math.floor(v.t * 8 + it.id) % 6;
        const spot = [[s.width + 1, -1], [-2, 2], [s.width - 2, s.height + 1]][Math.floor(v.t * 1.3 + it.id) % 3];
        if (f < 3) sparkle(c, x + spot[0], y + spot[1], f === 1 ? 2 : f === 0 ? 1 : 0, '#fff8d0');
      }
    }
    c.restore();
  }
  function cat(c, v) {
    if (!root.drawCatRig) return;
    const k = v.cat;
    root.drawCatRig(c, Math.round(k.x), GROUND + 1, {
      dir: k.dir, walk: k.walk, phase: k.phase, idle: k.idle, time: v.t, hat: v.game === 'gift', coat: v.coat, hop: k.hop
    });
  }
  const SPARKS = {
    good: ['#ffffff', '#9cc8f2', '#ffd27a'], gold: ['#fff0a0', '#ffd27a', '#ffffff'], bad: ['#ff6b6b', '#ffffff']
  };
  function effects(c, v, P) {
    for (const f of v.fx) {
      const age = v.t - f.t0, p = age / f.life;
      if (p < 0 || p >= 1) continue;
      if (f.type === 'pop') {
        c.globalAlpha = p > 0.65 ? (1 - p) / 0.35 : 1;
        text(c, f.text, f.x, Math.max(HUD_H + 2, f.y - Math.round(p * 14)), f.bad ? P.red : f.gold ? P.gold : P.ink, { align: 'center', shadow: '#000000' });
        c.globalAlpha = 1;
      } else if (f.type === 'spark') {
        const r = prng(f.seed * 97 + 1), cols = SPARKS[f.kind] || SPARKS.good;
        for (let i = 0; i < f.n; i++) {
          const a = (i / f.n) * Math.PI * 2 + r(), sp = 28 + r() * 40;
          px(c, Math.round(f.x + Math.cos(a) * sp * age), Math.round(f.y + Math.sin(a) * sp * age + 40 * age * age), 1, 1, cols[i % cols.length]);
        }
      } else if (f.type === 'puff') {
        for (let i = 0; i < 4; i++) px(c, Math.round(f.x + (i - 1.5) * (2 + p * 7)), Math.round(f.y - 1 - p * 3 - (i & 1)), 1 + ((i + 1) & 1), 1, P.puff);
      }
    }
  }

  // ---------------------------------------------------------------- top bar and overlays
  function hud(c, v, P) {
    px(c, 0, 0, SW, HUD_H, P.hud);
    px(c, 0, HUD_H, SW, 1, P.hudLine);
    if (v.state === 'title') {
      const x = 4 + text(c, 'HI', 4, 3, P.muted) + 5;
      text(c, String(v.best).padStart(3, '0'), x, 3, P.gold);
      text(c, 'FREE PLAY', SW - 4, 3, P.muted, { align: 'right' });
      return;
    }
    const s = v.sim, score = s ? s.score : 0, lives = s ? s.lives : SIM.LIVES;
    const left = s ? Math.max(0, SIM.LEN - s.t) : SIM.LEN, secs = Math.ceil(left / SIM.HZ);
    const x = 4 + text(c, 'SCORE', 4, 3, P.muted) + 5;
    text(c, String(score).padStart(3, '0'), x, 3, P.ink);
    const tv = String(secs).padStart(2, '0'), tw = measure('TIME') + 5 + measure(tv), tx = SW / 2 - Math.floor(tw / 2);
    text(c, 'TIME', tx, 3, P.muted);
    const warn = v.state === 'play' && secs <= 5 && Math.floor(v.t * 4) % 2 === 0;
    text(c, tv, tx + measure('TIME') + 5, 3, warn ? P.red : P.ink);
    for (let i = 0; i < SIM.LIVES; i++) c.drawImage(heart(i < lives), SW - 4 - 7 - (SIM.LIVES - 1 - i) * 9, 3);
    px(c, 0, HUD_H, Math.round((SW * left) / SIM.LEN), 1, secs <= 5 ? P.red : secs <= 10 ? P.gold : P.bar);
  }
  function panel(c, x, y, w, h, P) {
    rrect(c, x, y, w, h, P.panel);
    px(c, x + 1, y, w - 2, 1, P.edge); px(c, x + 1, y + h - 1, w - 2, 1, P.edge);
    px(c, x, y + 1, 1, h - 2, P.edge); px(c, x + w - 1, y + 1, 1, h - 2, P.edge);
  }
  function legend(c, game, y, P) {
    const cells = game === 'gift'
      ? [[giftSprite(0), '+1', P.ink], [giftSprite('gold'), '+3', P.gold], [coalSprite(false), 'OUCH', P.red]]
      : [[fishSprite(0, 0, false), '+1', P.ink], [fishSprite('gold', 0, false), '+3', P.gold], [cucumber(2), 'OUCH', P.red]];
    const widths = cells.map(([s, t]) => s.width + 3 + measure(t));
    let x = Math.round(SW / 2 - (widths.reduce((a, b) => a + b, 0) + 12 * (cells.length - 1)) / 2);
    cells.forEach(([s, t, col], i) => {
      c.drawImage(s, x, Math.round(y - s.height / 2));
      text(c, t, x + s.width + 3, y - 3, col);
      x += widths[i] + 12;
    });
  }
  function scores(c, v, P, y) {
    text(c, 'TOP SCORES', SW / 2, y, P.gold, { align: 'center' });
    const st = v.board.status, rows = v.board.rows || [];
    if ((st === 'ok' || st === 'cached') && rows.length) {
      // the top five; if you're further down, the top four and then your own row
      const me = v.board.me ? rows.findIndex(r => r.name === v.board.me) : -1;
      const shown = rows.slice(0, 5).map((r, i) => [i, r]);
      if (me >= 5) shown[4] = [me, rows[me]];
      shown.forEach(([i, r], n) => {
        const yy = y + 10 + n * 8, col = i === me ? P.green : i === 0 ? P.gold : P.ink;
        text(c, String(i + 1), 73, yy, P.muted, { align: 'right' });
        text(c, r.name, 78, yy, col);
        text(c, String(r.score), 174, yy, col, { align: 'right' });
      });
    } else if (st === 'loading') {
      text(c, 'LOADING...', SW / 2, y + 20, P.muted, { align: 'center' });
    } else if (st === 'ok' || st === 'cached') {
      text(c, 'NO SCORES YET', SW / 2, y + 16, P.ink, { align: 'center' });
      text(c, 'BE THE FIRST', SW / 2, y + 28, P.muted, { align: 'center' });
    } else {
      text(c, 'SCORES ARE OFFLINE', SW / 2, y + 16, P.muted, { align: 'center' });
      text(c, 'YOUR BEST ' + v.best, SW / 2, y + 28, P.ink, { align: 'center' });
    }
  }
  function overlay(c, v, P) {
    const blink = Math.floor(v.t * 2.4) % 2 === 0;
    if (v.state === 'title') {
      text(c, TITLES[v.game], SW / 2, 17, P.title, { scale: 2, align: 'center', shadow: P.shadow });
      panel(c, 38, 35, 164, 54, P);
      const showScores = v.board.status !== 'off' && Math.floor(v.t / 5) % 2 === 1;
      if (showScores) scores(c, v, P, 39);
      else {
        legend(c, v.game, 49, P);
        text(c, '← →  TO MOVE', SW / 2, 61, P.ink, { align: 'center' });
        text(c, '40 SECONDS · 3 LIVES', SW / 2, 74, P.muted, { align: 'center' });
      }
      if (blink) text(c, 'PRESS SPACE TO PLAY', SW / 2, 92, P.gold, { align: 'center', shadow: '#000000' });
      return;
    }
    if (v.state !== 'over' || !v.over) return;
    const o = v.over;
    panel(c, 28, 16, 184, 82, P);
    text(c, o.out ? 'OUT OF LIVES' : "TIME'S UP", SW / 2, 21, P.title, { scale: 2, align: 'center', shadow: P.shadow });
    text(c, 'SCORE ' + o.score, SW / 2, 40, P.ink, { align: 'center' });
    // where this round would land on the board, or the best you already have there
    const where = o.rank === 0 ? ['NEW TOP SCORE!', P.gold] : o.rank > 0 ? ['WOULD RANK #' + (o.rank + 1), P.gold]
      : o.behind ? ['YOUR BOARD BEST ' + o.behind, P.muted] : null;
    if (where && (o.phase === 'offer' || o.phase === 'name')) text(c, where[0], SW / 2, 49, where[1], { align: 'center' });
    else if (o.newBest) { if (blink) text(c, 'NEW BEST!', SW / 2, 49, P.green, { align: 'center' }); }
    else text(c, 'BEST ' + v.best, SW / 2, 49, P.muted, { align: 'center' });
    if (o.phase === 'offer') {
      if (o.behind) {
        // below your own board best it would change nothing, so the question steps back
        text(c, 'ENTER TO SEND ANYWAY', SW / 2, 64, P.muted, { align: 'center' });
        if (blink) text(c, 'SPACE TO PLAY AGAIN', SW / 2, 87, P.gold, { align: 'center' });
      } else {
        // the round is over: ask straight away
        text(c, 'ADD IT TO THE LEADERBOARD?', SW / 2, 61, P.gold, { align: 'center' });
        text(c, 'ENTER: YES · SPACE: PLAY AGAIN', SW / 2, 72, P.ink, { align: 'center' });
        text(c, 'IT OPENS A GITHUB ISSUE', SW / 2, 87, P.muted, { align: 'center' });
      }
    } else if (o.phase === 'name') {
      text(c, 'TYPE YOUR NAME', SW / 2, 60, P.gold, { align: 'center' });
      const bw = 66, lw = measure('NAME'), x0 = Math.round(SW / 2 - (lw + 5 + bw) / 2);
      text(c, 'NAME', x0, 73, P.muted);
      const bx = x0 + lw + 5;
      px(c, bx, 70, bw, 13, P.edge); px(c, bx + 1, 71, bw - 2, 11, P.field);
      const nw = text(c, o.name, bx + 3, 73, P.ink);
      if (blink && o.name.length < 10) text(c, '_', bx + 3 + nw + (o.name ? 1 : 0), 73, P.gold);
      text(c, 'ENTER: OPEN GITHUB · ESC: BACK', SW / 2, 87, P.muted, { align: 'center' });
    } else if (o.phase === 'sending') {
      text(c, 'OPENING GITHUB...', SW / 2, 68, P.ink, { align: 'center' });
    } else if (o.phase === 'sent') {
      text(c, 'CHECK THE NEW TAB', SW / 2, 61, P.gold, { align: 'center' });
      text(c, 'AND PRESS CREATE', SW / 2, 71, P.ink, { align: 'center' });
      if (blink) text(c, 'SPACE TO PLAY AGAIN', SW / 2, 87, P.muted, { align: 'center' });
    } else if (o.phase === 'failed') {
      text(c, "COULDN'T OPEN GITHUB", SW / 2, 66, P.red, { align: 'center' });
      if (blink) text(c, 'SPACE TO PLAY AGAIN', SW / 2, 87, P.muted, { align: 'center' });
    } else {
      if (o.stale && o.score > 0) text(c, 'RELOAD THE PAGE TO SEND', SW / 2, 64, P.muted, { align: 'center' });
      else if (o.listed && o.score === 0) text(c, 'CATCH ONE TO SEND A SCORE', SW / 2, 64, P.muted, { align: 'center' });
      if (blink) text(c, 'SPACE TO PLAY AGAIN', SW / 2, 87, P.gold, { align: 'center' });
    }
  }

  // ---------------------------------------------------------------- cabinet
  function cabinet(game) {
    const id = 'cab:' + game;
    let cv = cache.get(id);
    if (cv) return cv;
    const P = PAL[game];
    cv = mk(CAB.W, CAB.H);
    const g = cv.getContext('2d');
    rrect(g, 1, 3, 274, 246, P.line);
    rrect(g, 2, 4, 272, 244, P.body);
    px(g, 3, 4, 270, 1, P.light);
    for (let y = 5; y < 247; y++) {
      for (let i = 0; i < 6; i++) {
        if (game === 'gift') {
          const col = ((i + y) >> 2) & 1 ? '#c8382e' : '#f1ebe0';
          px(g, 3 + i, y, 1, 1, col); px(g, 272 - i, y, 1, 1, col);
        } else { px(g, 3 + i, y, 1, 1, i < 3 ? P.light : P.body); px(g, 272 - i, y, 1, 1, i < 3 ? P.dark : P.body); }
      }
    }
    // marquee
    rrect(g, 8, 6, 260, 28, P.line);
    px(g, 9, 7, 258, 26, P.sign);
    px(g, 9, 13, 258, 14, P.signGlow);
    g.fillStyle = P.signGlow;
    for (let x = 9; x < 267; x += 2) { g.fillRect(x, 12, 1, 1); g.fillRect(x + 1, 27, 1, 1); }
    text(g, MARQUEE[game], CAB.W / 2, 13, P.signInk, { scale: 2, align: 'center', shadow: P.signShadow });
    if (game === 'gift') {
      g.drawImage(giftSprite(0), 20, 15); g.drawImage(giftSprite(1), CAB.W - 31, 15);
    } else {
      g.drawImage(fishSprite(2, 0, false), 18, 16); g.drawImage(fishSprite(2, 0, true), CAB.W - 32, 16);
    }
    // bezel and screen
    rrect(g, 10, 36, 256, 176, '#05030a');
    px(g, 11, 37, 254, 174, P.bezel);
    px(g, 12, 38, 252, 1, P.bezelEdge);
    px(g, 12, 209, 252, 1, P.bezelEdge);
    px(g, CAB.SX, CAB.SY, SW, SH, '#000000');
    // control panel
    px(g, 3, 213, 270, 1, P.line);
    px(g, 3, 214, 270, 2, P.deckTop);
    px(g, 3, 216, 270, 1, P.light);
    px(g, 9, 217, 258, 30, P.deck);
    rrect(g, 120, 220, 36, 22, P.line);
    px(g, 121, 221, 34, 20, P.door);
    for (const dx of [123, 139]) {
      px(g, dx, 223, 14, 16, P.dark); px(g, dx, 223, 14, 1, P.light);
      px(g, dx + 6, 227, 1, 7, '#ff6a3a'); px(g, dx + 6, 229, 1, 2, '#ffd0a0');
    }
    text(g, 'MOVE', 44, 239, P.label, { align: 'center' });
    text(g, 'START', 200, 239, P.label, { align: 'center' });
    text(g, 'EXIT', 237, 239, P.label, { align: 'center' });
    if (game === 'gift') {
      for (let x = 1; x < 275; x++) {
        const h = 2 + (Math.sin(x / 5) + 0.6 * Math.sin(x / 2.1) > 0.8 ? 1 : 0);
        px(g, x, 1, 1, h + 1, '#f4f8fd'); px(g, x, 2 + h, 1, 1, '#c9d8ea');
      }
      [[30, 2], [96, 3], [188, 2], [247, 3]].forEach(([x, d]) => px(g, x, 5, 1, d, '#f4f8fd'));
      for (let x = 4; x < 272; x++) if (Math.sin(x / 4) + Math.sin(x / 1.7) > 0.9) px(g, x, 213, 1, 1, '#f4f8fd');
      for (const [hx, hy] of [[13, 10], [261, 10]]) {
        px(g, hx - 2, hy, 2, 1, '#2f8a4a'); px(g, hx + 1, hy, 2, 1, '#2f8a4a'); px(g, hx - 1, hy - 1, 1, 1, '#4fb36a'); px(g, hx + 1, hy - 1, 1, 1, '#4fb36a');
        px(g, hx, hy, 1, 1, '#e0303a'); px(g, hx, hy + 1, 1, 1, '#b01e28');
      }
    }
    cache.set(id, cv);
    return cv;
  }
  function liveCabinet(c, v, P) {
    // chasing bulbs along the top and bottom of the marquee
    let i = 0;
    for (const y of [8, 30]) {
      for (let x = 13; x < 264; x += 8, i++) {
        const on = (i + Math.floor(v.t * (v.state === 'play' ? 4 : 7))) % 4 !== 0;
        px(c, x, y, 2, 2, on ? P.bulbs[i % P.bulbs.length] : P.bulbOff);
        if (on) px(c, x, y, 1, 1, '#ffffff');
      }
    }
    // joystick, leaning the way the cat is going
    const jx = 44, tilt = v.mv || 0;
    oval(c, jx, 233, 8, 2, '#0a0610');
    oval(c, jx, 232, 5, 1, '#2a2230');
    for (let k = 0; k < 7; k++) px(c, jx + Math.round(tilt * k * 0.45), 231 - k, 2, 1, k < 2 ? '#8a8496' : '#c4bece');
    c.drawImage(sprite('ball', BALL, { o: '#3a0a0a', R: '#d83a3a', L: '#ff8a7a', D: '#9a2020' }), jx + tilt * 3 - 3, 219);
    // START and EXIT buttons; START dips when pressed
    const btn = (cx, pal, down) => {
      oval(c, cx, 232, 6, 2, '#0a0610');
      c.drawImage(sprite('btn' + pal.R, BUTTON, pal), cx - 5, 226 + (down ? 2 : 0));
    };
    btn(200, { o: '#3a0a0a', R: '#d83a3a', L: '#ff8a7a', D: '#9a2020' }, v.pressA);
    btn(237, { o: '#0a1a3a', R: '#3a7ad8', L: '#8ab8ff', D: '#1f4a99' }, v.pressB);
  }
  function glass(c, v) {
    const x0 = CAB.SX, y0 = CAB.SY, P = PAL[v.game];
    if (v.flash > 0) { c.fillStyle = `rgba(255, 70, 70, ${(v.flash * 0.35).toFixed(3)})`; c.fillRect(x0, y0, SW, SH); }
    c.fillStyle = P.bezel;
    for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x0 + SW - 1, y0, -1, 1], [x0, y0 + SH - 1, 1, -1], [x0 + SW - 1, y0 + SH - 1, -1, -1]]) {
      c.fillRect(cx, cy, 1, 1); c.fillRect(cx + sx, cy, 1, 1); c.fillRect(cx, cy + sy, 1, 1);
    }
  }

  // ---------------------------------------------------------------- frame
  let scr = null;
  function render(c, v) {
    const P = PAL[v.game] || PAL.fish;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, CAB.W, CAB.H);
    c.drawImage(cabinet(v.game), 0, 0);
    liveCabinet(c, v, P);

    if (!scr) scr = mk(SW, SH);
    const s = scr.getContext('2d');
    s.imageSmoothingEnabled = false;
    const sc = scene(v.game);
    s.drawImage(sc.canvas, 0, 0);
    sceneLive(s, v, sc, P);
    items(s, v);
    cat(s, v);
    effects(s, v, P);
    hud(s, v, P);
    overlay(s, v, P);

    c.save();
    c.beginPath(); c.rect(CAB.SX, CAB.SY, SW, SH); c.clip();
    if (v.shakeX) px(c, CAB.SX, CAB.SY, SW, SH, '#000000');
    c.drawImage(scr, CAB.SX + (v.shakeX || 0), CAB.SY);
    c.restore();
    glass(c, v);
  }

  root.pxfArcadeArt = { CAB, render, text, measure };
})(typeof window !== 'undefined' ? window : globalThis);
