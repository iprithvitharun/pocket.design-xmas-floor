/*
 * Christmas decor that takes the place of the Diwali decor on Floor 2.
 *
 * The page's own decor images stay where they are; each one gets a Christmas counterpart drawn
 * into it through CSS `content` (which replaces what an <img> shows), so the page keeps its own
 * layout, scale and layering: furniture still stands in front of the garland, people still walk
 * in front of the candles.
 *
 *   marigold toran        -> pine garland with red bows, baubles and twinkling warm bulbs
 *   diya                  -> red candle in a sprig of holly
 *   ring of diyas         -> Advent wreath
 *   plate of diyas        -> plate of gingerbread cookies
 *   box of mithai         -> gingerbread house
 *   Coco's marigold crown -> reindeer antlers
 *   Evie's crown, Zima's marigold collar -> holly (the marigolds turn into red berries)
 *   Goldie's kurta        -> a red knitted dog jumper
 *   paper star lanterns   -> stay up, turned Christmas red (Christmas stars, as hung in Kerala and Goa)
 *
 * The page labels its festival decor (data-skin-decor="toran-left", "diya-work", ...); the image's
 * natural size is the fallback. New art is original pixel art on a grid of about 2.25 CSS px like the
 * page's own; the recoloured pieces keep the page's own shapes.
 *
 * window.pxfDecor.apply(on)  dress or undress the room
 * window.pxfDecor.tick(now)  advance twinkles and flames (call every frame while on Floor 2)
 */
(function () {
  'use strict';

  const ART_CSS = 2.25; // CSS px per art pixel, to match the page

  // ------------------------------------------------------------------ palette
  const C = {
    ink: '#2b1d1a',
    pineD: '#1d4632', pine: '#2c6a45', pineL: '#4c8f55', pineH: '#86b86a',
    redD: '#7a1f2b', red: '#b8333b', redL: '#e0605a',
    goldD: '#9c6a1e', gold: '#d9a23a', goldL: '#f6d77a',
    cream: '#f3ead8', creamD: '#cfc3ad', white: '#ffffff',
    flameO: '#e8833a', flame: '#f6c453', flameC: '#fff4c2',
    bulbOff: '#a77a3a', bulb: '#ffe9a8',
    ginger: '#b06a35', gingerL: '#d79457', gingerD: '#7d4622',
    plate: '#f1e9da', plateD: '#c9bca5',
    choc: '#5b3a29', candyG: '#3f8f57', window: '#ffd66b', windowD: '#e09a2e',
    waxW: '#f6efe2', waxWD: '#d9ccb6'
  };

  // ------------------------------------------------------------------ a tiny pixel grid
  function Grid(w, h) {
    const px = new Array(w * h).fill(null);
    const g = {
      w, h, px,
      set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = c; },
      get(x, y) { return x >= 0 && y >= 0 && x < w && y < h ? px[y * w + x] : null; },
      rect(x, y, rw, rh, c) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) g.set(x + i, y + j, c); },
      ell(cx, cy, rx, ry, c) {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
          if (dx * dx + dy * dy <= 1) g.set(x, y, c);
        }
      },
      // a 1px dark outline around everything drawn so far
      outline(c) {
        const add = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (px[y * w + x]) continue;
          if (g.get(x - 1, y) || g.get(x + 1, y) || g.get(x, y - 1) || g.get(x, y + 1)) add.push(y * w + x);
        }
        for (const i of add) px[i] = c || C.ink;
      }
    };
    return g;
  }
  // deterministic noise so textures don't change between frames
  const hash = (x, y, s) => { let n = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };

  // Render a grid at the size the page shows the image (device pixels), nearest-neighbour.
  async function toUrl(g, cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.round(cssW * dpr)), H = Math.max(1, Math.round(cssH * dpr));
    const small = new OffscreenCanvas(g.w, g.h), s = small.getContext('2d');
    for (let i = 0; i < g.px.length; i++) if (g.px[i]) { s.fillStyle = g.px[i]; s.fillRect(i % g.w, (i / g.w) | 0, 1, 1); }
    const big = new OffscreenCanvas(W, H), b = big.getContext('2d');
    b.imageSmoothingEnabled = false;
    b.drawImage(small, 0, 0, W, H);
    return URL.createObjectURL(await big.convertToBlob({ type: 'image/png' }));
  }

  // ------------------------------------------------------------------ the pieces
  // Pine garland swagging between bows, with baubles and a string of warm bulbs. frame: twinkle step.
  function garland(w, h, frame) {
    const g = Grid(w, h);
    const anchors = [3, Math.round(w * 0.34), Math.round(w * 0.66), w - 4];
    const top = 5, sag = Math.min(h - 18, Math.round(h * 0.34));
    const yAt = x => {
      for (let i = 0; i < anchors.length - 1; i++) if (x >= anchors[i] && x <= anchors[i + 1]) {
        const u = (x - anchors[i]) / (anchors[i + 1] - anchors[i]);
        return top + sag * Math.sin(Math.PI * u);
      }
      return top;
    };
    // the swag: a thick, needly band
    for (let x = 0; x < w; x++) {
      const yc = yAt(x);
      for (let d = -4; d <= 4; d++) {
        const y = Math.round(yc + d), r = hash(x, y, 1);
        if (Math.abs(d) === 4 && r > 0.45) continue;     // ragged edges: needle tips
        let c = d < -1 ? C.pineL : d > 1 ? C.pineD : C.pine;
        if (r > 0.82) c = C.pineH; else if (r < 0.16) c = C.pineD;
        g.set(x, y, c);
      }
      if (hash(x, 0, 2) > 0.72) g.set(x, Math.round(yc + 5), C.pineD); // stray needles below
    }
    // baubles hang under each swag
    const baubleCols = [C.red, C.gold, C.cream];
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i], b = anchors[i + 1];
      [[0.5, 3.2, 8], [0.25, 2.2, 5], [0.75, 2.2, 5]].forEach(([u, r, drop], j) => {
        const x = Math.round(a + (b - a) * u), y0 = Math.round(yAt(x) + 4);
        for (let k = 0; k < drop - r; k++) g.set(x, y0 + k, C.goldD);
        const cy = y0 + drop, col = baubleCols[(i + j) % 3];
        g.ell(x + 0.5, cy, r, r, col);
        g.set(x - 1, cy - 1, col === C.cream ? C.white : col === C.gold ? C.goldL : C.redL);
        g.rect(x, Math.round(cy - r) - 1, 1, 1, C.goldD);
      });
    }
    // bows over the anchors
    for (const ax of anchors) {
      const y = top - 1;
      g.ell(ax - 2.5, y, 2.6, 2, C.red); g.ell(ax + 3.5, y, 2.6, 2, C.red);
      g.rect(ax, y - 1, 2, 3, C.redD);
      for (let k = 0; k < 5; k++) { g.set(ax - 1 - (k > 2 ? 1 : 0), y + 2 + k, C.red); g.set(ax + 2 + (k > 2 ? 1 : 0), y + 2 + k, C.red); }
      g.set(ax - 3, y - 1, C.redL); g.set(ax + 3, y - 1, C.redL);
    }
    g.outline();
    // bulbs along the swag, twinkling in a few groups
    for (let x = 6, n = 0; x < w - 4; x += 9, n++) {
      const y = Math.round(yAt(x) - 1 + ((n % 2) ? 2 : 0));
      const lit = (n + frame) % 3 !== 0;
      g.set(x, y, lit ? C.bulb : C.bulbOff);
      g.set(x, y + 1, lit ? C.bulb : C.bulbOff);
      if (lit) { g.set(x - 1, y, 'rgba(255,214,120,0.55)'); g.set(x + 1, y, 'rgba(255,214,120,0.55)'); g.set(x, y - 1, 'rgba(255,214,120,0.45)'); }
    }
    return g;
  }

  // a flame, 3 px tall, that leans a little differently each frame
  function flame(g, x, y, frame) {
    const lean = [0, 1, 0, -1][frame % 4];
    g.set(x + lean, y - 3, C.flameO);
    g.set(x, y - 2, C.flame); g.set(x + lean, y - 2, C.flame);
    g.set(x, y - 1, C.flameC);
    g.set(x - 1, y - 1, C.flameO); g.set(x + 1, y - 1, C.flameO);
  }
  function hollyLeaf(g, x, y, dir) {
    for (let i = 0; i < 6; i++) {
      const yy = y + (i === 0 || i === 5 ? 0 : i % 2 ? -1 : 0);
      g.set(x + dir * i, yy, C.pine); g.set(x + dir * i, yy + 1, i > 0 && i < 5 ? C.pineD : C.pine);
    }
    g.set(x + dir * 2, y, C.pineL);
  }
  function berries(g, x, y) { g.set(x, y, C.red); g.set(x + 1, y + 1, C.red); g.set(x - 1, y + 1, C.redD); g.set(x, y, C.redL); }

  // Red candle in holly.
  function candle(w, h, frame) {
    const g = Grid(w, h);
    const cx = Math.floor(w / 2), base = h - 2;
    const ch = Math.max(4, Math.round(h * 0.5)), cw = 4;
    g.rect(cx - cw / 2, base - ch, cw, ch, C.red);
    g.rect(cx - cw / 2, base - ch, 1, ch, C.redL);
    g.rect(cx + cw / 2 - 1, base - ch, 1, ch, C.redD);
    g.rect(cx - cw / 2, base - ch, cw, 1, C.redL);
    g.set(cx, base - ch - 1, C.ink); // wick
    hollyLeaf(g, cx - 2, base - 1, -1); hollyLeaf(g, cx + 1, base - 1, 1);
    berries(g, cx, base - 1);
    g.outline();
    flame(g, cx, base - ch - 1, frame);
    return g;
  }

  // Advent wreath: an evergreen ring seen at an angle (a clear hole in the middle), four candles.
  function advent(w, h, frame) {
    const g = Grid(w, h);
    const cx = w / 2, cy = h - Math.max(5, Math.round(h * 0.3)), rx = w / 2 - 3, ry = Math.max(3.5, h * 0.2);
    const ch = Math.max(5, Math.round(h * 0.42));
    const spots = [0.62, 0.38, 1.25, 1.85].map(f => f * Math.PI); // back right, back left, front left, front right
    const at = t => [Math.round(cx + Math.cos(t + Math.PI) * rx * 0.72), Math.round(cy + Math.sin(t + Math.PI) * ry * 0.72)];
    const drawCandle = (t, i) => {
      const [x, yb] = at(t), hh = ch - (i % 2);
      g.rect(x - 1, yb - hh, 3, hh, C.waxW); g.rect(x + 1, yb - hh, 1, hh, C.waxWD); g.set(x - 1, yb - hh, C.white);
      g.set(x, yb - hh - 1, C.ink);
    };
    const back = spots.filter(t => Math.sin(t + Math.PI) < 0), front = spots.filter(t => Math.sin(t + Math.PI) >= 0);
    back.forEach(drawCandle);
    // the ring: little bunches of needles placed round an ellipse
    for (let k = 0; k < 64; k++) {
      const t = (k / 64) * Math.PI * 2;
      const x = cx + Math.cos(t) * rx, y = cy + Math.sin(t) * ry;
      const lower = Math.sin(t) > 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > 5) continue;
        const r = hash(Math.round(x + dx), Math.round(y + dy), 3);
        let c = lower ? C.pine : C.pineL;
        if (dy > 0) c = C.pineD; if (r > 0.86) c = C.pineH; else if (r < 0.1) c = C.pineD;
        g.set(x + dx, y + dy, c);
      }
    }
    for (let a = 0; a < 6; a++) { const t = a / 6 * Math.PI * 2 + 0.3; berries(g, Math.round(cx + Math.cos(t) * rx), Math.round(cy + Math.sin(t) * ry)); }
    // a red bow at the front
    g.ell(cx - 2, cy + ry + 0.5, 1.8, 1.4, C.red); g.ell(cx + 2, cy + ry + 0.5, 1.8, 1.4, C.red); g.set(Math.round(cx), Math.round(cy + ry), C.redD);
    front.forEach((t, i) => drawCandle(t, i + 2));
    g.outline();
    spots.forEach((t, i) => { const [x, yb] = at(t); flame(g, x, yb - (ch - (i % 2)) - 1, frame + i); });
    return g;
  }

  function gingerbreadMan(g, x, y) {
    g.ell(x + 2.5, y + 1.5, 1.6, 1.6, C.ginger);            // head
    g.rect(x + 1, y + 3, 3, 3, C.ginger);                    // body
    g.set(x, y + 3, C.ginger); g.set(x + 4, y + 3, C.ginger); // arms
    g.set(x + 1, y + 6, C.ginger); g.set(x + 3, y + 6, C.ginger); // legs
    g.set(x + 2, y + 1, C.choc);                              // face
    g.set(x + 2, y + 4, C.white);                             // icing button
    g.set(x + 1, y + 3, C.gingerL);
  }
  function starCookie(g, x, y) {
    g.rect(x + 1, y, 1, 5, C.ginger); g.rect(x, y + 1, 3, 3, C.ginger); g.rect(x - 1, y + 2, 5, 1, C.ginger);
    g.set(x + 1, y + 2, C.white); g.set(x + 1, y + 1, C.gingerL);
  }

  // Plate of gingerbread cookies.
  function cookies(w, h) {
    const g = Grid(w, h);
    const cx = w / 2, cy = h * 0.62, rx = w / 2 - 1.5, ry = h * 0.32;
    g.ell(cx, cy + 1, rx, ry, C.plateD);
    g.ell(cx, cy, rx, ry, C.plate);
    g.ell(cx, cy, rx - 2, ry - 1.5, C.creamD);
    g.ell(cx, cy - 0.5, rx - 2.5, ry - 2, C.plate);
    gingerbreadMan(g, Math.round(cx - rx * 0.62), Math.round(cy - 6));
    gingerbreadMan(g, Math.round(cx + 0.5), Math.round(cy - 6.5));
    starCookie(g, Math.round(cx - 2), Math.round(cy - 1));
    g.outline();
    return g;
  }

  // Gingerbread house with an iced roof and lit windows.
  function gingerHouse(w, h, frame) {
    const g = Grid(w, h);
    const bx = 2, bw = w - 4, groundY = h - 2;
    g.rect(bx - 1, groundY - 1, bw + 2, 2, C.cream);              // snowy board
    const wallTop = Math.round(h * 0.5), wallH = groundY - 1 - wallTop;
    g.rect(bx + 1, wallTop, bw - 2, wallH, C.ginger);
    g.rect(bx + 1, wallTop, 1, wallH, C.gingerL);
    g.rect(bx + bw - 2, wallTop, 1, wallH, C.gingerD);
    // roof: two slopes meeting at the ridge, thick white icing on the eaves
    const ridgeY = Math.round(h * 0.12), mid = w / 2;
    for (let y = ridgeY; y <= wallTop + 1; y++) {
      const half = Math.round((y - ridgeY) / (wallTop + 1 - ridgeY) * (bw / 2 + 1));
      for (let x = Math.round(mid - half); x <= Math.round(mid + half); x++) g.set(x, y, y > wallTop - 1 ? C.white : (x + y) % 3 === 0 ? C.gingerD : C.ginger);
    }
    for (let y = ridgeY; y <= wallTop + 1; y++) { const half = Math.round((y - ridgeY) / (wallTop + 1 - ridgeY) * (bw / 2 + 1)); g.set(Math.round(mid - half), y, C.white); g.set(Math.round(mid + half), y, C.white); }
    g.rect(Math.round(mid) - 1, ridgeY - 1, 2, 1, C.white);
    g.rect(Math.round(mid + bw * 0.22), ridgeY + 1, 2, 3, C.redD);   // chimney
    // candy dots along the eaves
    for (let x = bx + 1, i = 0; x < bx + bw - 1; x += 3, i++) g.set(x, wallTop + 2, i % 2 ? C.red : C.candyG);
    // door and windows (lit, gently flickering)
    const doorW = 3, doorH = Math.max(3, Math.round(wallH * 0.55));
    g.rect(Math.round(mid) - 1, groundY - 1 - doorH, doorW, doorH, C.redD);
    g.set(Math.round(mid) + 1, groundY - 1 - Math.round(doorH / 2), C.goldL);
    const lit = frame % 2 ? C.window : C.windowD;
    g.rect(bx + 2, wallTop + 4, 2, 2, lit); g.rect(bx + bw - 4, wallTop + 4, 2, 2, lit);
    g.outline();
    return g;
  }

  // Reindeer antlers on a red headband with a sprig of holly, for a dog's head.
  function antlers(w, h) {
    const g = Grid(w, h);
    // the band sits at the bottom of the box; the box itself is lifted (see PIECES) so the band rests
    // on top of the head and the antlers rise above it
    const cx = (w - 1) / 2, band = h - 3;
    // the headband follows the curve of the head
    for (let x = Math.round(w * 0.16); x <= Math.round(w * 0.84); x++) {
      const u = (x - cx) / (w * 0.34), y = Math.round(band + u * u * 2);
      g.set(x, y, C.red); g.set(x, y + 1, C.redD); g.set(x, y - 1, C.redL);
    }
    const BR = '#9a6a3e', BRL = '#c99a62', BRD = '#6b4426';
    const beam = (dir) => {
      const x0 = cx + dir * w * 0.22;
      const pts = [];
      for (let i = 0; i <= band - 1; i++) { const t = i / (band - 1); pts.push([x0 + dir * (Math.sin(t * 1.4) * w * 0.12), band - 1 - i]); }
      for (const [x, y] of pts) { g.set(x, y, BR); g.set(x - dir, y, BRL); }
      // two tines branching outward, and one inward near the top
      const tine = (k, len, out) => { const [x, y] = pts[Math.min(pts.length - 1, k)]; for (let j = 1; j <= len; j++) { g.set(x + dir * out * j, y - j, BR); g.set(x + dir * out * j, y - j + 1, BRD); } };
      tine(Math.round(pts.length * 0.35), Math.max(2, Math.round(h * 0.18)), 1);
      tine(Math.round(pts.length * 0.62), Math.max(2, Math.round(h * 0.16)), 1);
      tine(Math.round(pts.length * 0.8), Math.max(1, Math.round(h * 0.12)), -1);
    };
    beam(-1); beam(1);
    // holly at the middle of the band
    hollyLeaf(g, Math.round(cx) - 1, band - 1, -1); hollyLeaf(g, Math.round(cx) + 1, band - 1, 1);
    berries(g, Math.round(cx), band - 1);
    g.outline();
    return g;
  }

  // ------------------------------------------------------------------ recolouring the page's own pieces
  function rgb2hsv(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return [h, mx ? d / mx : 0, mx / 255];
  }
  const hex3 = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const scaleTo = (c, k) => (k <= 1 ? c.map(v => v * k) : c.map(v => v + (255 - v) * Math.min(1, (k - 1) * 0.9)));
  // marigold (orange, yellow) becomes holly berry red; the leaves are already holly green
  function holly(d) {
    const R = [hex3(C.redD), hex3(C.red), hex3(C.redL)];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 20) continue;
      const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
      if (h < 12 || h > 62 || s < 0.38 || v < 0.35) continue;
      const c = R[v > 0.86 ? 2 : v > 0.62 ? 1 : 0];
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
  }
  // any cloth becomes red knit, shaded as before, with a cream band across the middle
  function knitRed(d, W, H) {
    let t = H, b = -1, sum = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (d[i + 3] > 100) { if (y < t) t = y; b = y; const L = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; if (L > 50) { sum += L; n++; } } }
    const mean = n ? sum / n : 128, base = hex3(C.red), band = hex3(C.cream);
    const b0 = t + (b - t) * 0.42, b1 = t + (b - t) * 0.56;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; if (d[i + 3] < 20) continue;
      const L = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; if (L < 50) continue; // keep the outline
      const c = scaleTo(y >= b0 && y <= b1 && (Math.floor(x / (W / 9)) % 2 === 0 || y < b0 + (b1 - b0) * 0.3) ? band : base, L / mean);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
  }
  // the paper star: orange paper becomes Christmas red, its gold trim stays gold
  function redStar(d) {
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 20) continue;
      const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
      if (h < 6 || h > 34 || s < 0.45) continue;
      const k = v / 0.85, c = scaleTo(hex3(C.red), k);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
  }
  async function recolouredUrl(url, fn) {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
    const bm = await createImageBitmap(await r.blob());
    const c = new OffscreenCanvas(bm.width, bm.height), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bm, 0, 0);
    const img = x.getImageData(0, 0, bm.width, bm.height);
    fn(img.data, bm.width, bm.height);
    x.putImageData(img, 0, 0);
    return URL.createObjectURL(await c.convertToBlob({ type: 'image/png' }));
  }

  // ------------------------------------------------------------------ which page image becomes what
  const PIECES = [
    { name: /^toran/, nat: [1400, 307], make: garland, frames: 3 },
    { name: /^diyas-lounge$/, nat: [512, 342], make: cookies, frames: 1 },   // the plate on the table
    { name: /^diyas-/, nat: [512, 325], make: advent, frames: 4 },           // rings of diyas on the floor
    { name: /^diya-/, nat: [512, 407], make: candle, frames: 4 },
    { name: /^sweets$/, nat: [468, 512], make: gingerHouse, frames: 2 },
    { name: /^coco-crown$/, make: antlers, frames: 1, lift: 0.62 },
    { name: /-(crown|collar)$/, recolour: holly },
    { name: /-kurta$/, recolour: knitRed },
    { name: /^kandil/, recolour: redStar }
  ];
  const pieceFor = img => {
    const name = img.dataset.skinDecor;
    if (name) return PIECES.find(p => p.name.test(name)) || null;
    return PIECES.find(p => p.nat && Math.abs(img.naturalWidth - p.nat[0]) <= 2 && Math.abs(img.naturalHeight - p.nat[1]) <= 2) || null;
  };
  const made = new Map();   // "piece w h" -> [blob urls per frame] (or 'pending')
  const dressed = new Set();
  const lifted = new Set();   // pet name tags moved up for the antlers
  let on = false, step = 0, lastStep = 0;

  function urlsFor(piece, cssW, cssH, img) {
    if (piece.recolour) {
      const src = img.currentSrc || img.src, key = 'r ' + src;
      const hit = made.get(key);
      if (hit) return hit === 'pending' ? null : hit;
      made.set(key, 'pending');
      recolouredUrl(src, piece.recolour).then(u => made.set(key, [u]), () => made.delete(key));
      return null;
    }
    const key = `${PIECES.indexOf(piece)} ${Math.round(cssW)} ${Math.round(cssH)} ${window.devicePixelRatio || 1}`;
    const hit = made.get(key);
    if (hit) return hit === 'pending' ? null : hit;
    made.set(key, 'pending');
    const aw = Math.max(8, Math.round(cssW / ART_CSS)), ah = Math.max(8, Math.round(cssH / ART_CSS));
    Promise.all(Array.from({ length: piece.frames }, (_, f) => toUrl(piece.make(aw, ah, f), cssW, cssH)))
      .then(urls => made.set(key, urls), () => made.delete(key));
    return null;
  }

  function apply(next) {
    on = next;
    const stage = document.querySelector('main[data-floor-skin]');
    if (!stage) return;
    if (!on) {
      for (const img of dressed) { img.style.content = ''; img.style.translate = ''; }
      for (const tag of lifted) tag.style.translate = '';
      dressed.clear(); lifted.clear();
      return;
    }
    for (const img of stage.querySelectorAll('img')) {
      if (/^(rangoli|sparkler)/.test(img.dataset.skinDecor || '')) continue; // hidden; the tree stands there
      const piece = pieceFor(img);
      if (!piece) continue;
      const r = img.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const urls = urlsFor(piece, r.width, r.height, img);
      if (urls) {
        const want = `url("${urls[step % urls.length]}")`;
        if (img.style.content !== want) img.style.content = want;
        if (piece.lift && !img.style.translate) {
          img.style.translate = `0 -${Math.round(piece.lift * 100)}%`;
          // and the pet's name tag moves up out of the antlers' way
          const pet = (img.dataset.skinDecor || '').split('-')[0];
          const tag = [...document.querySelectorAll('[data-pet-name]')].find(t => (t.textContent || '').trim().toLowerCase() === pet);
          if (tag) { tag.style.translate = `0 -${Math.round(r.height * piece.lift * 0.75)}px`; lifted.add(tag); }
        }
        dressed.add(img);
      }
    }
  }

  // advance twinkles and flames, and pick up pieces whose art just finished drawing
  function tick(now) {
    if (!on) return;
    if (now - lastStep < 420) return;
    lastStep = now; step++;
    apply(true);
  }

  window.pxfDecor = { apply, tick };
})();
