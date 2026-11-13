/*
 * Pocket Christmas Floor — content script for https://pocket.design
 *
 * A fan-made overlay. It only draws on top of the page in your own browser and
 * never sends anything anywhere.
 *
 *  - Bring in an original pixel cat and drive it with WASD / arrows or a game controller.
 *  - The page hides its floor under a "fog" canvas that clears where your cursor goes.
 *    We mirror that canvas and cut the cat's path out of it, so the cat clears the floor too.
 *  - The doormat is an elevator. Step on it to ride between Floor 1 (the page as shipped)
 *    and Floor 2: the same office at Christmas — snow blowing in, a tree, lights, Santa hats.
 *  - Walk up to a teammate and press Space to say hi.
 *  - Walk up to the arcade cabinet and press Space to play.
 */
(() => {
  'use strict';

  // Re-running the script (during development) replaces the previous instance.
  if (window.__pocketXmasFloor && window.__pocketXmasFloor.teardown) window.__pocketXmasFloor.teardown();

  // ---------------------------------------------------------------- tuning
  const SPEED = 150;            // cat speed, CSS px per second
  const STRIDE_RATE = 17;       // walk-cycle speed, radians per second (one trot stride per 2π)
  const REVEAL_R = 66;          // fog cleared around the cat, CSS px
  const TILE = 24;              // fog is cleared in square tiles, like the page does
  const MEET_R = 100;           // how close the cat must be to greet someone
  const ARCADE_R = 78;          // how close the cat must be to the arcade
  const HAT_DY = 18;            // fallback: hat brim, px below the top of a teammate's hit box
  const HAT_SINK = 9;           // hat brim, px below the top of a teammate's head (sits snug on the hair)
  const HAT_REST = 1.75;        // the hat tip hangs this far (radians from straight up) behind the head
  const HAT_SPRING = 55;        // how stiffly the tip returns to rest (1/s²)
  const HAT_DAMP = 5;           // how quickly its swinging dies down (1/s); low = wobbly
  const HAT_TIP = 20;           // length of the floppy part, CSS px (longer = movement swings it less)
  const HAT_STEP = 0.24;        // extra side-to-side sway per walking step, radians
  const NAME_LIFT = 18;         // on Floor 2, name tags move up this far to make room for hats
  const IDLE_NAP = 9;           // seconds before the cat goes off for a nap
  const NAP_PACE = 0.55;        // its sleepy walk to the nap spot, as a share of SPEED
  const NAP_WARM = ['diyas-sofa', 'diya-reading', 'diyas-beanbag', 'rangoli']; // Floor 1's warm spots on the floor (the rangoli has sparklers)
  const BODY_X = 14, BODY_Y = 4; // room the cat's body needs beside furniture, CSS px
  const PEEK_R = 150;           // a sleeping cat opens one eye when someone walks this close
  const COAT = { fur: '#d98a45', stripe: '#a9581f', belly: '#f4e2c4', ear: '#e29b93', eye: '#b7b445', nose: '#d27378' }; // orange tabby

  // Christmas versions of the page's own skin tokens (the page sets these inline on <main>).
  const XMAS_SKIN = {
    '--skin-wall': 'linear-gradient(#2f5c4c, #213f34)',
    '--skin-wall-edge': '#13291f',
    '--skin-night': 'rgb(238, 224, 212)',        // a warm, lamp-lit evening inside
    '--skin-night-edge': 'rgba(22, 40, 70, 0.55)',  // and the cold creeping in at the edges
    '--skin-sign-ink': '#f4f6f9',
    '--skin-mat': '#1f5a43',
    '--skin-mat-ink': '#f4f1e6',
    '--skin-board-ink': '#1f4d3a'
  };
  // Small copy swaps on the page's two signs while on Floor 2.
  const XMAS_TEXT = [
    { sel: '[class*="_mark_board"]', lines: ['SOCKS ON,', 'FEET UP.'] },
    { sel: '[class*="_mark_mat"]', lines: ['SNOW GOOD', 'TO SEE YOU.'] }
  ];
  const HELLO = ['oh hi, kitty!', 'who let the cat in?', 'pspspsps', 'nice whiskers.', 'are you here to apply?', 'is it lunch already?'];
  const HELLO_XMAS = ['merry christmas, kitty!', 'nice hat.', 'is that gift for me?', 'brr, shut the door!', 'you tracked snow in!', 'ho ho ho!', 'cocoa is in the kitchen.', 'like my jumper? my mum knitted it.', 'mittens make typing hard.', 'save me a gingerbread man.'];
  const MEOWS = ['mrrp!', 'meow.', 'prrr…', 'mrrrow?'];

  // ---------------------------------------------------------------- art bridge
  const drawCat = window.drawCatRig;
  const drawTree = window.drawTree;
  const drawGift = window.drawGift;
  const drawSantaHat = window.drawSantaHat;
  const drawSantaHatFlex = window.drawSantaHatFlex;
  const drawSnowPile = window.drawSnowPile;
  const drawPawPrint = window.drawPawPrint;
  const wardrobe = window.pxfWardrobe; // winter clothes for the teammates (src/wardrobe.js)
  const decor = window.pxfDecor;       // Christmas decor in place of the Diwali decor (src/decor.js)
  const plainUrl = u => (wardrobe ? wardrobe.originalOf(u) : u);

  // ---------------------------------------------------------------- state
  const S = {
    active: false, xmas: false, trans: false, arcade: null,
    t: 0, last: 0, raf: 0, lastLocate: 0,
    onMat: false, entering: 0, snowAmt: 0, drift: 0, gustT: 2,
    padA: false, padB: false, padX: false, padLabel: null, sound: true
  };
  const cat = { x: 0, y: 0, top: -44, dir: 'up', walk: false, phase: 0, blink: 0, blinkT: 3, hop: 0, idle: 0, sleeping: false, nap: null, peek: 0, peekT: 0, lastPrint: null, printSide: 1 };
  const A = { card: null, rawCard: null, mat: null, arcade: null, tree: null, rangoliEls: [], lightY: 76, windows: [], furniture: [], obstacles: [] };
  const keys = new Set();
  const flakes = [], gusts = [], prints = [], bubbles = [];
  const lastPeople = new Map();
  const saved = { mainStyle: null, skin: null, floor: null, text: [], hidden: [], fogOpacity: '' };
  let DPR = 1, ART = 2, CS = 2; // CS: device px per cat pixel (one cat pixel = one CSS px)

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const $ = (s, r = document) => r.querySelector(s);
  // the office; it carries data-floor-skin only while a festival skin is on (Halloween, Diwali)
  const stageEl = () => $('main[data-floor-skin]') || $('main[class*="_stage"]') || $('main');
  // Floor 1 goes by the page's own festival (Diwali, Halloween), or just "Office" between festivals
  const floor1Name = () => {
    const s = S.xmas ? saved.skin : stageEl() && stageEl().dataset.floorSkin;
    return s ? s[0].toUpperCase() + s.slice(1) : 'Office';
  };
  const pageFog = () => $('canvas[class*="_surface"]');
  const toRect = r => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  const inflate = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });
  const inRect = (x, y, r, pad = 0) => r && x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
  const ax = v => (v * DPR) / ART; // CSS px -> art px

  // ---------------------------------------------------------------- DOM
  const fog = document.createElement('canvas'); fog.id = 'pxf-fog';
  const sprites = document.createElement('canvas'); sprites.id = 'pxf-sprites';
  const ui = document.createElement('div'); ui.id = 'pxf-ui';
  const fctx = fog.getContext('2d');
  const sctx = sprites.getContext('2d');
  const trail = document.createElement('canvas');
  const tctx = trail.getContext('2d');
  const stamped = new Set();
  fog.style.display = 'none';

  ui.innerHTML = `
    <button class="pxf-btn" id="pxf-launch" type="button">🐾 Bring the cat in</button>
    <div id="pxf-hud" hidden>
      <div class="pxf-help">
        <kbd>W A S D</kbd> or arrows to move · <kbd>Space</kbd> to say hi or play the arcade ·
        step on the doormat to take the elevator · a game controller works too
      </div>
      <div class="pxf-row">
        <span class="pxf-chip" id="pxf-pad">⌨︎ Keyboard</span>
        <button class="pxf-btn" id="pxf-sound" type="button" aria-pressed="true">Sound on</button>
        <button class="pxf-btn" id="pxf-home" type="button">Send the cat home</button>
        <span class="pxf-floor" id="pxf-floor">Floor <b>1</b> · ${floor1Name()}</span>
      </div>
    </div>
    <div class="pxf-prompt" id="pxf-prompt" hidden></div>`;
  document.body.append(fog, sprites, ui);
  // Full-screen moments (elevator, arcade) go in the browser's top layer so nothing on the page can sit
  // above them. The everyday controls stay in the normal layer so they never cover the page's own dialogs.
  const topLayer = el => { try { el.popover = 'manual'; el.showPopover(); } catch (e) { /* z-index fallback */ } };
  const launchBtn = $('#pxf-launch', ui), hud = $('#pxf-hud', ui), padChip = $('#pxf-pad', ui);
  const soundBtn = $('#pxf-sound', ui), homeBtn = $('#pxf-home', ui), floorLbl = $('#pxf-floor', ui), promptEl = $('#pxf-prompt', ui);

  // Borrow the page's own button styling so the controls feel native.
  function syncTheme() {
    const ref = [...document.querySelectorAll('button')].find(b => /know more about pocket fm/i.test(b.textContent || ''));
    if (ref) {
      const cs = getComputedStyle(ref);
      if (!/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) ui.style.setProperty('--pxf-bg', cs.backgroundColor);
      ui.style.setProperty('--pxf-ink', cs.color);
      ui.style.setProperty('--pxf-line', cs.borderTopColor);
      ui.style.setProperty('--pxf-radius', cs.borderTopLeftRadius);
      ui.style.setProperty('--pxf-font', cs.fontFamily);
    }
    const h1 = $('.office-hiring h1') || $('h1');
    if (h1) ui.style.setProperty('--pxf-serif', getComputedStyle(h1).fontFamily);
  }

  // ---------------------------------------------------------------- page anchors
  function locate() {
    const W = innerWidth, H = innerHeight;
    const cardEl = $('.office-hiring');
    A.rawCard = cardEl ? toRect(cardEl.getBoundingClientRect()) : { x: W / 2 - 280, y: H * 0.11, w: 560, h: H * 0.74 };
    A.card = inflate(A.rawCard, 12);
    const mat = $('[class*="_mark_mat"]');
    A.mat = mat ? toRect(mat.getBoundingClientRect()) : { x: W / 2 - 170, y: H - 104, w: 340, h: 100 };
    A.lightY = clamp(A.rawCard.y - 30, 56, 120);

    const imgs = [...(stageEl() ? stageEl().querySelectorAll('img') : [])].map(el => ({ el, r: el.getBoundingClientRect() }));
    // The windows along the back wall (background images about 128x80 at the very top). The glass is
    // the middle of each, inside the frame and above the sill.
    A.windows = [];
    if (stageEl()) for (const el of stageEl().querySelectorAll('div, span')) {
      const r = el.getBoundingClientRect();
      if (r.width < 90 || r.width > 170 || r.height < 55 || r.height > 110 || r.top > 30 || r.top < -30) continue;
      if (!/url\(/.test(getComputedStyle(el).backgroundImage)) continue;
      A.windows.push({ x: r.left + r.width * 0.06, y: r.top + r.height * 0.15, w: r.width * 0.88, h: r.height * 0.63 });
    }
    // The arcade cabinet: a tall, narrow image in the top-left of the room.
    let best = null, bd = Infinity;
    for (const { r } of imgs) {
      if (r.width < 50 || r.width > 100 || r.height < 95 || r.height > 150) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx > A.rawCard.x || cy > H * 0.35) continue;
      const d = Math.hypot(cx - (A.rawCard.x - 365), cy - (A.rawCard.y - 9));
      if (d < bd) { bd = d; best = r; }
    }
    A.arcade = best ? toRect(best) : null;

    // The rangoli (left of the card, lower half) is where the Christmas tree goes. The page labels it
    // (data-skin-decor="rangoli", with sparklers beside it); the size search is the fallback.
    const labelled = $('img[data-skin-decor="rangoli"]');
    let rg = labelled ? { el: labelled, r: labelled.getBoundingClientRect() } : null;
    // out of season there's no rangoli, so the tree takes the spot the page would put it in
    const slot = !rg && window.pxfDecor && window.pxfDecor.slotRect ? window.pxfDecor.slotRect('rangoli') : null;
    if (slot) {
      A.tree = { x: slot.left + slot.width / 2, y: slot.top + slot.height * 0.78 };
      A.rangoliEls = [];
    } else if (!rg) {
      for (const it of imgs) {
        const r = it.r;
        if (r.width < 125 || r.width > 200 || r.height < 70 || r.height > 125) continue;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (cx > A.rawCard.x || cy < H * 0.45) continue;
        if (!rg || Math.abs(cx - (A.rawCard.x - 100)) < Math.abs(rg.r.left + rg.r.width / 2 - (A.rawCard.x - 100))) rg = it;
      }
    }
    if (rg) {
      const c = { x: rg.r.left + rg.r.width / 2, y: rg.r.top + rg.r.height / 2 };
      A.tree = { x: c.x, y: rg.r.top + rg.r.height * 0.78 };
      // the rangoli plus the two sparklers beside it
      const sparklers = [...document.querySelectorAll('img[data-skin-decor^="sparkler"]')];
      A.rangoliEls = [rg.el, ...(sparklers.length ? sparklers : imgs.filter(o => o.el !== rg.el && o.r.width < 50 && o.r.height > 45 && o.r.height < 80 &&
        Math.hypot(o.r.left + o.r.width / 2 - c.x, o.r.top + o.r.height / 2 - c.y) < 110).map(o => o.el))];
    } else if (!slot) {
      A.tree = { x: A.rawCard.x - 100, y: A.rawCard.y + A.rawCard.h * 0.82 };
      A.rangoliEls = [];
    }
    A.furniture = findFurniture();
    A.obstacles = findObstacles();
  }

  // ---------------------------------------------------------------- furniture
  // The cat walks round the furniture instead of through it. The page draws every piece as an <img>:
  // the props (sofas, tables, chairs, the desk, plants, lamps, shelves), the pets, and the low walls
  // along the front. Each image is scanned once for its solid pixels (faint shadows don't count) and
  // described as up to four stacked boxes that follow its shape, so the cat stops at a piece's real
  // edge, not at its transparent box: a wall and the post above it, a lamp's shade and its pole.
  // Rugs, the rangoli and the floor signs aren't props, so the cat still walks over those.
  const solidShapes = new Map();
  function solidShape(url) {
    const hit = solidShapes.get(url);
    if (hit !== undefined) return hit === 'pending' ? null : hit;
    solidShapes.set(url, 'pending');
    fetch(url, { mode: 'cors', credentials: 'omit' })
      .then(r => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(blob => createImageBitmap(blob))
      .then(bm => solidShapes.set(url, shapeOf(bm)))
      .catch(() => solidShapes.set(url, null));
    return null;
  }
  function shapeOf(bm) {
    const w = bm.width, h = bm.height;
    const c = new OffscreenCanvas(w, h), g = c.getContext('2d');
    g.drawImage(bm, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    // each row's solid extent, then runs of rows with about the same extent become one box
    const tol = w * 0.08 + 2, bands = [];
    let cur = null;
    for (let y = 0; y < h; y++) {
      let l = -1, r = -1, n = 0;
      for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 100) { if (l < 0) l = x; r = x; n++; }
      if (n < 2) { cur = null; continue; }
      if (cur && Math.abs(l - cur.l) < tol && Math.abs(r + 1 - cur.r) < tol) {
        cur.l = Math.min(cur.l, l); cur.r = Math.max(cur.r, r + 1); cur.b = y + 1;
      } else bands.push((cur = { l, r: r + 1, t: y, b: y + 1 }));
    }
    if (!bands.length) return null;
    // at most four: keep merging the two neighbours that add the least empty area
    while (bands.length > 4) {
      let best = 0, cost = Infinity;
      for (let i = 0; i < bands.length - 1; i++) {
        const a = bands[i], b = bands[i + 1];
        const merged = (Math.max(a.r, b.r) - Math.min(a.l, b.l)) * (b.b - a.t);
        const k = merged - (a.r - a.l) * (a.b - a.t) - (b.r - b.l) * (b.b - b.t);
        if (k < cost) { cost = k; best = i; }
      }
      const a = bands[best], b = bands[best + 1];
      bands.splice(best, 2, { l: Math.min(a.l, b.l), r: Math.max(a.r, b.r), t: a.t, b: b.b });
    }
    return bands.map(b => ({ l: b.l / w, r: b.r / w, t: b.t / h, b: b.b / h }));
  }
  // Where the picture actually sits inside an <img>'s box (the page uses object-fit: contain for some).
  function drawnRect(el, r) {
    const cs = getComputedStyle(el), nw = el.naturalWidth, nh = el.naturalHeight;
    if (!nw || !nh || (cs.objectFit !== 'contain' && cs.objectFit !== 'scale-down')) return r;
    const s = Math.min(r.w / nw, r.h / nh, cs.objectFit === 'scale-down' ? 1 : Infinity);
    const w = nw * s, h = nh * s;
    const at = (v, room) => (/%$/.test(v) ? (parseFloat(v) / 100) * room : /px$/.test(v) ? parseFloat(v) : room / 2);
    const [px = '50%', py = '50%'] = cs.objectPosition.split(' ');
    return { x: r.x + at(px, r.w - w), y: r.y + at(py, r.h - h), w, h };
  }
  function findFurniture() {
    const st = stageEl();
    if (!st) return [];
    const out = [];
    for (const el of st.querySelectorAll('img[class*="_prop"], [class*="_prop"] > img, [class*="_frontWalls"] img')) {
      if (el.dataset.skinDecor || el.closest('.office-hiring, [class*="_walker"]')) continue;
      const r0 = el.getBoundingClientRect();
      if (r0.width < 12 || r0.height < 12 || r0.bottom < 0 || r0.top > innerHeight) continue;
      const shape = solidShape(el.currentSrc || el.src);
      if (!shape) continue;
      const c = drawnRect(el, toRect(r0));
      // the page mirrors some pieces (the right-hand wall) and turns some round (chairs facing away)
      const m = getComputedStyle(el).transform.match(/^matrix\(([^,]+),[^,]+,[^,]+,([^,]+),/);
      const fx = m && parseFloat(m[1]) < -0.5, fy = m && parseFloat(m[2]) < -0.5;
      const boxes = shape.map(p => {
        const l = fx ? 1 - p.r : p.l, r = fx ? 1 - p.l : p.r, t = fy ? 1 - p.b : p.t, b = fy ? 1 - p.t : p.b;
        return { x: c.x + l * c.w, y: c.y + t * c.h, w: (r - l) * c.w, h: (b - t) * c.h };
      });
      const top = Math.min(...boxes.map(b => b.y)), bottom = Math.max(...boxes.map(b => b.y + b.h));
      const width = Math.max(...boxes.map(b => b.x + b.w)) - Math.min(...boxes.map(b => b.x)), height = bottom - top;
      // tall, narrow pieces (plants, lamps, the arcade) only block at their base, so the cat can pass behind the top
      const footY = height > width * 1.2 ? bottom - Math.min(height, Math.max(width * 0.6, 26)) : top;
      for (const b of boxes) {
        const y0 = Math.max(b.y, footY);
        if (b.w >= 6 && b.y + b.h - y0 >= 3) out.push({ x: b.x, y: y0, w: b.w, h: b.y + b.h - y0 });
      }
    }
    return out;
  }
  // Everywhere the cat can't stand: the hiring card, the furniture (padded for the cat's body), and on
  // Floor 2 the tree with its presents.
  function findObstacles() {
    const out = [A.card];
    for (const f of A.furniture) out.push({ x: f.x - BODY_X, y: f.y - BODY_Y, w: f.w + 2 * BODY_X, h: f.h + 2 * BODY_Y });
    if (S.xmas && A.tree) out.push({ x: A.tree.x - 76 - BODY_X, y: A.tree.y - 30, w: 144 + 2 * BODY_X, h: 46 + BODY_Y });
    return out;
  }

  // Where a teammate's head is, read from the frame of their own sprite the page is showing.
  // Each sprite image is scanned once (top of the opaque pixels per frame, and the head's centre).
  const spriteHeads = new Map();
  function spriteTable(url, cols, rows) {
    const key = `${cols}x${rows} ${url}`;
    const hit = spriteHeads.get(key);
    if (hit !== undefined) return hit === 'pending' ? null : hit;
    spriteHeads.set(key, 'pending');
    fetch(url, { mode: 'cors', credentials: 'omit' })
      .then(r => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(blob => createImageBitmap(blob))
      .then(bm => {
        const c = new OffscreenCanvas(bm.width, bm.height), g = c.getContext('2d');
        g.drawImage(bm, 0, 0);
        const d = g.getImageData(0, 0, bm.width, bm.height).data;
        const fw = Math.floor(bm.width / cols), fh = Math.floor(bm.height / rows), band = Math.max(2, Math.round(fh * 0.06));
        const top = new Float32Array(cols * rows).fill(-1), mid = new Float32Array(cols * rows).fill(0.5);
        const solid = (r, q, y, k) => d[((r * fh + y) * bm.width + q * fw + k) * 4 + 3] > 60;
        for (let r = 0; r < rows; r++) {
          for (let q = 0; q < cols; q++) {
            let t = -1;
            for (let y = 0; y < fh && t < 0; y++) for (let k = 0; k < fw; k++) if (solid(r, q, y, k)) { t = y; break; }
            if (t < 0) continue;
            let sx = 0, n = 0;
            for (let y = t; y < Math.min(fh, t + band); y++) for (let k = 0; k < fw; k++) if (solid(r, q, y, k)) { sx += k; n++; }
            top[r * cols + q] = t / fh;
            mid[r * cols + q] = n ? sx / n / fw : 0.5;
          }
        }
        spriteHeads.set(key, { top, mid });
      })
      .catch(() => spriteHeads.set(key, null));
    return null;
  }
  function headOf(walker) {
    const vp = walker.querySelector('[class*="_viewport"]');
    const vr = vp && vp.getBoundingClientRect();
    for (const el of walker.querySelectorAll('[class*="_frames"], [class*="_restingFrames"], img[class*="_still"]')) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (el.tagName === 'IMG') {
        const tb = spriteTable(plainUrl(el.currentSrc || el.src), 1, 1);
        return tb && tb.top[0] >= 0 ? { y: r.top + tb.top[0] * r.height, x: r.left + tb.mid[0] * r.width, walking: false, step: 0 } : null;
      }
      const m = getComputedStyle(el).backgroundImage.match(/url\("?([^")]+)"?\)/);
      if (!m || !vr || vr.width < 1) return null;
      // an animated sheet: one frame fills the viewport, and the sheet slides behind it
      const cols = Math.max(1, Math.round(r.width / vr.width)), rows = Math.max(1, Math.round(r.height / vr.height));
      const tb = spriteTable(plainUrl(m[1]), cols, rows);
      if (!tb) return null;
      const q = clamp(Math.round((vr.left - r.left) / vr.width), 0, cols - 1);
      const w = clamp(Math.round((vr.top - r.top) / vr.height), 0, rows - 1);
      const i = w * cols + q;
      // two steps per walk cycle; the frame column says where in the cycle they are
      const walking = /_frames/.test(el.className) && !/resting/i.test(el.className);
      return tb.top[i] >= 0 ? { y: vr.top + tb.top[i] * vr.height, x: vr.left + tb.mid[i] * vr.width, walking, step: (q / cols) * Math.PI * 4 } : null;
    }
    return null;
  }

  // Santa hat tips swing like a pendulum on a spring, pushed by how the head actually moves:
  // they trail behind a walker, bounce with each step, keep swinging for a moment when someone
  // stops, and flip over the top when someone turns around.
  const hatSway = new Map();
  function swayHat(id, x, y, face, walking, step, dt, now) {
    const rest = -Math.sign(face || 1) * HAT_REST + (walking ? HAT_STEP * Math.sin(step) : 0);
    let s = hatSway.get(id);
    if (!s || now - s.seen > 600) {
      s = { a: rest, w: 0, sx: x, sy: y, vx: 0, vy: 0, seen: now };
      hatSway.set(id, s);
    }
    s.seen = now;
    if (!(dt > 0)) return s.a;
    // The page moves heads in whole-frame jumps, so smooth the head before reading its acceleration.
    const k = Math.min(1, dt * 16);
    const nx = s.sx + (x - s.sx) * k, ny = s.sy + (y - s.sy) * k;
    const vx = (nx - s.sx) / dt, vy = (ny - s.sy) / dt;
    let ax = (vx - s.vx) / dt, ay = (vy - s.vy) / dt;
    const am = Math.hypot(ax, ay), cap = 2000;
    if (am > cap) { ax *= cap / am; ay *= cap / am; }
    s.sx = nx; s.sy = ny; s.vx = vx; s.vy = vy;
    // angle from straight up; the head's acceleration acts on the tip as an opposite push
    const acc = -HAT_SPRING * (s.a - rest) - HAT_DAMP * s.w - (ax * Math.cos(s.a) + ay * Math.sin(s.a)) / HAT_TIP;
    s.w += acc * dt;
    s.a = clamp(s.a + s.w * dt, -2.7, 2.7);
    return s.a;
  }

  // Floor 2 dresses everyone for winter: each sprite image the page shows is swapped for a copy
  // with a knitted jumper, scarf, mittens and tights (made once, in the background, by wardrobe.js).
  // Leaving Floor 2 swaps the originals back. mode: 'wear' (Floor 2), 'prepare' (make them early,
  // while the cat is on Floor 1, without showing them) or 'off'.
  const bgUrlOf = el => { const m = getComputedStyle(el).backgroundImage.match(/url\("?([^")]+)"?\)/); return m ? m[1] : null; };
  function dressTeam(mode) {
    if (!wardrobe) return;
    const on = mode === 'wear';
    for (const walker of document.querySelectorAll('[class*="_walker"]')) {
      const shown = (parseFloat(getComputedStyle(walker).opacity) || 0) > 0.05;
      for (const el of walker.querySelectorAll('[class*="_frames"], [class*="_restingFrames"]')) {
        const cur = bgUrlOf(el); if (!cur) continue;
        if (wardrobe.isDressed(cur)) { if (!on) el.style.backgroundImage = `url("${wardrobe.originalOf(cur)}")`; continue; }
        if (mode === 'off') continue;
        const u = wardrobe.get(cur, { first: shown && el.getBoundingClientRect().width > 0 });
        if (u && on) el.style.backgroundImage = `url("${u}")`;
      }
      const sitH = parseFloat(walker.style.getPropertyValue('--sitting-height')) || 132;
      // Seated poses are <img>s whose src the page keeps setting, so the dressed copy goes in
      // through CSS `content` instead, which replaces what an <img> draws.
      for (const img of walker.querySelectorAll('img[class*="_still"]')) {
        const cur = img.currentSrc || img.src;
        if (!on) { if (img.style.content) img.style.content = ''; if (mode === 'off' || !cur) continue; }
        if (!cur || !/^https?:/.test(cur)) continue;
        const r = img.getBoundingClientRect();
        const u = wardrobe.get(cur, { still: true, cssH: r.height > 0 ? r.height : sitH, first: shown && r.width > 0 });
        const want = u && on ? `url("${u}")` : '';
        if (img.style.content !== want) img.style.content = want;
      }
    }
  }

  function readPeople() {
    const out = [];
    for (const b of document.querySelectorAll('button[aria-label^="Meet "]')) {
      const name = b.getAttribute('aria-label').slice(5).trim();
      if (!name || /^the team$/i.test(name)) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 10 || (r.left === 0 && r.top === 0) || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      // Idle walker slots stay in the DOM at opacity 0; skip them so nobody gets a floating hat.
      const walker = b.closest('[class*="_walker"]') || b.parentElement;
      const alpha = walker ? parseFloat(getComputedStyle(walker).opacity) || 0 : 1;
      if (alpha < 0.05) continue;
      const cx = r.left + r.width / 2;
      const prev = lastPeople.get(name);
      let face = prev ? prev.face : 1;
      if (prev && Math.abs(cx - prev.cx) > 0.4) face = cx > prev.cx ? 1 : -1;
      lastPeople.set(name, { cx, face });
      // The page floats a name tag just above each head, which is a better head anchor than the hit box.
      const tag = walker && walker.querySelector('[class*="_name"]');
      const tr = tag ? tag.getBoundingClientRect() : null;
      const hasTag = !!(tr && tr.height > 0);
      const lifted = !!(tag && tag.style.translate);
      // Hats follow the head in the exact sprite frame on screen; the name tag is only a fallback,
      // because walking frames draw the head lower in the box than the standing ones.
      const head = walker ? headOf(walker) : null;
      const headY = head ? head.y + HAT_SINK : hasTag ? tr.bottom + (lifted ? NAME_LIFT : 0) + 10 : r.top + HAT_DY;
      const hx = head ? head.x : hasTag ? tr.left + tr.width / 2 : cx;
      if (tag && S.xmas && !lifted) tag.style.translate = `0 -${NAME_LIFT}px`;
      out.push({ name, el: b, x: r.left, y: r.top, w: r.width, h: r.height, cx, hx, headY, tagTop: hasTag ? tr.top : null, feetY: r.bottom - 6, face, alpha, walking: !!(head && head.walking), step: head ? head.step : 0 });
    }
    return out;
  }

  // ---------------------------------------------------------------- sound
  let ac = null;
  function ensureAudio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } } }
  function tone(freq, dur, type = 'square', vol = 0.05, to = null, delay = 0) {
    if (!S.sound || !ac) return;
    try {
      const t0 = ac.currentTime + delay;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t0);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* audio is optional */ }
  }
  const sfx = {
    ding() { tone(1046, 0.5, 'sine', 0.08); tone(784, 0.8, 'sine', 0.07, null, 0.22); },
    meow() { tone(620, 0.22, 'sawtooth', 0.035, 380); },
    step() { tone(180, 0.04, 'triangle', 0.02); },
    good() { tone(660, 0.07, 'square', 0.04); tone(990, 0.09, 'square', 0.04, null, 0.06); },
    bad() { tone(160, 0.2, 'sawtooth', 0.05, 90); },
    start() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.09, 'square', 0.04, null, i * 0.08)); },
    gold() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.07, 'square', 0.035, null, i * 0.05)); },
    type() { tone(880, 0.03, 'square', 0.025); },
    over(win) { (win ? [523, 659, 784, 1046, 1318] : [392, 330, 262]).forEach((f, i) => tone(f, 0.12, 'square', 0.035, null, i * 0.11)); }
  };

  // ---------------------------------------------------------------- input
  const MOVE = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
  const typing = e => { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };
  function onKeyDown(e) {
    if (!S.active || typing(e)) return;
    if (S.arcade) { if (S.arcade.key(e, true)) { e.preventDefault(); e.stopPropagation(); } return; }
    const m = MOVE[e.code];
    if (m) { keys.add(m); e.preventDefault(); e.stopPropagation(); return; }
    if (e.code === 'Space' || e.code === 'Enter') { if (!e.repeat) interact(); e.preventDefault(); e.stopPropagation(); }
  }
  function onKeyUp(e) {
    const m = MOVE[e.code];
    if (m) keys.delete(m);
    if (S.arcade) S.arcade.key(e, false);
  }
  const clearKeys = () => keys.clear();

  function pollPad() {
    const none = { x: 0, y: 0, a: false, b: false, bx: false };
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    const label = gp ? '🎮 ' + (gp.id.split('(')[0].trim().slice(0, 22) || 'Controller') : '⌨︎ Keyboard';
    if (label !== S.padLabel) { S.padLabel = label; padChip.textContent = label; }
    if (!gp) return none;
    let x = gp.axes[0] || 0, y = gp.axes[1] || 0;
    if (Math.abs(x) < 0.3) x = 0;
    if (Math.abs(y) < 0.3) y = 0;
    const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = -1; if (b(13)) y = 1;
    return { x, y, a: b(0), b: b(1), bx: b(2) };
  }

  // ---------------------------------------------------------------- fog mirror
  // Hide the page's fog canvas and draw a copy of it, minus everywhere the cat has walked.
  function mirrorFog() {
    const theirs = pageFog();
    if (!theirs || !theirs.width) { fog.style.display = 'none'; return; }
    fog.style.display = 'block';
    if (theirs.style.opacity !== '0') { saved.fogOpacity = theirs.style.opacity; theirs.style.opacity = '0'; }
    if (fog.width !== theirs.width || fog.height !== theirs.height) {
      fog.width = trail.width = theirs.width;
      fog.height = trail.height = theirs.height;
      stamped.clear();
    }
    fctx.globalCompositeOperation = 'source-over';
    fctx.clearRect(0, 0, fog.width, fog.height);
    fctx.drawImage(theirs, 0, 0);
    fctx.globalCompositeOperation = 'destination-out';
    fctx.drawImage(trail, 0, 0);
    fctx.globalCompositeOperation = 'source-over';
  }
  function revealAround(x, y) {
    if (!trail.width) return;
    const k = trail.width / innerWidth;
    const i0 = Math.floor((x - REVEAL_R) / TILE), i1 = Math.floor((x + REVEAL_R) / TILE);
    const j0 = Math.floor((y - REVEAL_R) / TILE), j1 = Math.floor((y + REVEAL_R) / TILE);
    tctx.fillStyle = '#000';
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const id = i + ',' + j;
        if (stamped.has(id)) continue;
        if (Math.hypot((i + 0.5) * TILE - x, (j + 0.5) * TILE - y) > REVEAL_R) continue;
        stamped.add(id);
        tctx.fillRect(Math.floor(i * TILE * k), Math.floor(j * TILE * k), Math.ceil(TILE * k), Math.ceil(TILE * k));
      }
    }
  }
  function restorePageFog() {
    const theirs = pageFog();
    if (theirs) theirs.style.opacity = saved.fogOpacity || '';
    fog.style.display = 'none';
  }

  // ---------------------------------------------------------------- floor 2
  function textNodes(el) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const out = []; let n;
    while ((n = w.nextNode())) if (n.nodeValue.trim()) out.push(n);
    return out;
  }
  function applyXmasDom() {
    const st = stageEl();
    if (st) {
      for (const [k, v] of Object.entries(XMAS_SKIN)) if (st.style.getPropertyValue(k) !== v) st.style.setProperty(k, v);
      st.dataset.floorSkin = 'christmas';
    }
    document.documentElement.dataset.pawFloor = '2';
    for (const sw of XMAS_TEXT) {
      const el = $(sw.sel); if (!el) continue;
      const nodes = textNodes(el);
      if (!nodes.length) continue;
      if (!saved.text.some(s => s.el === el)) saved.text.push({ el, nodes, values: nodes.map(n => n.nodeValue) });
      if (nodes.length >= sw.lines.length) sw.lines.forEach((l, i) => { if (nodes[i].nodeValue !== l) nodes[i].nodeValue = l; });
      else if (nodes[0].nodeValue !== sw.lines.join('\n')) nodes[0].nodeValue = sw.lines.join('\n');
    }
    for (const el of A.rangoliEls) {
      if (!saved.hidden.includes(el)) { saved.hidden.push(el); el.dataset.pxfVis = el.style.visibility || ''; }
      el.style.visibility = 'hidden';
    }
  }
  function applyXmas(on) {
    const st = stageEl();
    if (on) {
      if (st && saved.mainStyle === null) { saved.mainStyle = st.getAttribute('style'); saved.skin = st.dataset.floorSkin; }
      saved.floor = document.documentElement.dataset.pawFloor;
      S.xmas = true;
      applyXmasDom();
      dressTeam('wear');
      if (decor) decor.apply(true);
      fog.style.opacity = '0';
      S.drift = 0;
      locate();
      if (!flakes.length) initSnow();
      spawnGust(46);
      floorLbl.innerHTML = 'Floor <b>2</b> · Christmas';
    } else {
      S.xmas = false;
      if (st && saved.mainStyle !== null) {
        if (saved.mainStyle) st.setAttribute('style', saved.mainStyle); else st.removeAttribute('style');
        if (saved.skin) st.dataset.floorSkin = saved.skin; else delete st.dataset.floorSkin;
      }
      saved.mainStyle = null;
      if (saved.floor) document.documentElement.dataset.pawFloor = saved.floor;
      for (const s of saved.text) s.nodes.forEach((n, i) => { n.nodeValue = s.values[i]; });
      saved.text = [];
      for (const el of saved.hidden) el.style.visibility = el.dataset.pxfVis || '';
      saved.hidden = [];
      document.querySelectorAll('[class*="_walker"] [class*="_name"]').forEach(t => { t.style.translate = ''; });
      dressTeam('off');
      if (decor) decor.apply(false);
      fog.style.opacity = '1';
      gusts.length = 0; prints.length = 0;
      floorLbl.innerHTML = `Floor <b>1</b> · ${floor1Name()}`;
    }
  }

  // ---------------------------------------------------------------- snow
  // Snow falls outside: each flake belongs to a window and lives in that window's glass (0..1 across,
  // CSS px down), so it stays put if the layout moves.
  function newFlake(anywhere) {
    return { win: (Math.random() * Math.max(1, A.windows.length)) | 0, u: Math.random(), y: anywhere ? Math.random() * 60 : -3, vy: rand(9, 26), ph: rand(0, 6.28), sz: Math.random() < 0.25 ? 2 : 1, a: rand(0.6, 1) };
  }
  function initSnow() {
    flakes.length = 0;
    const n = 26 * Math.max(1, A.windows.length);
    for (let i = 0; i < n; i++) flakes.push(newFlake(true));
  }
  function spawnGust(n) {
    if (!A.mat) return;
    for (let i = 0; i < n; i++) {
      gusts.push({ x: A.mat.x + A.mat.w * rand(0.15, 0.85), y: A.mat.y + A.mat.h - 6, vx: rand(-170, 170), vy: -rand(80, 230), age: 0, life: rand(1.4, 2.8), sz: Math.random() < 0.3 ? 2 : 1 });
    }
  }
  function updateWeather(dt) {
    S.snowAmt = clamp(S.snowAmt + (S.xmas ? dt / 1.6 : -dt / 0.8), 0, 1);
    if (S.xmas) S.drift = clamp(S.drift + dt / 8, 0, 1);
    if (S.snowAmt <= 0) return;
    const wind = Math.sin(S.t * 0.25) * 10;
    for (const f of flakes) {
      const w = A.windows[f.win];
      f.y += f.vy * dt;
      if (w) f.u += ((Math.sin(S.t * 0.9 + f.ph) * 6 + wind * 0.5) * dt) / w.w;
      if (f.u < 0) f.u += 1; else if (f.u > 1) f.u -= 1;
      if (!w || f.y > w.h) Object.assign(f, newFlake(false));
    }
    if (S.xmas) { S.gustT -= dt; if (S.gustT <= 0) { S.gustT = rand(3.2, 6); spawnGust(Math.round(rand(14, 26))); } }
    for (let i = gusts.length - 1; i >= 0; i--) {
      const g = gusts[i];
      g.age += dt; g.vx *= 0.985; g.vy += 70 * dt;
      g.x += g.vx * dt; g.y += g.vy * dt;
      if (g.age > g.life) gusts.splice(i, 1);
    }
    for (let i = prints.length - 1; i >= 0; i--) { prints[i].a -= dt / 5; if (prints[i].a <= 0) prints.splice(i, 1); }
  }
  function leavePrint() {
    const lp = cat.lastPrint;
    if (lp && Math.hypot(cat.x - lp.x, cat.y - lp.y) < 20) return;
    cat.printSide *= -1;
    const horiz = cat.dir === 'left' || cat.dir === 'right';
    const p = { x: cat.x + (horiz ? 0 : cat.printSide * 5), y: cat.y - 2 + (horiz ? cat.printSide * 3 : 0), a: 1 };
    prints.push(p); cat.lastPrint = { x: cat.x, y: cat.y };
    if (prints.length > 80) prints.shift();
  }

  // ---------------------------------------------------------------- bubbles + prompt
  function say(target, text, ms = 1600) {
    for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].target === target) { bubbles[i].el.remove(); bubbles.splice(i, 1); }
    const el = document.createElement('div');
    el.className = 'pxf-bubble';
    el.textContent = text;
    ui.appendChild(el);
    bubbles.push({ el, target, until: performance.now() + ms });
  }
  function updateBubbles(people, now) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      let x, y;
      if (b.target === 'cat') { x = cat.x; y = cat.y + cat.top - 6; }
      else { const p = people.find(q => q.name === b.target); if (p) { x = p.hx; y = p.tagTop != null ? p.tagTop - 4 : p.headY - 34; } }
      if (x === undefined || now > b.until) { b.el.remove(); bubbles.splice(i, 1); continue; }
      b.el.style.left = x + 'px'; b.el.style.top = y + 'px';
    }
  }
  function findTarget(people) {
    let best = null, bd = Infinity;
    if (A.arcade) {
      const d = Math.hypot(cat.x - (A.arcade.x + A.arcade.w / 2), cat.y - (A.arcade.y + A.arcade.h + 18));
      if (d < ARCADE_R) { best = { type: 'arcade' }; bd = d; }
    }
    for (const p of people) {
      if (p.alpha < 0.5) continue;
      const d = Math.hypot(cat.x - p.cx, cat.y - p.feetY);
      if (d < MEET_R && d < bd) { best = { type: 'person', p }; bd = d; }
    }
    return best;
  }
  function updatePrompt(target) {
    const show = target && !S.trans && !S.arcade && !cat.sleeping && !bubbles.some(b => b.target === 'cat');
    if (!show) { if (!promptEl.hidden) promptEl.hidden = true; return; }
    // Names come from the page, so build the prompt with text nodes rather than innerHTML.
    const label = target.type === 'arcade' ? 'play the arcade' : `say hi to ${target.p.name}`;
    if (promptEl.dataset.label !== label) {
      promptEl.dataset.label = label;
      const k = document.createElement('kbd');
      k.textContent = 'Space';
      promptEl.replaceChildren(k, document.createTextNode(' ' + label));
    }
    promptEl.hidden = false;
    promptEl.style.left = cat.x + 'px';
    promptEl.style.top = cat.y + cat.top - 6 + 'px';
  }

  // ---------------------------------------------------------------- cat
  function spawnCat() {
    locate();
    cat.x = A.mat.x + A.mat.w / 2;
    cat.y = A.mat.y + A.mat.h - 10;
    cat.dir = 'up'; cat.sleeping = false; cat.idle = 0; cat.hop = 0; cat.nap = null;
    S.onMat = true; S.entering = 0.75;
  }
  // Would (x, y) put the cat inside something? If it's already inside (say the layout just moved), it
  // may walk out.
  function blocked(x, y) {
    for (const r of A.obstacles) if (inRect(x, y, r) && !inRect(cat.x, cat.y, r)) return true;
    return false;
  }

  // ---------------------------------------------------------------- naps
  // Left alone, the cat takes itself off to the warmest spot it can reach and curls up there: the
  // nearest diyas on Floor 1 (the ones on the floor, not on tables), the foot of the tree on Floor 2.
  // It goes round the hiring card and never steps on the doormat, so it can't ride the elevator alone.
  function napSpots() {
    if (S.xmas) return A.tree ? [{ x: A.tree.x, y: A.tree.y + 34 }] : []; // curled up in front of the presents
    const out = [];
    for (const id of NAP_WARM) {
      const el = $(`img[data-skin-decor="${id}"]`);
      const r = el && el.getBoundingClientRect();
      if (!r || r.width < 4 || el.style.visibility === 'hidden') continue;
      // beside it, facing the flame, or just in front; the rangoli lies flat, so beside its middle
      const y = id === 'rangoli' ? r.top + r.height * 0.62 : r.bottom - 2;
      out.push({ x: r.left - 22, y, face: 'right' }, { x: r.right + 22, y, face: 'left' }, { x: r.left + r.width / 2, y: r.bottom + 16 });
    }
    return out;
  }
  const napMinY = () => A.lightY + 22;
  function walkable(x, y, obs) {
    return x >= 18 && x <= innerWidth - 18 && y >= napMinY() && y <= innerHeight - 4 && !obs.some(r => inRect(x, y, r));
  }
  // Does the line from a to b pass through rectangle r? (Just touching an edge doesn't count.)
  function segHits(a, b, r) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const p = [-dx, dx, -dy, dy], q = [a.x - r.x, r.x + r.w - a.x, a.y - r.y, r.y + r.h - a.y];
    let t0 = 0, t1 = 1;
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] <= 0) return false; continue; }
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t0) t0 = t; } else if (t < t1) t1 = t;
      if (t0 >= t1) return false;
    }
    return true;
  }
  // Is the straight line from a to b clear? Anything a is already inside is ignored, so a cat standing
  // close to the furniture can still walk away from it.
  function clearLine(a, b, obs) {
    for (const r of obs) if (!inRect(a.x, a.y, r) && segHits(a, b, r)) return false;
    return true;
  }
  // The shortest walk to the nearest of the targets: straight lines that turn only at the corners of
  // the obstacles. Returns { path, len, target } or null if none can be reached.
  function route(from, targets, obs) {
    const nodes = [from, ...targets];
    for (const r of obs) {
      for (const [x, y] of [[r.x - 3, r.y - 3], [r.x + r.w + 3, r.y - 3], [r.x - 3, r.y + r.h + 3], [r.x + r.w + 3, r.y + r.h + 3]]) {
        if (walkable(x, y, obs)) nodes.push({ x, y });
      }
    }
    const dist = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = nodes.map(() => false);
    dist[0] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) return null;
      if (u >= 1 && u <= targets.length) {
        const path = [];
        for (let i = u; i > 0; i = prev[i]) path.unshift({ x: nodes[i].x, y: nodes[i].y });
        return { path, len: dist[u], target: targets[u - 1] };
      }
      done[u] = true;
      for (let v = 1; v < nodes.length; v++) {
        if (done[v]) continue;
        const d = dist[u] + Math.hypot(nodes[v].x - nodes[u].x, nodes[v].y - nodes[u].y);
        if (d < dist[v] && clearLine(nodes[u], nodes[v], obs)) { dist[v] = d; prev[v] = u; }
      }
    }
  }
  function goNap() {
    // the card and the furniture, and a wide berth round the doormat
    const obs = [inflate(A.card, 4), ...A.obstacles.slice(1)];
    if (A.mat) obs.push(inflate(A.mat, 14));
    // where it lies needs room for its whole body (about 40 px wide)
    const room = [inflate(A.card, 26), ...A.obstacles.slice(1).map(r => inflate(r, 4)), ...(A.mat ? [inflate(A.mat, 24)] : [])];
    const spots = napSpots().filter(s => walkable(s.x, s.y, room));
    const best = spots.length ? route({ x: cat.x, y: cat.y }, spots, obs) : null;
    if (best && best.len > 16) {
      cat.nap = { path: best.path, face: best.target.face, stuck: 0 };
      say('cat', 'yawn…', 1300);
    } else curlUp(best && best.target.face);
  }
  function curlUp(face) {
    cat.nap = null;
    if (face) cat.dir = face;
    cat.sleeping = true;
    say('cat', 'zzz…', 1800);
  }
  // While it sleeps, it opens one eye when someone walks past, and looks their way.
  function updatePeek(people, dt) {
    if (!cat.sleeping) { cat.peek = 0; cat.peekT = 0; return; }
    let side = 0;
    for (const p of people) {
      if (p.walking && Math.hypot(p.cx - cat.x, p.feetY - cat.y) < PEEK_R) { side = p.cx < cat.x ? -1 : 1; break; }
    }
    if (side) { cat.peek = side; cat.peekT = 0.8; }
    else if ((cat.peekT -= dt) <= 0) cat.peek = 0;
  }

  function interact() {
    if (S.trans || S.arcade) return;
    cat.nap = null;
    if (cat.sleeping) { cat.sleeping = false; cat.idle = 0; say('cat', '…mrrp?', 900); return; }
    const t = findTarget(readPeople());
    if (t && t.type === 'arcade') { openArcade(); return; }
    cat.hop = 6; cat.idle = 0; sfx.meow(); // stands up to say hi, then sits back down
    if (t && t.type === 'person') {
      const p = t.p;
      cat.dir = Math.abs(p.cx - cat.x) > Math.abs(p.feetY - cat.y) ? (p.cx < cat.x ? 'left' : 'right') : (p.feetY < cat.y ? 'up' : 'down');
      say('cat', pick(MEOWS), 900);
      setTimeout(() => say(p.name, pick(S.xmas ? HELLO_XMAS : HELLO), 2000), 280);
    } else {
      say('cat', pick(MEOWS), 900);
    }
  }
  function updateCat(dt, pad) {
    let dx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0) + pad.x;
    let dy = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0) + pad.y;
    let pace = 1;
    // Hold still while the elevator doors are shut, then walk in off the doormat.
    if (S.trans) { dx = 0; dy = 0; cat.nap = null; }
    else if (S.entering > 0) { S.entering -= dt; dx = 0; dy = -1; }
    else if (Math.hypot(dx, dy) > 0.1) cat.nap = null; // you took over
    else if (cat.nap) {
      // a sleepy walk along the route to the nap spot
      const p = cat.nap.path[0];
      const d = Math.hypot(p.x - cat.x, p.y - cat.y);
      if (d < 4) { cat.nap.path.shift(); if (!cat.nap.path.length) curlUp(cat.nap.face); }
      else { dx = (p.x - cat.x) / d; dy = (p.y - cat.y) / d; pace = NAP_PACE; }
    }
    const m = Math.hypot(dx, dy);
    const moving = m > 0.1;
    if (moving) {
      if (cat.sleeping) { cat.sleeping = false; }
      dx /= Math.max(1, m); dy /= Math.max(1, m);
      const minY = A.lightY + 22;
      const ox = cat.x, oy = cat.y;
      const nx = clamp(cat.x + dx * SPEED * pace * dt, 18, innerWidth - 18);
      const ny = clamp(cat.y + dy * SPEED * pace * dt, minY, innerHeight - 4);
      if (cat.nap && A.mat && inRect(nx, ny, A.mat, 4)) { curlUp(); return; } // never onto the doormat by itself
      if (!blocked(nx, cat.y)) cat.x = nx;
      if (!blocked(cat.x, ny)) cat.y = ny;
      // if something stops it on the way, it gives up and sleeps where it is
      if (cat.nap) {
        cat.nap.stuck = Math.hypot(cat.x - ox, cat.y - oy) < SPEED * pace * dt * 0.3 ? cat.nap.stuck + dt : 0;
        if (cat.nap.stuck > 1) { curlUp(); return; }
      }
      cat.dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      const before = Math.floor(cat.phase / Math.PI);
      cat.phase += dt * STRIDE_RATE * (pace < 1 ? 0.7 : 1); // a slower stride for the sleepy walk
      if (Math.floor(cat.phase / Math.PI) !== before && S.xmas) sfx.step();
      cat.idle = 0;
      revealAround(cat.x, cat.y);
      if (S.xmas) leavePrint();
    } else {
      cat.phase = 0;
      cat.idle += dt;
      if (cat.idle > IDLE_NAP && !cat.sleeping && !cat.nap && !S.arcade) goNap();
    }
    cat.walk = moving;
    cat.hop = Math.max(0, cat.hop - dt * 26);
    cat.blinkT -= dt;
    if (cat.blinkT <= 0) { cat.blink = 0.13; cat.blinkT = rand(2.4, 5); }
    if (cat.blink > 0) cat.blink -= dt;

    const onMat = inRect(cat.x, cat.y, A.mat, -6);
    if (onMat && !S.onMat && !S.trans) rideElevator();
    S.onMat = onMat;
  }

  // ---------------------------------------------------------------- elevator
  function rideElevator() {
    S.trans = true; clearKeys();
    const to = S.xmas ? 1 : 2;
    const el = document.createElement('div');
    el.id = 'pxf-elev';
    el.innerHTML = `<div class="door l"></div><div class="door r"></div>
      <div class="ind"><div class="arrow">${to === 2 ? '▲' : '▼'}</div><div class="num">${S.xmas ? 2 : 1}</div><div class="lbl">${S.xmas ? 'Christmas' : floor1Name()}</div></div>`;
    ui.appendChild(el);
    topLayer(el);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const T = reduce ? 0.4 : 1;
    requestAnimationFrame(() => el.classList.add('shut'));
    setTimeout(() => {
      sfx.ding();
      $('.num', el).textContent = String(to);
      $('.lbl', el).textContent = to === 2 ? 'Christmas' : floor1Name();
    }, 650 * T);
    setTimeout(() => {
      applyXmas(to === 2);
      spawnCat();
    }, 1150 * T);
    setTimeout(() => el.classList.remove('shut'), 1450 * T);
    setTimeout(() => {
      el.remove(); S.trans = false;
      say('cat', to === 2 ? 'brr! ❄︎' : 'warm again.', 1400);
    }, 2050 * T);
  }

  // ---------------------------------------------------------------- render
  function art(fn) { sctx.setTransform(ART, 0, 0, ART, 0, 0); sctx.imageSmoothingEnabled = false; fn(); sctx.setTransform(1, 0, 0, 1, 0, 0); }
  // Snow seen through the back windows: flakes falling past the glass, a little settling on the
  // sill outside, and frost creeping in from the corners.
  function drawWindowSnow(alpha) {
    if (!A.windows.length) return;
    sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    sctx.globalAlpha = alpha;
    for (const f of flakes) {
      const w = A.windows[f.win]; if (!w || (f.u > 0.47 && f.u < 0.53)) continue; // not over the middle bar
      sctx.fillStyle = `rgba(255,255,255,${f.a})`;
      sctx.fillRect(Math.round(w.x + f.u * (w.w - f.sz)), Math.round(w.y + f.y), f.sz, f.sz);
    }
    const settle = 1 + 2 * S.drift;
    for (const w of A.windows) {
      const x0 = Math.round(w.x), x1 = Math.round(w.x + w.w), yb = Math.round(w.y + w.h);
      // a soft drift on the sill outside, deeper in the middle, in 2px steps like the page's pixels
      for (let x = x0; x < x1; x += 2) {
        const u = (x - x0) / (x1 - x0);
        if (u > 0.47 && u < 0.53) continue; // the middle bar of the window
        const hgt = 2 * Math.round((settle * (0.55 + 0.45 * Math.sin(Math.PI * u)) + 0.8 * (Math.sin(x * 0.31 + w.x) > 0.6 ? 1 : 0)) / 1.5);
        if (hgt <= 0) continue;
        sctx.fillStyle = '#c9d7e6'; sctx.fillRect(x, yb - hgt, 2, hgt);
        sctx.fillStyle = '#f5f8fc'; sctx.fillRect(x, yb - hgt, 2, Math.max(2, hgt - 2));
      }
      // frost: stepped white corners, densest at the bottom
      sctx.fillStyle = 'rgba(235,244,255,0.32)';
      for (let k = 0; k < 4; k++) {
        const s2 = (4 - k) * 2;
        sctx.fillRect(x0, yb - settle - (k + 1) * 2, s2, 2);
        sctx.fillRect(x1 - s2, yb - settle - (k + 1) * 2, s2, 2);
      }
      sctx.fillRect(x0, Math.round(w.y), 4, 2); sctx.fillRect(x1 - 4, Math.round(w.y), 4, 2);
    }
    sctx.globalAlpha = 1;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function render(people) {
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, sprites.width, sprites.height);
    const xa = S.snowAmt;

    // ground layer: snow drifts, tree skirt, paw prints
    if (xa > 0) {
      sctx.globalAlpha = xa;
      art(() => {
        if (drawSnowPile && A.mat) {
          const d = 0.35 + 0.65 * S.drift;
          drawSnowPile(sctx, ax(A.mat.x + 8), ax(A.mat.y + A.mat.h - 2), { w: Math.round(16 + 24 * d), h: Math.round(5 + 9 * d), phase: S.t * 3 });
          drawSnowPile(sctx, ax(A.mat.x + A.mat.w - 8), ax(A.mat.y + A.mat.h - 2), { w: Math.round(16 + 24 * d), h: Math.round(5 + 9 * d), phase: S.t * 3 + 1 });
          drawSnowPile(sctx, ax(A.mat.x + A.mat.w / 2), ax(innerHeight + 2), { w: Math.round(40 + 50 * d), h: Math.round(4 + 6 * d), phase: S.t * 3 + 2 });
        }
        if (drawSnowPile && A.tree) drawSnowPile(sctx, ax(A.tree.x), ax(A.tree.y + 6), { w: 58, h: 8, phase: S.t * 2 });
        if (drawPawPrint) for (const p of prints) { sctx.globalAlpha = xa * p.a * 0.85; drawPawPrint(sctx, ax(p.x), ax(p.y), { color: '#d6e4f0' }); }
      });
      sctx.globalAlpha = 1;
    }

    // depth-sorted things that stand on the floor
    const items = [];
    if (xa > 0 && A.tree) {
      if (drawTree) items.push({ y: A.tree.y, draw: () => { sctx.globalAlpha = xa; drawTree(sctx, ax(A.tree.x), ax(A.tree.y), { phase: S.t * 2.2 }); sctx.globalAlpha = 1; } });
      if (drawGift) {
        const gifts = [[-30, 6, '#c8482f', '#ffd27a', 14, 11], [26, 7, '#2f7d55', '#f4f1e6', 12, 10], [-12, 13, '#3f6fc4', '#ffd27a', 11, 9], [12, 14, '#f2c14e', '#c8482f', 10, 8]];
        for (const [dx, dy, box, ribbon, w, h] of gifts) {
          items.push({ y: A.tree.y + dy, draw: () => { sctx.globalAlpha = xa; drawGift(sctx, ax(A.tree.x + dx * 2), ax(A.tree.y + dy), { w, h, box, ribbon }); sctx.globalAlpha = 1; } });
        }
      }
    }
    if (drawCat) items.push({ y: cat.y, draw: () => {
      // The cat is drawn finer than the props: one cat pixel per CSS px, like the page's own pets.
      sctx.setTransform(CS, 0, 0, CS, 0, 0);
      const r = drawCat(sctx, Math.round((cat.x * DPR) / CS), Math.round((cat.y * DPR) / CS), {
        dir: cat.dir, walk: cat.walk, phase: cat.phase, idle: cat.idle, time: S.t, blink: cat.blink,
        hop: cat.hop, sleeping: cat.sleeping, peek: cat.peek, hat: S.xmas, coat: COAT
      });
      if (r) cat.top = (r.top * CS) / DPR;
      sctx.setTransform(ART, 0, 0, ART, 0, 0);
    } });
    items.sort((a, b) => a.y - b.y);
    art(() => { for (const it of items) { try { it.draw(); } catch (e) { /* keep drawing */ } } });

    // Santa hats on everyone at the party
    if (xa > 0 && drawSantaHat) {
      sctx.globalAlpha = xa;
      const now = performance.now();
      art(() => {
        for (const p of people) {
          sctx.globalAlpha = xa * Math.min(1, p.alpha);
          if (drawSantaHatFlex) drawSantaHatFlex(sctx, ax(p.hx), ax(p.headY), { angle: swayHat(p.name, p.hx, p.headY, p.face, p.walking, p.step, S.dt, now) });
          else drawSantaHat(sctx, ax(p.hx), ax(p.headY), { flip: p.face < 0 });
        }
      });
      sctx.globalAlpha = xa;
      // and one for Paw, the page's own cat, drawn larger to match its chunkier pixels
      const paw = $('.office-hiring .cat');
      const pr = paw && paw.getBoundingClientRect();
      if (pr && pr.width > 0) {
        const PH = Math.max(1, Math.round(3 * DPR));
        sctx.setTransform(PH, 0, 0, PH, 0, 0);
        sctx.imageSmoothingEnabled = false;
        const px = pr.left + pr.width / 2 + 4, py = pr.top + pr.height * 0.1;
        if (drawSantaHatFlex) drawSantaHatFlex(sctx, (px * DPR) / PH, (py * DPR) / PH, { angle: swayHat('#paw', px, py, 1, false, 0, S.dt, now) });
        else drawSantaHat(sctx, (px * DPR) / PH, (py * DPR) / PH, { flip: false });
        sctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      sctx.globalAlpha = 1;
    }

    // snow outside the windows, and the flurries that blow in at the front door
    if (xa > 0) {
      drawWindowSnow(xa);
      art(() => {
        for (const g of gusts) { const a = clamp(1 - g.age / g.life, 0, 1) * xa; sctx.fillStyle = `rgba(245,250,255,${a})`; sctx.fillRect(Math.round(ax(g.x)), Math.round(ax(g.y)), g.sz, g.sz); }
      });
    }
  }

  // ---------------------------------------------------------------- arcade
  // The rules live in src/arcade-sim.js and the drawing in src/arcade-art.js. This part runs the
  // cabinet: input, rounds, sending a score, and the leaderboard.
  const SIM = window.pxfArcadeSim;
  const ARCADE_ART = window.pxfArcadeArt;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage is optional */ } }
  };

  // Leaderboard: the background worker reads leaderboard.json from the GitHub repo (src/background.js).
  // 'ok' fresh · 'cached' last good copy · 'loading' first fetch · 'offline' never loaded · 'off' no extension runtime.
  const BOARD = { status: 'idle', games: null, at: 0, busy: false };
  const BOARD_MAX = 100; // rows per game in leaderboard.json (tools/build-leaderboard.js)
  try {
    const saved = JSON.parse(store.get('pxf:board', 'null'));
    if (saved && saved.games) { BOARD.games = saved.games; BOARD.status = 'cached'; }
  } catch (e) { /* ignore a bad cache */ }
  const runtime = () => {
    try { return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id ? chrome.runtime : null; } catch (e) { return null; }
  };
  function loadBoard() {
    const rt = runtime();
    if (!rt) { if (!BOARD.games) BOARD.status = 'off'; return; }
    if (BOARD.busy || Date.now() - BOARD.at < 60000) return;
    BOARD.busy = true; BOARD.at = Date.now();
    if (!BOARD.games) BOARD.status = 'loading';
    const done = res => {
      BOARD.busy = false;
      if (!res || !res.ok || !res.games) { BOARD.status = BOARD.games ? 'cached' : 'offline'; return; }
      BOARD.games = res.games; BOARD.status = 'ok';
      store.set('pxf:board', JSON.stringify({ games: res.games }));
    };
    try { rt.sendMessage({ type: 'pxf:board' }, res => done(rt.lastError ? null : res)); } catch (e) { done(null); }
  }
  function sendRun(run, cb) {
    const rt = runtime();
    if (!rt) { cb(false); return; }
    try { rt.sendMessage({ type: 'pxf:submit', run }, res => cb(!rt.lastError && !!(res && res.ok))); } catch (e) { cb(false); }
  }

  function openArcade() {
    if (!SIM || !ARCADE_ART) return;
    clearKeys();
    S.arcade = new Arcade();
    cat.idle = 0;
  }
  class Arcade {
    constructor() {
      this.game = S.xmas ? 'gift' : 'fish';
      this.label = this.game === 'gift' ? 'Gift Catcher' : 'Fish Catcher';
      this.best = +store.get('pxf:best:' + this.game, this.game === 'fish' ? store.get('pxf:best', 0) : 0) || 0;
      this.name = store.get('pxf:name', '').replace(/[^A-Z0-9 ]/g, '').slice(0, 10);
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.root = document.createElement('div');
      this.root.id = 'pxf-arcade';
      this.root.innerHTML = `<div class="cab" role="dialog" aria-modal="true" aria-label="${this.label} arcade">
        <canvas role="img" aria-label="${this.label}"></canvas>
        <button type="button" class="exit" aria-label="Close the arcade (Esc)"></button>
        <p class="pxf-sr" aria-live="polite"></p></div>`;
      ui.appendChild(this.root);
      topLayer(this.root);
      this.cv = $('canvas', this.root);
      this.cv.width = ARCADE_ART.CAB.W; this.cv.height = ARCADE_ART.CAB.H;
      this.ctx = this.cv.getContext('2d');
      this.exitBtn = $('.exit', this.root);
      this.live = $('.pxf-sr', this.root);
      this.exitBtn.addEventListener('click', () => this.close());
      this.root.addEventListener('click', e => { if (e.target === this.root) this.close(); });
      this.onResize = () => this.fit();
      window.addEventListener('resize', this.onResize);
      this.left = false; this.right = false; this.mv = 0; this.pressA = 0; this.pressB = 0;
      this.state = 'title'; this.t = 0; this.acc = 0; this.sim = null; this.moves = null; this.over = null;
      this.cat = { x: SIM.W / 2, dir: 'down', walk: false, phase: 0, idle: 2, hop: 0, hopT: 0 };
      this.fx = []; this.shake = 0; this.flash = 0;
      this.fit();
      this.say(`${this.label}. Press Space to play.`);
      loadBoard();
    }
    // Scale the cabinet by a whole number of device pixels so every art pixel is the same size.
    fit() {
      const dpr = window.devicePixelRatio || 1, { W, H, exit } = ARCADE_ART.CAB;
      const fitK = Math.floor(Math.min(((innerWidth - 32) * dpr) / W, ((innerHeight - 64) * dpr) / H));
      const k = Math.max(1, Math.min(fitK, Math.floor(4 * dpr))); // at most 4 CSS px per art pixel
      const u = k / dpr;
      // the page sets `canvas { width: 100% !important; height: 100% !important }`, which beats a
      // plain inline size and leaves the cabinet at 1 CSS px per art pixel
      this.cv.style.setProperty('width', `${W * u}px`, 'important');
      this.cv.style.setProperty('height', `${H * u}px`, 'important');
      Object.assign(this.exitBtn.style, { left: `${exit.x * u}px`, top: `${exit.y * u}px`, width: `${exit.w * u}px`, height: `${exit.h * u}px` });
    }
    say(msg) { this.live.textContent = msg; }
    key(e, down) {
      const c = e.code;
      const o = this.over;
      if (down && o && o.phase === 'name') {
        if (c === 'Enter' || c === 'NumpadEnter') { if (!e.repeat) { this.pressA = 0.15; this.submit(); } return true; }
        if (c === 'Escape') { this.back(); return true; }
        if (c === 'Backspace') { o.name = o.name.slice(0, -1); return true; }
        const ch = e.key && e.key.length === 1 ? e.key.toUpperCase() : '';
        if (/^[A-Z0-9 ]$/.test(ch) && o.name.length < 10 && !(ch === ' ' && !o.name)) { o.name += ch; sfx.type(); }
        return true; // typing a name: every key belongs to the arcade
      }
      if (c === 'ArrowLeft' || c === 'KeyA') { this.left = down; return true; }
      if (c === 'ArrowRight' || c === 'KeyD') { this.right = down; return true; }
      // after a round: Enter sends the score, Space plays again
      if (down && o && o.phase === 'offer' && (c === 'Enter' || c === 'NumpadEnter')) {
        if (!e.repeat && this.settled()) { this.pressA = 0.15; this.ask(); }
        return true;
      }
      if (c === 'Space' || c === 'Enter') {
        if (down) { this.pressA = 0.15; if (!e.repeat && this.state !== 'play' && (!o || o.phase !== 'sending') && this.settled()) this.start(); }
        return true;
      }
      if (down && c === 'Escape') { this.pressB = 0.15; this.close(); return true; }
      return c === 'ArrowUp' || c === 'ArrowDown' || c === 'KeyW' || c === 'KeyS';
    }
    pad(p) {
      const o = this.over;
      if (o && o.phase === 'name') {
        if (p.a && !S.padA) this.submit();
        if (p.b && !S.padB) this.back();
        return 0;
      }
      if (o && o.phase === 'offer' && p.bx && !S.padX && this.settled()) { this.ask(); return 0; }
      if (p.a && !S.padA && this.state !== 'play' && this.settled()) this.start();
      if (p.b && !S.padB) { this.close(); return 0; }
      return p.x < -0.3 ? -1 : p.x > 0.3 ? 1 : 0;
    }
    start() {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      this.sim = SIM.create(this.game, seed);
      this.moves = []; this.acc = 0; this.fx = []; this.over = null;
      this.state = 'play';
      sfx.start();
      this.say('Go. Left and right arrows to move.');
      loadBoard();
    }
    update(dt, p) {
      this.t += dt;
      const padMv = this.pad(p);
      if (S.arcade !== this) return; // the pad closed it
      this.mv = (this.right ? 1 : 0) - (this.left ? 1 : 0) || padMv;
      if (this.state === 'play') {
        // fixed 1/60 s steps, so the round can be replayed exactly from its moves
        this.acc += dt;
        let n = 0;
        while (this.acc >= SIM.DT && n < 4) {
          this.acc -= SIM.DT; n++;
          this.moves.push(this.mv);
          SIM.step(this.sim, this.mv);
          for (const ev of this.sim.events) this.event(ev);
          if (this.sim.over) { this.finish(); break; }
        }
        if (n === 4) this.acc = 0;
      }
      const k = this.cat, moving = this.state === 'play' && this.sim.mv !== 0;
      k.x = this.sim ? this.sim.x : SIM.W / 2;
      if (moving) { k.dir = this.sim.mv < 0 ? 'left' : 'right'; k.walk = true; k.phase += dt * STRIDE_RATE; k.idle = 0; }
      else { k.walk = false; k.idle += dt; if (k.idle > 0.6 || this.state !== 'play') k.dir = 'down'; }
      k.hopT = Math.max(0, k.hopT - dt);
      k.hop = k.hopT > 0 ? Math.round(7 * Math.sin(Math.PI * (1 - k.hopT / 0.3))) : 0;
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt * 3);
      this.pressA = Math.max(0, this.pressA - dt);
      this.pressB = Math.max(0, this.pressB - dt);
      if (this.fx.length) this.fx = this.fx.filter(f => this.t - f.t0 < f.life);
    }
    event(ev) {
      const it = ev.it;
      if (ev.type === 'catch') {
        const gold = ev.pts === 3;
        if (gold) sfx.gold(); else sfx.good();
        this.fx.push({ type: 'pop', x: it.x, y: it.y - 8, t0: this.t, life: 0.8, text: '+' + ev.pts, gold });
        this.fx.push({ type: 'spark', x: it.x, y: it.y, t0: this.t, life: 0.45, n: gold ? 12 : 7, seed: it.id, kind: gold ? 'gold' : 'good' });
      } else if (ev.type === 'hit') {
        sfx.bad();
        this.flash = 1;
        if (!this.reduced) this.shake = 0.3;
        this.cat.hopT = 0.3;
        this.fx.push({ type: 'pop', x: it.x, y: it.y - 10, t0: this.t, life: 0.9, text: 'OUCH', bad: true });
        this.fx.push({ type: 'spark', x: it.x, y: it.y, t0: this.t, life: 0.35, n: 6, seed: it.id, kind: 'bad' });
      } else if (ev.type === 'miss' && it.kind !== 'bad') {
        this.fx.push({ type: 'puff', x: it.x, y: SIM.GROUND, t0: this.t, life: 0.35 });
      }
    }
    finish() {
      const s = this.sim, score = s.score;
      const newBest = score > this.best;
      if (newBest) { this.best = score; store.set('pxf:best:' + this.game, String(score)); }
      // Any score of 1 or more can go to the leaderboard, so the arcade asks as soon as the round ends.
      // The board, once it has loaded, only adds where the score would land. If the extension was
      // reloaded under this page, its runtime is gone and nothing can be sent until the page reloads.
      const canSend = !!runtime();
      const offer = canSend && score > 0;
      const known = (BOARD.status === 'ok' || BOARD.status === 'cached') && !!BOARD.games;
      const rows = known ? BOARD.games[this.game] || [] : [];
      // The board keeps each player's best. If your name already has an equal or better score, this
      // round wouldn't move you; otherwise say where it would land (ignoring your own older row).
      const mine = rows.find(r => r.name === this.name);
      const behind = offer && mine && mine.score >= score ? mine.score : 0;
      const others = rows.filter(r => r !== mine);
      let rank = -1;
      if (offer && known && !behind) {
        rank = others.findIndex(r => score > r.score);
        if (rank < 0) rank = rows.length >= BOARD_MAX ? -1 : others.length; // below a full board: unknown
      }
      s.items = [];
      this.state = 'over';
      this.overAt = this.t;
      this.over = {
        score, out: s.lives <= 0, newBest, rank, behind, listed: canSend, stale: !canSend,
        phase: offer ? 'offer' : 'plain',
        name: this.name,
        run: { v: 1, rules: SIM.RULES, game: this.game, score, seed: s.seed, steps: s.t, moves: SIM.encode(this.moves) }
      };
      sfx.over(newBest || (rank >= 0 && rank < 3));
      const where = rank === 0 ? ' That would be the top score.' : rank > 0 ? ` That would rank number ${rank + 1}.` : '';
      this.say(offer
        ? `Score ${score}.${newBest ? ' New best.' : ''}${where} Add it to the leaderboard? Press Enter for yes, or Space to play again. It opens a GitHub issue.`
        : score > 0 && !canSend
          ? `Score ${score}. Reload the page to send scores. Press Space to play again.`
          : `Score ${score}.${newBest ? ' New best.' : ''} Press Space to play again.`);
    }
    // A moment after a round ends, so a key still held from the round doesn't skip the result.
    settled() { return !this.over || this.t - (this.overAt || 0) > 0.6; }
    ask() {
      this.over.phase = 'name';
      this.say('Type your name, up to 10 letters, then press Enter to open GitHub. Escape goes back.');
    }
    back() {
      this.over.phase = 'offer';
      this.say('Add it to the leaderboard? Press Enter for yes, or Space to play again.');
    }
    submit() {
      const o = this.over;
      const name = o.name.trim();
      if (!name) { sfx.bad(); return; }
      this.name = name;
      store.set('pxf:name', name);
      o.phase = 'sending';
      sendRun({ ...o.run, name }, ok => {
        if (S.arcade !== this || this.over !== o) return;
        o.phase = ok ? 'sent' : 'failed';
        this.say(ok ? 'GitHub opened in a new tab. Press Create there to add your score.' : "Couldn't open GitHub. Press Space to play again.");
      });
    }
    draw() {
      ARCADE_ART.render(this.ctx, {
        game: this.game, t: this.t, state: this.state, sim: this.sim, cat: this.cat, coat: COAT,
        best: this.best, fx: this.fx, mv: this.mv, pressA: this.pressA > 0, pressB: this.pressB > 0,
        shakeX: this.shake > 0 ? Math.round(rand(-2, 2)) : 0, flash: this.flash,
        board: { status: BOARD.status, rows: BOARD.games ? BOARD.games[this.game] || [] : [], me: this.name },
        over: this.over
      });
    }
    close() {
      window.removeEventListener('resize', this.onResize);
      this.root.remove();
      S.arcade = null;
      clearKeys();
      const score = this.over ? this.over.score : 0;
      say('cat', score ? `${score}! not bad.` : 'mrrp.', 1400);
    }
  }

  // ---------------------------------------------------------------- loop
  function sizeCanvases() {
    DPR = window.devicePixelRatio || 1;
    ART = Math.max(1, Math.round(2 * DPR)); // props: 2 CSS px per art pixel
    CS = Math.max(1, Math.round(DPR));      // the cat: 1 CSS px per pixel, matching the page's pets
    const w = Math.round(innerWidth * DPR), h = Math.round(innerHeight * DPR);
    if (sprites.width !== w || sprites.height !== h) { sprites.width = w; sprites.height = h; }
  }
  function frame(now) {
    S.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (S.last || now)) / 1000);
    S.last = now; S.t += dt; S.dt = dt;
    if (!S.active) return;
    sizeCanvases();
    if (now - S.lastLocate > 1000) { S.lastLocate = now; locate(); if (S.xmas) applyXmasDom(); }
    const pad = pollPad();
    if (S.arcade) { S.arcade.update(dt, pad); if (S.arcade) S.arcade.draw(); }
    else {
      updateCat(dt, pad);
      if (pad.a && !S.padA) interact();
    }
    S.padA = pad.a; S.padB = pad.b; S.padX = pad.bx;
    if (S.xmas && decor) decor.tick(now);
    if (now - (S.lastDress || 0) > 250) { S.lastDress = now; dressTeam(S.xmas ? 'wear' : 'prepare'); }
    const people = readPeople();
    updatePeek(people, dt);
    updateWeather(dt);
    mirrorFog();
    render(people);
    updateBubbles(people, now);
    updatePrompt(S.arcade ? null : findTarget(people));
  }

  function activate() {
    ensureAudio();
    if (ac && ac.state === 'suspended') ac.resume();
    syncTheme();
    S.active = true;
    launchBtn.hidden = true;
    hud.hidden = false;
    spawnCat();
    say('cat', 'mrrp! 🐾', 1400);
  }
  function deactivate() {
    if (S.arcade) S.arcade.close();
    if (S.xmas) applyXmas(false);
    S.snowAmt = 0;
    S.active = false;
    clearKeys();
    restorePageFog();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, sprites.width, sprites.height);
    bubbles.splice(0).forEach(b => b.el.remove());
    promptEl.hidden = true;
    hud.hidden = true;
    launchBtn.hidden = false;
  }

  launchBtn.addEventListener('click', activate);
  homeBtn.addEventListener('click', deactivate);
  soundBtn.addEventListener('click', () => {
    S.sound = !S.sound;
    soundBtn.textContent = S.sound ? 'Sound on' : 'Sound off';
    soundBtn.setAttribute('aria-pressed', String(S.sound));
  });
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', clearKeys);
  window.addEventListener('resize', () => { locate(); if (S.xmas) initSnow(); });
  syncTheme();
  S.raf = requestAnimationFrame(frame);

  window.__pocketXmasFloor = {
    teardown() {
      deactivate();
      cancelAnimationFrame(S.raf);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', clearKeys);
      fog.remove(); sprites.remove(); ui.remove();
    },
    // handy while tuning in DevTools
    state: S, cat, anchors: A, keys, activate, rideElevator, openArcade
  };
})();
